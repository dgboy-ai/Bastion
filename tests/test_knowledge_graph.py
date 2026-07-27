"""Tests for bastion.knowledge_graph module."""

from __future__ import annotations


class TestExtractTriples:
    def test_is_a_pattern(self):
        from bastion.knowledge_graph import extract_triples

        triples = extract_triples("Python is a programming language")
        assert len(triples) >= 1
        assert any(t[2] == "is_a" for t in triples)

    def test_uses_pattern(self):
        from bastion.knowledge_graph import extract_triples

        triples = extract_triples("Bastion uses CockroachDB")
        assert any(t[2] == "uses" for t in triples)

    def test_works_on_pattern(self):
        from bastion.knowledge_graph import extract_triples

        triples = extract_triples("Alice works on the dashboard")
        assert any(t[2] == "works_on" for t in triples)

    def test_manages_pattern(self):
        from bastion.knowledge_graph import extract_triples

        triples = extract_triples("Bob manages the database")
        assert any(t[2] == "manages" for t in triples)

    def test_depends_on_pattern(self):
        from bastion.knowledge_graph import extract_triples

        triples = extract_triples("ServiceA depends on ServiceB")
        assert any(t[2] == "depends_on" for t in triples)

    def test_empty_text(self):
        from bastion.knowledge_graph import extract_triples

        triples = extract_triples("")
        assert triples == []

    def test_long_text_truncated(self):
        from bastion.knowledge_graph import extract_triples

        text = "Python is a language. " * 1000
        triples = extract_triples(text)
        assert isinstance(triples, list)

    def test_no_match(self):
        from bastion.knowledge_graph import extract_triples

        triples = extract_triples("The quick brown fox jumps over the lazy dog")
        assert isinstance(triples, list)

    def test_triple_format(self):
        from bastion.knowledge_graph import extract_triples

        triples = extract_triples("Alice uses CockroachDB")
        assert len(triples) >= 1
        subject, obj, relation, kind, confidence = triples[0]
        assert isinstance(subject, str)
        assert isinstance(obj, str)
        assert isinstance(relation, str)
        assert isinstance(kind, str)
        assert isinstance(confidence, float)

    def test_multiple_triples(self):
        from bastion.knowledge_graph import extract_triples

        text = "Alice uses CockroachDB. Bob manages the database."
        triples = extract_triples(text)
        assert len(triples) >= 2

    def test_built_with_pattern(self):
        from bastion.knowledge_graph import extract_triples

        triples = extract_triples("Bastion is built with Python")
        assert any(t[2] == "built_with" for t in triples) or any(t[2] == "is_a" for t in triples)
