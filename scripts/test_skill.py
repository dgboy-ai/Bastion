import sys
sys.path.insert(0, 'src')
from bastion.mcp_server import create_server
import asyncio
import json

async def test():
    mcp = create_server(connection_string='', mock=False)
    
    # Get the invoke_agent_skill function
    tool = mcp._tool_manager._tools['invoke_agent_skill']
    print(f"Tool type: {type(tool)}")
    print(f"Tool fn: {tool.fn}")
    
    # Call the actual function
    class MockContext:
        client_id = 'test'
    
    result = await tool.fn(MockContext(), 'triaging-live-sql-activity', execute=True)
    data = json.loads(result)
    print(f'Skill: {data["skill"]}')
    print(f'Executed: {data["executed"]}')
    print(f'Results: {len(data.get("execution_results", []))}')
    for r in data.get('execution_results', [])[:5]:
        print(f'  Query {r["query_index"]}: {r["status"]} - {r.get("row_count", "N/A")} rows')

asyncio.run(test())