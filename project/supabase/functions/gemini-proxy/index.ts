import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { type, context, message, history, datasetName, columns, statistics, rowCount, qualityScore } = body;

    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    // ── Fallback when no API key ────────────────────────────────────────────
    if (!geminiKey) {
      if (type === "chat") {
        return new Response(
          JSON.stringify({
            response: buildFallbackChatResponse(
              datasetName ?? "dataset",
              columns ?? [],
              statistics ?? {},
              rowCount ?? 0,
              message ?? ""
            ),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify(buildFallbackInsights(columns ?? [], statistics ?? {}, rowCount ?? 0, qualityScore ?? 0)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Gemini API call ─────────────────────────────────────────────────────
    const GEMINI_URL =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

    let prompt = "";
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    if (type === "chat") {
      const systemCtx = context ?? "";
      // Section 1.1: pass conversation history for multi-turn memory
      const chatHistory: ChatMessage[] = Array.isArray(history) ? history : [];

      // Build conversation turns
      contents.push({
        role: "user",
        parts: [{ text: `You are a data analyst assistant. Here is the dataset context:\n${systemCtx}\n\nAnswer questions concisely and accurately based on this data.` }],
      });
      contents.push({ role: "model", parts: [{ text: "Understood. I'm ready to answer questions about this dataset." }] });

      for (const h of chatHistory) {
        contents.push({
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: h.content }],
        });
      }
      contents.push({ role: "user", parts: [{ text: message ?? "" }] });
    } else if (type === "insights") {
      // Section 1.6/1.7: up to 20 columns, proper nullCount
      const statsEntries = Object.entries(statistics ?? {}).slice(0, 20);
      const statsStr = statsEntries
        .map(([col, s]: [string, unknown]) => {
          const stat = s as Record<string, unknown>;
          return `  ${col}: mean=${stat.mean ?? "N/A"}, min=${stat.min ?? "N/A"}, max=${stat.max ?? "N/A"}, nulls=${stat.nullCount ?? 0}`;
        })
        .join("\n");

      const colTypes = (columns as Array<{ name: string; type: string }> ?? [])
        .map((c) => `${c.name} (${c.type})`)
        .join(", ");

      prompt = `You are a senior data analyst. Analyze this dataset and return a JSON object with this exact structure:
{
  "insights": [{"title": string, "description": string, "severity": "info"|"warning"|"critical", "recommendation": string}],
  "recommendations": [string],
  "summary": string
}

Dataset: "${datasetName ?? "unknown"}"
Rows: ${rowCount ?? 0}
Columns: ${colTypes}
Quality Score: ${qualityScore ?? 0}/100

Statistics:
${statsStr}

Return ONLY valid JSON, no markdown, no explanation.`;

      contents.push({ role: "user", parts: [{ text: prompt }] });
    } else {
      return new Response(JSON.stringify({ error: "Unknown request type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiRes = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents, generationConfig: { temperature: 0.3, maxOutputTokens: 2048 } }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini error:", errText);
      throw new Error(`Gemini API error: ${geminiRes.status}`);
    }

    const geminiData = await geminiRes.json();
    const text: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (type === "chat") {
      return new Response(JSON.stringify({ response: text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse JSON response for insights
    try {
      const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(clean);
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch {
      // If JSON parse fails, return a structured fallback
      return new Response(
        JSON.stringify(buildFallbackInsights(columns ?? [], statistics ?? {}, rowCount ?? 0, qualityScore ?? 0)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("gemini-proxy error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Local fallbacks (no API key needed) ──────────────────────────────────────

function buildFallbackChatResponse(
  datasetName: string,
  columns: Array<{ name: string; type: string }>,
  statistics: Record<string, unknown>,
  rowCount: number,
  message: string
): string {
  const lower = message.toLowerCase();
  if (lower.includes("how many") && lower.includes("row")) {
    return `The dataset "${datasetName}" contains ${rowCount.toLocaleString()} rows.`;
  }
  if (lower.includes("column")) {
    return `The dataset has ${columns.length} columns: ${columns.map((c) => c.name).join(", ")}.`;
  }
  if (lower.includes("null") || lower.includes("missing")) {
    const nullCols = Object.entries(statistics)
      .filter(([, s]) => (s as Record<string, unknown>).nullCount as number > 0)
      .map(([col, s]) => `${col}: ${(s as Record<string, unknown>).nullCount} nulls`);
    if (nullCols.length === 0) return "No missing values detected in this dataset!";
    return `Found missing values in ${nullCols.length} column(s): ${nullCols.join(", ")}.`;
  }
  return `I'm analyzing "${datasetName}" (${rowCount} rows, ${columns.length} columns). Ask me about statistics, missing values, or column distributions.`;
}

function buildFallbackInsights(
  columns: Array<{ name: string; type: string }>,
  statistics: Record<string, unknown>,
  rowCount: number,
  qualityScore: number
): object {
  const insights: InsightItem[] = [];
  const statEntries = Object.entries(statistics);
  const totalCells = rowCount * statEntries.length;
  const totalNulls = statEntries.reduce(
    (s, [, v]) => s + (((v as Record<string, unknown>).nullCount as number) ?? 0),
    0
  );
  const nullPct = totalCells > 0 ? Math.round((totalNulls / totalCells) * 100) : 0;

  insights.push({
    title: "Dataset Overview",
    description: `${rowCount.toLocaleString()} rows, ${columns.length} columns. Quality score: ${qualityScore}/100.`,
    severity: "info",
  });

  if (nullPct > 20) {
    insights.push({
      title: "High Missing Data Rate",
      description: `${nullPct}% of cells contain missing values.`,
      severity: "warning",
      recommendation: "Use the Clean tab to fill nulls with mean/median or remove affected rows.",
    });
  }

  if (qualityScore < 60) {
    insights.push({
      title: "Data Quality Needs Improvement",
      description: `Quality score ${qualityScore}/100 — significant issues detected.`,
      severity: "critical",
      recommendation: "Clean duplicates and null values before analysis.",
    });
  }

  const numericCols = columns.filter((c) => c.type === "number");
  const textCols = columns.filter((c) => c.type === "string");
  const recommendations: string[] = [];
  if (numericCols.length > 0) recommendations.push(`Visualize distribution of "${numericCols[0].name}" with a histogram.`);
  if (numericCols.length >= 2) recommendations.push(`Explore correlation: "${numericCols[0].name}" vs "${numericCols[1].name}" scatter plot.`);
  if (textCols.length > 0) recommendations.push(`Group by "${textCols[0].name}" for categorical analysis.`);
  recommendations.push("Export a PDF report to share findings.");

  return {
    insights,
    recommendations,
    summary: `Analyzed ${rowCount} rows across ${columns.length} columns. Quality score: ${qualityScore}/100.`,
  };
}
