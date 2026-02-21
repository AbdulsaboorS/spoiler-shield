import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Self-contained: no shared module import (avoids Deno module cache serving stale bundles).
const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT =
  "You are a spoiler safety sanitizer. Clean episode summaries to remove hindsight and future references. Return only the cleaned text.";

const USER_PROMPT_TEMPLATE = `You are a spoiler safety sanitizer. Clean this episode summary to remove any hindsight or future references.

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

    if (!rawText?.trim()) {
      return new Response(
        JSON.stringify({ error: "rawText is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) {
      throw new Error("GOOGLE_AI_API_KEY is not configured");
    }

    const userMessage = USER_PROMPT_TEMPLATE
      .replace("{rawText}", rawText)
      .replace("{season}", String(season || 1))
      .replace("{episode}", String(episode || 1));

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": GOOGLE_AI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[sanitize-episode-context] Gemini error:", response.status, errorText);
      throw new Error(`Gemini API error (HTTP ${response.status}): ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const sanitizedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

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
    console.error("[sanitize-episode-context] error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
