# Bastion Dashboard

Web interface for monitoring and managing Bastion agent memory. Built with Next.js, connects to the same CockroachDB cluster as the MCP server.

## Features

- **Memory Explorer** — browse, search, and inspect stored memories
- **Hash Chain Visualizer** — verify cryptographic integrity in real-time
- **Time-Travel Debugger** — query memory state at any point in time
- **OWASP ASI06 Guard** — monitor prompt injection detection
- **CDC Pipeline** — track changefeed status and S3 archives
- **Compliance Reports** — EU AI Act Article 12 evidence

## Setup

```bash
cd dashboard
cp .env.example .env.local
# Edit .env.local with your BASTION_CONN and BASTION_API_KEY
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

See `.env.example` for all options. Required:

- `BASTION_CONN` — CockroachDB connection string
- `BASTION_API_KEY` — Bastion API key for MCP server auth

## Build

```bash
npm run build
npm start
```
