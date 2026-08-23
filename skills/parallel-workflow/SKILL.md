# parallel-workflow

Use when someone has a business goal rather than a single query — "how can I use Parallel?", "enrich my leads", "build a competitor tracker", "research before my meeting", "vet this vendor". Turns the goal into a multi-step Parallel workflow: which tool, which call, what feeds the next step.

## Method

1. **Decompose the goal** into concrete deliverables (lists, maps, briefs, dossiers, monitored changes).
2. **Pick the tool per step** from the guide's decision matrix (search / fetch / answer / research / extract).
3. **Check cost & time per step**: search $0.001-0.005, extract $0.001/URL, response $0.01-0.25, task run $0.005-0.30. Say the plan and its cost before running.
4. **Chain steps** with session continuity (same `session_id` per pi session is automatic) and pass step outputs into next steps' inputs/prompts — never re-ask for what a previous step established.
5. **Land the result**: write the deliverable (file, table, brief) from the tool outputs, preserving URL citations.

## Tool decision matrix

| Need | Tool | Cost | Latency |
| --- | --- | --- | --- |
| Fact lookup / sources | `web_search` (fast) | ~$0.001 | <1s |
| One page content | `web_fetch` | ~$0.001/URL | 1-20s |
| Cited answer to a question | `web_answer` (low) | ~$0.01 | 5-10s |
| Exhaustive report | `web_research` (core) | ~$0.025 | 1-5min |
| Bulk rows from a listing | `web_extract` (base) | ~$0.01 | 15-100s |
| People/company lists | `web_search` + `web_extract` chained | ~$0.01 | minutes |

## Recipes

See [workflows/](references/workflows/) for ready-made recipes:
- **Marketing**: campaign angle discovery, competitor messaging scan, content research brief, customer proof mining.
- **Research**: company dossier, competitor tracker, market map, meeting prep.
- **Sales**: account enrichment, buyer discovery, ICP→lead list, outbound personalization.

## Knowledge

- [Parallel workflow guide](references/PARALLEL_WORKFLOW_GUIDE.md) + [workflow schema](references/workflows/WORKFLOW_SCHEMA.md).
