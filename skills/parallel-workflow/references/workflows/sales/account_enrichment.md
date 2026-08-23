# account_enrichment

**Goal:** Enrich <account> with firmographic + signal data.

**Cost estimate:** ~$0.02, ~3 min.

## Steps

### 1. Firmographics
- tool: `web_search` — objective: "What is <account>: size, industry, funding, tech stack, recent hiring?"; search_queries: ["<account> company", "<account> funding", "<account> careers"]; mode: fast

### 2. Signals / triggers
- tool: `web_search` — objective: "Recent changes at <account> that could be sales triggers: leadership, products, expansions, funding"; search_queries: ["<account> announcement 2026", "<account> new product", "<account> hire"]; mode: fast; after_date: <90 days ago>

### 3. Extract the record
- tool: `web_extract` — url: <best profile page>; description: "Company profile: HQ, size, website, funding, recent news"; schema: <record schema>

**Deliverable:** one enriched record + cited signals.
