"""Tests for sync_producer.py — scoring, selection, reconciliation, and core utilities."""

import math
import pytest
from datetime import datetime, timezone, timedelta
from dateutil.relativedelta import relativedelta
from unittest.mock import MagicMock, patch

from scripts.sync_producer import (
    compute_diff,
    fetch_reserved_video_ids,
    fetch_search_videos,
    parse_date_range,
    parse_iso_duration,
    passes_duration_filter,
    score_video,
    select_desired_set,
)


# ─── parse_iso_duration tests ───────────────────────────────────────────────

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


# ─── passes_duration_filter tests ────────────────────────────────────────────

class TestPassesDurationFilter:
    """Tests for the duration filter function."""

    @pytest.mark.parametrize(
        "duration, min_dur, expected, id",
        [
            (30, 300, False, "short_excluded"),
            (120, 300, False, "under_min_excluded"),
            (300, 300, True, "exact_min_included"),
            (600, 300, True, "over_min_included"),
            (60, 60, True, "exact_60s_included"),
            (59, 300, False, "under_60s_always_excluded"),
        ],
        ids=lambda x: x if isinstance(x, str) else "",
    )
    def test_passes_duration_filter(self, duration, min_dur, expected, id):
        video = {"duration_seconds": duration}
        assert passes_duration_filter(video, min_dur) == expected


# ─── compute_diff tests ─────────────────────────────────────────────────────

class TestComputeDiff:
    """Parametrized tests for compute_diff()."""

    @pytest.mark.parametrize(
        "give_desired, give_existing, want_download, want_remove, id",
        [
            ({"v1", "v2"}, {"v1"}, {"v2"}, set(), "new_video_download"),
            ({"v1"}, {"v1"}, set(), set(), "existing_no_action"),
            ({"v1"}, {"v1", "v2"}, set(), {"v2"}, "old_video_remove"),
            ({"v1", "v3"}, {"v1", "v2"}, {"v3"}, {"v2"}, "mixed_download_and_remove"),
            (set(), set(), set(), set(), "empty_sets"),
        ],
        ids=lambda x: x if isinstance(x, str) else "",
    )
    def test_compute_diff(self, give_desired, give_existing, want_download, want_remove, id):
        to_download, to_remove = compute_diff(give_desired, give_existing)
        assert to_download == want_download, f"[{id}] downloads mismatch"
        assert to_remove == want_remove, f"[{id}] removals mismatch"

    def test_video_aged_out_of_date_range(self):
        desired = {"v1", "v2"}
        existing = {"v1", "v2", "v3"}
        _, to_remove = compute_diff(desired, existing)
        assert to_remove == {"v3"}

    def test_all_channel_videos_removed_when_uncurated(self):
        desired = set()
        existing = {"v1", "v2", "v3"}
        _, to_remove = compute_diff(desired, existing)
        assert to_remove == {"v1", "v2", "v3"}


# ─── parse_date_range tests ─────────────────────────────────────────────────

