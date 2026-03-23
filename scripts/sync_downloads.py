"""
Sync ytdl-sub downloads from MEDIA_DIRECTORY → Supabase videos table,
then upload sidecar files to Cloudflare R2.

Scans for .info.json sidecar files, extracts rich metadata from yt-dlp,
upserts into the videos table, and uploads media/thumbnail/subtitle/info.json
to R2 for CDN serving.

Usage:
    uv run python scripts/sync_downloads.py
    uv run python scripts/sync_downloads.py --limit 50
    uv run python scripts/sync_downloads.py --skip-r2
    uv run python scripts/sync_downloads.py --purge
"""

import json
import mimetypes
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from supabase import create_client
except ImportError:
    print("Missing dependency: uv add supabase")
    sys.exit(1)

# Load env from .env file in project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = PROJECT_ROOT / ".env"

VIDEO_EXTENSIONS = {".mp4", ".webm", ".mkv"}
THUMB_EXTENSIONS = {".jpg", ".jpeg", ".webp", ".png"}
SUB_EXTENSIONS = {".srt", ".vtt"}
BATCH_SIZE = 100


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


def parse_upload_date(raw: str | None) -> str | None:
    """Convert yt-dlp date string '20210922' → ISO date '2021-09-22T00:00:00Z'."""
    if not raw or len(raw) != 8:
        return None
    try:
        return f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}T00:00:00Z"
    except (ValueError, IndexError):
        return None


def _build_dir_cache(folder: Path) -> list[str]:
    """List a directory once and cache filenames. Uses os.scandir for speed on Windows."""
    try:
        return [entry.name for entry in os.scandir(folder)]
    except OSError:
        return []


# Module-level cache: folder path → list of filenames
_dir_cache: dict[Path, list[str]] = {}


def _get_dir_files(folder: Path) -> list[str]:
    """Return cached directory listing, populating on first access."""
    if folder not in _dir_cache:
        _dir_cache[folder] = _build_dir_cache(folder)
    return _dir_cache[folder]


def find_sibling(folder: Path, video_id: str, extensions: set[str]) -> str | None:
    """Find a sibling file matching video_id with one of the given extensions."""
    filenames = _get_dir_files(folder)

    # Check exact match first
    for ext in extensions:
        target = f"{video_id}{ext}"
        if target in filenames:
            return target

    # Prefix match (e.g. VIDEO_ID.en.srt)
    for name in filenames:
        if name.startswith(video_id) and not name.endswith(".info.json"):
            suffix = Path(name).suffix
            if suffix in extensions:
                return name
    return None


def _walk_info_json(media_dir: Path) -> list[Path]:
    """Recursively find *.info.json using os.scandir (much faster than rglob on Windows)."""
    results: list[Path] = []
    stack = [media_dir]
    while stack:
        current = stack.pop()
        try:
            entries = list(os.scandir(current))
        except OSError:
            continue
        for entry in entries:
            if entry.is_dir(follow_symlinks=False):
                stack.append(Path(entry.path))
            elif entry.name.endswith(".info.json"):
                results.append(Path(entry.path))
    results.sort()
    return results


