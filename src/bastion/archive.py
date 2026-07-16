"""S3 Memory Archive — backup and restore agent memories to S3."""

import json
import os
from datetime import datetime, timezone
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)


class MemoryArchiver:
    """Archive agent memories to S3 with Glacier lifecycle."""

    def __init__(self, bucket_name: str | None = None, region: str | None = None):
        self._bucket = bucket_name or os.environ.get("BASTION_S3_BUCKET", "bastion-memory-archives")
        self._region = region or os.environ.get("AWS_REGION", "ap-south-1")
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                import boto3
            except ImportError:
                raise ImportError("boto3 is required for S3 archiving: pip install boto3")
            self._client = boto3.client("s3", region_name=self._region)
        return self._client

    def archive_memories(self, agent_id: str, memories: list[dict[str, Any]]) -> str:
        """Archive memories to S3. Returns the S3 key."""
        try:
            client = self._get_client()
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
            key = f"memories/{agent_id}/archive-{timestamp}.json"

            archive = {
                "agent_id": agent_id,
                "memory_count": len(memories),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "hash_chain_intact": self._verify_hash_chain(memories),
                "memories": memories,
            }

            client.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=json.dumps(archive, indent=2, default=str),
                ContentType="application/json",
                Metadata={
                    "agent_id": agent_id,
                    "memory_count": str(len(memories)),
                    "type": "memory_archive",
                },
            )

            logger.info(
                "Memories archived to S3",
                extra={"agent_id": agent_id, "bucket": self._bucket, "key": key, "count": len(memories)},
            )
            return key
        except Exception as exc:
            logger.exception("S3 archive failed", extra={"agent_id": agent_id})
            raise RuntimeError(f"Archive failed: {exc}") from exc

    def restore_memories(self, agent_id: str, key: str) -> list[dict[str, Any]]:
        """Restore memories from S3 archive."""
        try:
            client = self._get_client()
            resp = client.get_object(Bucket=self._bucket, Key=key)
            archive = json.loads(resp["Body"].read())
            return archive.get("memories", [])
        except Exception as exc:
            logger.exception("S3 restore failed", extra={"agent_id": agent_id, "key": key})
            raise RuntimeError(f"Restore failed: {exc}") from exc

    def list_archives(self, agent_id: str) -> list[dict[str, Any]]:
        """List all archives for an agent."""
        try:
            client = self._get_client()
            prefix = f"memories/{agent_id}/"
            resp = client.list_objects_v2(Bucket=self._bucket, Prefix=prefix)

            archives = []
            for obj in resp.get("Contents", []):
                archives.append({
                    "key": obj["Key"],
                    "size": obj["Size"],
                    "last_modified": obj["LastModified"].isoformat(),
                })
            return archives
        except Exception as exc:
            logger.exception("S3 list failed", extra={"agent_id": agent_id})
            return []

    def _verify_hash_chain(self, memories: list[dict[str, Any]]) -> bool:
        """Verify hash chain integrity of archived memories."""
        from bastion.crypto import verify_hash
        prev_hash = None
        for mem in memories:
            content = mem.get("content", "")
            meta = mem.get("metadata", {})
            actual = mem.get("cryptographic_hash", "")
            if actual and not verify_hash(content, meta, prev_hash, actual):
                return False
            prev_hash = actual
        return True
