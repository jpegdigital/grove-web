-- Enqueue sync jobs with ON CONFLICT DO NOTHING (respects partial unique index)
CREATE OR REPLACE FUNCTION enqueue_sync_jobs(jobs jsonb)
RETURNS integer AS $$
DECLARE
    job jsonb;
    inserted integer := 0;
BEGIN
    FOR job IN SELECT * FROM jsonb_array_elements(jobs)
    LOOP
        INSERT INTO sync_queue (video_id, channel_id, action, status, metadata)
        VALUES (
            job->>'video_id',
            job->>'channel_id',
            job->>'action',
            'pending',
            COALESCE(job->'metadata', '{}'::jsonb)
        )
        ON CONFLICT DO NOTHING;

        IF FOUND THEN
            inserted := inserted + 1;
        END IF;
    END LOOP;

    RETURN inserted;
END;
$$ LANGUAGE plpgsql;

-- Get distinct channel_ids from videos table
CREATE OR REPLACE FUNCTION get_distinct_video_channel_ids()
RETURNS TABLE(channel_id text) AS $$
    SELECT DISTINCT v.channel_id
    FROM videos v
    WHERE v.channel_id IS NOT NULL;
$$ LANGUAGE sql STABLE;
