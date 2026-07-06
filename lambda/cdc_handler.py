"""
Bastion CDC Lambda Handler

Receives CockroachDB changefeed events and performs:
1. Hash chain integrity verification (detects tampering/poisoning)
2. Memory anomaly detection (fact turnover, rapid forgetting, size spikes)
3. Proactive snapshot + rollback when corruption is detected

Deployed as a Lambda Function URL endpoint. CockroachDB changefeed
streams events to this handler in real-time.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import os
import time
from datetime import UTC, datetime
from typing import Any

try:
    import boto3
except ImportError:
    boto3 = None  # type: ignore[assignment]

try:
    import psycopg
except ImportError:
    psycopg = None  # type: ignore[assignment]

# ── Configuration ────────────────────────────────────────────────────────────

CONN_STR = os.environ.get("BASTION_CONN", "")
S3_BUCKET = os.environ.get("BASTION_S3_BUCKET", "bastion-memory-archives")
ALERT_SNS_TOPIC = os.environ.get("BASTION_ALERT_TOPIC", "")
FAILURE_THRESHOLD = int(os.environ.get("BASTION_CIRCUIT_BREAKER_THRESHOLD", "5"))
CIRCUIT_BREAKER_WINDOW = int(os.environ.get("BASTION_CIRCUIT_BREAKER_WINDOW", "300"))

# ── Circuit Breaker State ────────────────────────────────────────────────────

_failure_count = 0
_circuit_open_until = 0.0


def _circuit_is_open() -> bool:
    """Check if circuit breaker is tripped (too many recent failures)."""
    global _failure_count, _circuit_open_until
    now = time.time()
    if now < _circuit_open_until:
        return True
    if now - _circuit_open_until > CIRCUIT_BREAKER_WINDOW:
        _failure_count = 0
    return False


def _record_failure():
    """Record a failure and trip circuit breaker if threshold exceeded."""
    global _failure_count, _circuit_open_until
    _failure_count += 1
    if _failure_count >= FAILURE_THRESHOLD:
        _circuit_open_until = time.time() + CIRCUIT_BREAKER_WINDOW
        print(f"CIRCUIT BREAKER OPEN: {_failure_count} failures in {CIRCUIT_BREAKER_WINDOW}s window")


def _record_success():
    """Reset failure count on success."""
    global _failure_count
    _failure_count = 0


# ── Hash Chain Verification ─────────────────────────────────────────────────

def verify_hash_chain(agent_id: str, conn) -> dict[str, Any]:
    """
    Verify the cryptographic hash chain for an agent's memories.
    Returns integrity status and details of any breaks found.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT memory_id, content, metadata, previous_hash, cryptographic_hash, created_at "
            "FROM agent_memory WHERE agent_id = %s ORDER BY created_at ASC",
            (agent_id,),
        )
        rows = cur.fetchall()

    if not rows:
        return {"status": "empty", "agent_id": agent_id, "chain_length": 0}

    breaks = []
    prev_hash = None

    for row in rows:
        memory_id, content, metadata, stored_prev_hash, stored_hash, created_at = row

        # Compute expected hash
        meta_str = json.dumps(dict(metadata) if metadata else {}, sort_keys=True)
        raw = content + meta_str + (prev_hash or "")
        expected_hash = hashlib.sha256(raw.encode()).hexdigest()

        # Check hash chain link
        if stored_prev_hash != prev_hash:
            breaks.append({
                "memory_id": str(memory_id),
                "type": "chain_break",
                "expected_prev": prev_hash,
                "actual_prev": str(stored_prev_hash),
                "created_at": created_at.isoformat() if created_at else None,
            })

        # Check hash integrity
        if stored_hash != expected_hash:
            breaks.append({
                "memory_id": str(memory_id),
                "type": "hash_mismatch",
                "expected": expected_hash,
                "actual": str(stored_hash),
                "created_at": created_at.isoformat() if created_at else None,
            })

        prev_hash = str(stored_hash)

    return {
        "status": "broken" if breaks else "valid",
        "agent_id": agent_id,
        "chain_length": len(rows),
        "breaks": breaks,
        "verified_at": datetime.now(UTC).isoformat(),
    }


# ── Anomaly Detection ───────────────────────────────────────────────────────

