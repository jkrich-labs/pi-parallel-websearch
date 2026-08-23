# competitor_messaging_scan

**Goal:** Map how each competitor phrases their value prop, pricing, and proof.

**Cost estimate:** ~$0.02, ~5 min.

## Steps

### 1. Discover competitor pages
- tool: `web_search` — objective: "Find the official product pages, pricing pages, and case studies pages of each of these companies: <list>"; search_queries: ["<company> pricing", "<company> case studies"]; mode: fast

### 2. Batch fetch
- tool: `web_fetch` — urls: [collected URLs]; objective: "For each page extract: headline value prop, 3 bullet features, pricing summary, and any customer quotes"
- why: same extraction objective across pages makes the comparison apples-to-apples.

**Deliverable:** table: competitor | value prop | price | proof | source URL.
