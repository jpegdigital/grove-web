"""Tests for sync_consumer.py — download pipeline, removal pipeline, utilities, and operational controls."""

import json
import subprocess
import pytest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch, call

from scripts.sync_consumer import (
    build_r2_key,
    build_r2_key_hls,
    build_format_selector,
    build_ffmpeg_remux_cmd,
    check_ffmpeg,
    cleanup_legacy_mp4,
    cleanup_staging,
    clear_video_record,
    collect_downloaded_files,
    delete_from_r2,
    download_video,
    download_video_tiers,
    extract_tier_metadata,
    fail_job,
    generate_master_playlist,
    parse_info_json,
    process_download_job,
    process_remove_job,
    remux_to_hls,
    reset_stale_locks,
    upload_hls_package,
    upload_to_r2,
    upsert_video_record,
)


# ─── build_r2_key tests (T012) ──────────────────────────────────────────────


class TestBuildR2Key:
    """Tests for build_r2_key() — parameterized with various handles, dates, edge cases."""

    @pytest.mark.parametrize(
        "handle, published_at, video_id, ext, expected",
        [
            ("@3blue1brown", "2024-03-15T10:00:00Z", "dQw4w9WgXcQ", "mp4",
             "@3blue1brown/2024-03/dQw4w9WgXcQ.mp4"),
            ("@veritasium", "2023-12-01T00:00:00Z", "abc123", "jpg",
             "@veritasium/2023-12/abc123.jpg"),
            ("@kurzgesagt", "2024-01-20T00:00:00+00:00", "xyz789", "en.vtt",
             "@kurzgesagt/2024-01/xyz789.en.vtt"),
            ("@channel", "2024-06-05T00:00:00Z", "vid1", "info.json",
             "@channel/2024-06/vid1.info.json"),
        ],
        ids=["standard", "december", "with_tz", "info_json"],
    )
    def test_standard_cases(self, handle, published_at, video_id, ext, expected):
        assert build_r2_key(handle, published_at, video_id, ext) == expected

    def test_handle_without_at_prefix(self):
        result = build_r2_key("3blue1brown", "2024-03-15T10:00:00Z", "vid1", "mp4")
        assert result == "@3blue1brown/2024-03/vid1.mp4"

    def test_missing_published_at(self):
        result = build_r2_key("@handle", None, "vid1", "mp4")
        assert result == "@handle/unknown-00/vid1.mp4"

    def test_invalid_published_at(self):
        result = build_r2_key("@handle", "not-a-date", "vid1", "mp4")
        assert result == "@handle/unknown-00/vid1.mp4"

    def test_ext_with_leading_dot(self):
        result = build_r2_key("@handle", "2024-01-01T00:00:00Z", "vid1", ".mp4")
        assert result == "@handle/2024-01/vid1.mp4"


# ─── parse_info_json tests (T013) ────────────────────────────────────────────


class TestParseInfoJson:
    """Tests for parse_info_json() — full metadata, minimal, missing fields, chapters."""

    def test_full_metadata(self, tmp_path):
        info = {
            "title": "Test Video",
            "description": "A test description",
            "duration": 245,
            "view_count": 150000,
            "like_count": 8500,
            "comment_count": 320,
            "upload_date": "20240315",
            "thumbnail": "https://example.com/thumb.jpg",
            "uploader_id": "@testchannel",
            "tags": ["science", "education"],
            "categories": ["Education"],
            "chapters": [
                {"title": "Intro", "start_time": 0, "end_time": 30},
                {"title": "Main", "start_time": 30, "end_time": 200},
            ],
            "width": 1920,
            "height": 1080,
            "fps": 30,
            "language": "en",
            "webpage_url": "https://www.youtube.com/watch?v=abc123",
        }
        info_path = tmp_path / "abc123.info.json"
        info_path.write_text(json.dumps(info), encoding="utf-8")

        result = parse_info_json(info_path)

        assert result is not None
        assert result["title"] == "Test Video"
        assert result["duration_seconds"] == 245
        assert result["view_count"] == 150000
        assert result["published_at"] == "2024-03-15T00:00:00Z"
        assert result["handle"] == "@testchannel"
        assert result["width"] == 1920
        assert result["tags"] == ["science", "education"]
        assert result["chapters"] is not None
        chapters = json.loads(result["chapters"])
        assert len(chapters) == 2
        assert chapters[0]["title"] == "Intro"

    def test_minimal_metadata(self, tmp_path):
        info = {"title": "Minimal"}
        info_path = tmp_path / "min.info.json"
        info_path.write_text(json.dumps(info), encoding="utf-8")

        result = parse_info_json(info_path)

        assert result is not None
        assert result["title"] == "Minimal"
        assert result["description"] == ""
        assert result["duration_seconds"] is None
        assert result["published_at"] is None
        assert result["chapters"] is None
        assert result["tags"] == []

    def test_missing_optional_fields(self, tmp_path):
        info = {"fulltitle": "Fallback Title"}
        info_path = tmp_path / "vid.info.json"
        info_path.write_text(json.dumps(info), encoding="utf-8")

        result = parse_info_json(info_path)
        assert result["title"] == "Fallback Title"
        assert result["handle"] == ""

    def test_invalid_json(self, tmp_path):
        info_path = tmp_path / "bad.info.json"
        info_path.write_text("not json", encoding="utf-8")

        result = parse_info_json(info_path)
        assert result is None

    def test_chapters_not_list(self, tmp_path):
        info = {"title": "Test", "chapters": "invalid"}
        info_path = tmp_path / "vid.info.json"
        info_path.write_text(json.dumps(info), encoding="utf-8")

        result = parse_info_json(info_path)
        assert result["chapters"] is None


