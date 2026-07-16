"""AWS Lambda Webhook Dispatcher for Bastion.

Receives CDC events from CockroachDB changefeed and delivers push notifications
to registered callback URLs for A2A tasks.

Trigger: CloudWatch Events (polling mode) or Lambda Function URL (direct mode)
"""

import json
import os
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

from shared.db import get_connection, execute_query

# Retry settings
MAX_RETRIES = 3
RETRY_DELAY_BASE = 1.0
NOTIFICATION_TIMEOUT = 10


def handler(event, context):
    """Lambda handler for webhook dispatching.
    
    Polls for tasks in terminal states with registered callback URLs,
    then delivers notifications via HTTP POST.
    """
    results = {
        "notifications_sent": 0,
        "notifications_failed": 0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    
    try:
        # Find tasks that need notification
        pending = _get_pending_notifications()
        
        for task in pending:
            task_id = task["task_id"]
            callback_url = task["callback_url"]
            status = task["status"]
            artifacts = task.get("artifacts")
            
            success = _deliver_notification(task_id, callback_url, status, artifacts)
            
            if success:
                results["notifications_sent"] += 1
                _mark_delivered(task_id)
            else:
                results["notifications_failed"] += 1
        
        results["statusCode"] = 200
        results["body"] = json.dumps(results)
        
    except Exception as exc:
        results["statusCode"] = 500
        results["error"] = str(exc)
    
    return results


def _get_pending_notifications():
    """Find tasks in terminal states with registered callback URLs."""
    try:
        rows = execute_query(
            """SELECT task_id, callback_url, status, artifacts
               FROM a2a_tasks
               WHERE status IN ('COMPLETED', 'FAILED', 'CANCELED')
               AND callback_url IS NOT NULL
               AND callback_url != ''
               AND (last_notified_at IS NULL OR last_notified_at < now() - interval '5 minutes')
               ORDER BY updated_at DESC
               LIMIT 50"""
        )
        
        tasks = []
        for row in (rows or []):
            tasks.append({
                "task_id": str(row[0]),
                "callback_url": str(row[1]),
                "status": str(row[2]),
                "artifacts": json.loads(row[3]) if row[3] else None,
            })
        return tasks
        
    except Exception:
        return []


def _deliver_notification(task_id, callback_url, status, artifacts):
    """Deliver notification via HTTP POST with retries."""
    payload = {
        "task_id": task_id,
        "status": status,
        "artifacts": artifacts or [],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "bastion-cdc",
    }
    
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(
                callback_url,
                data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            response = urllib.request.urlopen(req, timeout=NOTIFICATION_TIMEOUT)
            
            if response.status < 400:
                print(f"Notification delivered: {task_id} -> {callback_url} (attempt {attempt + 1})")
                return True
            else:
                print(f"Notification HTTP error: {task_id} -> {callback_url} status={response.status}")
                
        except urllib.error.HTTPError as exc:
            print(f"Notification HTTP error (attempt {attempt + 1}): {exc.code} {exc.reason}")
        except urllib.error.URLError as exc:
            print(f"Notification URL error (attempt {attempt + 1}): {exc.reason}")
        except Exception as exc:
            print(f"Notification error (attempt {attempt + 1}): {exc}")
        
        if attempt < MAX_RETRIES - 1:
            time.sleep(RETRY_DELAY_BASE * (2 ** attempt))
    
    print(f"Notification failed after {MAX_RETRIES} attempts: {task_id} -> {callback_url}")
    return False


def _mark_delivered(task_id):
    """Mark task as notified to prevent duplicate deliveries."""
    try:
        execute_query(
            "UPDATE a2a_tasks SET last_notified_at = now() WHERE task_id = %s",
            (task_id,),
        )
    except Exception as exc:
        print(f"Failed to mark delivered: {exc}")
