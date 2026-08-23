# market_map

**Goal:** Map the <category> market: players, positioning, pricing, trends.

**Cost estimate:** ~$0.08, ~15 min.

## Steps

### 1. Landscape search
- tool: `web_search` — objective: "Who are the main players in the <category> market in 2026, and what are the recent trends?"; search_queries: ["<category> market players", "<category> trends 2026", "<category> market size"]; mode: fast

### 2. Deepen per player
- tool: `web_fetch` — urls: [official pages of top 5 players]; objective: "For each: positioning, pricing model, notable customers"

### 3. Synthesize the map
- tool: `web_research` — prompt: "Map the <category> market: 6-10 players with positioning, pricing, funding, and differentiation; 5 trends; gaps. Output a table and cite URLs."; processor: core; output_schema: <players: [...]>

**Deliverable:** market map file (tables + trends) with citations.
