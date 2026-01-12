# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

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
