# Research: R2 Video Storage Migration

**Branch**: `003-migrate-video-hosting` | **Date**: 2026-03-23

## R1: Python SDK for R2

**Decision**: Use boto3 with S3-compatible endpoint override.

**Rationale**: R2 is fully S3-compatible. boto3 is the standard, well-maintained AWS SDK. No Cloudflare-specific library needed. Replaces `requests` (used by sync_bunny.py) with a purpose-built object storage SDK that handles multipart uploads, retries, and streaming natively.

**Alternatives considered**:
- `requests` with raw S3 REST API — too much manual work (signing, multipart chunking)
- Cloudflare's `wrangler` CLI — not suitable for programmatic Python integration
- `aioboto3` — async unnecessary for a batch sync script

**Configuration**:
```python
boto3.client("s3",
    endpoint_url=f"https://{ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name="auto",
)
```

## R2: Upload Strategy for Large Files

**Decision**: Use `upload_file()` with default TransferConfig (auto-multipart above 8MB).

**Rationale**: `upload_file()` automatically handles multipart uploads for files exceeding 8MB threshold. Default 10 concurrent threads for part uploads. Automatic retry of failed parts. For 500MB+ MP4s, this means ~63 parts at 8MB each — well within the 10,000 part limit.

**Alternatives considered**:
- `put_object()` — limited to ~5GB single-part, no automatic chunking, loads entire file into memory
- Custom multipart with manual part management — unnecessary complexity, boto3 handles this

**Content-Type mapping**: Use `mimetypes.guess_type()` from stdlib. Covers .mp4→video/mp4, .jpg→image/jpeg, .json→application/json, .srt→application/x-subrip. Must set explicitly on every upload — R2 defaults to `application/octet-stream` if omitted.

## R3: Public Access URL Pattern

**Decision**: Use R2 managed public URL (r2.dev subdomain) initially. Configure via `R2_PUBLIC_URL` environment variable so custom domain can be swapped in later without code changes.

**Rationale**: The r2.dev development URL is rate-limited but sufficient for a single-user family app. Custom domain requires a Cloudflare zone, which can be added later. Using an env var for the URL prefix means the switch is a config change, not a code change.

**URL format**: `{R2_PUBLIC_URL}/{media_path}` → e.g., `https://pub-abc123.r2.dev/@funquesters/2026-03/0G7Zj6j9gQE.mp4`

**Alternatives considered**:
- Custom domain from day 1 — adds Cloudflare zone setup to scope, overkill for POC
- Signed URLs — unnecessary for a private family app; public bucket is simpler

## R4: Idempotent Upload Pattern

**Decision**: Check `r2_synced_at IS NULL` in DB to find pending uploads. After successful upload of ALL files for a video, set `r2_synced_at`. If upload fails partway, `r2_synced_at` stays null and retry uploads all files next run.

**Rationale**: The DB timestamp is the single source of truth. R2's `head_object()` could verify existence, but checking the DB is faster and avoids per-object API calls. Re-uploading a file that already exists in R2 is harmless (overwrites are idempotent) and simpler than per-file existence checks.

**Alternatives considered**:
- Per-file tracking (separate r2 status per file type) — over-engineered for the use case
- `head_object()` before each upload — adds latency, one API call per file per video
- Separate upload status table — unnecessary complexity

## R5: Feed Eligibility Change

**Decision**: Replace `is_downloaded = true` feed filter with `r2_synced_at IS NOT NULL`.

**Rationale**: Per clarification, videos should only appear in the feed once they're in R2. The `is_downloaded` flag tracks local filesystem presence; `r2_synced_at` tracks cloud availability. During transition, only R2-synced videos are visible. This is a clean semantic change — "serveable" means "in R2" not "on disk."

**Impact**: Feed API route, video detail API route, and feed scoring all need this filter updated.

## R6: Legacy Route Removal

**Decision**: Delete `/api/media/[...path]` route entirely.

**Rationale**: Per clarification, no local fallback. All media served from R2 public URLs. The proxy route becomes dead code. Removing it eliminates a local file access surface.

**Impact**: Remove `src/app/api/media/[...path]/route.ts`. Update all frontend references from `/api/media/${path}` to `${R2_PUBLIC_URL}/${path}`.

## R7: next/image Remote Patterns

**Decision**: Add R2 public domain to `next.config.ts` `remotePatterns` for thumbnail optimization.

**Rationale**: Thumbnails served from R2 need to go through `next/image` for optimization. The R2 domain must be whitelisted. Initially this is the r2.dev subdomain; when switching to custom domain, update the config.

**Alternative considered**: Skip next/image for R2 thumbnails (use plain `<img>`) — loses optimization benefits.

## R8: Environment Variables

**Decision**: Add the following new environment variables:

| Variable | Purpose | Example |
|----------|---------|---------|
| `R2_ACCOUNT_ID` | Cloudflare account ID for endpoint URL | `abc123def456` |
| `R2_ACCESS_KEY_ID` | R2 API token access key | `AKIAIOSFODNN7EXAMPLE` |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `R2_BUCKET_NAME` | R2 bucket name | `pradotube` |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | Public URL prefix for R2 bucket | `https://pub-abc123.r2.dev` |

**Rationale**: Python scripts need `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` for boto3. Frontend needs `NEXT_PUBLIC_R2_PUBLIC_URL` for URL construction (must be `NEXT_PUBLIC_` prefixed for client-side access in Next.js). Bunny env vars (`BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_API_KEY`) can be removed.
