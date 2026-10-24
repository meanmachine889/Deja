# Two-session demo

The story: a coding agent learns something in one session, the fact changes, and a **brand-new
session** (no chat history) still gets it right and can explain why. The dashboard shows each step
live. Matches PLAN.md §7 (the video script).

Demo repo: `~/acme-shop` (folder name = Déjà project name, matching the seeded memories).
Déjà is registered there for Claude Code only (local scope):

```
claude mcp add deja -s local -- pnpm -s --dir /Users/yashbharadwaj/deja mcp
```

`-s` matters: without it pnpm prints a banner to stdout and breaks the MCP protocol.

## Before you record

1. Qdrant is running: `docker compose up -d` (in `~/deja`).
2. Fresh demo brain: `pnpm seed:demo --reset` (in `~/deja`, ~2 min). Removes only demo data.
3. Dashboard: `pnpm web`, open http://localhost:3100/brain, signed in. Window ≥ 1280px wide so the
   stats and live feed panels show.
4. Claude Code is logged in: run `claude`, then `/login` if asked.
5. No Anthropic key needed: the agent reports changes itself via `replaces`, and keyword rules catch
   the rest. (`ANTHROPIC_API_KEY` is optional; `pnpm check:judge` verifies it if you add one.)
6. In Claude Code, `/mcp` should show `deja · connected`.

Lay out the screen: terminal on the left, dashboard on the right.

## Session 1: teach, supersede, resolve

`cd ~/acme-shop && claude`

1. **Recall.** Prompt:
   > Before we start, check your memory: what do you know about this project?

   Watch: stars flare on the dashboard, feed shows `claude-code recalled 5 memories`.

2. **Supersede.** Prompt:
   > Heads up: we moved error tracking from Sentry to Highlight. Remember that.

   Expected: Claude recalls the Sentry memory, then calls `remember` with its id in `replaces`
   (the agent itself says what's outdated). Reply quotes Déjà: *Superseded "Errors are tracked in
   Sentry…" → "…" (replaced as claude-code reported: …)*.
   Watch: a new dot appears; the Sentry dot becomes a hollow ring with a dashed thread to it; the feed
   shows `superseded`. Click the new dot: History shows the reason. (If Claude skips `replaces`, Déjà's
   own check still catches it: this sentence is 0.247 from the Sentry memory and judged `updates`.)

3. **Conflict.** Prompt:
   > Are there any contradictions in what you remember?

   Claude lists the Friday-deploy conflict and asks which is right. Answer:
   > Deploys are frozen on Fridays. Keep that one.

   Watch: the red thread disappears; the conflict badge goes to 0; feed shows `resolved`.
   (Or resolve it on the dashboard with the conflict inbox: **Keep this**.)

Quit with `/exit`.

## Session 2: a fresh agent remembers

`claude` again in `~/acme-shop`: new session, no shared chat history.

4. **Use the memory.** Prompt:
   > Add a migration for an orders table.

   Expected: Claude recalls first, then writes a **MySQL** migration with **Drizzle** (in
   `db/schema.ts` + `db/migrations/`), not Postgres, and mentions that migrations need two reviewers.
   If it starts without recalling, nudge: *"check your memory first"*.

5. **Explain itself.** Prompt:
   > Why do you think we use MySQL?

   Claude calls `why`: who stored it, when, and that it replaced "Postgres hosted on Supabase".
   On the dashboard, click the MySQL star: the drawer shows the same provenance and history.

## Close on the dashboard

6. Drag the **time-warp** slider to +60 days: one-off events fade to dust; memories the agents keep
   recalling (pnpm workspaces, small PRs) stay bright. Stats: avg retention drops, faded count rises.
7. Ask bar: *"which database do we use?"* → the MySQL star lights up with a label.

## If something goes wrong

- `/mcp` shows deja failed: run `pnpm -s --dir ~/deja mcp` in a terminal. It should print
  `[deja] MCP server ready · project …` on stderr and then wait. Errors there name the missing env var
  or an unreachable Qdrant.
- Dashboard doesn't update live: it only updates through Appwrite Realtime. Reload the page once;
  check you're signed in as the owner in `.env` (`DEJA_OWNER_ID`).
- Memories land in the wrong project: Déjà names the project after the folder Claude Code runs in.
  Run from `~/acme-shop`.
