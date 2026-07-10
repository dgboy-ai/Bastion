#!/usr/bin/env python3
"""CockroachDB Cluster Provisioning via ccloud CLI.

Demonstrates how Bastion agents can autonomously provision
their own CockroachDB cluster for persistent memory storage.

Usage:
    python scripts/ccloud_provision.py --name bastion-agent --region us-east1
    python scripts/ccloud_provision.py --list
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys


def run_ccloud(*args: str, timeout: int = 120) -> dict:
    """Run a ccloud CLI command and return parsed JSON output."""
    cmd = ["ccloud", *args]
    print(f"  $ {' '.join(cmd)}")
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, check=True, timeout=timeout,
        )
        if result.stdout.strip():
            return json.loads(result.stdout)
        return {"status": "ok", "raw": result.stdout}
    except FileNotFoundError:
        return {"error": "ccloud CLI not found. Install: curl https://cockroachlabs.cloud/cloud-cli/install.sh | sh"}
    except subprocess.CalledProcessError as e:
        return {"error": f"ccloud CLI failed: {e.stderr.strip()}"}
    except json.JSONDecodeError:
        return {"status": "ok", "raw": result.stdout}


def provision_cluster(name: str, region: str = "us-east1", provider: str = "aws") -> dict:
    """Provision a new CockroachDB Serverless cluster."""
    print(f"\n{'='*60}")
    print(f"  Provisioning CockroachDB cluster: {name}")
    print(f"  Region: {region} | Provider: {provider}")
    print(f"{'='*60}\n")

    result = run_ccloud(
        "cluster", "create", name,
        "--cloud-provider", provider,
        "--region", region,
        "-o", "json",
    )

    if "error" in result:
        print(f"\n  [ERROR] {result['error']}")
        return result

    cluster_id = result.get("id", "unknown")
    sql_user = result.get("sql_user", "unknown")
    sql_host = result.get("sql_host", "unknown")
    console_url = f"https://cockroachlabs.cloud/cluster/{cluster_id}/metrics"

    print(f"\n  Cluster Provisioned Successfully!")
    print(f"  {'─'*50}")
    print(f"  Cluster ID:    {cluster_id}")
    print(f"  SQL Host:      {sql_host}:26257")
    print(f"  SQL User:      {sql_user}")
    print(f"  Region:        {region}")
    print(f"  Console:       {console_url}")
    print(f"  {'─'*50}")

    conn_string = f"postgresql://{sql_user}@{sql_host}:26257/defaultdb?sslmode=verify-full"
    print(f"\n  Connection String:")
    print(f"  {conn_string}")
    print(f"\n  Export to Bastion:")
    print(f"  export BASTION_CONN=\"{conn_string}\"")

    return {**result, "connection_string": conn_string, "console_url": console_url}


def list_clusters() -> list[dict]:
    """List all CockroachDB clusters."""
    print(f"\n{'='*60}")
    print(f"  Listing CockroachDB clusters")
    print(f"{'='*60}\n")

    result = run_ccloud("cluster", "list", "-o", "json")

    if "error" in result:
        print(f"  [ERROR] {result['error']}")
        return []

    clusters = result if isinstance(result, list) else [result]
    if not clusters:
        print("  No clusters found.")
        return []

    print(f"  {'ID':<20} {'Name':<25} {'Region':<15} {'Status':<12}")
    print(f"  {'─'*72}")
    for c in clusters:
        cid = c.get("id", "?")[:18]
        name = c.get("name", "?")[:23]
        region = c.get("regions", ["?"])[0] if c.get("regions") else "?"
        status = c.get("status", "?")
        print(f"  {cid:<20} {name:<25} {region:<15} {status:<12}")

    return clusters


def main():
    parser = argparse.ArgumentParser(description="CockroachDB Cluster Provisioning via ccloud CLI")
    sub = parser.add_subparsers(dest="command")

    create_p = sub.add_parser("create", help="Provision a new cluster")
    create_p.add_argument("--name", required=True, help="Cluster name")
    create_p.add_argument("--region", default="us-east1", help="Region (default: us-east1)")
    create_p.add_argument("--provider", default="aws", choices=["aws", "gcp", "azure"])

    sub.add_parser("list", help="List all clusters")

    args = parser.parse_args()

    if args.command == "create":
        provision_cluster(args.name, args.region, args.provider)
    elif args.command == "list":
        list_clusters()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
