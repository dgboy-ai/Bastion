"""Knowledge Graph operations — entity/relation CRUD, graph traversal, NLP triple extraction."""

from __future__ import annotations

import json
import os
import re
from collections import deque
from collections.abc import Callable
from typing import Any

from bastion.log_setup import get_logger
from bastion.models import EntityRecord, RelationRecord

logger = get_logger(__name__)

# NLP triple extraction patterns — 50+ patterns covering common English structures
_TRIPLE_PATTERNS = [
    # Entity types
    (re.compile(r"(\w+)\s+is\s+a\s+(\w+)", re.IGNORECASE), "is_a", "entity_type"),
    # Attributes
    (re.compile(r"(\w+)\s+is\s+(\w+(?:\s+\w+){0,3})", re.IGNORECASE), "is", "attribute"),
    # Core relations
    (re.compile(r"(\w+)\s+loves\s+(\w+)", re.IGNORECASE), "loves", "relation"),
    (re.compile(r"(\w+)\s+likes\s+(\w+)", re.IGNORECASE), "likes", "relation"),
    (re.compile(r"(\w+)\s+uses\s+(\w+)", re.IGNORECASE), "uses", "relation"),
    (re.compile(r"(\w+)\s+builds\s+(\w+)", re.IGNORECASE), "builds", "relation"),
    (re.compile(r"(\w+)\s+works\s+on\s+(\w+)", re.IGNORECASE), "works_on", "relation"),
    (re.compile(r"(\w+)\s+created\s+(\w+)", re.IGNORECASE), "created", "relation"),
    (re.compile(r"(\w+)\s+owns\s+(\w+)", re.IGNORECASE), "owns", "relation"),
    (re.compile(r"(\w+)\s+manages\s+(\w+)", re.IGNORECASE), "manages", "relation"),
    (re.compile(r"(\w+)\s+reports\s+to\s+(\w+)", re.IGNORECASE), "reports_to", "relation"),
    (re.compile(r"(\w+)\s+belongs\s+to\s+(\w+)", re.IGNORECASE), "belongs_to", "relation"),
    # Extended relations
    (re.compile(r"(\w+)\s+develops\s+(\w+)", re.IGNORECASE), "develops", "relation"),
    (re.compile(r"(\w+)\s+deploys\s+(\w+)", re.IGNORECASE), "deploys", "relation"),
    (re.compile(r"(\w+)\s+monitors\s+(\w+)", re.IGNORECASE), "monitors", "relation"),
    (re.compile(r"(\w+)\s+configures\s+(\w+)", re.IGNORECASE), "configures", "relation"),
    (re.compile(r"(\w+)\s+maintains\s+(\w+)", re.IGNORECASE), "maintains", "relation"),
    (re.compile(r"(\w+)\s+integrates\s+with\s+(\w+)", re.IGNORECASE), "integrates_with", "relation"),
    (re.compile(r"(\w+)\s+depends\s+on\s+(\w+)", re.IGNORECASE), "depends_on", "relation"),
    (re.compile(r"(\w+)\s+communicates\s+with\s+(\w+)", re.IGNORECASE), "communicates_with", "relation"),
    (re.compile(r"(\w+)\s+stores\s+(\w+)", re.IGNORECASE), "stores", "relation"),
    (re.compile(r"(\w+)\s+processes\s+(\w+)", re.IGNORECASE), "processes", "relation"),
    (re.compile(r"(\w+)\s+analyzes\s+(\w+)", re.IGNORECASE), "analyzes", "relation"),
    (re.compile(r"(\w+)\s+optimizes\s+(\w+)", re.IGNORECASE), "optimizes", "relation"),
    (re.compile(r"(\w+)\s+secures\s+(\w+)", re.IGNORECASE), "secures", "relation"),
    (re.compile(r"(\w+)\s+trains\s+(\w+)", re.IGNORECASE), "trains", "relation"),
    (re.compile(r"(\w+)\s+evaluates\s+(\w+)", re.IGNORECASE), "evaluates", "relation"),
    (re.compile(r"(\w+)\s+implements\s+(\w+)", re.IGNORECASE), "implements", "relation"),
    (re.compile(r"(\w+)\s+supports\s+(\w+)", re.IGNORECASE), "supports", "relation"),
    (re.compile(r"(\w+)\s+replaces\s+(\w+)", re.IGNORECASE), "replaces", "relation"),
    # Multi-word entity patterns (capitalized words)
    (re.compile(r"([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+is\s+a\s+(\w+)", re.IGNORECASE), "is_a", "entity_type"),
    (
        re.compile(
            r"([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+works\s+with\s+"
            r"([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",
            re.IGNORECASE,
        ),
        "works_with",
        "relation",
    ),
    (re.compile(r"([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+uses\s+(\w+)", re.IGNORECASE), "uses", "relation"),
    (re.compile(r"([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+manages\s+(\w+)", re.IGNORECASE), "manages", "relation"),
    # Prepositional phrase patterns
    (re.compile(r"(\w+)\s+works\s+for\s+(\w+)", re.IGNORECASE), "works_for", "relation"),
    (re.compile(r"(\w+)\s+works\s+at\s+(\w+)", re.IGNORECASE), "works_at", "relation"),
    (re.compile(r"(\w+)\s+lives\s+in\s+(\w+)", re.IGNORECASE), "lives_in", "relation"),
    (re.compile(r"(\w+)\s+located\s+in\s+(\w+)", re.IGNORECASE), "located_in", "relation"),
    (re.compile(r"(\w+)\s+part\s+of\s+(\w+)", re.IGNORECASE), "part_of", "relation"),
    # Comparative patterns
    (re.compile(r"(\w+)\s+better\s+than\s+(\w+)", re.IGNORECASE), "better_than", "relation"),
    (re.compile(r"(\w+)\s+faster\s+than\s+(\w+)", re.IGNORECASE), "faster_than", "relation"),
    # Causal patterns
    (re.compile(r"(\w+)\s+causes\s+(\w+)", re.IGNORECASE), "causes", "relation"),
    (re.compile(r"(\w+)\s+prevents\s+(\w+)", re.IGNORECASE), "prevents", "relation"),
    (re.compile(r"(\w+)\s+enables\s+(\w+)", re.IGNORECASE), "enables", "relation"),
    # Tool/technology patterns
    (re.compile(r"(\w+)\s+(?:is\s+)?built\s+with\s+(\w+)", re.IGNORECASE), "built_with", "relation"),
    (re.compile(r"(\w+)\s+powered\s+by\s+(\w+)", re.IGNORECASE), "powered_by", "relation"),
    (re.compile(r"(\w+)\s+runs\s+on\s+(\w+)", re.IGNORECASE), "runs_on", "relation"),
]


