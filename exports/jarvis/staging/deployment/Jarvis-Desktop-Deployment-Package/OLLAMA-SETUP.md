# Ollama Setup (local cognition)

Jarvis cognition runs against **Ollama** via its OpenAI-compatible API
(`/v1/chat/completions`). Embeddings do **not** use Ollama in the hybrid profile.

## 1. Install

```bash
brew install ollama
# or download the macOS app: https://ollama.com/download
```

## 2. Start the server

```bash
ollama serve          # runs on http://localhost:11434
```

The macOS app starts this automatically (menu-bar icon).

## 3. Pull a cognition model

Choose based on your Mac's RAM:

| Model            | RAM    | Notes                                   |
| ---------------- | ------ | --------------------------------------- |
| `llama3.1`       | 8 GB+  | Solid general default                   |
| `qwen2.5:14b`    | 16 GB+ | Stronger reasoning                      |
| `llama3.1:70b`   | 64 GB+ | Best quality, needs a large machine     |
| `mistral`        | 8 GB+  | Lightweight fallback                    |

```bash
ollama pull llama3.1
```

**The pulled model name must match `JARVIS_OLLAMA_MODEL` in `.env`.**

## 4. Verify

```bash
ollama list                                   # shows installed models
curl http://localhost:11434/api/tags          # JSON list
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3.1","messages":[{"role":"user","content":"hello"}]}'
```

## How Jarvis uses it

- The cognition adapter reuses the OpenAI SDK with `baseURL=OLLAMA_BASE_URL` and a
  dummy key. The provider selector picks Ollama first when `OLLAMA_BASE_URL` is set.
- Every cognition call remains **fail-safe**: a model/timeout/parse error resolves
  to a graceful degraded reply, never a crash.
- Cost accounting still records to the audit ledger but local inference is free,
  so cost figures are informational only.

## Tuning

- First call after `ollama serve` is slow (model load into memory). Keep Ollama
  running to avoid cold starts.
- Larger context = more RAM. If you see OOM, pick a smaller model or quantization
  (e.g. `llama3.1:8b-instruct-q4_0`).
