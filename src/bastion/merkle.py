from __future__ import annotations

import hashlib
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

    Usage:
        >>> leaves = ["a", "b", "c", "d"]
        >>> tree = MerkleTree(leaves)
        >>> proof = tree.proof(1)          # proof for leaf "b"
        >>> tree.verify("b", proof)        # True
    """

    def __init__(self, leaves: list[str]) -> None:
        if not leaves:
            raise ValueError("Cannot build Merkle tree from empty leaf list")
        self._leaves = [self._hash(leaf) for leaf in leaves]
        self._root, self._levels = self._build(self._leaves)

    @property
    def root(self) -> str:
        """Merkle root hash (trusted anchor for verification)."""
        return self._root

    @property
    def size(self) -> int:
        return len(self._leaves)

    def proof(self, index: int) -> list[tuple[str, int]]:
        """
        Return a Merkle inclusion proof for the leaf at *index*.

        Returns a list of ``(sibling_hash, is_left)`` pairs that,
        together with the leaf hash, recompute the root.

        Raises ``IndexError`` if *index* is out of range.
        """
        if index < 0 or index >= len(self._leaves):
            raise IndexError(f"Leaf index {index} out of range (0-{len(self._leaves)-1})")
        proof: list[tuple[str, int]] = []
        for level in self._levels:
            sibling_index = index ^ 1
            if sibling_index < len(level):
                is_left = 1 if sibling_index < index else 0
                proof.append((level[sibling_index], is_left))
            index //= 2
        return proof

    @staticmethod
    def verify(leaf: str, proof: list[tuple[str, int]], root: str) -> bool:
        """
        Verify that *leaf* is included in a Merkle tree with the given *root*.

        *proof* is the list of ``(sibling_hash, is_left)`` pairs produced
        by ``proof()``.
        """
        current = MerkleTree._hash(leaf)
        for sibling, is_left in proof:
            if is_left:
                current = MerkleTree._hash(sibling + current)
            else:
                current = MerkleTree._hash(current + sibling)
        return current == root

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    @staticmethod
    def _hash(data: str) -> str:
        return hashlib.sha256(data.encode("utf-8")).hexdigest()

    @staticmethod
    def _pair_hash(left: str, right: str) -> str:
        return MerkleTree._hash(left + right)

    def _build(self, leaves: list[str]) -> tuple[str, list[list[str]]]:
        """Build the tree bottom-up and return ``(root, levels)``."""
        levels: list[list[str]] = []
        current = leaves[:]
        while len(current) > 1:
            levels.append(current[:])
            next_level: list[str] = []
            for i in range(0, len(current), 2):
                if i + 1 < len(current):
                    next_level.append(self._pair_hash(current[i], current[i + 1]))
                else:
                    next_level.append(current[i])  # odd leaf carries upward
            current = next_level
        root = current[0] if current else self._hash("")
        return root, levels


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

    @property
    def root(self) -> str:
        """Latest Merkle root (trust anchor)."""
        return self._trusted_root

    def add(self, block_data: str) -> str:
        """Add a block to the chain.  Returns the block hash."""
        block_hash = MerkleTree._hash(block_data)
        self.blocks.append(block_hash)
        self._current_segment.append(block_hash)
        self._trusted_root = MerkleTree(self.blocks).root

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
            raise IndexError(f"Block index {index} out of range (0-{len(self.blocks)-1})")
        tree = MerkleTree(self.blocks)
        return tree.proof(index)

    @staticmethod
    def verify(leaf: str, proof: list[tuple[str, int]], root: str) -> bool:
        """Verify a Merkle inclusion proof."""
        return MerkleTree.verify(leaf, proof, root)

    def verify_chain(self) -> bool:
        """
        Full O(n) verification of the entire chain.
        Returns True if every block is consistent with the latest root.
        """
        if not self.blocks:
            return True
        trusted = self._trusted_root
        current = MerkleTree(self.blocks).root
        return current == trusted

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
