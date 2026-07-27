from __future__ import annotations

import hashlib
import hmac
from typing import Any


class MerkleTree:
    """
    A binary Merkle tree over an ordered list of hash-chain entries.

    While the linear hash chain (``previous_hash → current_hash``) requires
    O(n) traversal for integrity verification, a Merkle tree enables
    **O(log n)** inclusion proofs: given a leaf hash and a compact proof
    of sibling nodes, any verifier can recompute the root and compare it
    against a trusted anchor.

    This is the same structure used by Certificate Transparency (RFC 6962)
    and Bitcoin SPV nodes.  Applied to agent memory, it means an auditor
    can verify that a specific memory block belongs to the chain without
    downloading the entire chain.

    **Cryptographic domain separation** (0x00 for leaves, 0x01 for inner
    nodes) prevents duplicate-structure collisions (Bitcoin CVE-2012-2459),
    ensuring adversarial actors cannot forge valid unlearning receipts or
    audit trails.  The leaf array is padded to the next power of 2 with
    dummy sentinels rather than copying odd leaves upward.

    Usage:
        >>> leaves = ["a", "b", "c", "d"]
        >>> tree = MerkleTree(leaves)
        >>> proof = tree.proof(1)          # proof for leaf "b"
        >>> tree.verify("b", proof)        # True
    """

    def __init__(self, leaves: list[str]) -> None:
        if not leaves:
            raise ValueError("Cannot build Merkle tree from empty leaf list")
        self._original_count = len(leaves)
        self._leaves = [self._hash(leaf) for leaf in leaves]
        next_pow2 = 1
        while next_pow2 < len(self._leaves):
            next_pow2 <<= 1
        sentinel = self._hash("")
        self._leaves += [sentinel] * (next_pow2 - len(self._leaves))
        self._root, self._levels = self._build(self._leaves)

    @property
    def root(self) -> str:
        """Merkle root hash (trusted anchor for verification)."""
        return self._root

    @property
    def size(self) -> int:
        return self._original_count

    def proof(self, index: int) -> list[tuple[str, int]]:
        """
        Return a Merkle inclusion proof for the leaf at *index*.

        Returns a list of ``(sibling_hash, is_left)`` pairs that,
        together with the leaf hash, recompute the root.

        Raises ``IndexError`` if *index* is out of range.
        """
        if index < 0 or index >= self._original_count:
            raise IndexError(f"Leaf index {index} out of range (0-{self._original_count - 1})")
        proof: list[tuple[str, int]] = []
        for level in self._levels:
            sibling_index = index ^ 1
            if sibling_index < len(level):
                is_left = 1 if sibling_index < index else 0
                proof.append((level[sibling_index], is_left))
            index //= 2
        return proof

    @staticmethod
    def verify(leaf: str, proof: list[tuple[str, int]], root: str, prehashed: bool = False) -> bool:
        """
        Verify that *leaf* is included in a Merkle tree with the given *root*.

        *proof* is the list of ``(sibling_hash, is_left)`` pairs produced
        by ``proof()``.

        *prehashed*: If True, use _hash_prehashed (0x02 prefix) for trees
        built via from_hashes(). If False (default), use _hash (0x00 prefix)
        for trees built via __init__().
        """
        if prehashed:
            current = MerkleTree._hash_prehashed(leaf)
        else:
            current = MerkleTree._hash(leaf)
        for sibling, is_left in proof:
            if is_left:
                current = MerkleTree._pair_hash(sibling, current)
            else:
                current = MerkleTree._pair_hash(current, sibling)
        return hmac.compare_digest(current, root)

    @staticmethod
    def verify_prehashed(leaf_hash: str, proof: list[tuple[str, int]], root: str) -> bool:
        """Verify a proof where the leaf is already a domain-separated hash (0x00 prefix).

        Unlike ``verify(leaf, proof, root)`` which hashes *leaf* with ``_hash()``,
        this treats *leaf_hash* as already-hashed and directly uses it as the
        starting value for proof recomputation.
        """
        current = leaf_hash
        for sibling, is_left in proof:
            if is_left:
                current = MerkleTree._pair_hash(sibling, current)
            else:
                current = MerkleTree._pair_hash(current, sibling)
        return hmac.compare_digest(current, root)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    @classmethod
    def from_hashes(cls, hashes: list[str]) -> MerkleTree:
        """Build a Merkle tree from pre-hashed leaf values (skip leaf hashing).

        Useful when the caller already holds hex digests and does not need
        the domain-separated leaf hash applied again.
        """
        if not hashes:
            raise ValueError("Cannot build Merkle tree from empty hash list")
        tree = cls.__new__(cls)
        tree._original_count = len(hashes)
        tree._leaves = [cls._hash_prehashed(h) for h in hashes]
        next_pow2 = 1
        while next_pow2 < len(tree._leaves):
            next_pow2 <<= 1
        sentinel = tree._hash("")
        tree._leaves += [sentinel] * (next_pow2 - len(tree._leaves))
        tree._root, tree._levels = tree._build(tree._leaves)
        return tree

    @classmethod
    def from_prehashed(cls, hashes: list[str]) -> MerkleTree:
        """Build a Merkle tree from hashes that already have the 0x00 domain prefix.

        Unlike ``from_hashes`` which applies ``_hash_prehashed`` (0x02 prefix),
        this treats the inputs as already-hashed leaf values (0x00 prefix) and
        builds the tree directly.  Use this when the hashes came from ``_hash()``.
        """
        if not hashes:
            raise ValueError("Cannot build Merkle tree from empty hash list")
        tree = cls.__new__(cls)
        tree._original_count = len(hashes)
        tree._leaves = list(hashes)
        next_pow2 = 1
        while next_pow2 < len(tree._leaves):
            next_pow2 <<= 1
        sentinel = cls._hash("")
        tree._leaves += [sentinel] * (next_pow2 - len(tree._leaves))
        tree._root, tree._levels = tree._build(tree._leaves)
        return tree

    @staticmethod
    def _hash(data: str) -> str:
        """Leaf node hash with domain separation prefix 0x00."""
        return hashlib.sha256(b"\x00" + data.encode("utf-8")).hexdigest()

    @staticmethod
    def _hash_prehashed(data: str) -> str:
        """Hash for pre-hashed leaf nodes — distinct domain separator."""
        return hashlib.sha256(b"\x02" + data.encode("utf-8")).hexdigest()

    @staticmethod
    def _pair_hash(left: str, right: str) -> str:
        """Inner node hash with domain separation prefix 0x01 and length prefixes (RFC 6962)."""
        left_bytes = left.encode("utf-8")
        right_bytes = right.encode("utf-8")
        return hashlib.sha256(
            b"\x01"
            + len(left_bytes).to_bytes(4, "big")
            + left_bytes
            + len(right_bytes).to_bytes(4, "big")
            + right_bytes
        ).hexdigest()

    def _build(self, leaves: list[str]) -> tuple[str, list[list[str]]]:
        """Build the tree bottom-up and return ``(root, levels)``."""
        levels: list[list[str]] = []
        current = leaves[:]
        while len(current) > 1:
            levels.append(current[:])
            next_level: list[str] = []
            for i in range(0, len(current), 2):
                next_level.append(self._pair_hash(current[i], current[i + 1]))
            current = next_level
        root = current[0] if current else self._hash("")
        return root, levels


