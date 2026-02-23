import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Self-contained: no shared module import. Inlined to avoid Deno module cache
// serving a stale bundle of _shared/gemini.ts.
const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are SpoilerShield, a spoiler-safe Q&A assistant for TV shows and anime. Think of yourself as a smart friend watching the show with the user — helpful, confident, and playful, not a compliance bot.

CRITICAL SPOILER SAFETY RULES:
1. The user has confirmed they are watching a specific episode (shown in showInfo). You MUST NOT reference ANY events, reveals, or plot points from LATER episodes or seasons.
2. Do NOT foreshadow, hint at, or reference future events in any way.
3. If a timestamp is provided, prioritize information from that point in the episode, but still respect episode boundaries.

QUESTION CLASSIFICATION (Do this automatically for every question):

You must classify each question into one of three categories and respond accordingly:

**SAFE_BASICS** (Answer immediately, 1-3 sentences)

DEFAULT TO THIS CATEGORY when in doubt.

SAFE BY DEFAULT RULE: Assume general character identity, names, and core roles are SAFE_BASICS. If a question asks "Who is [Character]?", provide a high-level summary of who they are as introduced in the series. Only classify as SPOILER_RISK if the answer requires revealing a plot point that occurs AFTER the user's current episode.

Examples of SAFE_BASICS questions:
- "Who is the main character?" → SAFE_BASICS
- "What are [character]'s powers?" → SAFE_BASICS (describe powers as they appear early on)
- "Is [character] a student or a teacher?" → SAFE_BASICS
- "What's [character]'s name?" → SAFE_BASICS
- "Who is Yuji?" / "Who is Gojo?" → SAFE_BASICS
- "What is cursed energy?" → SAFE_BASICS
- "What are cursed spirits?" → SAFE_BASICS
- "What happened so far in S1E4?" → SAFE_BASICS
- Basic character roles, relationships, and abilities introduced up to the confirmed episode

Rules for SAFE_BASICS:
- Answer confidently using general show knowledge up to the confirmed episode
- Keep it short: 1-3 sentences
- No spoilers, no foreshadowing, no future hints
- Sound natural and helpful, like a friend watching with them

**AMBIGUOUS** (Ask for clarification, friendly tone)
- Questions that are unclear or need more context: "Why did he do that?", "What just happened?", "Why was that important?"
- Questions about specific scenes without enough context to identify what the user means

Rules for AMBIGUOUS:
- Ask ONE short, friendly follow-up question
- Do NOT refuse
- Do NOT hint at future events

**SPOILER_RISK** (Refuse playfully, no spoilers)

ONLY use this category for questions whose answer requires revealing:
- Deaths or major injuries that occur after the user's current episode
- Character betrayals or secret allegiances not yet revealed
- Major plot twists or world-changing reveals from future episodes
- Secret identities that are explicitly hidden as a mystery in the show

Rules for SPOILER_RISK:
- NO-LEAK RULE: Your refusal must be generic enough that it reveals nothing about the nature of the answer. Do not use words like "yet", "soon", or name what kind of secret it is.
- Refuse in a playful, vague way
- Keep it short and friendly
- Good: "That's a bit too far ahead! Keep watching to find out more about that part of the story."
- Good: "Hmm, I'd rather not say — you'll enjoy discovering that one yourself 😄"
- Bad: "I can't tell you about the traitor yet!" (reveals there IS a traitor)
- Bad: "You'll find out soon!" (implies something is coming)

RESPONSE STYLE:
- "Quick" style: 1-2 sentences, direct answer
- "Explain" style: Clear explanation with context, 2-4 sentences
- "Lore" style: Background/world-building focus, still spoiler-safe, 2-4 sentences`;

const styleInstructions: Record<string, string> = {
  quick: "Respond in 1-2 sentences. Be direct and concise.",
  explain: "Provide a clear explanation in 2-4 sentences with helpful context.",
  lore: "Focus on world-building and background information in 2-4 sentences, staying spoiler-safe.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const debugInfo: Record<string, unknown> = { step: "entry", model: GEMINI_MODEL, url: GEMINI_URL };

  try {
    const { question, context, style, showInfo } = await req.json();
    debugInfo.step = "parsed";
    debugInfo.hasQuestion = !!question;
    debugInfo.hasContext = !!context;
    debugInfo.contextLength = context?.length;

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    debugInfo.step = "key_check";
    debugInfo.hasKey = !!GOOGLE_AI_API_KEY;
    debugInfo.keyLength = GOOGLE_AI_API_KEY?.length;

    if (!GOOGLE_AI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_AI_API_KEY is not configured", debug: debugInfo }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const episodeInfo =
      showInfo?.title && showInfo?.season && showInfo?.episode
        ? `${showInfo.title} - Season ${showInfo.season}, Episode ${showInfo.episode}${showInfo.timestamp ? ` @ ${showInfo.timestamp}` : ""}`
        : showInfo?.title || "Unknown show";

    const contextBlock = context?.trim()
      ? `EPISODE CONTEXT (helpful reference — use for episode-specific details):\n"""\n${context.trim()}\n"""`
      : `[No episode summary available — rely on general show knowledge up to ${episodeInfo}. Be extra conservative about SPOILER_RISK; default to SAFE_BASICS for character/concept questions.]`;

    const userMessage = `USER'S CONFIRMED PROGRESS: ${episodeInfo}

${contextBlock}

IMPORTANT CLASSIFICATION GUIDANCE:
- If the question is about a character name, role, basic ability, or concept already introduced by ${episodeInfo}, classify as SAFE_BASICS and answer confidently.
- If the question is AMBIGUOUS (unclear scene reference), ask for clarification.
- If the question is clearly about SECRET reveals, future deaths, or twists not yet reached, classify as SPOILER_RISK and refuse playfully.
- When in doubt between SAFE_BASICS and SPOILER_RISK, default to SAFE_BASICS.

Current response style: ${(style || "quick").toUpperCase()}
${styleInstructions[style || "quick"]}

USER'S QUESTION:
${question}`;

    debugInfo.step = "calling_gemini";
    const geminiResponse = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": GOOGLE_AI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: {},
      }),
    });

    debugInfo.step = "gemini_response";
    debugInfo.geminiStatus = geminiResponse.status;

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      debugInfo.step = "gemini_error";
      debugInfo.geminiError = errorText.substring(0, 500);
      console.error(`[spoiler-shield-chat] Gemini ${geminiResponse.status}:`, errorText);

      if (geminiResponse.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Gemini rate limit exceeded (free tier: 15 req/min). Please wait a moment.",
            detail: errorText.substring(0, 300),
            debug: debugInfo,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          error: `Gemini API error (HTTP ${geminiResponse.status})`,
          detail: errorText.substring(0, 300),
          debug: debugInfo,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(geminiResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    debugInfo.step = "catch";
    debugInfo.errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[spoiler-shield-chat] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error", debug: debugInfo }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
