-- sync_queue: Job queue for video download/remove operations
-- Used by sync_producer.py (enqueue) and future consumer (dequeue)

CREATE TABLE IF NOT EXISTS sync_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id text NOT NULL,
    channel_id text NOT NULL,
    action text NOT NULL CHECK (action IN ('download', 'remove')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    priority integer NOT NULL DEFAULT 0,
    metadata jsonb,
    error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz,
    attempts integer NOT NULL DEFAULT 0
);

-- Prevent duplicate active jobs for the same video+action
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_queue_active_job
    ON sync_queue (video_id, action)
    WHERE status IN ('pending', 'processing');

-- Worker polling: find pending jobs ordered by creation time
CREATE INDEX IF NOT EXISTS idx_sync_queue_status_created
    ON sync_queue (status, created_at);

-- Enable RLS with permissive policy (single-user POC)
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to sync_queue"
    ON sync_queue
    FOR ALL
    USING (true)
    WITH CHECK (true);
