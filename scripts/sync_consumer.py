"""
Video Sync Consumer — processes download and removal jobs from the sync queue.

Picks pending jobs from sync_queue, downloads videos via yt-dlp, uploads to
Cloudflare R2, upserts video records, and handles removal of obsolete content.

Usage:
    uv run python scripts/sync_consumer.py
    uv run python scripts/sync_consumer.py --limit 100
    uv run python scripts/sync_consumer.py --dry-run --verbose
    uv run python scripts/sync_consumer.py --downloads-only
    uv run python scripts/sync_consumer.py --removals-only
"""

import argparse
import json
import mimetypes
import os
import random
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import yaml

try:
    from supabase import create_client
except ImportError:
    print("Missing dependency: uv add supabase")
    sys.exit(1)

# ─── Project Setup ────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = PROJECT_ROOT / ".env"
CONFIG_FILE = PROJECT_ROOT / "config" / "consumer.yaml"
STAGING_DIR = PROJECT_ROOT / "downloads" / "staging"
COOKIES_FILE = PROJECT_ROOT / "config" / "cookies.txt"

# Legacy ytdl-sub media directory — used for initial seeding only.
# Files here are uploaded to R2 and then deleted. Drop this once seeding is complete.
LEGACY_MEDIA_DIR = Path("E:/Entertainment/PradoTube")

# Fix Windows console encoding for unicode
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


# ─── Environment ──────────────────────────────────────────────────────────────


def load_env():
    """Load .env file into os.environ (simple parser, no dependency needed)."""
    if not ENV_FILE.exists():
        return
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


# ─── Config ───────────────────────────────────────────────────────────────────


def load_config() -> dict:
    """Load consumer config from config/consumer.yaml with sensible defaults."""
    defaults = {
        "consumer": {
            "batch_size": 50,
            "max_attempts": 3,
            "stale_lock_minutes": 60,
            "throttle_min_seconds": 2,
            "throttle_max_seconds": 5,
        },
        "ytdlp": {
            "format": "bv[height<=%(max_height)s][ext=mp4]+ba[ext=m4a]/b[height<=%(max_height)s][ext=mp4]/b[ext=mp4]",
            "max_height": 1080,
            "merge_output_format": "mp4",
            "faststart": True,
            "write_thumbnail": True,
            "write_subs": True,
            "write_auto_subs": True,
            "sub_langs": "en",
            "sub_format": "vtt",
            "write_info_json": True,
            "remote_components": "ejs:github,ejs:npm",
            "match_filters": "!is_live & !is_upcoming & !post_live",
            "sleep_interval_subtitles": 5,
            "min_height": 361,
        },
        "r2": {
            "key_template": "{handle}/{year}-{month}/{video_id}.{ext}",
        },
    }

    if CONFIG_FILE.exists():
        with open(CONFIG_FILE) as f:
            file_config = yaml.safe_load(f) or {}
        # Merge file config over defaults (shallow per section)
        for section in defaults:
            if section in file_config:
                defaults[section].update(file_config[section])

    return defaults


# ─── CLI ──────────────────────────────────────────────────────────────────────


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Process download and removal jobs from the sync queue.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Override batch size (max jobs to process per run)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be processed without side effects",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show detailed per-job output (yt-dlp progress, R2 keys, etc.)",
    )
    parser.add_argument(
        "--downloads-only",
        action="store_true",
        help="Process only download jobs (skip removals)",
    )
    parser.add_argument(
        "--removals-only",
        action="store_true",
        help="Process only removal jobs (skip downloads)",
    )
    return parser.parse_args()


# ─── R2 Client ────────────────────────────────────────────────────────────────


def create_r2_client():
    """Create a boto3 S3 client configured for Cloudflare R2."""
    import boto3

    account_id = os.environ.get("R2_ACCOUNT_ID")
    access_key = os.environ.get("R2_ACCESS_KEY_ID")
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")

    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )


# ─── Utility Functions ────────────────────────────────────────────────────────


