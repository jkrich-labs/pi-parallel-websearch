# Parallel Search — mode & settings reference

Derived from https://docs.parallel.ai/search/* (Search API quickstart, best practices, modes, advanced search settings).

## Modes

| Mode      | Latency    | Cost                   | Quality                | Best for                                   |
| --------- | ---------- | ---------------------- | ---------------------- | ------------------------------------------ |
| `turbo`   | ~200ms     | $1 / 1,000 requests    | low                    | Latency-critical, high-volume (chat, RAG pre-filter); **EN/JA only** |
| `fast`    | ~700ms (<1s) | $1 / 1,000 requests    | high                   | **Most agents** (default): support, Q&A, general search; best speed/cost/quality balance |
| `basic`   | ~1s        | $5 / 1,000 requests    | high, deeper context   | Most agent workloads (docs' "start with basic"); 2-3 high-quality queries |
| `advanced`| ~3s        | $5 / 1,000 requests    | highest (Parallel #1 on AA Search Index) | Multi-hop background agents, investigations, code review, deep synthesis |

> The Search API defaults to `advanced` when `mode` is unset; this extension pins `fast` as the agent default (cheaper and faster than `basic`/`advanced` at comparable quality). `turbo` is only EN/JA.

Cost formula (`fast`/`turbo`): `$0.001 per request + $0.001 per additional page result beyond 10`. Default 10 results; the extension's default is 8 to trim context at no cost.

## Request shape

```jsonc
{
  "objective": "Natural-language description of the goal (optional but recommended)",
  "search_queries": ["query 1", "query 2"],   // required, 1-5, 3-6 words each
  "mode": "fast",                              // default in this extension
  "max_chars_total": 16000,                    // upper bound on total excerpt chars
  "client_model": "the model consuming results", // enables server-side optimizations
  "session_id": "optional session id",          // contextual chaining with extract calls
  "advanced_settings": {
    "max_results": 8,
    "source_policy": { "include_domains": ["wikipedia.org", ".gov"], "exclude_domains": ["reddit.com"], "after_date": "2026-01-01" },
    "location": "us",                            // ISO 3166-1 alpha-2
    "excerpt_settings": { "max_chars_per_result": 6000 }
  }
}
```

## Best practices (from Parallel's docs)

1. **One objective per request.** The objective is the question/goal; search_queries are retrieval seeds. A self-contained objective ("Find the latest Series A round of X: amount, investors, valuation, and what they plan to build") beats a vague one.
2. **2-3 high-quality queries** per request over many single-query calls. Queries should be different angles, not paraphrases.
3. **No need for multiple search calls to answer one question** — modern retrieval handles breadth; iterate only when the first pass misses.
4. **Freshness:** use `source_policy.after_date` (YYYY-MM-DD) rather than re-asking.
5. **Domains:** `include_domains`/`exclude_domains` support plain domains (`example.com`), subdomains, and bare TLDs (`.gov`, `.edu`, `.co.uk`); combined max 200 entries.
6. **Citations:** every excerpt's source URL is what you must cite. Never fabricate.

## Warnings

The API returns a `warnings` array for non-fatal input adjustments (e.g. a query ignored). The extension surfaces these at the end of results — read them; they explain odd result sets.
