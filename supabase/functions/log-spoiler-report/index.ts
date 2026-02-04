import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, context, answer, showTitle, season, episode } = await req.json();

    // Log spoiler report (for MVP, just log to console)
    // Later: Store in Supabase table for analysis
    console.log("[SPOILER REPORT]", {
      timestamp: new Date().toISOString(),
      showTitle,
      season,
      episode,
      question: question?.substring(0, 100), // Truncate for logging
      answerLength: answer?.length || 0,
      contextLength: context?.length || 0,
    });

    // Return success (even if logging fails, don't block user)
    return new Response(
      JSON.stringify({ success: true, logged: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Log spoiler report error:", error);
    // Still return success - logging failure shouldn't block user
    return new Response(
      JSON.stringify({ success: true, logged: false, error: "Logging failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
