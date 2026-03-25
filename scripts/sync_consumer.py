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


# ─── HLS Pipeline Functions ──────────────────────────────────────────────────


def build_format_selector(tier: dict) -> str:
    """Build a yt-dlp format selector string for a specific quality tier.

    Args:
        tier: Dict with 'label', 'height', 'bandwidth' keys from config.

    Returns:
        Format selector string like "bv[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]"
    """
    h = tier["height"]
    return f"bv[height<={h}][ext=mp4]+ba[ext=m4a]/b[height<={h}][ext=mp4]"


def build_ffmpeg_remux_cmd(
    input_path: Path, output_dir: Path, segment_duration: int = 6,
) -> list[str]:
    """Build ffmpeg command to remux an MP4 into HLS fMP4 segments.

    Args:
        input_path: Path to the input MP4 file.
        output_dir: Directory to write HLS output (playlist.m3u8, init.mp4, seg_*.m4s).
        segment_duration: Target segment duration in seconds.

    Returns:
        List of command-line arguments for subprocess.run().
    """
    playlist_path = str(output_dir / "playlist.m3u8")
    segment_pattern = str(output_dir / "seg_%03d.m4s")

    return [
        "ffmpeg",
        "-i", str(input_path),
        "-c", "copy",
        "-f", "hls",
        "-hls_time", str(segment_duration),
        "-hls_segment_type", "fmp4",
        "-hls_fmp4_init_filename", "init.mp4",
        "-hls_segment_filename", segment_pattern,
        "-hls_playlist_type", "vod",
        "-hls_flags", "independent_segments",
        "-hls_list_size", "0",
        playlist_path,
    ]


def generate_master_playlist(completed_tiers: list[dict]) -> str:
    """Generate a multi-variant HLS master playlist from completed tier metadata.

    Args:
        completed_tiers: List of dicts with keys:
            - label: e.g. "720p"
            - bandwidth: bits/sec (int)
            - resolution: e.g. "1280x720"
            - codecs: e.g. "avc1.4d401f,mp4a.40.2"

    Returns:
        Master playlist content string.

    Raises:
        ValueError: If no tiers provided (minimum 1 required).
    """
    if not completed_tiers:
        raise ValueError("No tiers available — minimum 1 tier required to generate master playlist")

    lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:7",
        "#EXT-X-INDEPENDENT-SEGMENTS",
    ]

    for tier in completed_tiers:
        lines.append(
            f'#EXT-X-STREAM-INF:BANDWIDTH={tier["bandwidth"]},'
            f'RESOLUTION={tier["resolution"]},'
            f'CODECS="{tier["codecs"]}"'
        )
        lines.append(f'{tier["label"]}/playlist.m3u8')

    lines.append("")  # trailing newline
    return "\n".join(lines)


def build_r2_key_hls(
    channel_handle: str, published_at: str | None, video_id: str, relative_path: str,
) -> str:
    """Build R2 object key for HLS folder-per-video structure.

    Args:
        channel_handle: Channel handle (with or without @).
        published_at: ISO 8601 datetime string or None.
        video_id: YouTube video ID.
        relative_path: Path relative to video folder (e.g. "master.m3u8", "720p/seg_000.m4s").

    Returns:
        R2 key like "@handle/YYYY-MM/video_id/master.m3u8"
    """
    handle = channel_handle if channel_handle.startswith("@") else f"@{channel_handle}"

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

    return f"{handle}/{year}-{month}/{video_id}/{relative_path}"