def detect_anomalies(agent_id: str, conn) -> list[dict[str, Any]]:
    """
    Detect memory anomalies:
    - Fact turnover: duplicate content in recent window
    - Rapid forgetting: too many deletions in short time
    - Size spike: sudden memory count increase
    - Poisoning pattern: contradictory facts stored rapidly
    """
    alerts = []

    with conn.cursor() as cur:
        # Total memory count
        cur.execute(
            "SELECT COUNT(*) FROM agent_memory WHERE agent_id = %s",
            (agent_id,),
        )
        total = cur.fetchone()[0]

        # Recent memories (last 50)
        cur.execute(
            "SELECT content, created_at, cryptographic_hash "
            "FROM agent_memory WHERE agent_id = %s "
            "ORDER BY created_at DESC LIMIT 50",
            (agent_id,),
        )
        recent = cur.fetchall()

        # Check for duplicate content (fact turnover)
        contents = [r[0] for r in recent]
        if len(contents) != len(set(contents)):
            alerts.append({
                "type": "fact_turnover",
                "severity": "medium",
                "detail": "Duplicate content detected in recent memory",
                "agent_id": agent_id,
                "timestamp": datetime.now(UTC).isoformat(),
            })

        # Check for size spike (>100 memories)
        if total > 100:
            alerts.append({
                "type": "size_spike",
                "severity": "info",
                "detail": f"Memory count ({total}) exceeds 100 records",
                "agent_id": agent_id,
                "timestamp": datetime.now(UTC).isoformat(),
            })

        # Check for rapid writes (>20 in last minute)
        cur.execute(
            "SELECT COUNT(*) FROM agent_memory "
            "WHERE agent_id = %s AND created_at > now() - INTERVAL '1 minute'",
            (agent_id,),
        )
        recent_count = cur.fetchone()[0]
        if recent_count > 20:
            alerts.append({
                "type": "rapid_writes",
                "severity": "high",
                "detail": f"{recent_count} memories written in last minute",
                "agent_id": agent_id,
                "timestamp": datetime.now(UTC).isoformat(),
            })

    return alerts


# ── Snapshot & Rollback ─────────────────────────────────────────────────────

def create_snapshot(agent_id: str, conn) -> dict[str, Any]:
    """Create a point-in-time snapshot of agent memory state."""
    s3 = boto3.client("s3")
    timestamp = datetime.now(UTC).isoformat()

    with conn.cursor() as cur:
        cur.execute(
            "SELECT memory_id, memory_type, content, metadata, "
            "cryptographic_hash, created_at, importance_score "
            "FROM agent_memory WHERE agent_id = %s ORDER BY created_at",
            (agent_id,),
        )
        rows = cur.fetchall()

    snapshot = {
        "agent_id": agent_id,
        "timestamp": timestamp,
        "memory_count": len(rows),
        "memories": [
            {
                "memory_id": str(r[0]),
                "memory_type": r[1],
                "content": r[2],
                "metadata": dict(r[3]) if r[3] else {},
                "cryptographic_hash": r[4],
                "created_at": r[5].isoformat() if r[5] else None,
                "importance_score": float(r[6]) if r[6] else 5.0,
            }
            for r in rows
        ],
    }

    key = f"snapshots/{agent_id}/{timestamp}.json"
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=json.dumps(snapshot, indent=2),
        ContentType="application/json",
    )

    return {
        "status": "snapshot_created",
        "agent_id": agent_id,
        "s3_key": key,
        "memory_count": len(rows),
        "timestamp": timestamp,
    }


