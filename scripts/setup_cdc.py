"""Create CDC changefeeds on CockroachDB. Requires a deployed sink (Kafka or webhook).

Usage:
    # With webhook sink:
    python scripts/setup_cdc.py --sink webhook-https://<WEBHOOK_URL>

    # With local Kafka:
    python scripts/setup_cdc.py --sink "kafka://localhost:9092?topic_prefix=cdc_"

    # List active changefeeds:
    python scripts/setup_cdc.py --list

    # Drop a changefeed:
    python scripts/setup_cdc.py --drop <job_id>
"""

import argparse
import sys

import psycopg

sys.path.insert(0, "src")

from bastion.config import get_settings, reset_settings

reset_settings()
settings = get_settings()


def list_feeds(conn):
    cur = conn.cursor()
    cur.execute("SHOW CHANGEFEED JOBS")
    cols = [d[0] for d in cur.description]
    feeds = cur.fetchall()
    if not feeds:
        print("No active changefeeds.")
        return
    print(f"{'Job ID':<10} {'Status':<12} {'Description'}")
    print("-" * 60)
    for row in feeds:
        info = dict(zip(cols, row, strict=False))
        print(f"{info.get('job_id', '?'):<10} {info.get('status', '?'):<12} {info.get('description', '?')[:50]}")


def create_feeds(conn, sink):
    cur = conn.cursor()
    tables = ["agent_memory", "agent_audit", "a2a_tasks"]
    for table in tables:
        job_name = f"cdc_{table}"
        try:
            cur.execute(f"""
                CREATE CHANGEFEED {job_name}
                INTO '{sink}'
                WITH updated, resolved, on_error=resume, initial_scan='no'
                FOR TABLE {table}
            """)
            print(f"  Created: {job_name} -> {table}")
        except Exception as e:
            msg = str(e).split("\n")[0]
            if "already exists" in msg.lower():
                print(f"  Exists: {job_name}")
            else:
                print(f"  Error: {job_name} — {msg}")


def drop_feed(conn, job_id):
    cur = conn.cursor()
    try:
        cur.execute(f"PAUSE JOB {job_id}")
        cur.execute(f"CANCEL JOB {job_id}")
        print(f"  Dropped job {job_id}")
    except Exception as e:
        print(f"  Error: {e}")


def main():
    parser = argparse.ArgumentParser(description="Manage CDC changefeeds")
    parser.add_argument("--sink", help="Sink URL (e.g. kafka://... or webhook-https://...)")
    parser.add_argument("--list", action="store_true", help="List active changefeeds")
    parser.add_argument("--drop", type=int, help="Drop a changefeed by job ID")
    args = parser.parse_args()

    conn = psycopg.connect(settings.connection_string, connect_timeout=15)
    conn.autocommit = True

    if args.list:
        list_feeds(conn)
    elif args.drop:
        drop_feed(conn, args.drop)
    elif args.sink:
        print(f"Creating changefeeds -> {args.sink}")
        create_feeds(conn, args.sink)
    else:
        parser.print_help()

    conn.close()


if __name__ == "__main__":
    main()
