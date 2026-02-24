# SpoilerShield – Project Context & Technical PRD

> **Last updated:** 2026‑02‑23
> **Owner:** Abdul (primary) – intended to be readable by any AI coding agent or human collaborator.
> **Agent handoff:** See **CLAUDE.md** for quick orientation, current bugs, and handoff checklist.

This file is the **single source of truth** for SpoilerShield's product intent, architecture, and current implementation state.
Every time you land a meaningful change (feature or bugfix), add a short note to **Section 7 – Change Log**.

---

## 1. Product Overview & Vision

### 1.1 Core Idea

SpoilerShield is a **Chrome side-panel companion** for anime / TV streaming sites (Crunchyroll + Netflix).
While the user is watching, they can:

- Ask **spoiler-safe questions** about the show or current scene
- Get answers that are:
  - **Helpful** (clear explanations, real episode detail)
  - **Spoiler-safe** (no future reveals)
  - **Fast enough** for real-time "watching with a friend"

The assistant should feel like a **smart friend watching with you**, not a compliance bot.

### 1.2 Primary User Flow (Side Panel)

1. User is watching on Crunchyroll or Netflix.
2. They open the **SpoilerShield side panel** by clicking the extension icon.
3. Extension **auto-detects** show title, platform, and episode (best-effort from DOM + URL).
4. A session is created for that show + episode. The panel opens directly to **chat**.
5. Episode recap is auto-fetched in the background (TVMaze → Fandom → Web Search fallback chain).
6. User asks questions — answers stream back instantly, constrained to their confirmed progress.
7. Session history is preserved per show+episode and accessible via the history drawer.

No wizard, no confirmation steps. The panel opens to chat.

---

## 2. System Architecture (High-Level)

### 2.1 Components

- **Chrome Extension (MV3)**
  - `extension/background.js` – service worker; opens side panel, programmatically injects `content.js` into matching tabs when needed (covers extension reloads and already-open tabs)
  - `extension/content.js` – runs in page; detects show title + episode from DOM/URL/JSON-LD; stores in `chrome.storage.local`; responds to `GET_CONTEXT` and `REDETECT_SHOW_INFO` messages
  - `extension/sidepanel.js` – iframe bridge; forwards `chrome.storage` changes into the React app via `postMessage`

- **React Web App / Side Panel UI**
  - Entry: `src/pages/Index.tsx` — branches on `isSidePanel` → `SidePanelApp` | `WebApp`
  - Key components: `Header`, `StatusBadge`, `HistorySheet`, `ChatStatusBar`, `EpisodePicker`, `QAStep`
  - Key hooks: `useChat`, `useSessionStore`, `useInitFlow`, `useEpisodeRecap`, `useSidePanel`

- **Supabase Edge Functions** (Deno, all `verify_jwt = false`)
  - `spoiler-shield-chat` – main Q&A endpoint; streaming SSE; Gemini native API
  - `fetch-web-episode-recap` – Gemini + Google Search Grounding; returns a raw episode recap for any show
  - `fetch-fandom-episode` – fetches + DOM-parses Jujutsu Kaisen Fandom wiki pages
  - `sanitize-episode-context` – LLM pass to strip future spoilers / hindsight from any raw recap text
  - `audit-answer` – second-pass spoiler audit on completed answers (deployed but **not yet wired into client**)
  - `log-spoiler-report` – logs "felt spoilery" reports (console only for now)

- **External APIs**
  - **TVMaze** – show search + episode summaries (free, no key)
  - **Fandom wiki** – Jujutsu Kaisen S1 episode pages (hardcoded URL patterns)
  - **Google Generative AI** – all LLM calls via native Gemini API (`GOOGLE_AI_API_KEY` Supabase secret)
    - Chat + audit: `gemini-3-flash-preview` (streaming)
    - Web search recap + sanitization: `gemini-2.0-flash` (non-streaming; Search Grounding supported)

### 2.2 Data Flow (Side Panel Q&A)

