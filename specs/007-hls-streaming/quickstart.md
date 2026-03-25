# Quickstart: HLS Adaptive Streaming Pipeline

**Branch**: `007-hls-streaming` | **Date**: 2026-03-24

## Prerequisites

- ffmpeg installed and on PATH (verify: `ffmpeg -version`)
- Node.js + npm (for frontend hls.js dependency)
- Existing consumer pipeline working (yt-dlp, R2 credentials, Supabase)
- R2 bucket CORS configured (one-time setup)

## One-time R2 CORS Setup

Configure via Cloudflare dashboard or boto3:

```bash
# Via Python (using existing R2 credentials)
uv run python -c "
import boto3, os
client = boto3.client('s3',
    endpoint_url=f'https://{os.environ[\"R2_ACCOUNT_ID\"]}.r2.cloudflarestorage.com',
    aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
    aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
    region_name='auto')
client.put_bucket_cors(Bucket=os.environ['R2_BUCKET_NAME'], CORSConfiguration={'CORSRules': [{
    'AllowedOrigins': ['https://pradotube.com', 'http://localhost:3000'],
    'AllowedMethods': ['GET', 'HEAD'],
    'AllowedHeaders': ['Range', 'Content-Type'],
    'ExposeHeaders': ['Content-Length', 'Content-Range', 'Accept-Ranges'],
    'MaxAgeSeconds': 86400
}]})
print('CORS configured')
"
```

## Install Frontend Dependency

```bash
npm install hls.js
```

## Consumer Usage (unchanged CLI)

```bash
# Process next 50 jobs (now produces HLS packages instead of single MP4s)
uv run python scripts/sync_consumer.py --limit 50 --verbose

# Dry run to preview
uv run python scripts/sync_consumer.py --limit 1 --dry-run --verbose
```

## Verify HLS Package

After a successful consumer run, verify the output:

```bash
# Check master playlist is accessible
curl -s "https://pub-922fb2b3daa44d588434426b88e4555f.r2.dev/@handle/YYYY-MM/video_id/master.m3u8"

# Should return m3u8 content with #EXT-X-STREAM-INF entries for each tier
```

## Local Development

```bash
npm run dev
# Navigate to http://localhost:3000/v/[video_id]
# Video should play via HLS with adaptive quality switching
```

## Testing Adaptive Playback

1. Open browser DevTools → Network tab
2. Play a video
3. Observe segment requests (`.m4s` files) being loaded incrementally
4. Throttle network (DevTools → Network → Slow 3G) — quality should drop to 360p
5. Remove throttle — quality should ramp back up to 1080p
