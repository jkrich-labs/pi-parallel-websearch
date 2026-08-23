# parallel-extract

Use when the user wants many structured records (rows) from ONE known listing page — team directories, product/pricing catalogs, job listings, conference speakers, paginated lists. Returns NDJSON rows (one JSON object per line) with field-level citations.

## When to use

- "Extract all team members from <url>", "get the pricing tiers from <url>", "pull the job postings from <url>".
- A listing page with N repeated records — not prose (parallel-fetch) and not discovery (parallel-search).

## Calling web_extract

```json
{
  "url": "https://example.com/team",
  "description": "Each team member: name, title, location, and LinkedIn URL if shown.",
  "schema": "{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\"},\"title\":{\"type\":\"string\"},\"location\":{\"type\":\"string\"},\"linkedin\":{\"type\":\"string\"}},\"required\":[\"name\",\"title\"]}"
}
```

**Rules:**

1. **Always provide a `schema`** (JSON for a single row, object root, non-empty `properties`, no `items: {}`) — it makes output consistent and lets the task fetch the right fields. Without one, the task picks its own shape and the result is best-effort.
2. Write `description` as a precise record spec (which fields, from which part of the page).
3. `processor` default `base` ($10/1k, 15-100s); bump to `core` ($25/1k, 1-5min) for complex listings with many fields.
4. One page per call. Multiple pages → multiple calls, or parallel-workflow chaining.

## Reading results

Output is NDJSON: one JSON row object per line, plus a header line with the row count. A `rows` array is extracted from the task output (any array-of-objects is accepted). Field-level citations come through the research basis — keep them for auditability.

## Gotchas

- If 0 rows: description or schema too vague/too strict, or the page content isn't a listing. Widen `description`, check the URL fetches cleanly (try parallel-fetch first).
- Fields the page doesn't contain will be omitted or null — don't fabricate values; report what the rows actually contain.

## Knowledge

- [Parallel structured extraction guide](references/PARALLEL_STRUCTURED_GUIDE.md) — schemas, structured outputs, consumption patterns.
