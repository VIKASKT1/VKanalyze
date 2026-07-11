import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ── CORS ──────────────────────────────────────────────────────────────────────
// Explicit allowlist only — no wildcards for *.vercel.app / *.netlify.app.
// Set PRODUCTION_ORIGIN (and optionally PREVIEW_ORIGIN) in Supabase secrets.
const EXPLICIT_ORIGINS = [
  Deno.env.get("PRODUCTION_ORIGIN") ?? "",   // e.g. https://yourdomain.com
  Deno.env.get("PREVIEW_ORIGIN") ?? "",       // e.g. a single staging URL
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:4173",
].filter(Boolean);

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const isAllowed = EXPLICIT_ORIGINS.includes(origin);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  };
  if (isAllowed) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

// ── Server-side rate limiter ──────────────────────────────────────────────────
// Per-user, per-minute limit enforced inside the Deno isolate.
// Deno isolates are long-lived per deployment region, so this provides
// meaningful protection against automated abuse while remaining stateless
// across restarts (acceptable trade-off without a KV store).
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_MAX = 20;           // max requests per user per window
const RATE_WINDOW_MS = 60_000; // 1-minute window

function checkServerRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true };
  }
  if (entry.count >= RATE_MAX) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { allowed: true };
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: string;
  content: string;
}

interface InsightItem {
  title: string;
  description: string;
  severity?: string;
  recommendation?: string;
}

// ── Gemini key failover ───────────────────────────────────────────────────────
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

function getGeminiKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const k = Deno.env.get(`GEMINI_API_KEY_${i}`) ?? (i === 1 ? Deno.env.get("GEMINI_API_KEY") : null);
    if (k && k.trim()) keys.push(k.trim());
  }
  return keys;
}

// Determines whether a failure should trigger failover to the next key,
// based on HTTP status AND the response body content (some Gemini errors
// return non-429 statuses but still indicate a quota/rate issue in the body).
function isFailoverEligible(status: number, bodyText: string): boolean {
  if (status === 429) return true;
  const normalized = bodyText.toLowerCase();
  return (
    normalized.includes("resource_exhausted") ||
    normalized.includes("quota_exceeded") ||
    normalized.includes("quota exceeded") ||
    normalized.includes("rate limit") ||
    normalized.includes("rate_limit")
  );
}
// Determines whether a failure should trigger failover to the next key,
// based on HTTP status AND the response body content (some Gemini errors
// return non-429 statuses but still indicate a quota/rate issue in the body).
function isFailoverEligible(status: number, bodyText: string): boolean {
  if (status === 429) return true;
  const normalized = bodyText.toLowerCase();
  return (
    normalized.includes("resource_exhausted") ||
    normalized.includes("quota_exceeded") ||
    normalized.includes("quota exceeded") ||
    normalized.includes("rate limit") ||
    normalized.includes("rate_limit")
  );
}

function classifyErrorType(status: number, bodyText: string): string {
  const normalized = bodyText.toLowerCase();
  if (status === 429 || normalized.includes("resource_exhausted")) return "quota_exceeded";
  if (normalized.includes("rate limit") || normalized.includes("rate_limit")) return "rate_limited";
  return `http_${status}`;
}