def build_r2_key(channel_handle: str, published_at: str | None, video_id: str, ext: str) -> str:
    """Build R2 object key: {handle}/{YYYY}-{MM}/{video_id}.{ext}"""
    # Normalize handle: ensure it starts with @
    handle = channel_handle if channel_handle.startswith("@") else f"@{channel_handle}"

    # Parse year/month from published_at (ISO 8601 string)
    if published_at:
        try:
            dt = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
            year = f"{dt.year:04d}"
            month = f"{dt.month:02d}"
        except (ValueError, AttributeError):
            year = "unknown"
            month = "00"
    else:
        year = "unknown"
        month = "00"

    # Normalize ext: remove leading dot if present
    ext = ext.lstrip(".")

    return f"{handle}/{year}-{month}/{video_id}.{ext}"


def parse_info_json(info_path: Path) -> dict | None:
    """Extract video metadata fields from yt-dlp's .info.json file."""
    try:
        data = json.loads(info_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError, OSError) as e:
        print(f"  Warning: failed to parse {info_path}: {e}")
        return None

    # Parse chapters into clean format
    chapters = data.get("chapters")
    if chapters and isinstance(chapters, list):
        chapters = [
            {
                "title": ch.get("title", ""),
                "start_time": ch.get("start_time", 0),
                "end_time": ch.get("end_time", 0),
            }
            for ch in chapters
        ]
    else:
        chapters = None

    # Parse upload_date (YYYYMMDD) → ISO 8601
    upload_date = data.get("upload_date")
    published_at = None
    if upload_date and len(upload_date) == 8:
        try:
            published_at = f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:8]}T00:00:00Z"
        except (ValueError, IndexError):
            pass

    return {
        "title": data.get("title") or data.get("fulltitle") or "Untitled",
        "description": data.get("description") or "",
        "duration_seconds": data.get("duration"),
        "view_count": data.get("view_count"),
        "like_count": data.get("like_count"),
        "comment_count": data.get("comment_count"),
        "published_at": published_at,
        "thumbnail_url": data.get("thumbnail") or "",
        "handle": data.get("uploader_id") or "",
        "tags": data.get("tags") or [],
        "categories": data.get("categories") or [],
        "chapters": json.dumps(chapters) if chapters else None,
        "width": data.get("width"),
        "height": data.get("height"),
        "fps": data.get("fps"),
        "language": data.get("language"),
        "webpage_url": data.get("webpage_url") or "",
    }


def upload_to_r2(r2_client, bucket: str, local_path: Path, r2_key: str) -> bool:
    """Upload a single file to R2. Returns True on success, False on failure."""
    from botocore.exceptions import ClientError

    mime_type, _ = mimetypes.guess_type(str(local_path))
    if not mime_type:
        mime_type = "application/octet-stream"

    try:
        file_size = local_path.stat().st_size
        r2_client.upload_file(
            str(local_path),
            bucket,
            r2_key,
            ExtraArgs={"ContentType": mime_type},
        )
        size_mb = file_size / (1024 * 1024)
        print(f"    Uploaded {r2_key} ({size_mb:.1f} MB, {mime_type})")
        return True
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "Unknown")
        error_msg = e.response.get("Error", {}).get("Message", str(e))
        print(f"    FAILED {r2_key}: [{error_code}] {error_msg}")
        return False
    except OSError as e:
        print(f"    FAILED {r2_key}: file read error: {e}")
        return False


def resolve_channel_handle(client, job: dict) -> str:
    """Extract channel handle from job metadata, fallback to DB lookup."""
    metadata = job.get("metadata") or {}

    # Try metadata first (producer stashes handle here)
    handle = metadata.get("handle") or metadata.get("channel_handle")
    if handle:
        return handle

    # Fallback: look up from channels table
    channel_id = job.get("channel_id")
    if channel_id:
        resp = (
            client.table("channels")
            .select("custom_url")
            .eq("youtube_id", channel_id)
            .limit(1)
            .execute()
        )
        if resp.data and resp.data[0].get("custom_url"):
            return resp.data[0]["custom_url"]

    return "unknown"


