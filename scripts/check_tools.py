import httpx
resp = httpx.get('http://127.0.0.1:8000/.well-known/mcp-server.json', headers={'Authorization': 'Bearer bastion-f6ce4b88f8f1ecb1bbfba069ea86955e30be9c1b'}, timeout=10)
data = resp.json()
print(f'Tools: {len(data["tools"])}')
for t in data['tools']:
    print(f'  - {t["name"]}')