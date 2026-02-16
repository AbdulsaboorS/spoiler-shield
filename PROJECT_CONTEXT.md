# SpoilerShield – Project Context & Technical PRD

> **Last updated:** 2026‑02‑15  
> **Owner:** Abdul (primary) – intended to be readable by any AI coding agent or human collaborator.  
> **Agent handoff:** See **AGENTS.md** for quick orientation, current bugs, and handoff checklist.

This file is the **single source of truth** for SpoilerShield’s product intent, architecture, and current implementation state.  
Every time you land a meaningful change (feature or bugfix), add a short note to **Section 7 – Change Log**.

---

## 1. Product Overview & Vision

### 1.1 Core Idea

SpoilerShield is a **Chrome side-panel companion** for anime / TV streaming sites (MVP: **Crunchyroll, Jujutsu Kaisen S1**).  
While the user is watching, they can:

- Confirm **what episode they’re on** and a short **episode recap/context**
- Ask **spoiler-safe questions** about the show or current scene
- Get answers that are:
  - **Helpful** (clear explanations)
  - **Spoiler-safe** (no future reveals)
  - **Fast enough** for real-time “watching with a friend”

The assistant should feel like a **smart friend watching with you**, not a compliance bot.

### 1.2 Primary User Flow (Side Panel MVP)

1. User is watching on Crunchyroll (Netflix later).
2. They open the **SpoilerShield side panel**.
3. Extension **auto-detects**:
   - Platform (`crunchyroll` / `netflix` / `other`)
   - Show title (best-effort)
   - Season / Episode (best-effort) if the site exposes it
4. Side panel shows a **Detected** card:
   - Shows: title, platform, and maybe `SxEy`
   - Buttons: **Confirm** and **Change**
5. After confirming / manually selecting show:
   - User selects **Season / Episode / Timestamp**
   - App auto-fetches episode **recap/context**
6. User confirms progress → moves into **Q&A mode**:
   - Scrollable **conversation history**
   - Text input to ask questions
   - Choices for answer **style** (quick / explain / lore)

---

## 2. System Architecture (High-Level)

### 2.1 Components

- **Chrome Extension**
  - `extension/content.js` – runs in page, detects show info
  - `extension/sidepanel.js` – manages the side panel iframe and `postMessage` bridge to React app
- **React Web App / Side Panel UI**
  - Entry: `src/pages/Index.tsx`
  - Shared components: `Header`, `ShowSearch`, `EpisodeSelector`, `ProgressConfirmation`, `ChatPanel`, etc.
  - Hooks: `useChat`, `useEpisodeRecap`, `useLocalStorage`, `useSidePanel`
- **Supabase Edge Functions** (Deno)
  - `spoiler-shield-chat` – main chat endpoint (Gemini 2.5 Flash, streaming)
  - `fetch-fandom-episode` – fetch + DOM-parse Fandom HTML to get Summary/Plot
  - `sanitize-episode-context` – LLM pass to sanitize recap (remove hindsight / future spoilers)
  - `audit-answer` – optional second-pass spoiler audit on the final answer (currently disabled in client)
  - `log-spoiler-report` – logs “felt spoilery” reports (MVP: console/log only)
- **External APIs**
  - **TVMaze** – show search + episode summaries
  - **Fandom wiki** – manually constructed episode URLs for Jujutsu Kaisen S1
  - **Lovable AI Gateway** – chat + sanitization + audit (calls `google/gemini-2.5-flash`; key: `LOVABLE_API_KEY` Supabase secret)

### 2.2 Data Flow (Side Panel Q&A)

1. **Detection**
   - `content.js` inspects DOM + URL → builds `showInfo`:
     - `platform`, `showTitle`, optional `episodeInfo` (`season`, `episode`), `url`, `detectedAt`
   - Stores in `chrome.storage.local` under `spoilershield_show_info`.
   - `sidepanel.js` listens to `chrome.storage.onChanged` and forwards latest info into the iframe via `postMessage` (`SPOILERSHIELD_SHOW_INFO`).

2. **React App (Index.tsx)**
   - Listens for `window.message` events of type `SPOILERSHIELD_SHOW_INFO`.
   - Maintains state:
     - `detectedShowInfo`
     - `selectedShow` (TVMaze show)
     - `watchSetup` (`platform`, `showTitle`, `showId`, `season`, `episode`, `timestamp`, `context`)
     - `currentStep` (`show` | `progress` | `context` | `qa`)
   - Uses **refs + guards** to avoid:
     - Infinite loops
     - Progress bleeding between shows
     - Detection flakiness