# ─── Download Pipeline (US1) ─────────────────────────────────────────────────


def download_video(video_id: str, staging_dir: Path, config: dict) -> tuple[bool, str]:
    """Download a video via yt-dlp subprocess. Returns (success, stderr)."""
    ytdlp_cfg = config["ytdlp"]
    max_height = ytdlp_cfg["max_height"]

    # Build format string with max_height interpolated
    fmt = ytdlp_cfg["format"] % {"max_height": max_height}

    output_template = str(staging_dir / f"{video_id}.%(ext)s")

    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--format", fmt,
        "--merge-output-format", ytdlp_cfg["merge_output_format"],
        "--output", output_template,
        "--no-playlist",
        "--no-overwrites",
    ]

    # Cookies for YouTube auth (bypasses bot detection)
    if COOKIES_FILE.exists():
        cmd.extend(["--cookies", str(COOKIES_FILE)])

    # Match filters — skip live/upcoming content that can't be downloaded
    if ytdlp_cfg.get("match_filters"):
        cmd.extend(["--match-filters", ytdlp_cfg["match_filters"]])

    # Subtitle request throttle — separate sleep to avoid bot detection
    if ytdlp_cfg.get("sleep_interval_subtitles"):
        cmd.extend(["--sleep-subtitles", str(ytdlp_cfg["sleep_interval_subtitles"])])

    # Faststart postprocessor
    if ytdlp_cfg.get("faststart"):
        cmd.extend(["--postprocessor-args", "ffmpeg:-movflags +faststart"])

    # Sidecar flags
    if ytdlp_cfg.get("write_thumbnail"):
        cmd.append("--write-thumbnail")
    if ytdlp_cfg.get("write_subs"):
        cmd.append("--write-subs")
    if ytdlp_cfg.get("write_auto_subs"):
        cmd.append("--write-auto-subs")
    if ytdlp_cfg.get("sub_langs"):
        cmd.extend(["--sub-langs", ytdlp_cfg["sub_langs"]])
    if ytdlp_cfg.get("sub_format"):
        cmd.extend(["--sub-format", ytdlp_cfg["sub_format"]])
    if ytdlp_cfg.get("write_info_json"):
        cmd.append("--write-info-json")

    # Remote JS challenge solver (deno) — each component needs its own flag
    rc = ytdlp_cfg.get("remote_components")
    if rc:
        components = rc if isinstance(rc, str) else "ejs:github,ejs:npm"
        for comp in components.split(","):
            cmd.extend(["--remote-components", comp.strip()])

    # The video URL
    cmd.append(f"https://www.youtube.com/watch?v={video_id}")

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    return (result.returncode == 0, result.stderr)


def collect_downloaded_files(staging_dir: Path, video_id: str) -> dict[str, Path]:
    """Glob staging dir to find video, thumbnail, subtitle, info.json files."""
    files: dict[str, Path] = {}

    for path in staging_dir.iterdir():
        if not path.name.startswith(video_id):
            continue

        name = path.name
        suffix = path.suffix.lower()

        if suffix == ".mp4":
            files["video"] = path
        elif suffix in (".jpg", ".jpeg", ".webp", ".png"):
            files["thumbnail"] = path
        elif suffix == ".vtt" or name.endswith(".vtt"):
            files["subtitle"] = path
        elif name.endswith(".info.json"):
            files["info_json"] = path

    return files


def upload_video_files(
    r2_client, bucket: str, files: dict[str, Path],
    channel_handle: str, published_at: str | None, video_id: str,
) -> dict[str, str]:
    """Upload each downloaded file to R2. Returns dict of {type: r2_key}."""
    r2_keys: dict[str, str] = {}

    for file_type, local_path in files.items():
        ext = local_path.suffix.lstrip(".")
        # For subtitle files like video_id.en.vtt, use full suffix
        if file_type == "subtitle":
            # Extract everything after video_id: e.g. ".en.vtt"
            rest = local_path.name[len(video_id):]
            ext = rest.lstrip(".")
        elif file_type == "info_json":
            ext = "info.json"

        r2_key = build_r2_key(channel_handle, published_at, video_id, ext)
        if upload_to_r2(r2_client, bucket, local_path, r2_key):
            r2_keys[file_type] = r2_key
        else:
            raise RuntimeError(f"Failed to upload {file_type}: {local_path}")

    return r2_keys


