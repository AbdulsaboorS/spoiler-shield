import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Hardcoded for MVP: Jujutsu Kaisen only
const FANDOM_BASE_URL = "https://jujutsu-kaisen.fandom.com/wiki";

/**
 * Constructs Fandom wiki URL for an episode
 * Tries multiple formats: Episode_4, Episode_04, Episode_004
 */
function constructFandomUrls(episodeNumber: number): string[] {
  return [
    `${FANDOM_BASE_URL}/Episode_${episodeNumber}`,
    `${FANDOM_BASE_URL}/Episode_${episodeNumber.toString().padStart(2, '0')}`,
    `${FANDOM_BASE_URL}/Episode_${episodeNumber.toString().padStart(3, '0')}`,
  ];
}

/**
 * Fetches Fandom wiki page HTML
 */
async function fetchFandomPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SpoilerShield/1.0)',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Episode not found
      }
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    console.error(`Error fetching Fandom page ${url}:`, error);
    return null;
  }
}

/**
 * Extracts Summary and Plot sections from Fandom HTML using DOM parser
 */
function extractSummaryAndPlot(html: string): { summary: string; plot: string } | null {
  try {
    // Parse HTML using Deno's built-in DOMParser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    if (!doc) {
      return null;
    }

    // Find all h2 headings
    const headings = doc.querySelectorAll("h2");
    let summarySection: Element | null = null;
    let plotSection: Element | null = null;

    // Find Summary and Plot headings
    for (const heading of headings) {
      const text = heading.textContent?.toLowerCase().trim() || "";
      if (text === "summary" && !summarySection) {
        summarySection = heading;
      } else if (text === "plot" && !plotSection) {
        plotSection = heading;
      }
    }

    // Extract content after each heading until next h2 or end
    const extractSectionContent = (heading: Element | null): string => {
      if (!heading) return "";

      const content: string[] = [];
      let current: Element | null = heading.nextElementSibling;

      while (current) {
        // Stop at next h2 heading
        if (current.tagName === "H2") {
          break;
        }

        // Collect text from paragraphs, lists, etc.
        if (current.tagName === "P" || current.tagName === "UL" || current.tagName === "OL") {
          const text = current.textContent?.trim() || "";
          if (text) {
            content.push(text);
          }
        }

        current = current.nextElementSibling;
      }

      return content.join("\n\n").trim();
    };

    const summary = extractSectionContent(summarySection);
    const plot = extractSectionContent(plotSection);

    // Return if we have at least one section
    if (summary || plot) {
      return { summary: summary || "", plot: plot || "" };
    }

    return null;
  } catch (error) {
    console.error("Error parsing Fandom HTML:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { season, episode } = await req.json();

    // MVP: Only support Jujutsu Kaisen Season 1
    if (season !== 1) {
      return new Response(
        JSON.stringify({ error: "Only Season 1 is supported for MVP" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const episodeNumber = parseInt(episode, 10);
    if (isNaN(episodeNumber) || episodeNumber < 1) {
      return new Response(
        JSON.stringify({ error: "Invalid episode number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try multiple URL formats
    const urls = constructFandomUrls(episodeNumber);
    let html: string | null = null;
    let lastError: Error | null = null;

    for (const url of urls) {
      html = await fetchFandomPage(url);
      if (html) {
        break; // Found valid page
      }
    }

    if (!html) {
      return new Response(
        JSON.stringify({ error: "Episode page not found", episode: episodeNumber }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract Summary and Plot sections
    const extracted = extractSummaryAndPlot(html);

    if (!extracted || (!extracted.summary && !extracted.plot)) {
      return new Response(
        JSON.stringify({ error: "Could not extract Summary or Plot sections" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Combine Summary and Plot
    const combinedText = [extracted.summary, extracted.plot]
      .filter(Boolean)
      .join("\n\n");

    return new Response(
      JSON.stringify({
        summary: extracted.summary,
        plot: extracted.plot,
        combined: combinedText,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Fetch Fandom episode error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
