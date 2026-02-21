import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Self-contained: no shared module import (avoids Deno module cache serving stale bundles).
const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT =
  "You are a spoiler safety auditor. Review answers and remove any information beyond the provided context. Return only the safe answer.";

const USER_PROMPT_TEMPLATE = `You are a spoiler safety auditor. Review this answer for ANY information beyond the provided context.

EPISODE CONTEXT:
{context}

USER'S PROGRESS: Season {season}, Episode {episode}

DRAFT ANSWER:
{answer}

Check if the answer:
- Mentions events not in the context
- References future episodes/seasons
- Uses knowledge that would only be known later
- Contains foreshadowing or hints

If ANY issue found, rewrite to remove spoilers. If answer is safe, return it unchanged.

OUTPUT: Only the final safe answer, no explanations.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let originalAnswer = "";
  try {
    const { answer, context, season, episode } = await req.json();
    originalAnswer = answer || "";

    if (!answer?.trim()) {
      return new Response(
        JSON.stringify({ error: "Answer is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!context?.trim()) {
      return new Response(
        JSON.stringify({ error: "Context is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) {
      throw new Error("GOOGLE_AI_API_KEY is not configured");
    }

    const userMessage = USER_PROMPT_TEMPLATE
      .replace("{context}", context)
      .replace("{season}", String(season || 1))
      .replace("{episode}", String(episode || 1))
      .replace("{answer}", answer);

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": GOOGLE_AI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[audit-answer] Gemini error:", response.status, errorText);
      // On failure, return original answer so the user isn't blocked
      return new Response(
        JSON.stringify({ audited: answer, wasModified: false, error: "Audit service unavailable" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const auditedAnswer = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || answer;
    const wasModified = auditedAnswer !== answer && auditedAnswer.length > 0;

    return new Response(
      JSON.stringify({
        audited: auditedAnswer,
        wasModified,
        originalLength: answer.length,
        auditedLength: auditedAnswer.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[audit-answer] error:", error);
    return new Response(
      JSON.stringify({
        audited: originalAnswer,
        wasModified: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
