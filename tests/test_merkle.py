from __future__ import annotations

import pytest

from bastion.merkle import MerkleHashChain, MerkleTree


class TestMerkleTree:
    def test_single_leaf(self):
        tree = MerkleTree(["a"])
        assert isinstance(tree.root, str)
        assert len(tree.root) == 64  # SHA-256 hex

    def test_two_leaves(self):
        tree = MerkleTree(["a", "b"])
        assert tree.size == 2

    def test_three_leaves_odd(self):
        tree = MerkleTree(["a", "b", "c"])
        assert tree.size == 3

    def test_proof_valid(self):
        leaves = ["alpha", "beta", "gamma", "delta"]
        tree = MerkleTree(leaves)
        for i in range(len(leaves)):
            proof = tree.proof(i)
            assert MerkleTree.verify(leaves[i], proof, tree.root)

    def test_proof_invalid_leaf(self):
        tree = MerkleTree(["x", "y"])
        proof = tree.proof(0)
        assert not MerkleTree.verify("z", proof, tree.root)

    def test_proof_invalid_root(self):
        tree = MerkleTree(["x", "y"])
        proof = tree.proof(0)
        assert not MerkleTree.verify("x", proof, "0" * 64)

    def test_proof_index_error(self):
        tree = MerkleTree(["a"])
        with pytest.raises(IndexError):
            tree.proof(5)

    def test_empty_raises(self):
        with pytest.raises(ValueError, match="empty"):
            MerkleTree([])

    def test_large_tree_symmetry(self):
        leaves = [f"block-{i}" for i in range(128)]
        tree = MerkleTree(leaves)
        for i in range(len(leaves)):
            assert MerkleTree.verify(leaves[i], tree.proof(i), tree.root)


class TestMerkleHashChain:
    def test_empty_chain(self):
        chain = MerkleHashChain()
        assert len(chain.blocks) == 0
        assert chain.verify_chain()

    def test_add_blocks(self):
        chain = MerkleHashChain()
        h1 = chain.add("first block")
        h2 = chain.add("second block")
        assert len(chain.blocks) == 2
        assert isinstance(h1, str)
        assert isinstance(h2, str)

    def test_proof_valid(self):
        chain = MerkleHashChain()
        entries = ["entry-a", "entry-b", "entry-c", "entry-d"]
        for e in entries:
            chain.add(e)
        for i in range(len(entries)):
            proof = chain.proof(i)
            assert chain.verify(chain.blocks[i], proof, chain.root)

    def test_verify_chain(self):
        chain = MerkleHashChain()
        for i in range(10):
            chain.add(f"data-{i}")
        assert chain.verify_chain()

    def test_tampered_block_detected(self):
        chain = MerkleHashChain()
        chain.add("original")
        chain.add("more data")
        chain.blocks[0] = "tampered"
        assert not chain.verify_chain()

    def test_proof_json_format(self):
        chain = MerkleHashChain()
        chain.add("hello")
        chain.add("world")
        p = chain.proof_json(0)
        assert "leaf" in p
        assert "root" in p
        assert "proof" in p
        assert "index" in p
        assert "total_blocks" in p
        assert isinstance(p["proof"], list)

    def test_segment_finalization(self):
        chain = MerkleHashChain()
        for i in range(2048):  # 2 segments
            chain.add(f"block-{i}")
        assert len(chain.merkle_roots) >= 1

    def test_verify_after_segment_finalization(self):
        chain = MerkleHashChain()
        for i in range(2048):
            chain.add(f"block-{i}")
        assert chain.verify_chain()

    def test_proof_out_of_range(self):
        chain = MerkleHashChain()
        chain.add("only")
        with pytest.raises(IndexError):
            chain.proof(42)

    def test_root_changes_with_additions(self):
        chain = MerkleHashChain()
        root1 = chain.root
        chain.add("new data")
        root2 = chain.root
        assert root1 != root2
