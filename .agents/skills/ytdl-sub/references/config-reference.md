# Configuration File Reference

## Table of Contents

- [Configuration Section](#configuration-section)
- [Custom Presets Section](#custom-presets-section)

## Configuration Section

All fields are optional.

```yaml
configuration:
  working_directory: ".ytdl-sub-working-directory"
  ffmpeg_path: "/usr/bin/ffmpeg"
  ffprobe_path: "/usr/bin/ffprobe"
  file_name_max_bytes: 255
  lock_directory: "/tmp"
  umask: "022"

  dl_aliases:
    mv: "--preset music_video"
    u: "--download.url"

  persist_logs:
    keep_successful_logs: True
    logs_directory: "/var/log/ytdl-sub-logs"

  experimental:
    enable_update_with_info_json: True
```

### Field Reference

| Field | Default | Description |
|-------|---------|-------------|
| `working_directory` | `.ytdl-sub-working-directory` | Temp storage during downloads. Place on same filesystem as output to avoid slow cross-device moves. |
| `ffmpeg_path` | `/usr/bin/ffmpeg` (Linux), `./ffmpeg.exe` (Windows) | Path to ffmpeg |
| `ffprobe_path` | `/usr/bin/ffprobe` (Linux), `./ffprobe.exe` (Windows) | Path to ffprobe |
| `file_name_max_bytes` | 255 | Max file name size in bytes |
| `lock_directory` | `/tmp` | File lock directory (prevents concurrent instances). Must be on local filesystem, not network mount. |
| `umask` | `022` | Octal umask for created files |
| `dl_aliases` | (none) | Shorten `dl` CLI arguments |
| `persist_logs.logs_directory` | (none) | Log output directory |
| `persist_logs.keep_successful_logs` | True | When False, only write logs for failed subscriptions |

### dl_aliases

Simplify one-off `dl` commands:

```yaml
configuration:
  dl_aliases:
    mv: "--preset music_video"
    u: "--download.url"
```

Then: `ytdl-sub dl --mv --u "youtube.com/watch?v=a1b2c3"`

## Custom Presets Section

Define custom presets under the `presets` key. Each preset can contain:

1. **preset** — list of base presets to inherit from
2. **plugin configurations** — direct plugin settings
3. **overrides** — custom variables

```yaml
presets:
  My TV Show:
    preset:
      - "Jellyfin TV Show by Date"
      - "Max 1080p"

    embed_thumbnail: True

    throttle_protection:
      sleep_per_download_s:
        min: 2.2
        max: 10.8
      sleep_per_subscription_s:
        min: 9.0
        max: 14.1
      max_downloads_per_subscription:
        min: 10
        max: 36

    overrides:
      tv_show_directory: "/tv_shows"

  My TV Show Only Recent:
    preset:
      - "My TV Show"
      - "Only Recent"
```

### Inheritance rules

- Later/lower base presets override earlier/higher ones
- For map fields (sub-params): merge-and-append strategy
- For scalar fields: custom preset overwrites base preset value
- Custom presets can inherit from other custom presets

### Windows paths

Use forward slashes or double backslashes:
- `C:/forward/slashes/like/linux` (recommended)
- `C:\\double\\backslash\\paths`
