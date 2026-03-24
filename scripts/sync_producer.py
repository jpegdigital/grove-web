"""
Video Sync Producer — discovers new videos and identifies removals.

Fetches video catalogs via YouTube Data API (playlistItems.list + videos.list),
applies per-channel rules (duration, date range), diffs against DB to compute
download/remove sets, and enqueues jobs into the sync_queue table.

Usage:
    uv run python scripts/sync_producer.py [OPTIONS]

Options:
    --channel CHANNEL_ID   Run for a single channel only
    --dry-run              Preview what would be enqueued, don't write
    --verbose              Show per-video decisions
"""

import argparse
import math
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import requests
import yaml
from dateutil.relativedelta import relativedelta

# ─── Project Setup ────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = PROJECT_ROOT / ".env"
CONFIG_FILE = PROJECT_ROOT / "config" / "producer.yaml"

API_BASE = "https://www.googleapis.com/youtube/v3"

# Fix Windows console encoding for unicode channel titles
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


# ─── Config ───────────────────────────────────────────────────────────────────

def load_config() -> dict:
    """Load producer config from config/producer.yaml with sensible defaults."""
    defaults = {
        "producer": {
            "max_videos_per_channel": 250,
            "min_duration_seconds": 300,
            "default_date_range": "today-6months",
            "early_stop_tolerance": 3,
        },
        "api": {
            "page_size": 50,
            "enrichment_batch_size": 50,
            "max_workers": 8,
            "max_retries": 3,
            "retry_backoff_base": 2,
        },
        "quota": {
            "daily_limit": 10000,
            "warn_threshold": 8000,
        },
        "db": {
            "page_size": 1000,
            "enqueue_batch_size": 100,
        },
    }
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE) as f:
            file_cfg = yaml.safe_load(f) or {}
        # Deep merge: file values override defaults
        for section in defaults:
            if section in file_cfg:
                defaults[section].update(file_cfg[section])
    return defaults


# Global config — loaded once at import, overridable in tests
CFG = load_config()


# ─── Env ──────────────────────────────────────────────────────────────────────

def load_env() -> None:
    """Load .env file into os.environ."""
    if not ENV_FILE.exists():
        return
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


def get_env(key: str) -> str:
    val = os.environ.get(key)
    if not val:
        print(f"Error: {key} not set")
        sys.exit(2)
    return val


def get_supabase_client():
    from supabase import create_client
    return create_client(
        get_env("NEXT_PUBLIC_SUPABASE_URL"),
        get_env("SUPABASE_SECRET_KEY"),
    )


# ─── API helpers with retry ──────────────────────────────────────────────────

def api_get(url: str, params: dict) -> dict:
    """GET with exponential backoff on 429/5xx."""
    max_retries = CFG["api"]["max_retries"]
    backoff_base = CFG["api"]["retry_backoff_base"]

    for attempt in range(max_retries + 1):
        resp = requests.get(url, params=params)
        if resp.status_code == 200:
            return resp.json()
        if resp.status_code in (429, 500, 502, 503) and attempt < max_retries:
            wait = backoff_base ** (attempt + 1)
            print(f"      Retry {attempt + 1}/{max_retries} after {wait}s (HTTP {resp.status_code})")
            time.sleep(wait)
            continue
        resp.raise_for_status()

    # Should not reach here, but just in case
    resp.raise_for_status()
    return {}


# ─── uploads_playlist_id ──────────────────────────────────────────────────────

def uploads_playlist_id(channel_id: str) -> str:
    """Convert channel ID (UC...) to uploads playlist ID (UU...)."""
    return "UU" + channel_id[2:]


# ─── fetch_playlist_items (with early termination + max_videos cap) ──────────