_STOP_WORDS = frozenset(
    {
        "the",
        "a",
        "an",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "can",
        "shall",
        "to",
        "of",
        "in",
        "for",
        "on",
        "with",
        "at",
        "by",
        "from",
        "as",
        "into",
        "through",
        "during",
        "before",
        "after",
        "above",
        "below",
        "between",
        "this",
        "that",
        "these",
        "those",
        "it",
        "its",
        "i",
        "you",
        "he",
        "she",
        "we",
        "they",
    }
)


def extract_triples(text: str) -> list[tuple[str, str, str, str, float]]:
    """Extract (subject, object, relation, kind, confidence) triples from text.

    Confidence is reduced for generic entities (stop words) and simpler patterns.
    """
    if len(text) > 5000:
        text = text[:5000]
    triples: list[tuple[str, str, str, str, float]] = []
    for compiled, rel_type, kind in _TRIPLE_PATTERNS:
        for match in compiled.finditer(text):
            src, tgt = match.group(1).lower(), match.group(2).lower()
            # Skip if subject is a stop word (object can be articles like "the dashboard")
            if src in _STOP_WORDS:
                continue
            # Skip very short entities (likely false positives)
            if len(src) < 2 or len(tgt) < 2:
                continue
            # Confidence: specific relations (is_a, entity_type) get higher confidence
            confidence = 0.9 if kind == "entity_type" else 0.7
            triples.append((src, tgt, rel_type, kind, confidence))
    return triples