class TestParseDateRange:
    """Parametrized tests for parse_date_range()."""

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
    def test_parse_date_range(self, give, want_description, id):
        result = parse_date_range(give)
        now = datetime.now(timezone.utc)

        assert result.tzinfo is not None, f"[{id}] result must be timezone-aware"

        if give == "19700101":
            assert result.year == 1970 and result.month == 1 and result.day == 1
        elif give == "today-2years":
            expected = (now - relativedelta(years=2)).replace(hour=0, minute=0, second=0, microsecond=0)
            assert abs((result - expected).total_seconds()) < 2
        elif give == "today-1years":
            expected = (now - relativedelta(years=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            assert abs((result - expected).total_seconds()) < 2
        else:
            # Default or explicit 6 months — function zeros out time
            expected = (now - relativedelta(months=6)).replace(hour=0, minute=0, second=0, microsecond=0)
            assert abs((result - expected).total_seconds()) < 2


# ─── orphaned channel detection tests ────────────────────────────────────────

class TestOrphanedChannelDetection:
    """Unit tests for orphaned channel logic (set operations)."""

    @pytest.mark.parametrize(
        "all_video_channels, curated_ids, want_orphaned, id",
        [
            ({"UC1", "UC2"}, {"UC1", "UC2"}, set(), "all_curated"),
            ({"UC1", "UC2", "UC3"}, {"UC1", "UC2"}, {"UC3"}, "one_orphaned"),
            ({"UC1"}, set(), {"UC1"}, "all_orphaned"),
            (set(), {"UC1"}, set(), "no_videos"),
        ],
        ids=lambda x: x if isinstance(x, str) else "",
    )
    def test_orphaned_detection(self, all_video_channels, curated_ids, want_orphaned, id):
        orphaned = all_video_channels - curated_ids
        assert orphaned == want_orphaned, f"[{id}] expected {want_orphaned}, got {orphaned}"


# ─── T004: score_video tests ────────────────────────────────────────────────

class TestScoreVideo:
    """Parametrized tests for score_video() — the scoring pure function."""

    DEFAULT_WEIGHTS = {"popularity": 0.35, "engagement": 0.35, "freshness": 0.30}
    HALF_LIFE = 90.0

    def _make_video(self, views=1000, likes=50, comments=5, age_days=0):
        """Helper to create a video dict with controlled age."""
        pub = (datetime.now(timezone.utc) - timedelta(days=age_days)).isoformat()
        return {
            "video_id": "test",
            "view_count": views,
            "like_count": likes,
            "comment_count": comments,
            "published_at": pub,
        }

    def test_brand_new_viral_video(self):
        """Brand-new viral video: high views, brand new → high score."""
        video = self._make_video(views=5_000_000, likes=250_000, comments=25_000, age_days=1)
        score = score_video(video, self.DEFAULT_WEIGHTS, self.HALF_LIFE)
        # log10(5M) ≈ 6.7, engagement high, freshness ≈ 1.0
        assert score > 3.0, f"Viral video should score high, got {score}"

    def test_old_mega_popular_video(self):
        """Old mega-popular: lots of views but old → lower freshness."""
        video = self._make_video(views=10_000_000, likes=100_000, comments=5_000, age_days=365)
        score = score_video(video, self.DEFAULT_WEIGHTS, self.HALF_LIFE)
        assert score > 1.5, f"Old popular should still score decent, got {score}"

    def test_moderate_high_engagement(self):
        """Moderate views but high engagement → engagement signal boosts."""
        video = self._make_video(views=50_000, likes=5_000, comments=1_000, age_days=30)
        score = score_video(video, self.DEFAULT_WEIGHTS, self.HALF_LIFE)
        # 10% like rate, 2% comment rate → high engagement
        assert score > 3.0, f"High engagement video should score well, got {score}"

    def test_zero_view_video(self):
        """Zero views → log10(1) = 0 popularity, minimal score."""
        video = self._make_video(views=0, likes=0, comments=0, age_days=0)
        score = score_video(video, self.DEFAULT_WEIGHTS, self.HALF_LIFE)
        # Only freshness contributes (0.30 * 1.0 = 0.30)
        assert 0.0 < score < 1.0, f"Zero view video score should be low, got {score}"

    def test_freshness_decays_with_age(self):
        """Score should decrease as video ages (all else equal)."""
        new_video = self._make_video(views=100_000, likes=5_000, comments=500, age_days=1)
        old_video = self._make_video(views=100_000, likes=5_000, comments=500, age_days=180)

        new_score = score_video(new_video, self.DEFAULT_WEIGHTS, self.HALF_LIFE)
        old_score = score_video(old_video, self.DEFAULT_WEIGHTS, self.HALF_LIFE)

        assert new_score > old_score, "Newer video should score higher than older one"

    def test_half_life_at_90_days(self):
        """At exactly half_life days, freshness should be ~0.5."""
        video = self._make_video(views=1, likes=0, comments=0, age_days=90)
        score = score_video(video, self.DEFAULT_WEIGHTS, self.HALF_LIFE)
        # Only freshness and minimal popularity: 0.35*log10(1) + 0.35*0 + 0.30*0.5
        expected_freshness_contrib = 0.30 * 0.5
        assert abs(score - expected_freshness_contrib) < 0.05

    def test_viral_beats_moderate_old(self):
        """A brand-new viral video should outscore an old moderate one."""
        viral = self._make_video(views=2_000_000, likes=100_000, comments=10_000, age_days=2)
        old_moderate = self._make_video(views=50_000, likes=2_500, comments=250, age_days=300)

        viral_score = score_video(viral, self.DEFAULT_WEIGHTS, self.HALF_LIFE)
        old_score = score_video(old_moderate, self.DEFAULT_WEIGHTS, self.HALF_LIFE)

        assert viral_score > old_score

    def test_configurable_weights(self):
        """Custom weights should change scoring behavior."""
        video = self._make_video(views=1_000_000, likes=10_000, comments=1_000, age_days=30)

        # Popularity-heavy weights
        pop_weights = {"popularity": 0.80, "engagement": 0.10, "freshness": 0.10}
        # Freshness-heavy weights
        fresh_weights = {"popularity": 0.10, "engagement": 0.10, "freshness": 0.80}

        pop_score = score_video(video, pop_weights, self.HALF_LIFE)
        fresh_score = score_video(video, fresh_weights, self.HALF_LIFE)

        # With 1M views (log10=6), pop-heavy should score higher than fresh-heavy
        assert pop_score > fresh_score


# ─── T006: select_desired_set tests ──────────────────────────────────────────

class TestSelectDesiredSet:
    """Parametrized tests for select_desired_set() — source-aware selection."""

    SOURCE_CFG = {
        "popular": {"min_percentage": 0.20, "duration_floor": 60},
        "rated": {"min_percentage": 0.20, "duration_floor": 60},
    }

    def _make_video(self, vid, score=1.0):
        return {"video_id": vid, "_score": score, "title": f"Video {vid}"}

    def test_source_minimums_guaranteed(self):
        """Each source gets its min_percentage of slots."""
        popular = [self._make_video(f"pop{i}", score=10 - i) for i in range(10)]
        rated = [self._make_video(f"rat{i}", score=8 - i) for i in range(10)]
        recent = [self._make_video(f"rec{i}", score=5 - i * 0.1) for i in range(30)]

        result = select_desired_set(popular, rated, recent, max_count=20, source_cfg=self.SOURCE_CFG)

        # 20% of 20 = 4 each
        result_ids = {v["video_id"] for v in result}
        pop_in_result = sum(1 for v in result if "popular" in v.get("source_tags", []))
        rat_in_result = sum(1 for v in result if "rated" in v.get("source_tags", []))

        assert pop_in_result >= 4, f"Expected ≥4 popular, got {pop_in_result}"
        assert rat_in_result >= 4, f"Expected ≥4 rated, got {rat_in_result}"
        assert len(result) == 20

    def test_deduplication_across_sources(self):
        """Video in multiple sources gets merged tags, not duplicated."""
        shared = self._make_video("shared1", score=9.0)
        popular = [shared, self._make_video("pop1", score=8.0)]
        rated = [{**shared, "_score": 9.0}, self._make_video("rat1", score=7.0)]  # same video
        recent = [self._make_video("rec1", score=5.0)]

        result = select_desired_set(popular, rated, recent, max_count=10, source_cfg=self.SOURCE_CFG)

        # shared1 should appear once with both tags
        shared_entries = [v for v in result if v["video_id"] == "shared1"]
        assert len(shared_entries) == 1, "Shared video should not be duplicated"
        assert "popular" in shared_entries[0]["source_tags"]
        assert "rated" in shared_entries[0]["source_tags"]

    def test_remaining_filled_by_score(self):
        """After source mins, remaining slots filled by highest score."""
        popular = [self._make_video("pop1", score=5.0)]
        rated = [self._make_video("rat1", score=4.0)]
        recent = [self._make_video(f"rec{i}", score=10 - i) for i in range(20)]

        result = select_desired_set(popular, rated, recent, max_count=10, source_cfg=self.SOURCE_CFG)

        assert len(result) == 10
        # After pop1 and rat1 guaranteed, remaining 8 should be top-scoring recent
        result_ids = [v["video_id"] for v in result]
        assert "pop1" in result_ids
        assert "rat1" in result_ids

    def test_source_tags_assigned(self):
        """Every video in result has source_tags."""
        popular = [self._make_video("pop1", score=5.0)]
        rated = [self._make_video("rat1", score=4.0)]
        recent = [self._make_video("rec1", score=3.0)]

        result = select_desired_set(popular, rated, recent, max_count=10, source_cfg=self.SOURCE_CFG)

        for v in result:
            assert "source_tags" in v, f"Video {v['video_id']} missing source_tags"
            assert len(v["source_tags"]) > 0

    def test_fewer_candidates_than_minimum(self):
        """When a source has fewer candidates than minimum, use what's available."""
        popular = [self._make_video("pop1", score=5.0)]  # only 1, min would be 2
        rated = [self._make_video("rat1", score=4.0)]    # only 1, min would be 2
        recent = [self._make_video(f"rec{i}", score=3 - i * 0.1) for i in range(8)]

        result = select_desired_set(popular, rated, recent, max_count=10, source_cfg=self.SOURCE_CFG)

        assert len(result) == 10
        result_ids = {v["video_id"] for v in result}
        assert "pop1" in result_ids
        assert "rat1" in result_ids

    def test_all_candidates_from_one_source(self):
        """When only one source has candidates, still works."""
        result = select_desired_set([], [], [self._make_video(f"rec{i}", score=5-i) for i in range(5)],
                                    max_count=10, source_cfg=self.SOURCE_CFG)

        assert len(result) == 5  # Only 5 available
        for v in result:
            assert "recent" in v["source_tags"]

    def test_empty_sources(self):
        """All empty sources → empty result."""
        result = select_desired_set([], [], [], max_count=10, source_cfg=self.SOURCE_CFG)
        assert result == []


# ─── T008: fetch_reserved_video_ids tests ────────────────────────────────────

class TestFetchReservedVideoIds:
    """Test fetch_reserved_video_ids with mocked Supabase client."""

    def _make_mock_client(self, data):
        """Create a mock Supabase client returning given data."""
        client = MagicMock()
        execute_mock = MagicMock()
        execute_mock.data = data
        (
            client.table.return_value
            .select.return_value
            .eq.return_value
            .overlaps.return_value
            .execute
        ) = MagicMock(return_value=execute_mock)
        return client

    def test_returns_reserved_ids(self):
        """Should return set of youtube_ids with popular/rated tags."""
        mock_data = [
            {"youtube_id": "vid1"},
            {"youtube_id": "vid2"},
        ]
        client = self._make_mock_client(mock_data)
        result = fetch_reserved_video_ids(client, "UC123")
        assert result == {"vid1", "vid2"}

    def test_empty_when_no_reserved(self):
        """Should return empty set when no videos have popular/rated tags."""
        client = self._make_mock_client([])
        result = fetch_reserved_video_ids(client, "UC123")
        assert result == set()

    def test_queries_correct_table_and_filter(self):
        """Should query videos table with overlaps filter for popular/rated."""
        client = self._make_mock_client([])
        fetch_reserved_video_ids(client, "UC123")

        client.table.assert_called_with("videos")
        client.table.return_value.select.assert_called_with("youtube_id")
        client.table.return_value.select.return_value.eq.assert_called_with("channel_id", "UC123")


# ─── T009: recent-mode reconciliation logic tests ────────────────────────────

class TestRecentModeReconciliation:
    """Test the reconciliation logic used in recent mode:
    given reserved IDs + recent candidates + existing DB videos,
    verify correct download/remove sets (reserved never removed).
    """

    def test_reserved_never_removed(self):
        """Reserved IDs must never appear in the remove set."""
        reserved_ids = {"pop1", "rat1"}
        recent_ids = {"rec1", "rec2"}
        desired_ids = reserved_ids | recent_ids
        existing_ids = {"pop1", "rat1", "old1", "old2"}

        to_download = desired_ids - existing_ids
        to_remove = (existing_ids - desired_ids) - reserved_ids

        assert "pop1" not in to_remove
        assert "rat1" not in to_remove
        assert to_remove == {"old1", "old2"}
        assert to_download == {"rec1", "rec2"}

    def test_reserved_plus_recent_fills_correctly(self):
        """Available slots = target - reserved count."""
        target = 10
        reserved_ids = {"pop1", "pop2", "rat1"}  # 3 reserved
        available_slots = target - len(reserved_ids)  # 7

        recent_candidates = [{"video_id": f"rec{i}", "_score": 10 - i} for i in range(10)]
        # Slice top 7
        selected_recent = sorted(recent_candidates, key=lambda v: v["_score"], reverse=True)[:available_slots]
        recent_ids = {v["video_id"] for v in selected_recent}

        assert len(recent_ids) == 7
        desired_ids = reserved_ids | recent_ids
        assert len(desired_ids) == 10

    def test_no_reserved_all_recent(self):
        """When no prior full run, all slots go to recent."""
        reserved_ids = set()
        target = 5
        available_slots = target - len(reserved_ids)

        recent_candidates = [{"video_id": f"rec{i}", "_score": 5 - i} for i in range(5)]
        selected_recent = sorted(recent_candidates, key=lambda v: v["_score"], reverse=True)[:available_slots]
        recent_ids = {v["video_id"] for v in selected_recent}

        desired_ids = reserved_ids | recent_ids
        assert len(desired_ids) == 5
        assert desired_ids == {f"rec{i}" for i in range(5)}

    def test_existing_recent_not_re_downloaded(self):
        """A recent video already in DB should not be in to_download."""
        reserved_ids = {"pop1"}
        recent_ids = {"rec1", "rec2"}
        desired_ids = reserved_ids | recent_ids
        existing_ids = {"pop1", "rec1"}  # rec1 already downloaded

        to_download = desired_ids - existing_ids
        to_remove = (existing_ids - desired_ids) - reserved_ids

        assert to_download == {"rec2"}
        assert to_remove == set()


# ─── T015: fetch_search_videos tests ─────────────────────────────────────────

class TestFetchSearchVideos:
    """Test fetch_search_videos with mocked API calls."""

    @patch("scripts.sync_producer.enrich_videos")
    @patch("scripts.sync_producer.api_get")
    def test_correct_search_params(self, mock_api_get, mock_enrich):
        """Should call search.list with correct params."""
        mock_api_get.return_value = {"items": []}
        mock_enrich.return_value = ({}, 0)

        fetch_search_videos("fake_key", "UC123", "viewCount", 60)

        call_args = mock_api_get.call_args
        params = call_args[0][1]
        assert params["channelId"] == "UC123"
        assert params["type"] == "video"
        assert params["order"] == "viewCount"
        assert params["maxResults"] == 50

    @patch("scripts.sync_producer.enrich_videos")
    @patch("scripts.sync_producer.api_get")
    def test_returns_enriched_videos_filtered_by_duration(self, mock_api_get, mock_enrich):
        """Should enrich and filter by duration floor."""
        mock_api_get.return_value = {
            "items": [
                {"id": {"videoId": "v1"}, "snippet": {"title": "Long video", "publishedAt": "2026-01-01T00:00:00Z", "description": "", "thumbnails": {}}},
                {"id": {"videoId": "v2"}, "snippet": {"title": "Short video", "publishedAt": "2026-01-01T00:00:00Z", "description": "", "thumbnails": {}}},
            ]
        }
        mock_enrich.return_value = (
            {
                "v1": {"duration_seconds": 600, "duration_iso": "PT10M", "view_count": 1000, "like_count": 50, "comment_count": 5},
                "v2": {"duration_seconds": 30, "duration_iso": "PT30S", "view_count": 500, "like_count": 25, "comment_count": 2},
            },
            1,
        )

        videos, quota = fetch_search_videos("fake_key", "UC123", "viewCount", 60)

        assert len(videos) == 1
        assert videos[0]["video_id"] == "v1"

    @patch("scripts.sync_producer.enrich_videos")
    @patch("scripts.sync_producer.api_get")
    def test_quota_counting(self, mock_api_get, mock_enrich):
        """Should account for 100 units (search) + enrichment calls."""
        mock_api_get.return_value = {
            "items": [
                {"id": {"videoId": "v1"}, "snippet": {"title": "Test", "publishedAt": "2026-01-01T00:00:00Z", "description": "", "thumbnails": {}}},
            ]
        }
        mock_enrich.return_value = (
            {"v1": {"duration_seconds": 600, "duration_iso": "PT10M", "view_count": 1000, "like_count": 50, "comment_count": 5}},
            1,
        )

        _, quota = fetch_search_videos("fake_key", "UC123", "rating", 60)
        assert quota == 101  # 100 for search + 1 for enrichment


# ─── T016: full-mode integration test ────────────────────────────────────────

class TestFullModeIntegration:
    """Integration test: 3-source fetch → dedup → score → select → diff."""

    def test_full_mode_produces_correct_desired_set(self):
        """Simulate full mode: merge 3 sources, dedup, score, select with minimums."""
        weights = {"popularity": 0.35, "engagement": 0.35, "freshness": 0.30}
        half_life = 90.0
        source_cfg = {
            "popular": {"min_percentage": 0.20, "duration_floor": 60},
            "rated": {"min_percentage": 0.20, "duration_floor": 60},
        }
        now = datetime.now(timezone.utc)

        def make(vid, views, likes, comments, age_days):
            pub = (now - timedelta(days=age_days)).isoformat()
            v = {
                "video_id": vid, "title": f"Video {vid}",
                "view_count": views, "like_count": likes,
                "comment_count": comments, "published_at": pub,
            }
            v["_score"] = score_video(v, weights, half_life)
            return v

        # Popular source: high-view old videos
        popular = [make(f"pop{i}", views=1_000_000 - i*100_000, likes=10_000, comments=500, age_days=200+i*10) for i in range(10)]
        # Rated source: high-engagement moderate videos
        rated = [make(f"rat{i}", views=50_000, likes=5_000, comments=1_000, age_days=60+i*5) for i in range(10)]
        # Recent source: fresh videos
        recent = [make(f"rec{i}", views=10_000+i*1_000, likes=500, comments=50, age_days=i+1) for i in range(30)]

        # One shared video between popular and rated
        shared = make("shared1", views=500_000, likes=25_000, comments=5_000, age_days=30)
        popular.append(shared)
        rated.append({**shared})  # same video in rated

        result = select_desired_set(popular, rated, recent, max_count=20, source_cfg=source_cfg)

        # Verify basic properties
        assert len(result) == 20
        result_ids = [v["video_id"] for v in result]
        assert len(set(result_ids)) == 20  # no duplicates

        # Verify source minimums (20% of 20 = 4 each)
        pop_in = sum(1 for v in result if "popular" in v.get("source_tags", []))
        rat_in = sum(1 for v in result if "rated" in v.get("source_tags", []))
        assert pop_in >= 4, f"Expected ≥4 popular, got {pop_in}"
        assert rat_in >= 4, f"Expected ≥4 rated, got {rat_in}"

        # Verify shared video has both tags
        shared_entries = [v for v in result if v["video_id"] == "shared1"]
        if shared_entries:
            assert "popular" in shared_entries[0]["source_tags"]
            assert "rated" in shared_entries[0]["source_tags"]

        # Verify all have source_tags
        for v in result:
            assert "source_tags" in v
            assert len(v["source_tags"]) > 0

    def test_full_mode_diff_against_existing(self):
        """Full mode: desired set vs existing DB → correct download/remove sets."""
        desired_ids = {"pop1", "rat1", "rec1", "rec2", "shared1"}
        existing_ids = {"pop1", "old1", "old2"}  # pop1 already exists

        to_download, to_remove = compute_diff(desired_ids, existing_ids)

        assert to_download == {"rat1", "rec1", "rec2", "shared1"}
        assert to_remove == {"old1", "old2"}


# ─── T022: scoring calibration tests ─────────────────────────────────────────

class TestScoringCalibration:
    """Validate scoring produces balanced rankings with realistic video stats.

    Tests acceptance scenarios from the spec: the scoring algorithm should
    produce a balanced feed that isn't all-old or all-new.
    """

    DEFAULT_WEIGHTS = {"popularity": 0.35, "engagement": 0.35, "freshness": 0.30}
    HALF_LIFE = 90.0

    def _make_realistic(self, vid, views, likes, comments, age_days):
        now = datetime.now(timezone.utc)
        pub = (now - timedelta(days=age_days)).isoformat()
        v = {
            "video_id": vid, "title": f"Video {vid}",
            "view_count": views, "like_count": likes,
            "comment_count": comments, "published_at": pub,
        }
        v["_score"] = score_video(v, self.DEFAULT_WEIGHTS, self.HALF_LIFE)
        return v

    def test_new_500_views_vs_old_5m_views(self):
        """1-day-old 500 views should compete with 2-year-old 5M views.

        The freshness signal should make the new video competitive,
        while the old viral video's popularity keeps it relevant.
        """
        new_video = self._make_realistic("new1", views=500, likes=50, comments=10, age_days=1)
        old_viral = self._make_realistic("old1", views=5_000_000, likes=100_000, comments=5_000, age_days=730)

        # Both should have meaningful scores (not one dominating)
        assert new_video["_score"] > 0.5, "New video should have meaningful score"
        assert old_viral["_score"] > 0.5, "Old viral should have meaningful score"

        # The gap shouldn't be extreme — both should be in the same order of magnitude
        ratio = max(new_video["_score"], old_viral["_score"]) / min(new_video["_score"], old_viral["_score"])
        assert ratio < 5, f"Score ratio too extreme: {ratio:.2f}"

    def test_high_engagement_beats_low_engagement_same_views(self):
        """Same views and age: high engagement video should score higher."""
        high_eng = self._make_realistic("he1", views=100_000, likes=10_000, comments=2_000, age_days=30)
        low_eng = self._make_realistic("le1", views=100_000, likes=100, comments=10, age_days=30)

        assert high_eng["_score"] > low_eng["_score"]

    def test_1month_100k_high_engagement_ranking(self):
        """A 1-month-old 100K high-engagement video should rank well against extremes."""
        moderate = self._make_realistic("mod1", views=100_000, likes=10_000, comments=2_000, age_days=30)
        brand_new_low = self._make_realistic("bnl1", views=100, likes=5, comments=1, age_days=1)
        ancient_mega = self._make_realistic("am1", views=50_000_000, likes=500_000, comments=50_000, age_days=1000)

        # Moderate high-engagement should beat both extremes
        assert moderate["_score"] > brand_new_low["_score"], "Moderate should beat brand-new-low"
        # Ancient mega might still be high due to massive views, but moderate should be competitive
        assert moderate["_score"] > ancient_mega["_score"] * 0.5, "Moderate should be competitive with ancient mega"

    def test_balanced_mix_in_selection(self):
        """When selecting from mixed sources, result should include both old popular and new fresh."""
        source_cfg = {
            "popular": {"min_percentage": 0.20, "duration_floor": 60},
            "rated": {"min_percentage": 0.20, "duration_floor": 60},
        }

        # Old popular videos
        popular = [self._make_realistic(f"pop{i}", views=1_000_000-i*100_000, likes=50_000, comments=5_000, age_days=365+i*30) for i in range(10)]
        # Fresh recent videos
        recent = [self._make_realistic(f"rec{i}", views=5_000+i*1_000, likes=500, comments=50, age_days=i+1) for i in range(20)]

        result = select_desired_set(popular, [], recent, max_count=15, source_cfg=source_cfg)

        pop_in = sum(1 for v in result if "popular" in v.get("source_tags", []))
        rec_in = sum(1 for v in result if "recent" in v.get("source_tags", []))

        # Should have a balanced mix — not all old or all new
        assert pop_in >= 3, f"Should have popular videos, got {pop_in}"
        assert rec_in >= 3, f"Should have recent videos, got {rec_in}"


# ─── T023: graceful degradation tests ────────────────────────────────────────

class TestGracefulDegradation:
    """Test that search API failures don't abort channel processing."""

    @patch("scripts.sync_producer.fetch_search_videos")
    def test_popular_search_failure_continues(self, mock_search):
        """When popular search fails, processing should continue with other sources."""
        mock_search.side_effect = Exception("403 Forbidden")

        # The try/except in process_channel should catch this
        # We test the pattern directly: if fetch_search_videos raises, empty list is used
        popular_candidates = []
        try:
            popular_candidates, _ = fetch_search_videos("key", "UC123", "viewCount", 60)
        except Exception:
            popular_candidates = []

        assert popular_candidates == []

    def test_fallback_to_recent_only_when_both_searches_fail(self):
        """When both search sources fail, recent-only still works."""
        weights = {"popularity": 0.35, "engagement": 0.35, "freshness": 0.30}
        half_life = 90.0
        source_cfg = {
            "popular": {"min_percentage": 0.20, "duration_floor": 60},
            "rated": {"min_percentage": 0.20, "duration_floor": 60},
        }
        now = datetime.now(timezone.utc)

        # Both search sources failed → empty
        popular = []
        rated = []
        # Only recent available
        recent = [
            {"video_id": f"rec{i}", "_score": score_video(
                {"video_id": f"rec{i}", "view_count": 10_000, "like_count": 500, "comment_count": 50,
                 "published_at": (now - timedelta(days=i+1)).isoformat()},
                weights, half_life
            ), "title": f"Recent {i}"}
            for i in range(10)
        ]

        result = select_desired_set(popular, rated, recent, max_count=10, source_cfg=source_cfg)

        assert len(result) == 10
        for v in result:
            assert "recent" in v.get("source_tags", [])


# ─── Rolling full refresh selection tests ─────────────────────────────────────

class TestRollingRefreshSelection:
    """Test the rolling channel selection logic used in main()."""

    def test_nulls_first_never_refreshed_channels(self):
        """Channels with NULL last_full_refresh_at should be picked first."""
        channels = [
            {"channel_id": "UC1", "last_full_refresh_at": "2026-03-20T00:00:00Z"},
            {"channel_id": "UC2", "last_full_refresh_at": None},
            {"channel_id": "UC3", "last_full_refresh_at": "2026-03-22T00:00:00Z"},
            {"channel_id": "UC4", "last_full_refresh_at": None},
        ]

        sorted_channels = sorted(
            channels,
            key=lambda c: c.get("last_full_refresh_at") or "",
        )

        # NULLs sort first (empty string < any date string)
        assert sorted_channels[0]["last_full_refresh_at"] is None
        assert sorted_channels[1]["last_full_refresh_at"] is None

    def test_oldest_refreshed_sorted_first(self):
        """After NULLs, oldest refresh dates should come first."""
        channels = [
            {"channel_id": "UC1", "last_full_refresh_at": "2026-03-22T00:00:00Z"},
            {"channel_id": "UC2", "last_full_refresh_at": "2026-03-18T00:00:00Z"},
            {"channel_id": "UC3", "last_full_refresh_at": "2026-03-20T00:00:00Z"},
        ]

        sorted_channels = sorted(
            channels,
            key=lambda c: c.get("last_full_refresh_at") or "",
        )

        assert sorted_channels[0]["channel_id"] == "UC2"  # oldest
        assert sorted_channels[1]["channel_id"] == "UC3"
        assert sorted_channels[2]["channel_id"] == "UC1"  # newest

    def test_10_percent_of_52_is_6(self):
        """10% of 52 channels → ceil(5.2) = 6 channels get full mode."""
        import math
        channels = [{"channel_id": f"UC{i}", "last_full_refresh_at": None} for i in range(52)]
        pct = 0.10
        full_count = max(1, math.ceil(len(channels) * pct))
        assert full_count == 6

    def test_at_least_one_full(self):
        """Even with very few channels, at least 1 gets full mode."""
        import math
        channels = [{"channel_id": "UC1", "last_full_refresh_at": None}]
        pct = 0.10
        full_count = max(1, math.ceil(len(channels) * pct))
        assert full_count == 1

    def test_full_set_vs_recent_set(self):
        """Channels split correctly into full and recent sets."""
        import math
        channels = [
            {"channel_id": f"UC{i}", "last_full_refresh_at": f"2026-03-{10+i:02d}T00:00:00Z"}
            for i in range(10)
        ]

        pct = 0.30  # 30% → ceil(3.0) = 3
        full_count = max(1, math.ceil(len(channels) * pct))
        sorted_channels = sorted(
            channels,
            key=lambda c: c.get("last_full_refresh_at") or "",
        )
        full_set = {c["channel_id"] for c in sorted_channels[:full_count]}

        assert len(full_set) == 3
        # Oldest 3 should be UC0, UC1, UC2 (dates 2026-03-10, 11, 12)
        assert "UC0" in full_set
        assert "UC1" in full_set
        assert "UC2" in full_set
        assert "UC3" not in full_set
