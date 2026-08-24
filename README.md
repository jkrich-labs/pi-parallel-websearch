# @jkrich-labs/pi-parallel-websearch

[Parallel](https://parallel.ai) web search for [pi](https://pi.dev): a pi package that bundles the **Parallel extension** (5 tools) and the **auto-loading Parallel skills** (5 skills). An optimized, cost-conscious replacement for the old Linkup websearch extension.

## Install

```bash
pi install git:github.com/jkrich-labs/pi-parallel-websearch
```

Sources the extension and skills from this repository. Update with `pi update --extensions`.

## API key

The tools resolve the key in this order:

1. pi provider credential for `parallel` (set via `/login parallel` in pi, or manually in `~/.pi/agent/auth.json` as `{"parallel": {"type": "api_key", "key": "<key>"}}`)
2. `PARALLEL_API_KEY` environment variable
3. `~/.prime/agent/auth.json` — same shape (shared with Prime Agent)

Get a key at [platform.parallel.ai](https://platform.parallel.ai).

## Tools

| Tool | Endpoint | Use for |
| --- | --- | --- |
| `web_search` | `POST /v1/search` | Default web search. `mode`: `fast` (default — ~700ms, $1/1k; the balance Parallel documents as best for most agents; ranked #1 on the Artificial Analysis Search Index) / `turbo` (~200ms, $1/1k, EN/JA only) / `basic` (~1s, $5/1k) / `advanced` (~3s, $5/1k, highest quality). `search_queries` (1-5) + `objective`, domain/date/location filters. |
| `web_fetch` | `POST /v1/extract` | 1-20 known URLs → clean markdown / focused excerpts. `full_content` defaults on. `objective`/`search_queries` focus excerpts. |
| `web_answer` | `POST /v1/responses` | Grounded, cited answer to a specific question in seconds. `reasoning_effort`: `low` (default, ~5-10s, $10/1k) / `medium` / `high`. Optional `structured_output_schema` for JSON. |
| `web_research` | `POST /v1/tasks/runs` + result | Minutes-long multi-source investigations. `processor`: `lite` ($5) / `base` ($10) / `core` (default, $25) / `pro` ($100) / `ultra` ($300 per 1k runs); `-fast` variants. Optional `output_schema`. Polls the result with short timeouts (see `PI_PARALLEL_RESULT_TIMEOUT`) rather than one long-blocking request.
| `web_extract` | Task API (rows output) | Bulk structured rows (NDJSON) from one known listing page. `schema` (single-row JSON Schema) recommended; `processor` `base` default. |

All tools return compact, citation-preserving markdown (never raw JSON dumps) and report expected failures as readable strings.

## Cost posture (defaults)

- Search `mode=fast` — $1/1k at <1s latency; the balance Parallel documents as best for most agents (it ranked #1 on the Artificial Analysis Search Index in Aug 2026). `turbo` is also $1/1k for latency-critical work but is EN/JA only; `basic`/`advanced` are $5/1k opt-in.
- `web_answer` effort `low` ($10/1k) — quick grounded answers instead of research-grade spend.
- `web_research` `core` ($25/1k runs) as the deep-research middle ground; `web_extract` `base` ($10/1k).
- Output truncated (`PI_PARALLEL_MAX_OUTPUT`, `PI_PARALLEL_RESEARCH_MAX_OUTPUT`) to bound context.

## Skills

Auto-load when a task matches: `parallel-search` (default web lookup), `parallel-fetch` (known URL), `parallel-research` (exhaustive investigation), `parallel-extract` (bulk rows), `parallel-workflow` (goal → multi-step workflow with 12 recipes).

## Environment overrides

| Var | Default | Meaning |
| --- | --- | --- |
| `PI_PARALLEL_SEARCH_MODE` | `fast` | Default search mode |
| `PI_PARALLEL_SEARCH_MAX_RESULTS` | `8` | Max results (API default 10) |
| `PI_PARALLEL_SEARCH_MAX_CHARS` | `16000` | Total excerpt budget |
| `PI_PARALLEL_FETCH_MAX_CHARS` | `30000` | Extract excerpt budget |
| `PI_PARALLEL_FETCH_FULL_CONTENT` | `1` | `0` = excerpts only |
| `PI_PARALLEL_TASK_PROCESSOR` | `core` | Default research processor |
| `PI_PARALLEL_EXTRACT_PROCESSOR` | `base` | Default extract processor |
| `PI_PARALLEL_RESPONSE_EFFORT` | `low` | Default answer effort |
| `PI_PARALLEL_TIMEOUT` | `60` | Sync call timeout (s) |
| `PI_PARALLEL_RESULT_TIMEOUT` | `25` | Per-poll server-side block (s) for `web_research`/`web_extract` result — the tool polls with short requests instead of one long blocking call |
| `PI_PARALLEL_MAX_OUTPUT` | `20000` | Tool output cap (chars) |
| `PI_PARALLEL_RESEARCH_MAX_OUTPUT` | `60000` | Research/extract output cap (chars) |

## Development

- `extensions/parallel-websearch.ts` — the extension (registerTool × 5, provider auth, `/parallel-login` status command, grounding prompt hook). Uses the official [`parallel-web`](https://www.npmjs.com/package/parallel-web) SDK: the Task API run lifecycle (`taskRun.create` + short-timeout `taskRun.result` polling) for deep research and extract, and the SDK's HTTP transport for search / fetch / answer. Runtime deps are `parallel-web` plus the pi-bundled peer deps (`@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `typebox`).
- `skills/` — self-contained skills with bundled knowledge references, derived from [Parallel's docs](https://docs.parallel.ai/llms.txt).

## License

MIT — see [LICENSE](LICENSE).
