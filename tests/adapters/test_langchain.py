from bastion.adapters.langchain import BastionChatMessageHistory


def test_save_context():
    history = BastionChatMessageHistory("lc-test", mock=True)
    records = history.save_context({"input": "Hello"}, {"response": "Hi there"})
    assert len(records) == 2
    assert records[0].memory_type == "chat_input"
    assert records[1].memory_type == "chat_output"


def test_load_memory():
    history = BastionChatMessageHistory("lc-load", mock=True)
    history.save_context({"input": "Q1"}, {"response": "A1"})
    history.save_context({"input": "Q2"}, {"response": "A2"})
    loaded = history.load_memory(k=10)
    assert len(loaded) >= 2


def test_clear():
    history = BastionChatMessageHistory("lc-clear", mock=True)
    history.save_context({"input": "X"}, {"response": "Y"})
    history.clear()
