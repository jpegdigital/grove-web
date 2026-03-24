# Quickstart: Scored Multi-Source Video Discovery

## Prerequisites

- YouTube Data API key with sufficient quota (~5,500 units for a full run)
- Supabase project with `videos`, `curated_channels`, `sync_queue` tables
- Python 3.10+ with `uv` package manager

## Usage

### Daily run (recent only — cheap, ~326 quota)
```bash
uv run python scripts/sync_producer.py --mode recent
```

### Weekly run (full — popular + rated + recent, ~5,500 quota)
```bash
uv run python scripts/sync_producer.py --mode full
```

### Preview without writing
```bash
uv run python scripts/sync_producer.py --mode full --dry-run --verbose
```

### Single channel test
```bash
uv run python scripts/sync_producer.py --mode full --channel UC... --dry-run
```

## Configuration

All tunables in `config/producer.yaml`:

```yaml
producer:
  max_videos_per_channel: 250
  min_duration_seconds: 300
  default_date_range: "today-6months"

scoring:
  weights:
    popularity: 0.35
    engagement: 0.35
    freshness: 0.30
  freshness_half_life_days: 90

sources:
  popular:
    min_percentage: 0.20
    duration_floor: 60
  rated:
    min_percentage: 0.20
    duration_floor: 60
```

## Per-channel overrides (in DB)

| Column | Table | Effect |
|--------|-------|--------|
| `date_range_override` | curated_channels | Wider/narrower date window for recent source |
| `min_duration_override` | curated_channels | Custom duration floor for recent source |

## Cron schedule (example)

```
# Daily: recent-only at 2am
0 2 * * * uv run python scripts/sync_producer.py --mode recent

# Weekly: full discovery on Sundays at 3am
0 3 * * 0 uv run python scripts/sync_producer.py --mode full
```
