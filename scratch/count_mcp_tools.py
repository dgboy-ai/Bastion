import asyncio
from bastion.mcp_server import create_server

def main():
    server = create_server(mock=True)
    tools = server._tool_manager.list_tools()
    print(f"Total MCP Tools: {len(tools)}")
    print("Registered Tool Names:")
    for t in sorted([tool.name for tool in tools]):
        print(f"  - {t}")

if __name__ == "__main__":
    main()
