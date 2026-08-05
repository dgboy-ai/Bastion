import re

src = open("src/bastion/mcp_server.py").read()

# Find the tools_list = [...] section
start = src.find("tools_list = [")
end = src.find("\n        ]", start)
tool_section = src[start:end]

tool_names = re.findall(r'"name":\s*"([^"]+)"', tool_section)

print(f"{len(tool_names)} registered MCP tools:")
for n in sorted(tool_names):
    print(f"  {n}")
