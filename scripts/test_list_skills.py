import sys
sys.path.insert(0, 'src')
from bastion.mcp_server import create_server
import asyncio
import json

async def test():
    mcp = create_server(connection_string='', mock=False)
    tool = mcp._tool_manager._tools['list_agent_skills']
    
    class MockContext:
        client_id = 'test'
    
    result = await tool.fn(MockContext())
    data = json.loads(result)
    print(f'Total skills: {data["total"]}')
    for s in data['skills'][:5]:
        print(f'  - {s["name"]}: {s["description"][:60]}...')

asyncio.run(test())