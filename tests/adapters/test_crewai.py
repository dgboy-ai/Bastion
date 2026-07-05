from bastion.adapters.crewai import BastionShortTermMemory


def test_add():
    memory = BastionShortTermMemory("ca-test", mock=True)
    record = memory.add("Important fact", {"source": "chat"})
    assert record.memory_type == "crewai_memory"
    assert record.content == "Important fact"


def test_search():
    memory = BastionShortTermMemory("ca-search", mock=True)
    memory.add("User likes Python")
    results = memory.search("Python")
    assert len(results) > 0


def test_clear():
    memory = BastionShortTermMemory("ca-clear", mock=True)
    memory.add("Something")
    memory.clear()
