# competitor_tracker

**Goal:** Snapshot of competitors' current state (to re-run periodically).

**Cost estimate:** ~$0.04, ~7 min per run.

## Steps

### 1. Discover latest activity
- tool: `web_search` — objective: "What have <competitors> announced in the last 90 days — products, funding, hires, partnerships?"; search_queries: ["<competitor> announcement 2026", "<competitor> funding", "<competitor> partnership"]; mode: fast; after_date: <90 days ago>

### 2. Verify key claims
- tool: `web_fetch` — urls: [top 6 URLs]; objective: "Extract announcement date, what was announced, and who's involved"

**Deliverable:** change log per competitor with dates + URLs; diff against the previous snapshot.