def download_video_tier(
    video_id: str, staging_dir: Path, tier: dict, config: dict,
    with_sidecars: bool = False,
) -> tuple[bool, Path | None, str]:
    """Download a single quality tier via yt-dlp.

    Args:
        video_id: YouTube video ID.
        staging_dir: Per-tier staging directory (e.g. staging/vid123/720p/).
        tier: Tier config dict with 'label', 'height', 'bandwidth'.
        config: Full consumer config dict.
        with_sidecars: If True, also download thumbnail, subtitle, info.json.

    Returns:
        Tuple of (success, mp4_path_or_none, stderr).
    """
    ytdlp_cfg = config["ytdlp"]
    fmt = build_format_selector(tier)

    output_template = str(staging_dir / f"{video_id}.%(ext)s")

    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--format", fmt,
        "--merge-output-format", ytdlp_cfg.get("merge_output_format", "mp4"),
        "--output", output_template,
        "--no-playlist",
        "--no-overwrites",
    ]

    # Cookies for YouTube auth
    if COOKIES_FILE.exists():
        cmd.extend(["--cookies", str(COOKIES_FILE)])

    # Match filters
    if ytdlp_cfg.get("match_filters"):
        cmd.extend(["--match-filters", ytdlp_cfg["match_filters"]])

    # Remote JS challenge solver
    rc = ytdlp_cfg.get("remote_components")
    if rc:
        components = rc if isinstance(rc, str) else "ejs:github,ejs:npm"
        for comp in components.split(","):
            cmd.extend(["--remote-components", comp.strip()])

    # Sidecar flags — only with highest tier
    if with_sidecars:
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
        if ytdlp_cfg.get("sleep_interval_subtitles"):
            cmd.extend(["--sleep-subtitles", str(ytdlp_cfg["sleep_interval_subtitles"])])

    cmd.append(f"https://www.youtube.com/watch?v={video_id}")

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

    if result.returncode != 0:
        return (False, None, result.stderr)

    # Find the downloaded MP4
    mp4_path = None
    for p in staging_dir.iterdir():
        if p.name.startswith(video_id) and p.suffix.lower() == ".mp4":
            mp4_path = p
            break

    return (True, mp4_path, result.stderr)


def download_video_tiers(
    video_id: str, staging_dir: Path, config: dict, verbose: bool = False,
) -> tuple[list[dict], dict[str, Path]]:
    """Download multiple quality tiers for a video.

    Downloads each configured tier via yt-dlp. Sidecars (thumbnail, subtitle,
    info.json) are downloaded only with the highest tier.

    Args:
        video_id: YouTube video ID.
        staging_dir: Base staging directory for this video (e.g. staging/vid123/).
        config: Full consumer config dict.
        verbose: Print per-tier progress.

    Returns:
        Tuple of:
        - List of successfully downloaded tier dicts with added 'mp4_path' key.
        - Dict of sidecar files {type: Path} found in highest tier dir.
    """
    hls_cfg = config.get("hls", {})
    tiers = hls_cfg.get("tiers", [
        {"label": "360p", "height": 360, "bandwidth": 800000},
        {"label": "480p", "height": 480, "bandwidth": 1200000},
        {"label": "720p", "height": 720, "bandwidth": 2500000},
        {"label": "1080p", "height": 1080, "bandwidth": 5000000},
    ])

    consumer_cfg = config.get("consumer", {})
    throttle_min = consumer_cfg.get("throttle_min_seconds", 2)
    throttle_max = consumer_cfg.get("throttle_max_seconds", 5)

    completed_tiers = []
    sidecar_files: dict[str, Path] = {}

    for i, tier in enumerate(tiers):
        label = tier["label"]
        tier_dir = staging_dir / label
        tier_dir.mkdir(parents=True, exist_ok=True)

        # Download sidecars with the highest tier (last in list)
        is_last = (i == len(tiers) - 1)

        if verbose:
            print(f"    Downloading tier {label} ({tier['height']}p)...")

        start_time = time.time()
        success, mp4_path, stderr = download_video_tier(
            video_id, tier_dir, tier, config, with_sidecars=is_last,
        )
        elapsed = time.time() - start_time

        if success and mp4_path:
            tier_result = {**tier, "mp4_path": mp4_path}
            completed_tiers.append(tier_result)
            if verbose:
                size_mb = mp4_path.stat().st_size / (1024 * 1024)
                print(f"      ✓ {label}: {size_mb:.1f} MB in {elapsed:.0f}s")

            # Collect sidecars from highest tier directory
            if is_last:
                for p in tier_dir.iterdir():
                    if not p.name.startswith(video_id):
                        continue
                    suffix = p.suffix.lower()
                    name = p.name
                    if suffix in (".jpg", ".jpeg", ".webp", ".png"):
                        sidecar_files["thumbnail"] = p
                    elif suffix == ".vtt" or name.endswith(".vtt"):
                        sidecar_files["subtitle"] = p
                    elif name.endswith(".info.json"):
                        sidecar_files["info_json"] = p
        else:
            if verbose:
                print(f"      ✗ {label}: failed ({elapsed:.0f}s) — {stderr[:150]}")

        # Throttle between tier downloads (except after last)
        if i < len(tiers) - 1 and throttle_max > 0:
            delay = random.uniform(throttle_min, throttle_max)
            if verbose:
                print(f"      Throttle: {delay:.1f}s")
            time.sleep(delay)

    return completed_tiers, sidecar_files