async function callGeminiWithFailover(
  contents: Array<{ role: string; parts: Array<{ text: string }> }>,
  temperature = 0.3,
  maxOutputTokens = 2048,
  requestType = "chat"
): Promise<{ text: string; keySlot: number; error?: string }> {
  const keys = getGeminiKeys();

  console.log(`Loaded Gemini keys: ${keys.length}`);

  if (keys.length === 0) {
    console.error("No Gemini API keys configured (GEMINI_API_KEY / GEMINI_API_KEY_2 / GEMINI_API_KEY_3)");
    return { text: "", keySlot: 0, error: "no_keys" };
  }

  let lastError = "unknown_error";

  // Never let a single key's failure (network error, bad status, parse error,
  // etc.) stop the loop. Every key gets a full attempt before we give up.
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const slot = i + 1;
    console.log(`Trying Gemini key slot ${slot}`);

    try {
      const res = await fetch(`${GEMINI_URL}?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents, generationConfig: { temperature, maxOutputTokens } }),
      });

      if (!res.ok) {
        const errText = await res.text();
        const errorType = classifyErrorType(res.status, errText);

        console.error(`Key slot ${slot} failed (${res.status} ${errorType})`);
        await trackKeyUsage(slot, requestType, false, errorType);

        lastError = `Gemini API error: ${res.status} (${errorType})`;

        if (isFailoverEligible(res.status, errText)) {
          if (i < keys.length - 1) {
            // More keys available — move on to the next one.
            continue;
          } else {
            // This was the last key — fall through to return the error below.
            console.error("All Gemini keys exhausted after quota/rate-limit failures.");
            break;
          }
        }
// Non-failover-eligible error (e.g. 400 bad request, 401 unauthorized
        // for this specific key). Still try remaining keys rather than
        // throwing immediately, in case it's a key-specific credential issue.
        if (i < keys.length - 1) {
          continue;
        } else {
          break;
        }
      }

      // Success
      const data = await res.json();
      const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      console.log(`Key slot ${slot} succeeded`);
      await trackKeyUsage(slot, requestType, true);
      return { text, keySlot: slot };
    } catch (err) {
      // Network-level failure, timeout, JSON parse error, etc.
      const message = err instanceof Error ? err.message : "unknown";
      console.error(`Key slot ${slot} threw an exception: ${message}`);
      await trackKeyUsage(slot, requestType, false, "exception");
      lastError = message;

      if (i < keys.length - 1) {
        continue;
      }
      // last key, exception occurred — fall through to return error below
    }
  }

  console.error(`All ${keys.length} Gemini key(s) failed. Last error: ${lastError}`);
  return { text: "", keySlot: keys.length, error: lastError };
}

async function trackKeyUsage(keySlot: number, requestType: string, success: boolean, errorType?: string) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return;
    const client = createClient(supabaseUrl, serviceKey);
    await client.from("gemini_key_usage").insert({
      key_slot: keySlot,
      request_type: requestType,
      success,
      error_type: errorType ?? null,
    });
  } catch {
    // Non-critical
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // ── Auth guard ───────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
const jwt = authHeader.replace("Bearer ", "").trim();
  let authenticatedUserId = "";

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) throw new Error("Missing env");

    const verifyClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error } = await verifyClient.auth.getUser();
    if (error || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    authenticatedUserId = user.id;
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Server-side rate limit (per authenticated user) ──────────────────────
  const rateCheck = checkServerRateLimit(authenticatedUserId);
  if (!rateCheck.allowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded", retryAfter: rateCheck.retryAfter }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(rateCheck.retryAfter ?? 60),
          "X-RateLimit-Limit": String(RATE_MAX),
          "X-RateLimit-Window": "60s",
        },
      }
    );
  }

  try {
    const body = await req.json();

    // Sanitize: truncate oversized inputs to prevent prompt injection / abuse
    const MAX_MSG = 4000;
    const MAX_CTX = 20000;
    const { type, context, history, datasetName, columns, statistics, rowCount, qualityScore } = body;
    const message = typeof body.message === "string" ? body.message.slice(0, MAX_MSG) : (body.message ?? "");
    const safeContext = typeof context === "string" ? context.slice(0, MAX_CTX) : context;

    // Validate type to prevent unexpected code paths
    const VALID_TYPES = ["chat", "sql_gen", "insights", "story", "sql"];
    if (type && !VALID_TYPES.includes(type)) {
      return new Response(JSON.stringify({ error: "Invalid request type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const keys = getGeminiKeys();

    // ── Fallback when no API keys configured ─────────────────────────────
    if (keys.length === 0) {
      console.error("gemini-proxy: no Gemini keys configured, using static fallback responses");
      if (type === "chat" || type === "sql_gen") {
        return new Response(
          JSON.stringify({
            response: type === "sql_gen"
              ? buildFallbackSQL(message ?? "", (columns ?? []) as string[])
              : buildFallbackChatResponse(datasetName ?? "dataset", columns ?? [], statistics ?? {}, rowCount ?? 0, message ?? ""),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify(buildFallbackInsights(columns ?? [], statistics ?? {}, rowCount ?? 0, qualityScore ?? 0)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Build prompt contents ─────────────────────────────────────────────
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    let temperature = 0.3;

    if (type === "chat") {
      const systemCtx = safeContext ?? "";
      const chatHistory: ChatMessage[] = Array.isArray(history) ? history.slice(-10) : [];
      contents.push({
        role: "user",
        parts: [{ text: `You are a data analyst assistant. Dataset context:\n${systemCtx}\n\nAnswer concisely and accurately.` }],
      });
      contents.push({ role: "model", parts: [{ text: "Understood. Ready to answer questions." }] });
      for (const h of chatHistory) {
        contents.push({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] });
      }
      contents.push({ role: "user", parts: [{ text: message ?? "" }] });
    } else if (type === "sql_gen" || type === "sql") {
      temperature = 0.1;
      const colList = Array.isArray(columns) ? columns.join(", ") : "";
      contents.push({
        role: "user",
        parts: [{
          text: `Generate a SQL SELECT query. Table is named "data", columns: ${colList}\n\nRequest: "${message ?? ""}"\n\nRules:\n- Only SELECT (no INSERT/UPDATE/DELETE/DROP)\n- Use "data" as table name\n- Return ONLY the SQL, no markdown, no backticks, no explanation\n- LIMIT 100 by default`,
        }],
      });
    } else if (type === "insights") {
      const statsEntries = Object.entries(statistics ?? {}).slice(0, 20);
      const statsStr = statsEntries
        .map(([col, s]: [string, unknown]) => {
          const stat = s as Record<string, unknown>;
          return `  ${col}: mean=${stat.mean ?? "N/A"}, min=${stat.min ?? "N/A"}, max=${stat.max ?? "N/A"}, nulls=${stat.nullCount ?? 0}`;
        }).join("\n");
      const colTypes = (columns as Array<{ name: string; type: string }> ?? []).map((c) => `${c.name} (${c.type})`).join(", ");
      const prompt = `You are a senior data analyst. Analyze and return ONLY valid JSON:\n{"insights":[{"title":string,"description":string,"severity":"info"|"warning"|"critical","recommendation":string}],"recommendations":[string],"summary":string}\n\nDataset: "${datasetName ?? "unknown"}" | Rows: ${rowCount ?? 0} | Columns: ${colTypes} | Quality: ${qualityScore ?? 0}/100\nStatistics:\n${statsStr}`;
      contents.push({ role: "user", parts: [{ text: prompt }] });
    } else {
      // type === "story" or anything validated above
      contents.push({ role: "user", parts: [{ text: safeContext ?? message ?? "" }] });
      temperature = 0.7;
    }

    // ── Call Gemini (with automatic multi-key failover) ───────────────────
    const { text, error: callError } = await callGeminiWithFailover(contents, temperature, 2048, type);

    if (callError) {
      console.error(`gemini-proxy: all keys failed for type="${type}", serving fallback response. Reason: ${callError}`);
      if (type === "chat") return new Response(JSON.stringify({ response: buildFallbackChatResponse(datasetName ?? "dataset", columns ?? [], statistics ?? {}, rowCount ?? 0, message ?? "") }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (type === "sql_gen" || type === "sql") return new Response(JSON.stringify({ response: buildFallbackSQL(message ?? "", (columns ?? []) as string[]) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify(buildFallbackInsights(columns ?? [], statistics ?? {}, rowCount ?? 0, qualityScore ?? 0)), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (type === "chat" || type === "sql_gen" || type === "sql" || type === "story") {
      return new Response(JSON.stringify({ response: text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Parse insights JSON
    try {
      const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return new Response(JSON.stringify(JSON.parse(clean)), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch {
      return new Response(JSON.stringify(buildFallbackInsights(columns ?? [], statistics ?? {}, rowCount ?? 0, qualityScore ?? 0)), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("gemini-proxy error:", msg);
    // Never leak internal error details to the client
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
// ── Fallback generators ────────────────────────────────────────────────────────
function buildFallbackSQL(question: string, columns: string[]): string {
  const lower = question.toLowerCase();
  const numCols = columns.filter(c => /price|salary|amount|fee|qty|revenue|cost|total|score|age|year|num/i.test(c));
  const textCols = columns.filter(c => !numCols.includes(c));
  const col0 = numCols[0] ?? columns[0] ?? "column";
  const text0 = textCols[0] ?? columns[0] ?? "column";
  if (lower.match(/top\s*(\d+)/)) {
    const n = lower.match(/top\s*(\d+)/)?.[1] ?? "10";
    return `SELECT *\nFROM data\nORDER BY "${col0}" DESC\nLIMIT ${n};`;
  }
  if (lower.match(/count|group by|per /)) return `SELECT "${text0}", COUNT(*) AS count\nFROM data\nGROUP BY "${text0}"\nORDER BY count DESC;`;
  if (lower.match(/average|avg/)) return `SELECT AVG("${col0}") AS average\nFROM data;`;
  if (lower.match(/sum|total/)) return `SELECT SUM("${col0}") AS total\nFROM data;`;
  if (lower.match(/max|highest/)) return `SELECT *\nFROM data\nORDER BY "${col0}" DESC\nLIMIT 1;`;
  if (lower.match(/min|lowest/)) return `SELECT *\nFROM data\nORDER BY "${col0}" ASC\nLIMIT 1;`;
  return `SELECT *\nFROM data\nLIMIT 10;`;
}

function buildFallbackChatResponse(datasetName: string, columns: Array<{ name: string; type: string }>, statistics: Record<string, unknown>, rowCount: number, message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("how many") && lower.includes("row")) return `The dataset "${datasetName}" contains ${rowCount.toLocaleString()} rows.`;
  if (lower.includes("column")) return `The dataset has ${columns.length} columns: ${columns.map((c) => c.name).join(", ")}.`;
  if (lower.includes("null") || lower.includes("missing")) {
    const nullCols = Object.entries(statistics).filter(([, s]) => (s as Record<string, unknown>).nullCount as number > 0).map(([col, s]) => `${col}: ${(s as Record<string, unknown>).nullCount} nulls`);
    if (nullCols.length === 0) return "No missing values detected!";
    return `Missing values in ${nullCols.length} column(s): ${nullCols.join(", ")}.`;
  }
  return `Analyzing "${datasetName}" (${rowCount} rows, ${columns.length} columns). Ask about statistics, missing values, or distributions.`;
}

function buildFallbackInsights(columns: Array<{ name: string; type: string }>, statistics: Record<string, unknown>, rowCount: number, qualityScore: number): object {
  const insights: InsightItem[] = [];
  const statEntries = Object.entries(statistics);
  const totalCells = rowCount * statEntries.length;
  const totalNulls = statEntries.reduce((s, [, v]) => s + (((v as Record<string, unknown>).nullCount as number) ?? 0), 0);
  const nullPct = totalCells > 0 ? Math.round((totalNulls / totalCells) * 100) : 0;
  insights.push({ title: "Dataset Overview", description: `${rowCount.toLocaleString()} rows, ${columns.length} columns. Quality: ${qualityScore}/100.`, severity: "info" });
  if (nullPct > 20) insights.push({ title: "High Missing Data Rate", description: `${nullPct}% of cells contain missing values.`, severity: "warning", recommendation: "Use the Clean tab to fill or remove missing values." });
  if (qualityScore < 60) insights.push({ title: "Data Quality Needs Improvement", description: `Quality score ${qualityScore}/100.`, severity: "critical", recommendation: "Clean duplicates and null values before analysis." });
  const numericCols = columns.filter((c) => c.type === "number");
  const textCols = columns.filter((c) => c.type === "string");
  const recommendations: string[] = [];
  if (numericCols.length > 0) recommendations.push(`Visualize distribution of "${numericCols[0].name}" with a histogram.`);
  if (numericCols.length >= 2) recommendations.push(`Scatter plot: "${numericCols[0].name}" vs "${numericCols[1].name}".`);
  if (textCols.length > 0) recommendations.push(`Group by "${textCols[0].name}" for categorical analysis.`);
  recommendations.push("Export a PDF report to share your findings.");
  return { insights, recommendations, summary: `Analyzed ${rowCount} rows across ${columns.length} columns. Quality: ${qualityScore}/100.` };
}