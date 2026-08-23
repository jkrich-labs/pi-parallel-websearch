# Parallel workflow — guide

How to structure multi-step web research with the Parallel tools.

## Step types

1. **Discover** — `web_search` (usually `fast`). Establishes entities, URLs, facts. Output: ranked results with URLs.
2. **Deepen** — `web_fetch` / `web_answer`. Reads primary pages, verifies claims, extracts specifics from known URLs.
3. **Synthesize** — `web_research` (`core`/`pro` by field count) for report-grade depth, or `web_extract` for row-shaped data.
4. **Verify & land** — keep citations on every claim; write the deliverable file.

## Cost planning (per step)

| Product | Default in this extension | Cost/1000 | Typical/step |
| --- | --- | --- | --- |
| Search `fast` | mode default | $1 | ~$0.001 |
| Search `advanced` | opt-in | $5 | ~$0.005 |
| Extract | full_content default on | $1 per 1k URLs | ~$0.001-0.01 |
| Responses `low` | effort default | $10 | ~$0.01 |
| Task `base` | web_extract default | $10 | ~$0.01 |
| Task `core` | web_research default | $25 | ~$0.025 |

## Chaining rules

- **Don't repeat searches**: if a step returns URLs, the next step should `web_fetch` them, not search again.
- **One objective per search**: split a multi-goal request into 2-3 searches with distinct objectives rather than one bloated call... unless the goals are one topic — then a single call with 3 queries is cheaper.
- **Batch fetches**: collect URLs across steps, then fetch 5-20 in one call.
- **Structured handoff**: when step N feeds step N+1, describe the exact fields; use `output_schema` on research so the next step's input is machine-shaped.
- **Monitor/repeat**: for "track changes over time" goals, re-run the workflow periodically and diff; Parallel's Monitor API can schedule this (out of scope here, worth calling out to the user).

## Recipe format

Each recipe in `workflows/` has: goal, steps (tool + call shape), expected output, cost estimate.
