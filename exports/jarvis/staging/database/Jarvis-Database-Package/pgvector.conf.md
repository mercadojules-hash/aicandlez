# pgvector Configuration

Jarvis semantic memory and knowledge graph retrieval depend on **pgvector**.

## Requirement

- Extension: `vector` (pgvector). Mandatory — without it `jarvis_embeddings`
  cannot be created.
- Column: `jarvis_embeddings.n` is `vector(1536)`.
- Dimension: **1536** = OpenAI `text-embedding-3-small`. Fixed in the hybrid
  profile.
- Index: **HNSW** with `vector_cosine_ops` (cosine distance ANN).

## Enable

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

`jarvis_schema.sql` already includes this as its first statement.

## Install the extension binary

- **Docker:** use `pgvector/pgvector:pg16` (preinstalled). See `docker-compose.yml`.
- **Homebrew:** `brew install pgvector` (alongside `postgresql@16`).
- **From source:** <https://github.com/pgvector/pgvector#installation>

## HNSW tuning (optional)

Defaults are fine for a single-user desktop install. For larger knowledge bases:

```sql
-- Build-time (per index): higher m / ef_construction = better recall, slower build
-- Query-time recall/latency tradeoff:
SET hnsw.ef_search = 100;   -- raise for better recall, lower for speed
```

## Verify

```sql
\dx                                   -- 'vector' should be listed
\d jarvis_embeddings                  -- column type vector(1536) + hnsw index
```

## Phase 2 note

Switching embeddings to a local model (e.g. Ollama `nomic-embed-text`, 768 dims)
requires: alter the column to `vector(768)`, drop/rebuild the HNSW index, and
re-embed all rows. Out of scope for the hybrid Phase 1.
