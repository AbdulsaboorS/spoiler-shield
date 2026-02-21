# SpoilerShield – Agent Handoff Guide

This file is for **AI coding agents** (and humans) switching into this project. Read it first so handoffs are smooth and you can pick up where the last session left off.

---

## 1. Start Here

| Document | Purpose |
|----------|---------|
| **CLAUDE.md** (this file) | Quick orientation, current bugs, handoff checklist |
| **PROJECT_CONTEXT.md** | Full PRD + architecture + change log + how to work on the project |

**Before making changes:** Read `PROJECT_CONTEXT.md` fully. Skim the key files listed in PROJECT_CONTEXT.md (Index.tsx, useChat.ts, useEpisodeRecap.ts, spoiler-shield-chat/index.ts).

---

## 2. Repo Layout (Where Things Live)

```
spoiler-shield/
├── extension/           # Chrome extension
│   ├── content.js       # Page detection (show title, episode from Crunchyroll/Netflix)
│   └── sidepanel.js     # Iframe bridge, postMessage, storage listener
├── src/
│   ├── pages/Index.tsx  # Main UI: side panel steps (show → progress → context → qa)
│   ├── hooks/
│   │   ├── useChat.ts   # Chat API call, streaming, message persistence
│   │   ├── useEpisodeRecap.ts  # TVMaze + Fandom recap, sanitize, cache
│   │   ├── useLocalStorage.ts
│   │   └── useSidePanel.ts
│   ├── components/      # Header, ShowSearch, EpisodeSelector, ChatPanel, etc.
│   │   └── steps/       # ShowStep, ProgressStep, ContextStep, QAStep (side panel steps)
│   └── lib/types.ts     # WatchSetup, ChatMessage, etc.
├── supabase/functions/
│   ├── spoiler-shield-chat/   # Main Q&A endpoint (Lovable AI Gateway, streaming)
│   ├── sanitize-episode-context/
│   ├── audit-answer/          # Second-pass audit (client has it disabled)
│   ├── fetch-fandom-episode/
│   └── log-spoiler-report/
├── PROJECT_CONTEXT.md   # Single source of truth (product, architecture, changelog)
├── CLAUDE.md            # This file
├── MIGRATION_GUIDE.md   # Supabase project migration
└── .env.example         # VITE_SUPABASE_*, no LOVABLE_API_KEY (set as Supabase secret)
```

---

## 3. Current State (As of Last Session)

- **Deployed:** Backend is Supabase Edge Functions (project ref `dbileyqtnisyqzgwwive`). Frontend hosted on Lovable; local dev via `npm run dev`.
- **LLM:** All LLM calls use **Google Generative AI native API** (`GOOGLE_AI_API_KEY` Supabase secret, `gemini-3-flash-preview`). All 3 functions are self-contained (no shared module import — avoids Deno cache issues). Auth via `x-goog-api-key` header only.
- **Chat:** Working end-to-end. Q&A streams correctly. `useChat.ts` parses `candidates[0].content.parts[0].text`.
- **Frontend:** `Index.tsx` refactored from 1025 → 664 lines. Step logic extracted into `src/components/steps/` (ShowStep, ProgressStep, ContextStep, QAStep). React hooks violation (useCallback inside conditional) is fixed.
- **Audit pass:** Still disabled in `useChat.ts` — re-enable after chat is confirmed stable.

---

## 4. Rules & Constraints

- Do not add new dependencies without documenting the reason in PROJECT_CONTEXT.md Section 7 (Change Log).
- Do not modify the system prompt in `spoiler-shield-chat` without updating PROJECT_CONTEXT.md Section 3 (Spoiler Policy).
- Do not bypass or weaken the spoiler safety contract, even for testing.
- Do not commit secrets or API keys. `.env.local` must stay in `.gitignore`. Supabase secrets are set via CLI only.
- Do not remove or modify `useRef`-based guards in `Index.tsx` or `useEpisodeRecap.ts` without understanding the infinite-loop history (see PROJECT_CONTEXT.md Change Log).
- If you add debug/instrumentation code, note it in CLAUDE.md Section 6 (Current Bugs) so the next agent knows to remove or keep it.
- When debugging LLM behavior: confirm the browser hits the correct Supabase URL, that `spoiler-shield-chat` is deployed with the latest system prompt, and what `context` text is being sent; compare with Lovable-hosted version if available to spot deployment or prompt drift.

---

## 5. Smoke Test Checklist

After making changes, run this quick manual check to catch regressions:

1. `npm run dev` starts without errors.
2. Open the Chrome extension side panel on a Crunchyroll page — detection card appears.
3. Confirm a show (e.g. Jujutsu Kaisen), select S1E4, confirm progress.
4. Episode recap loads (from TVMaze or Fandom fallback).
5. In Q&A, ask a safe question (e.g. "Who is Gojo?") — answer streams back without error.
6. Ask a spoiler-risk question (e.g. "Does Yuji die?") — answer is a playful refusal, no spoilers.
7. No console errors related to `useEffect` loops or missing refs.

---

## 6. Current Bugs / Open Issues

No active bugs. All previously known issues are resolved.

| Issue | Status |
|-------|--------|
| Chat 500 (Lovable gateway) | Fixed 2026-02-17 |
| 404 on OpenAI-compatible endpoint | Fixed 2026-02-19 (native Gemini API) |
| `gemini-2.0-flash` not available for API key | Fixed 2026-02-21 (switched to `gemini-3-flash-preview`) |
| React hooks violation in Index.tsx | Fixed 2026-02-21 (useCallbacks moved above conditional) |

---

## 7. Upcoming Work (Prioritized)

1. **UI/UX improvements** – Owner has improvements in mind; to be discussed next session.
2. **Re-enable audit pass** – Wire `audit-answer` in `useChat.ts` after streaming; show "Safety edit applied" when answer is modified.
3. **Clear chat UI** – Side panel button to clear conversation (hook `clearChat` exists; needs UI).
4. **Broader show coverage** – Fandom beyond Jujutsu Kaisen S1; multi-season.
5. **Detection robustness** – More reliable DOM/URL detection across Crunchyroll/Netflix updates.

---

## 8. Handoff Checklist (When You Pause)

When you stop and hand off to another agent or return later:

- [ ] **PROJECT_CONTEXT.md** – Section 7 (Change Log) updated with what you did this session.
- [ ] **PROJECT_CONTEXT.md** – Section 6 (Known Limitations) and Section 4/5 updated if you changed behavior or env.
- [ ] **CLAUDE.md** – Section 6 (Current Bugs) and Section 7 (Upcoming Work) updated if you fixed a bug or reprioritized.
- [ ] No **secrets** in repo (`.env.local` in `.gitignore`; secrets only in Supabase dashboard).
- [ ] If you added debug/instrumentation, note it in PROJECT_CONTEXT or CLAUDE.md so the next agent knows to remove or keep it.

---

## 9. Quick Commands

```bash
# Local dev
npm install && npm run dev

# Supabase (from repo root)
supabase login
supabase link --project-ref dbileyqtnisyqzgwwive
supabase secrets list
# GOOGLE_AI_API_KEY should already be set; if not: supabase secrets set GOOGLE_AI_API_KEY=your-key
supabase functions deploy spoiler-shield-chat
supabase functions deploy sanitize-episode-context
supabase functions deploy audit-answer
supabase functions deploy fetch-fandom-episode
supabase functions deploy log-spoiler-report
```

---

*Last updated: 2026-02-21.*
