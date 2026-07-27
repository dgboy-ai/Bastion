"""Tests for bastion.migrate module."""

from __future__ import annotations

import os
import tempfile
from unittest.mock import MagicMock


class TestDiscoverMigrations:
    def test_discover_empty_dir(self):
        from bastion.migrate import _discover_migrations

        with tempfile.TemporaryDirectory() as tmpdir:
            result = _discover_migrations(tmpdir)
            assert result == []

    def test_discover_sql_files(self):
        from bastion.migrate import _discover_migrations

        with tempfile.TemporaryDirectory() as tmpdir:
            # Create test SQL files
            with open(os.path.join(tmpdir, "001_create.sql"), "w") as f:
                f.write("CREATE TABLE test (id INT PRIMARY KEY);")
            with open(os.path.join(tmpdir, "002_add_column.sql"), "w") as f:
                f.write("ALTER TABLE test ADD COLUMN name TEXT;")

            result = _discover_migrations(tmpdir)
            assert len(result) == 2
            assert result[0][0] == "001"
            assert result[1][0] == "002"

    def test_discover_ignores_non_sql(self):
        from bastion.migrate import _discover_migrations

        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "001_create.sql"), "w") as f:
                f.write("CREATE TABLE test (id INT PRIMARY KEY);")
            with open(os.path.join(tmpdir, "readme.txt"), "w") as f:
                f.write("not a migration")

            result = _discover_migrations(tmpdir)
            assert len(result) == 1

    def test_discover_ignores_invalid_names(self):
        from bastion.migrate import _discover_migrations

        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "abc_no_number.sql"), "w") as f:
                f.write("CREATE TABLE test (id INT PRIMARY KEY);")

            result = _discover_migrations(tmpdir)
            assert len(result) == 0

    def test_checksum_deterministic(self):
        from bastion.migrate import _discover_migrations

        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "001_test.sql"), "w") as f:
                f.write("SELECT 1;")

            result1 = _discover_migrations(tmpdir)
            result2 = _discover_migrations(tmpdir)
            assert result1[0][2] == result2[0][2]

    def test_checksum_unique_per_content(self):
        from bastion.migrate import _discover_migrations

        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "001_a.sql"), "w") as f:
                f.write("SELECT 1;")
            with open(os.path.join(tmpdir, "002_b.sql"), "w") as f:
                f.write("SELECT 2;")

            result = _discover_migrations(tmpdir)
            assert result[0][2] != result[1][2]


class TestEnsureMigrationsTable:
    def test_creates_table(self):
        from bastion.migrate import _ensure_migrations_table

        conn = MagicMock()
        _ensure_migrations_table(conn)
        conn.commit.assert_called_once()


class TestGetApplied:
    def test_empty(self):
        from bastion.migrate import _get_applied

        cursor = MagicMock()
        cursor.fetchall.return_value = []
        conn = MagicMock()
        conn.cursor.return_value.__enter__ = MagicMock(return_value=cursor)
        conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        result = _get_applied(conn)
        assert result == {}

    def test_with_data(self):
        from bastion.migrate import _get_applied

        cursor = MagicMock()
        cursor.fetchall.return_value = [
            ("001", "001_create.sql", "2026-01-01", "abc123"),
        ]
        conn = MagicMock()
        conn.cursor.return_value.__enter__ = MagicMock(return_value=cursor)
        conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        result = _get_applied(conn)
        assert "001" in result
        assert result["001"]["filename"] == "001_create.sql"
