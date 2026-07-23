from __future__ import annotations

import pytest

from bastion.merkle import AppendMerkleTree, MerkleHashChain, MerkleTree


class TestMerkleTree:
    def test_single_leaf(self):
        tree = MerkleTree(["a"])
        assert isinstance(tree.root, str)
        assert len(tree.root) == 64  # SHA-256 hex

    def test_two_leaves(self):
        tree = MerkleTree(["a", "b"])
        assert tree.size == 2
        assert len(tree.root) == 64
        assert isinstance(tree.root, str)
        # Root is deterministic for same leaves
        tree2 = MerkleTree(["a", "b"])
        assert tree.root == tree2.root
        # Different leaves produce different root
        tree3 = MerkleTree(["a", "c"])
        assert tree.root != tree3.root

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


# ── AppendMerkleTree ──────────────────────────────────────────────────────────


class TestAppendMerkleTree:
    def test_empty_tree(self):
        tree = AppendMerkleTree()
        assert tree.size == 0
        assert isinstance(tree.root, str)

    def test_single_append(self):
        tree = AppendMerkleTree()
        tree.append_hash(MerkleTree._hash("a"))
        assert tree.size == 1
        assert len(tree.root) == 64

    def test_root_matches_merkle_tree(self):
        """AppendMerkleTree root must match MerkleTree root for same leaves."""
        leaves = ["a", "b", "c", "d"]
        # Build via AppendMerkleTree
        append_tree = AppendMerkleTree()
        for leaf in leaves:
            append_tree.append(leaf)
        # Build via MerkleTree
        full_tree = MerkleTree(leaves)
        assert append_tree.root == full_tree.root

    def test_root_matches_odd_leaves(self):
        leaves = ["x", "y", "z"]
        append_tree = AppendMerkleTree()
        for leaf in leaves:
            append_tree.append(leaf)
        full_tree = MerkleTree(leaves)
        assert append_tree.root == full_tree.root

    def test_root_matches_single_leaf(self):
        append_tree = AppendMerkleTree()
        append_tree.append("only")
        full_tree = MerkleTree(["only"])
        assert append_tree.root == full_tree.root

    def test_root_matches_power_of_two(self):
        leaves = [f"block-{i}" for i in range(8)]
        append_tree = AppendMerkleTree()
        for leaf in leaves:
            append_tree.append(leaf)
        full_tree = MerkleTree(leaves)
        assert append_tree.root == full_tree.root

    def test_root_matches_large(self):
        leaves = [f"item-{i}" for i in range(64)]
        append_tree = AppendMerkleTree()
        for leaf in leaves:
            append_tree.append(leaf)
        full_tree = MerkleTree(leaves)
        assert append_tree.root == full_tree.root

    def test_root_increments(self):
        tree = AppendMerkleTree()
        roots = [tree.root]
        for i in range(10):
            tree.append(f"leaf-{i}")
            roots.append(tree.root)
        # Each root should be different
        assert len(set(roots)) == 11

    def test_append_hash(self):
        """append_hash accepts pre-hashed values without re-hashing."""
        tree = AppendMerkleTree()
        h = MerkleTree._hash("test")
        tree.append_hash(h)
        assert tree.size == 1

    def test_produces_valid_proof(self):
        leaves = ["alpha", "beta", "gamma", "delta"]
        tree = AppendMerkleTree()
        for leaf in leaves:
            tree.append(leaf)
        for i in range(len(leaves)):
            proof = tree.proof(i)
            # Verify using MerkleTree.verify with raw leaf data
            assert MerkleTree.verify(leaves[i], proof, tree.root)

    def test_proof_index_error(self):
        tree = AppendMerkleTree()
        tree.append("a")
        with pytest.raises(IndexError):
            tree.proof(5)


# ── MerkleTree.from_prehashed / verify_prehashed ─────────────────────────────


