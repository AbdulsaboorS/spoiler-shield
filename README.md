# SpoilerShield (WIP)  
*A spoiler-safe Q&A side panel for anime & TV*

SpoilerShield helps people ask questions while watching a show **without getting spoiled**.

The core insight: people get confused mid-episode, but Googling anything risks spoilers. SpoilerShield lives alongside the video player and answers questions safely, using only information the viewer has already seen.


---

## What SpoilerShield does (today)

### 🧠 Core idea
Answer questions *without* revealing:
- future plot points
- character reveals
- foreshadowing
- hindsight explanations

If an answer can’t be given safely, the system asks for more context or refuses in a user-friendly way.

---

### 🧩 Current MVP surfaces

#### 1. Web app (Lovable-deployed)
- Chat interface for spoiler-safe Q&A
- Guided setup: detect show → confirm progress → ask questions
- Spoiler-safety rules baked into prompts and audits

#### 2. Chrome Side Panel Extension (primary UX)
- Opens SpoilerShield next to the video player
- Attempts to detect what the user is watching (Crunchyroll first)
- Prefills show context when possible
- Always allows manual correction

This side-panel flow is the **intended long-term UX**, not the standalone web app.

---

## What works locally

- Side panel opens reliably
- Show detection + confirmation flow works for supported pages
- Spoiler-safe refusal logic is in place
- Backend architecture for:
  - context fetching
  - sanitization
  - answer generation
  - second-pass spoiler audit

---

## What is intentionally WIP / broken

- **Answer quality tuning**
  - The model is currently too conservative for “safe basics”
  - Actively iterating on SAFE vs SPOILER-RISK classification
- **Context sourcing**
  - Episode-level wiki parsing is experimental
  - Only validated on a small anime subset
- **Deploy consistency**
  - Some Supabase Edge Functions are still being stabilized
  - “Failed to fetch” can occur depending on environment

---

## What I’m actively working on next

1. Improving “safe basics” answers  
   (e.g., *“Who is (MAIN CHARACTER)?” should never be blocked*)
2. Making spoiler refusals more human and fun  
   (not robotic safety language)
3. Tightening environment + deployment reliability
4. Expanding show coverage beyond the MVP anime set

---

## Repo structure (high level)

src/ → Web app (React / Vite)
extension/ → Chrome Side Panel Extension (Manifest V3)
supabase/functions/ → Edge Functions (chat, audit, context)

---

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS


## Dev: Side Panel Extension

This repo includes a Chrome Extension (Manifest V3) in `/extension` that opens SpoilerShield in a Chrome Side Panel and tries to prefill the **Context** box using a rolling subtitle buffer from Crunchyroll/Netflix pages.

### Run the web app locally

```sh
npm i
npm run dev
```

By default the extension iframe points to `http://localhost:5173` (see `extension/sidepanel.js`).

### Load the extension (unpacked)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the folder: `YOUR_REPO_PATH/extension`

### Use it

1. Open a Crunchyroll or Netflix playback tab (subtitle capture is heuristic-based).
2. Click the extension icon.
3. A side panel opens with the SpoilerShield web app.
4. The extension posts `SPOILERSHIELD_PREFILL` into the iframe to prefill Watch Setup + Context.
5. If subtitles can’t be captured, it sends an empty context; the app should prompt you gently for the last line.

### Config

- **Web app URL**: `extension/sidepanel.js` → `WEB_APP_URL`
- **MVP token**: hardcoded shared secret `"spoilershield-mvp-1"` in both the extension and the web app. (This is only a basic safeguard against random `postMessage` injection.)
