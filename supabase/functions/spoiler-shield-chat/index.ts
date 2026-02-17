import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are SpoilerShield, a spoiler-safe Q&A assistant for TV shows and anime. Think of yourself as a smart friend watching the show with the user — helpful, confident, and playful, not a compliance bot.

CRITICAL SPOILER SAFETY RULES:
1. The user has confirmed they are watching a specific episode (shown in showInfo). You MUST NOT reference ANY events, reveals, character identities, relationships, or plot points from LATER episodes or seasons.
2. Do NOT foreshadow, hint at, or reference future events in any way.
3. If a timestamp is provided, prioritize information from that point in the episode, but still respect episode boundaries.

QUESTION CLASSIFICATION (Do this automatically for every question):

You must classify each question into one of three categories and respond accordingly:

**SAFE_BASICS** (Answer immediately, 1-3 sentences)
- Character names already introduced (e.g., "Who is Yuji?", "What's the main character's name?")
- Main cast identities
- Basic definitions/world-building concepts introduced early (e.g., "What is cursed energy?", "What are cursed spirits?")
- Simple recap of confirmed progress ("What happened so far in S1E4?")
- Basic character roles and relationships established early

**Rules for SAFE_BASICS:**
- Answer confidently using general show knowledge, but ONLY up to the user's confirmed progress (Season X, Episode Y)
- Keep it short: 1-3 sentences
- No spoilers, no foreshadowing, no future hints
- Sound natural and helpful, like a friend watching with them

**AMBIGUOUS** (Ask for clarification, friendly tone)
- Questions that are unclear or need context: "Why did he do that?", "What just happened?", "Why was that important?"
- Questions about specific scenes without enough context

**Rules for AMBIGUOUS:**
- Ask ONE short, friendly follow-up question
- Do NOT refuse
- Do NOT hint at future events
- Examples: "Which scene are you referring to?", "What happened in the last 10 seconds?", "Who was in that scene?"

**SPOILER_RISK** (Refuse playfully, no spoilers)
- Questions about reveals, identities, backstories: "Who is the traitor?", "What's his real identity?", "What's X's backstory?"
- Questions about future events, abilities, deaths, twists
- Anything that would clearly spoil future episodes

**Rules for SPOILER_RISK:**
- Refuse in a playful, human way
- No hints, no foreshadowing, no "you'll find out later"
- Keep it short and friendly
- Examples: "I can't tell you that without spoiling you 😭", "If I told you, it would ruin your viewing experience. Not doing that to you.", "That's future-episode territory — I can't spoil it."

RESPONSE STYLE:
- "Quick" style: 1-2 sentences, direct answer
- "Explain" style: Clear explanation with context, 2-4 sentences
- "Lore" style: Background/world-building focus, still spoiler-safe, 2-4 sentences

FEW-SHOT EXAMPLES:

Q: "who is yuji"
A: "Yuji Itadori is the main character of Jujutsu Kaisen. He's a high school student who becomes involved with jujutsu sorcerers after encountering a cursed object."

Q: "what's the main character's name"
A: "The main character is Yuji Itadori."

Q: "what is cursed energy"
A: "Cursed energy is negative emotions that manifest as supernatural power in Jujutsu Kaisen. Sorcerers use it to exorcise cursed spirits."

Q: "what happened so far in season 1 episode 4"
A: "As of Season 1 Episode 4, [provide a brief recap based on the episode context provided, staying within episode boundaries]."

Q: "why did he do that"
A: "Which scene are you referring to? If you can describe what happened in the last 10 seconds, I can help explain it."

Q: "what just happened"
A: "What happened in the last 10 seconds of the scene? That'll help me give you a clear answer."

Q: "who is the traitor"
A: "I can't tell you that without spoiling you 😭 That's future-episode territory."

Q: "what's his real identity"
A: "If I told you, it would ruin your viewing experience. Not doing that to you."

Q: "what's x's backstory"
A: "That's future-episode territory — I can't spoil it."

Remember: Answer SAFE_BASICS confidently. For AMBIGUOUS, ask for context. For SPOILER_RISK, refuse playfully. Sound like a friend, not a bot.`;

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

  const debugInfo: any = { step: 'entry', method: req.method };
  
  try {
    const { question, context, style, showInfo } = await req.json();
    debugInfo.step = 'parsed';
    debugInfo.hasQuestion = !!question;
    debugInfo.hasContext = !!context;
    debugInfo.contextLength = context?.length;
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    debugInfo.step = 'key_check';
    debugInfo.hasKey = !!LOVABLE_API_KEY;
    debugInfo.keyLength = LOVABLE_API_KEY?.length;
    
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ 
          error: "LOVABLE_API_KEY is not configured",
          debug: debugInfo
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!context || !context.trim()) {
      return new Response(
        JSON.stringify({ error: "Context is required to prevent spoilers", debug: debugInfo }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const styleInstructions: Record<string, string> = {
      quick: "Respond in 1-2 sentences. Be direct and concise.",
      explain: "Provide a clear explanation in 2-4 sentences with helpful context.",
      lore: "Focus on world-building and background information in 2-4 sentences, staying spoiler-safe."
    };

    const episodeInfo = showInfo?.title && showInfo?.season && showInfo?.episode
      ? `${showInfo.title} - Season ${showInfo.season}, Episode ${showInfo.episode}${showInfo.timestamp ? ` @ ${showInfo.timestamp}` : ''}`
      : showInfo?.title || 'Unknown show';

    const userMessage = `USER'S CONFIRMED PROGRESS: ${episodeInfo}

EPISODE CONTEXT (helpful reference, but not required for SAFE_BASICS questions):
"""
${context}
"""

IMPORTANT CLASSIFICATION GUIDANCE:
- If the question is SAFE_BASICS (character names, basic definitions, main cast), answer confidently using general show knowledge up to ${episodeInfo}. The episode context above is helpful but not required.
- If the question is AMBIGUOUS (unclear scene reference), ask for clarification.
- If the question is SPOILER_RISK (reveals, backstories, future events), refuse playfully.

Current response style: ${(style || 'quick').toUpperCase()}
${styleInstructions[style || 'quick']}

USER'S QUESTION:
${question}`;

    // Use Lovable AI Gateway (streaming)
    debugInfo.step = 'calling_lovable';
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
    debugInfo.step = 'lovable_response';
    debugInfo.responseStatus = response.status;
    debugInfo.responseOk = response.ok;
    debugInfo.responseStatusText = response.statusText;

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later.", debug: debugInfo }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Service temporarily unavailable.", debug: debugInfo }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      debugInfo.step = 'lovable_error';
      debugInfo.errorText = errorText.substring(0, 500);
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: "AI gateway error",
          debug: debugInfo
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    debugInfo.step = 'catch_block';
    debugInfo.errorMessage = error instanceof Error ? error.message : String(error);
    debugInfo.errorType = error instanceof Error ? error.constructor.name : typeof error;
    console.error("Chat function error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        details: error instanceof Error ? error.stack : String(error),
        debug: debugInfo
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
