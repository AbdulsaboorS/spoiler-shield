import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Self-contained: no shared module import.
// Uses Gemini with Google Search Grounding to find an episode recap.
// The returned text is raw — callers must pipe it through sanitize-episode-context.
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { showTitle, season, episode } = await req.json();

    if (!showTitle || !season || !episode) {
      return new Response(
        JSON.stringify({ error: "showTitle, season, and episode are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_AI_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prompt = `Search for and write a factual episode recap for: ${showTitle}, Season ${season}, Episode ${episode}.

Requirements:
- Include ONLY what happens in Season ${season} Episode ${episode} specifically.
- Do NOT include any information from later episodes or seasons.
- Do NOT include spoilers, foreshadowing, or forward references to future events.
- Do NOT include phrases like "later revealed", "foreshadows", "will become", "eventually".
- Be concise and factual — 100 to 200 words maximum.
- Write in past tense, summarizing the episode's main plot points.

If you cannot find reliable information about this specific episode, respond with exactly: NO_RECAP_FOUND`;

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": GOOGLE_AI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 512,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[fetch-web-episode-recap] Gemini ${response.status}:`, errorText);
      return new Response(
        JSON.stringify({ error: `Gemini API error (HTTP ${response.status})` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const recap = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

    if (!recap || recap === "NO_RECAP_FOUND") {
      return new Response(
        JSON.stringify({ error: "No recap found for this episode" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ recap }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[fetch-web-episode-recap] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
