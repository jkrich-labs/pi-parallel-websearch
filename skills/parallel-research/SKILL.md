---
name: parallel-research
description: "ONLY when the user explicitly wants a thorough, exhaustive, multi-source investigation or report that can run for minutes — due diligence, market landscapes, multi-company comparisons, verified fact-finding. Calls web_research (Parallel Task API): processor lite/base/core (default)/pro/ultra, optional output_schema, per-field citations. For normal lookups use parallel-search."
---

# parallel-research

Use ONLY when the user explicitly wants a thorough, exhaustive, minutes-long multi-source investigation or report — due diligence, market landscapes, multi-company comparisons, verified fact-finding. Runs on the Parallel Task API.

## When to use

- "Do a deep dive on X", "compare Y across the market", "write up a due diligence report on Z".
- Research that should cover many sources and angles with per-field citations and confidence.
- NOT for simple lookups (parallel-search), quick cited answers (parallel-answer), or one page's content (parallel-fetch).

## Choosing a processor (cost per 1,000 runs / latency)

| Purpose | processor | Cost | Latency | Fit |
| --- | --- | --- | --- | --- |
| Simple enrichment | `lite` | $5 | 10-60s | ~2 output fields |
| Standard enrichment | `base` | $10 | 15-100s | ~5 fields |
| **Default depth** | `core` | $25 | 1-5min | ~10 fields, cross-referenced |
| Heavy research | `pro` | $100 | 2-10min | ~20 fields, exploratory |
| Advanced deep research | `ultra` | $300 | 5-25min | ~20 fields, multi-source |

Append `-fast` for faster variants (same price). Only successfully completed runs are billed.

**Efficiency rule:** pick the cheapest processor that fits the field count and depth. Default to `core`; drop to `base` for quick enrichments; go `pro`/`ultra` only when the user's ask is genuinely deep.

## Calling web_research

```json
{
  "prompt": "Research the CDP market for a competitive map. Cover: (1) Snowflake, (2) Databricks, (3) their latest funding and valuations, (4) benchmark claims about query cost, (5) named customers in Europe. For each company output: name, HQ, funding, valuation, key claims, cited URLs.",
  "processor": "core",
  "output_schema": "{\"type\":\"object\",\"properties\":{\"companies\":{\"type\":\"array\",\"items\":{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\"},\"funding\":{\"type\":\"string\"},\"valuation\":{\"type\":\"string\"},\"claims\":{\"type\":\"string\"},\"sources\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}}}},\"required\":[\"name\"]}}},\"required\":[\"companies\"]}"
}
```

**Rules:**

1. **Always set `processor` explicitly** for predictable latency/cost, and tell the user what you are running and why before starting.
2. `prompt` must be well-scoped: angles, entities/leads, facts to verify, expected output structure. A scoped prompt saves latency and cost.
3. `output_schema` (JSON schema string, object root) when the result feeds another system; or a plain-text description of the desired output. Omit for auto.
4. Use `include_domains`/`exclude_domains`/`after_date` when source policy matters.
5. The result includes per-field `basis` — citations, reasoning, confidence. Preserve source URLs in your report.

## Notes

- The tool blocks until completion, then streams the result with citations. If it times out in the tool, the run continues server-side — you can re-poll later by run id.
- Failed runs are not billed; failures return the run's error message.

## Knowledge

- [Parallel Task API guide](references/PARALLEL_TASK_GUIDE.md) — task spec, lifecycle, processors, research basis.
