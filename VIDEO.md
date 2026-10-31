# Video shooting script (target 2:40, hard max 3:00)

One story, told in a real repo: a coding agent learns, a fact changes, a **fresh session** still gets it
right and can say why. Record the screen first, add the voice-over afterwards, and speed up any stretch
where Claude is thinking (2–4×). Prompts and expected results match [DEMO.md](DEMO.md).

## Pre-flight (15 min before)

- [ ] `cd ~/deja && pnpm seed:demo --reset` (≈2.5 min). Fresh `acme-shop` brain, 25 memories, 1 conflict.
- [ ] `git -C ~/acme-shop clean -fd && git -C ~/acme-shop checkout .` (no db code in the repo).
- [ ] Dashboard: https://deja.appwrite.network/brain, signed in. Using the live site shows it's
      deployed on Appwrite Sites. Type one Ask query ("which database do we use?") to warm it up, then reload.
- [ ] Claude Code in `~/acme-shop`: `/mcp` shows **deja · connected**; disable Neon or any other DB MCP.
- [ ] Screen: terminal on the left (font ≥ 18pt, dark theme), browser on the right (≥ 1280px wide,
      bookmarks bar hidden, 110% zoom). Do Not Disturb on. Record at 1080p or higher (QuickTime or OBS).
- [ ] Rehearse once off camera, then re-run the two reset commands above before the real take.

## Shot list

### 1 · Hook (0:00–0:12): the failure
Optional but strong. In Claude Code, `/mcp` → deja → **Disable**. Prompt `Add a migration for an orders
table.` Claude asks which database, or guesses Postgres/SQLite. Cut after ~5s of it.
Afterwards: re-enable deja, `/exit`, run the clean command again.
If you skip this shot, open on a title card with the VO.

> VO: "This repo moved to MySQL weeks ago. A new agent session has no idea, because every session
> starts with amnesia. And most memory tools only add. They keep everything forever, including what
> stopped being true."

### 2 · Reveal (0:12–0:30): the brain
Landing page hero for 2s → click **Open the brain** (top right). Hover a couple of stars; slowly
pan.

> VO: "This is Déjà, long-term memory for coding agents, built on Appwrite. Every dot is something an
> agent learned about this project. Brightness is how well it's remembered. Memories fade on a real
> forgetting curve unless they're used."

### 3 · Session 1: recall (0:30–0:45)
`cd ~/acme-shop && claude`, then `/mcp__deja__deja_bootstrap`.
Show the stars ringing and the feed line `claude-code recalled …`.

> VO: "I start Claude Code. Over MCP it loads what it knows, and you can watch it remember, live,
> through Appwrite Realtime."

### 4 · Supersede (0:45–1:15): the money shot
Prompt: `Heads up: we moved error tracking from Sentry to Highlight. Remember that.`
Show: the `remember(… replaces: […])` call in the terminal → a new dot, the Sentry dot turns into a
hollow ring with a dashed thread, feed says `superseded`. Click the new dot: the drawer shows History
with the reason.

> VO: "Now something changes. Claude finds the old memory and tells Déjà it's outdated. It isn't
> deleted, it's superseded: a hollow ring, a thread to what replaced it, and the history of why."

### 5 · Conflict (1:15–1:35)
Prompt: `Are there any contradictions in what you remember?` Claude names the Friday-deploy
conflict. Reply: `Deploys are frozen on Fridays. Keep that one.` Show the red thread disappearing and
the conflict badge dropping to 0.

> VO: "When two memories really disagree, Déjà doesn't guess. It opens a conflict, Claude asks me once,
> and it's settled for every agent."

`/exit`.

### 6 · Session 2: a fresh agent (1:35–2:10)
`claude` again (say "new session, no chat history" on screen or in VO). Prompt:
`Add a migration for an orders table.` Speed this up. Hold on the result: Drizzle `mysql-core` schema
+ MySQL migration, and the note about two reviewers.
Then: `Why do you think we use MySQL?` Hold on the answer quoting who stored it, when, and that it
replaced "Postgres hosted on Supabase". Click the MySQL star on the dashboard: same provenance.

> VO: "Brand-new session. Nothing in this repo mentions a database, yet it writes a MySQL migration
> with Drizzle and remembers the two-reviewer rule. Ask why, and it can show its work: who stored that,
> when, and the Postgres memory it replaced."

### 7 · Time warp (2:10–2:25)
Drag the time-warp slider to +60 days slowly. Point at the stats (average retention down, faded count
up). Then type `which database do we use?` in Ask → the MySQL star lights up.

> VO: "Drag time forward sixty days. One-off noise fades out, and what agents keep using stays bright.
> That's how recall stays sharp as a project grows."

### 8 · Architecture and end card (2:25–2:40)
The README's architecture diagram on GitHub (it renders the mermaid), or the landing page's
**Where memory lives** section. End card: **Déjà**, `deja.appwrite.network/demo`, `github.com/meanmachine889/Deja`.

> VO: "Under the hood, Appwrite TablesDB is the brain: memories, a knowledge graph, an event log, and
> row-level permissions for each user. Appwrite Embeddings power search, Realtime drives the live view,
> and it all runs on Appwrite Sites. Try the demo brain yourself."

## If a take goes wrong

- Claude stores the Highlight fact without `replaces`: fine. Déjà's judge still supersedes it; keep
  rolling.
- Session 2 starts coding without recalling: interrupt (Esc) and say `check your memory first`.
  Cut the nudge in the edit.
- Dashboard stops updating: reload once. Realtime only fires for the signed-in owner.
- Anything messier: re-run both pre-flight reset commands (≈3 min) and retake from shot 3.

## After recording

- [ ] Upload the video (YouTube unlisted or Loom), check it plays signed out.
- [ ] Reseed the public brain right before submitting: `pnpm seed:demo --owner deja-demo --reset`.
- [ ] Submit by **Oct 31, 11:59 PM PT**: repo https://github.com/meanmachine889/Deja (public),
      video link, live link https://deja.appwrite.network (demo: `/demo`).
