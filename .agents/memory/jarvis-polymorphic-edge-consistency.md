---
name: Jarvis polymorphic edge consistency
description: Invariants for the jarvis knowledge-relationships polymorphic edge table (graph nodes + dangling-edge cleanup).
---

# Jarvis polymorphic knowledge-relationship edges

`jarvis_knowledge_relationships` is a polymorphic edge table: each row's
source/target is `(type, id)` where type ∈ KnowledgeNodeType
(memory|asset|category|decision|task). There is NO DB-level FK, so consistency is
enforced in app code at two points that must stay in lockstep with the type set:

1. **Graph node coverage.** `GET /jarvis/knowledge-graph` must emit a node for
   EVERY type that can appear on an edge. If a referenced type is omitted from
   `nodes[]` but edges still reference it, the payload contains dangling edges and
   Navigation label resolution breaks. (Was broken once: graph emitted only
   category/asset/memory while edges allowed decision/task.)

2. **Dangling-edge cleanup on delete.** Every entity whose type can be an edge
   endpoint must call `deleteRelationshipsForNode(type, id)` in its DELETE handler.
   Missing this on a subset (decision/task were missed once) leaves orphan edges.

**Why:** no referential integrity at the DB layer; the type set is the single
source of truth and both read (graph) and write (delete cleanup) paths derive
from it independently, so they silently drift.

**How to apply:** when adding a new KnowledgeNodeType, update BOTH the graph node
builder and add a `deleteRelationshipsForNode` call in that entity's delete
handler. Frontend `JarvisGraphNode.type` aliases `KnowledgeNodeType` so it stays
in sync; add a matching icon in Navigation's TYPE_ICON.