def remux_to_hls(
    completed_tiers: list[dict], staging_dir: Path, config: dict, verbose: bool = False,
) -> list[dict]:
    """Remux each downloaded tier MP4 into HLS fMP4 segments.

    Args:
        completed_tiers: List of tier dicts with 'mp4_path' from download_video_tiers().
        staging_dir: Base staging directory for this video.
        config: Full consumer config dict.
        verbose: Print per-tier progress.

    Returns:
        List of tier dicts with added 'hls_dir' key pointing to the output directory.
    """
    hls_cfg = config.get("hls", {})
    segment_duration = hls_cfg.get("segment_duration", 6)

    remuxed_tiers = []

    for tier in completed_tiers:
        label = tier["label"]
        mp4_path = tier["mp4_path"]
        hls_dir = staging_dir / "hls" / label
        hls_dir.mkdir(parents=True, exist_ok=True)

        cmd = build_ffmpeg_remux_cmd(mp4_path, hls_dir, segment_duration)

        if verbose:
            print(f"    Remuxing {label} → HLS fMP4...")

        start_time = time.time()
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300, cwd=hls_dir)
        elapsed = time.time() - start_time

        if result.returncode != 0:
            if verbose:
                print(f"      ✗ {label} remux failed ({elapsed:.0f}s): {result.stderr[:200]}")
            continue

        # Verify playlist was created
        playlist = hls_dir / "playlist.m3u8"
        if not playlist.exists():
            if verbose:
                print(f"      ✗ {label} remux produced no playlist")
            continue

        tier_result = {**tier, "hls_dir": hls_dir}
        remuxed_tiers.append(tier_result)

        if verbose:
            seg_count = len(list(hls_dir.glob("seg_*.m4s")))
            print(f"      ✓ {label}: {seg_count} segments in {elapsed:.1f}s")

    return remuxed_tiers


def extract_tier_metadata(tier: dict, sidecar_files: dict[str, Path]) -> dict:
    """Extract bandwidth, resolution, and codecs for a tier from info.json or ffprobe.

    Args:
        tier: Tier dict with 'label', 'height', 'bandwidth', 'mp4_path'.
        sidecar_files: Dict with optional 'info_json' Path.

    Returns:
        Dict with 'bandwidth', 'resolution', 'codecs' keys.
    """
    # Start with config defaults
    bandwidth = tier.get("bandwidth", 2500000)
    height = tier.get("height", 720)
    width = int(height * 16 / 9)  # Assume 16:9 default
    codecs = "avc1.4d401f,mp4a.40.2"  # Default H.264 Main + AAC

    # Try to read actual metadata from info.json
    info_path = sidecar_files.get("info_json")
    if info_path and info_path.exists():
        try:
            data = json.loads(info_path.read_text(encoding="utf-8"))
            # Get actual width/height for this resolution
            actual_width = data.get("width")
            actual_height = data.get("height")
            if actual_width and actual_height:
                # Scale for this tier
                scale = height / actual_height if actual_height > 0 else 1
                width = int(actual_width * scale)
                # Ensure even dimensions
                width = width + (width % 2)

            # Try to get actual bitrate
            tbr = data.get("tbr")
            if tbr:
                # tbr is in kbps, bandwidth is in bps
                # Scale proportionally for this tier
                if actual_height and actual_height > 0:
                    ratio = (height / actual_height) ** 2
                    bandwidth = int(tbr * 1000 * ratio)
        except (json.JSONDecodeError, OSError):
            pass

    resolution = f"{width}x{height}"
    return {"bandwidth": bandwidth, "resolution": resolution, "codecs": codecs}