def fetch_playlist_items(
    api_key: str,
    playlist_id: str,
    date_cutoff: datetime | None = None,
) -> tuple[list[dict], int]:
    """Fetch video IDs from an uploads playlist (newest first).

    Stops early when:
    - max_videos_per_channel reached
    - N consecutive videos are past the date cutoff (early_stop_tolerance)

    Returns (items, quota_used).
    Cost: 1 quota unit per page (up to page_size items each).
    """
    max_videos = CFG["producer"]["max_videos_per_channel"]
    page_size = CFG["api"]["page_size"]
    tolerance = CFG["producer"]["early_stop_tolerance"]
    max_pages = math.ceil(max_videos / page_size)

    items: list[dict] = []
    page_token = None
    pages_fetched = 0
    consecutive_past_cutoff = 0

    for _ in range(max_pages):
        params = {
            "part": "snippet",
            "playlistId": playlist_id,
            "maxResults": page_size,
            "key": api_key,
        }
        if page_token:
            params["pageToken"] = page_token

        data = api_get(f"{API_BASE}/playlistItems", params)
        pages_fetched += 1

        for item in data.get("items", []):
            snippet = item["snippet"]
            vid_id = snippet.get("resourceId", {}).get("videoId")
            if not vid_id:
                continue

            published_at = snippet.get("publishedAt", "")

            # Check early termination on date cutoff
            if date_cutoff and published_at:
                try:
                    pub_dt = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
                    if pub_dt < date_cutoff:
                        consecutive_past_cutoff += 1
                        if consecutive_past_cutoff >= tolerance:
                            return items, pages_fetched
                        continue  # skip this video but keep paginating
                    else:
                        consecutive_past_cutoff = 0
                except ValueError:
                    consecutive_past_cutoff = 0

            items.append({
                "video_id": vid_id,
                "title": snippet.get("title", ""),
                "published_at": published_at,
                "description": snippet.get("description", ""),
                "thumbnail_url": (
                    snippet.get("thumbnails", {}).get("high", {}).get("url")
                    or snippet.get("thumbnails", {}).get("medium", {}).get("url")
                    or snippet.get("thumbnails", {}).get("default", {}).get("url")
                    or ""
                ),
            })

            if len(items) >= max_videos:
                return items, pages_fetched

        page_token = data.get("nextPageToken")
        if not page_token:
            break

    return items, pages_fetched


# ─── enrich_videos ────────────────────────────────────────────────────────────

def enrich_videos(
    api_key: str, video_ids: list[str]
) -> tuple[dict[str, dict], int]:
    """Batch-fetch duration and stats via videos.list.

    Returns (details_dict, quota_used) where details_dict is keyed by video_id
    with {duration_seconds, duration_iso, view_count, like_count, comment_count}.
    Cost: 1 quota unit per batch of enrichment_batch_size videos.
    """
    batch_size = CFG["api"]["enrichment_batch_size"]
    details: dict[str, dict] = {}
    calls = 0

    for i in range(0, len(video_ids), batch_size):
        chunk = video_ids[i : i + batch_size]
        params = {
            "part": "contentDetails,statistics",
            "id": ",".join(chunk),
            "key": api_key,
        }
        data = api_get(f"{API_BASE}/videos", params)
        calls += 1

        for item in data.get("items", []):
            duration_iso = item.get("contentDetails", {}).get("duration", "")
            stats = item.get("statistics", {})
            details[item["id"]] = {
                "duration_iso": duration_iso,
                "duration_seconds": parse_iso_duration(duration_iso),
                "view_count": int(stats.get("viewCount", 0)),
                "like_count": int(stats.get("likeCount", 0)),
                "comment_count": int(stats.get("commentCount", 0)),
            }

    return details, calls


# ─── parse_date_range_override ────────────────────────────────────────────────

def parse_date_range_override(override_str: str | None) -> datetime:
    """Convert date range string to a UTC datetime cutoff.

    Supported formats:
        "today-6months", "today-2years", "today-1years" (relative)
        "19700101" (absolute date, YYYYMMDD)
        None → uses default_date_range from config
    """
    if not override_str:
        override_str = CFG["producer"]["default_date_range"]

    now = datetime.now(timezone.utc)

    # Absolute date format: YYYYMMDD
    if re.match(r"^\d{8}$", override_str):
        return datetime.strptime(override_str, "%Y%m%d").replace(tzinfo=timezone.utc)

    # Relative format: today-Nunit
    match = re.match(r"^today-(\d+)(months?|years?)$", override_str)
    if not match:
        # Fall back to 6 months
        return now - relativedelta(months=6)

    amount = int(match.group(1))
    unit = match.group(2)

    if unit.startswith("year"):
        return now - relativedelta(years=amount)
    else:
        return now - relativedelta(months=amount)


# ─── parse_iso_duration ───────────────────────────────────────────────────────

