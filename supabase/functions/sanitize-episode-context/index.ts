import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SANITIZATION_PROMPT = `You are a spoiler safety sanitizer. Clean this episode summary to remove any hindsight or future references.

RAW EPISODE SUMMARY:
{rawText}

USER'S PROGRESS: Season {season}, Episode {episode}

INSTRUCTIONS:
Remove or rewrite any sentence that:
- References events beyond this episode
- Implies future revelations ("later revealed", "foreshadows", "will become")
- Uses hindsight language ("eventually", "over time", "as the series progresses")
- Mentions outcomes not shown yet
- References manga-only content ("In the manga...", "Later in the series...")

Preserve only what a viewer would reasonably know immediately after watching this episode.

OUTPUT: Return ONLY the cleaned summary text. No explanations, no meta-commentary.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { rawText, season, episode } = await req.json();

    if (!rawText || !rawText.trim()) {
      return new Response(
        JSON.stringify({ error: "rawText is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const prompt = SANITIZATION_PROMPT
      .replace("{rawText}", rawText)
      .replace("{season}", String(season || 1))
      .replace("{episode}", String(episode || 1));

    // Call LLM for sanitization (non-streaming, fast)
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
            content: "You are a spoiler safety sanitizer. Clean episode summaries to remove hindsight and future references. Return only the cleaned text.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent sanitization
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Sanitization LLM error:", response.status, errorText);
      throw new Error("Sanitization failed");
    }

    const data = await response.json();
    const sanitizedText = data.choices?.[0]?.message?.content?.trim() || "";

    if (!sanitizedText) {
      return new Response(
        JSON.stringify({ error: "Sanitization returned empty result" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        sanitized: sanitizedText,
        originalLength: rawText.length,
        sanitizedLength: sanitizedText.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Sanitize episode context error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
