# Research: HLS Adaptive Streaming Pipeline

**Branch**: `007-hls-streaming` | **Date**: 2026-03-24

## R1: ffmpeg HLS Remux (codec copy)

**Decision**: Use ffmpeg `-c copy` to remux each quality tier's MP4 into HLS fMP4 segments. Generate master playlist manually.

**Rationale**: `-c copy` performs no re-encoding — it just repackages the container. This is near-instant (seconds per file), preserves YouTube's original quality, and requires no GPU. ffmpeg's built-in HLS muxer handles fMP4 segmentation and playlist generation natively.

**Alternatives considered**:
- Bento4 `mp4hls` — Good tool but adds external binary dependency. ffmpeg is already in the pipeline.
- StreamGear (Python library) — Wraps ffmpeg but adds abstraction overhead for no benefit when we need precise control.
- Re-encoding with NVENC — Unnecessary since YouTube already provides pre-encoded H.264 at each quality tier.

### Per-variant remux command

```bash
ffmpeg -i 720p.mp4 \
  -c copy \
  -f hls \
  -hls_time 6 \
  -hls_segment_type fmp4 \
  -hls_fmp4_init_filename init.mp4 \
  -hls_segment_filename "seg_%03d.m4s" \
  -hls_playlist_type vod \
  -hls_flags independent_segments \
  -hls_list_size 0 \
  playlist.m3u8
```

Key flags:
- `-c copy` — no re-encoding, just remux
- `-hls_time 6` — target 6-second segments (actual length varies by keyframe alignment)
- `-hls_segment_type fmp4` — fragmented MP4 segments (modern standard, not legacy .ts)
- `-hls_fmp4_init_filename init.mp4` — initialization segment with codec info
- `-hls_segment_filename` — naming pattern for media segments
- `-hls_playlist_type vod` — marks as VOD (adds `#EXT-X-ENDLIST`)
- `-hls_flags independent_segments` — required for ABR switching between variants
- `-hls_list_size 0` — keep all segments in playlist

ffmpeg automatically sets `#EXT-X-VERSION:7` (required for fMP4) and adds `#EXT-X-MAP:URI="init.mp4"` to reference the initialization segment.

### Keyframe alignment with -c copy

With codec copy, ffmpeg cannot insert new keyframes. `-hls_time 6` becomes a **minimum target** — ffmpeg starts a new segment at the first keyframe at or after the 6-second mark. YouTube typically encodes with 2-second keyframe intervals, so segments will be approximately 6 seconds (3 GOPs each). Variable-length segments are fine — each segment's actual duration is recorded in `#EXTINF` and players use these values.

### Content types for R2 upload

| Extension | Content-Type | Cache-Control |
|-----------|-------------|---------------|
| `.m3u8` | `application/vnd.apple.mpegurl` | `public, max-age=3600` |
| `.m4s` | `video/mp4` | `public, max-age=31536000, immutable` |
| `init.mp4` | `video/mp4` | `public, max-age=31536000, immutable` |

Use `video/mp4` for both `.m4s` and `init.mp4` — universally supported. Segments and init are immutable for VOD (long cache). Playlists get shorter TTL in case of regeneration.

### Master playlist generation

ffmpeg cannot generate a multi-variant master playlist from separate per-variant runs. The master playlist must be generated manually. Format:

```m3u8
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2"
360p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=854x480,CODECS="avc1.4d401f,mp4a.40.2"
480p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"
720p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.64002a,mp4a.40.2"
1080p/playlist.m3u8
```

BANDWIDTH is in bits/sec. RESOLUTION and CODECS are read from ffprobe or yt-dlp info.json for each downloaded tier.

### Content types for R2 upload

| Extension | Content-Type |
|-----------|-------------|
| `.m3u8` | `application/vnd.apple.mpegurl` |
| `.m4s` | `video/iso.segment` |
| `init.mp4` | `video/mp4` |

## R2: yt-dlp Multi-Quality Download Strategy

**Decision**: Download each quality tier as a separate yt-dlp invocation with a height-specific format selector. Download only H.264 (avc1) for maximum compatibility.

**Rationale**: YouTube pre-encodes every video at multiple quality tiers. Downloading each tier directly avoids any local re-encoding. H.264 has universal device support including older iPads and budget Android tablets.

**Alternatives considered**:
- Download 1080p only and re-encode lower tiers locally — Works but wastes time/GPU and introduces generation loss.
- Download AV1 for better compression — Incomplete device support on older kids' tablets. Could revisit later.
- Download VP9 — WebM container, not compatible with HLS fMP4 packaging.

### Format selectors per tier

```python
tiers = [
    {"label": "360p",  "height": 360,  "format": "bv[height<=360][ext=mp4]+ba[ext=m4a]/b[height<=360][ext=mp4]"},
    {"label": "480p",  "height": 480,  "format": "bv[height<=480][ext=mp4]+ba[ext=m4a]/b[height<=480][ext=mp4]"},
    {"label": "720p",  "height": 720,  "format": "bv[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]"},
    {"label": "1080p", "height": 1080, "format": "bv[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]"},
]
```

### Handling missing tiers

