# Prebuilt Presets Reference

## Table of Contents

- [TV Show by Date](#tv-show-by-date)
- [TV Show Collection](#tv-show-collection)
- [Quality Presets](#quality-presets)
- [Helper Presets](#helper-presets)
- [_episode_base Reference](#_episode_base-reference)

## TV Show by Date

Organizes a YouTube channel/playlist as a TV show with seasons by upload date.

**Available presets:** `Kodi TV Show by Date`, `Jellyfin TV Show by Date`, `Emby TV Show by Date`, `Plex TV Show by Date`

**Required override:** `tv_show_directory`

### Player differences

- **Kodi**: Jellyfin features + kodi_safe NFOs (replaces 4-byte unicode with placeholder)
- **Jellyfin**: Season poster art in main show folder, NFO tags
- **Emby**: Same as Jellyfin + `season.nfo` per named season
- **Plex**: Special number sanitization (prevents Plex misreading numbers as episode numbers), mp4 conversion, season art in season folder

### Season/episode ordering

```yaml
overrides:
  tv_show_by_date_season_ordering: "upload-year"       # default
  tv_show_by_date_episode_ordering: "upload-month-day"  # default
```

**Season ordering options:**
- `upload-year` (default)
- `upload-year-month`
- `release-year`
- `release-year-month`

**Episode ordering options:**
- `upload-month-day` (default)
- `upload-month-day-reversed` (recent episodes get lower values, appear at top)
- `upload-day`
- `release-day`
- `release-month-day`
- `release-month-day-reversed`
- `download-index` (numbered by download order; don't use if removing old videos)

Combined season + episode ordering must include year, month, day (e.g. `upload-year` + `upload-month-day`).

### Override variables

| Variable | Default | Description |
|----------|---------|-------------|
| `tv_show_directory` | (required) | Base output directory |
| `tv_show_name` | `{subscription_name}` | Show name |
| `tv_show_genre` | `{subscription_indent_1}` | Genre tag |
| `tv_show_content_rating` | `{subscription_indent_2}` | Content rating tag |
| `episode_title` | `{episode_date_standardized} - {title}` | Episode title |
| `episode_plot` | `{webpage_url}\n\n{description}` | Episode description |
| `season_directory_name` | `Season {season_number_padded}` | Season folder name |
| `episode_file_name` | `s{season_number_padded}.e{episode_number_padded} - {file_title}` | Episode file name |
| `tv_show_date_range_type` | `upload_date` | Date type for Only Recent |

### Removing date from episode title

```yaml
overrides:
  episode_title: "{title}"
```

### Disabling images

```yaml
overrides:
  tv_show_fanart_file_name: ""
  tv_show_poster_file_name: ""
  thumbnail_name: ""
```

### Disabling NFO files

```yaml
nfo_tags:
  enabled: False
```

## TV Show Collection

Each URL becomes its own season. Supports up to 40 seasons with 11 URLs per season.

**Available presets:** `Kodi TV Show Collection`, `Jellyfin TV Show Collection`, `Emby TV Show Collection`, `Plex TV Show Collection`

**Required override:** `tv_show_directory`

### Season definition format

```yaml
"~Beyond the Guitar":
  s00_name: "Specials"
  s00_url:
    - "https://www.youtube.com/watch?v=vXzguOdulAI"
    - "https://www.youtube.com/watch?v=IGwYDvaGAz0"
  s01_name: "Videos"
  s01_url:
    - "https://www.youtube.com/c/BeyondTheGuitar"
    - "https://www.youtube.com/@BeyondTheGuitarAcademy"
  s02_name: "Covers"
  s02_url: "https://www.youtube.com/playlist?list=PLE62gWlWZk5NWVAVuf0Lm9jdv_-_KXs0W"
```

- Poster info pulled from first URL in s01
- Duplicate videos across URLs download once (attributed to highest season number)
- Individual seasons support single and multi URL
- s00 supported for specials

### Episode ordering

```yaml
overrides:
  tv_show_collection_episode_ordering: "upload-year-month-day"  # default
```

Options: `upload-year-month-day`, `upload-year-month-day-reversed`, `release-year-month-day`, `release-year-month-day-reversed`, `playlist-index`, `playlist-index-reversed`

## Quality Presets

### Video

| Preset | Format string |
|--------|--------------|
| `Best Video Quality` / `Max Video Quality` | `bestvideo+bestaudio/best` (mp4) |
| `Max 2160p` | `bv*[height<=2160]+bestaudio/best[height<=2160]` (mp4) |
| `Max 1440p` | `bv*[height<=1440]+bestaudio/best[height<=1440]` (mp4) |
| `Max 1080p` | `bv*[height<=1080]+bestaudio/best[height<=1080]` (mp4) |
| `Max 720p` | `bv*[height<=720]+bestaudio/best[height<=720]` (mp4) |
| `Max 480p` | `bv*[height<=480]+bestaudio/best[height<=480]` (mp4) |

### Audio

| Preset | Codec | Quality |
|--------|-------|---------|
| `Max Audio Quality` | best | 0 (best) |
| `Max MP3 Quality` | mp3 | 0 (best) |
| `Max Opus Quality` | opus | 0 (best) |
| `MP3 320k` | mp3 | 320 |
| `MP3 128k` | mp3 | 128 |

## Helper Presets

### Only Recent / Only Recent Archive

Downloads only videos within a date range. `Only Recent` auto-deletes older files; `Only Recent Archive` keeps them.

```yaml
overrides:
  only_recent_date_range: "2months"  # default (supports: Xdays, Xmonths, etc.)
  only_recent_max_files: 0           # 0 = unlimited; set non-zero to cap file count
```

### Chunk Downloads

Downloads oldest-first in batches. Use for large channels to avoid long metadata scrapes.

```yaml
overrides:
  chunk_max_downloads: 20  # default
```

Remove this preset after the full channel is downloaded.

### Filter Keywords

Include/exclude by title or description keywords (case-insensitive).

```yaml
overrides:
  title_include_keywords: "{ [] }"         # array of strings
  title_exclude_keywords: "{ [] }"
  description_include_keywords: "{ [] }"
  description_exclude_keywords: "{ [] }"
  title_include_eval: "ANY"                # ANY or ALL
  title_exclude_eval: "ANY"
  description_include_eval: "ANY"
  description_exclude_eval: "ANY"
```

### Filter Duration

Include/exclude by duration in seconds.

```yaml
overrides:
  filter_duration_min_s: 0
  filter_duration_max_s: 4294967296
```

### _throttle_protection

Included by default in all prebuilt presets. Configures sleep intervals and max downloads per subscription.

```yaml
overrides:
  enable_throttle_protection: false          # disable entirely
  enable_resolution_assert: false            # disable 360p quality check
  resolution_assert_height_gte: 720          # custom minimum height
  resolution_assert_ignore_titles:
    - "Known Low Quality Video Title"
```

## _episode_base Reference

All TV show presets inherit from this base. Defines output layout, file naming, and core override variables.

```yaml
output_options:
  output_directory: "{tv_show_directory}/{tv_show_name_sanitized}"
  file_name: "{episode_file_path}.{ext}"
  thumbnail_name: "{thumbnail_file_name}"
  info_json_name: "{episode_file_path}.{info_json_ext}"
  maintain_download_archive: True

ytdl_options:
  break_on_existing: True

chapters:
  embed_chapters: True
```
