"""Inline Tag Preprocessor — Extracts tags from memory content.

Scans memory content for inline tags like #tag, @entity, !priority
and extracts them into structured metadata.

Usage:
    preprocessor = TagPreprocessor()
    tags = preprocessor.extract("Remember to #deploy to #production @aws #urgent")
    # Returns: {"hashtags": ["deploy", "production", "urgent"], "entities": ["aws"]}
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)

# Tag patterns
_HASHTAG_PATTERN = re.compile(r"#(\w+)")
_MENTION_PATTERN = re.compile(r"@(\w+)")
_PRIORITY_PATTERN = re.compile(r"!(\w+)")
_CATEGORY_PATTERN = re.compile(r"\[(\w+)\]")
_NAMESPACE_PATTERN = re.compile(r"::(\w+)")
_PRIVATE_PATTERN = re.compile(r"<private>(.*?)</private>", re.DOTALL)


@dataclass
class TagExtraction:
    """Result of tag extraction from content."""
    hashtags: list[str] = field(default_factory=list)
    mentions: list[str] = field(default_factory=list)
    priorities: list[str] = field(default_factory=list)
    categories: list[str] = field(default_factory=list)
    namespaces: list[str] = field(default_factory=list)
    private_content: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "hashtags": self.hashtags,
            "mentions": self.mentions,
            "priorities": self.priorities,
            "categories": self.categories,
            "namespaces": self.namespaces,
            "private_content": self.private_content,
        }

    @property
    def has_private(self) -> bool:
        """Check if content contains private tags."""
        return bool(self.private_content)

    @property
    def all_tags(self) -> list[str]:
        """All extracted tags combined."""
        return (
            [f"#{t}" for t in self.hashtags]
            + [f"@{t}" for t in self.mentions]
            + [f"!{t}" for t in self.priorities]
            + [f"[{t}]" for t in self.categories]
            + [f"::{t}" for t in self.namespaces]
        )

    @property
    def has_tags(self) -> bool:
        return bool(self.all_tags)


class TagPreprocessor:
    """Extracts inline tags from memory content.

    Supports:
    - #hashtag — general tags
    - @mention — entity references
    - !priority — priority markers
    - [category] — category tags
    - ::namespace — namespace tags
    """

    def extract(self, content: str) -> TagExtraction:
        """Extract all tags from content."""
        if not content:
            return TagExtraction()

        return TagExtraction(
            hashtags=list(set(_HASHTAG_PATTERN.findall(content))),
            mentions=list(set(_MENTION_PATTERN.findall(content))),
            priorities=list(set(_PRIORITY_PATTERN.findall(content))),
            categories=list(set(_CATEGORY_PATTERN.findall(content))),
            namespaces=list(set(_NAMESPACE_PATTERN.findall(content))),
            private_content=_PRIVATE_PATTERN.findall(content),
        )

    def extract_as_metadata(self, content: str) -> dict[str, Any]:
        """Extract tags and return as metadata dict for memory storage."""
        extraction = self.extract(content)
        if not extraction.has_tags:
            return {}
        return {
            "inline_tags": extraction.to_dict(),
            "tag_count": len(extraction.all_tags),
        }

    def add_tags_to_metadata(
        self,
        content: str,
        existing_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Extract tags and merge with existing metadata."""
        tags = self.extract_as_metadata(content)
        if not tags:
            return existing_metadata or {}
        meta = dict(existing_metadata or {})
        meta.update(tags)
        return meta

    def strip_tags(self, content: str) -> str:
        """Remove inline tags from content, returning clean text."""
        if not content:
            return content
        # Strip private content first (largest blocks)
        result = _PRIVATE_PATTERN.sub("[PRIVATE]", content)
        result = _HASHTAG_PATTERN.sub("", result)
        result = _MENTION_PATTERN.sub("", result)
        result = _PRIORITY_PATTERN.sub("", result)
        result = _CATEGORY_PATTERN.sub("", result)
        result = _NAMESPACE_PATTERN.sub("", result)
        # Clean up multiple spaces
        result = re.sub(r"\s+", " ", result).strip()
        return result
