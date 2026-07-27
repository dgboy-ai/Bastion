import re

with open(r'c:\projects\bastion\src\bastion\a2a_server.py', encoding='utf-8') as f:
    content = f.read()

# Find skill/tool definitions - A2A uses "skills" in agent card
skills = re.findall(r'"id":\s*"([^"]+)"', content)
# Also check for @app.route or skill registration patterns
routes = re.findall(r'@app\.(get|post|put|delete)\(["\']([^"\']+)', content)

print(f'Skill IDs found: {len(skills)}')
for s in skills[:40]:
    print(f'  {s}')

print(f'\nRoutes: {len(routes)}')
for method, path in routes[:40]:
    print(f'  {method.upper()} {path}')