def fetch_existing_video_ids(client) -> set[str]:
    """Fetch all youtube_ids already in the videos table for incremental sync."""
    existing: set[str] = set()
    page_size = 1000
    offset = 0
    while True:
        resp = (
            client.table("videos")
            .select("youtube_id")
            .eq("is_downloaded", True)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        if not resp.data:
            break
        for row in resp.data:
            existing.add(row["youtube_id"])
        if len(resp.data) < page_size:
            break
        offset += page_size
    return existing


def scan_media_directory(media_dir: Path, skip_ids: set[str] | None = None) -> list[dict]:
    """Walk MEDIA_DIR/@handle/YYYY-MM/*.info.json and extract metadata."""
    rows = []
    now_iso = datetime.now(timezone.utc).isoformat()

    info_files = _walk_info_json(media_dir)
    total = len(info_files)
    skipped = 0
    print(f"  Found {total} .info.json file(s)")

    for i, info_path in enumerate(info_files, 1):
        # Extract video ID from filename (VIDEO_ID.info.json) — skip before parsing
        video_id = info_path.name.removesuffix(".info.json")

        if skip_ids and video_id in skip_ids:
            skipped += 1
            if i % 50 == 0 or i == total:
                print(f"  Scanned {i}/{total} ({skipped} skipped, already synced)")
            continue

        try:
            data = json.loads(info_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            print(f"  Warning: failed to parse {info_path}: {e}")
            continue

        # Validate ID from file content matches filename
        file_video_id = data.get("id")
        if file_video_id:
            video_id = file_video_id

        channel_id = data.get("channel_id", "")
        if not channel_id:
            print(f"  Warning: no 'channel_id' in {info_path} ({video_id}), skipping")
            continue

        folder = info_path.parent
        # Build relative path from media_dir: @handle/YYYY-MM
        try:
            relative_folder = folder.relative_to(media_dir)
        except ValueError:
            continue

        # Find sibling files
        video_file = find_sibling(folder, video_id, VIDEO_EXTENSIONS)
        thumb_file = find_sibling(folder, video_id, THUMB_EXTENSIONS)
        sub_file = find_sibling(folder, video_id, SUB_EXTENSIONS)

        rel = str(relative_folder).replace("\\", "/")
        media_path = f"{rel}/{video_file}" if video_file else None
        thumbnail_path = f"{rel}/{thumb_file}" if thumb_file else None
        subtitle_path = f"{rel}/{sub_file}" if sub_file else None

        # Parse chapters into clean JSON-serializable format
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

        row = {
            "youtube_id": video_id,
            "channel_id": channel_id,
            "title": data.get("title") or data.get("fulltitle") or "Untitled",
            "description": data.get("description") or "",
            "thumbnail_url": data.get("thumbnail") or "",
            "published_at": parse_upload_date(data.get("upload_date")),
            "is_downloaded": True,
            "media_path": media_path,
            "thumbnail_path": thumbnail_path,
            "subtitle_path": subtitle_path,
            "duration_seconds": data.get("duration"),
            "like_count": data.get("like_count"),
            "comment_count": data.get("comment_count"),
            "tags": data.get("tags") or [],
            "categories": data.get("categories") or [],
            "chapters": json.dumps(chapters) if chapters else None,
            "width": data.get("width"),
            "height": data.get("height"),
            "fps": data.get("fps"),
            "language": data.get("language"),
            "webpage_url": data.get("webpage_url") or "",
            "handle": data.get("uploader_id") or "",
            "downloaded_at": now_iso,
            "info_json_synced_at": now_iso,
        }

        rows.append(row)

        if i % 50 == 0 or i == total:
            print(f"  Scanned {i}/{total} ({skipped} skipped, already synced)")

    _dir_cache.clear()  # Free memory after scan
    return rows


def ensure_channels_exist(client, rows: list[dict]):
    """
    Pre-insert minimal channel rows for any channel_id not already in the channels table.
    This avoids FK constraint failures on videos.channel_id.
    """
    unique_channels: dict[str, dict] = {}
    for row in rows:
        cid = row["channel_id"]
        if cid and cid not in unique_channels:
            unique_channels[cid] = {
                "channel_id": cid,
                "handle": row.get("handle", ""),
                "title": row.get("title", "Unknown"),
            }

    if not unique_channels:
        return

    channel_ids = list(unique_channels.keys())

    # Query existing channels in batches
    existing_ids: set[str] = set()
    for i in range(0, len(channel_ids), BATCH_SIZE):
        batch = channel_ids[i : i + BATCH_SIZE]
        resp = client.table("channels").select("youtube_id").in_("youtube_id", batch).execute()
        for ch in resp.data:
            existing_ids.add(ch["youtube_id"])

    missing = [v for k, v in unique_channels.items() if k not in existing_ids]
    if not missing:
        return

    print(f"  Inserting {len(missing)} missing channel(s) into channels table...")
    now_iso = datetime.now(timezone.utc).isoformat()

    channel_rows = []
    for m in missing:
        channel_rows.append({
            "youtube_id": m["channel_id"],
            "title": m["title"],
            "custom_url": m["handle"] if m["handle"] else None,
            "fetched_at": now_iso,
        })

    for i in range(0, len(channel_rows), BATCH_SIZE):
        batch = channel_rows[i : i + BATCH_SIZE]
        client.table("channels").upsert(batch, on_conflict="youtube_id").execute()


def upsert_videos(client, rows: list[dict]):
    """Batch upsert video rows into Supabase."""
    total = len(rows)
    for i in range(0, total, BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        client.table("videos").upsert(batch, on_conflict="youtube_id").execute()
        print(f"  Upserted {min(i + BATCH_SIZE, total)}/{total} videos")


# ---------------------------------------------------------------------------
# R2 Upload
# ---------------------------------------------------------------------------

def create_r2_client():
    """Create a boto3 S3 client configured for Cloudflare R2."""
    import boto3

    account_id = os.environ.get("R2_ACCOUNT_ID")
    access_key = os.environ.get("R2_ACCESS_KEY_ID")
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")

    missing = []
    if not account_id:
        missing.append("R2_ACCOUNT_ID")
    if not access_key:
        missing.append("R2_ACCESS_KEY_ID")
    if not secret_key:
        missing.append("R2_SECRET_ACCESS_KEY")
    if not os.environ.get("R2_BUCKET_NAME"):
        missing.append("R2_BUCKET_NAME")

    if missing:
        print(f"Error: Missing R2 environment variable(s): {', '.join(missing)}")
        sys.exit(2)

    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )


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


def sync_to_r2(client, r2_client, media_dir: Path, limit: int | None, purge: bool) -> dict:
    """Upload pending videos to R2 and optionally purge local files.

    Returns a dict with counts: uploaded, skipped, failed, purged.
    """
    bucket = os.environ.get("R2_BUCKET_NAME", "")

    # Query videos that need R2 upload
    query = (
        client.table("videos")
        .select("youtube_id, media_path, thumbnail_path, subtitle_path")
        .eq("is_downloaded", True)
        .is_("r2_synced_at", "null")
        .not_.is_("media_path", "null")
        .order("published_at", desc=True)
    )
    if limit:
        query = query.limit(limit)

    resp = query.execute()
    pending = resp.data or []

    counts = {"uploaded": 0, "skipped": 0, "failed": 0, "purged": 0}

    if not pending:
        print("  No pending videos for R2 upload.")
        return counts

    print(f"\n  {len(pending)} video(s) pending R2 upload" + (f" (limit: {limit})" if limit else ""))

    for i, video in enumerate(pending, 1):
        yt_id = video["youtube_id"]
        media_path = video.get("media_path")
        thumb_path = video.get("thumbnail_path")
        sub_path = video.get("subtitle_path")

        if not media_path:
            counts["skipped"] += 1
            continue

        print(f"\n  [{i}/{len(pending)}] {yt_id}")

        local_media = media_dir / media_path
        if not local_media.exists():
            print(f"    SKIP: local file not found: {media_path}")
            counts["skipped"] += 1
            continue

        # Upload all sidecar files
        all_ok = True

        # 1. Media file (required)
        if not upload_to_r2(r2_client, bucket, local_media, media_path):
            all_ok = False

        # 2. Thumbnail (optional)
        if thumb_path:
            local_thumb = media_dir / thumb_path
            if local_thumb.exists():
                if not upload_to_r2(r2_client, bucket, local_thumb, thumb_path):
                    all_ok = False

        # 3. Subtitle (optional)
        if sub_path:
            local_sub = media_dir / sub_path
            if local_sub.exists():
                if not upload_to_r2(r2_client, bucket, local_sub, sub_path):
                    all_ok = False

        # 4. info.json (derived from media_path stem)
        info_key = str(Path(media_path).with_suffix(".info.json"))
        info_key = info_key.replace("\\", "/")
        local_info = media_dir / info_key
        if local_info.exists():
            if not upload_to_r2(r2_client, bucket, local_info, info_key):
                all_ok = False

        if all_ok:
            # Set r2_synced_at in DB
            now_iso = datetime.now(timezone.utc).isoformat()
            client.table("videos").update(
                {"r2_synced_at": now_iso}
            ).eq("youtube_id", yt_id).execute()
            counts["uploaded"] += 1
            print(f"    r2_synced_at set")

            # Purge local files if requested
            if purge:
                _purge_local_files(client, yt_id, media_dir, media_path, thumb_path, sub_path, info_key, counts)
        else:
            print(f"    PARTIAL FAILURE: r2_synced_at NOT set (will retry next run)")
            counts["failed"] += 1

    return counts


def _purge_local_files(
    client, yt_id: str, media_dir: Path,
    media_path: str, thumb_path: str | None, sub_path: str | None, info_key: str,
    counts: dict,
):
    """Delete local files for a video after confirming r2_synced_at is set in DB."""
    # Safety check: re-verify r2_synced_at from DB before deleting
    verify = (
        client.table("videos")
        .select("r2_synced_at")
        .eq("youtube_id", yt_id)
        .single()
        .execute()
    )
    if not verify.data or not verify.data.get("r2_synced_at"):
        print(f"    PURGE SKIPPED: r2_synced_at not confirmed in DB for {yt_id}")
        return

    files_to_delete = [media_path]
    if thumb_path:
        files_to_delete.append(thumb_path)
    if sub_path:
        files_to_delete.append(sub_path)
    files_to_delete.append(info_key)

    deleted = 0
    for rel_path in files_to_delete:
        local_file = media_dir / rel_path
        if local_file.exists():
            try:
                local_file.unlink()
                print(f"    Purged: {rel_path}")
                deleted += 1
            except OSError as e:
                print(f"    Purge failed: {rel_path}: {e}")

    if deleted > 0:
        counts["purged"] += 1


def main():
    load_env()

    # Fix Windows console encoding for Unicode channel names
    if sys.stdout.encoding != "utf-8":
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    # Parse CLI flags
    full_resync = "--full" in sys.argv
    skip_r2 = "--skip-r2" in sys.argv
    purge = "--purge" in sys.argv

    limit: int | None = None
    if "--limit" in sys.argv:
        try:
            idx = sys.argv.index("--limit")
            limit = int(sys.argv[idx + 1])
        except (IndexError, ValueError):
            print("Error: --limit requires an integer argument")
            sys.exit(1)

    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SECRET_KEY")
    media_directory = os.environ.get("MEDIA_DIRECTORY", "E:/Entertainment/PradoTube")

    if not supabase_url or not supabase_key:
        print("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set")
        sys.exit(2)

    media_dir = Path(media_directory)
    if not media_dir.exists():
        print(f"Error: MEDIA_DIRECTORY does not exist: {media_dir}")
        sys.exit(2)

    client = create_client(supabase_url, supabase_key)

    # --- Phase 1: DB Sync ---
    skip_ids: set[str] | None = None
    if not full_resync:
        print("Fetching already-synced video IDs (use --full to force full rescan)...")
        skip_ids = fetch_existing_video_ids(client)
        print(f"  {len(skip_ids)} video(s) already synced, will skip them")
    else:
        print("Full resync mode: re-processing all videos")

    print(f"\nScanning media directory: {media_dir}")
    rows = scan_media_directory(media_dir, skip_ids=skip_ids)

    db_synced = 0
    if rows:
        print(f"\nEnsuring channels exist...")
        ensure_channels_exist(client, rows)

        print(f"\nUpserting {len(rows)} new video(s) to Supabase...")
        upsert_videos(client, rows)
        db_synced = len(rows)

    # --- Phase 2: R2 Upload ---
    r2_counts = {"uploaded": 0, "skipped": 0, "failed": 0, "purged": 0}

    if not skip_r2:
        try:
            r2_client = create_r2_client()
        except Exception as e:
            print(f"\nFatal: Cannot initialize R2 client: {e}")
            sys.exit(2)

        print(f"\nSyncing to R2...")
        r2_counts = sync_to_r2(client, r2_client, media_dir, limit, purge)
    else:
        print("\n--skip-r2: Skipping R2 upload step")

    # --- Summary ---
    print(f"\n{'=' * 50}")
    print(f"  DB synced:    {db_synced} new video(s)")
    print(f"  R2 uploaded:  {r2_counts['uploaded']}")
    print(f"  R2 skipped:   {r2_counts['skipped']} (already synced or missing local file)")
    print(f"  R2 failed:    {r2_counts['failed']}")
    if purge:
        print(f"  Purged:       {r2_counts['purged']} local file set(s)")
    print(f"{'=' * 50}")

    # Exit code
    if r2_counts["failed"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