**1. Detection**
- `background.js` calls `ensureContentScript(tabId, url)` on icon click and on `tabs.onUpdated` (status=complete). This probes with `GET_CONTEXT`; if content.js isn't running, it programmatically injects it via `chrome.scripting.executeScript`.
- `content.js` inspects DOM + URL → stores `spoilershield_show_info` in `chrome.storage.local`.
- `sidepanel.js` listens to `chrome.storage.onChanged` → `postMessage` into iframe as `SPOILERSHIELD_SHOW_INFO`.

**2. Session Init (`useInitFlow`)**
- Listens for `SPOILERSHIELD_SHOW_INFO` messages; deduplicates by show+episode key.
- On new show+episode: calls TVMaze to resolve showId → calls `useSessionStore.loadOrCreateSession`.
- New sessions start with `confirmed: false` — they are not shown in history until the user sends a message.
- Once session exists, fetches episode recap (see below) and sets phase to `ready`.

**3. Episode Recap (`useEpisodeRecap.fetchRecap`)**

Four-tier fallback chain, each tier cached 7 days in `localStorage`:

| Tier | Key pattern | Source |
|------|-------------|--------|
| 1 | `tvmaze_episode_{showId}_s{s}_e{e}` | TVMaze API → sanitize-episode-context |
| 2 | `fandom_episode_{slug}_s{s}_e{e}` | fetch-fandom-episode → sanitize-episode-context (JJK S1 only) |
| 3 | `websearch_episode_{slug}_s{s}_e{e}` | fetch-web-episode-recap → sanitize-episode-context |
| 4 | *(none)* | No recap — chat still works using model's general knowledge |

All tiers that produce a recap run it through `sanitize-episode-context` to strip forward spoilers before storing.

**4. Chat (`useChat`)**
- `sendMessage(question, watchSetup, style)` POSTs to `spoiler-shield-chat`.
- Edge function builds a `contextBlock` — if context exists, sends it as episode reference; if empty, instructs model to use general show knowledge conservatively.
- Streams back SSE; client reads with `ReadableStreamDefaultReader`, parses `data:` lines, updates messages incrementally.
- On first message sent, `syncMessageCount` is called → session gets `confirmed: true` → appears in history drawer.

---

## 3. Spoiler Policy & Answering Strategy

### 3.1 Constraints

- **No future spoilers** – the model must not reveal or hint at:
  - Future events, deaths, twists, betrayals
  - Hidden identities not yet revealed
- **Only use information up to the confirmed episode**.
- Context (episode recap) is a helpful reference but not required — `SAFE_BASICS` questions can be answered from general show knowledge.

### 3.2 Question Classification (in `spoiler-shield-chat` SYSTEM_PROMPT)

- **SAFE_BASICS** (Answer immediately, 1–3 sentences) — DEFAULT when in doubt
  - Character names, basic abilities, roles, early relationships
  - "What is cursed energy?", "Who is Gojo?" → SAFE_BASICS
  - Uses general show knowledge up to confirmed episode

- **AMBIGUOUS** (Ask one clarifying question)
  - Vague scene references: "why did he do that?", "what just happened?"

- **SPOILER_RISK** (Refuse playfully, no hints)
  - Questions whose answer requires revealing future deaths, twists, secret identities
  - NO-LEAK RULE: refusal must be generic — never reveal the nature of the secret

### 3.3 Episode Context Sanitization

`sanitize-episode-context` is called on **all** recap sources (TVMaze, Fandom, web search) before the text is stored or used. It strips:
- Hindsight commentary
- References to future episodes or manga
- Phrases like "later revealed", "foreshadows", "will become", "eventually"

---

## 4. UI / UX Overview (Side Panel)

### 4.1 Chat-First Flow

The panel opens directly to chat — no wizard, no confirmation steps.

- **detecting / resolving**: spinner while show info is being fetched and TVMaze lookup runs
- **no-show**: shown on home pages / non-show pages — "Pick something to watch 🍿"
- **needs-episode**: show found but no episode detected — inline `EpisodePicker` shown
- **ready**: chat is live; `QAStep` renders full conversation + input
- **error**: error state with re-detect suggestion

