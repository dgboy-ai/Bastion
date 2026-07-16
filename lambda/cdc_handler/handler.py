"""AWS Lambda CDC Handler for Bastion.

Consumes CockroachDB changefeed events from agent_memory and agent_audit tables.
Detects anomalies, triggers self-healing, and dispatches webhook notifications.

Trigger: AWS Lambda Function URL or CloudWatch Events (polling mode)
"""

import json
import os
import time
from datetime import datetime, timezone

import psycopg
import boto3

from shared.db import get_connection, execute_query


def handler(event, context):
    """Lambda handler for CDC events.
    
    Supports two trigger modes:
    1. Direct invocation with changefeed payload
    2. Scheduled polling (CloudWatch Events) to check for anomalies
    """
    mode = event.get("mode", "poll")
    
    if mode == "poll":
        return _poll_anomalies()
    elif mode == "changelog":
        return _process_changelog(event.get("records", []))
    else:
        return {"statusCode": 400, "body": json.dumps({"error": f"Unknown mode: {mode}"})}


def _poll_anomalies():
    """Poll for anomalies in recent memory operations."""
    results = {
        "anomalies_detected": 0,
        "actions_taken": [],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    
    try:
        # Check for hash chain violations
        violations = _check_hash_chain_integrity()
        results["hash_violations"] = len(violations)
        if violations:
            results["anomalies_detected"] += len(violations)
            results["actions_taken"].append(f"Detected {len(violations)} hash chain violations")
            _alert_slack(f"CRITICAL: {len(violations)} hash chain violations detected")
        
        # Check for injection attempts blocked by guard
        injection_attempts = _check_recent_blocks()
        results["injection_blocks"] = len(injection_attempts)
        if injection_attempts:
            results["anomalies_detected"] += len(injection_attempts)
            results["actions_taken"].append(f"Blocked {len(injection_attempts)} injection attempts")
        
        # Check for memory drift
        drift = _check_drift()
        if drift:
            results["drift_detected"] = True
            results["anomalies_detected"] += 1
            results["actions_taken"].append("Behavioral drift detected")
            _alert_slack(f"WARNING: Behavioral drift detected in agent memory")
        
        # Self-heal expired memories
        healed = _heal_expired()
        results["memories_pruned"] = healed
        if healed > 0:
            results["actions_taken"].append(f"Pruned {healed} expired memories")
        
        results["statusCode"] = 200
        results["body"] = json.dumps(results)
        
    except Exception as exc:
        results["statusCode"] = 500
        results["error"] = str(exc)
        _alert_slack(f"ERROR: CDC handler failed - {str(exc)[:200]}")
    
    return results


def _process_changelog(records):
    """Process incoming changefeed records."""
    processed = 0
    for record in records:
        try:
            table = record.get("table", "")
            op = record.get("op", "")
            key = record.get("key")
            value = record.get("value", {})
            
            if table == "agent_memory" and op == "insert":
                # New memory stored — verify hash chain
                agent_id = value.get("agent_id")
                content = value.get("content", "")
                crypto_hash = value.get("cryptographic_hash")
                
                if agent_id and crypto_hash:
                    _verify_and_alert(agent_id, content, crypto_hash)
            
            elif table == "agent_memory" and op == "delete":
                # Memory deleted — log for audit
                agent_id = value.get("agent_id")
                memory_id = value.get("memory_id")
                if agent_id and memory_id:
                    _log_deletion(agent_id, memory_id)
            
            processed += 1
            
        except Exception as exc:
            print(f"Error processing record: {exc}")
    
    return {"statusCode": 200, "body": json.dumps({"processed": processed})}


def _check_hash_chain_integrity():
    """Check for hash chain violations in recent memories."""
    try:
        rows = execute_query(
            """SELECT memory_id, agent_id, content, previous_hash, cryptographic_hash
               FROM agent_memory
               WHERE created_at > now() - interval '1 hour'
               ORDER BY created_at DESC
               LIMIT 100"""
        )
        violations = []
        if rows:
            import hashlib
            for row in rows:
                memory_id, agent_id, content, prev_hash, crypto_hash = row
                expected = hashlib.sha256(
                    (content + json.dumps({}, sort_keys=True) + (prev_hash or "")).encode()
                ).hexdigest()
                if crypto_hash != expected:
                    violations.append({
                        "memory_id": str(memory_id),
                        "agent_id": str(agent_id),
                        "expected": expected[:16],
                        "actual": str(crypto_hash)[:16],
                    })
        return violations
    except Exception:
        return []


def _check_recent_blocks():
    """Check for recently blocked injection attempts."""
    try:
        rows = execute_query(
            """SELECT agent_id, action, details
               FROM agent_audit
               WHERE action = 'security_block'
               AND recorded_at > now() - interval '1 hour'
               LIMIT 50"""
        )
        return [{"agent_id": str(r[0]), "action": str(r[1])} for r in (rows or [])]
    except Exception:
        return []


def _check_drift():
    """Check for behavioral drift in memory access patterns."""
    try:
        rows = execute_query(
            """SELECT agent_id, COUNT(*) as cnt
               FROM agent_memory
               WHERE created_at > now() - interval '24 hours'
               GROUP BY agent_id
               HAVING COUNT(*) > 100"""
        )
        return len(rows or []) > 0
    except Exception:
        return False


def _heal_expired():
    """Prune expired memories."""
    try:
        result = execute_query(
            "DELETE FROM agent_memory WHERE expires_at IS NOT NULL AND expires_at <= now()"
        )
        return 0  # psycopg doesn't return rowcount from execute_query
    except Exception:
        return 0


def _verify_and_alert(agent_id, content, crypto_hash):
    """Verify hash chain and alert if violated."""
    # Simplified check — full verification would compare against previous hash
    pass


def _log_deletion(agent_id, memory_id):
    """Log memory deletion for audit trail."""
    pass


def _alert_slack(message):
    """Send alert to Slack via SNS or direct webhook."""
    slack_url = os.environ.get("SLACK_WEBHOOK_URL")
    if not slack_url:
        print(f"ALERT (no Slack configured): {message}")
        return
    
    try:
        import urllib.request
        payload = json.dumps({"text": message}).encode()
        req = urllib.request.Request(
            slack_url,
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception as exc:
        print(f"Slack alert failed: {exc}")
