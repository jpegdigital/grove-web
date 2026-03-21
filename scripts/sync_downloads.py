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


def find_sibling(folder: Path, video_id: str, extensions: set[str]) -> str | None:
    """Find a sibling file matching video_id with one of the given extensions."""
    for ext in extensions:
        # Check exact match first
        candidate = folder / f"{video_id}{ext}"
        if candidate.exists():
            return candidate.name
    # Also check for files that start with video_id (e.g. VIDEO_ID.en.srt)
    for f in folder.iterdir():
        if f.name.startswith(video_id) and f.suffix in extensions and not f.name.endswith(".info.json"):
            return f.name
    return None


def scan_media_directory(media_dir: Path) -> list[dict]:
    """Walk MEDIA_DIR/@handle/YYYY-MM/*.info.json and extract metadata."""
    rows = []
    now_iso = datetime.now(timezone.utc).isoformat()

    info_files = sorted(media_dir.rglob("*.info.json"))
    total = len(info_files)
    print(f"  Found {total} .info.json file(s)")

    for i, info_path in enumerate(info_files, 1):
        try:
            data = json.loads(info_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            print(f"  Warning: failed to parse {info_path}: {e}")
            continue

        video_id = data.get("id")
        if not video_id:
            print(f"  Warning: no 'id' field in {info_path}, skipping")
            continue

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
            print(f"  Scanned {i}/{total}")

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

    print(f"Scanning media directory: {media_dir}")
    rows = scan_media_directory(media_dir)

    if not rows:
        print("  No downloaded videos found. Nothing to sync.")
        return

    print(f"\nEnsuring channels exist...")
    ensure_channels_exist(client, rows)

    print(f"\nUpserting {len(rows)} video(s) to Supabase...")
    upsert_videos(client, rows)

    print(f"\nDone! Synced {len(rows)} downloaded video(s).")


if __name__ == "__main__":
    main()
