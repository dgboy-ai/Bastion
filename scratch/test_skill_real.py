import asyncio
import json
import os
from dotenv import load_dotenv
from bastion.mcp_server import create_server

async def main():
    # Load env from .env.local
    load_dotenv(dotenv_path=".env.local", override=True)
    conn = os.environ.get("BASTION_CONN", "")
    print(f"Connecting to CockroachDB: {conn[:50]}...")
    
    # Create the MCP server in non-mock mode
    server = create_server(mock=False)
    
    print("\n--- Executing 'reviewing-cluster-health' skill ---")
    
    # Call invoke_agent_skill tool
    # Let's execute the skill queries on the real database!
    result = await server.call_tool("invoke_agent_skill", {
        "skill_name": "reviewing-cluster-health",
        "execute": True
    })
    
    # Parse and print results
    response_text = result[0][0].text
    parsed = json.loads(response_text)
    
    print("\n[Result Summary]")
    print(f"Skill: {parsed.get('skill')}")
    print(f"Description: {parsed.get('description')}")
    print(f"Compatibility: {parsed.get('compatibility')}")
    print(f"Executed: {parsed.get('executed')}")
    
    # Display the results of the queries
    results = parsed.get("execution_results", [])
    print(f"\nExecuted {len(results)} query blocks:")
    for i, res in enumerate(results):
        print(f"\nQuery {i+1} status: {res.get('status')}")
        if "error" in res:
            print(f"Error: {res['error']}")
        elif "rows" in res:
            # Print rows returned from CockroachDB
            rows = res["rows"]
            print(f"Returned {len(rows)} rows:")
            print(json.dumps(rows[:3], indent=2, default=str))

if __name__ == "__main__":
    asyncio.run(main())
