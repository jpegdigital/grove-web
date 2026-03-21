# Automation and Troubleshooting

## Table of Contents

- [Automation](#automation)
- [Troubleshooting](#troubleshooting)
- [Deprecation Notices](#deprecation-notices)

## Automation

### Docker / Unraid

Set `CRON_SCHEDULE` environment variable:

```yaml
# compose.yaml
services:
  ytdl-sub:
    environment:
      CRON_SCHEDULE: "0 */6 * * *"
```

- Cron output written to `/config/ytdl-sub-configs/.cron.log`
- Default cron script generated at `/config/ytdl-sub-configs/cron` on first start
- Optional `CRON_RUN_ON_START: true` runs on every container start (risk of throttling — runs on reboot, Docker restart, image pull, etc.)

### Linux / macOS / BSD (cron)

```bash
#!/bin/bash
cd "~/.config/ytdl-sub/"
~/.local/bin/ytdl-sub sub |& tee -a "~/.local/state/ytdl-sub/.cron.log"
```

```bash
echo "0 */6 * * * ${HOME}/.local/bin/ytdl-sub-cron" | crontab "-"
```

### Windows (Task Scheduler)

1. Open Task Scheduler
2. Create Basic Task
3. Set schedule
4. Action: Start a program
5. Browse to `ytdl-sub.exe`
6. Add arguments: `sub` (or `--dry-run sub` for testing)
7. Set "Start in" to directory containing config

## Troubleshooting

### Not downloading / downloading at 360p / downloads 2-4 then fails

Usually throttling by the external service. See `_throttle_protection` preset configuration. Increase sleep times, reduce max downloads per subscription.

### break_on_existing prevents older downloads after date_range change

Set `break_on_existing: False` temporarily:

```yaml
ytdl_options:
  break_on_existing: False
```

Re-enable after downloading the new range.

### Non-English metadata

Force English metadata from YouTube:

```yaml
ytdl_options:
  extractor_args:
    youtube:
      lang:
        - "en"
```

### Force re-download

1. Rename/move the downloaded files
2. Ensure ytdl-sub is not running
3. Edit `.ytdl-sub-...-download-archive.json` — remove the entry
4. Run with `break_on_existing: False` and appropriate `date_range`:

```bash
ytdl-sub --match="NOVA PBS" sub -o "--ytdl_options.break_on_existing False --date_range.after 20240101 --date_range.before 20250101"
```

### Resolution assert error on low-quality video

Either disable resolution assert or ignore specific titles:

```yaml
overrides:
  enable_resolution_assert: false
  # OR per-subscription:
  resolution_assert_ignore_titles:
    - "Known 360p Video Title"
```

### Plex not showing TV shows correctly

1. Library settings: Scanner = "Plex Series Scanner", Agent = "Personal Media shows"
2. Enable video preview thumbnails
3. Under Settings > Agents, confirm "Local Media Assets" is enabled for Personal Media Shows/Movies

### Age-restricted YouTube videos

Export cookies and configure:

```yaml
ytdl_options:
  cookiefile: "/path/to/cookies/file.txt"
```

## Deprecation Notices

### Dec 2025

Override variable names can no longer match plugin names. Replace `date_range` override with `only_recent_date_range`.

### Sep 2024

Regex plugin removed. Use `%regex_capture_many()` scripting function instead:

```yaml
overrides:
  captured_title: >-
    { %regex_capture_many(title, [ ".*? - (.*)" ], [ title ]) }
  track_title: "{%array_at(captured_title, 1)}"
```

### July 2023

`music_tags` and `video_tags` simplified — `tags` now lives directly under plugin key. `embed_thumbnail` moved to its own plugin.
