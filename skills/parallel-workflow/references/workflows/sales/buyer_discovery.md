# buyer_discovery

**Goal:** Find <role> buyers at companies matching <ICP criteria>.

**Cost estimate:** ~$0.05, ~8 min.

## Steps

### 1. Find candidate companies
- tool: `web_search` — objective: "Companies in <industry> with <criteria> (size, geography, stack)"; search_queries: ["<industry> companies <criteria>", "<industry> list 2026"]; mode: fast

### 2. Find the people
- tool: `web_search` — objective: "Find <role> at these companies: <list>"; search_queries: ["<role> <company A>", "<role> <company B>"]; mode: fast

### 3. Verify and extract
- tool: `web_extract` — url: <company team page>; description: "<role>s with name and title"; schema: <name/title/linkedin schema>

**Deliverable:** lead list (company, person, title, URL).