class TestMerkleTreePrehashed:
    def test_from_prehashed_root_matches(self):
        """from_prehashed root must match MerkleTree root for same raw data."""
        leaves = ["a", "b", "c", "d"]
        hashes = [MerkleTree._hash(leaf) for leaf in leaves]
        tree_normal = MerkleTree(leaves)
        tree_prehashed = MerkleTree.from_prehashed(hashes)
        assert tree_normal.root == tree_prehashed.root

    def test_from_prehashed_root_matches_odd(self):
        leaves = ["x", "y", "z"]
        hashes = [MerkleTree._hash(leaf) for leaf in leaves]
        assert MerkleTree(leaves).root == MerkleTree.from_prehashed(hashes).root

    def test_from_prehashed_proof_valid(self):
        leaves = ["alpha", "beta", "gamma", "delta"]
        hashes = [MerkleTree._hash(leaf) for leaf in leaves]
        tree = MerkleTree.from_prehashed(hashes)
        for i in range(len(hashes)):
            proof = tree.proof(i)
            assert MerkleTree.verify_prehashed(hashes[i], proof, tree.root)

    def test_verify_prehashed_vs_verify(self):
        """verify_prehashed with a domain-separated hash should match verify with raw data."""
        leaves = ["test-a", "test-b"]
        tree = MerkleTree(leaves)
        proof = tree.proof(0)
        # Both should verify the same leaf
        assert MerkleTree.verify(leaves[0], proof, tree.root)
        assert MerkleTree.verify_prehashed(MerkleTree._hash(leaves[0]), proof, tree.root)

    def test_verify_prehashed_rejects_wrong_hash(self):
        leaves = ["a", "b"]
        tree = MerkleTree(leaves)
        proof = tree.proof(0)
        wrong_hash = MerkleTree._hash("wrong")
        assert not MerkleTree.verify_prehashed(wrong_hash, proof, tree.root)

    def test_from_prehashed_empty_raises(self):
        with pytest.raises(ValueError, match="empty"):
            MerkleTree.from_prehashed([])

    def test_from_prehashed_deterministic(self):
        leaves = ["a", "b", "c"]
        hashes = [MerkleTree._hash(leaf) for leaf in leaves]
        t1 = MerkleTree.from_prehashed(hashes)
        t2 = MerkleTree.from_prehashed(hashes)
        assert t1.root == t2.root


# ── MerkleHashChain integration with AppendMerkleTree ────────────────────────


class TestMerkleHashChainIncremental:
    def test_incremental_root_matches_full_build(self):
        """Chain root from incremental AppendMerkleTree must match full MerkleTree."""
        chain = MerkleHashChain()
        for i in range(20):
            chain.add(f"block-{i}")
        full_tree = MerkleTree.from_prehashed(chain.blocks)
        assert chain.root == full_tree.root

    def test_incremental_root_matches_odd_count(self):
        chain = MerkleHashChain()
        for i in range(7):
            chain.add(f"item-{i}")
        full_tree = MerkleTree.from_prehashed(chain.blocks)
        assert chain.root == full_tree.root

    def test_incremental_root_single(self):
        chain = MerkleHashChain()
        chain.add("only-one")
        full_tree = MerkleTree.from_prehashed(chain.blocks)
        assert chain.root == full_tree.root

    def test_incremental_root_power_of_two(self):
        chain = MerkleHashChain()
        for i in range(16):
            chain.add(f"p2-{i}")
        full_tree = MerkleTree.from_prehashed(chain.blocks)
        assert chain.root == full_tree.root

    def test_proof_after_incremental_add(self):
        """Proofs generated after incremental adds must still verify."""
        chain = MerkleHashChain()
        entries = [f"entry-{i}" for i in range(32)]
        for e in entries:
            chain.add(e)
        for i in range(len(entries)):
            proof = chain.proof(i)
            assert chain.verify(chain.blocks[i], proof, chain.root)

    def test_verify_chain_after_many_adds(self):
        chain = MerkleHashChain()
        for i in range(100):
            chain.add(f"data-{i}")
        assert chain.verify_chain()