def upload_hls_package(
    r2_client, bucket: str, staging_dir: Path, remuxed_tiers: list[dict],
    sidecar_files: dict[str, Path], channel_handle: str, published_at: str | None,
    video_id: str, master_content: str, verbose: bool = False,
) -> dict[str, str]:
    """Upload the complete HLS package to R2 using parallel threads.

    Uploads master.m3u8, per-tier playlists/segments/init, thumbnail, subtitle.
    Uses ThreadPoolExecutor for concurrent uploads (10 threads) to avoid the
    bottleneck of uploading thousands of small segments sequentially.

    Args:
        r2_client: boto3 S3 client for R2.
        bucket: R2 bucket name.
        staging_dir: Base staging directory for this video.
        remuxed_tiers: List of tier dicts with 'hls_dir' from remux_to_hls().
        sidecar_files: Dict of sidecar files from download_video_tiers().
        channel_handle: Channel handle for R2 key.
        published_at: ISO 8601 datetime for R2 key path.
        video_id: YouTube video ID.
        master_content: Master playlist content string.
        verbose: Print per-file progress.

    Returns:
        Dict of R2 keys: {'master': '...', 'thumbnail': '...', 'subtitle': '...'}.
    """
    import concurrent.futures
    import threading

    from botocore.exceptions import ClientError

    # Content-Type mapping
    content_types = {
        ".m3u8": "application/vnd.apple.mpegurl",
        ".m4s": "video/mp4",
        ".mp4": "video/mp4",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".png": "image/png",
        ".vtt": "text/vtt",
        ".json": "application/json",
    }

    # Cache-Control per type
    cache_controls = {
        ".m3u8": "public, max-age=3600",
        ".m4s": "public, max-age=31536000, immutable",
        ".mp4": "public, max-age=31536000, immutable",
    }

    r2_keys: dict[str, str] = {}
    uploaded_count = 0
    upload_lock = threading.Lock()

    def upload_one(local_path: Path, relative_path: str) -> str:
        """Upload a single file. Returns the R2 key. Raises on failure."""
        nonlocal uploaded_count
        r2_key = build_r2_key_hls(channel_handle, published_at, video_id, relative_path)
        suffix = local_path.suffix.lower()
        ct = content_types.get(suffix, "application/octet-stream")
        cc = cache_controls.get(suffix, "public, max-age=86400")
        extra_args = {"ContentType": ct, "CacheControl": cc}

        try:
            r2_client.upload_file(str(local_path), bucket, r2_key, ExtraArgs=extra_args)
            with upload_lock:
                uploaded_count += 1
            return r2_key
        except (ClientError, OSError) as e:
            raise RuntimeError(f"Failed to upload {relative_path}: {e}")

    # Collect all files to upload
    upload_tasks: list[tuple[Path, str]] = []

    # 1. Write master.m3u8
    master_path = staging_dir / "hls" / "master.m3u8"
    master_path.parent.mkdir(parents=True, exist_ok=True)
    master_path.write_text(master_content, encoding="utf-8")
    upload_tasks.append((master_path, "master.m3u8"))

    # 2. Per-tier HLS files
    for tier in remuxed_tiers:
        label = tier["label"]
        hls_dir = tier["hls_dir"]
        for file_path in sorted(hls_dir.iterdir()):
            if file_path.is_file():
                upload_tasks.append((file_path, f"{label}/{file_path.name}"))

    # 3. Sidecars
    if "thumbnail" in sidecar_files:
        upload_tasks.append((sidecar_files["thumbnail"], "thumb.jpg"))
    if "subtitle" in sidecar_files:
        upload_tasks.append((sidecar_files["subtitle"], "subs.en.vtt"))

    if verbose:
        print(f"    Uploading {len(upload_tasks)} files to R2 (10 threads)...")

    # Upload all files in parallel
    errors = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        future_to_path = {
            executor.submit(upload_one, local_path, rel_path): rel_path
            for local_path, rel_path in upload_tasks
        }
        for future in concurrent.futures.as_completed(future_to_path):
            rel_path = future_to_path[future]
            try:
                future.result()
            except Exception as e:
                errors.append(str(e))
                print(f"      FAILED {rel_path}: {e}")

    if errors:
        raise RuntimeError(f"Failed to upload {len(errors)} file(s): {errors[0]}")

    # Build return keys
    r2_keys["master"] = build_r2_key_hls(channel_handle, published_at, video_id, "master.m3u8")
    if "thumbnail" in sidecar_files:
        r2_keys["thumbnail"] = build_r2_key_hls(channel_handle, published_at, video_id, "thumb.jpg")
    if "subtitle" in sidecar_files:
        r2_keys["subtitle"] = build_r2_key_hls(channel_handle, published_at, video_id, "subs.en.vtt")

    if verbose:
        print(f"    Uploaded {uploaded_count} files to R2")

    return r2_keys


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
        # HLS uploads use "master" key, legacy uploads use "video" key
        "media_path": r2_keys.get("master") or r2_keys.get("video"),
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


