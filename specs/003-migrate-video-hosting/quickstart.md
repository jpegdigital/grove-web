# Quickstart: R2 Video Storage Migration

**Branch**: `003-migrate-video-hosting` | **Date**: 2026-03-23

## Prerequisites

1. **Cloudflare R2 bucket** created and public access enabled (r2.dev URL)
2. **R2 API token** with Object Read & Write permissions
3. **Environment variables** set in `.env.local`:
   ```
   R2_ACCOUNT_ID=your_cloudflare_account_id
   R2_ACCESS_KEY_ID=your_r2_access_key
   R2_SECRET_ACCESS_KEY=your_r2_secret_key
   R2_BUCKET_NAME=pradotube
   NEXT_PUBLIC_R2_PUBLIC_URL=https://pub-xxxxx.r2.dev
   ```

## Migration Steps

### 1. Apply database migration

```bash
# Via Supabase MCP or dashboard — replaces Bunny columns with r2_synced_at
```

### 2. Install new Python dependency

```bash
uv add boto3
```

### 3. Run initial backfill (throttled)

```bash
# Upload first batch of 50 videos
uv run python scripts/sync_downloads.py --limit 50

# Repeat until all videos are synced
uv run python scripts/sync_downloads.py --limit 50
```

### 4. Verify

- Check feed loads at `http://localhost:3000/feed`
- Videos should appear as they get R2-synced (incrementally)
- Play a video — should load from R2 public URL
- Check browser network tab — media requests go to r2.dev domain

### 5. Ongoing workflow (unchanged command)

```bash
# Same as before — now includes R2 upload automatically
uv run python scripts/sync_downloads.py
```

## Rollback

If issues arise:
1. Re-add `/api/media/[...path]` route from git history
2. Change feed filter back to `is_downloaded = true`
3. R2 data is inert — no need to clean up bucket immediately
