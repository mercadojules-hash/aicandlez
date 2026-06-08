# Jarvis Desktop Edition — Runtime Validation Report

**Task:** T009 — Final Runtime Validation
**Date:** 2026-06-08
**Validated by:** automated runtime execution in a clean, isolated environment
(fresh PostgreSQL database `jarvis_validate`, the shipped package installed in a
clean directory, cloud AI keys explicitly removed from the process so the
**Ollama** provider path is exercised).

> **Integrity note.** Every result below was produced by actually running the
> code. Where a step genuinely cannot run inside this Linux validation
> environment (a real multi-GB `llama3.1` pull, and microphone / browser audio
> I/O), it is marked **MAC-ONLY** and described honestly — no result is
> fabricated. See `REMAINING_LIMITATIONS_REPORT.md` for the full list.

---

## Summary

| # | Validation                         | Result | Evidence type |
|---|------------------------------------|--------|---------------|
| 1 | PostgreSQL schema restore          | ✅ PASS | Real run |
| 2 | pgvector extension                 | ✅ PASS | Real run |
| 3 | Ollama connectivity (provider)     | ✅ PASS (wiring) / ⚠️ model pull MAC-ONLY | Real run vs. mock + honest gap |
| 4 | Memory store / retrieve / persist  | ✅ PASS | Real run |
| 5 | Voice pipeline                     | ⚠️ PARTIAL — server orchestrator + LLM verified; mic/STT/TTS MAC-ONLY | Real run + honest gap |
| 6 | `pnpm install && pnpm dev` launch  | ✅ PASS | Real run |

---

## 1. PostgreSQL Validation — ✅ PASS

Created a brand-new database, restored the shipped schema, confirmed every table
restored, reported the count.

```
$ createdb jarvis_validate                         # fresh, empty database
$ psql <jarvis_validate> -v ON_ERROR_STOP=1 -f db/jarvis_schema.sql
restore exit: 0
errors in restore: (none)

TABLE COUNT (public, BASE TABLE): 48
```

- Restore exit code **0**, zero errors / zero warnings.
- **48 tables** restored — matches the 48 `CREATE TABLE` statements shipped in
  `db/jarvis_schema.sql`.

## 2. pgvector Validation — ✅ PASS

The schema declares the extension at the top (line 4):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

After restore, the extension is registered and a real `vector` column exists:

```
$ psql <jarvis_validate> -tAc "SELECT extname, extversion FROM pg_extension WHERE extname='vector';"
vector|0.8.0

$ psql <jarvis_validate> -tAc "SELECT count(*) FROM information_schema.columns WHERE udt_name='vector';"
1            # the jarvis embeddings table's vector column
```

- `CREATE EXTENSION vector;` succeeds and **appears in `pg_extension`** (v0.8.0).
- The embeddings vector column materialized, confirming pgvector is usable by the
  schema, not merely installed.

## 3. Ollama Validation — ✅ PASS (provider wiring) / ⚠️ real model pull is MAC-ONLY

**What was proven here (real run):** with **all cloud AI keys removed** from the
backend process (`env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY`) and only
`OLLAMA_BASE_URL` + `JARVIS_OLLAMA_MODEL=llama3.1` set, the cognition provider
**selects the Ollama path and issues a real HTTP request to the Ollama
OpenAI-compatible endpoint**. An OpenAI-compatible stand-in was bound to
`127.0.0.1:11434` to capture the call without downloading the multi-GB model.

```
# Cognition endpoint  GET /api/jarvis/query?q=...
mock-ollama hits: [{"method":"POST","url":"/v1/chat/completions"}]    # provider connected ✅

# Voice turn (voice enabled) also routed its LLM call to Ollama:
intent: executive_briefing
mock-ollama hits: [{"method":"POST","url":"/v1/chat/completions"}]    # provider connected ✅
```

This confirms the **request/response transport, base-URL config, model name, and
provider-selection logic are correct** — Jarvis connects to whatever is serving
`OLLAMA_BASE_URL`. Because the stand-in returns free-form text rather than the
structured JSON proposal a real model emits, `think()` reported
`degradedReason: "model output could not be parsed into a proposal"` and fell
back to an extractive answer — this is an artifact of the stub, **not** of the
wiring.