def upsert_video_record(
    client, video_id: str, channel_id: str,
    info_data: dict, r2_keys: dict[str, str], source_tags: list[str],
):
    """Build row from info.json data + R2 paths, upsert on youtube_id conflict."""
    now_iso = datetime.now(timezone.utc).isoformat()

    row = {
        "youtube_id": video_id,
        "channel_id": channel_id,
        "title": info_data.get("title", "Untitled"),
        "description": info_data.get("description", ""),
        "thumbnail_url": info_data.get("thumbnail_url", ""),
        "published_at": info_data.get("published_at"),
        "duration_seconds": info_data.get("duration_seconds"),
        "view_count": info_data.get("view_count"),
        "like_count": info_data.get("like_count"),
        "comment_count": info_data.get("comment_count"),
        "tags": info_data.get("tags", []),
        "categories": info_data.get("categories", []),
        "chapters": info_data.get("chapters"),
        "width": info_data.get("width"),
        "height": info_data.get("height"),
        "fps": info_data.get("fps"),
        "language": info_data.get("language"),
        "webpage_url": info_data.get("webpage_url", ""),
        "handle": info_data.get("handle", ""),
        "media_path": r2_keys.get("video"),
        "thumbnail_path": r2_keys.get("thumbnail"),
        "subtitle_path": r2_keys.get("subtitle"),
        "is_downloaded": True,
        "downloaded_at": now_iso,
        "r2_synced_at": now_iso,
        "info_json_synced_at": now_iso,
        "source_tags": source_tags,
    }

    client.table("videos").upsert(row, on_conflict="youtube_id").execute()


def cleanup_staging(staging_dir: Path):
    """Remove per-job staging subdirectory and all contents."""
    try:
        if staging_dir.exists():
            shutil.rmtree(staging_dir)
    except OSError as e:
        print(f"  Warning: staging cleanup failed: {e}")


def find_legacy_files(video_id: str, channel_handle: str | None = None, published_at: str | None = None) -> dict[str, Path] | None:
    """Check LEGACY_MEDIA_DIR for existing ytdl-sub downloads.

    If channel_handle and published_at are provided, checks the expected path
    directly (fast). Otherwise falls back to a full walk (slow but thorough).
    Returns file dict or None if not found.
    """
    if not LEGACY_MEDIA_DIR.exists():
        return None

    # Fast path: check expected location directly
    if channel_handle and published_at:
        handle = channel_handle if channel_handle.startswith("@") else f"@{channel_handle}"
        try:
            dt = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
            month_dir = LEGACY_MEDIA_DIR / handle / f"{dt.year:04d}-{dt.month:02d}"
            info_path = month_dir / f"{video_id}.info.json"
            if info_path.exists():
                return collect_downloaded_files(month_dir, video_id)
        except (ValueError, AttributeError):
            pass

    # Slow fallback: walk all @handle/YYYY-MM/ directories
    for handle_dir in LEGACY_MEDIA_DIR.iterdir():
        if not handle_dir.is_dir():
            continue
        for month_dir in handle_dir.iterdir():
            if not month_dir.is_dir():
                continue
            info_path = month_dir / f"{video_id}.info.json"
            if info_path.exists():
                return collect_downloaded_files(month_dir, video_id)

    return None


def purge_legacy_files(files: dict[str, Path], verbose: bool):
    """Delete local legacy files after successful R2 upload."""
    for ftype, fpath in files.items():
        try:
            fpath.unlink()
            if verbose:
                print(f"    Purged legacy: {fpath}")
        except OSError as e:
            print(f"    Warning: could not purge {fpath}: {e}")


