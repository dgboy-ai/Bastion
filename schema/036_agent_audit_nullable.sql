-- GDPR right-to-erasure (compliance.py) and other governance paths audit events
-- that are not tied to a checkpoint workflow. Make workflow_id nullable so these
-- INSERTs succeed against the real schema (was NOT NULL in 003_agent_audit.sql).
ALTER TABLE agent_audit ALTER COLUMN workflow_id DROP NOT NULL;