Header always shows `StatusBadge` (show/episode/context info + popover for manual override) and history icon.

### 4.2 Session History

Sessions are stored per show+episode in `localStorage` (`spoilershield-sessions`). Each session's messages live under `spoilershield-msgs-{sessionId}`. Max 10 sessions; oldest evicted on overflow.

- Sessions with `confirmed: false` (auto-created, no messages sent) are hidden from the history drawer.
- `HistorySheet` (left-side drawer) lists confirmed sessions; tap to switch.
- When episode changes on the same show, a toast offers to import the previous episode's chat.

### 4.3 Status Bar (`ChatStatusBar`)

Shown between conversation and input:
- **Loading**: amber spinner — "Loading episode recap — Shield not ready yet"
- **No recap**: shield icon — "No episode recap — answering from general show knowledge"
- **Ready**: shield icon — "Shielding based on S{x} E{y} knowledge"

### 4.4 Web App (Non-side-panel) Mode

`Index.tsx` has a separate branch for the full web app layout (`WatchSetupPanel` + `ChatPanel`). Same hooks, simpler flow. Not the primary focus.

---

## 5. Environment, Supabase & Deployment

### 5.1 Environment Variables

- `.env.local` (not committed):
  - `VITE_SUPABASE_URL=https://dbileyqtnisyqzgwwive.supabase.co`
  - `VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key`
- Supabase secret (set via CLI, never in repo):
  - `GOOGLE_AI_API_KEY` — used by all edge functions

### 5.2 Supabase Config

- Project ref: `dbileyqtnisyqzgwwive`
- All functions have `verify_jwt = false`
- Functions: `spoiler-shield-chat`, `fetch-web-episode-recap`, `fetch-fandom-episode`, `sanitize-episode-context`, `audit-answer`, `log-spoiler-report`

### 5.3 Deployment Checklist

```bash
supabase login
supabase link --project-ref dbileyqtnisyqzgwwive
supabase secrets list   # confirm GOOGLE_AI_API_KEY is set

# Deploy all functions
supabase functions deploy spoiler-shield-chat
supabase functions deploy fetch-web-episode-recap
supabase functions deploy fetch-fandom-episode
supabase functions deploy sanitize-episode-context
supabase functions deploy audit-answer
supabase functions deploy log-spoiler-report
```

---

## 6. Known Limitations & Future State

### 6.0 Current State

All previously known bugs are resolved. The product works end-to-end for any show on Crunchyroll or Netflix.

- `audit-answer` is deployed but **not wired into the client** — re-enable after confirming chat stability. Needs the empty-context guard removed (same fix applied to chat in 2026-02-23 session) before it can handle shows without recaps.

### 6.1 Current Limitations

- **Web search recap quality**: Gemini Search Grounding works well for popular shows but may return thin or inaccurate recaps for obscure titles. The sanitize pass provides a safety net but can't fix fundamentally wrong content.
- **Fandom coverage**: Still hardcoded to Jujutsu Kaisen S1. Web search covers the gap for other shows.
- **Detection drift**: Content.js relies on DOM patterns that may change with Crunchyroll/Netflix updates.
- **`needs-episode` with no showId**: If TVMaze lookup fails entirely, `EpisodePicker` can't render (requires a showId). Fallback: show manual season/episode text inputs. Low priority.
- **Audit pass**: `audit-answer` function exists and is deployed but is not called from `useChat.ts`. Re-enabling it requires: (1) removing its empty-context 400 guard, (2) wiring it after streaming completes.

### 6.2 Future Vision

See **ROADMAP.md** for desired future state and feature ideas.

---

## 7. Change Log (High-Level)

> Keep this ordered **newest first**. Each entry should be 1–3 bullet points.

### 2026‑02‑23

