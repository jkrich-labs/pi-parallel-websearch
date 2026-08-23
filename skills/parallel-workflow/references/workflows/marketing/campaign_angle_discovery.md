# campaign_angle_discovery

**Goal:** Find 5 fresh angles for a marketing campaign about product X.

**Cost estimate:** ~$0.01, ~2 min.

## Steps

### 1. Discover audience pain
- tool: `web_search` — objective: "What problems and pain points do buyers of <category> discuss?"; search_queries: ["<category> pain points", "<category> complaints", "<category> buying decision"]; mode: fast

### 2. Discover competitor claims
- tool: `web_search` — objective: "How do the top competitors position <category>, and what do they claim?"; search_queries: ["<competitor> positioning", "<category> comparison"]; mode: fast

### 3. Verify one proof point per angle
- tool: `web_fetch` — urls: [top 5 URLs from steps 1-2]; objective: "Extract concrete stats, quotes, or customer stories"
- why: an angle without evidence is a claim; grounding makes it a campaign.

**Deliverable:** 5 angles, each: hook, evidence quote, source URL.
