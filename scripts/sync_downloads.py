"""
Sync ytdl-sub downloads from MEDIA_DIRECTORY → Supabase videos table.

Scans for .info.json sidecar files, extracts rich metadata from yt-dlp,
and upserts into the videos table with is_downloaded=true.

Usage:
    python scripts/sync_downloads.py
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from supabase import create_client
except ImportError:
    print("Missing dependency: pip install supabase")
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


def main():
    load_env()

    full_resync = "--full" in sys.argv

    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SECRET_KEY")
    media_directory = os.environ.get("MEDIA_DIRECTORY", "E:/Entertainment/PradoTube")

    if not supabase_url or not supabase_key:
        print("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set")
        sys.exit(1)

    media_dir = Path(media_directory)
    if not media_dir.exists():
        print(f"Error: MEDIA_DIRECTORY does not exist: {media_dir}")
        sys.exit(1)

    client = create_client(supabase_url, supabase_key)

    skip_ids: set[str] | None = None
    if not full_resync:
        print("Fetching already-synced video IDs (use --full to force full rescan)...")
        skip_ids = fetch_existing_video_ids(client)
        print(f"  {len(skip_ids)} video(s) already synced, will skip them")
    else:
        print("Full resync mode: re-processing all videos")

    print(f"\nScanning media directory: {media_dir}")
    rows = scan_media_directory(media_dir, skip_ids=skip_ids)

    if not rows:
        print("  No new downloaded videos found. Nothing to sync.")
        return

    print(f"\nEnsuring channels exist...")
    ensure_channels_exist(client, rows)

    print(f"\nUpserting {len(rows)} new video(s) to Supabase...")
    upsert_videos(client, rows)

    print(f"\nDone! Synced {len(rows)} new video(s).")


if __name__ == "__main__":
    main()
