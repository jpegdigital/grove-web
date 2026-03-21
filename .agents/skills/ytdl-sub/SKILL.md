---
name: ytdl-sub
description: Configure and run ytdl-sub, a CLI tool wrapping yt-dlp that downloads media from YouTube and other services and organizes it for media servers (Jellyfin, Plex, Emby, Kodi) and music players. Use when writing ytdl-sub config.yaml files, subscription YAML files, creating custom presets, running ytdl-sub CLI commands (sub, dl, view), setting up automation (cron, Docker, Task Scheduler), troubleshooting downloads, or working with ytdl-sub's scripting/variable system.
---

# ytdl-sub

ytdl-sub wraps yt-dlp to download media and organize it into media libraries via declarative YAML configuration. Subscriptions use presets, presets configure plugins, plugins do the work.

## CLI Usage

```
ytdl-sub [GENERAL OPTIONS] {sub,dl,view,cli-to-sub} [COMMAND OPTIONS]
```

General options (before subcommand):
- `-c, --config PATH` config file (default: `config.yaml`)
- `-d, --dry-run` preview only, no downloads or file writes
- `-l quiet|info|verbose|debug` log level (default: verbose)
- `-m MATCH` only run subscriptions whose names match substring
- `-t PATH` transaction log output path
- `-nc` suppress colors

### sub (subscriptions)

```
ytdl-sub sub [SUBPATH ...]
```

Process subscription files (default: `./subscriptions.yaml`). Options:
- `-u` update with info.json files
- `-o DL_OVERRIDE` override config values using dl syntax, e.g. `-o '--ytdl_options.max_downloads 3'`

### dl (one-off download)

```
ytdl-sub dl --preset "preset_name" --overrides.url "https://..." --overrides.key "value"
```

YAML indents become dots. Useful for single downloads without a subscription file.

### view (inspect variables)

```
ytdl-sub view [-sc] [URL]
```

Preview source variables for a URL. Use `-sc` for chapter-split view.

## Config File (config.yaml)

Two top-level sections:

```yaml
configuration:
  working_directory: ".ytdl-sub-working-directory"

presets:
  My Custom Preset:
    preset:
      - "Jellyfin TV Show by Date"
      - "Max 1080p"
    embed_thumbnail: True
    throttle_protection:
      sleep_per_download_s:
        min: 2.2
        max: 10.8
    overrides:
      tv_show_directory: "/tv_shows"
```

- `configuration` sets app-level options (working_directory, ffmpeg_path, etc.)
- `presets` defines custom presets that inherit from prebuilt or other custom presets
- Preset inheritance: later/lower base presets override earlier/higher ones
- See [references/config-reference.md](references/config-reference.md) for all configuration options

## Subscription Files

Subscriptions define what to download. The most nested key with URLs is the subscription; ancestor keys define shared presets and overrides.

```yaml
__preset__:
  overrides:
    tv_show_directory: "/tv_shows"

Plex TV Show by Date:
  = Documentaries:
    "NOVA PBS": "https://www.youtube.com/@novapbs"
    "National Geographic": "https://www.youtube.com/@NatGeo"

  = Kids | = TV-Y:
    "Jake Trains": "https://www.youtube.com/@JakeTrains"
```

### Special syntax

| Syntax | Purpose | Example |
|--------|---------|---------|
| `= Value` | Set `subscription_indent_i` variables (genre, rating) | `= Documentaries` |
| `\|` (pipe) | Combine multiple presets or values on one key | `Plex TV Show by Date \| Max 1080p` |
| `~` (tilda) | Set override variables directly under subscription | `"~My Sub":` then `url:`, `key: value` |
| `+` (plus) | Map-mode subscription | `+ My Sub:` with nested map |
| `__preset__` | File-level preset applied to all subscriptions | Top of subscription file |

### Tilda mode example

```yaml
Plex TV Show by Date | Filter Keywords:
  = Documentaries:
    "~NOVA PBS":
      url: "https://www.youtube.com/@novapbs"
      title_exclude_keywords:
        - "preview"
        - "trailer"
```

### Multi-URL subscriptions

```yaml
"Rick Beato":
  - "https://www.youtube.com/@RickBeato"
  - "https://www.youtube.com/@rickbeato240"
```

## Prebuilt Presets

### TV Show presets

Each available for Kodi, Jellyfin, Emby, Plex:
- **TV Show by Date** — seasons/episodes by upload date. Requires `tv_show_directory`.
- **TV Show Collection** — each URL is its own season. Uses `s01_name`, `s01_url`, etc.

### Quality presets

