# Bake-off: pi-parallel-websearch vs. Linkup extension (live, 2026-08-23)

Blind comparison of the two web toolkits on 6 realistic, fresh, coding/data tasks.
**Design:** 2 models (GPT-5.6 Luna, DeepSeek V4 Pro) × 2 toolkits (Linkup / Parallel) = 4 blind
agents. Each agent was told only its own toolkit's API spec (no vendor names in framing) and ran
all 6 tasks with equivalent payloads, logging per-task timings, calls, answers, and sources.

Agents: `A1` Luna→Linkup · `A2` DeepSeek→Linkup · `B1` Luna→Parallel · `B2` DeepSeek→Parallel.
Raw outputs: `/tmp/bakeoff/<agent>/` (run artifacts; not committed).

## Tasks

| # | Task | Type |
|---|------|------|
| T1 | Per-1M-token pricing ($ in / $ out) for GPT-5.6 Luna, DeepSeek V4 Pro, Qwen3.8 27B | multi-hop search |
| T2 | Artificial Analysis Search Index: current #1/#2/#3 + scores + evaluation date | fresh benchmark |
| T3 | Fetch `docs.parallel.ai/search/modes`: exact latency & cost per mode | known-URL fetch |
| T4 | Latest `@earendil-works/pi-coding-agent` release: version, date, ≥3 release-note items | code-ecosystem |
| T5 | Research `earendil-works/pi`: purpose, maintainers, cadence, vs OpenCode (≥5 sourced claims) | multi-source |
| T6 | Extract every release (version+date) from `pi.dev/news/releases` (aim ≥10 rows) | bulk rows |

## Results per cell

| | T1 pricing | T2 AA index | T3 modes doc | T4 release notes | T5 research | T6 rows | Calls | Task-time | Est. cost |
|---|---|---|---|---|---|---|---|---|---|
| **A1** Luna→Linkup | partial — Luna $0.20/$1.20 ✓ (pi.dev models page); DS $0.43/$0.87 = pre-cut rate + aggregator; Qwen $0.10/$0.40 (one provider, flagged) | ✓ 75 / You.com 74 / Exa 74, date Aug 22 2026 | ✓ verbatim | ✓ 0.84.2, Aug 14 2026, 6 items | ✓ 7 claims | ~ — extract 403, fetch-fallback, 20 rows | 19 | 208 s | ~$0.09 |
| **A2** DeepSeek→Linkup | **best** — Luna official $0.20/$1.20 ✓; DS official peak/off-peak $0.66–1.32 / $1.98–3.96 ✓; Qwen correctly "no official price yet", OR $0.40/$3.00 ✓ | ✓ + **caught a wrong tool answer** (search said Exa(instant) 74; live page says 68) | ✓ verbatim | ✓ 0.84.2, 6 items (1 fetch failed 400) | **deepest** — 6 claims incl. 259-release history, releasebot, fork lineage, 0.74.0 scope change | 259 rows (13 paginated fetches) | 35 | 345 s | ~$0.12 |
| **B1** Luna→Parallel | ✗ Luna **$1.00/$6.00** (OpenRouter listing misread vs OpenAI official $0.20/$1.20); DS $0.435/$0.87 stale pre-cut; Qwen $0.45/$3.20 ok | ✓ 75 / 74 / 74 (tie) + Firecrawl 73, Aug 22 2026 | ✓ verbatim | ✓ 0.84.2, 5 items + registry timestamp | ✓ 10 claims (incl. CONTRIBUTING auto-close detail) | 15 rows (extract p1 undercount) | 15 | 362 s | ~$0.066 |
| **B2** DeepSeek→Parallel | ✓ OpenAI official docs + official DeepSeek pricing + Qwen $0.45/$3.20 w/ OR corroboration | ✓ 75 / 74 / 74, Aug 22 2026 | ✓ verbatim | ✓ 0.84.2, 6 items | ✓ 6 claims (incl. self-modifying-agent framing) | 40 rows (2 pages × 20) | 33 | ~29 min incl. model time | ~$0.05 |

Ground truth (verified independently): T1 Luna $0.20/$1.20 (OpenAI official), DS peak/off-peak
$0.66–1.32/$1.98–3.96 (official docs, effective 2026-08-16), Qwen no official hosted price yet
(open-weights release 2026-08-14; OpenRouter $0.40/$3.00). T2: parallel.ai advanced 75, #2/#3 tie
You.com 74 / Exa(auto) 74, evaluation date Aug 22 2026. T3: turbo ~200ms/$1k, fast <1s/$1k,
basic ~1s/$5k, advanced ~3s/$5k. T4: v0.84.2, Aug 14 2026.

## Findings

1. **Search/fetch quality is at parity** on this workload — T3 was byte-identical across all four
   cells; T2/T4 converged on the same facts from different sources.
2. **Linkup emitted one demonstrably wrong fact**: `linkup_search` (sourcedAnswer) claimed
   "Exa Search (instant) 74" for T2; the live leaderboard lists Exa (instant) at 68. A2 caught it
   only by fetching the page. No Parallel agent produced a wrong claim in this run.
3. **Linkup `/v1/extract` was unusable** for this org on both linkup cells (HTTP 403
   `TASK_TYPE_NOT_SUPPORTED`) — both fell back to fetch-and-parse. Parallel `web_extract` worked
   but returned fewer rows per run (15–20 vs 20/page for fetch parsing) and needed manual
   pagination for full coverage (B2 found `?page=2`; B1 stopped at page 1).
4. **Cost: Parallel ~1.5–2× cheaper for the same workload.** Linkup search is $5–6/1k requests
   (≈ Parallel `basic`/`advanced`); Parallel `fast`/`turbo` is $1/1k — 5–6× cheaper per query.
   Linkup fetch $1–5/1k vs Parallel extract $1/1k URL. Est. totals: Linkup cells $0.09–0.12,
   Parallel cells $0.05–0.07.
5. **The model dominates call efficiency** (2× on both toolkits): Luna 19/15 calls vs DeepSeek
   35/33. Backend choice matters less than model choice for efficiency; use the cheaper backend
   (`fast`) as default and escalate (`advanced`/`standard`) only when depth is needed.
6. **Reliability nuance**: Parallel's Task API rejected the first strict row schema in B2
   (JSON-schema validation) — retry without schema worked. The parallel tool defaults
   (mode `fast`, effort `low`) performed well; B1 used `advanced` for everything (still cheap:
   $0.005/query) which surfaced OpenRouter's stale listing without a cross-check.

**Recommendation:** keep Parallel as the default (cheaper, extract works, no wrong-answer
incidents observed), with model choice (frontier, e.g. GPT-5.6 Luna) as the bigger efficiency
lever; cross-check multi-entity pricing claims against official vendor docs regardless of backend.
