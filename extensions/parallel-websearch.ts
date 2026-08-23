/**
 * Parallel web search extension for pi — an optimized replacement for the
 * Linkup websearch extension.
 *
 * Backed by the Parallel API (https://parallel.ai) — real-time web search with
 * LLM-optimized excerpts, page content extraction, grounded answers, deep
 * research, and structured row extraction.
 *
 * Tools registered:
 *   web_search   -> POST /v1/search          (modes: turbo/fast/basic/advanced)
 *   web_fetch    -> POST /v1/extract         (1-20 URLs, excerpts or full content)
 *   web_answer   -> POST /v1/responses       (grounded cited answers, effort low/medium/high)
 *   web_research -> POST /v1/tasks/runs + GET /v1/tasks/runs/{id}/result (deep research)
 *   web_extract  -> POST /v1/tasks/runs (structured rows from a listing page)
 *
 * Cost/performance posture (vs Linkup defaults):
 *   - search mode defaults to `fast` (~700ms, $1/1k reqs, #3 on Artificial
 *     Analysis Search Index at 73/75) — the documented best balance for agent
 *     workflows; `advanced` ($5/1k, ~3s, #1) only when depth beats latency;
 *     `turbo` (~250ms, $1/1k) when latency alone matters.
 *   - web_answer defaults to reasoning effort `low` ($10/1k, ~5-10s) instead of
 *     research-grade pricing; medium/high are opt-in.
 *   - web_research maps reasoning depth to Task processors: S->lite ($5),
 *     M->base ($10), L->core ($25, default), XL->pro ($100 per 1k runs).
 *   - Results are formatted as compact citation-preserving markdown, never raw
 *     JSON dumps, and output is truncated to bound context usage.
 *
 * API key resolution order (same as the official @parallel-web/pi-extension):
 *   1. pi provider credential for "parallel" (from /login parallel / auth.json)
 *   2. PARALLEL_API_KEY environment variable
 *   3. ~/.pi/agent/auth.json    -> {"parallel": {"type": "api_key", "key": "..."}}
 *   4. ~/.prime/agent/auth.json -> same shape (shared with Prime Agent)
 *
 * All tools return formatted, citation-ready text and report expected failures
 * (auth, rate limit, bad schema, failed runs) as readable strings instead of
 * throwing.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum, type ProviderAuthInteraction } from "@earendil-works/pi-ai";
import type { Static } from "typebox";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { Type } from "typebox";

const BASE = "https://api.parallel.ai";
const PLATFORM_ORIGIN = "https://platform.parallel.ai";
const PROVIDER_ID = "parallel";

// ---------------------------------------------------------------------------
// Config / credentials
// ---------------------------------------------------------------------------

function envInt(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined) return fallback;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envStr(name: string, fallback: string): string {
	return (process.env[name] ?? "").trim() || fallback;
}

function timeoutMs(): number {
	return envInt("PI_PARALLEL_TIMEOUT", 60) * 1000;
}

const maxOutput = () => envInt("PI_PARALLEL_MAX_OUTPUT", 20000);
const researchMaxOutput = () => envInt("PI_PARALLEL_RESEARCH_MAX_OUTPUT", 60000);

/** Search mode default: fast (~700ms, $1/1k, AA index 73) — best balance for agent workflows. */
const searchMode = () => envStr("PI_PARALLEL_SEARCH_MODE", "fast");
/** Max results per search (API default 10; keeping 8 trims context, no extra cost). */
const searchMaxResults = () => envInt("PI_PARALLEL_SEARCH_MAX_RESULTS", 8);
/** Budget for excerpts across all results (bounds context; also bounds cost of extra results). */
const searchMaxChars = () => envInt("PI_PARALLEL_SEARCH_MAX_CHARS", 16000);
/** Budget for excerpts per extract of 1-20 URLs. */
const fetchMaxChars = () => envInt("PI_PARALLEL_FETCH_MAX_CHARS", 30000);
/** Return full page content (markdown) from extract, like the old linkup_fetch. */
const fetchFullContent = () => envStr("PI_PARALLEL_FETCH_FULL_CONTENT", "1") !== "0";
/** Task processor default: core ($25/1k, 60s-5min) — deep-research middle ground. */
const taskProcessor = () => envStr("PI_PARALLEL_TASK_PROCESSOR", "core");
/** Responses reasoning effort default: low ($10/1k, ~5-10s). */
const responseEffort = () => envStr("PI_PARALLEL_RESPONSE_EFFORT", "low");

function resolveConfigValue(value: string): string {
	value = (value ?? "").trim();
	if (!value || value.startsWith("!")) return "";
	if (value.startsWith("$")) return (process.env[value.slice(1)] ?? "").trim();
	return value;
}

/** Read a {"<provider>": {"type":"api_key","key":"..."}} credential from an auth file. */
function apiKeyFromAuthFile(path: string, provider: string): string {
	try {
		const auth = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
		const cred = auth[provider];
		if (cred && typeof cred === "object" && (cred as Record<string, unknown>)["type"] === "api_key") {
			return resolveConfigValue(String((cred as Record<string, unknown>)["key"] ?? ""));
		}
	} catch {
		// Missing or unreadable file: fall through.
	}
	return "";
}

function envApiKey(): string {
	return (process.env["PARALLEL_API_KEY"] ?? "").trim();
}

/** Direct auth.json fallback (used when the provider registry path is unavailable). */
function resolveApiKeyFallback(): string {
	for (const path of [join(homedir(), ".pi", "agent", "auth.json"), join(homedir(), ".prime", "agent", "auth.json")]) {
		const key = apiKeyFromAuthFile(path, PROVIDER_ID);
		if (key) return key;
	}
	return "";
}

interface AuthResult {
	key: string;
	source: string;
}

/**
 * Resolve the Parallel API key. Preference order: pi provider credential ->
 * PARALLEL_API_KEY env -> auth.json (pi or prime). Returns undefined when none
 * is configured.
 */
async function resolveApiKey(ctx: { modelRegistry?: { getApiKeyForProvider?: (id: string) => Promise<string | undefined> } }): Promise<AuthResult | undefined> {
	try {
		const stored = await ctx.modelRegistry?.getApiKeyForProvider?.(PROVIDER_ID);
		if (stored) return { key: stored, source: "pi provider credential" };
	} catch {
		// Provider registry unavailable or provider not registered: fall through.
	}
	const envKey = envApiKey();
	if (envKey) return { key: envKey, source: "PARALLEL_API_KEY" };
	const fallback = resolveApiKeyFallback();
	if (fallback) return { key: fallback, source: "auth.json" };
	return undefined;
}