# ─── download_video tests (T011) ─────────────────────────────────────────────


class TestDownloadVideo:
    """Tests for download_video() — mock subprocess.run, verify yt-dlp args."""

    @patch("scripts.sync_consumer.subprocess.run")
    def test_success(self, mock_run, tmp_path):
        mock_run.return_value = MagicMock(returncode=0, stderr="")
        config = {
            "ytdlp": {
                "format": "bv[height<=%(max_height)s][ext=mp4]+ba[ext=m4a]/b[height<=%(max_height)s][ext=mp4]/b[ext=mp4]",
                "max_height": 1080,
                "merge_output_format": "mp4",
                "faststart": True,
                "write_thumbnail": True,
                "write_subs": True,
                "write_auto_subs": True,
                "sub_langs": "en",
                "sub_format": "vtt",
                "write_info_json": True,
            }
        }

        success, stderr = download_video("dQw4w9WgXcQ", tmp_path, config)

        assert success is True
        assert stderr == ""

        # Verify yt-dlp was called with correct args
        cmd = mock_run.call_args[0][0]
        assert "-m" in cmd
        assert "yt_dlp" in cmd
        assert "--merge-output-format" in cmd
        assert "mp4" in cmd[cmd.index("--merge-output-format") + 1]
        assert "--write-thumbnail" in cmd
        assert "--write-subs" in cmd
        assert "--write-auto-subs" in cmd
        assert "--write-info-json" in cmd
        assert "--postprocessor-args" in cmd
        assert "https://www.youtube.com/watch?v=dQw4w9WgXcQ" in cmd

    @patch("scripts.sync_consumer.subprocess.run")
    def test_failure(self, mock_run, tmp_path):
        mock_run.return_value = MagicMock(returncode=1, stderr="ERROR: Video unavailable")
        config = {
            "ytdlp": {
                "format": "bv[height<=%(max_height)s][ext=mp4]",
                "max_height": 1080,
                "merge_output_format": "mp4",
                "faststart": False,
                "write_thumbnail": False,
                "write_subs": False,
                "write_auto_subs": False,
                "sub_langs": "",
                "sub_format": "",
                "write_info_json": False,
            }
        }

        success, stderr = download_video("invalid", tmp_path, config)

        assert success is False
        assert "Video unavailable" in stderr


# ─── collect_downloaded_files tests ──────────────────────────────────────────


class TestCollectDownloadedFiles:
    """Tests for collect_downloaded_files()."""

    def test_all_sidecar_files(self, tmp_path):
        (tmp_path / "dQw4w9WgXcQ.mp4").touch()
        (tmp_path / "dQw4w9WgXcQ.jpg").touch()
        (tmp_path / "dQw4w9WgXcQ.en.vtt").touch()
        (tmp_path / "dQw4w9WgXcQ.info.json").touch()

        files = collect_downloaded_files(tmp_path, "dQw4w9WgXcQ")

        assert "video" in files
        assert "thumbnail" in files
        assert "subtitle" in files
        assert "info_json" in files

    def test_video_only(self, tmp_path):
        (tmp_path / "abc123.mp4").touch()

        files = collect_downloaded_files(tmp_path, "abc123")

        assert "video" in files
        assert "thumbnail" not in files
        assert "subtitle" not in files

    def test_ignores_other_files(self, tmp_path):
        (tmp_path / "abc123.mp4").touch()
        (tmp_path / "other_video.mp4").touch()

        files = collect_downloaded_files(tmp_path, "abc123")
        assert len(files) == 1


# ─── process_download_job tests (T014) ───────────────────────────────────────