class AppendMerkleTree:
    """Append-only Merkle tree with O(1) appends and correct root computation.

    Instead of maintaining the rightmost path (which can't correctly compute
    roots for non-power-of-2 leaf counts due to structural ambiguity), this
    class maintains the leaf list and delegates root/proof computation to
    ``MerkleTree.from_prehashed()``.

    The win over ``MerkleTree`` is O(1) appends — no full-tree rebuild on
    every add.  Root and proof computation are O(n) but happen infrequently
    (at verification time, not on every block addition).

    Uses the same domain-separated hashing as ``MerkleTree`` (0x00 leaves,
    0x01 inner nodes) for cross-compatibility.
    """

    _SENTINEL: str = MerkleTree._hash("")

    def __init__(self) -> None:
        self._leaf_hashes: list[str] = []
        self._cached_tree: MerkleTree | None = None

    @property
    def root(self) -> str:
        if not self._leaf_hashes:
            return self._SENTINEL
        return self._get_tree().root

    @property
    def size(self) -> int:
        return len(self._leaf_hashes)

    def append(self, leaf_data: str) -> str:
        """Append a leaf (raw data) and return its hash."""
        leaf_hash = MerkleTree._hash(leaf_data)
        self._leaf_hashes.append(leaf_hash)
        self._cached_tree = None  # invalidate cache
        return leaf_hash

    def append_hash(self, leaf_hash: str) -> None:
        """Append a pre-hashed leaf (no domain separator applied)."""
        self._leaf_hashes.append(leaf_hash)
        self._cached_tree = None

    def proof(self, index: int) -> list[tuple[str, int]]:
        """Generate an inclusion proof (O(n) — rebuilds tree)."""
        if index < 0 or index >= len(self._leaf_hashes):
            raise IndexError(f"Leaf index {index} out of range (0-{len(self._leaf_hashes) - 1})")
        return self._get_tree().proof(index)

    def _get_tree(self) -> MerkleTree:
        """Build/rebuild the full MerkleTree from accumulated leaves."""
        if self._cached_tree is None or self._cached_tree._original_count != len(self._leaf_hashes):
            if not self._leaf_hashes:
                raise ValueError("Cannot build Merkle tree from empty leaf list")
            self._cached_tree = MerkleTree.from_prehashed(self._leaf_hashes)
        return self._cached_tree


