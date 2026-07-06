CREATE TABLE IF NOT EXISTS agent_drift_baselines (
    agent_id STRING NOT NULL,
    dimension STRING NOT NULL,
    mean FLOAT NOT NULL,
    stddev FLOAT NOT NULL,
    sample_count INT NOT NULL,
    baseline_window STRING NOT NULL DEFAULT '7d',
    established_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (agent_id, dimension)
);

CREATE TABLE IF NOT EXISTS agent_drift_scores (
    score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id STRING NOT NULL,
    overall_drift_score FLOAT NOT NULL,
    dimensions JSONB NOT NULL,
    baseline_sessions INT NOT NULL,
    alert_threshold FLOAT NOT NULL DEFAULT 0.3,
    status STRING NOT NULL DEFAULT 'HEALTHY',
    top_drift_signals JSONB,
    recommendation STRING,
    scorable_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drift_scores_agent_time ON agent_drift_scores (agent_id, scorable_at DESC);