def cleanup_legacy_mp4(client, r2_client, bucket: str, video_id: str):
    """Delete old progressive MP4 and sidecars from R2 when re-processing to HLS.

    Checks if the video previously had a .mp4 media_path. If so, deletes the
    old MP4, thumbnail, subtitle, and info.json from R2 to reclaim storage.
    Skips if already HLS or no media_path.
    """
    from botocore.exceptions import ClientError

    # Look up current media_path from DB
    resp = (
        client.table("videos")
        .select("media_path, thumbnail_path, subtitle_path")
        .eq("youtube_id", video_id)
        .limit(1)
        .execute()
    )

    if not resp.data:
        return

    row = resp.data[0]
    media_path = row.get("media_path")

    # Skip if no media_path or already HLS
    if not media_path or media_path.endswith(".m3u8"):
        return

    # Delete old MP4 + sidecars from R2
    paths_to_delete = [media_path]
    if row.get("thumbnail_path"):
        paths_to_delete.append(row["thumbnail_path"])
    if row.get("subtitle_path"):
        paths_to_delete.append(row["subtitle_path"])

    # Derive info.json key from media_path
    info_key = str(Path(media_path).with_suffix(".info.json")).replace("\\", "/")
    paths_to_delete.append(info_key)

    for r2_key in paths_to_delete:
        try:
            r2_client.delete_object(Bucket=bucket, Key=r2_key)
        except ClientError:
            pass  # Best-effort cleanup


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
    """Orchestrate a single download job with HLS pipeline.

    Pipeline: download_video_tiers → remux_to_hls → generate_master_playlist
              → upload_hls_package → upsert_video_record

    Falls back to legacy single-file upload for local files.
    Returns True on success.
    """
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
        source = "local" if local else "yt-dlp (HLS 4-tier)"
        print(f"    DRY RUN: would download {video_id} \"{title}\" (source: {source})")
        return True

    # Check legacy media directory first — skip yt-dlp if files exist locally
    legacy_files = find_legacy_files(video_id, channel_handle, published_at)
    use_legacy = legacy_files and "video" in legacy_files

    # Create per-job staging directory
    job_staging = STAGING_DIR / video_id
    job_staging.mkdir(parents=True, exist_ok=True)

    try:
        if use_legacy:
            # ─── Legacy path: single-file upload (for local ytdl-sub files) ───
            files = legacy_files
            if verbose:
                print(f"    Found locally in {list(files.values())[0].parent}")
                for ftype, fpath in files.items():
                    size_mb = fpath.stat().st_size / (1024 * 1024)
                    print(f"    Found {ftype}: {fpath.name} ({size_mb:.1f} MB)")

            # Parse info.json
            info_data = {}
            if "info_json" in files:
                parsed = parse_info_json(files["info_json"])
                if parsed:
                    info_data = parsed
                    if not published_at and info_data.get("published_at"):
                        published_at = info_data["published_at"]
                    if channel_handle == "unknown" and info_data.get("handle"):
                        channel_handle = info_data["handle"]

            # Upload legacy files (single MP4)
            r2_keys = upload_video_files(
                r2_client, bucket, files, channel_handle, published_at, video_id,
            )
            upsert_video_record(client, video_id, channel_id, info_data, r2_keys, source_tags)
            complete_job(client, job["id"])
            purge_legacy_files(legacy_files, verbose)
            return True

        # ─── HLS path: multi-tier download → remux → upload ──────────────
        hls_cfg = config.get("hls", {})
        min_tiers = hls_cfg.get("min_tiers", 1)

        # 1. Download multiple quality tiers
        if verbose:
            print(f"    Downloading quality tiers...")
        completed_tiers, sidecar_files = download_video_tiers(
            video_id, job_staging, config, verbose,
        )

        if len(completed_tiers) < min_tiers:
            raise RuntimeError(
                f"Only {len(completed_tiers)} tier(s) downloaded, "
                f"minimum {min_tiers} required"
            )

        if verbose:
            print(f"    Downloaded {len(completed_tiers)} tier(s)")

        # 2. Parse info.json for metadata
        info_data = {}
        if "info_json" in sidecar_files:
            parsed = parse_info_json(sidecar_files["info_json"])
            if parsed:
                info_data = parsed
                if not published_at and info_data.get("published_at"):
                    published_at = info_data["published_at"]
                if channel_handle == "unknown" and info_data.get("handle"):
                    channel_handle = info_data["handle"]

        # 3. Remux each tier to HLS fMP4 segments
        if verbose:
            print(f"    Remuxing to HLS...")
        remuxed_tiers = remux_to_hls(completed_tiers, job_staging, config, verbose)

        if len(remuxed_tiers) < min_tiers:
            raise RuntimeError(
                f"Only {len(remuxed_tiers)} tier(s) remuxed successfully, "
                f"minimum {min_tiers} required"
            )

        # 4. Build tier metadata and generate master playlist
        playlist_tiers = []
        for tier in remuxed_tiers:
            meta = extract_tier_metadata(tier, sidecar_files)
            playlist_tiers.append({
                "label": tier["label"],
                "bandwidth": meta["bandwidth"],
                "resolution": meta["resolution"],
                "codecs": meta["codecs"],
            })

        master_content = generate_master_playlist(playlist_tiers)

        if verbose:
            print(f"    Generated master.m3u8 with {len(playlist_tiers)} variant(s)")

        # 5. Clean up legacy MP4 from R2 if re-processing
        cleanup_legacy_mp4(client, r2_client, bucket, video_id)

        # 6. Upload complete HLS package to R2
        if verbose:
            print(f"    Uploading HLS package to R2...")
        r2_keys = upload_hls_package(
            r2_client, bucket, job_staging, remuxed_tiers, sidecar_files,
            channel_handle, published_at, video_id, master_content, verbose,
        )

        if verbose:
            for key_type, key_val in r2_keys.items():
                print(f"    R2 key ({key_type}): {key_val}")

        # 7. Upsert video record with HLS paths
        upsert_video_record(
            client, video_id, channel_id, info_data, r2_keys, source_tags,
        )

        if verbose:
            print(f"    Video record upserted, r2_synced_at set")

        # 8. Delete job on success
        complete_job(client, job["id"])

        return True

    except Exception as e:
        fail_job(client, job["id"], str(e))
        return False

    finally:
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
    """Verify ffmpeg is on PATH — required for HLS remux and yt-dlp muxing.

    Fails fast with actionable error if ffmpeg is not available.
    """
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            print("Error: ffmpeg found but returned non-zero exit code.")
            print("  Install ffmpeg: https://ffmpeg.org/download.html")
            sys.exit(2)
    except FileNotFoundError:
        print("Error: ffmpeg not found on PATH.")
        print("  ffmpeg is required for HLS remux (-c copy) and yt-dlp muxing.")
        print("  Install ffmpeg: https://ffmpeg.org/download.html")
        print("  Windows: winget install ffmpeg")
        print("  macOS: brew install ffmpeg")
        print("  Linux: apt install ffmpeg")
        sys.exit(2)
    except subprocess.TimeoutExpired:
        print("Error: ffmpeg timed out during version check.")
        sys.exit(2)


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
