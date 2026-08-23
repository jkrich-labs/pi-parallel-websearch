# parallel-fetch

Use when the user gives a URL (or you already have one from web_search) and wants the page's content as clean, LLM-ready text — via the Parallel Extract API.

## When to use

- User provides one or more URLs: "read this page", "summarize this article", "what does this changelog say".
- A web_search result needs verification against the source, or primary-source content would improve the answer.
- Extracting text from a PDF or JavaScript-heavy page (Parallel handles both).
- **Not for** structured rows from a listing page (use parallel-extract) nor discovery (use parallel-search).

## Calling web_fetch

```json
{
  "urls": ["https://docs.parallel.ai/", "https://pi.dev/"],
  "objective": "Compare the two developer docs: what integrations do they offer?",
  "full_content": false
}
```

**Rules:**

1. **Batch** — pass up to 20 URLs in one call instead of many single-URL calls (extract is $1 per 1,000 URLs, batching is free and faster).
2. `full_content` defaults to true: full page markdown (up to ~40k chars/URL). Set `full_content: false` for just the relevant excerpts — cheaper in context.
3. Add `objective` (and optionally `search_queries`) to focus excerpts on the relevant content when you only need part of a page.
4. Fix obvious URL mistakes before fetching (typos, relative links); the API reports per-URL errors in `errors`.

## Reading results

Each URL comes back with `title`, `url`, `publish_date`, either `full_content` markdown or `excerpts`, plus a per-URL error entry when a fetch fails — do not treat an error entry as content.

## Knowledge

- [Parallel Extract guide](references/PARALLEL_EXTRACT_GUIDE.md) — fetch policy, full content settings, best practices.
