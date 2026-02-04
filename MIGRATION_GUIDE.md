# Supabase Migration Guide

This guide will help you migrate from the old Supabase project to your own project.

## Prerequisites

- Supabase CLI installed: `npm install -g supabase` or `brew install supabase/tap/supabase`
- A Supabase account (sign up at https://supabase.com)

## Step-by-Step Migration

### 1. Create New Supabase Project

1. Go to https://app.supabase.com
2. Click "New Project"
3. Fill in:
   - **Name**: `spoiler-shield` (or your preferred name)
   - **Database Password**: Choose a strong password (save it!)
   - **Region**: Choose closest to you
4. Wait for project to finish provisioning (~2 minutes)

### 2. Get Your Project Credentials

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (looks like: `https://xxxxxxxxxxxxx.supabase.co`)
   - **anon/public key** (under "Project API keys")

### 3. Set Up Local Environment

1. Copy the example env file:
   ```bash
   cp .env.example .env.local
   ```

2. Open `.env.local` and fill in your values:
   ```env
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key-here
   ```

3. Save the file (it's already gitignored)

### 4. Link Supabase CLI to Your Project

1. Login to Supabase CLI:
   ```bash
   supabase login
   ```
   (This will open a browser to authenticate)

2. Link your project:
   ```bash
   supabase link --project-ref your-project-ref-here
   ```
   Replace `your-project-ref-here` with your actual project ref (the part before `.supabase.co` in your URL)

   Example: If your URL is `https://abcdefghijk.supabase.co`, your project ref is `abcdefghijk`

### 5. Set Up Function Secrets

All Edge Functions need the `LOVABLE_API_KEY` secret. Set it once:

```bash
supabase secrets set LOVABLE_API_KEY=your-lovable-api-key-here
```

**Where to get LOVABLE_API_KEY:**
- If you have a Lovable account: https://ai.gateway.lovable.dev
- Or check with whoever set up the original project
- This is the API key for the Lovable AI Gateway (used for Gemini 2.5 Flash)

### 6. Deploy All Edge Functions

Deploy each function one by one:

```bash
# Main chat function (most important)
supabase functions deploy spoiler-shield-chat

# Audit function (for spoiler safety)
supabase functions deploy audit-answer

# Fandom episode fetcher
supabase functions deploy fetch-fandom-episode

# Spoiler report logger
supabase functions deploy log-spoiler-report

# Context sanitizer
supabase functions deploy sanitize-episode-context
```

**Expected output:** Each should show "Deployed Function spoiler-shield-chat" (or similar) with a URL.

### 7. Verify Migration

#### Check Network Requests

1. Start your dev server:
   ```bash
   npm run dev
   ```

2. Open Chrome DevTools (F12) → **Network** tab

3. Use the app (ask a question in the side panel)

4. Look for requests to:
   - `https://your-project-ref.supabase.co/functions/v1/spoiler-shield-chat`
   - Should see `200 OK` responses

5. **Verify the URL matches your project ref** (not `bojxlmtdfhtdpdhapwki`)

#### Test a Function Directly

1. In Supabase dashboard → **Edge Functions**
2. Click on `spoiler-shield-chat`
3. Click "Invoke" tab
4. Use this test payload:
   ```json
   {
     "question": "who is yuji",
     "context": "Yuji Itadori is a high school student.",
     "style": "quick",
     "showInfo": {
       "title": "Jujutsu Kaisen",
       "season": "1",
       "episode": "1"
     }
   }
   ```
5. Should return a streaming response (or error if LOVABLE_API_KEY not set)

#### Check Function Logs

1. In Supabase dashboard → **Edge Functions** → `spoiler-shield-chat` → **Logs**
2. Should see recent invocations from your app
3. No errors about missing `LOVABLE_API_KEY`

## Troubleshooting

### "Function not found" errors

- Make sure you deployed all 5 functions
- Check the function name matches exactly (case-sensitive)

### "LOVABLE_API_KEY not configured" errors

- Run: `supabase secrets set LOVABLE_API_KEY=your-key`
- Verify: `supabase secrets list` (should show LOVABLE_API_KEY)

### Requests still going to old project

- Clear browser cache
- Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)
- Check `.env.local` has correct values
- Restart dev server after changing `.env.local`

### Functions deploy but return 404

- Check function names match exactly
- Verify `supabase link` was successful
- Check `supabase/config.toml` doesn't have old project_id

## Migration Complete Checklist

- [ ] New Supabase project created
- [ ] `.env.local` file created with correct values
- [ ] `supabase link` completed successfully
- [ ] `LOVABLE_API_KEY` secret set
- [ ] All 5 functions deployed successfully
- [ ] Network tab shows requests to new project URL
- [ ] Test question works in the app
- [ ] No errors in browser console
- [ ] Function logs show successful invocations

## Next Steps

After migration:
- The old project (`bojxlmtdfhtdpdhapwki`) is no longer used
- All new requests go to your project
- You can now deploy function updates yourself
- You have full control over secrets and configuration

## Function List Reference

| Function | Purpose | Secrets Needed |
|----------|---------|----------------|
| `spoiler-shield-chat` | Main Q&A chat endpoint | `LOVABLE_API_KEY` |
| `audit-answer` | Second-pass spoiler audit | `LOVABLE_API_KEY` |
| `fetch-fandom-episode` | Fetch anime episode summaries | None |
| `log-spoiler-report` | Log user spoiler reports | None |
| `sanitize-episode-context` | Clean episode summaries | `LOVABLE_API_KEY` |
