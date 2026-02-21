/**
 * Shared Gemini API helper for SpoilerShield edge functions.
 *
 * Model: gemini-2.0-flash (stable, supports streaming + systemInstruction)
 * Auth:  x-goog-api-key header ONLY — no ?key= in URL.
 *        Putting a raw API key in a URL query string corrupts it if the key
 *        contains special characters (+, =, &), causing Gemini to treat the
 *        request as anonymous and return 404 "model not found".
 */

const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_BASE = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`;

export interface GenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
}

/** Thrown when Gemini returns a non-2xx response. */
export class GeminiError extends Error {
  constructor(public readonly status: number, public readonly detail: string) {
    super(`Gemini API error (HTTP ${status})`);
  }
}

function geminiHeaders(apiKey: string): HeadersInit {
  return {
    "x-goog-api-key": apiKey,
    "Content-Type": "application/json",
  };
}

/**
 * Non-streaming Gemini call.
 * @returns The generated text string.
 * @throws {GeminiError} on any non-2xx Gemini response.
 */
export async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  config: GenerationConfig = {}
): Promise<string> {
  const response = await fetch(`${GEMINI_BASE}:generateContent`, {
    method: "POST",
    headers: geminiHeaders(apiKey),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      generationConfig: config,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("[gemini] non-streaming error:", response.status, detail);
    throw new GeminiError(response.status, detail.substring(0, 300));
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

/**
 * Streaming Gemini call (SSE).
 * @returns The raw Fetch Response — pass its body straight through to the client.
 * @throws {GeminiError} on any non-2xx Gemini response.
 */
export async function callGeminiStream(
  apiKey: string,
  systemPrompt: string,
  userMessage: string
): Promise<Response> {
  const response = await fetch(
    `${GEMINI_BASE}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: geminiHeaders(apiKey),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: {},
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    console.error("[gemini] streaming error:", response.status, detail);
    throw new GeminiError(response.status, detail.substring(0, 300));
  }

  return response;
}
