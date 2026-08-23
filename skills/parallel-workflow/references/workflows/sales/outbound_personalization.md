# outbound_personalization

**Goal:** Personalize outreach for a specific lead/contact.

**Cost estimate:** ~$0.01, ~2 min.

## Steps

### 1. Company context
- tool: `web_search` — objective: "What is <company> doing right now that matters to <contact's role>?"; search_queries: ["<company> news 2026", "<company> product launch"]; mode: fast

### 2. Person context
- tool: `web_search` — objective: "Recent public work, interviews, posts, or talks by <contact>"; search_queries: ["<contact> interview", "<contact> talk"]; mode: fast

### 3. Draft hook
- tool: `web_fetch` — urls: [2-3 specific URLs found]; objective: "Extract one concrete recent fact I can reference"

**Deliverable:** 2 personalized hook lines, each tied to a cited fact.
