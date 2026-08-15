-- Tool usage tracking for real-time dashboard visibility.
-- Records every MCP tool call with agent identity, tool name, args, result, duration.

CREATE TABLE IF NOT EXISTS tool_usage_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        STRING NOT NULL,
    tool_name       STRING NOT NULL,
    args_summary    STRING,
    result_summary  STRING,
    duration_ms     INT,
    status          STRING NOT NULL DEFAULT 'ok',
    client_name     STRING,
    sub_tool        STRING,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX idx_tool_usage_agent (agent_id),
    INDEX idx_tool_usage_tool (tool_name),
    INDEX idx_tool_usage_time (created_at DESC)
) WITH (ttl_expire_after = INTERVAL '30 days' ON DELETE);

-- A2A handoff tracking for multi-agent collaboration visibility.
CREATE TABLE IF NOT EXISTS a2a_handoffs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_agent      STRING NOT NULL,
    to_agent        STRING NOT NULL,
    task_type       STRING NOT NULL,
    skill_used      STRING,
    message_preview STRING,
    status          STRING NOT NULL DEFAULT 'sent',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX idx_a2a_from (from_agent),
    INDEX idx_a2a_to (to_agent),
    INDEX idx_a2a_time (created_at DESC)
) WITH (ttl_expire_after = INTERVAL '30 days' ON DELETE);

-- CockroachDB tools usage summary (populated by dashboard queries).
CREATE TABLE IF NOT EXISTS crdb_tools_usage (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_category   STRING NOT NULL,
    tool_name       STRING NOT NULL,
    call_count      INT DEFAULT 0,
    last_called_at  TIMESTAMPTZ,
    agent_breakdown JSONB DEFAULT '{}',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE INDEX idx_crdb_tools_name (tool_name)
) WITH (ttl_expire_after = INTERVAL '90 days' ON DELETE);