def process_download_job(
    client, r2_client, bucket: str, job: dict,
    config: dict, verbose: bool, dry_run: bool,
) -> bool:
    """Orchestrate a single download job. Returns True on success."""
    video_id = job["video_id"]
    channel_id = job["channel_id"]
    metadata = job.get("metadata") or {}
    title = metadata.get("title", video_id)
    source_tags = metadata.get("source_tags", [])

    # Resolve handle early so we can use it for legacy file lookup
    channel_handle = resolve_channel_handle(client, job)
    published_at = metadata.get("published_at")

    if dry_run:
        local = find_legacy_files(video_id, channel_handle, published_at)
        source = "local" if local else "yt-dlp"
        print(f"    DRY RUN: would download {video_id} \"{title}\" (source: {source})")
        return True

    # Check legacy media directory first — skip yt-dlp if files exist locally
    legacy_files = find_legacy_files(video_id, channel_handle, published_at)
    use_legacy = legacy_files and "video" in legacy_files

    if use_legacy:
        files = legacy_files
        if verbose:
            print(f"    Found locally in {list(files.values())[0].parent}")
            for ftype, fpath in files.items():
                size_mb = fpath.stat().st_size / (1024 * 1024)
                print(f"    Found {ftype}: {fpath.name} ({size_mb:.1f} MB)")
    else:
        # No local files — download via yt-dlp into staging
        pass

    # Create per-job staging directory (only needed for yt-dlp path)
    job_staging = STAGING_DIR / video_id
    if not use_legacy:
        job_staging.mkdir(parents=True, exist_ok=True)

    try:
        if not use_legacy:
            # 1. Download via yt-dlp
            start_time = time.time()
            success, stderr = download_video(video_id, job_staging, config)
            download_time = time.time() - start_time

            if not success:
                print(f"    yt-dlp failed ({download_time:.0f}s): {stderr[:200]}")
                raise RuntimeError(f"yt-dlp exit non-zero: {stderr[:500]}")

            if verbose:
                print(f"    Downloaded in {download_time:.0f}s")
                if stderr:
                    print(f"    yt-dlp stderr: {stderr[:300]}")

            # 2. Collect downloaded files
            files = collect_downloaded_files(job_staging, video_id)
            if "video" not in files:
                raise RuntimeError("No video file found after download")

            if verbose:
                for ftype, fpath in files.items():
                    size_mb = fpath.stat().st_size / (1024 * 1024)
                    print(f"    Found {ftype}: {fpath.name} ({size_mb:.1f} MB)")

        # 3. Parse info.json for rich metadata
        info_data = {}
        if "info_json" in files:
            parsed = parse_info_json(files["info_json"])
            if parsed:
                info_data = parsed
                # Use published_at from info.json if not in metadata
                if not published_at and info_data.get("published_at"):
                    published_at = info_data["published_at"]
                # Use handle from info.json if not resolved
                if channel_handle == "unknown" and info_data.get("handle"):
                    channel_handle = info_data["handle"]

        # 4. Resolution assert — detect YouTube throttling
        #    If video height is below minimum, assume we got a garbage throttled stream
        min_height = config["ytdlp"].get("min_height", 0)
        if min_height and not use_legacy and info_data.get("height"):
            if info_data["height"] < min_height:
                raise RuntimeError(
                    f"Video height {info_data['height']}p is below minimum "
                    f"{min_height}p — likely YouTube throttled this download"
                )

        # 5. Upload all files to R2
        r2_keys = upload_video_files(
            r2_client, bucket, files, channel_handle, published_at, video_id,
        )

        if verbose:
            for ftype, key in r2_keys.items():
                print(f"    R2 key ({ftype}): {key}")

        # 6. Upsert video record
        upsert_video_record(client, video_id, channel_id, info_data, r2_keys, source_tags)

        if verbose:
            print(f"    Video record upserted, r2_synced_at set")

        # 7. Delete job on success
        complete_job(client, job["id"])

        # 8. Purge legacy files after successful upload
        if use_legacy:
            purge_legacy_files(legacy_files, verbose)

        return True

    except Exception as e:
        fail_job(client, job["id"], str(e))
        return False

    finally:
        if not use_legacy:
            cleanup_staging(job_staging)