function missingKeyMessage(): string {
	return (
		"Parallel web search is not set up: no API key configured.\n" +
		"Set the PARALLEL_API_KEY environment variable, or add an entry to ~/.pi/agent/auth.json like:\n" +
		'  {"parallel": {"type": "api_key", "key": "<key>"}}\n' +
		"Then retry."
	);
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function oneLine(s: unknown): string {
	return String(s ?? "").replace(/\s+/g, " ").trim();
}

function truncate(s: string, n: number): string {
	s = s.trim();
	return s.length <= n ? s : s.slice(0, Math.max(0, n - 1)).trimEnd() + "…";
}

function truncateOutput(output: string, maxOutput: number): string {
	if (output.length <= maxOutput) return output;
	const total = output.length;
	const marker = `\n... [output truncated, ${total} chars total] ...\n`;
	const half = Math.max(0, Math.floor((maxOutput - marker.length) / 2));
	const out = output.slice(0, half) + marker + output.slice(output.length - half);
	return out.length > maxOutput ? out.slice(0, maxOutput) : out;
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
	if (value === undefined || !Number.isFinite(value)) return fallback;
	return Math.max(min, Math.min(Math.round(value), max));
}

/** Accept a JSON schema as an object or a JSON string; normalize to a string. */
function schemaToString(schema: unknown): string {
	if (typeof schema === "string") return schema;
	try {
		return JSON.stringify(schema);
	} catch {
		return String(schema ?? "");
	}
}

/** Accept a JSON schema as an object or JSON string; normalize to an object. */
function schemaToObject(schema: unknown): unknown {
	if (typeof schema === "string") {
		try {
			return JSON.parse(schema);
		} catch {
			return null;
		}
	}
	return schema;
}

/** A JSON schema string (starts with { ) vs a plain-text description. */
function isJsonSchemaString(s: string): boolean {
	const t = s.trim();
	return (t.startsWith("{") || t.startsWith("[")) && t.length > 1;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

interface ParallelFields {
	search_id?: string;
	extract_id?: string;
	results?: Array<Record<string, unknown>>;
	errors?: Array<Record<string, unknown>>;
	warnings?: Array<Record<string, unknown>> | null;
	usage?: Array<Record<string, unknown>> | null;
	session_id?: string;
	answer?: string;
	output?: Array<Record<string, unknown>> | Record<string, unknown> | null;
	error?: Record<string, unknown> | string | null;
	run_id?: string;
	interaction_id?: string;
	status?: string;
	created_at?: string;
	modified_at?: string;
	processor?: string;
	run?: ParallelFields;
	type?: string;
	content?: unknown;
	basis?: Array<Record<string, unknown>>;
	output_schema?: Record<string, unknown> | null;
	incomplete_details?: unknown;
}

async function parallelRequest(
	method: "GET" | "POST",
	path: string,
	apiKey: string,
	body: unknown,
	signal: AbortSignal | undefined,
	ms: number,
): Promise<Record<string, unknown>> {
	const headers: Record<string, string> = {
		"x-api-key": apiKey,
		"X-Tool-Calling-Package": "pi-parallel-websearch",
	};
	if (body !== undefined) headers["Content-Type"] = "application/json";
	const response = await fetch(`${BASE}${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms),
	});
	if (!response.ok) {
		const bodyText = await response.text().catch(() => "");
		let detail = bodyText.slice(0, 500);
		if (response.status === 401 || response.status === 403) {
			detail = "Parallel rejected the API key. Update ~/.pi/agent/auth.json (parallel key) or PARALLEL_API_KEY.";
		} else if (response.status === 429) {
			detail = "Parallel rate limit hit. Wait and retry.";
		}
		throw new Error(`Parallel error (${response.status}): ${detail}`);
	}
	return (await response.json()) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Search  (web_search) -> POST /v1/search
// ---------------------------------------------------------------------------

interface WebResult {
	url?: string;
	title?: string;
	publish_date?: string;
	excerpts?: string[];
}

function fmtWarnings(warnings: Array<Record<string, unknown>> | null | undefined): string {
	if (!warnings || warnings.length === 0) return "";
	try {
		const msgs = warnings.map((w) => oneLine(w["message"] ?? w["warning"] ?? JSON.stringify(w)));
		return `Warnings: ${msgs.join("; ")}`;
	} catch {
		return "";
	}
}

const webSearchParams = Type.Object({
			search_queries: Type.Array(Type.String(), {
				description: "Concise keyword search queries, 3-6 words each (1-5; 2-3 for best results)",
				minItems: 1,
				maxItems: 5,
			}),
			objective: Type.Optional(
				Type.String({ description: "Natural-language description of the underlying question/goal driving the search; focuses results on the most relevant content" }),
			),
			mode: Type.Optional(StringEnum(["turbo", "fast", "basic", "advanced"] as const, { description: "Search mode: turbo (~250ms, $1/1k, latency-critical) / fast (~700ms, $1/1k, default) / basic (~1s, $5/1k) / advanced (~3s, $5/1k, highest quality)" })),
			max_results: Type.Optional(Type.Number({ description: "Max results to return, 1-20 (default 8)" })),
			include_domains: Type.Optional(Type.Array(Type.String(), { description: "Only search these domains (exact domains or bare TLDs like .gov; combined with exclude_domains max 200)" })),
			exclude_domains: Type.Optional(Type.Array(Type.String(), { description: "Exclude these domains from results" })),
			after_date: Type.Optional(Type.String({ description: "ISO 8601 date (YYYY-MM-DD); results limited to content published on/after this date" })),
			location: Type.Optional(Type.String({ description: "ISO 3166-1 alpha-2 country code for geo-targeted results (e.g. us, gb, de, jp)" })),
			max_chars_total: Type.Optional(Type.Number({ description: "Upper bound on total excerpt characters across all results (default 16000)" })),
			snippet_chars: Type.Optional(Type.Number({ description: "Max chars per excerpt snippet in the output (default 600)" })),
		});
type webSearchParamsStatic = Static<typeof webSearchParams>;

const webFetchParams = Type.Object({
			urls: Type.Array(Type.String(), { description: "URLs to extract content from (1-20, valid HTTP/HTTPS)" }),
			objective: Type.Optional(Type.String({ description: "Natural-language description of what you're looking for; focuses excerpts on the relevant content" })),
			search_queries: Type.Optional(Type.Array(Type.String())),
			full_content: Type.Optional(Type.Boolean({ description: "Return the full page markdown instead of relevant excerpts only (default true)" })),
			max_chars_total: Type.Optional(Type.Number({ description: "Upper bound on total excerpt characters across all URLs (default 30000)" })),
			snippet_chars: Type.Optional(Type.Number({ description: "Max chars per excerpt snippet in the output (default 1200)" })),
		});
type webFetchParamsStatic = Static<typeof webFetchParams>;

const webResearchParams = Type.Object({
			prompt: Type.String({ description: "Research question; scope the angles to cover, entities/leads, facts to verify, and expected output structure" }),
			processor: Type.Optional(Type.String({ description: "Task processor: lite / base / core (default) / pro / ultra; -fast variants allowed" })),
			reasoning_depth: Type.Optional(StringEnum(["S", "M", "L", "XL"] as const)),
			output_schema: Type.Optional(
				Type.Union([
					Type.String({ description: 'Optional JSON schema (string) for structured JSON output, or a plain-text description of the desired output; default auto' }),
					Type.Object({}, { description: "Optional JSON schema object for structured output" }),
				]),
			),
			include_domains: Type.Optional(Type.Array(Type.String())),
			exclude_domains: Type.Optional(Type.Array(Type.String())),
			after_date: Type.Optional(Type.String({ description: "ISO 8601 date (YYYY-MM-DD); only sources published on/after this date" })),
			max_wait_minutes: Type.Optional(Type.Number({ description: "Max minutes to wait for completion (default by processor: lite 2 / base 4 / core 6 / pro 12 / ultra 25)" })),
		});
type webResearchParamsStatic = Static<typeof webResearchParams>;

function fmtSearchResults(results: WebResult[], snippetChars: number): string {
	const parts: string[] = [];
	results.forEach((r, i) => {
		const date = r.publish_date ? ` — ${oneLine(r.publish_date)}` : "";
		const url = oneLine(r.url);
		const lines = [`[${i + 1}] ${oneLine(r.title) || "Untitled"}${date}`];
		if (url) lines.push(`    ${url}`);
		const excerpts = (r.excerpts ?? []).map((e) => truncate(oneLine(e), snippetChars)).filter(Boolean);
		for (const e of excerpts) lines.push(`    > ${e}`);
		parts.push(lines.join("\n"));
	});
	return parts.join("\n\n");
}

interface SearchOpts {
	objective?: string;
	searchQueries: string[];
	mode?: string;
	maxResults?: number;
	includeDomains?: string[];
	excludeDomains?: string[];
	afterDate?: string;
	location?: string;
	maxCharsTotal?: number;
	clientModel?: string;
	sessionId?: string;
	snippetChars?: number;
	signal?: AbortSignal;
}

async function parallelSearch(query: SearchOpts): Promise<string> {
	const apiKey = (await resolveApiKey({}))?.key;
	if (!apiKey) return missingKeyMessage();

	const mode = query.mode ?? searchMode();
	const payload: Record<string, unknown> = {
		search_queries: query.searchQueries.slice(0, 5),
		mode,
		max_chars_total: clampInt(query.maxCharsTotal, searchMaxChars(), 500, 200000),
	};
	if (query.objective) payload["objective"] = query.objective;
	if (query.clientModel) payload["client_model"] = query.clientModel;
	if (query.sessionId) payload["session_id"] = query.sessionId;

	const advanced: Record<string, unknown> = {
		max_results: clampInt(query.maxResults, searchMaxResults(), 1, 20),
	};
	const sourcePolicy: Record<string, unknown> = {};
	if (query.includeDomains?.length) sourcePolicy["include_domains"] = query.includeDomains.slice(0, 200);
	if (query.excludeDomains?.length) sourcePolicy["exclude_domains"] = query.excludeDomains.slice(0, 200);
	if (query.afterDate) sourcePolicy["after_date"] = query.afterDate;
	if (Object.keys(sourcePolicy).length > 0) advanced["source_policy"] = sourcePolicy;
	if (query.location) advanced["location"] = query.location;
	payload["advanced_settings"] = advanced;

	let data: ParallelFields;
	try {
		data = (await parallelRequest("POST", "/v1/search", apiKey, payload, query.signal, timeoutMs())) as ParallelFields;
	} catch (e) {
		return `Error searching: ${e instanceof Error ? e.message : String(e)}`;
	}

	const results = (data.results ?? []) as WebResult[];
	if (results.length === 0) return `No Parallel results for: ${JSON.stringify(query.searchQueries)}`;

	const snippetChars = query.snippetChars ?? 600;
	const header = `Parallel search results (mode=${mode}, ${results.length} results)\n${query.objective ? `Objective: ${oneLine(query.objective)}\n` : ""}`;
	const warnings = fmtWarnings(data.warnings);
	const body = fmtSearchResults(results, snippetChars);
	return `${header}${body}${warnings ? `\n\n${warnings}` : ""}`;
}

// ---------------------------------------------------------------------------
// Fetch  (web_fetch) -> POST /v1/extract
// ---------------------------------------------------------------------------

interface FetchOpts {
	urls: string[];
	objective?: string;
	searchQueries?: string[];
	fullContent?: boolean;
	maxCharsTotal?: number;
	fullContentChars?: number;
	clientModel?: string;
	sessionId?: string;
	snippetChars?: number;
	signal?: AbortSignal;
}

async function parallelFetch(opts: FetchOpts): Promise<string> {
	const apiKey = (await resolveApiKey({}))?.key;
	if (!apiKey) return missingKeyMessage();

	const urls = opts.urls.map((u) => u.trim()).filter(Boolean).slice(0, 20);
	if (urls.length === 0) return "web_fetch: at least one URL is required.";

	const payload: Record<string, unknown> = {
		urls,
		max_chars_total: clampInt(opts.maxCharsTotal, fetchMaxChars(), 500, 200000),
	};
	if (opts.objective) payload["objective"] = opts.objective;
	if (opts.searchQueries?.length) payload["search_queries"] = opts.searchQueries.slice(0, 5);
	if (opts.clientModel) payload["client_model"] = opts.clientModel;
	if (opts.sessionId) payload["session_id"] = opts.sessionId;

	const advanced: Record<string, unknown> = {};
	if (opts.fullContent ?? fetchFullContent()) {
		advanced["full_content"] = { max_chars_per_result: clampInt(opts.fullContentChars, 40000, 1000, 200000) };
	}
	payload["advanced_settings"] = advanced;

	let data: ParallelFields;
	try {
		data = (await parallelRequest("POST", "/v1/extract", apiKey, payload, opts.signal, timeoutMs())) as ParallelFields;
	} catch (e) {
		return `Error fetching: ${e instanceof Error ? e.message : String(e)}`;
	}

	const results = (data.results ?? []) as WebResult[];
	if (results.length === 0) {
		const errors = (data.errors ?? []).map((e) => oneLine(e["url"] ?? "") + ": " + oneLine(e["error"] ?? e["message"] ?? JSON.stringify(e)));
		return `Parallel extract returned no content for: ${urls.join(", ")}${errors.length ? `\nErrors: ${errors.join("; ")}` : ""}`;
	}

	const snippetChars = opts.snippetChars ?? 1200;
	const parts: string[] = [];
	for (const r of results) {
		const lines = [`# ${oneLine(r.title) || "Untitled"}`, `URL: ${oneLine(r.url)}`];
		if (r.publish_date) lines.push(`Published: ${oneLine(r.publish_date)}`);
		const full = String((r as Record<string, unknown>)["full_content"] ?? "").trim();
		if (full) {
			lines.push("", full);
		} else {
			for (const e of (r.excerpts ?? []).map((x) => oneLine(x)).filter(Boolean)) {
				lines.push("", truncate(e, snippetChars));
			}
		}
		parts.push(lines.join("\n"));
	}
	const header = results.length === 1 ? `Parallel fetch of ${oneLine(results[0].url)}` : `Parallel fetch of ${results.length} URLs`;
	const warnings = fmtWarnings(data.warnings);
	return `${header}\n\n${parts.join("\n\n---\n\n")}${warnings ? `\n\n${warnings}` : ""}`;
}

// ---------------------------------------------------------------------------
// Answer  (web_answer) -> POST /v1/responses
// ---------------------------------------------------------------------------

interface AnswerOpts {
	question: string;
	instructions?: string;
	effort?: string;
	verbosity?: string;
	structuredSchema?: unknown;
	signal?: AbortSignal;
}

interface UrlCitation {
	type?: string;
	url?: string;
	title?: string;
}

async function parallelAnswer(opts: AnswerOpts): Promise<string> {
	const apiKey = (await resolveApiKey({}))?.key;
	if (!apiKey) return missingKeyMessage();

	const effort = opts.effort ?? responseEffort();
	const payload: Record<string, unknown> = {
		model: "parallel",
		input: opts.question.trim(),
		reasoning: { effort },
	};
	if (opts.instructions) payload["instructions"] = opts.instructions;

	if (opts.structuredSchema !== undefined) {
		const schema = schemaToObject(opts.structuredSchema);
		if (!schema) return 'web_answer: structured_output_schema must be a valid JSON schema (object).';
		payload["text"] = {
			format: { type: "json_schema", name: "answer", schema, strict: false },
		};
	} else if (opts.verbosity && ["low", "medium", "high"].includes(opts.verbosity)) {
		payload["text"] = { verbosity: opts.verbosity };
	}

	let data: ParallelFields;
	try {
		data = (await parallelRequest("POST", "/v1/responses", apiKey, payload, opts.signal, Math.max(timeoutMs(), 90_000))) as ParallelFields;
	} catch (e) {
		return `Error getting an answer: ${e instanceof Error ? e.message : String(e)}`;
	}

	const err = data.error;
	if (err) {
		const msg = typeof err === "string" ? err : oneLine((err as Record<string, unknown>)["message"] ?? JSON.stringify(err));
		return `Parallel answer failed: ${msg}`;
	}

	const output = data.output as Array<Record<string, unknown>> | undefined;
	const textParts: Array<{ text: string; annotations?: UrlCitation[] }> = [];
	for (const item of output ?? []) {
		const content = item["content"];
		if (Array.isArray(content)) {
			for (const part of content) {
				if (part && typeof part === "object" && (part as Record<string, unknown>)["type"] === "output_text") {
					textParts.push({
						text: String((part as Record<string, unknown>)["text"] ?? ""),
						annotations: (part as Record<string, unknown>)["annotations"] as UrlCitation[] | undefined,
					});
				}
			}
		}
	}
	const answer = textParts.map((p) => p.text).join("\n").trim();
	if (!answer) {
		const incomplete = data.incomplete_details;
		const detail = incomplete ? ` (${oneLine(JSON.stringify(incomplete))})` : "";
		return `Parallel answer returned no text${detail}.`;
	}

	const citations = new Map<string, string>();
	for (const p of textParts) {
		for (const a of p.annotations ?? []) {
			if (a.url && !citations.has(a.url)) citations.set(a.url, oneLine(a.title) || a.url);
		}
	}

	const header = `Parallel answer (effort=${effort}${opts.instructions ? ", with instructions" : ""})`;
	if (citations.size === 0) return `${header}\n\n${answer}`;
	const cited = [...citations.entries()].map(([url, title], i) => `[${i + 1}] ${title}\n    ${url}`).join("\n");
	return `${header}\n\n${answer}\n\nSources:\n${cited}`;
}

// ---------------------------------------------------------------------------
// Research  (web_research) -> POST /v1/tasks/runs + GET /v1/tasks/runs/{id}/result
// ---------------------------------------------------------------------------

interface ResearchOpts {
	prompt: string;
	processor?: string;
	outputSchema?: unknown;
	includeDomains?: string[];
	excludeDomains?: string[];
	afterDate?: string;
	maxWaitMinutes?: number;
	signal?: AbortSignal;
	onUpdate?: (text: string) => void;
}

const PROCESSOR_WAIT_MIN: Record<string, number> = {
	lite: 2,
	base: 4,
	core: 6,
	core2x: 8,
	pro: 12,
	ultra: 25,
};

/** Map linkup-style reasoning depth (S/M/L/XL) to the cheapest fitting Task processor. */
const DEPTH_PROCESSOR: Record<string, string> = {
	S: "lite",
	M: "base",
	L: "core",
	XL: "pro",
};

/** Wait ceiling per processor (fast variants get half, minimum 2 min). */
function waitMinutesFor(processor: string): number {
	const base = PROCESSOR_WAIT_MIN[processor.replace(/-fast$/, "")] ?? 6;
	return processor.endsWith("-fast") ? Math.max(2, Math.round(base / 2)) : base;
}

function fmtBasis(basis: Array<Record<string, unknown>> | undefined, snippetChars: number): string {
	if (!basis || basis.length === 0) return "";
	const lines: string[] = ["", "Research basis / citations:"];
	for (const b of basis) {
		const field = oneLine(b["field"]) || "output";
		const citations = (b["citations"] as Array<Record<string, unknown>> | undefined) ?? [];
		const cfgs = citations.map((c) => {
			const url = oneLine(c["url"]);
			const title = oneLine(c["title"]) || url;
			return `- ${url}${c["title"] ? ` (${title})` : ""}`;
		});
		if (cfgs.length > 0) lines.push(`  ${field}:`, ...cfgs.map((c) => `    ${c}`));
		const confidence = b["confidence"] ? ` (confidence: ${oneLine(b["confidence"])})` : "";
		if (cfgs.length > 0 && confidence) lines[lines.length - 1] += confidence;
	}
	return lines.join("\n");
}

async function parallelResearch(opts: ResearchOpts): Promise<string> {
	const apiKey = (await resolveApiKey({}))?.key;
	if (!apiKey) return missingKeyMessage();

	const processor = opts.processor ?? taskProcessor();
	const input = opts.prompt.trim();
	if (!input) return "web_research: prompt is required.";

	const payload: Record<string, unknown> = { processor, input };
	if (opts.outputSchema !== undefined) {
		const schema = schemaToObject(opts.outputSchema);
		if (schema) {
			payload["task_spec"] = { output_schema: { type: "json", json_schema: schema } };
		} else if (typeof opts.outputSchema === "string" && !isJsonSchemaString(opts.outputSchema)) {
			payload["task_spec"] = { output_schema: { type: "text", description: opts.outputSchema } };
		} else {
			payload["task_spec"] = { output_schema: { type: "auto" } };
		}
	}
	const sourcePolicy: Record<string, unknown> = {};
	if (opts.includeDomains?.length) sourcePolicy["include_domains"] = opts.includeDomains.slice(0, 200);
	if (opts.excludeDomains?.length) sourcePolicy["exclude_domains"] = opts.excludeDomains.slice(0, 200);
	if (opts.afterDate) sourcePolicy["after_date"] = opts.afterDate;
	if (Object.keys(sourcePolicy).length > 0) payload["source_policy"] = sourcePolicy;
	payload["metadata"] = { source: "pi-parallel-websearch" };

	let created: ParallelFields;
	try {
		created = (await parallelRequest("POST", "/v1/tasks/runs", apiKey, payload, opts.signal, 60_000)) as ParallelFields;
	} catch (e) {
		return `Error submitting research task: ${e instanceof Error ? e.message : String(e)}`;
	}

	const runId = String(created.run_id ?? "");
	if (!runId) return `Parallel task returned no run_id: ${JSON.stringify(created)}`;

	const maxWaitMs = clampInt(opts.maxWaitMinutes, waitMinutesFor(processor), 1, 120) * 60_000;
	opts.onUpdate?.(`web_research: submitted run ${runId} (processor=${processor}); fetching result — up to ${Math.round(maxWaitMs / 60000)} min`);

	// The result endpoint blocks server-side until the run completes (or times out),
	// which is cheaper and simpler than client-side polling.
	let done: ParallelFields;
	try {
		done = (await parallelRequest(
			"GET",
			`/v1/tasks/runs/${encodeURIComponent(runId)}/result?timeout=${Math.round(maxWaitMs / 1000)}`,
			apiKey,
			undefined,
			opts.signal,
			maxWaitMs + 30_000,
		)) as ParallelFields;
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (/timeout|abort/i.test(msg)) {
			return (
				`web_research: run ${runId} (processor=${processor}) did not finish within ${Math.round(maxWaitMs / 60000)} min. ` +
				`Fetch it later with: GET ${BASE}/v1/tasks/runs/${runId}/result`
			);
		}
		return `Error fetching research result: ${msg}`;
	}

	const run = (done.run ?? {}) as ParallelFields;
	if (run.status === "failed" || done.status === "failed") {
		const err = done.error ?? run.error;
		return `web_research: run ${runId} failed. ${typeof err === "string" ? err : oneLine(JSON.stringify(err ?? {}))}`;
	}

	const output = (done.output ?? {}) as ParallelFields;
	const content = output.content;
	const basis = output.basis;
	const snippetChars = 400;

	if (output.type === "json" || (content && typeof content === "object" && !Array.isArray(content))) {
		const json = JSON.stringify(content ?? {}, null, 2);
		const header = `web_research result for "${truncate(oneLine(input.replace(/\s+/g, " ")), 120)}" (processor=${processor}, run=${runId})`;
		return `${header}\n\n${json}${fmtBasis(basis, snippetChars)}`;
	}

	const text = String(content ?? "").trim();
	if (!text) return `web_research: run ${runId} completed with empty output.`;
	const header = `web_research result for "${truncate(oneLine(input.replace(/\s+/g, " ")), 120)}" (processor=${processor}, run=${runId})`;
	return `${header}\n\n${text}${fmtBasis(basis, snippetChars)}`;
}

// ---------------------------------------------------------------------------
// Extract rows  (web_extract) -> POST /v1/tasks/runs with a rows JSON schema
// ---------------------------------------------------------------------------

interface ExtractOpts {
	url: string;
	description?: string;
	schema?: unknown;
	processor?: string;
	maxWaitMinutes?: number;
	signal?: AbortSignal;
	onUpdate?: (text: string) => void;
}

async function parallelExtractRows(opts: ExtractOpts): Promise<string> {
	const url = opts.url.trim();
	if (!url) return "web_extract: url is required.";

	const rowSchema = schemaToObject(opts.schema);
	// With a row schema, wrap it into a `rows` array schema (the API rejects
	// empty `items: {}` / empty `properties`, so a user schema is required for
	// strict output). Without one, omit task_spec entirely — that is what the
	// API treats as an auto output schema — and we format whichever
	// array-of-objects the task returns as rows.
	const outputSchema: unknown | undefined =
		rowSchema && typeof rowSchema === "object"
			? { type: "json", json_schema: { type: "object", properties: { rows: { type: "array", items: rowSchema } }, required: ["rows"] } }
			: undefined;

	const description = opts.description?.trim();
	const input = description
		? `Extract structured records from the page at ${url}. ${description}`
		: `Extract all relevant structured records from the page at ${url}, returning an array of rows. Each row should be a single record with fields matching the output schema.`;

	const out = await parallelResearch({
		prompt: input,
		processor: opts.processor ?? envStr("PI_PARALLEL_EXTRACT_PROCESSOR", "base"),
		outputSchema,
		maxWaitMinutes: opts.maxWaitMinutes,
		signal: opts.signal,
		onUpdate: (t) => opts.onUpdate?.(`web_extract (${url}): ${t.replace(/^web_research: /, "")}`),
	});

	// The research formatter returns pretty JSON + basis. For extract, re-emit as
	// an NDJSON-style row list (one JSON object per line) for scripts to consume.
	try {
		const jsonStart = out.indexOf("{");
		if (jsonStart >= 0) {
			const parsed = JSON.parse(out.slice(jsonStart, out.lastIndexOf("}") + 1)) as Record<string, unknown>;
			const rows = findRowArray(parsed);
			if (rows) {
				const ndjson = rows.map((r) => JSON.stringify(r)).join("\n");
				const header = `web_extract: ${rows.length} rows from ${url}${ndjson ? "\n(NDJSON — one JSON object per line)" : ""}`;
				return `${header}${ndjson ? `\n\n${ndjson}` : "\n(no rows returned; try a more specific description or schema)"}`;
			}
		}
	} catch {
		// non-JSON output — fall through and return the formatted result as-is
	}
	return out;
}

/** Find the first top-level array of objects in a result (common row shape). */
function findRowArray(value: Record<string, unknown>): Array<Record<string, unknown>> | undefined {
	if (Array.isArray(value["rows"])) return value["rows"] as Array<Record<string, unknown>>;
	for (const v of Object.values(value)) {
		if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && v[0] !== null) {
			return v as Array<Record<string, unknown>>;
		}
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// Provider auth (mirrors the official @parallel-web/pi-extension registration
// so `/login parallel` works with pi's native auth store)
// ---------------------------------------------------------------------------

function toBase64Url(value: Buffer): string {
	return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function generatePkce(): { verifier: string; challenge: string } {
	const verifier = toBase64Url(randomBytes(32));
	const challenge = toBase64Url(createHash("sha256").update(verifier).digest());
	return { verifier, challenge };
}

function openExternalUrl(url: string): boolean {
	try {
		if (process.platform === "darwin") {
			const child = spawn("open", [url], { detached: true, stdio: "ignore" });
			child.unref();
			return true;
		}
		if (process.platform === "win32") {
			const child = spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" });
			child.unref();
			return true;
		}
		const child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
		child.unref();
		return true;
	} catch {
		return false;
	}
}

async function registerParallelProvider(pi: ExtensionAPI) {
	pi.registerProvider({
		id: PROVIDER_ID,
		name: "Parallel",
		auth: {
			apiKey: {
				name: "Parallel",
								login: (interaction: ProviderAuthInteraction) => loginWithParallel(interaction),
				resolve: async (input) => {
					if (input.credential?.key) {
						return { auth: { apiKey: input.credential.key }, source: "stored credential" };
					}
					const envKey = await input.ctx.env("PARALLEL_API_KEY");
					return envKey ? { auth: { apiKey: envKey }, source: "PARALLEL_API_KEY" } : undefined;
								},
			},
		},
		getModels: () => [],
		stream(): never {
			throw new Error("The Parallel provider does not serve models.");
		},
		streamSimple(): never {
			throw new Error("The Parallel provider does not serve models.");
		},
	});
}

/** Browser-based Parallel OAuth login (same flow as the official @parallel-web/pi-extension, MIT). */
async function loginWithParallel(interaction: ProviderAuthInteraction): Promise<{ type: "api_key"; key: string }> {
	interaction.signal.throwIfAborted();
	const platformOrigin = (process.env.PARALLEL_PLATFORM_URL ?? PLATFORM_ORIGIN).replace(/\/$/, "");
	const { verifier, challenge } = generatePkce();
	const state = randomUUID();

	// Local loopback listener to capture the OAuth callback.
	let resolveCallback: ((url: string) => void) | undefined;
	const callbackPromise = new Promise<string>((resolve) => {
		resolveCallback = resolve;
	});
	const server = createServer((req, res) => {
		const addr = server.address();
		const port = addr && typeof addr === "object" ? addr.port : 0;
		const callbackUrl = `http://127.0.0.1:${port}${req.url ?? "/"}`;
		const u = new URL(callbackUrl);
		if (u.pathname !== "/callback") {
			res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
			res.end("<!doctype html><p>Not found.</p>");
			return;
		}
		res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
		res.end(
			u.searchParams.get("error")
				? "<!doctype html><p>Parallel login was denied. You can close this tab.</p>"
				: "<!doctype html><p>Parallel login completed. You can close this tab.</p>",
		);
		resolveCallback?.(callbackUrl);
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});
	const addr = server.address();
	const port = addr && typeof addr === "object" ? addr.port : 0;
	const redirectUri = `http://127.0.0.1:${port}/callback`;

	const authUrl = new URL(`${platformOrigin}/getKeys/authorize`);
	authUrl.searchParams.set("client_id", "127.0.0.1");
	authUrl.searchParams.set("redirect_uri", redirectUri);
	authUrl.searchParams.set("response_type", "code");
	authUrl.searchParams.set("scope", "key:read");
	authUrl.searchParams.set("code_challenge", challenge);
	authUrl.searchParams.set("code_challenge_method", "S256");
	authUrl.searchParams.set("state", state);
	try {
		interaction.notify({ type: "auth_url", url: authUrl.toString() });
		openExternalUrl(authUrl.toString());
	} catch {
		// notify() is best-effort; the user can still copy the URL from the prompt below.
	}

	let callbackUrl: string | undefined;
	try {
		callbackUrl = await Promise.race([
			callbackPromise,
			new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Parallel login timed out.")), 120_000)),
		]);
	} catch {
		callbackUrl = await interaction
			.prompt({
				type: "manual_code",
				message: "Paste the Parallel callback URL from your browser",
				placeholder: authUrl.toString(),
			})
			.catch(() => undefined);
	} finally {
		server.close();
	}
	interaction.signal.throwIfAborted();
	if (!callbackUrl) throw new Error("Parallel login was not completed.");

	const u = new URL(callbackUrl);
	if (u.searchParams.get("state") !== state) throw new Error("Parallel login state check failed.");
	if (u.searchParams.get("error")) {
		throw new Error(`Parallel login failed: ${u.searchParams.get("error_description") ?? u.searchParams.get("error")}`);
	}
	const code = u.searchParams.get("code");
	if (!code) throw new Error("Parallel login callback did not include an authorization code.");

	const tokenRes = await fetch(`${platformOrigin}/getKeys/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code,
			client_id: "127.0.0.1",
			redirect_uri: redirectUri,
			code_verifier: verifier,
		}),
	});
	if (!tokenRes.ok) throw new Error(`Parallel token exchange failed: ${await tokenRes.text()}`);
	const tokenPayload = (await tokenRes.json()) as { access_token?: string };
	if (!tokenPayload.access_token) throw new Error("Parallel token exchange did not return an API key.");
	return { type: "api_key", key: tokenPayload.access_token };
}

// ---------------------------------------------------------------------------
// Extension entrypoint
// ---------------------------------------------------------------------------

const suppressStaleLinkupSkills = (systemPrompt: string): string => {
	// The linkup extension is replaced by this one; drop any leftover
	// linkup-* skill blocks from the system prompt so they never auto-load.
	let next = systemPrompt.replace(/\n?\s*<skill>\s*<name>linkup-[^<]*<\/name>[\s\S]*?<\/skill>/g, "");
	return next.replace(/\n?<available_skills>\s*<\/available_skills>/g, "");
};

const WEB_GROUNDING_GUIDANCE = `
## Grounding and web usage

You should proactively use the Parallel web tools to ground your answers when doing so would improve correctness, freshness, or source quality.

- Use web_search when the task involves current information, external facts, source discovery, recent changes, or any claim you are not highly confident about.
- Use web_fetch when the user provides a URL, when a search result should be verified against the source, or when primary-source content would improve the answer.
- Use web_answer for a quick cited answer to a specific question; web_research for a thorough multi-source investigation; web_extract to pull structured rows out of one listing page.
- Prefer grounded, sourced answers over unsupported recall when freshness or factual precision matters.
- If a grounded answer would likely be better than answering from memory, use the web tools first.
`;

export default function (pi: ExtensionAPI) {
	const parallelSessionId = randomUUID();
	registerParallelProvider(pi).catch(() => void 0);

	pi.on("before_agent_start", async (event) => {
		const filtered = suppressStaleLinkupSkills(event.systemPrompt);
		const selectedTools = event.systemPromptOptions.selectedTools ?? [];
		const hasWebTools = ["web_search", "web_fetch", "web_answer", "web_research", "web_extract"].some((t) => selectedTools.includes(t));
		if (!hasWebTools) return filtered === event.systemPrompt ? undefined : { systemPrompt: filtered };
		return { systemPrompt: `${filtered}\n${WEB_GROUNDING_GUIDANCE}` };
	});

	pi.registerCommand("parallel-login", {
		description: "Show Parallel authentication status and how to sign in",
		handler: async (_args, ctx) => {
			const auth = await resolveApiKey(ctx);
			if (!auth) {
				ctx.ui.notify(
					"Parallel is not authenticated. Run `/login parallel` to sign in via browser, or set PARALLEL_API_KEY.",
					"info",
				);
				return;
			}
			ctx.ui.notify(
				`Parallel is authenticated (${auth.source}). Run \`/login parallel\` to replace the credential, or \`/logout parallel\` to remove it.`,
				"info",
			);
		},
	});

	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description:
			"Search the live web via the Parallel Search API — the DEFAULT web search tool. Returns ranked results with LLM-optimized excerpts and URLs to cite. " +
			"mode: turbo (~250ms, $1/1k, latency-critical) / fast (~700ms, $1/1k, default — best balance, #3 quality on Artificial Analysis) / basic (~1s, $5/1k) / advanced (~3s, $5/1k, #1 quality). " +
			"search_queries: 1-5 concise keyword queries (2-3 for best results), plus an optional objective describing the underlying goal. " +
			"Filters: include_domains/exclude_domains for exact known target domains, after_date for freshness, location for geo-targeting. " +
			"Preserve the returned URLs when presenting answers.",
		promptSnippet: "Search the web via Parallel (turbo/fast/basic/advanced) with cited, real-time results",
		promptGuidelines: [
			"Use web_search for any web lookup needing current or verifiable information; treat Parallel as the source of truth instead of answering from memory.",
			"With web_search, write 2-3 concise keyword search_queries plus an objective; mode=fast is the default — the best speed/cost/quality balance for agent workloads ($1/1k), advanced only when quality beats latency.",
			"With web_search, preserve the returned URLs when presenting answers, and use include_domains/exclude_domains only for exact known target domains.",
		],
		parameters: webSearchParams,
		prepareArguments(args): webSearchParamsStatic {
			if (!args || typeof args !== "object") return args as webSearchParamsStatic;
			const input = args as Record<string, unknown>;
			const next: Record<string, unknown> = { ...input };
			// Friendly aliases from the old linkup-style interface:
			if (typeof input["q"] === "string" && !Array.isArray(next["search_queries"])) {
				next["search_queries"] = [input["q"]];
			}
			const depthMap: Record<string, string> = { fast: "fast", standard: "fast", deep: "advanced" };
			if (typeof input["depth"] === "string" && depthMap[input["depth"] as string]) {
				next["mode"] = depthMap[input["depth"] as string];
			}
			return next as webSearchParamsStatic;
		},
		async execute(toolCallId, params, signal, _onUpdate, ctx) {
			const out = await parallelSearch({
				objective: params.objective,
				searchQueries: params.search_queries,
				mode: params.mode,
				maxResults: params.max_results,
				includeDomains: params.include_domains,
				excludeDomains: params.exclude_domains,
				afterDate: params.after_date,
				location: params.location,
				maxCharsTotal: params.max_chars_total,
				clientModel: ctx.model?.id,
				sessionId: parallelSessionId,
				snippetChars: params.snippet_chars,
				signal,
			});
			return { content: [{ type: "text", text: truncateOutput(out, maxOutput()) }], details: { provider: "parallel", product: "search" } };
		},
	});

	pi.registerTool({
		name: "web_fetch",
		label: "Web Fetch",
		description:
			"Fetch ONE or more known URLs as clean, LLM-ready content via the Parallel Extract API (1-20 URLs per call). " +
			"Extracts relevant excerpts by default; pass full_content=true to get the full page markdown. " +
			"Use when URLs are already known (e.g. from web_search) instead of searching again. " +
			"Batch multiple URLs into one call instead of many single-URL calls. " +
			"For many structured records from one listing page use web_extract instead.",
		promptSnippet: "Fetch known URL(s) as clean LLM-ready content via Parallel",
		promptGuidelines: [
			"Use web_fetch to read URLs found via web_search instead of guessing their content.",
			"With web_fetch, batch multiple URLs into one call instead of parallelizing many single-URL calls.",
		],
		parameters: webFetchParams,
		prepareArguments(args): webFetchParamsStatic {
			if (!args || typeof args !== "object") return args as webFetchParamsStatic;
			const input = args as Record<string, unknown>;
			if (typeof input["url"] === "string" && !Array.isArray(input["urls"])) {
				return { ...input, urls: [input["url"]] } as webFetchParamsStatic;
			}
			return args as webFetchParamsStatic;
		},
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const out = await parallelFetch({
				urls: params.urls,
				objective: params.objective,
				searchQueries: params.search_queries,
				fullContent: params.full_content,
				maxCharsTotal: params.max_chars_total,
				clientModel: ctx.model?.id,
				sessionId: parallelSessionId,
				snippetChars: params.snippet_chars,
				signal,
			});
			return { content: [{ type: "text", text: truncateOutput(out, researchMaxOutput()) }], details: { provider: "parallel", product: "extract", urls: params.urls } };
		},
	});

	pi.registerTool({
		name: "web_answer",
		label: "Web Answer",
		description:
			"Get a grounded, citation-backed answer to a specific question via Parallel's Responses API (seconds, not minutes). " +
			"reasoning_effort: low (default, ~5-10s, $10/1k) / medium (~15-20s, $50/1k) / high (~30-60s, $250/1k). " +
			"Use for direct questions answerable from the web NOW; use web_research for thorough multi-source investigations. " +
			"Pass structured_output_schema (JSON schema string) to receive JSON conforming to it instead of prose; citations still attached.",
		promptSnippet: "Instant cited answer to a specific question via Parallel",
		promptGuidelines: [
			"Use web_answer for a single well-scoped question when a grounded answer in seconds is worth more than an exhaustive report.",
			"With web_answer, keep reasoning_effort=low by default; escalate to medium/high only when answer quality must beat latency.",
			"With web_answer, preserve the returned citation URLs when presenting the answer.",
		],
		parameters: Type.Object({
			question: Type.String({ description: "The specific question to answer, self-contained and clear" }),
			instructions: Type.Optional(Type.String({ description: "Optional context/constraints for the answer (e.g. 'cite only official sources')" })),
			reasoning_effort: Type.Optional(StringEnum(["low", "medium", "high"] as const)),
			verbosity: Type.Optional(StringEnum(["low", "medium", "high"] as const)),
			structured_output_schema: Type.Optional(
				Type.String({ description: 'Optional JSON schema (string) for structured JSON output; e.g. {"type":"object","properties":{"fact":{"type":"string"}},"required":["fact"]}' }),
			),
		}),
		async execute(_toolCallId, params, signal) {
			const out = await parallelAnswer({
				question: params.question,
				instructions: params.instructions,
				effort: params.reasoning_effort,
				verbosity: params.verbosity,
				structuredSchema: params.structured_output_schema,
				signal,
			});
			return { content: [{ type: "text", text: truncateOutput(out, maxOutput()) }], details: { provider: "parallel", product: "responses" } };
		},
	});

	pi.registerTool({
		name: "web_research",
		label: "Web Deep Research",
		description:
			"Minutes-long, multi-source investigation via Parallel's async Task API. Use ONLY when the user explicitly wants a thorough/exhaustive investigation or report that can run for minutes: due diligence, market landscapes, multi-company comparisons, verified fact-finding. " +
			"processor (cost per 1k runs / latency): lite ($5, 10-60s) / base ($10, 15-100s) / core ($25, 1-5min, default) / pro ($100, 2-10min) / ultra ($300, 5-25min). " +
			"Append -fast for faster variants (same price, fresher-constrained). " +
			"output_schema: optional JSON schema (string) to get structured JSON out, or a plain-text description of the desired output. " +
			"For normal lookups use web_search; for quick answers use web_answer.",
		promptSnippet: "Run a minutes-long, multi-source research investigation via Parallel",
		promptGuidelines: [
			"Use web_research only when the user explicitly wants a thorough/exhaustive investigation that can run for minutes — for normal lookups prefer web_search.",
			"With web_research, always set processor explicitly for predictable latency/cost, write a well-scoped prompt (angles, leads, facts to verify, entities to compare, output structure), and tell the user what you are running and why before starting.",
		],
		parameters: webResearchParams,
		prepareArguments(args): webResearchParamsStatic {
			if (!args || typeof args !== "object") return args as webResearchParamsStatic;
			const input = args as Record<string, unknown>;
			const next: Record<string, unknown> = { ...input };
			if (typeof input["processor"] !== "string" && typeof input["reasoning_depth"] === "string") {
				next["processor"] = DEPTH_PROCESSOR[input["reasoning_depth"] as string] ?? undefined;
			}
			// Old linkup-style `q` alias:
			if (typeof input["q"] === "string" && typeof next["prompt"] !== "string") {
				next["prompt"] = input["q"];
			}
			return next as webResearchParamsStatic;
		},
		async execute(toolCallId, params, signal, onUpdate) {
			const out = await parallelResearch({
				prompt: params.prompt,
				processor: params.processor,
				outputSchema: params.output_schema,
				includeDomains: params.include_domains,
				excludeDomains: params.exclude_domains,
				afterDate: params.after_date,
				maxWaitMinutes: params.max_wait_minutes,
				signal,
				onUpdate: (text) => onUpdate?.({ content: [{ type: "text", text }], details: {} }),
			});
			return { content: [{ type: "text", text: truncateOutput(out, researchMaxOutput()) }], details: { provider: "parallel", product: "task" } };
		},
	});

	pi.registerTool({
		name: "web_extract",
		label: "Web Extract Rows",
		description:
			"Extract many structured records (rows) from ONE known listing page via Parallel's Task API — team directories, product/pricing catalogs, job listings, conference speakers, paginated lists. " +
			"Returns NDJSON rows (one JSON object per line) with per-field citations. " +
			"Always provide a schema (JSON schema for a single row) for consistent output. " +
			"processor: base (default, $10/1k, 15-100s) / core ($25/1k, 1-5min) for complex listings. " +
			"For a single page's prose use web_fetch; for discovery use web_search.",
		promptSnippet: "Extract many structured rows from one listing page via Parallel",
		promptGuidelines: [
			"Use web_extract when the user wants many structured records (team, catalog, jobs, speakers) from one known listing page; otherwise use web_search for discovery or web_fetch for one page's prose.",
			"With web_extract, always provide a schema (JSON schema for a single row) for consistent output.",
		],
		parameters: Type.Object({
			url: Type.String({ description: "The seed listing URL to extract records from" }),
			description: Type.Optional(Type.String({ description: "Natural-language description of which rows to extract and what each row should contain" })),
			schema: Type.Optional(
				Type.Union([
					Type.String({ description: 'JSON schema describing a single extracted row, e.g. {"type":"object","properties":{"name":{"type":"string"},"title":{"type":"string"}},"required":["name"]}' }),
					Type.Object({}, { description: "JSON schema describing a single extracted row" }),
				]),
			),
			processor: Type.Optional(Type.String({ description: "Task processor: base (default) / core for complex listings; -fast variants allowed" })),
			max_wait_minutes: Type.Optional(Type.Number({ description: "Max minutes to wait for completion (default 5)" })),
		}),
		async execute(_toolCallId, params, signal, onUpdate) {
			const out = await parallelExtractRows({
				url: params.url,
				description: params.description,
				schema: params.schema,
				processor: params.processor,
				maxWaitMinutes: params.max_wait_minutes,
				signal,
				onUpdate: (text) => onUpdate?.({ content: [{ type: "text", text }], details: {} }),
			});
			return { content: [{ type: "text", text: truncateOutput(out, researchMaxOutput()) }], details: { provider: "parallel", product: "task-extract", url: params.url } };
		},
	});
}