Some videos may not have all 4 tiers in H.264 (e.g., a 720p-native video won't have 1080p). Strategy:
1. Attempt download for each tier
2. If yt-dlp returns non-zero (no matching format), skip that tier
3. Minimum 1 tier required to produce an HLS package
4. The master playlist only lists tiers that were successfully downloaded

### Throttle between tier downloads

Apply the same randomized throttle (2-5 seconds from config) between each tier download to avoid YouTube bot detection. For a 4-tier video, this adds ~8-20 seconds of throttle time.

### Sidecar files

Download sidecars (thumbnail, subtitle, info.json) only once — with the highest quality tier download. No need to re-download metadata for each tier.

## R3: hls.js Browser Integration

**Decision**: Use hls.js for Chrome/Firefox with native HLS fallback for Safari/iOS. Detect capability at runtime.

**Rationale**: Safari and iOS natively support HLS — no library needed. Chrome and Firefox don't, but hls.js is the de facto standard (used by most video platforms). It supports fMP4 segments and handles adaptive bitrate switching automatically.

**Alternatives considered**:
- Shaka Player — More features (DASH support, DRM) but heavier and more complex. PradoTube doesn't need DASH or DRM.
- Video.js + HLS plugin — Adds a full player framework. PradoTube already has custom controls.
- dash.js — DASH-only, doesn't help with HLS.

### Detection pattern

```typescript
const isNativeHls = video.canPlayType('application/vnd.apple.mpegurl') !== '';
const isHlsJsSupported = Hls.isSupported();
```

### Integration pattern

```typescript
if (isM3u8Url) {
  if (isNativeHls) {
    // Safari/iOS — just set src directly
    video.src = hlsUrl;
  } else if (isHlsJsSupported) {
    // Chrome/Firefox — use hls.js
    const hls = new Hls({ startLevel: -1 }); // -1 = auto quality
    hls.loadSource(hlsUrl);
    hls.attachMedia(video);
  }
} else {
  // Legacy MP4 fallback
  video.src = mp4Url;
}
```

### Key hls.js config

- `startLevel: -1` — Auto-select initial quality based on bandwidth estimation
- ABR switching is automatic by default (no config needed)
- Supports fMP4 segments natively (EXT-X-MAP initialization segments)
- Package: `hls.js` on npm, current stable ~1.5.x

### Cleanup

hls.js instances must be destroyed when the component unmounts to avoid memory leaks:
```typescript
hls.destroy(); // in cleanup/unmount
```

## R4: R2 CORS Configuration

**Decision**: Configure R2 bucket CORS rules to allow cross-origin GET and HEAD requests with Range header support from the application domain.

**Rationale**: HLS playback requires the browser to make cross-origin range requests to fetch individual segments. Without CORS, these requests fail with 403. The current R2 bucket has no CORS configuration — confirmed by testing (OPTIONS preflight returns 403).

### Required CORS rules

```json
[
  {
    "AllowedOrigins": ["https://pradotube.com", "http://localhost:3000"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range", "Content-Type"],
    "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 86400
  }
]
```

### Application method

Use boto3 S3 API (already in consumer) to set bucket CORS:
```python
r2_client.put_bucket_cors(Bucket=bucket, CORSConfiguration={"CORSRules": [...]})
```

Or use Cloudflare dashboard: R2 → Bucket → Settings → CORS Policy.

This is a one-time configuration, not per-video.

## R5: R2 Key Structure for HLS Packages

**Decision**: Change from flat file keys to folder-per-video structure.

**Rationale**: Each video now produces ~40-200 files (init segments, media segments, playlists per tier, master playlist) instead of 1 MP4. A folder structure keeps them organized and enables easy cleanup.

### Current structure (MP4)

```
@handle/YYYY-MM/video_id.mp4
@handle/YYYY-MM/video_id.jpg
@handle/YYYY-MM/video_id.en.vtt
```

### New structure (HLS)

```
@handle/YYYY-MM/video_id/
  master.m3u8
  360p/
    init.mp4
    playlist.m3u8
    seg_000.m4s
    seg_001.m4s
    ...
  480p/
    init.mp4
    playlist.m3u8
    seg_000.m4s
    ...
  720p/
    ...
  1080p/
    ...
  thumb.jpg
  subs.en.vtt
```

### media_path column

Changes from `@handle/YYYY-MM/video_id.mp4` to `@handle/YYYY-MM/video_id/master.m3u8`.

The player detects HLS vs MP4 by checking if `media_path` ends in `.m3u8` vs `.mp4`.

## R6: Backward Compatibility

**Decision**: The player checks the `media_path` extension to determine playback mode. No database migration needed — the column type stays the same, just the value changes.

**Rationale**: ~157 videos already synced as MP4. These must continue working during migration. New consumer runs produce HLS packages with `.m3u8` paths. The frontend handles both.

### Detection logic

```typescript
const isHls = mediaPath.endsWith('.m3u8');
```

- If `.m3u8` → HLS playback path (native or hls.js)
- If `.mp4` → Progressive MP4 (current behavior, unchanged)

### Re-processing existing videos

When the producer re-queues an existing video, the consumer:
1. Downloads 4 tiers + produces HLS package
2. Uploads HLS package to R2
3. Updates `media_path` to point to `master.m3u8`
4. Deletes the old `.mp4` from R2 to reclaim storage

### No schema migration needed

The `media_path` column is already `text` — it just stores a different string value. The `r2_synced_at` gate continues to work as-is.
