---
name: Jarvis code grounding via citation-only ref type
description: How Phase-1 lexical code grounding was added to Jarvis cognition without leaking "code" into the graph/embedding pipeline.
---

# Jarvis code grounding (Phase 1, lexical — no embeddings)

Jarvis cognition can reason from ACTUAL source-code content via LEXICAL retrieval
of `jarvis_code_files.content` (raw file text, capped per file). This was done
WITHOUT an embedding pipeline.

## The load-bearing type split (do not collapse)
- `GraphNodeType` = the 5 graph/embedding subject types (memory, asset, category,
  decision, task). This is the EMBEDDING + graph-edge universe.
- `CitationNodeType = GraphNodeType | "code"` lives ONLY in the retrieval/citation
  layer (`cognition/types.ts`). `code` is a CITATION-only ref type.

**Why:** widening `GraphNodeType` to include `code` would force `code` into
`indexer.ts` `loadCandidates` exhaustive switch + `countCorpus` object-map (→ code
gets embedded) and into the relationship zod enum (→ code becomes a graph edge
endpoint → dangling-edge risk, see jarvis-polymorphic-edge-consistency). Keeping
the split means code is never embedded and never an edge endpoint.

**How to apply / invariants to preserve when touching code grounding:**
- `VALID_NODE_TYPES` (retrieval.ts — semantic ANN + one-hop discovery) stays
  graph-only. `code` MUST be excluded so it is never graph-expanded.
- `VALID_TYPES` (cognition/index.ts — model citation allowlist) DOES include
  `code` so the model may emit `[code:id]` citations.
- `fetchCode()` is hop-0 lexical only and MUST stay fail-safe (`try/catch -> []`);
  a code-index miss must never break `retrieve()`.
- Code docs get a wider snippet window (`CODE_SNIPPET_MAX_CHARS`) so a function
  body survives context truncation; total prompt still bounded.
- Indexer stores content only for files <= read cap; large files stay
  metadata-only (content null). Backfill check must NOT skip hash-unchanged rows
  whose content is still null, or they never get backfilled after the column adds.

## Known limitation (informs full Code-RAG decision)
Lexical-only ranking surfaces files that match many generic query terms (e.g.
render.yaml, guardrail scripts) over the single most-semantically-relevant file.
Good enough to ground/cite real code; weak at "find THE function". Full Code-RAG
(chunk-level embeddings) is what closes that ranking gap.