3. **Episode Recap**
   - When show + season + episode are set:
     - `useEpisodeRecap.fetchRecap(showId, season, episode, showTitle?)` is called once per episode (guarded via `lastRecapKey`).
   - This:
     - Calls **TVMaze** episode endpoint
     - If no summary or failure, and show is **Jujutsu Kaisen S1**, calls Fandom pipeline:
       - `fetch-fandom-episode` → raw `combined` text (Summary + Plot)
       - `sanitize-episode-context` → `sanitized` spoiler-safe summary
     - Result is cached in `localStorage` for 7 days.
   - The sanitized recap is written into `watchSetup.context` (unless user overwrote it).

4. **Chat**
   - `useChat.sendMessage(question, watchSetup, style)`:
     - Appends a `ChatMessage` for the user into `localStorage`-backed state.
     - POSTs to `${VITE_SUPABASE_URL}/functions/v1/spoiler-shield-chat`.
   - The edge function:
     - Builds system prompt (SAFE_BASICS / AMBIGUOUS / SPOILER_RISK policy).
     - Builds a user message summarizing:
       - Confirmed progress (title, season, episode, timestamp if any)
       - Episode `context` (sanitized summary)
       - Instructions on how to treat SAFE_BASICS vs. AMBIGUOUS vs. SPOILER_RISK.
     - Calls Lovable AI gateway with **streaming** enabled.
     - Returns the streamed body as `text/event-stream`.
   - Client:
     - Uses `ReadableStreamDefaultReader` to read chunks.
     - Parses `data: { ... }` SSE lines.
     - Gradually builds `assistantContent` and updates `messages` state.
     - Carefully **preserves user message** and assistant message in state, even on errors.
   - **Audit pass**:
     - Currently **disabled** in `useChat.ts` for MVP (see TODO).
     - When re-enabled, audit will run after streaming completes and can mark answers as `audited` (UI can show “Safety edit applied”).

---

## 3. Spoiler Policy & Answering Strategy

### 3.1 Constraints (MVP)

- **No future spoilers** – the model must not reveal or hint at:
  - Future events
  - Hidden identities
  - Deaths, twists, betrayals, etc.
- **Only use information up to the confirmed episode**.
- For MVP, **no aggregation across many episodes**:
  - We only use:
    - A short show-level shaping of intent (in prompt), and
    - The **current episode** summary, optionally the previous episode if needed later.

### 3.2 Question Classification (in `spoiler-shield-chat` SYSTEM_PROMPT)

The system prompt enforces 3 categories:

- **SAFE_BASICS** (Answer immediately)
  - Already-introduced character names
  - Basic definitions (e.g. “cursed energy”, “cursed spirits”)
  - Simple “what happened so far in S1E4?” type recaps
  - Basic relationships established early
  - Rules:
    - Answer in **1–3 sentences**
    - Use general show knowledge **up to** the user’s confirmed progress
    - No future hints / foreshadowing
    - Casual, friendly tone

- **AMBIGUOUS** (Ask for clarification)
  - Vague scene questions: “why did he do that?”, “what just happened?”
  - Rules:
    - Ask **one** short clarifying question
    - Don’t refuse
    - Don’t hint at future content

- **SPOILER_RISK** (Refuse playfully)
  - Questions about:
    - Traitors, hidden identities
    - Future events, abilities, deaths
    - Backstories not yet revealed
  - Rules:
    - Refuse in a **playful, human way** (e.g. “I can’t tell you that without spoiling you 😭”)
    - No hints, no “you’ll see later”

### 3.3 Episode Context Sanitization

- `fetch-fandom-episode`:
  - Constructs likely Fandom URLs for Jujutsu Kaisen S1 (Episode\_4, Episode\_04, etc.)
  - Fetches HTML and uses **DOMParser** to extract:
    - `<h2>Summary</h2>` + content
    - `<h2>Plot</h2>` + content
  - Combines these into a `combined` text string.

- `sanitize-episode-context`:
  - Uses an LLM prompt to **strip**:
    - Hindsight commentary
    - References to future episodes or manga
    - Meta commentary not needed for the episode.
  - Returns `sanitized`, which the client uses as `watchSetup.context`.

---

## 4. UI / UX Overview (Side Panel)