- **Detection fix:** `background.js` now programmatically injects `content.js` via `chrome.scripting.executeScript` when a tab is already open after extension reload. `tabs.onUpdated` listener also re-injects on SPA navigations. Fixed TDZ crash in `debugHeartbeat` IIFE (`state.platform` accessed before declaration).
- **Universal context pipeline:** TVMaze summaries now piped through `sanitize-episode-context` (same as Fandom). New `fetch-web-episode-recap` edge function uses Gemini Search Grounding as a third-tier fallback for any show not covered by TVMaze or Fandom. Chat no longer blocked when context is empty — model answers from general show knowledge with the episode boundary enforced in the prompt.
- **Confirmed-session pattern:** Sessions created by auto-detection have `confirmed: false` and are hidden from history. Flipped to `true` on first message via `syncMessageCount`. Prevents empty ghost sessions from accumulating.
- **UI polish:** No-show state shows a friendly "Pick something to watch 🍿" prompt. No-recap status bar is now informational (shield icon, muted text) instead of an amber warning.

### 2026‑02‑21

- **Chat-first UX rewrite:** Replaced 4-step wizard with session-oriented chat panel. Sessions stored per show+episode in `localStorage`. New hooks: `useSessionStore` (session CRUD, migration from legacy key), `useInitFlow` (init state machine: detecting → resolving → ready / needs-episode / no-show / error). New components: `StatusBadge`, `HistorySheet`, `ChatStatusBar`, `EpisodePicker`.
- **Auto-episode detection:** Toast shown when episode changes on same show, offering to import previous chat. Session switching via `HistorySheet` drawer.
- **Model update:** Switched from `gemini-2.0-flash` (OpenAI-compat endpoint) to `gemini-3-flash-preview` (native Gemini API) for chat + audit functions.

### 2026‑02‑17

- **Chat 500 fix:** Switched all LLM calls from Lovable AI Gateway to Google Generative AI native API (`GOOGLE_AI_API_KEY`, `gemini-2.0-flash`). Error handling in `useChat.ts` now parses server error bodies for clearer messages.

### 2026‑02‑15

- **Docs restructure:** Restructured AGENTS.md and PROJECT_CONTEXT.md; added Rules & Constraints and Smoke Test Checklist to CLAUDE.md; moved future vision to ROADMAP.md.

### 2026‑02‑12

- **Lovable revert:** All Edge Functions reverted to `LOVABLE_API_KEY` + Lovable AI Gateway (later superseded).
- **Agent handoff:** Added AGENTS.md (later renamed CLAUDE.md).

### 2026‑02‑09

- **System prompt refactor** for `spoiler-shield-chat`: SAFE_BASICS / AMBIGUOUS / SPOILER_RISK classification; general show knowledge allowed for SAFE_BASICS; friendlier tone.
- **Supabase migration scaffolding:** `.env.example`, `MIGRATION_GUIDE.md`; removed hardcoded `project_id`.
- **`useChat` stability:** Messages preserved through streaming and error paths; audit pass temporarily disabled.

### 2026‑01‑xx – Side Panel UX & Detection

- Auto-detection from DOM + `chrome.storage`; re-detect button; "Detecting…" state.
- Step navigation (show → progress → context → qa); persistent header links; scrollable Q&A history.
- Fixed blank screen, `qaHistoryRef` crash, fallback error cards.

### 2026‑01‑xx – Episode Recap & Fandom Integration

- `useEpisodeRecap`: TVMaze fetch + HTML strip; Fandom fallback for JJK S1; 7-day localStorage cache.
- Edge functions added: `fetch-fandom-episode`, `sanitize-episode-context`, `audit-answer`, `log-spoiler-report`.

### 2026‑01‑xx – Performance & Stability

- Fixed infinite-loop freeze: memoized callbacks, `useRef` guards (`lastRecapKey`, `hasAutoSearched`).
- Fixed message disappearance: `userMessageId` tracking through all state transitions.

---

## 8. How to Work on This Project

See **CLAUDE.md** for onboarding, local setup, rules, smoke test checklist, and handoff procedures.