def parse_iso_duration(iso: str) -> int:
    """Parse ISO 8601 duration like PT3M45S to seconds."""
    if not iso or not iso.startswith("PT"):
        return 0
    s = iso[2:]
    hours = minutes = seconds = 0
    for unit, name in [("H", "hours"), ("M", "minutes"), ("S", "seconds")]:
        if unit in s:
            val, s = s.split(unit, 1)
            if name == "hours":
                hours = int(val)
            elif name == "minutes":
                minutes = int(val)
            elif name == "seconds":
                seconds = int(val)
    return hours * 3600 + minutes * 60 + seconds


# ─── DB fetchers ──────────────────────────────────────────────────────────────

def fetch_curated_channels(client) -> list[dict]:
    """Fetch all curated channels with their date_range_override and channel info."""
    resp = (
        client.table("curated_channels")
        .select("channel_id, date_range_override, channels(youtube_id, title, custom_url)")
        .order("display_order")
        .execute()
    )
    results = []
    for row in resp.data or []:
        ch = row.get("channels")
        if not ch:
            continue
        results.append({
            "channel_id": row["channel_id"],
            "title": ch.get("title", ""),
            "custom_url": ch.get("custom_url", ""),
            "date_range_override": row.get("date_range_override"),
        })
    return results


def fetch_existing_video_ids(client, channel_id: str) -> set[str]:
    """Fetch all video youtube_ids for a channel from the videos table."""
    video_ids: set[str] = set()
    offset = 0
    page_size = CFG["db"]["page_size"]

    while True:
        resp = (
            client.table("videos")
            .select("youtube_id")
            .eq("channel_id", channel_id)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = resp.data or []
        for row in rows:
            video_ids.add(row["youtube_id"])
        if len(rows) < page_size:
            break
        offset += page_size

    return video_ids


def fetch_existing_videos(client, channel_id: str) -> dict[str, dict]:
    """Fetch existing video rows with R2 paths for remove job metadata."""
    results: dict[str, dict] = {}
    offset = 0
    page_size = CFG["db"]["page_size"]

    while True:
        resp = (
            client.table("videos")
            .select("youtube_id, media_path, thumbnail_path, subtitle_path, title")
            .eq("channel_id", channel_id)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = resp.data or []
        for row in rows:
            results[row["youtube_id"]] = {
                "media_path": row.get("media_path"),
                "thumbnail_path": row.get("thumbnail_path"),
                "subtitle_path": row.get("subtitle_path"),
                "title": row.get("title", ""),
            }
        if len(rows) < page_size:
            break
        offset += page_size

    return results


def fetch_orphaned_channel_ids(client, curated_channel_ids: set[str]) -> set[str]:
    """Find channel_ids that have videos in DB but are not in the curated set."""
    resp = client.rpc("get_distinct_video_channel_ids", {}).execute()
    all_ids = {row["channel_id"] for row in (resp.data or []) if row.get("channel_id")}
    return all_ids - curated_channel_ids


# ─── Rules + Diff ─────────────────────────────────────────────────────────────

def apply_rules(
    videos: list[dict],
    min_duration_s: int | None = None,
    date_cutoff: datetime | None = None,
) -> list[dict]:
    """Filter videos by duration and date range rules.

    Rules:
    - duration_seconds >= 60 (exclude shorts)
    - duration_seconds >= min_duration_s (from config)
    - published_at >= date_cutoff (if provided)
    """
    if min_duration_s is None:
        min_duration_s = CFG["producer"]["min_duration_seconds"]

    filtered = []
    for v in videos:
        duration = v.get("duration_seconds", 0)
        if duration < 60:
            continue
        if duration < min_duration_s:
            continue
        if date_cutoff and v.get("published_at"):
            pub = v["published_at"]
            if isinstance(pub, str):
                try:
                    pub = datetime.fromisoformat(pub.replace("Z", "+00:00"))
                except ValueError:
                    continue
            if pub < date_cutoff:
                continue
        filtered.append(v)
    return filtered


def compute_diff(
    desired_ids: set[str], existing_ids: set[str]
) -> tuple[set[str], set[str]]:
    """Compute download and remove sets from desired vs existing.

    Returns (to_download, to_remove).
    """
    to_download = desired_ids - existing_ids
    to_remove = existing_ids - desired_ids
    return to_download, to_remove


# ─── Enqueue ──────────────────────────────────────────────────────────────────

def enqueue_jobs(
    client,
    jobs: list[dict],
    dry_run: bool = False,
) -> int:
    """Batch INSERT jobs into sync_queue with ON CONFLICT DO NOTHING.

    Uses the enqueue_sync_jobs RPC to respect the partial unique index.
    Each job dict: {video_id, channel_id, action, metadata}.
    Returns count of jobs enqueued (or would-be enqueued in dry_run).
    """
    if not jobs:
        return 0

    if dry_run:
        for job in jobs:
            print(f"    [DRY RUN] Would enqueue {job['action']}: {job['video_id']}")
        return len(jobs)

    import json

    batch_size = CFG["db"]["enqueue_batch_size"]
    enqueued = 0
    for i in range(0, len(jobs), batch_size):
        batch = jobs[i : i + batch_size]
        payload = json.dumps([
            {
                "video_id": j["video_id"],
                "channel_id": j["channel_id"],
                "action": j["action"],
                "metadata": j.get("metadata", {}),
            }
            for j in batch
        ])
        resp = client.rpc("enqueue_sync_jobs", {"jobs": payload}).execute()
        enqueued += resp.data if isinstance(resp.data, int) else len(batch)

    return enqueued


# ─── process_channel ──────────────────────────────────────────────────────────

def process_channel(
    client,
    api_key: str,
    channel: dict,
    dry_run: bool = False,
    verbose: bool = False,
) -> dict:
    """Orchestrate full pipeline for a single channel.

    Returns summary dict with counts and quota usage.
    """
    channel_id = channel["channel_id"]
    title = channel.get("title", channel_id)
    date_override = channel.get("date_range_override")
    date_cutoff = parse_date_range_override(date_override)
    min_duration = CFG["producer"]["min_duration_seconds"]

    label = f"{title} ({channel_id})"
    range_label = date_override or f"default {CFG['producer']['default_date_range']}"

    def error_result(err: str, quota: int = 0) -> dict:
        return {
            "channel_id": channel_id,
            "title": title,
            "error": err,
            "desired": 0,
            "existing": 0,
            "downloads": 0,
            "removals": 0,
            "quota_used": quota,
        }

    # Step 1: Fetch uploads playlist with early termination
    playlist_id = uploads_playlist_id(channel_id)
    try:
        all_videos, playlist_quota = fetch_playlist_items(
            api_key, playlist_id, date_cutoff=date_cutoff,
        )
    except requests.exceptions.HTTPError as e:
        print(f"  {label}: ERROR fetching playlist: {e}")
        return error_result(str(e))

    if not all_videos:
        print(f"  {label}: 0 videos found ({range_label})")
        return error_result("", playlist_quota)

    # Step 2: Enrich with duration/stats
    video_ids = [v["video_id"] for v in all_videos]
    try:
        details, enrich_quota = enrich_videos(api_key, video_ids)
    except requests.exceptions.HTTPError as e:
        print(f"  {label}: ERROR enriching: {e}")
        return error_result(str(e), playlist_quota)

    enriched = [{**v, **details.get(v["video_id"], {})} for v in all_videos]

    # Step 3: Apply rules
    desired = apply_rules(enriched, min_duration, date_cutoff)
    desired_ids = {v["video_id"] for v in desired}
    desired_lookup = {v["video_id"]: v for v in desired}

    # Step 4: Fetch existing videos from DB
    existing_videos = fetch_existing_videos(client, channel_id)
    existing_ids = set(existing_videos.keys())

    # Step 5: Compute diff
    to_download, to_remove = compute_diff(desired_ids, existing_ids)

    if verbose:
        for vid in sorted(to_download):
            meta = desired_lookup.get(vid, {})
            print(f"    + DOWNLOAD: {vid} — {meta.get('title', '?')}")
        for vid in sorted(to_remove):
            rm_meta = existing_videos.get(vid, {})
            print(f"    - REMOVE:   {vid} — {rm_meta.get('title', '?')}")

    # Step 6: Enqueue jobs
    download_jobs = [
        {"video_id": vid, "channel_id": channel_id, "action": "download",
         "metadata": desired_lookup.get(vid, {})}
        for vid in to_download
    ]
    remove_jobs = [
        {"video_id": vid, "channel_id": channel_id, "action": "remove",
         "metadata": existing_videos.get(vid, {})}
        for vid in to_remove
    ]

    dl_count = enqueue_jobs(client, download_jobs, dry_run)
    rm_count = enqueue_jobs(client, remove_jobs, dry_run)
    total_quota = playlist_quota + enrich_quota

    print(
        f"  {label}: {len(all_videos)} fetched, {len(desired)} desired, "
        f"+{dl_count} dl, -{rm_count} rm, {total_quota} quota ({range_label})"
    )

    return {
        "channel_id": channel_id,
        "title": title,
        "desired": len(desired),
        "existing": len(existing_ids),
        "downloads": dl_count,
        "removals": rm_count,
        "quota_used": total_quota,
    }


# ─── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Video Sync Producer — discover downloads, identify removals"
    )
    parser.add_argument(
        "--channel",
        help="Run for a single channel ID only",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be enqueued, don't write",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show per-video decisions",
    )
    args = parser.parse_args()

    load_env()
    api_key = get_env("YOUTUBE_API_KEY")
    client = get_supabase_client()

    start_time = time.time()

    # Fetch curated channels
    print("Fetching curated channels...")
    channels = fetch_curated_channels(client)

    if not channels:
        print("No curated channels found.")
        return

    # Filter to single channel if requested
    if args.channel:
        channels = [c for c in channels if c["channel_id"] == args.channel]
        if not channels:
            print(f"Channel {args.channel} not found in curated channels.")
            return

    max_workers = CFG["api"]["max_workers"]
    warn_threshold = CFG["quota"]["warn_threshold"]

    print(f"Processing {len(channels)} channel(s) with {max_workers} workers...")
    if args.dry_run:
        print("[DRY RUN MODE — no database writes]")

    # Process channels in parallel
    summaries: list[dict] = []
    total_quota = 0
    total_downloads = 0
    total_removals = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_channel = {
            executor.submit(
                process_channel, client, api_key, ch, args.dry_run, args.verbose
            ): ch
            for ch in channels
        }

        for future in as_completed(future_to_channel):
            ch = future_to_channel[future]
            try:
                summary = future.result()
                summaries.append(summary)
                total_quota += summary["quota_used"]
                total_downloads += summary["downloads"]
                total_removals += summary["removals"]

                if total_quota > warn_threshold:
                    print(f"  WARNING: Quota usage ({total_quota}) exceeds threshold ({warn_threshold})")
            except Exception as e:
                print(f"  ERROR processing {ch.get('title', ch['channel_id'])}: {e}")
                summaries.append({
                    "channel_id": ch["channel_id"],
                    "title": ch.get("title", ""),
                    "error": str(e),
                    "desired": 0,
                    "existing": 0,
                    "downloads": 0,
                    "removals": 0,
                    "quota_used": 0,
                })

    # Orphaned channel cleanup (US2)
    curated_ids = {c["channel_id"] for c in channels}
    if not args.channel:
        print("\nChecking for orphaned channels...")
        try:
            orphaned = fetch_orphaned_channel_ids(client, curated_ids)
            if orphaned:
                print(f"  Found {len(orphaned)} orphaned channel(s)")
                for oc_id in orphaned:
                    orphan_vids = fetch_existing_video_ids(client, oc_id)
                    if orphan_vids:
                        remove_jobs = [
                            {
                                "video_id": vid,
                                "channel_id": oc_id,
                                "action": "remove",
                                "metadata": {},
                            }
                            for vid in orphan_vids
                        ]
                        rm_count = enqueue_jobs(client, remove_jobs, args.dry_run)
                        total_removals += rm_count
                        print(f"    {oc_id}: {rm_count} remove jobs")
            else:
                print("  No orphaned channels found")
        except Exception as e:
            print(f"  ERROR checking orphaned channels: {e}")

    # Summary
    elapsed = time.time() - start_time
    print(f"\n{'=' * 60}")
    print(f"SUMMARY")
    print(f"{'=' * 60}")
    print(f"  Channels processed: {len(summaries)}")
    print(f"  Total downloads enqueued: {total_downloads}")
    print(f"  Total removals enqueued: {total_removals}")
    print(f"  Total API quota used: {total_quota}")
    print(f"  Daily quota remaining: ~{CFG['quota']['daily_limit'] - total_quota}")
    print(f"  Runtime: {elapsed:.1f}s")

    errors = [s for s in summaries if s.get("error")]
    if errors:
        print(f"\n  Errors ({len(errors)}):")
        for s in errors:
            print(f"    {s['title']}: {s['error']}")


if __name__ == "__main__":
    main()