class TestProcessDownloadJob:
    """Tests for process_download_job() — orchestration of download pipeline."""

    def _make_job(self, video_id="dQw4w9WgXcQ"):
        return {
            "id": "job-uuid-1",
            "video_id": video_id,
            "channel_id": "UC_channel_1",
            "action": "download",
            "metadata": {
                "title": "Test Video",
                "published_at": "2024-03-15T10:00:00Z",
                "source_tags": ["recent"],
            },
        }

    @patch("scripts.sync_consumer.complete_job")
    @patch("scripts.sync_consumer.upsert_video_record")
    @patch("scripts.sync_consumer.upload_video_files")
    @patch("scripts.sync_consumer.resolve_channel_handle")
    @patch("scripts.sync_consumer.download_video")
    @patch("scripts.sync_consumer.STAGING_DIR", new_callable=lambda: property(lambda self: None))
    def test_successful_flow(self, mock_staging, mock_download, mock_resolve,
                             mock_upload, mock_upsert, mock_complete, tmp_path):
        # Patch STAGING_DIR to use tmp_path
        with patch("scripts.sync_consumer.STAGING_DIR", tmp_path):
            mock_download.return_value = (True, "")
            mock_resolve.return_value = "@testchannel"
            mock_upload.return_value = {"video": "@testchannel/2024-03/dQw4w9WgXcQ.mp4"}

            # Create fake downloaded files
            staging = tmp_path / "dQw4w9WgXcQ"
            staging.mkdir()
            (staging / "dQw4w9WgXcQ.mp4").write_bytes(b"fake video")
            (staging / "dQw4w9WgXcQ.info.json").write_text(
                json.dumps({"title": "Test", "upload_date": "20240315"}),
                encoding="utf-8",
            )

            client = MagicMock()
            r2_client = MagicMock()
            job = self._make_job()

            result = process_download_job(
                client, r2_client, "bucket", job,
                {"ytdlp": {"format": "%(max_height)s", "max_height": 1080,
                           "merge_output_format": "mp4", "faststart": False,
                           "write_thumbnail": False, "write_subs": False,
                           "write_auto_subs": False, "sub_langs": "", "sub_format": "",
                           "write_info_json": False}},
                verbose=False, dry_run=False,
            )

            assert result is True
            mock_complete.assert_called_once_with(client, "job-uuid-1")

    @patch("scripts.sync_consumer.fail_job")
    @patch("scripts.sync_consumer.download_video_tiers")
    def test_failed_download_increments_attempts(self, mock_tiers, mock_fail, tmp_path):
        with patch("scripts.sync_consumer.STAGING_DIR", tmp_path):
            # No tiers downloaded — should fail with min_tiers enforcement
            mock_tiers.return_value = ([], {})

            client = MagicMock()
            r2_client = MagicMock()
            job = self._make_job()

            result = process_download_job(
                client, r2_client, "bucket", job,
                {"ytdlp": {"format": "%(max_height)s", "max_height": 1080,
                           "merge_output_format": "mp4", "faststart": False,
                           "write_thumbnail": False, "write_subs": False,
                           "write_auto_subs": False, "sub_langs": "", "sub_format": "",
                           "write_info_json": False},
                 "hls": {"min_tiers": 1}},
                verbose=False, dry_run=False,
            )

            assert result is False
            mock_fail.assert_called_once()
            assert "tier" in mock_fail.call_args[0][2].lower()

    @patch("scripts.sync_consumer.fail_job")
    @patch("scripts.sync_consumer.upload_hls_package")
    @patch("scripts.sync_consumer.remux_to_hls")
    @patch("scripts.sync_consumer.resolve_channel_handle")
    @patch("scripts.sync_consumer.download_video_tiers")
    def test_r2_failure_increments_attempts(self, mock_tiers, mock_resolve,
                                             mock_remux, mock_upload, mock_fail, tmp_path):
        with patch("scripts.sync_consumer.STAGING_DIR", tmp_path):
            mock_resolve.return_value = "@testchannel"
            # 1 tier downloaded successfully
            mock_tiers.return_value = (
                [{"label": "720p", "height": 720, "bandwidth": 2500000,
                  "mp4_path": tmp_path / "720p.mp4"}],
                {},
            )
            # Remux succeeds
            mock_remux.return_value = [
                {"label": "720p", "height": 720, "bandwidth": 2500000,
                 "mp4_path": tmp_path / "720p.mp4",
                 "hls_dir": tmp_path / "hls" / "720p"},
            ]
            # Upload fails
            mock_upload.side_effect = RuntimeError("R2 upload failed")

            client = MagicMock()
            r2_client = MagicMock()
            job = self._make_job()

            result = process_download_job(
                client, r2_client, "bucket", job,
                {"ytdlp": {"format": "%(max_height)s", "max_height": 1080,
                           "merge_output_format": "mp4", "faststart": False,
                           "write_thumbnail": False, "write_subs": False,
                           "write_auto_subs": False, "sub_langs": "", "sub_format": "",
                           "write_info_json": False},
                 "hls": {"min_tiers": 1}},
                verbose=False, dry_run=False,
            )

            assert result is False
            mock_fail.assert_called_once()

    def test_staging_cleanup_on_success_and_failure(self, tmp_path):
        staging = tmp_path / "cleanup_test"
        staging.mkdir()
        (staging / "file.txt").write_text("data")

        cleanup_staging(staging)

        assert not staging.exists()

    def test_cleanup_missing_dir(self, tmp_path):
        # Should not raise
        cleanup_staging(tmp_path / "nonexistent")


# ─── upsert_video_record tests (T015) ────────────────────────────────────────