### 4.1 Steps & Navigation

Side panel flow: detect show (Detected card or manual search) → confirm or change → select season/episode and optionally timestamp → episode recap loads (TVMaze or Fandom fallback) → confirm progress → edit context if needed → Q&A with scrollable history, style pills, and persistent header links (Change show, Edit progress, Edit context). For exact UI behavior and step logic, see `src/pages/Index.tsx` (side panel branch) and the components it uses (e.g. `ShowSearch`, `EpisodeSelector`, `ProgressConfirmation`, `ChatPanel`).

### 4.2 Web App (Non-side-panel) Mode

- `Index.tsx` has a separate branch for the full web app layout:
  - `WatchSetupPanel` on left, `ChatPanel` on right.
  - Same hooks (`useChat`, `useEpisodeRecap`), but simpler flow.
  - This is less of a focus for MVP; side panel is primary.

---

## 5. Environment, Supabase & Deployment

### 5.1 Environment Variables

- `.env.example` (template):
  - `VITE_SUPABASE_URL=https://your-project-ref.supabase.co`
  - `VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key-here`
  - `LOVABLE_API_KEY` is **not** in `.env.local`; it’s set as a Supabase secret.

### 5.2 Supabase Config

- `supabase/config.toml`:
  - **No hardcoded project_id** – must be set via `supabase link`.
  - Functions configured:
    - `spoiler-shield-chat`
    - `audit-answer`
    - `fetch-fandom-episode`
    - `log-spoiler-report`
    - `sanitize-episode-context`
  - All `verify_jwt = false` for now (public functions called from client).

### 5.3 Deployment Checklist (High Level)

1. Create `.env.local` from `.env.example` and fill Supabase URL + anon key.
2. `supabase login`
3. `supabase link --project-ref YOUR_PROJECT_REF`
4. `supabase secrets set LOVABLE_API_KEY=your-lovable-key`
5. Deploy functions:
   ```bash
   supabase functions deploy spoiler-shield-chat
   supabase functions deploy fetch-fandom-episode
   supabase functions deploy sanitize-episode-context
   supabase functions deploy log-spoiler-report
   supabase functions deploy audit-answer
   ```
6. In the browser:
   - Confirm that network requests to `/functions/v1/spoiler-shield-chat` go to **your** project URL (not the old one).

---

## 6. Known Limitations & Future State

### 6.0 Current State & Open Bugs

- **Chat returns 500 / "Failed to get response"**  
  When the user asks a question in the side panel, the Supabase function `spoiler-shield-chat` returns 500 and the client shows "Failed to get response."  
  - **Likely causes:** `LOVABLE_API_KEY` not set for the linked Supabase project, or Lovable API rejecting the request (key format/expired).  
  - **Debug:** Check Network tab → `spoiler-shield-chat` response body (may include `error`, `details`, `debug`). Check Supabase dashboard → Logs → Edge Functions for "AI gateway error" or "LOVABLE_API_KEY is not configured."  
  - **See:** AGENTS.md Section 6 (debug steps inlined in bug table).
- **Google Gemini direct migration** was attempted and reverted (model/endpoint 404 in v1beta). All LLM calls use Lovable AI Gateway only.
- **Audit pass** remains disabled in `useChat.ts`; re-enable when chat 500 is fixed and audit endpoint is confirmed working.

### 6.1 Current Limitations (MVP)

- **Show coverage**:
  - Fandom-based recap is **only** implemented for **Jujutsu Kaisen S1**.
  - Other shows rely on TVMaze summaries; if missing, user must paste context.
- **Spoiler audit**:
  - The second-pass `audit-answer` function is implemented but **not yet wired into `useChat`** (currently commented/disabled to avoid CORS/deployment issues).
- **Detection**:
  - Detection is best-effort and may fail on:
    - Unusual Crunchyroll layouts
    - Netflix changes
  - The system relies on DOM patterns that may drift over time.
- **State reset edge cases**:
  - Many guards are in place, but step navigation + detection can still create edge cases if:
    - Detected show changes while user is mid-flow
    - LocalStorage is partially corrupted
- **Chat features**:
  - No UI yet for:
    - Clearing all chat history (web app has `clearChat`, but side-panel UI for this is not front-and-center).
  - Searching/filtering chat history.
  - “Felt spoilery” button exists conceptually but logging is basic (`log-spoiler-report` just logs).

### 6.2 Future Vision

