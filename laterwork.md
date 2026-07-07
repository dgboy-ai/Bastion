# Later Work — Post-Hackathon Items

## Phase 2

### 9. Submit to Claude Connector Directory

Submit the server to https://claude.com/docs/connectors/building/submission for listing. Requires:
- Server Card at `/.well-known/mcp-server.json` — ✅ done
- OAuth 2.1 — ✅ done
- Tool annotations — ✅ done
- Resources + Prompts — ✅ done
- Fill out the submission form with repo URL, description, and auth details

---

## Phase 3 — World-Class Differentiators

### 12. Video Demo

Record a walkthrough showing an agent using all 8 MCP tools:
1. `memory_store` — store memories
2. `memory_search` — search with C-SPANN vector similarity
3. `memory_timetravel` — query past state
4. `memory_audit` — inspect hash chain
5. `memory_heal` — self-heal expired records
6. `memory_delete` — remove with confirmation
7. `resolve_conflict` — merge conflicting facts
8. `a2a_bridge` — inter-agent card

Use Remotion (`skills/remotion`) for smooth transitions, zooming, and text overlays.

### 13. A2A Bridge — Real Agent Communication

Replace the static agent card with actual A2A protocol communication:
- Wire up `tasks/send` for inter-agent message passing
- Support streaming responses between agents
- Publish capabilities dynamically based on runtime state

### 14. Full OpenAPI + MCP Docs

Serve interactive documentation from the server:
- OpenAPI 3.1 spec at `/.well-known/openapi.json`
- MCP documentation page with tool/resource/prompt reference
- Auto-generated from FastMCP schema
