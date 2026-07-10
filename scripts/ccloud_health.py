#!/usr/bin/env python3
"""CockroachDB Cluster Health Check via ccloud CLI.

Demonstrates how Bastion agents can monitor their own database
infrastructure — query latency, node status, storage usage.

Usage:
    python scripts/ccloud_health.py --cluster <cluster_id>
    python scripts/ccloud_health.py --cluster <cluster_id> --watch
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time


def run_ccloud(*args: str, timeout: int = 30) -> dict:
    """Run a ccloud CLI command and return parsed JSON output."""
    cmd = ["ccloud", *args]
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, check=True, timeout=timeout,
        )
        if result.stdout.strip():
            return json.loads(result.stdout)
        return {"status": "ok"}
    except FileNotFoundError:
        return {"error": "ccloud CLI not found. Install: curl https://cockroachlabs.cloud/cloud-cli/install.sh | sh"}
    except subprocess.CalledProcessError as e:
        return {"error": f"ccloud CLI failed: {e.stderr.strip()}"}
    except json.JSONDecodeError:
        return {"status": "ok", "raw": result.stdout}


def check_cluster_health(cluster_id: str) -> dict:
    """Get cluster health status via ccloud CLI."""
    print(f"\n{'='*60}")
    print(f"  Cluster Health: {cluster_id}")
    print(f"{'='*60}\n")

    # 1. Cluster describe
    result = run_ccloud("cluster", "describe", cluster_id, "-o", "json")
    if "error" in result:
        print(f"  [ERROR] {result['error']}")
        return result

    status = result.get("status", "unknown")
    regions = result.get("regions", [])
    nodes = result.get("nodes", [])
    cockroach_version = result.get("cockroach_version", "unknown")

    status_icon = "✓" if status == "CREATED" else "⚠"
    print(f"  Status:       {status_icon} {status}")
    print(f"  Version:      {cockroach_version}")
    print(f"  Regions:      {', '.join(regions) if regions else 'N/A'}")
    print(f"  Nodes:        {len(nodes)}")

    # 2. SQL latency check
    print(f"\n  Query Latency Check:")
    latency_result = run_ccloud(
        "sql", "--cluster", cluster_id,
        "--execute", "SELECT now() AS server_time, gateway_id FROM crdb_internal.gateway_nodes LIMIT 1",
        "-o", "json",
    )
    if "error" not in latency_result:
        print(f"    ✓ SQL endpoint responsive")
    else:
        print(f"    ✗ SQL endpoint unreachable: {latency_result.get('error', 'unknown')}")

    # 3. Storage check
    print(f"\n  Storage Usage:")
    storage_result = run_ccloud(
        "sql", "--cluster", cluster_id,
        "--execute", "SELECT sum(range_size_bytes) AS total_bytes FROM crdb_internal.ranges_no_local",
        "-o", "json",
    )
    if "error" not in storage_result and isinstance(storage_result, list) and len(storage_result) > 0:
        total_bytes = storage_result[0].get("total_bytes", 0)
        total_mb = round(total_bytes / (1024 * 1024), 2) if total_bytes else 0
        print(f"    Total data:  {total_mb} MB")
    else:
        print(f"    Could not retrieve storage info")

    # 4. Memory table row counts
    print(f"\n  Memory Store Status:")
    count_result = run_ccloud(
        "sql", "--cluster", cluster_id,
        "--execute", "SELECT count(*) AS total_memories FROM agent_memory",
        "-o", "json",
    )
    if "error" not in count_result and isinstance(count_result, list) and len(count_result) > 0:
        total = count_result[0].get("total_memories", 0)
        print(f"    Total memories: {total}")
    else:
        print(f"    Could not retrieve memory count (table may not exist yet)")

    # 5. Audit trail check
    audit_result = run_ccloud(
        "sql", "--cluster", cluster_id,
        "--execute", "SELECT count(*) AS total_audit_entries FROM agent_audit",
        "-o", "json",
    )
    if "error" not in audit_result and isinstance(audit_result, list) and len(audit_result) > 0:
        audit_count = audit_result[0].get("total_audit_entries", 0)
        print(f"    Audit entries:  {audit_count}")

    print(f"\n{'='*60}\n")
    return {
        "cluster_id": cluster_id,
        "status": status,
        "regions": regions,
        "nodes": len(nodes),
        "version": cockroach_version,
    }


def watch_cluster(cluster_id: str, interval: int = 10):
    """Watch cluster health in a loop."""
    print(f"  Watching cluster {cluster_id} (Ctrl+C to stop)")
    try:
        while True:
            check_cluster_health(cluster_id)
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\n  Stopped watching.")


def main():
    parser = argparse.ArgumentParser(description="CockroachDB Cluster Health Check")
    parser.add_argument("--cluster", required=True, help="Cluster ID")
    parser.add_argument("--watch", action="store_true", help="Watch mode (continuous monitoring)")
    parser.add_argument("--interval", type=int, default=10, help="Watch interval in seconds")
    args = parser.parse_args()

    if args.watch:
        watch_cluster(args.cluster, args.interval)
    else:
        check_cluster_health(args.cluster)


if __name__ == "__main__":
    main()
