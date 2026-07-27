from bastion.adapters.llamaindex import BastionVectorStore


def test_add():
    store = BastionVectorStore("li-test", mock=True)
    results = store.add(
        [
            {"text": "Document about Python", "source": "docs"},
            {"text": "Document about Rust", "source": "tutorial"},
        ]
    )
    assert len(results) == 2
    assert results[0].memory_type == "llama_index"


def test_query():
    store = BastionVectorStore("li-query", mock=True)
    store.add([{"text": "Python is a programming language"}])
    results = store.query("Python")
    assert len(results) > 0


def test_delete_no_op():
    store = BastionVectorStore("li-del", mock=True)
    store.add([{"text": "Keep this"}])
    store.delete("some-ref-id")
    results = store.query("Keep")
    assert len(results) > 0
