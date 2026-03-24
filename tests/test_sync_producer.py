"""Tests for sync_producer.py — rule application, diff logic, date range parsing."""

import pytest
from datetime import datetime, timezone
from dateutil.relativedelta import relativedelta

# Import functions under test
from scripts.sync_producer import apply_rules, compute_diff, parse_date_range_override, parse_iso_duration


# ─── T012: apply_rules tests ────────────────────────────────────────────────

class TestApplyRules:
    """Parametrized tests for apply_rules()."""

    @pytest.fixture
    def date_cutoff(self):
        return datetime(2025, 1, 1, tzinfo=timezone.utc)

    @pytest.mark.parametrize(
        "give, want, id",
        [
            # Shorts excluded (< 60s)
            (
                [{"video_id": "v1", "duration_seconds": 30, "published_at": "2025-06-01T00:00:00Z"}],
                [],
                "video_under_60s_excluded",
            ),
            # Under min duration excluded (< 300s but >= 60s)
            (
                [{"video_id": "v2", "duration_seconds": 120, "published_at": "2025-06-01T00:00:00Z"}],
                [],
                "video_under_300s_excluded",
            ),
            # Over min duration included
            (
                [{"video_id": "v3", "duration_seconds": 600, "published_at": "2025-06-01T00:00:00Z"}],
                ["v3"],
                "video_over_300s_included",
            ),
            # Before date cutoff excluded
            (
                [{"video_id": "v4", "duration_seconds": 600, "published_at": "2024-06-01T00:00:00Z"}],
                [],
                "video_before_cutoff_excluded",
            ),
            # After date cutoff included
            (
                [{"video_id": "v5", "duration_seconds": 600, "published_at": "2025-06-01T00:00:00Z"}],
                ["v5"],
                "video_after_cutoff_included",
            ),
        ],
        ids=lambda x: x if isinstance(x, str) else "",
    )
    def test_apply_rules(self, give, want, id, date_cutoff):
        result = apply_rules(give, min_duration_s=300, date_cutoff=date_cutoff)
        result_ids = [v["video_id"] for v in result]
        assert result_ids == want, f"[{id}] expected {want}, got {result_ids}"


# ─── T013: compute_diff tests ───────────────────────────────────────────────

class TestComputeDiff:
    """Parametrized tests for compute_diff()."""

    @pytest.mark.parametrize(
        "give_desired, give_existing, want_download, want_remove, id",
        [
            # New video → download
            ({"v1", "v2"}, {"v1"}, {"v2"}, set(), "new_video_download"),
            # Existing video → no action
            ({"v1"}, {"v1"}, set(), set(), "existing_no_action"),
            # Video in DB but not desired → remove
            ({"v1"}, {"v1", "v2"}, set(), {"v2"}, "old_video_remove"),
            # Mix of all
            (
                {"v1", "v3"},
                {"v1", "v2"},
                {"v3"},
                {"v2"},
                "mixed_download_and_remove",
            ),
            # Empty sets
            (set(), set(), set(), set(), "empty_sets"),
        ],
        ids=lambda x: x if isinstance(x, str) else "",
    )
    def test_compute_diff(self, give_desired, give_existing, want_download, want_remove, id):
        to_download, to_remove = compute_diff(give_desired, give_existing)
        assert to_download == want_download, f"[{id}] downloads: expected {want_download}, got {to_download}"
        assert to_remove == want_remove, f"[{id}] removals: expected {want_remove}, got {to_remove}"


# ─── T014: parse_date_range_override tests ──────────────────────────────────

class TestParseDateRangeOverride:
    """Parametrized tests for parse_date_range_override()."""

    @pytest.mark.parametrize(
        "give, want_description, id",
        [
            ("today-6months", "6 months ago", "default_6months"),
            ("today-2years", "2 years ago", "two_years"),
            ("today-1years", "1 year ago", "one_year"),
            ("19700101", "1970-01-01", "absolute_epoch"),
            (None, "6 months ago (default)", "none_default"),
        ],
        ids=lambda x: x if isinstance(x, str) else "",
    )
    def test_parse_date_range_override(self, give, want_description, id):
        result = parse_date_range_override(give)
        now = datetime.now(timezone.utc)

        assert result.tzinfo is not None, f"[{id}] result must be timezone-aware"

        if give == "19700101":
            assert result.year == 1970 and result.month == 1 and result.day == 1
        elif give == "today-2years":
            expected = now - relativedelta(years=2)
            assert abs((result - expected).total_seconds()) < 2
        elif give == "today-1years":
            expected = now - relativedelta(years=1)
            assert abs((result - expected).total_seconds()) < 2
        else:
            # Default or explicit 6 months
            expected = now - relativedelta(months=6)
            assert abs((result - expected).total_seconds()) < 2


# ─── T008: parse_iso_duration tests ─────────────────────────────────────────

class TestParseIsoDuration:
    """Tests for parse_iso_duration()."""

    @pytest.mark.parametrize(
        "give, want",
        [
            ("PT3M45S", 225),
            ("PT1H2M3S", 3723),
            ("PT10M", 600),
            ("PT30S", 30),
            ("PT1H", 3600),
            ("", 0),
            ("P1D", 0),  # Days not supported, returns 0
        ],
    )
    def test_parse_iso_duration(self, give, want):
        assert parse_iso_duration(give) == want


# ─── T020: orphaned channel detection tests ─────────────────────────────────

class TestOrphanedChannelDetection:
    """Unit tests for orphaned channel logic (set operations)."""

    @pytest.mark.parametrize(
        "all_video_channels, curated_ids, want_orphaned, id",
        [
            # Channel in curated → not orphaned
            ({"UC1", "UC2"}, {"UC1", "UC2"}, set(), "all_curated"),
            # Channel with videos but not curated → orphaned
            ({"UC1", "UC2", "UC3"}, {"UC1", "UC2"}, {"UC3"}, "one_orphaned"),
            # All orphaned
            ({"UC1"}, set(), {"UC1"}, "all_orphaned"),
            # No videos at all
            (set(), {"UC1"}, set(), "no_videos"),
        ],
        ids=lambda x: x if isinstance(x, str) else "",
    )
    def test_orphaned_detection(self, all_video_channels, curated_ids, want_orphaned, id):
        # The orphaned detection is a simple set difference
        orphaned = all_video_channels - curated_ids
        assert orphaned == want_orphaned, f"[{id}] expected {want_orphaned}, got {orphaned}"


# ─── T021: compute_diff remove path tests ───────────────────────────────────

class TestComputeDiffRemovePath:
    """Additional tests for compute_diff remove scenarios."""

    def test_video_aged_out_of_date_range(self):
        """Video was in desired set before, now aged out → should be in to_remove."""
        # Simulate: video was downloaded (in DB), but now isn't in desired set
        # because it aged out of the date range window
        desired = {"v1", "v2"}  # current desired (v3 aged out)
        existing = {"v1", "v2", "v3"}  # v3 still in DB
        _, to_remove = compute_diff(desired, existing)
        assert to_remove == {"v3"}

    def test_all_channel_videos_removed_when_uncurated(self):
        """When channel is removed from curation, all its videos → to_remove."""
        desired = set()  # channel no longer curated → empty desired
        existing = {"v1", "v2", "v3"}  # all videos still in DB
        _, to_remove = compute_diff(desired, existing)
        assert to_remove == {"v1", "v2", "v3"}
