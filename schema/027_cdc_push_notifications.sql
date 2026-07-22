CREATE TABLE IF NOT EXISTS push_notification_log (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL,
    callback_url STRING NOT NULL,
    status STRING NOT NULL,
    payload JSONB,
    delivery_attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    last_attempt_at TIMESTAMPTZ,
    last_status_code INT,
    last_error STRING,
    next_retry_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_notif_pending ON push_notification_log (next_retry_at) WHERE delivered_at IS NULL AND next_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_push_notif_task ON push_notification_log (task_id);