Video: `Best Video Quality`, `Max 2160p`, `Max 1440p`, `Max 1080p`, `Max 720p`, `Max 480p`
Audio: `Max Audio Quality`, `Max MP3 Quality`, `Max Opus Quality`, `MP3 320k`, `MP3 128k`

### Helper presets

- **Only Recent** — keep only recent videos by date range; auto-deletes older. Key overrides: `only_recent_date_range`, `only_recent_max_files`
- **Only Recent Archive** — same but no deletion
- **Chunk Downloads** — download oldest-first in batches. Override: `chunk_max_downloads` (default 20)
- **Filter Keywords** — include/exclude by title/description keywords
- **Filter Duration** — include/exclude by duration (`filter_duration_min_s`, `filter_duration_max_s`)

Apply helpers via pipes: `Plex TV Show by Date | Only Recent | Max 1080p`

See [references/presets.md](references/presets.md) for full preset reference including override variables and advanced usage.

## Variables and Scripting

Use `{variable_name}` in any field that supports formatters. Append `_sanitized` for filesystem-safe values.

Key variable categories:
- **Entry**: `title`, `channel`, `description`, `duration`, `upload_date`, `ext`, `webpage_url`
- **Playlist**: `playlist_title`, `playlist_index`, `playlist_count`
- **Static**: `subscription_name`, `subscription_value`, `subscription_indent_1`
- **Override**: custom variables defined in `overrides` section

Scripting functions use `%function_name(args)` syntax inside curly braces:

```yaml
overrides:
  custom_title: >-
    { %replace(title, " ", "_") }
```

Custom functions:

```yaml
overrides:
  "%get_field": >-
    { %map_get(entry_metadata, $0, null) }
  artist: >-
    { get_field("artist") }
```

Use `>-` for multi-line scripting definitions. See [references/variables-and-scripting.md](references/variables-and-scripting.md) for complete variable and function reference.

## Throttle Protection

Prebuilt presets include `_throttle_protection` by default. Key overrides:

```yaml
overrides:
  enable_throttle_protection: false       # disable entirely
  enable_resolution_assert: false         # disable 360p quality check
  resolution_assert_height_gte: 720       # custom minimum height
```

To ignore low-quality titles specifically:

```yaml
"~My Subscription":
  url: "https://youtube.com/@channel"
  resolution_assert_ignore_titles:
    - "This Known 360p Video Title"
```

## Common Patterns

### YouTube channel as TV show (Plex)

```yaml
# subscriptions.yaml
__preset__:
  overrides:
    tv_show_directory: "/tv_shows"

Plex TV Show by Date | Max 1080p:
  = Documentaries | Chunk Downloads:
    "NOVA PBS": "https://www.youtube.com/@novapbs"
  = Documentaries:
    "Cosmos - What If": "https://www.youtube.com/playlist?list=PLZdXRHYAVxTJno6oFF9nLGuwXNGYHmE8U"
```

### Only keep recent videos

```yaml
Plex TV Show by Date | Only Recent:
  = News:
    "BBC News": "https://www.youtube.com/@BBCNews"
```

With overrides:
```yaml
__preset__:
  overrides:
    only_recent_date_range: "7days"
    only_recent_max_files: 0
```

### TV Show Collection (playlists as seasons)

```yaml
Plex TV Show Collection:
  = Music:
    "~Beyond the Guitar":
      s01_name: "Videos"
      s01_url: "https://www.youtube.com/c/BeyondTheGuitar"
      s02_name: "Covers"
      s02_url: "https://www.youtube.com/playlist?list=PLE62gWlWZk5NWVAVuf0Lm9jdv_-_KXs0W"
```

### Age-restricted content

```yaml
ytdl_options:
  cookiefile: "/path/to/cookies/file.txt"
```

## Automation

See [references/automation-and-troubleshooting.md](references/automation-and-troubleshooting.md) for Docker, cron, and Task Scheduler setup.

## Asset Templates

Starter configs are available at:
- [assets/config-template.yaml](assets/config-template.yaml)
- [assets/subscriptions-template.yaml](assets/subscriptions-template.yaml)

Copy and customize these as a starting point.

## Important Notes

- Windows paths: use `C:/forward/slashes` or `C:\\double\\backslashes` in YAML
- Always use `--dry-run` first to preview changes before downloading
- Use `Chunk Downloads` for large channels to avoid long metadata scrapes
- Remove `Chunk Downloads` after full channel download; `break_on_existing` handles incremental updates
- Override variable names cannot be plugin names (e.g. don't name an override `date_range`)
- The `date_range` override variable is deprecated; use `only_recent_date_range` instead
