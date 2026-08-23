# customer_proof_mining

**Goal:** Collect verifiable customer stories and social proof for product X.

**Cost estimate:** ~$0.02, ~4 min.

## Steps

### 1. Search for proof mentions
- tool: `web_search` — objective: "Find customers or users publicly discussing <product X> — reviews, case studies, social posts, podcasts"; search_queries: ["<product X> review", "<product X> customer", "<product X> case study"]; mode: fast

### 2. Validate each story
- tool: `web_fetch` — urls: [top 10 URLs]; objective: "Extract: who said it, their role/company, what they said verbatim, and when"
- why: unverifiable quotes poison a proof library.

**Deliverable:** verified proof list: quote | person | company | date | URL.
