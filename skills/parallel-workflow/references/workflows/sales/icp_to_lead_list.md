# icp_to_lead_list

**Goal:** Turn an ICP definition into a ranked lead list.

**Cost estimate:** ~$0.08, ~12 min.

## Steps

### 1. Company discovery
- tool: `web_search` — objective: "Companies that match: <ICP criteria (industry, size, region, stage)>"; search_queries: ["<industry> companies", "<industry> startups 2026", "<region> <industry>"]; mode: fast

### 2. Enrich top candidates
- tool: `web_research` — prompt: "For the 10 best matches to this ICP (<criteria>): company, size, location, funding, tech stack, decision-maker names and role, and 1 reason each fits. Cite URLs."; processor: base; output_schema: <leads: [...]>

**Deliverable:** ranked lead list (csv/markdown) with per-company source URLs.
