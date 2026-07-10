"""Tests for Tag Preprocessor."""
from __future__ import annotations

import pytest

from bastion.tags import TagExtraction, TagPreprocessor


class TestTagExtraction:
    def test_to_dict(self):
        e = TagExtraction(hashtags=["deploy"], mentions=["aws"], priorities=["urgent"])
        d = e.to_dict()
        assert d["hashtags"] == ["deploy"]
        assert d["mentions"] == ["aws"]
        assert d["priorities"] == ["urgent"]

    def test_all_tags(self):
        e = TagExtraction(hashtags=["a", "b"], mentions=["c"])
        assert "#a" in e.all_tags
        assert "#b" in e.all_tags
        assert "@c" in e.all_tags

    def test_has_tags(self):
        assert TagExtraction(hashtags=["x"]).has_tags is True
        assert TagExtraction().has_tags is False


class TestTagPreprocessor:
    def setup_method(self):
        self.pp = TagPreprocessor()

    def test_extract_hashtags(self):
        result = self.pp.extract("Deploy to #production #aws now")
        assert "production" in result.hashtags
        assert "aws" in result.hashtags

    def test_extract_mentions(self):
        result = self.pp.extract("Assigned to @john and @jane")
        assert "john" in result.mentions
        assert "jane" in result.mentions

    def test_extract_priorities(self):
        result = self.pp.extract("This is !urgent and !critical")
        assert "urgent" in result.priorities
        assert "critical" in result.priorities

    def test_extract_categories(self):
        result = self.pp.extract("Category: [bug] and [feature]")
        assert "bug" in result.categories
        assert "feature" in result.categories

    def test_extract_namespaces(self):
        result = self.pp.extract("Namespace ::prod and ::staging")
        assert "prod" in result.namespaces
        assert "staging" in result.namespaces

    def test_extract_mixed(self):
        result = self.pp.extract("Deploy #api to @aws !high [devops] ::prod")
        assert len(result.all_tags) == 5

    def test_extract_empty(self):
        result = self.pp.extract("")
        assert not result.has_tags

    def test_extract_none(self):
        result = self.pp.extract("")
        assert not result.has_tags

    def test_extract_as_metadata(self):
        meta = self.pp.extract_as_metadata("Task #deploy !urgent")
        assert "inline_tags" in meta
        assert meta["tag_count"] == 2

    def test_extract_as_metadata_no_tags(self):
        meta = self.pp.extract_as_metadata("Just plain text")
        assert meta == {}

    def test_add_tags_to_metadata(self):
        meta = self.pp.add_tags_to_metadata(
            "Store this #memory @agent",
            {"existing": True},
        )
        assert meta["existing"] is True
        assert "inline_tags" in meta

    def test_strip_tags(self):
        clean = self.pp.strip_tags("Deploy #api to @aws !urgent [devops]")
        assert "#api" not in clean
        assert "@aws" not in clean
        assert "!urgent" not in clean
        assert "[devops]" not in clean
        assert "Deploy" in clean
        assert "to" in clean