Future vision: See **ROADMAP.md** for desired future state and feature ideas.

---

## 7. Change Log (High-Level)

> Keep this ordered **newest first**. Each entry should be 1–3 bullet points.

### 2026‑02‑15

- **Docs restructure:** Restructured AGENTS.md and PROJECT_CONTEXT.md to reduce overlap; added Rules & Constraints and Smoke Test Checklist to AGENTS.md; moved future vision to ROADMAP.md; trimmed Section 4.1 and removed Section 8 (deferred to AGENTS.md).

### 2026‑02‑12

- **Lovable revert:** All Edge Functions use **LOVABLE_API_KEY** and Lovable AI Gateway again (reverted from direct Google Gemini API after 404/model-not-found issues).
- **Chat 500 bug open:** Side panel shows "Failed to get response" when asking a question; Supabase returns 500. Debug payload added in `spoiler-shield-chat` (returns `debug` in error responses). Resolution pending (verify secret, Lovable key, logs).
- **Agent handoff:** Added **AGENTS.md** for agent handoffs; updated PROJECT_CONTEXT with current state and open bugs.

### 2026‑02‑09

- **System prompt refactor** for `spoiler-shield-chat`:
  - Implemented SAFE_BASICS / AMBIGUOUS / SPOILER_RISK classification.
  - Allowed SAFE_BASICS to use general show knowledge up to the user’s confirmed progress.
  - Added few-shot examples and friendlier, non-compliance tone.
- **Supabase migration scaffolding**:
  - Added `.env.example`, `MIGRATION_GUIDE.md`, `MIGRATION_SUMMARY.md`.
  - Removed hardcoded `project_id` from `supabase/config.toml`.
- **UseChat stability**:
  - Ensured chat messages (user + assistant) are preserved during streaming and after completion.
  - Disabled audit pass temporarily to avoid CORS/issues until deployed.

### 2026‑01‑xx (approx.) – Side Panel UX & Detection

- **Auto-detection of show info**:
  - Implemented DOM-based detection for Crunchyroll (and partial Netflix).
  - Store detected info in `chrome.storage.local` and propagate to iframe.
  - Added re-detect button + “Detecting…” loading state.
- **“Detected show” card**:
  - Shows best-effort title, platform, `SxEy` if known.
  - Confirm: accepts detected show and progresses to episode selection.
  - Change: dismisses card and focuses manual search.
- **Step navigation & Q&A history**:
  - Back navigation between **show → progress → context → qa**.
  - Persistent links in header for **Change show / Edit progress / Edit context** on Q&A step.
  - Scrollable Q&A conversation history with auto-scroll to newest message.
- **Bug fixes**:
  - Fixed blank navy screen after navigation and after “Confirm progress.”
  - Fixed `qaHistoryRef is not defined` crash by adding proper `useRef` and always rendering history container.
  - Added fallback error cards when state/step mismatches occur instead of going blank.

### 2026‑01‑xx – Episode Recap & Fandom Integration

- **`useEpisodeRecap` hook**:
  - Fetches recap from TVMaze; strips HTML.
  - Fandom fallback for Jujutsu Kaisen S1 via Supabase functions.
  - Caches sanitized recaps in `localStorage` (7 days).
- **Supabase functions added**:
  - `fetch-fandom-episode` – Fandom HTML fetch + DOM parse for Summary + Plot.
  - `sanitize-episode-context` – LLM sanitization pass to remove future spoilers & meta content.
  - `audit-answer` – second-pass spoiler audit endpoint (currently disabled on client).
  - `log-spoiler-report` – logs spoiler reports.

### 2026‑01‑xx – Performance & Stability

- **Initial performance bug**:
  - Side panel froze due to repeated effects and repeated fetches (infinite-ish loops).
  - Fixes:
    - Memoized callbacks (`useCallback`).
    - Removed non-primitive dependencies from `useEffect`.
    - Introduced `useRef`-based guards like `lastRecapKey`, `hasAutoSearched`.
    - Avoided unnecessary state updates when values didn’t change.
- **Message disappearance bug**:
  - Messages would initially appear, then vanish after a few seconds.
  - Fix:
    - Track `userMessageId` and enforce that the user message is always present in `messages` during all state transitions.
    - Ensure assistant message is preserved on both success and error paths.

---

## 8. How to Work on This Project

How to work on this project: See **AGENTS.md** for onboarding, local setup, rules, smoke test checklist, and handoff procedures.

