-- claim_consumer_jobs: Atomic batch pickup with FOR UPDATE SKIP LOCKED
-- Prevents race conditions between concurrent consumers.
CREATE OR REPLACE FUNCTION claim_consumer_jobs(
    batch_size integer,
    max_attempts integer
)
RETURNS SETOF sync_queue AS $$
    UPDATE sync_queue
    SET status = 'processing', started_at = NOW()
    WHERE id IN (
        SELECT id FROM sync_queue
        WHERE status = 'pending'
          AND attempts < max_attempts
        ORDER BY priority DESC, created_at ASC
        LIMIT batch_size
        FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
$$ LANGUAGE sql;

-- reset_stale_consumer_locks: Reset jobs stuck in processing beyond timeout.
-- Does NOT increment attempt count (crash wasn't the job's fault).
CREATE OR REPLACE FUNCTION reset_stale_consumer_locks(
    stale_minutes integer
)
RETURNS integer AS $$
DECLARE
    reset_count integer;
BEGIN
    UPDATE sync_queue
    SET status = 'pending', started_at = NULL
    WHERE status = 'processing'
      AND started_at < NOW() - (stale_minutes || ' minutes')::interval;
    GET DIAGNOSTICS reset_count = ROW_COUNT;
    RETURN reset_count;
END;
$$ LANGUAGE plpgsql;
