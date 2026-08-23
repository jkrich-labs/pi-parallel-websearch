# Parallel structured extraction — guide

How to get reliable structured rows out of Parallel: the web_extract tool (Task API + JSON output schema) and web_answer with structured_output_schema (Responses API).

## Row schema rules

The row schema given to web_extract is the JSON Schema of ONE record; the tool wraps it as `{"rows": [<row>...]}`. Rules from the API validator:

- Root must be `"type": "object"` with **non-empty `properties`**.
- Array items must specify a type/ref — `items: {}` is rejected; every nested object needs non-empty properties too.
- Add `required` for fields the page always has; keep other fields optional.
- Field `description`s are instructions to the research task ("formatted like '$100M Series A'"). Write them as instructions.

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "title": { "type": "string" },
    "linkedin": { "type": "string", "description": "Full linkedin.com URL if shown, else empty" }
  },
  "required": ["name", "title"]
}
```

## Two structured paths

1. **web_extract (Task API)** — async, minutes, per-field citations, 15-100s+ latency. For bulk rows from listing pages. NDJSON out: one JSON object per line. Cost: processor-based ($5-$300/1k runs); default `base`.
2. **web_answer (Responses API) with `structured_output_schema`** — sync, seconds, grounded answer conforming to the schema (the API returns the schema-conformant text + URL citations). For one-shot structured answers ("return the product's launch date, price and stock ticker as JSON"). Cost by reasoning effort ($10/1k low).

Rule of thumb: many rows → web_extract; one object of facts → web_answer structured.

## Consuming NDJSON

`web_extract` prints one JSON row per line. Pipe-friendly: the header line identifies the count; each subsequent line parses standalone.

## When results are wrong

- Row count 0: widen the description, drop over-strict `required`, confirm the page renders the listing (parallel-fetch it first).
- Wrong fields: give the schema field descriptions that mirror the page's labels.
- Partial: listing may be paginated — extract page 1, then repeat per page and merge.