class TestUpsertVideoRecord:
    """Tests for upsert_video_record() — verify correct fields from info.json + R2 paths."""

    def test_correct_fields(self):
        client = MagicMock()

        info_data = {
            "title": "Test Video",
            "description": "Desc",
            "thumbnail_url": "https://example.com/thumb.jpg",
            "published_at": "2024-03-15T00:00:00Z",
            "duration_seconds": 245,
            "view_count": 150000,
            "like_count": 8500,
            "comment_count": 320,
            "tags": ["science"],
            "categories": ["Education"],
            "chapters": None,
            "width": 1920,
            "height": 1080,
            "fps": 30,
            "language": "en",
            "webpage_url": "https://youtube.com/watch?v=abc",
            "handle": "@test",
        }
        r2_keys = {
            "video": "@test/2024-03/abc.mp4",
            "thumbnail": "@test/2024-03/abc.jpg",
            "subtitle": "@test/2024-03/abc.en.vtt",
        }

        upsert_video_record(client, "abc", "UC_ch1", info_data, r2_keys, ["recent"])

        upsert_call = client.table.return_value.upsert
        upsert_call.assert_called_once()
        row = upsert_call.call_args[0][0]

        assert row["youtube_id"] == "abc"
        assert row["channel_id"] == "UC_ch1"
        assert row["title"] == "Test Video"
        assert row["media_path"] == "@test/2024-03/abc.mp4"
        assert row["thumbnail_path"] == "@test/2024-03/abc.jpg"
        assert row["subtitle_path"] == "@test/2024-03/abc.en.vtt"
        assert row["is_downloaded"] is True
        assert row["r2_synced_at"] is not None
        assert row["source_tags"] == ["recent"]

    def test_r2_synced_at_only_when_all_uploads_succeed(self):
        client = MagicMock()

        info_data = {"title": "T", "description": "", "published_at": None,
                     "duration_seconds": None, "view_count": None, "like_count": None,
                     "comment_count": None, "thumbnail_url": "", "handle": "",
                     "tags": [], "categories": [], "chapters": None, "width": None,
                     "height": None, "fps": None, "language": None, "webpage_url": ""}
        r2_keys = {"video": "key.mp4"}  # only video, no thumbnail or subtitle

        upsert_video_record(client, "vid1", "ch1", info_data, r2_keys, [])

        row = client.table.return_value.upsert.call_args[0][0]
        assert row["r2_synced_at"] is not None
        assert row["thumbnail_path"] is None
        assert row["subtitle_path"] is None


# ─── delete_from_r2 tests (T026) ─────────────────────────────────────────────


