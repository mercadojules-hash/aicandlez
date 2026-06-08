# Jarvis Desktop — Startup (day-to-day)

## Start everything

```bash
# Ensure Ollama is running (menu-bar app, or:)
ollama serve &

# Ensure Postgres is up
docker compose up -d        # OR: brew services start postgresql@16

# Run backend + frontend together
./scripts/dev.sh
```

Then open <http://localhost:5173>.

## Start services individually

```bash
# Backend (Express, Jarvis routes) — http://localhost:3000
pnpm --filter @jarvis/server run dev

# Frontend (Vite) — http://localhost:5173
pnpm --filter @jarvis/web run dev
```

## Health checks

```bash
curl http://localhost:3000/api/healthz          # backend alive
curl http://localhost:11434/api/tags            # ollama models available
psql "$DATABASE_URL" -c "select count(*) from jarvis_settings;"   # db reachable
```

## Stop everything

```bash
# Ctrl-C the dev.sh process, then:
docker compose down                # or: brew services stop postgresql@16
# Ollama can be left running or quit from the menu bar
```

## Common issues

| Symptom                              | Cause / fix                                            |
| ------------------------------------ | ------------------------------------------------------ |
| Chat replies "I wasn't able to compile that" | Ollama not running or wrong model — `ollama serve`, check `JARVIS_OLLAMA_MODEL` matches a pulled model |
| Semantic search returns weak results | `OPENAI_API_KEY` missing → degraded to lexical (expected in that mode) |
| 401 on every request                 | Clerk keys missing/incorrect in `.env`                 |
| `relation "jarvis_..." does not exist` | Schema not applied — run `./scripts/seed.sh`         |
| `type "vector" does not exist`       | pgvector extension missing — `CREATE EXTENSION vector;` |
