import httpx
resp = httpx.get('http://127.0.0.1:8000/.well-known/mcp-server.json', headers={'Authorization': 'Bearer BASTION_API_KEY_REMOVED'}, timeout=10)
data = resp.json()
print(f'Tools: {len(data["tools"])}')
for t in data['tools']:
    print(f'  - {t["name"]}')