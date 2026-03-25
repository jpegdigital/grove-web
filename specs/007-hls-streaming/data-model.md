# Data Model: HLS Adaptive Streaming Pipeline

**Branch**: `007-hls-streaming` | **Date**: 2026-03-24

## Entity Changes

### videos (existing table — modified columns)

No new columns needed. The existing `media_path` column changes semantics:

| Column | Type | Current Value | New Value (HLS) |
|--------|------|---------------|-----------------|
| `media_path` | text | `@handle/YYYY-MM/video_id.mp4` | `@handle/YYYY-MM/video_id/master.m3u8` |
| `thumbnail_path` | text | `@handle/YYYY-MM/video_id.jpg` | `@handle/YYYY-MM/video_id/thumb.jpg` |
| `subtitle_path` | text | `@handle/YYYY-MM/video_id.en.vtt` | `@handle/YYYY-MM/video_id/subs.en.vtt` |

The `r2_synced_at` column continues to gate feed visibility — set after the complete HLS package is uploaded.

**Backward compatibility**: Legacy rows with `.mp4` in `media_path` continue to work. The frontend detects format by file extension.

### R2 Object Storage (new structure)

Each HLS-processed video produces a folder of objects in R2:

```
@handle/YYYY-MM/video_id/
├── master.m3u8              # Master playlist (entry point)
├── 360p/
│   ├── init.mp4             # fMP4 initialization segment
│   ├── playlist.m3u8        # Variant playlist
│   ├── seg_000.m4s          # Media segment 0
│   ├── seg_001.m4s          # Media segment 1
│   └── ...
├── 480p/
│   ├── init.mp4
│   ├── playlist.m3u8
│   └── seg_*.m4s
├── 720p/
│   ├── init.mp4
│   ├── playlist.m3u8
│   └── seg_*.m4s
├── 1080p/
│   ├── init.mp4
│   ├── playlist.m3u8
│   └── seg_*.m4s
├── thumb.jpg                # Thumbnail
└── subs.en.vtt              # Subtitles (English)
```

**Object count per video**: ~40-200 depending on video duration (6-second segments).

### Consumer Config (config/consumer.yaml — new section)

```yaml
hls:
  # Quality tiers to download and package
  tiers:
    - label: "360p"
      height: 360
      bandwidth: 800000     # bits/sec for master playlist
    - label: "480p"
      height: 480
      bandwidth: 1200000
    - label: "720p"
      height: 720
      bandwidth: 2500000
    - label: "1080p"
      height: 1080
      bandwidth: 5000000

  # HLS segment duration target (seconds)
  segment_duration: 6

  # Segment format: fmp4 (modern) or mpegts (legacy)
  segment_type: fmp4

  # Minimum tiers required to produce a valid HLS package
  min_tiers: 1
```

## State Transitions

### Download Job Lifecycle (enhanced)

```
pending → processing → [download 4 tiers] → [remux to HLS] → [upload to R2] → completed
                    ↘ failed (if < min_tiers downloaded)
                    ↘ failed (if ffmpeg remux fails for all tiers)
                    ↘ failed (if R2 upload fails)
```

The job remains atomic — either the full HLS package is uploaded and the record updated, or the job fails and is retried.

### Media Path Format Detection

```
media_path ends with .m3u8  →  HLS playback (adaptive streaming)
media_path ends with .mp4   →  Progressive MP4 playback (legacy fallback)
media_path is null           →  Video not synced (hidden from feed)
```

## Relationships

No new foreign keys or table relationships. The existing `videos → channels → curated_channels → creators` chain is unchanged. HLS is purely a storage/delivery concern — the data model impact is minimal.
