# Parallel Extract — guide & settings reference

Derived from https://docs.parallel.ai/extract/* (Extract quickstart, best practices, advanced extract settings).

## Request shape

```jsonc
{
  "urls": ["https://example.com/article", "https://example.com/docs"], // 1-20 URLs
  "objective": "What are the pricing tiers and their limits?",           // optional — focuses excerpts
  "search_queries": ["pricing", "limits"],                              // optional
  "max_chars_total": 30000,                    // excerpt budget across all URLs
  "client_model": "<model id>",
  "session_id": "<session id>",
  "advanced_settings": {
    "full_content": { "max_chars_per_result": 40000 },  // or false for excerpts only
    "excerpt_settings": { "max_chars_per_result": 6000 },
    "fetch_policy": { "max_age_seconds": 86400, "timeout_seconds": 60, "disable_cache_fallback": false }
  }
}
```

## Key settings

- **`full_content`**: full page markdown, starts at the beginning of the page, truncated at `max_chars_per_result`. The extension defaults this ON (paraity with the old linkup_fetch) at 40k chars/URL; turn it off for excerpts-only.
- **`fetch_policy`**: index cache vs live fetch. Default: dynamic policy based on objective/url. Set `max_age_seconds` (min 600) to force a live fetch when cached content is older; `disable_cache_fallback: true` turns a failed live fetch into an error instead of serving stale content.
- **`objective` + `search_queries`**: focus the extraction on what matters (e.g. "extract this company's latest funding details"). Without them, excerpts are generic page content.
- **Errors**: `errors[]` lists requested URLs that failed (blocked, 404, paywalled). Check it — missing results usually mean the URL failed, not that the page was empty.

## Best practices

1. **Batch URLs** — one call with 5 relevant URLs is faster and cheaper than 5 calls.
2. **Pages change**: for freshness-sensitive content (live prices, current events), set `fetch_policy.max_age_seconds` low (e.g. 3600). For stable docs, keep the cache.
3. **Extract → synthesize**: extraction gives you content; the synthesis is your job. Cite the URL, quote accurately.
4. **Large pages**: full_content truncates at the char limit, markdown always starts at page top. If the relevant part is mid-page, use objective/excerpts to pull the right section.
5. **PDFs & JS apps**: both work — no footguns; a PDF's full content is its text.
