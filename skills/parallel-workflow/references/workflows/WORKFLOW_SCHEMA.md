# Workflow schema

Every recipe is a document with this shape:

```markdown
# <id>

**Goal:** one sentence.

**Cost estimate:** ~$X, ~Y min.

## Steps

### 1. Discover
- tool: `web_search` — objective: "..." ; search_queries: ["...", "..."]; mode: fast
- why: ...

### 2. Deepen
- tool: `web_fetch` — urls: [...] ; objective: "..."
- why: ...

### 3. Synthesize
- tool: `web_research` — prompt: "..."; processor: core; output_schema: <json>
**Deliverable:** <file/table/brief> with cited URLs.
```

**Rules:** every step names its tool and the exact params; costs stay under ~$0.10 per run unless the goal demands more; citations are preserved to the deliverable.
