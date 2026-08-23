---
name: parallel-search
description: "DEFAULT for any web lookup, research, or question needing current or verifiable information — company research, news, pricing, facts, verification, code/docs. Use web_search (Parallel Search API). Teaches how to choose the mode (fast default / turbo / advanced), write 2-3 keyword search_queries plus an objective, and use domain/date filters. Preserve the returned URLs when citing results."
---

# parallel-search

Use when someone wants a web lookup, current info, a fact check, source discovery, or "search for X" — returns cited, real-time results from the Parallel Search API.

## When to use

- **Default for any web lookup** needing current or verifiable information (news, prices, docs, people, companies, releases, benchmarks).
- `mode: fast` (default) for most agent workflows — ~700ms, $1/1k requests, quality score 73/100 on the Artificial Analysis Search Index.
- `mode: turbo` when latency alone matters (high-volume simple lookups, ~250ms, $1/1k).
- `mode: advanced` only when quality beats latency (~3s, $5/1k, #1 quality 75/100) — background agents, investigations, deep synthesis.
- `web_answer` when the user needs a synthesized cited answer in seconds instead of sources to read.
- `web_research` when the user explicitly wants a minutes-long, exhaustive investigation.

## Calling web_search

```json
{
  "search_queries": ["parallel web systems funding", "parallel.ai news"],
  "objective": "Find the latest funding and product announcements from Parallel Web Systems.",
  "mode": "fast",
  "max_results": 8,
  "after_date": "2026-01-01"
}
```

**Rules:**

1. Write `search_queries` as concise keyword queries, 3-6 words each. 2-3 queries with an `objective` gives the best results — one query is acceptable for single facts.
2. Write `objective` as a self-contained natural-language description of the underlying question, with enough context to understand intent (it drives relevance, not a keyword match).
3. Keep the default `mode: fast` unless the user's trade-off is explicit.
4. Use filters only when there is a real reason: `include_domains`/`exclude_domains` for exact known target domains (plain domains or bare TLDs like `.gov`), `after_date` for freshness, `location` for geo-targeting.
5. **Preserve the returned URLs when presenting results** — never invent or paraphrase a URL.

## Reading results

Results come back ranked, each with `title`, `url`, `publish_date`, and markdown `excerpts`. Quote excerpts accurately; cite the URL. Use `web_fetch` to read a promising result in full before relying on it.

## Knowledge

- [Parallel Search guide](references/PARALLEL_SEARCH_GUIDE.md) — modes, cost, advanced settings, best practices.
