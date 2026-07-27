"""Tests for bastion.cli module."""

from __future__ import annotations

import os
import tempfile


class TestImportJsonl:
    def test_import_file_not_found(self):
        from bastion.cli import import_jsonl

        result = import_jsonl("/nonexistent/file.jsonl", "test-agent", mock=True)
        assert "error" in result
        assert "not found" in result["error"]

    def test_import_empty_file(self):
        from bastion.cli import import_jsonl

        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            f.write("")
            f.flush()
            path = f.name

        try:
            result = import_jsonl(path, "test-agent", mock=True)
            assert result["imported"] == 0
            assert result["errors"] == 0
        finally:
            os.unlink(path)

    def test_import_valid_jsonl(self):
        from bastion.cli import import_jsonl

        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            f.write('{"content": "memory 1", "memory_type": "fact"}\n')
            f.write('{"content": "memory 2", "memory_type": "preference"}\n')
            f.flush()
            path = f.name

        try:
            result = import_jsonl(path, "test-agent", mock=True)
            assert result["imported"] == 2
            assert result["errors"] == 0
            assert result["skipped"] == 0
        finally:
            os.unlink(path)

    def test_import_skips_empty_content(self):
        from bastion.cli import import_jsonl

        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            f.write('{"content": "valid memory"}\n')
            f.write('{"content": ""}\n')
            f.write('{"no_content": true}\n')
            f.flush()
            path = f.name

        try:
            result = import_jsonl(path, "test-agent", mock=True)
            assert result["imported"] == 1
            assert result["skipped"] == 2
        finally:
            os.unlink(path)

    def test_import_handles_invalid_json(self):
        from bastion.cli import import_jsonl

        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            f.write('{"content": "valid"}\n')
            f.write("not valid json\n")
            f.write('{"content": "also valid"}\n')
            f.flush()
            path = f.name

        try:
            result = import_jsonl(path, "test-agent", mock=True)
            assert result["imported"] == 2
            assert result["errors"] == 1
        finally:
            os.unlink(path)

    def test_import_with_metadata(self):
        from bastion.cli import import_jsonl

        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            f.write('{"content": "memory", "metadata": {"source": "test"}}\n')
            f.flush()
            path = f.name

        try:
            result = import_jsonl(path, "test-agent", mock=True)
            assert result["imported"] == 1
        finally:
            os.unlink(path)

    def test_import_returns_stats(self):
        from bastion.cli import import_jsonl

        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            f.write('{"content": "m1"}\n')
            f.write('{"content": "m2"}\n')
            f.flush()
            path = f.name

        try:
            result = import_jsonl(path, "test-agent", mock=True)
            assert result["agent_id"] == "test-agent"
            assert result["total_lines"] == 2
            assert "file" in result
        finally:
            os.unlink(path)

    def test_import_blank_lines(self):
        from bastion.cli import import_jsonl

        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            f.write('{"content": "m1"}\n')
            f.write("\n")
            f.write("\n")
            f.write('{"content": "m2"}\n')
            f.flush()
            path = f.name

        try:
            result = import_jsonl(path, "test-agent", mock=True)
            assert result["imported"] == 2
        finally:
            os.unlink(path)
