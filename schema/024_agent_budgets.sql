CREATE TABLE IF NOT EXISTS agent_budgets (
    agent_id STRING PRIMARY KEY,
    daily_searches INT DEFAULT 0,
    daily_stores INT DEFAULT 0,
    daily_embeds INT DEFAULT 0,
    daily_heals INT DEFAULT 0,
    budget_date DATE DEFAULT current_date(),
    hard_limit_searches INT DEFAULT 10000,
    hard_limit_stores INT DEFAULT 5000,
    hard_limit_embeds INT DEFAULT 2000,
    hard_limit_heals INT DEFAULT 100,
    is_suspended BOOLEAN DEFAULT false,
    suspension_reason STRING,
    last_warning_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_budgets_date ON agent_budgets (budget_date);
CREATE INDEX IF NOT EXISTS idx_agent_budgets_suspended ON agent_budgets (is_suspended) WHERE is_suspended = true;
