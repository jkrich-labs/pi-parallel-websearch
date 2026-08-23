# Parallel Task API — guide & settings reference

Derived from https://docs.parallel.ai/task-api/* (task quickstart, specify-a-task, choose-a-processor, deep research, research basis).

## What it is

POST /v1/tasks/runs creates an async, multi-step web research run. You get a `run_id`; the run works the web (search → fetch → synthesize) and produces output conforming to your output schema, with per-field citations. The extension polls/waits for you via the blocking result endpoint.

## Processors (cost per 1,000 runs; only completed runs billed)

| Processor | Cost | Latency | Max fields | Strengths |
| --- | --- | --- | --- | --- |
| `lite` | $5 | 10-60s | ~2 | Basic metadata, low latency |
| `base` | $10 | 15-100s | ~5 | Reliable standard enrichments |
| `core` | $25 | 60s-5min | ~10 | Cross-referenced, moderately complex |
| `core2x` | $50 | 1-10min | ~10 | High complexity cross-referenced |
| `pro` | $100 | 2-10min | ~20 | Exploratory web research |
| `ultra` | $300 | 5-25min | ~20 | Advanced multi-source deep research |

All processors have `-fast` variants (faster, same price, same max fields). The `~` in max fields is approximate: simple fields (dates, booleans) use less capacity than complex analytical fields.

## Task spec (output schemas)

```jsonc
{
  "processor": "core",
  "input": "natural language prompt OR {structured: json}",
  "task_spec": {
    "output_schema": {                    // one of:
      "type": "text", "description": "..."   // text output description
      // OR {"type": "json", "json_schema": {...}}   // strict JSON Schema (root must be object)
      // OR omit task_spec entirely => auto output schema
    }
  },
  "source_policy": { "include_domains": [...], "exclude_domains": [...], "after_date": "YYYY-MM-DD" },
  "previous_interaction_id": "id",        // chain context across calls
  "metadata": { "source": "pi-parallel-websearch" }  // free-form, max 16 chars keys
}
```

**Schema gotchas** (API validation):
- JSON schema root must be an object with non-empty `properties` — `items: {}` and `properties: {}` are rejected.
- An empty/omitted `task_spec` is the auto schema; do NOT send `{"type":"auto"}` — that's rejected.
- Descriptions on fields shape the output; write them as instructions, not labels.

## Lifecycle

`queued → running → completed | failed | cancelled`. Get status at `GET /v1/tasks/runs/{id}`; blocking result at `GET /v1/tasks/runs/{id}/result?timeout=<seconds>` (default 600s). Failed runs are not billed. `interaction_id` from the run can be passed as `previous_interaction_id` for multi-turn tasks.

## Deep research template prompt

```
Research <question> for <use case>. Cover these angles:
1. <angle A> — focus on <sub-facts>
2. <angle B> — compare <entities>
3. <angle C> — verify <claims>; name sources
For each entity/output field include: <fields>. Cite URLs for every claim; flag any conflicting info.
```

## Research basis (citations)

Every run's `output` includes `basis`: per output field → `citations[]` (url, title, optional excerpts), `reasoning`, and `confidence` (some processors). Present these sources in reports — never present un-cited task output as verified fact.
