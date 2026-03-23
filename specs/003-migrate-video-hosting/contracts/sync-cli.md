# Contract: Sync CLI Changes

**Branch**: `003-migrate-video-hosting` | **Date**: 2026-03-23

## sync_downloads (enhanced)

### Command

```bash
uv run python scripts/sync_downloads.py [OPTIONS]
```

### Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--full` | bool | false | Force full rescan (existing behavior) |
| `--limit N` | int | unlimited | Max videos to upload to R2 per run. Does not limit DB sync — only R2 uploads. |
| `--purge` | bool | false | Delete local files after confirmed R2 upload. Opt-in only. |
| `--skip-r2` | bool | false | Skip R2 upload step (DB sync only, useful for testing) |

### Execution Flow

```
1. Scan MEDIA_DIR for .info.json files (existing)
2. Parse metadata, find sibling files (existing)
3. Upsert video rows to Supabase (existing)
4. [NEW] For videos where r2_synced_at IS NULL:
   a. Upload media_path file to R2
   b. Upload thumbnail_path file to R2 (if exists)
   c. Upload subtitle_path file to R2 (if exists)
   d. Upload info.json file to R2
   e. Set r2_synced_at = now() in Supabase
   f. If --purge: delete local files
5. Print summary: synced N to DB, uploaded M to R2, skipped K, failed F
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (all uploads completed or no pending uploads) |
| 1 | Partial failure (some uploads failed, logged individually) |
| 2 | Fatal error (cannot connect to R2 or Supabase) |

### Environment Variables Required

- `R2_ACCOUNT_ID` — Cloudflare account ID
- `R2_ACCESS_KEY_ID` — R2 API token access key
- `R2_SECRET_ACCESS_KEY` — R2 API token secret
- `R2_BUCKET_NAME` — Target bucket name
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase URL (existing)
- `SUPABASE_SECRET_KEY` — Supabase secret (existing)
- `MEDIA_DIRECTORY` — Local media path (existing, default: `E:/Entertainment/PradoTube`)

### Idempotency

- DB upsert: idempotent via `on_conflict="youtube_id"` (existing)
- R2 upload: re-uploading overwrites harmlessly; only attempted for `r2_synced_at IS NULL`
- Purge: only deletes files where `r2_synced_at IS NOT NULL`

## sync_bunny (removed)

The `scripts/sync_bunny.py` script and its `sync-bunny` pyproject entry point are deleted.

## sync_subscriptions (unchanged)

No changes to `scripts/sync_subscriptions.py`.