# ─── Removal Pipeline (US2) ──────────────────────────────────────────────────


def delete_from_r2(r2_client, bucket: str, job_metadata: dict) -> tuple[bool, str | None]:
    """Delete media, thumbnail, subtitle, and info.json from R2."""
    from botocore.exceptions import ClientError

    paths_to_delete = []
    for key in ("media_path", "thumbnail_path", "subtitle_path"):
        path = job_metadata.get(key)
        if path:
            paths_to_delete.append(path)

    # Derive info.json key from media_path
    media_path = job_metadata.get("media_path")
    if media_path:
        info_key = str(Path(media_path).with_suffix(".info.json")).replace("\\", "/")
        paths_to_delete.append(info_key)

    errors = []
    for r2_key in paths_to_delete:
        try:
            r2_client.delete_object(Bucket=bucket, Key=r2_key)
            print(f"    Deleted R2: {r2_key}")
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            if error_code == "NoSuchKey":
                print(f"    Already gone: {r2_key}")
            else:
                errors.append(f"{r2_key}: [{error_code}] {e}")

    if errors:
        return False, "; ".join(errors)
    return True, None


def clear_video_record(client, video_id: str):
    """Clear R2-related fields on the video row, making it invisible in feed."""
    client.table("videos").update({
        "r2_synced_at": None,
        "media_path": None,
        "thumbnail_path": None,
        "subtitle_path": None,
        "is_downloaded": False,
    }).eq("youtube_id", video_id).execute()


def process_remove_job(
    client, r2_client, bucket: str, job: dict,
    verbose: bool, dry_run: bool,
) -> bool:
    """Orchestrate a single removal job. Returns True on success."""
    video_id = job["video_id"]
    metadata = job.get("metadata") or {}
    title = metadata.get("title", video_id)

    if dry_run:
        print(f"    DRY RUN: would remove {video_id} \"{title}\"")
        return True

    try:
        # 1. Delete files from R2
        success, error = delete_from_r2(r2_client, bucket, metadata)
        if not success:
            raise RuntimeError(f"R2 deletion failed: {error}")

        # 2. Clear video record
        clear_video_record(client, video_id)
        if verbose:
            print(f"    Video record cleared (r2_synced_at=NULL)")

        # 3. Delete job
        complete_job(client, job["id"])
        return True

    except Exception as e:
        fail_job(client, job["id"], str(e))
        return False


# ─── Queue Operations ─────────────────────────────────────────────────────────


def claim_jobs(client, batch_size: int, max_attempts: int) -> list[dict]:
    """Call claim_consumer_jobs RPC to atomically pick up a batch of jobs."""
    resp = client.rpc(
        "claim_consumer_jobs",
        {"batch_size": batch_size, "max_attempts": max_attempts},
    ).execute()
    return resp.data or []


def fail_job(client, job_id: str, error_message: str):
    """Mark a job as failed: reset to pending, increment attempts, record error."""
    # Read current attempts, then update (Supabase client doesn't support SQL expressions)
    resp = client.table("sync_queue").select("attempts").eq("id", job_id).execute()
    current_attempts = resp.data[0].get("attempts", 0) if resp.data else 0
    client.table("sync_queue").update({
        "status": "pending",
        "started_at": None,
        "attempts": current_attempts + 1,
        "error": error_message[:1000],
    }).eq("id", job_id).execute()


def complete_job(client, job_id: str):
    """Delete a completed job from the queue."""
    client.table("sync_queue").delete().eq("id", job_id).execute()


def reset_stale_locks(client, stale_lock_minutes: int) -> int:
    """Call reset_stale_consumer_locks RPC. Returns count of reset jobs."""
    resp = client.rpc(
        "reset_stale_consumer_locks",
        {"stale_minutes": stale_lock_minutes},
    ).execute()
    return resp.data if isinstance(resp.data, int) else 0


# ─── Env Validation ──────────────────────────────────────────────────────────


