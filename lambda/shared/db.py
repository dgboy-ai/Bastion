"""Shared database utilities for Lambda functions."""

import os
from contextlib import contextmanager

import psycopg


def get_connection():
    """Get a CockroachDB connection from environment variable."""
    conn_str = os.environ.get("BASTION_CONN", "")
    if not conn_str:
        raise ValueError("BASTION_CONN environment variable not set")
    return psycopg.connect(conn_str)


@contextmanager
def db_cursor():
    """Context manager for database cursor with automatic cleanup."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def execute_query(query, params=None):
    """Execute a query and return results."""
    with db_cursor() as cur:
        cur.execute(query, params or ())
        if cur.description:
            return cur.fetchall()
        return None
