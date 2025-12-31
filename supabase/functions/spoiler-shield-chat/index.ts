import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are SpoilerShield, a spoiler-safe Q&A assistant for TV shows and anime.

CRITICAL SPOILER SAFETY RULES:
1. You ONLY know what is in the user's provided context. Treat this context as the ABSOLUTE BOUNDARY of your knowledge.
2. NEVER reference, hint at, or imply any events, reveals, character identities, relationships, or plot points that are NOT explicitly present in the context.
3. If the context doesn't contain enough information to answer the question, you MUST refuse safely.
4. Do NOT use your general knowledge about shows/anime. Pretend you've never seen or heard of the show.
5. Do NOT foreshadow or hint at future events in any way.
6. You may use general language definitions (e.g., what "betrayal" means) but NEVER add plot facts.

RESPONSE STYLE:
- "Quick" style: 1-2 sentences, direct answer
- "Explain" style: Clear explanation with context, 2-4 sentences
- "Lore" style: Background/world-building focus, still spoiler-safe, 2-4 sentences

REFUSAL BEHAVIOR:
If you cannot answer from the given context, respond EXACTLY like this:
"I don't have enough from what's been shown so far to answer without risking spoilers."
Then ask for ONE of:
- "Could you paste the last subtitle line you saw?"
- "Could you describe the last 10 seconds of the scene?"

Remember: When in doubt, refuse safely. A non-answer is better than a spoiler.`;

const AUDIT_PROMPT = `You are a spoiler safety auditor. Review the draft answer and ensure it contains NO information beyond what's in the provided context.

CONTEXT:
{context}

DRAFT ANSWER:
{answer}

If any claim in the answer is NOT explicitly supported by the context, rewrite to remove unsupported claims. Keep it helpful and spoiler-safe. Respond with ONLY the final safe answer.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, context, style, showInfo } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (!context || !context.trim()) {
      return new Response(
        JSON.stringify({ error: "Context is required to prevent spoilers" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const styleInstructions: Record<string, string> = {
      quick: "Respond in 1-2 sentences. Be direct and concise.",
      explain: "Provide a clear explanation in 2-4 sentences with helpful context.",
      lore: "Focus on world-building and background information in 2-4 sentences, staying spoiler-safe."
    };

    const showContext = showInfo?.title 
      ? `\n\nShow info (for reference only, not a knowledge source): ${showInfo.title}${showInfo.season ? ` S${showInfo.season}` : ''}${showInfo.episode ? ` E${showInfo.episode}` : ''}`
      : '';

    const userMessage = `CONTEXT FROM WHAT USER HAS WATCHED:
"""
${context}
"""
${showContext}

Current response style: ${(style || 'quick').toUpperCase()}
${styleInstructions[style || 'quick']}

USER'S QUESTION:
${question}`;

    // First pass: Generate initial answer
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Service temporarily unavailable." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Chat function error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