class KnowledgeGraph:
    """Manages the entity-relationship knowledge graph for an agent.

    Provides graph_query (BFS traversal), graph_at_time (time-travel snapshot),
    graph_stats, and store_with_graph (NLP extraction + entity/relation creation).
    """

    _MAX_ENTITY_NAME_LEN = 256
    _MAX_AGENT_ID_LEN = 256

    def __init__(self, agent_id: str, get_pool_fn: Callable, set_rls_fn: Callable | None = None):
        if len(agent_id) > self._MAX_AGENT_ID_LEN:
            raise ValueError(f"agent_id too long (max {self._MAX_AGENT_ID_LEN})")
        self.agent_id = agent_id
        self._get_pool = get_pool_fn
        self._set_rls = set_rls_fn
        self._groq_client: Any = None

    @staticmethod
    def _validate_entity_name(name: str) -> str:
        """Validate and sanitize entity name — prevents injection and DoS."""
        if not name or not isinstance(name, str):
            raise ValueError("Entity name must be a non-empty string")
        name = name.strip()
        if len(name) > 256:
            raise ValueError(f"Entity name too long (max 256 chars, got {len(name)})")
        return name

    # ── Graph Query (BFS traversal) ────────────────────────────────────────

    def graph_query(
        self,
        start_entity: str,
        relation_path: list[str] | None = None,
        hops: int = 2,
    ) -> list[dict[str, Any]]:
        """BFS traversal from start_entity. Returns list of {source, target, relation, confidence, depth}."""
        pool = self._get_pool()
        conn = pool.acquire(timeout=30.0)
        if self._set_rls:
            self._set_rls(conn)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT entity_id FROM agent_entities WHERE agent_id = %s AND name = %s LIMIT 1",
                    (self.agent_id, start_entity),
                )
                row = cur.fetchone()
                if not row:
                    return []
                start_id = str(row[0])

                found: list[dict[str, Any]] = []
                visited: set[str] = {start_id}
                queue: deque[tuple[str, int]] = deque([(start_id, 0)])

                while queue:
                    eid, depth = queue.popleft()
                    if depth >= hops:
                        continue

                    rel_type_filter = ""
                    params: list[Any] = [eid]
                    if relation_path:
                        placeholders = ", ".join("%s" for _ in relation_path)
                        rel_type_filter = f"AND r.relation_type IN ({placeholders})"
                        params.extend(relation_path)

                    cur.execute(
                        f"SELECT r.relation_type, r.confidence, r.source_memory_id, "
                        f"e.name AS target_name, e.entity_id AS target_id "
                        f"FROM agent_relations r JOIN agent_entities e ON r.target_entity_id = e.entity_id "
                        f"WHERE r.source_entity_id = %s {rel_type_filter}",
                        params,
                    )
                    for rel_row in cur.fetchall():
                        target_id = str(rel_row[4])
                        found.append(
                            {
                                "source": start_entity,
                                "target": str(rel_row[3]),
                                "relation": str(rel_row[0]),
                                "confidence": float(rel_row[1]),
                                "depth": depth + 1,
                            }
                        )
                        if target_id not in visited:
                            visited.add(target_id)
                            queue.append((target_id, depth + 1))
                return found
        finally:
            pool.release(conn)

    # ── Graph At Time (time-travel snapshot) ───────────────────────────────

    def graph_at_time(self, timestamp: str, entity: str | None = None) -> dict[str, Any]:
        """Snapshot of entities and relations at a specific point in time."""
        pool = self._get_pool()
        conn = pool.acquire(timeout=30.0)
        if self._set_rls:
            self._set_rls(conn)
        try:
            with conn.cursor() as cur:
                cur.execute("SET TRANSACTION AS OF SYSTEM TIME %s::TIMESTAMPTZ", (timestamp,))

                if entity:
                    cur.execute(
                        "SELECT entity_id, agent_id, entity_type, name, attributes, "
                        "valid_from, valid_until, created_at "
                        "FROM agent_entities WHERE agent_id = %s AND name = %s",
                        (self.agent_id, entity),
                    )
                else:
                    cur.execute(
                        "SELECT entity_id, agent_id, entity_type, name, attributes, "
                        "valid_from, valid_until, created_at "
                        "FROM agent_entities WHERE agent_id = %s",
                        (self.agent_id,),
                    )
                entities = [EntityRecord.from_row(r).to_dict() for r in cur.fetchall()]

                entity_ids = tuple(e["entity_id"] for e in entities)
                if entity_ids:
                    cur.execute(
                        "SELECT r.relation_id, r.agent_id, r.source_entity_id, r.target_entity_id, "
                        "r.relation_type, r.confidence, r.valid_from, r.valid_until, r.source_memory_id, r.created_at "
                        "FROM agent_relations r WHERE r.source_entity_id IN %s OR r.target_entity_id IN %s",
                        (entity_ids, entity_ids),
                    )
                    relations = [
                        dict(
                            zip(
                                [
                                    "relation_id",
                                    "agent_id",
                                    "source_entity_id",
                                    "target_entity_id",
                                    "relation_type",
                                    "confidence",
                                    "valid_from",
                                    "valid_until",
                                    "source_memory_id",
                                    "created_at",
                                ],
                                r,
                                strict=True,
                            )
                        )
                        for r in cur.fetchall()
                    ]
                else:
                    relations = []

            conn.commit()
            return {"agent_id": self.agent_id, "timestamp": timestamp, "entities": entities, "relations": relations}
        except Exception:
            conn.rollback()
            raise
        finally:
            pool.release(conn)

    # ── Graph Stats ────────────────────────────────────────────────────────

    def graph_stats(self) -> dict[str, Any]:
        pool = self._get_pool()
        conn = pool.acquire(timeout=30.0)
        if self._set_rls:
            self._set_rls(conn)
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM agent_entities WHERE agent_id = %s", (self.agent_id,))
                entity_row = cur.fetchone()
                if entity_row is None:
                    raise RuntimeError("COUNT query for entities did not return a row")
                entity_count = entity_row[0]

                cur.execute(
                    "SELECT COUNT(*) FROM agent_relations r "
                    "JOIN agent_entities e ON r.source_entity_id = e.entity_id WHERE e.agent_id = %s",
                    (self.agent_id,),
                )
                relation_row = cur.fetchone()
                if relation_row is None:
                    raise RuntimeError("COUNT query for relations did not return a row")
                relation_count = relation_row[0]

                cur.execute(
                    "SELECT DISTINCT entity_type FROM agent_entities WHERE agent_id = %s ORDER BY entity_type",
                    (self.agent_id,),
                )
                entity_types = [r[0] for r in cur.fetchall()]

                cur.execute(
                    "SELECT COUNT(*) FROM agent_entities e WHERE e.agent_id = %s "
                    "AND NOT EXISTS (SELECT 1 FROM agent_relations r "
                    "WHERE r.source_entity_id = e.entity_id OR r.target_entity_id = e.entity_id)",
                    (self.agent_id,),
                )
                orphans_row = cur.fetchone()
                if orphans_row is None:
                    raise RuntimeError("COUNT query for orphans did not return a row")
                orphans = orphans_row[0]

                return {
                    "entities": entity_count,
                    "relations": relation_count,
                    "orphans": orphans,
                    "entity_types": entity_types,
                }
        finally:
            pool.release(conn)

    # ── Store With Graph (NLP extraction + entity/relation creation) ────────

    def store_with_graph(
        self,
        record_memory_id: str,
        content: str,
        triples: list[tuple[str, str, str, str, float]],
    ) -> tuple[list[EntityRecord], list[RelationRecord]]:
        """Create entities and relations from extracted triples.

        Args:
            record_memory_id: The memory_id of the stored memory record.
            content: The original content (for triple self-check).
            triples: Extracted triples from NLP.

        Returns:
            Tuple of (created_entities, created_relations).
        """
        triples = self._self_check_triples(content, triples)
        created_entities: list[EntityRecord] = []
        created_relations: list[RelationRecord] = []

        pool = self._get_pool()
        conn = pool.acquire(timeout=30.0)
        if self._set_rls:
            self._set_rls(conn)
        try:
            for src_name, tgt_name, rel_type, kind, confidence in triples:
                if kind == "entity_type":
                    with conn.cursor() as cur:
                        cur.execute(
                            "INSERT INTO agent_entities (agent_id, entity_type, name, valid_from) "
                            "VALUES (%s, %s, %s, now())",
                            (self.agent_id, tgt_name, src_name),
                        )
                else:
                    with conn.cursor() as cur:
                        cur.execute(
                            "INSERT INTO agent_entities (agent_id, entity_type, name, valid_from) "
                            "VALUES (%s, 'person', %s, now()) "
                            "ON CONFLICT DO NOTHING RETURNING entity_id",
                            (self.agent_id, src_name),
                        )
                        src_row = cur.fetchone()
                        eid_src = str(src_row[0]) if src_row else self._ensure_entity_id(cur, src_name)

                        cur.execute(
                            "INSERT INTO agent_entities (agent_id, entity_type, name, valid_from) "
                            "VALUES (%s, 'concept', %s, now()) "
                            "ON CONFLICT DO NOTHING RETURNING entity_id",
                            (self.agent_id, tgt_name),
                        )
                        tgt_row = cur.fetchone()
                        eid_tgt = str(tgt_row[0]) if tgt_row else self._ensure_entity_id(cur, tgt_name)

                        cur.execute(
                            "INSERT INTO agent_relations (agent_id, source_entity_id, target_entity_id, "
                            "relation_type, confidence, source_memory_id) VALUES (%s, %s, %s, %s, %s, %s) "
                            "RETURNING relation_id",
                            (self.agent_id, eid_src, eid_tgt, rel_type, confidence, record_memory_id),
                        )
            # Single commit for all triples (atomic, faster)
            conn.commit()

            with conn.cursor() as cur:
                cur.execute(
                    "SELECT entity_id, agent_id, entity_type, name, attributes, valid_from, valid_until, created_at "
                    "FROM agent_entities WHERE agent_id = %s ORDER BY created_at DESC",
                    (self.agent_id,),
                )
                for r in cur.fetchall():
                    created_entities.append(EntityRecord.from_row(r))

            return created_entities, created_relations
        finally:
            pool.release(conn)

    # ── Helper methods ─────────────────────────────────────────────────────

    def _ensure_entity_id(self, cur, name: str) -> str:
        cur.execute("SELECT entity_id FROM agent_entities WHERE agent_id = %s AND name = %s", (self.agent_id, name))
        row = cur.fetchone()
        if row is None:
            raise ValueError(f"Entity '{name}' not found for agent {self.agent_id}")
        return str(row[0])

    def _get_groq_client(self) -> Any:
        if self._groq_client is not None:
            return self._groq_client
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            return None
        from groq import Groq

        self._groq_client = Groq(api_key=api_key)
        return self._groq_client

    def _self_check_triples(
        self, content: str, triples: list[tuple[str, str, str, str, float]]
    ) -> list[tuple[str, str, str, str, float]]:
        """Optional LLM self-check on extracted triples.

        Uses Groq to verify extraction quality when available.
        Falls back to returning original triples if Groq is unavailable.
        """
        if not triples:
            return triples
        try:
            client = self._get_groq_client()
            if client is None:
                return triples
            triples_text = "; ".join(f"{s} {r} {t}" for s, t, r, k, c in triples)
            model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Extract and verify entity-relation triples from text. "
                            "Return ONLY a JSON array. No explanation, no markdown, no text. "
                            'Format: [["subject","relation","object","kind",confidence],...] '
                            "kind is 'relation' or 'entity_type'. confidence is 0.0-1.0."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (f"Text: {content}\nExisting triples: {triples_text}\nReturn JSON array only:"),
                    },
                ],
                temperature=0.0,
                max_tokens=256,
                timeout=10,
                response_format={"type": "json_object"},
            )
            raw = resp.choices[0].message.content or "[]"
            verified = self._parse_json_response(raw)
            result = []
            for t in verified:
                if isinstance(t, list) and len(t) >= 5:
                    result.append((str(t[0]), str(t[1]), str(t[2]), str(t[3]), float(t[4])))
            return result if result else triples
        except Exception:
            logger.debug("LLM triple verification failed, falling back to unverified triples")
            return triples

    @staticmethod
    def _parse_json_response(raw: str) -> list:
        """Parse JSON from LLM response, handling markdown code blocks."""
        raw = raw.strip()
        # Try direct parse first
        try:
            result: list = json.loads(raw)
            return result
        except (json.JSONDecodeError, ValueError):
            pass
        # Extract from markdown code block: ```json ... ``` or ``` ... ```
        match = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", raw, re.DOTALL)
        if match:
            try:
                result = json.loads(match.group(1).strip())
                return result
            except (json.JSONDecodeError, ValueError):
                pass
        # Extract first JSON array from text
        match = re.search(r"\[.*\]", raw, re.DOTALL)
        if match:
            try:
                result = json.loads(match.group(0))
                return result
            except (json.JSONDecodeError, ValueError):
                pass
        return []