def validate_env():
    """Check required environment variables, fail fast with clear messages."""
    required = [
        "NEXT_PUBLIC_SUPABASE_URL",
        "SUPABASE_SECRET_KEY",
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET_NAME",
    ]
    missing = [var for var in required if not os.environ.get(var)]
    if missing:
        print(f"Error: Missing required environment variable(s): {', '.join(missing)}")
        sys.exit(2)


def check_ffmpeg():
    """Verify ffmpeg is on PATH (yt-dlp needs it for muxing + faststart)."""
    try:
        subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True, timeout=10,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        print("Warning: ffmpeg not found on PATH. yt-dlp needs it for muxing + faststart.")


# ─── Main ─────────────────────────────────────────────────────────────────────


def main():
    load_env()
    args = parse_args()
    config = load_config()

    # Validate environment
    validate_env()
    check_ffmpeg()

    # Connect to Supabase
    client = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SECRET_KEY"],
    )

    # Create R2 client
    r2_client = create_r2_client()
    bucket = os.environ["R2_BUCKET_NAME"]

    consumer_cfg = config["consumer"]
    batch_size = args.limit or consumer_cfg["batch_size"]
    max_attempts = consumer_cfg["max_attempts"]
    throttle_min = consumer_cfg["throttle_min_seconds"]
    throttle_max = consumer_cfg["throttle_max_seconds"]

    print("=== Sync Consumer ===")

    # Reset stale locks before claiming new jobs
    stale_count = reset_stale_locks(client, consumer_cfg["stale_lock_minutes"])
    print(f"Reset {stale_count} stale lock(s)")

    # Claim batch
    jobs = claim_jobs(client, batch_size, max_attempts)

    downloads = [j for j in jobs if j["action"] == "download"]
    removals = [j for j in jobs if j["action"] == "remove"]
    print(f"Claimed {len(jobs)} job(s) ({len(downloads)} downloads, {len(removals)} removals)")

    if not jobs:
        print("\nNo pending jobs. Done.")
        return

    # Filter by action type if requested
    if args.downloads_only:
        jobs = downloads
        print("  (--downloads-only: skipping removals)")
    elif args.removals_only:
        jobs = removals
        print("  (--removals-only: skipping downloads)")

    # Process jobs
    run_start = time.time()
    succeeded = 0
    failed = 0
    skipped = 0

    for i, job in enumerate(jobs, 1):
        action = job["action"]
        video_id = job["video_id"]
        metadata = job.get("metadata") or {}
        title = metadata.get("title", video_id)

        print(f"\n  [{i}/{len(jobs)}] {action.upper()} {video_id} \"{title}\"", end=" ... ")

        if action == "download":
            if args.removals_only:
                print("skipped (--removals-only)")
                skipped += 1
                continue
            ok = process_download_job(
                client, r2_client, bucket, job,
                config, args.verbose, args.dry_run,
            )
        elif action == "remove":
            if args.downloads_only:
                print("skipped (--downloads-only)")
                skipped += 1
                continue
            ok = process_remove_job(
                client, r2_client, bucket, job,
                args.verbose, args.dry_run,
            )
        else:
            print(f"unknown action: {action}")
            skipped += 1
            continue

        if ok:
            succeeded += 1
            print("done")
        else:
            failed += 1
            print("FAILED")

        # Randomized throttle between jobs — mimics human browsing pattern
        if i < len(jobs) and throttle_max > 0 and not args.dry_run:
            delay = random.uniform(throttle_min, throttle_max)
            if args.verbose:
                print(f"    Throttle: {delay:.1f}s")
            time.sleep(delay)

    # Summary
    duration = time.time() - run_start
    minutes = int(duration // 60)
    seconds = int(duration % 60)

    print(f"\n=== Summary ===")
    print(f"  Processed: {len(jobs)}")
    print(f"  Succeeded: {succeeded}")
    print(f"  Failed:    {failed}")
    print(f"  Skipped:   {skipped}")
    print(f"  Duration:  {minutes}m {seconds}s")

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
