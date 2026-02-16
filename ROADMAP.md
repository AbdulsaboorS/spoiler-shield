# SpoilerShield – Desired Future State

> **Last updated:** 2026-02-15

Future vision and feature ideas. For current limitations and open bugs, see **PROJECT_CONTEXT.md** Section 6.

---

- **Next.** Stronger spoiler safety
  - Re-enable `audit-answer` pass:
    - Keep initial answer streaming.
    - When audit completes, if the audited answer differs:
      - Replace the displayed answer.
      - Mark message as `audited` and show "Safety edit applied."

- **Soon.** Better UX niceties
  - Clear chat / new session button in side panel.
  - Filter / search through history.
  - More explicit display of:
    - Confirmed show
    - Season/episode
    - Where recap came from (TVMaze vs. Fandom vs. manual).

- **Soon.** Broader show coverage
  - Generalize Fandom fetching beyond JJK S1:
    - Robust slug discovery
    - Multi-season support
  - Fallback to TMDB or other APIs for non-anime shows.

- **Later.** Robust telemetry & error reporting
  - Non-invasive logging of:
    - Detection failures
    - Recap fetch failures
    - Spoiler reports
  - Possibly store structured data in Supabase tables (not just logs).
