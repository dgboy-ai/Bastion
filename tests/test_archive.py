"""Tests for bastion.archive module."""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest


class TestMemoryArchiver:
    def test_init_defaults(self):
        from bastion.archive import MemoryArchiver

        with patch.dict("os.environ", {}, clear=False):
            archiver = MemoryArchiver()
            assert archiver._bucket == "bastion-memory-archives"
            assert archiver._region == "us-east-1"  # From .env AWS_REGION

    def test_init_custom(self):
        from bastion.archive import MemoryArchiver

        archiver = MemoryArchiver(bucket_name="my-bucket", region="us-west-2")
        assert archiver._bucket == "my-bucket"
        assert archiver._region == "us-west-2"

    def test_get_client_import_error(self):
        from bastion.archive import MemoryArchiver

        archiver = MemoryArchiver()
        with patch.dict("sys.modules", {"boto3": None}):
            with pytest.raises(ImportError, match="boto3 is required"):
                archiver._get_client()

    def test_archive_memories(self):
        from bastion.archive import MemoryArchiver

        mock_client = MagicMock()
        archiver = MemoryArchiver()
        archiver._client = mock_client

        memories = [
            {"content": "test memory", "cryptographic_hash": "abc123", "metadata": {}},
        ]

        key = archiver.archive_memories("test-agent", memories)

        assert "memories/test-agent/" in key
        assert key.endswith(".json")
        mock_client.put_object.assert_called_once()
        call_kwargs = mock_client.put_object.call_args
        assert call_kwargs.kwargs["Bucket"] == "bastion-memory-archives"

    def test_restore_memories(self):
        from bastion.archive import MemoryArchiver

        memories = [{"content": "restored memory"}]
        mock_client = MagicMock()
        mock_client.get_object.return_value = {
            "Body": MagicMock(read=MagicMock(return_value=json.dumps({"memories": memories}).encode()))
        }

        archiver = MemoryArchiver()
        archiver._client = mock_client

        result = archiver.restore_memories("test-agent", "memories/test-agent/archive.json")
        assert len(result) == 1
        assert result[0]["content"] == "restored memory"

    def test_list_archives(self):
        from bastion.archive import MemoryArchiver

        mock_client = MagicMock()
        mock_client.list_objects_v2.return_value = {
            "Contents": [
                {"Key": "memories/test-agent/archive-1.json", "Size": 1024, "LastModified": MagicMock(isoformat=MagicMock(return_value="2026-01-01T00:00:00"))},
            ]
        }

        archiver = MemoryArchiver()
        archiver._client = mock_client

        archives = archiver.list_archives("test-agent")
        assert len(archives) == 1
        assert archives[0]["key"] == "memories/test-agent/archive-1.json"

    def test_list_archives_empty(self):
        from bastion.archive import MemoryArchiver

        mock_client = MagicMock()
        mock_client.list_objects_v2.return_value = {}

        archiver = MemoryArchiver()
        archiver._client = mock_client

        archives = archiver.list_archives("test-agent")
        assert archives == []

    def test_verify_hash_chain_empty(self):
        from bastion.archive import MemoryArchiver

        archiver = MemoryArchiver()
        assert archiver._verify_hash_chain([]) is True

    def test_archive_error_handling(self):
        from bastion.archive import MemoryArchiver

        mock_client = MagicMock()
        mock_client.put_object.side_effect = Exception("S3 error")

        archiver = MemoryArchiver()
        archiver._client = mock_client

        with pytest.raises(RuntimeError, match="Archive failed"):
            archiver.archive_memories("test-agent", [{"content": "test"}])