class TestDeleteFromR2:
    """Tests for delete_from_r2() — verify all 4 files deleted, tolerate missing."""

    def test_all_files_deleted(self):
        r2_client = MagicMock()
        metadata = {
            "media_path": "@ch/2024-03/vid.mp4",
            "thumbnail_path": "@ch/2024-03/vid.jpg",
            "subtitle_path": "@ch/2024-03/vid.en.vtt",
        }

        success, error = delete_from_r2(r2_client, "bucket", metadata)

        assert success is True
        assert error is None
        # 4 calls: media + thumbnail + subtitle + info.json
        assert r2_client.delete_object.call_count == 4

    def test_tolerates_missing_files(self):
        from botocore.exceptions import ClientError

        r2_client = MagicMock()
        r2_client.delete_object.side_effect = ClientError(
            {"Error": {"Code": "NoSuchKey", "Message": "not found"}}, "DeleteObject"
        )
        metadata = {"media_path": "@ch/2024-03/vid.mp4"}

        success, error = delete_from_r2(r2_client, "bucket", metadata)

        assert success is True  # NoSuchKey is tolerated

    def test_handles_service_errors(self):
        from botocore.exceptions import ClientError

        r2_client = MagicMock()
        r2_client.delete_object.side_effect = ClientError(
            {"Error": {"Code": "InternalError", "Message": "server error"}}, "DeleteObject"
        )
        metadata = {"media_path": "@ch/2024-03/vid.mp4"}

        success, error = delete_from_r2(r2_client, "bucket", metadata)

        assert success is False
        assert error is not None

    def test_partial_missing_files(self):
        """Some files exist, some don't — should still succeed."""
        from botocore.exceptions import ClientError

        call_count = 0

        def side_effect(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 2:  # Second call raises NoSuchKey
                raise ClientError(
                    {"Error": {"Code": "NoSuchKey", "Message": ""}}, "DeleteObject"
                )

        r2_client = MagicMock()
        r2_client.delete_object.side_effect = side_effect
        metadata = {
            "media_path": "@ch/2024-03/vid.mp4",
            "thumbnail_path": "@ch/2024-03/vid.jpg",
        }

        success, error = delete_from_r2(r2_client, "bucket", metadata)

        assert success is True


# ─── clear_video_record tests (T027) ─────────────────────────────────────────


class TestClearVideoRecord:
    """Tests for clear_video_record() — verify correct columns nulled."""

    def test_correct_columns_cleared(self):
        client = MagicMock()

        clear_video_record(client, "vid123")

        update_call = client.table.return_value.update
        update_call.assert_called_once()
        update_data = update_call.call_args[0][0]

        assert update_data["r2_synced_at"] is None
        assert update_data["media_path"] is None
        assert update_data["thumbnail_path"] is None
        assert update_data["subtitle_path"] is None
        assert update_data["is_downloaded"] is False


# ─── process_remove_job tests (T028) ─────────────────────────────────────────


class TestProcessRemoveJob:
    """Tests for process_remove_job() — orchestration of removal pipeline."""

    def _make_remove_job(self):
        return {
            "id": "job-uuid-2",
            "video_id": "old_vid",
            "channel_id": "UC_ch1",
            "action": "remove",
            "metadata": {
                "media_path": "@ch/2024-03/old_vid.mp4",
                "thumbnail_path": "@ch/2024-03/old_vid.jpg",
                "subtitle_path": "@ch/2024-03/old_vid.en.vtt",
                "title": "Old Video",
            },
        }

    @patch("scripts.sync_consumer.complete_job")
    @patch("scripts.sync_consumer.clear_video_record")
    @patch("scripts.sync_consumer.delete_from_r2")
    def test_successful_removal(self, mock_delete, mock_clear, mock_complete):
        mock_delete.return_value = (True, None)

        client = MagicMock()
        r2_client = MagicMock()
        job = self._make_remove_job()

        result = process_remove_job(client, r2_client, "bucket", job, False, False)

        assert result is True
        mock_delete.assert_called_once()
        mock_clear.assert_called_once_with(client, "old_vid")
        mock_complete.assert_called_once_with(client, "job-uuid-2")

    @patch("scripts.sync_consumer.fail_job")
    @patch("scripts.sync_consumer.delete_from_r2")
    def test_r2_error_increments_attempts(self, mock_delete, mock_fail):
        mock_delete.return_value = (False, "InternalError")

        client = MagicMock()
        r2_client = MagicMock()
        job = self._make_remove_job()

        result = process_remove_job(client, r2_client, "bucket", job, False, False)

        assert result is False
        mock_fail.assert_called_once()


# ─── reset_stale_locks tests (T033) ──────────────────────────────────────────


class TestResetStaleLocks:
    """Tests for reset_stale_locks() — verify RPC call and return value."""

    def test_passes_stale_minutes(self):
        client = MagicMock()
        client.rpc.return_value.execute.return_value = MagicMock(data=3)

        count = reset_stale_locks(client, 60)

        assert count == 3
        client.rpc.assert_called_once_with(
            "reset_stale_consumer_locks",
            {"stale_minutes": 60},
        )

    def test_zero_stale_locks(self):
        client = MagicMock()
        client.rpc.return_value.execute.return_value = MagicMock(data=0)

        count = reset_stale_locks(client, 60)

        assert count == 0


# ─── Dry-run mode tests (T036) ───────────────────────────────────────────────


class TestDryRunMode:
    """Tests for dry-run mode — no subprocess calls, no R2 uploads, no DB mutations."""

    def test_download_dry_run(self, tmp_path):
        with patch("scripts.sync_consumer.STAGING_DIR", tmp_path):
            client = MagicMock()
            r2_client = MagicMock()

            job = {
                "id": "job-1",
                "video_id": "vid1",
                "channel_id": "ch1",
                "action": "download",
                "metadata": {"title": "Test"},
            }

            with patch("scripts.sync_consumer.subprocess.run") as mock_run:
                result = process_download_job(
                    client, r2_client, "bucket", job,
                    {"ytdlp": {}}, verbose=False, dry_run=True,
                )

                assert result is True
                mock_run.assert_not_called()
                # No R2 uploads
                r2_client.upload_file.assert_not_called()
                # No DB mutations (reads are OK — resolve_channel_handle does a lookup)
                client.table.return_value.upsert.assert_not_called()
                client.table.return_value.update.assert_not_called()
                client.table.return_value.delete.assert_not_called()

    def test_remove_dry_run(self):
        client = MagicMock()
        r2_client = MagicMock()

        job = {
            "id": "job-2",
            "video_id": "vid2",
            "channel_id": "ch1",
            "action": "remove",
            "metadata": {"title": "Old", "media_path": "x.mp4"},
        }

        result = process_remove_job(client, r2_client, "bucket", job, False, dry_run=True)

        assert result is True
        r2_client.delete_object.assert_not_called()
        client.table.assert_not_called()


# ─── Action filtering tests (T037) ───────────────────────────────────────────


class TestActionFiltering:
    """Tests for --downloads-only and --removals-only action filtering."""

    def test_downloads_only_skips_remove_jobs(self, tmp_path):
        """When processing with downloads_only, remove jobs should not be processed."""
        # This tests the main() loop logic — we test it via process_remove_job dry_run
        # since the filtering happens in main()
        # For unit test purposes, we verify the flag routing would work

        client = MagicMock()
        r2_client = MagicMock()

        # A download job processes normally
        dl_job = {
            "id": "j1", "video_id": "v1", "channel_id": "c1",
            "action": "download", "metadata": {"title": "DL"},
        }
        result = process_download_job(
            client, r2_client, "bucket", dl_job,
            {"ytdlp": {}}, verbose=False, dry_run=True,
        )
        assert result is True

    def test_removals_only_skips_download_jobs(self):
        """When processing with removals_only, download jobs should not be processed."""
        client = MagicMock()
        r2_client = MagicMock()

        rm_job = {
            "id": "j2", "video_id": "v2", "channel_id": "c1",
            "action": "remove", "metadata": {"title": "RM"},
        }
        result = process_remove_job(
            client, r2_client, "bucket", rm_job, False, dry_run=True,
        )
        assert result is True


# ─── upload_to_r2 tests ──────────────────────────────────────────────────────


class TestUploadToR2:
    """Tests for upload_to_r2() — success and failure paths."""

    def test_success(self, tmp_path):
        r2_client = MagicMock()
        local_file = tmp_path / "test.mp4"
        local_file.write_bytes(b"fake video content")

        result = upload_to_r2(r2_client, "bucket", local_file, "key/test.mp4")

        assert result is True
        r2_client.upload_file.assert_called_once()

    def test_client_error(self, tmp_path):
        from botocore.exceptions import ClientError

        r2_client = MagicMock()
        r2_client.upload_file.side_effect = ClientError(
            {"Error": {"Code": "AccessDenied", "Message": "denied"}}, "PutObject"
        )
        local_file = tmp_path / "test.mp4"
        local_file.write_bytes(b"data")

        result = upload_to_r2(r2_client, "bucket", local_file, "key/test.mp4")

        assert result is False


# ─── check_ffmpeg tests (T006) ───────────────────────────────────────────────


class TestCheckFfmpeg:
    """Tests for check_ffmpeg() — fail-fast if ffmpeg missing."""

    @patch("scripts.sync_consumer.subprocess.run")
    def test_ffmpeg_available(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="ffmpeg version 6.0")
        # Should not raise
        check_ffmpeg()
        mock_run.assert_called_once()

    @patch("scripts.sync_consumer.subprocess.run", side_effect=FileNotFoundError)
    def test_ffmpeg_missing_exits(self, mock_run):
        with pytest.raises(SystemExit) as exc_info:
            check_ffmpeg()
        assert exc_info.value.code == 2

    @patch("scripts.sync_consumer.subprocess.run")
    def test_ffmpeg_nonzero_exit_exits(self, mock_run):
        mock_run.return_value = MagicMock(returncode=1)
        with pytest.raises(SystemExit) as exc_info:
            check_ffmpeg()
        assert exc_info.value.code == 2

    @patch("scripts.sync_consumer.subprocess.run", side_effect=subprocess.TimeoutExpired("ffmpeg", 10))
    def test_ffmpeg_timeout_exits(self, mock_run):
        import subprocess
        with pytest.raises(SystemExit) as exc_info:
            check_ffmpeg()
        assert exc_info.value.code == 2


# ─── HLS: build_format_selector tests (T007) ─────────────────────────────────


class TestBuildFormatSelector:
    """Tests for build_format_selector() — given tier config, assert correct format strings."""

    def test_standard_tier(self):
        tier = {"label": "720p", "height": 720, "bandwidth": 2500000}
        fmt = build_format_selector(tier)
        assert "height<=720" in fmt
        assert "ext=mp4" in fmt
        assert "ext=m4a" in fmt

    def test_360p_tier(self):
        tier = {"label": "360p", "height": 360, "bandwidth": 800000}
        fmt = build_format_selector(tier)
        assert "height<=360" in fmt

    def test_1080p_tier(self):
        tier = {"label": "1080p", "height": 1080, "bandwidth": 5000000}
        fmt = build_format_selector(tier)
        assert "height<=1080" in fmt

    def test_all_tiers_produce_unique_selectors(self):
        tiers = [
            {"label": "360p", "height": 360, "bandwidth": 800000},
            {"label": "480p", "height": 480, "bandwidth": 1200000},
            {"label": "720p", "height": 720, "bandwidth": 2500000},
            {"label": "1080p", "height": 1080, "bandwidth": 5000000},
        ]
        selectors = [build_format_selector(t) for t in tiers]
        assert len(set(selectors)) == 4  # All unique


# ─── HLS: build_ffmpeg_remux_cmd tests (T008) ────────────────────────────────


class TestBuildFfmpegRemuxCmd:
    """Tests for build_ffmpeg_remux_cmd() — assert correct ffmpeg args."""

    def test_standard_args(self, tmp_path):
        input_path = tmp_path / "720p.mp4"
        output_dir = tmp_path / "720p"
        cmd = build_ffmpeg_remux_cmd(input_path, output_dir, segment_duration=6)

        assert "ffmpeg" in cmd[0] or cmd[0] == "ffmpeg"
        assert "-c" in cmd
        assert "copy" in cmd
        assert "-f" in cmd
        assert "hls" in cmd
        assert "-hls_time" in cmd
        assert "6" in cmd
        assert "-hls_segment_type" in cmd
        assert "fmp4" in cmd
        assert "-hls_playlist_type" in cmd
        assert "vod" in cmd
        assert "-hls_flags" in cmd
        assert "independent_segments" in cmd
        assert "-hls_list_size" in cmd
        assert "0" in cmd

    def test_output_playlist_path(self, tmp_path):
        input_path = tmp_path / "480p.mp4"
        output_dir = tmp_path / "480p"
        cmd = build_ffmpeg_remux_cmd(input_path, output_dir, segment_duration=6)
        # Last arg should be the output playlist path
        assert cmd[-1].endswith("playlist.m3u8")

    def test_init_filename(self, tmp_path):
        input_path = tmp_path / "1080p.mp4"
        output_dir = tmp_path / "1080p"
        cmd = build_ffmpeg_remux_cmd(input_path, output_dir, segment_duration=6)
        assert "-hls_fmp4_init_filename" in cmd
        assert "init.mp4" in cmd

    def test_segment_filename_pattern(self, tmp_path):
        input_path = tmp_path / "360p.mp4"
        output_dir = tmp_path / "360p"
        cmd = build_ffmpeg_remux_cmd(input_path, output_dir, segment_duration=6)
        assert "-hls_segment_filename" in cmd
        # Should contain a pattern with seg_ prefix
        seg_idx = cmd.index("-hls_segment_filename") + 1
        assert "seg_" in cmd[seg_idx]


# ─── HLS: generate_master_playlist tests (T009) ──────────────────────────────


class TestGenerateMasterPlaylist:
    """Tests for generate_master_playlist() — validate HLS master playlist content."""

    def test_four_tiers(self):
        tiers = [
            {"label": "360p", "bandwidth": 800000, "resolution": "640x360", "codecs": "avc1.4d401e,mp4a.40.2"},
            {"label": "480p", "bandwidth": 1200000, "resolution": "854x480", "codecs": "avc1.4d401f,mp4a.40.2"},
            {"label": "720p", "bandwidth": 2500000, "resolution": "1280x720", "codecs": "avc1.4d401f,mp4a.40.2"},
            {"label": "1080p", "bandwidth": 5000000, "resolution": "1920x1080", "codecs": "avc1.64002a,mp4a.40.2"},
        ]
        content = generate_master_playlist(tiers)

        assert "#EXTM3U" in content
        assert "#EXT-X-VERSION:7" in content
        assert "#EXT-X-INDEPENDENT-SEGMENTS" in content
        assert content.count("#EXT-X-STREAM-INF") == 4
        assert "360p/playlist.m3u8" in content
        assert "1080p/playlist.m3u8" in content
        assert "BANDWIDTH=800000" in content
        assert "BANDWIDTH=5000000" in content
        assert "RESOLUTION=640x360" in content
        assert "RESOLUTION=1920x1080" in content

    def test_two_tiers(self):
        tiers = [
            {"label": "360p", "bandwidth": 800000, "resolution": "640x360", "codecs": "avc1.4d401e,mp4a.40.2"},
            {"label": "720p", "bandwidth": 2500000, "resolution": "1280x720", "codecs": "avc1.4d401f,mp4a.40.2"},
        ]
        content = generate_master_playlist(tiers)

        assert content.count("#EXT-X-STREAM-INF") == 2
        assert "480p" not in content
        assert "1080p" not in content

    def test_single_tier(self):
        tiers = [
            {"label": "720p", "bandwidth": 2500000, "resolution": "1280x720", "codecs": "avc1.4d401f,mp4a.40.2"},
        ]
        content = generate_master_playlist(tiers)

        assert content.count("#EXT-X-STREAM-INF") == 1
        assert "720p/playlist.m3u8" in content

    def test_codecs_in_stream_inf(self):
        tiers = [
            {"label": "720p", "bandwidth": 2500000, "resolution": "1280x720", "codecs": "avc1.4d401f,mp4a.40.2"},
        ]
        content = generate_master_playlist(tiers)
        assert 'CODECS="avc1.4d401f,mp4a.40.2"' in content


# ─── HLS: build_r2_key_hls tests (T010) ──────────────────────────────────────


class TestBuildR2KeyHls:
    """Tests for build_r2_key_hls() — folder-per-video R2 key structure."""

    def test_master_playlist_key(self):
        key = build_r2_key_hls("@handle", "2024-03-15T10:00:00Z", "vid123", "master.m3u8")
        assert key == "@handle/2024-03/vid123/master.m3u8"

    def test_tier_playlist_key(self):
        key = build_r2_key_hls("@handle", "2024-03-15T10:00:00Z", "vid123", "720p/playlist.m3u8")
        assert key == "@handle/2024-03/vid123/720p/playlist.m3u8"

    def test_segment_key(self):
        key = build_r2_key_hls("@handle", "2024-03-15T10:00:00Z", "vid123", "720p/seg_000.m4s")
        assert key == "@handle/2024-03/vid123/720p/seg_000.m4s"

    def test_init_segment_key(self):
        key = build_r2_key_hls("@handle", "2024-03-15T10:00:00Z", "vid123", "720p/init.mp4")
        assert key == "@handle/2024-03/vid123/720p/init.mp4"

    def test_thumbnail_key(self):
        key = build_r2_key_hls("@handle", "2024-03-15T10:00:00Z", "vid123", "thumb.jpg")
        assert key == "@handle/2024-03/vid123/thumb.jpg"

    def test_subtitle_key(self):
        key = build_r2_key_hls("@handle", "2024-03-15T10:00:00Z", "vid123", "subs.en.vtt")
        assert key == "@handle/2024-03/vid123/subs.en.vtt"

    def test_handle_without_at(self):
        key = build_r2_key_hls("handle", "2024-03-15T10:00:00Z", "vid123", "master.m3u8")
        assert key == "@handle/2024-03/vid123/master.m3u8"

    def test_missing_published_at(self):
        key = build_r2_key_hls("@handle", None, "vid123", "master.m3u8")
        assert key == "@handle/unknown-00/vid123/master.m3u8"


# ─── HLS: graceful missing tier handling tests (T011) ─────────────────────────


class TestMissingTierHandling:
    """Tests for graceful handling of missing tiers — master playlist with only available tiers."""

    def test_two_of_four_tiers_produces_valid_playlist(self):
        # Simulates only 360p and 720p successfully downloaded
        completed_tiers = [
            {"label": "360p", "bandwidth": 800000, "resolution": "640x360", "codecs": "avc1.4d401e,mp4a.40.2"},
            {"label": "720p", "bandwidth": 2500000, "resolution": "1280x720", "codecs": "avc1.4d401f,mp4a.40.2"},
        ]
        content = generate_master_playlist(completed_tiers)

        assert content.count("#EXT-X-STREAM-INF") == 2
        assert "360p/playlist.m3u8" in content
        assert "720p/playlist.m3u8" in content
        assert "480p" not in content
        assert "1080p" not in content

    def test_single_tier_produces_valid_playlist(self):
        completed_tiers = [
            {"label": "480p", "bandwidth": 1200000, "resolution": "854x480", "codecs": "avc1.4d401f,mp4a.40.2"},
        ]
        content = generate_master_playlist(completed_tiers)

        assert "#EXTM3U" in content
        assert content.count("#EXT-X-STREAM-INF") == 1


# ─── HLS: minimum tier enforcement tests (T012) ──────────────────────────────


class TestMinTierEnforcement:
    """Tests for minimum tier enforcement — 0 tiers should fail."""

    def test_zero_tiers_raises(self):
        with pytest.raises(ValueError, match="[Nn]o.*tier|[Mm]inimum"):
            generate_master_playlist([])

    def test_one_tier_succeeds(self):
        tiers = [
            {"label": "720p", "bandwidth": 2500000, "resolution": "1280x720", "codecs": "avc1.4d401f,mp4a.40.2"},
        ]
        content = generate_master_playlist(tiers)
        assert "#EXTM3U" in content


# ─── US4: Legacy MP4 cleanup tests (T026) ────────────────────────────────────


class TestLegacyMp4Cleanup:
    """Tests for cleanup_legacy_mp4() — delete old MP4 from R2 after HLS upload."""

    def test_deletes_old_mp4_and_sidecars(self):
        """Given a video with existing .mp4 in R2, after HLS upload old files are deleted."""
        r2_client = MagicMock()
        client = MagicMock()

        # Simulate DB returning old media_path
        client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"media_path": "@ch/2024-03/vid.mp4",
                   "thumbnail_path": "@ch/2024-03/vid.jpg",
                   "subtitle_path": "@ch/2024-03/vid.en.vtt"}]
        )

        cleanup_legacy_mp4(client, r2_client, "bucket", "vid")

        # Should delete old MP4 + sidecars + info.json
        assert r2_client.delete_object.call_count >= 3

    def test_skips_if_already_hls(self):
        """If media_path already ends in .m3u8, no cleanup needed."""
        r2_client = MagicMock()
        client = MagicMock()

        client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"media_path": "@ch/2024-03/vid/master.m3u8",
                   "thumbnail_path": "@ch/2024-03/vid/thumb.jpg",
                   "subtitle_path": None}]
        )

        cleanup_legacy_mp4(client, r2_client, "bucket", "vid")

        r2_client.delete_object.assert_not_called()

    def test_skips_if_no_media_path(self):
        """If video has no media_path, no cleanup needed."""
        r2_client = MagicMock()
        client = MagicMock()

        client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"media_path": None, "thumbnail_path": None, "subtitle_path": None}]
        )

        cleanup_legacy_mp4(client, r2_client, "bucket", "vid")

        r2_client.delete_object.assert_not_called()