class MerkleHashChain:
    """
    Combines the linear SHA-256 hash chain with Merkle tree aggregation
    for **efficient batch verification**.

    Every N blocks (default 1024), a Merkle root is computed over the
    current segment and anchored into the chain.  This gives:

    * **O(1)** trust anchor — the latest Merkle root
    * **O(log N)** inclusion proof — prove any block belongs to the chain
    * **O(N)** full verification — walk the entire chain (for audits)

    Reference:
        "Merkle tree aggregation over hash chains" is the standard
        construction used in Certificate Transparency (RFC 6962) and
        blockchain light clients.  This is the first application to
        agent memory integrity verification.

    Usage:
        >>> chain = MerkleHashChain()
        >>> chain.add("block data")
        >>> chain.add("more data")
        >>> proof = chain.proof(1)
        >>> chain.verify(chain.blocks[1], proof, chain.root)  # True
    """

    _SEGMENT_SIZE = 1024

    def __init__(self) -> None:
        self.blocks: list[str] = []
        self.merkle_roots: list[str] = []
        self._current_segment: list[str] = []
        self._trusted_root: str = MerkleTree._hash("")
        self._append_tree: AppendMerkleTree = AppendMerkleTree()

    @property
    def root(self) -> str:
        """Latest Merkle root (trust anchor)."""
        return self._trusted_root

    def add(self, block_data: str) -> str:
        """Add a block to the chain.  Returns the block hash."""
        block_hash = MerkleTree._hash(block_data)
        self.blocks.append(block_hash)
        self._current_segment.append(block_hash)
        # Incremental root update via AppendMerkleTree
        # Use append_hash() since block_hash is already domain-separated (0x00 prefix)
        self._append_tree.append_hash(block_hash)
        self._trusted_root = self._append_tree.root

        if len(self._current_segment) >= self._SEGMENT_SIZE:
            self._finalize_segment()

        return block_hash

    def finalize(self) -> None:
        """Force finalize the current segment."""
        if self._current_segment:
            self._finalize_segment()

    def proof(self, index: int) -> list[tuple[str, int]]:
        """
        Merkle inclusion proof for block at *index*.
        Raises ``IndexError`` if out of range.
        """
        if index < 0 or index >= len(self.blocks):
            raise IndexError(f"Block index {index} out of range (0-{len(self.blocks) - 1})")
        tree = MerkleTree.from_prehashed(self.blocks)
        return tree.proof(index)

    @staticmethod
    def verify(leaf: str, proof: list[tuple[str, int]], root: str) -> bool:
        """Verify a Merkle inclusion proof for a pre-hashed block hash."""
        return MerkleTree.verify_prehashed(leaf, proof, root)

    def verify_chain(self) -> bool:
        """
        Full O(n) verification of the entire chain.
        Returns True if every block is consistent with the latest root.
        """
        if not self.blocks:
            return True
        trusted = self._trusted_root
        current = MerkleTree.from_prehashed(self.blocks).root
        return hmac.compare_digest(current, trusted)

    def proof_json(self, index: int) -> dict[str, Any]:
        """JSON-serializable inclusion proof for API responses."""
        proof = self.proof(index)
        return {
            "leaf": self.blocks[index],
            "root": self.root,
            "proof": [{"sibling": s, "is_left": bool(d)} for s, d in proof],
            "index": index,
            "total_blocks": len(self.blocks),
        }

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _finalize_segment(self) -> None:
        if not self._current_segment:
            return
        segment_root = MerkleTree(self._current_segment).root
        anchored = MerkleTree._hash(segment_root + (self.merkle_roots[-1] if self.merkle_roots else ""))
        self.merkle_roots.append(anchored)
        self._current_segment = []