**MAC-ONLY remainder:** installing the real Ollama runtime and
`ollama pull llama3.1` (a multi-GB host binary + model) must be done on the
target Mac. Once running, `OLLAMA_BASE_URL=http://localhost:11434` requires no
code change — the same path verified above will produce real, structured
completions. See `REMAINING_LIMITATIONS_REPORT.md`.

## 4. Memory Validation — ✅ PASS (including persistence across restart)

Booted the backend against the fresh DB, stored a memory, retrieved it, then
**killed the process and booted a brand-new backend process** against the same
database and re-fetched the same record.

```
# STORE  POST /api/jarvis/memories
201 → {"memory":{"id":"e82d26f6-…-64905251f02b","title":"T009 Runtime Validation Marker",
                  "content":"persistence probe alpha-7731", ...}}

# RETRIEVE (same process)  GET /api/jarvis/memories
count 1 ; has_marker True

# --- process killed; FRESH backend process started on a new port ---

# RETRIEVE BY ID (new process)  GET /api/jarvis/memories/{id}
persisted_id    e82d26f6-…-64905251f02b
persisted_title T009 Runtime Validation Marker
persisted_body  persistence probe alpha-7731
list count (new process): 1

# Direct DB confirmation:
$ psql … "SELECT id||' | '||content FROM jarvis_memories WHERE content LIKE '%alpha-7731%';"
e82d26f6-…-64905251f02b | persistence probe alpha-7731
```

- Store → retrieve → **survives a full application restart** because state lives
  in PostgreSQL, not process memory. ✅

## 5. Voice Validation — ⚠️ PARTIAL (server pipeline verified; client I/O is MAC-ONLY)

Voice is an I/O modality gated by the `cognition.voice.enabled` setting
(default **OFF**). With it enabled and a session created, the server-side
orchestrator was driven end-to-end via the text-turn entrypoint:

```
# POST /api/jarvis/voice/sessions → 201 (session created)
# POST /api/jarvis/voice/turn-text {transcript:"…", source:"text"}
intent:       executive_briefing      # intent router ran
capability:   executive_briefing
mock-ollama hits: [{"method":"POST","url":"/v1/chat/completions"}]   # LLM call routed to Ollama ✅
ttsOk:        false                    # no ELEVENLABS_API_KEY → server TTS skipped (by design)
audioBase64:  null                     # → client falls back to browser en-GB TTS
status:       degraded                 # stub LLM text (same artifact as §3)
```

**Verified server-side (real run):** session lifecycle, the
`cognition.voice.enabled` gate (returns a governed `disabled` envelope when off),
intent routing, and the **LLM call routed through the Ollama provider during a
voice turn**.

**MAC-ONLY (browser + hardware):** microphone capture, speech-to-text from
recorded audio, and text-to-speech *playback* are client-side. Premium STT/TTS
use ElevenLabs (`ELEVENLABS_API_KEY`); with no key the client uses the browser's
native Web Speech API (STT) and `speechSynthesis` (en-GB TTS). These require a
real microphone and a Chromium/Safari browser and cannot be exercised in a
headless validation environment. See `REMAINING_LIMITATIONS_REPORT.md`.

## 6. Desktop Acceptance Test (`pnpm install && pnpm dev`) — ✅ PASS

The package was installed in a clean directory and launched with the **exact
documented command**.

```
# clean install (verified in this and the prior build session)
pnpm install → 463 packages, 0 unresolved @workspace/* or catalog: refs

# documented launch
$ pnpm dev          # dotenv -e .env -- concurrently --names "api,web" …
[web] VITE v7.3.5 ready in 1054 ms — Local: http://localhost:5180/
[api] tsx watch src/index.ts
API  http://127.0.0.1:5092/api/healthz → {"ok":true,"service":"jarvis-desktop"}   ✅
WEB  http://127.0.0.1:5180/            → HTTP 200, <title>Jarvis Executive Command Center</title>, #root, /@vite/client  ✅
```

- `concurrently` brings up **both** the API (`jarvis-server`) and the web app
  (`jarvis`) from a single `pnpm dev`.
- API health endpoint returns `service:"jarvis-desktop"`; the web app serves its
  HTML shell. Jarvis launches fully.

Remaining manual steps for a brand-new Mac are enumerated in the
`FINAL_DESKTOP_READINESS_ASSESSMENT.md`.
