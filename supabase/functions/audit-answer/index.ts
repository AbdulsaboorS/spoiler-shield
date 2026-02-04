import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AUDIT_PROMPT = `You are a spoiler safety auditor. Review this answer for ANY information beyond the provided context.

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
    const body = await req.json();
    const { answer, context, season, episode } = body;
    originalAnswer = answer || "";

    if (!answer || !answer.trim()) {
      return new Response(
        JSON.stringify({ error: "Answer is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!context || !context.trim()) {
      return new Response(
        JSON.stringify({ error: "Context is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const prompt = AUDIT_PROMPT
      .replace("{context}", context)
      .replace("{season}", String(season || 1))
      .replace("{episode}", String(episode || 1))
      .replace("{answer}", answer);

    // Call LLM for audit (non-streaming, fast)
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are a spoiler safety auditor. Review answers and remove any information beyond the provided context. Return only the safe answer.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2, // Low temperature for consistent auditing
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Audit LLM error:", response.status, errorText);
      // If audit fails, return original answer (don't block user)
      return new Response(
        JSON.stringify({
          audited: answer,
          wasModified: false,
          error: "Audit service unavailable",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const auditedAnswer = data.choices?.[0]?.message?.content?.trim() || answer;

    // Check if answer was modified
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
    console.error("Audit answer error:", error);
    // On error, return original answer (or empty if we couldn't parse)
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