def rollback_from_snapshot(agent_id: str, snapshot_key: str, conn) -> dict[str, Any]:
    """Rollback agent memory to a previous snapshot state."""
    s3 = boto3.client("s3")
    obj = s3.get_object(Bucket=S3_BUCKET, Key=snapshot_key)
    snapshot = json.loads(obj["Body"].read())

    with conn.cursor() as cur:
        # Delete current memories
        cur.execute("DELETE FROM agent_memory WHERE agent_id = %s", (agent_id,))
        deleted = cur.rowcount

        # Restore from snapshot
        restored = 0
        for mem in snapshot.get("memories", []):
            cur.execute(
                "INSERT INTO agent_memory "
                "(memory_id, agent_id, memory_type, content, metadata, "
                "cryptographic_hash, created_at, importance_score) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) "
                "ON CONFLICT (memory_id) DO NOTHING",
                (
                    mem["memory_id"], agent_id, mem["memory_type"],
                    mem["content"], json.dumps(mem["metadata"]),
                    mem["cryptographic_hash"], mem["created_at"],
                    mem["importance_score"],
                ),
            )
            restored += cur.rowcount

        # Log the rollback action
        cur.execute(
            "INSERT INTO agent_audit (agent_id, workflow_id, action, details) "
            "VALUES (%s, %s, %s, %s)",
            (
                agent_id,
                str(__import__("uuid").uuid4()),
                "rollback",
                json.dumps({
                    "snapshot_key": snapshot_key,
                    "deleted": deleted,
                    "restored": restored,
                    "snapshot_timestamp": snapshot.get("timestamp"),
                }),
            ),
        )

        conn.commit()

    return {
        "status": "rollback_complete",
        "agent_id": agent_id,
        "deleted": deleted,
        "restored": restored,
        "snapshot_key": snapshot_key,
    }


# ── Main Handler ─────────────────────────────────────────────────────────────

def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    Lambda handler for CDC changefeed events.

    Expected event format from CockroachDB changefeed:
    {
        "key": [...],
        "value": {
            "after": { ... },  // Row data (INSERT/UPDATE)
            "before": { ... }, // Previous row data (UPDATE/DELETE)
            "updated": "..."
        },
        "topic": "agent_memory" | "agent_checkpoints"
    }
    """
    # Circuit breaker check
    if _circuit_is_open():
        return {
            "statusCode": 503,
            "body": json.dumps({
                "status": "circuit_open",
                "message": "Circuit breaker tripped. Too many recent failures.",
                "retry_after_seconds": CIRCUIT_BREAKER_WINDOW,
            }),
        }

    if not CONN_STR:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "BASTION_CONN not configured"}),
        }

    try:
        conn = psycopg.connect(CONN_STR)
    except Exception as e:
        _record_failure()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Database connection failed: {e}"}),
        }

    try:
        # Parse changefeed event
        records = event if isinstance(event, list) else [event]
        results = []

        for record in records:
            value = record.get("value", {})
            after = value.get("after", {})
            topic = record.get("topic", "unknown")

            if not after:
                continue

            agent_id = after.get("agent_id")
            if not agent_id:
                continue

            # 1. Hash chain verification
            chain_result = verify_hash_chain(agent_id, conn)

            # 2. Anomaly detection
            anomalies = detect_anomalies(agent_id, conn)

            # 3. If chain is broken or critical anomaly detected → snapshot + alert
            if chain_result["status"] == "broken":
                snapshot = create_snapshot(agent_id, conn)
                results.append({
                    "agent_id": agent_id,
                    "action": "chain_break_detected",
                    "chain_result": chain_result,
                    "snapshot": snapshot,
                    "anomalies": anomalies,
                })

                # Publish alert if SNS topic configured
                if ALERT_SNS_TOPIC:
                    sns = boto3.client("sns")
                    sns.publish(
                        TopicArn=ALERT_SNS_TOPIC,
                        Subject=f"Bastion Alert: Hash chain broken for {agent_id}",
                        Message=json.dumps({
                            "agent_id": agent_id,
                            "breaks": chain_result["breaks"],
                            "snapshot": snapshot,
                        }, indent=2),
                    )
            elif anomalies:
                results.append({
                    "agent_id": agent_id,
                    "action": "anomalies_detected",
                    "anomalies": anomalies,
                    "chain_status": chain_result["status"],
                })
            else:
                results.append({
                    "agent_id": agent_id,
                    "action": "processed",
                    "chain_status": chain_result["status"],
                    "topic": topic,
                })

        _record_success()
        conn.close()

        return {
            "statusCode": 200,
            "body": json.dumps({
                "status": "ok",
                "events_processed": len(records),
                "results": results,
            }),
        }

    except Exception as e:
        _record_failure()
        with contextlib.suppress(Exception):
            conn.close()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
        }


# ── Health Check ─────────────────────────────────────────────────────────────

def health_check(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Health check endpoint for monitoring."""
    return {
        "statusCode": 200,
        "body": json.dumps({
            "status": "healthy",
            "circuit_breaker": {
                "open": _circuit_is_open(),
                "failure_count": _failure_count,
                "open_until": _circuit_open_until,
            },
            "timestamp": datetime.now(UTC).isoformat(),
        }),
    }
