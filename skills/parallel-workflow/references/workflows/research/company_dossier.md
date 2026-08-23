# company_dossier

**Goal:** One-page dossier on company C (funding, product, team, signals).

**Cost estimate:** ~$0.05, ~10 min.

## Steps

### 1. Discover facts
- tool: `web_search` — objective: "Latest funding, product announcements, leadership and customer mentions of <company>"; search_queries: ["<company> funding", "<company> product", "<company> leadership"]; mode: fast

### 2. Check their own pages
- tool: `web_fetch` — urls: [company site, blog, about]; objective: "Extract current product description, team, and stated roadmap"

### 3. Synthesize
- tool: `web_research` — prompt: "Build a one-page dossier on <company>: overview, funding (amount, investors, dates), product lines, leadership, recent news and signals. Verify every fact; cite URLs."; processor: core

**Deliverable:** dossier (markdown file) with cited facts and confidence notes.
