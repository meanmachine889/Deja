# Déjà — build plan (single source of truth)

> **Every agent session: read this whole file first.** Then pick the first unchecked task in
> [§9 Task board](#9-task-board), do it, tick it, and append a line to [§10 Session log](#10-session-log).
> If you change a decision, update the relevant section here *in the same commit*. Never let the
> code and this file disagree.

---

## 0. Hackathon facts (do not violate)

| | |
|---|---|
| Event | Appwrite Databases Hackathon — https://hackathon.appwrite.io |
| Window | Oct 19 – **Oct 31, 2026, 11:59 PM PT** (hard deadline, late = rejected) |
| Rules | Solo. Built from scratch in the window (no code written before Oct 19 — do **not** copy from `meanmachine889/AI-Brain` or Appwrite's `memory-mcp` repo). OSS libraries/frameworks OK — **list them in the README tech stack**. |
| Must use | ≥1 Appwrite DB: TablesDB, DocumentsDB, VectorsDB, Managed PostgreSQL, Managed MySQL. We use **VectorsDB + TablesDB** (+ Realtime, Auth, Embeddings, Sites). |
| Submit | Public GitHub repo, **2–3 min demo video (demo only)**, form with DBs used. Live link optional (we'll ship one). |
| Judged on | ① Idea & innovation ② Technical execution ③ Design & experience ④ **Usage of Appwrite Databases** |
| Repo | `~/deja` → GitHub `meanmachine889/deja` (make public before submitting; ask Yash before pushing) |

---

## 1. The pitch

**Déjà — memory for AI agents that knows when it's wrong.**

Every coding agent (Claude Code, Cursor, Codex…) starts each session with amnesia. Existing memory
layers are append-only vector dumps: they remember *everything forever*, including facts that
stopped being true — so the agent confidently recalls "we use Postgres" after you migrated to MySQL.

Déjà is an MCP server + live dashboard that gives any agent a memory that behaves like a brain:

1. **It notices contradictions.** New memory "we switched to MySQL" → Déjà finds the old "we use
   Postgres", judges the relation, *supersedes* it, and keeps the history. Ambiguous clashes become
   a **conflict** you resolve in one click.
2. **It forgets like a human.** Each memory has a forgetting curve (Ebbinghaus / spaced-repetition
   stability). Memories that get recalled grow stronger; noise fades. Recall ranks by
   *similarity × retention*.
3. **It can explain itself.** Every recalled memory carries provenance: which agent, which session,
   the exact excerpt, and its supersede chain. "Why do you know this?" is one tool call / one click.
4. **You watch it think.** A realtime constellation: each memory is a star whose brightness is its
   retention. Stars light up when an agent recalls them, dim as they fade, red threads mark
   conflicts. A time-warp slider shows what your agent will have forgotten in 30 days.

### Why this wins (and the trap to avoid)
Appwrite's own blog ships a tutorial, **"Recall"** (`appwrite.io/blog/post/build-a-memory-mcp-server`):
a basic remember/recall/list/forget MCP on VectorsDB. **Judges will know it.** A plain memory MCP =
"followed the tutorial". Déjà must make the differentiators the *core*, not extras:

| Recall (tutorial) | Déjà |
|---|---|
| append-only | contradiction detection + supersede chains |
| all memories equal forever | forgetting curve + reinforcement on recall |
| VectorsDB only | VectorsDB (semantic) **+** TablesDB (state, graph, provenance, events) **+** Realtime |
| list view | live constellation, conflict inbox, time-warp, "why?" drawer |
| no provenance | every memory → agent, session, excerpt |

Demo money-shot: two agent sessions, a fact changes between them, the dashboard visibly
supersedes the old star in realtime, and the second agent answers correctly *and cites why*.

### Scope discipline
- Ship the 4 pillars above, polished. No extra pillars until §9 Must-haves are all ticked.
- Stretch (only if ahead): team-shared scope ("Hivemind"), Appwrite Functions-hosted remote MCP.
- **Not doing:** onchain anything, browser extension, fine-tuning, multi-tenant billing.

---

## 2. Architecture

```
 Claude Code / Cursor ──stdio MCP──▶ apps/mcp ──▶ packages/core ──▶ Appwrite Cloud
                                                       │              ├─ VectorsDB  deja_vectors.memories   (embeddings + light metadata)
                                                       │              ├─ TablesDB   deja.{memories,links,events,sessions}
                                                       │              ├─ Embeddings API (nomic-embed-text, 768d)
                                                       └─▶ Claude API (judge + extractor; heuristic fallback if no key)

 Browser ──▶ apps/web (Next.js on Appwrite Sites)
              ├─ Appwrite Auth (email/password session)
              ├─ Appwrite Realtime: subscribes to deja.events + deja.memories rows (row-level perms)
              └─ /api/* route handlers → packages/core (API key, owner = verified JWT user)
```

**Why two databases (say this in README + video — it's judging criterion ④):**
- **VectorsDB** answers *"what is this about?"* — HNSW cosine search over embeddings.
- **TablesDB** answers *"is it still true, how strong is it, where did it come from?"* — mutable
  state (status, stability, recall counts), the knowledge graph (`links`), the append-only event log
  that drives Realtime, sessions. Relational, indexed, row-level permissions.
- Same ID in both: `memories.$id == vector document $id`.

### Repo layout
```
deja/
  PLAN.md  CLAUDE.md  README.md  .env.example
  package.json  pnpm-workspace.yaml  tsconfig.base.json
  packages/core/          # memory engine — pure TS, no framework
    src/config.ts         # env parsing (zod)
    src/appwrite.ts       # server clients (TablesDB, VectorsDB, Embeddings)
    src/schema.ts         # IDs + table/column/collection definitions (used by setup + code)
    src/decay.ts          # forgetting curve math (pure, unit-tested)
    src/judge.ts          # Claude-powered extract + relation judge, heuristic fallback
    src/engine.ts         # remember / recall / forget / why / conflicts / resolve / timeline
    src/types.ts
    test/*.test.ts        # vitest
  apps/mcp/               # MCP stdio server, bin: deja-mcp
    src/index.ts
  apps/web/               # Next.js 15+ App Router, Tailwind v4
  scripts/setup.ts        # idempotent provisioning of all Appwrite resources
  scripts/seed-demo.ts    # seeds the demo story
```

Tooling: **pnpm** workspaces, TypeScript (ESM, `"type": "module"`), `tsx` to run, `vitest` tests.
Pinned SDKs: `node-appwrite@31.0.0`, `appwrite` (web) `@29.x`, `@modelcontextprotocol/sdk@1.x`,
`@anthropic-ai/sdk@0.x latest`, `zod`.

---

## 3. Data model

### VectorsDB — database `deja_vectors`, collection `memories`
- `dimension: 768` (Appwrite Embeddings default model `nomic-embed-text`). Fields are fixed by
  Appwrite: `embeddings: number[]`, `metadata: object`.
- `metadata = { ownerId, project, kind }` (lightweight; truth lives in TablesDB).
- Index: `embeddings_cosine`, `VectorsDBIndexType.HnswCosine`, attributes `['embeddings']`.
- Query: `Query.vectorCosine('embeddings', vec)` + `Query.limit(n)`; result docs carry `$distance`
  (0 = identical). **One vector query per request.** If `Query.equal('metadata.ownerId', …)`
  works, use it; otherwise post-filter after hydrating from TablesDB (verify in task C3).

### TablesDB — database `deja` (all tables `rowSecurity: true`, rows get `read(Role.user(ownerId))`)

**memories**
| column | type | notes |
|---|---|---|
| content | text | the atomic memory, one sentence |
| kind | enum: fact, preference, decision, convention, event, person | drives initial stability |
| project | varchar(64) | e.g. repo name; `global` for cross-project |
| status | enum: active, superseded, forgotten | |
| stability | float | days; S in R = e^(−Δt/S) |
| recallCount | integer | |
| lastReinforcedAt | datetime | Δt is measured from here |
| supersededBy | varchar(36) nullable | memory id |
| sessionId | varchar(36) | provenance |
| agent | varchar(64) | from MCP clientInfo.name |
| excerpt | text nullable | raw source text it was extracted from |
| confidence | float | judge confidence 0–1 |
| ownerId | varchar(36) | Appwrite user id |
Indexes: key(ownerId, project, status), key(ownerId, status).

**links** — the knowledge graph
| fromId | toId | type enum: supersedes, contradicts, supports, related | reason text | ownerId | resolved boolean |

**events** — append-only log; this is what the dashboard's Realtime subscription consumes
| type enum: remembered, reinforced, recalled, superseded, conflict, resolved, forgotten, session | memoryId nullable | sessionId | agent | detail text (JSON) | ownerId |

**sessions**
| agent | project | lastSeenAt datetime | ownerId |

---

## 4. Algorithms

### 4.1 Forgetting curve (`decay.ts`, pure + unit tested)
- Retention `R(t) = exp(−Δt_days / S)`, Δt from `lastReinforcedAt`.
- Initial S by kind: preference 45, convention 45, decision 21, person 30, fact 10, event 3.
- On recall/reinforce: `S' = S × (1 + 1.5 × (1 − R))` (spaced-repetition: reviewing something
  nearly forgotten strengthens it most), cap 3650; reset `lastReinforcedAt = now`, `recallCount++`.
- **Time warp** (demo + UI): `DEJA_TIME_WARP` env multiplies Δt (e.g. `1440` → 1 real minute =
  1 day). Dashboard slider computes R at `now + N days` client-side with the same function
  (export it from core; web imports `@deja/core/decay`).
- Faded = R < 0.15 → hidden from recall unless `includeFaded`, rendered as dim dust in the UI.

### 4.2 remember(text, {project, kind?, excerpt?})
1. **Extract**: if text > ~1 sentence, Claude splits it into atomic memories `{content, kind}`.
2. For each atom: embed → vector search top 8 (same owner) → hydrate rows, keep `status=active`.
3. **Duplicate** if best `$distance < 0.06` → reinforce that memory, emit `reinforced`, done.
4. Candidates with `$distance < 0.35` → **judge** (one Claude call, all candidates): for each →
   `same | updates | contradicts | supports | unrelated` + reason + confidence.
   - `same` → reinforce instead of insert.
   - `updates` (new info clearly replaces old; recency wins) → insert new, old → `superseded`,
     `supersededBy`, link `supersedes`, emit `superseded`.
   - `contradicts` (genuinely ambiguous) → insert, link `contradicts` (resolved=false), emit
     `conflict`. Recall flags both with a warning until resolved.
   - `supports` → link `supports`.
5. Insert writes: vector doc first, then TablesDB row (+ event). If row write fails, delete vector doc.
6. Return a human-readable summary the agent can show: "Stored 2 memories. Superseded: 'We use
   Postgres' → 'We use MySQL'."
- **No ANTHROPIC key** → heuristic: no extraction, distance < 0.06 = same, else insert + `related`
  link for < 0.25. Everything else still works.
- Judge model: `DEJA_MODEL` default `claude-opus-5-5`, effort `low`, structured output via
  `client.messages.parse` + `zodOutputFormat`. Check `stop_reason === 'refusal'` → fall back to heuristic.

### 4.3 recall(query, {project?, k=5, includeFaded=false})
embed → vector top 25 → hydrate → filter active (+ not faded) → score
`0.75 × (1 − distance) + 0.25 × R` → top k → reinforce each (update row, emit `recalled`) →
return with provenance + `⚠ conflicts with "<other>"` notes for unresolved contradicts links.

### 4.4 Other ops
`forget(id)` (status forgotten, emit), `why(id)` (row + session + supersede chain both directions +
links), `conflicts()` (unresolved contradicts links, both sides), `resolve(linkId, keepId)` (loser →
superseded, link resolved, emit `resolved`), `timeline(project, limit)` (events desc), `stats()`.

---

## 5. MCP server (`apps/mcp`)

stdio transport (Claude Code: `claude mcp add deja -- pnpm --dir ~/deja/apps/mcp start`).
On `initialize`, read `clientInfo.name` → `agent`; create/refresh a `sessions` row; emit `session`.

| tool | input | purpose |
|---|---|---|
| `remember` | content, project?, kind? | store; returns supersede/conflict summary |
| `recall` | query, project?, k? | ranked memories w/ provenance + conflict warnings |
| `why` | memoryId | provenance + history chain |
| `forget` | memoryId | soft-forget |
| `conflicts` | project? | open contradictions to surface to the user |
| `resolve_conflict` | linkId, keepMemoryId | resolve |
| `timeline` | project?, limit? | what happened recently |

Tool descriptions must *teach the agent when to call them* ("Call `recall` at the start of a task
and before making assumptions about the user's stack, preferences or past decisions"). Also expose an
MCP **prompt** `deja_bootstrap` that recalls top project memories.

Env: `APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, DEJA_OWNER_ID, DEJA_PROJECT
(default = cwd basename), ANTHROPIC_API_KEY (optional), DEJA_MODEL, DEJA_TIME_WARP`.

---

## 6. Dashboard (`apps/web`) — design

Follow `~/design-inspiration/CATALOG.md`. Mood: **dark = premium/intelligent**.
- Metaphor: memory as a **night sky / constellation** — calm, vast, alive. Near-black
  `#0b0b0d` bg, faint dot-grid/glyph ambience, off-white text `#f2ede6`, mid-gray body `#8a8780`.
- Type: editorial serif headlines (Instrument Serif / Newsreader via Google Fonts) + Inter/Geist
  for UI + a mono for IDs/metrics. ONE accent: warm amber `#f5b55b` (a star's glow). Conflicts use a
  muted red only inside the graph.
- Floating pill nav, pill buttons, 16–24px radii, hairline borders `rgba(255,255,255,.08)`.

### Pages
1. **`/` landing** — badge "Built on Appwrite VectorsDB + TablesDB", huge serif headline
   "Your agents remember. *And know when they're wrong.*", constellation as hero image with a
   floating terminal vignette (Claude Code calling `recall`, status pill "superseded 1 memory"),
   corner captions, numbered feature index 1.0–1.3 (the 4 pillars), install snippet, CTA.
2. **`/login`** — Appwrite email/password (sign up + sign in), shows your owner id + MCP install
   command after login.
3. **`/brain`** — the app:
   - Center: **constellation canvas** (d3-force on canvas). Star radius ∝ log(recallCount+1),
     brightness ∝ R, color tint by kind. Superseded = hollow ring + dashed thread to successor.
     Contradicts = red pulsing thread. New memory → star ignites with a ripple; recall → star flares.
   - Left rail: project filter pills, kind legend, stats bare numerals (memories / active /
     superseded / open conflicts / avg retention).
   - Right: **live feed** (Realtime events) as chips "claude-code · recalled · 'Use pnpm'".
   - Bottom: **time-warp slider** (today → +90 days); stars fade per forgetting curve live.
   - Top: **"Ask your brain"** fused input → recall results highlight stars.
   - **Memory drawer** (click star): content, kind, retention gauge + projected curve sparkline,
     provenance (agent, session, excerpt), history chain, links, Forget button.
   - **Conflict inbox** badge → modal with side-by-side cards, "Keep this" buttons.
   - Connected agents strip: sessions with `lastSeenAt` < 2 min = pulsing dot.

Libraries: `next`, `react`, `tailwindcss@4`, `d3-force`, `motion` (framer), `appwrite` web SDK,
`lucide-react`. Keep it fast; canvas not SVG for >200 nodes.

---

## 7. Demo video script (2:45 max) — build toward this

1. 0:00 Hook (10s): "Your AI agent just told you to use Postgres. You migrated to MySQL three
   weeks ago." Show the failure.
2. 0:10 Dashboard reveal (20s): constellation of a real project's memories, live.
3. 0:30 Session 1 in Claude Code (35s): agent learns conventions → stars ignite in realtime.
4. 1:05 The contradiction (35s): "we moved from Postgres to MySQL" → old star dims, dashed thread,
   feed shows `superseded`. An ambiguous one lands in the conflict inbox → resolve in one click.
5. 1:40 Session 2, fresh agent (30s): asks about DB → recalls MySQL, calls `why` → provenance.
6. 2:10 Time warp (20s): drag slider 60 days → noise fades, reinforced memories stay lit.
7. 2:30 Architecture (15s): VectorsDB + TablesDB + Realtime diagram. End card.

---

## 8. Setup needed from Yash (blocking for integration tests)

1. Appwrite Cloud project (any region). Note **endpoint** + **project id**.
2. Server **API key** with scopes: databases/tables/rows/collections/documents/indexes read+write
   (TablesDB + VectorsDB), `embeddings` (or whatever the Embeddings scope is named), `users.read`.
3. Auth: enable Email/Password. Add web platform `localhost` (+ Sites domain later).
4. `ANTHROPIC_API_KEY` (optional but needed for the contradiction judge to shine).
5. Fill `~/deja/.env` from `.env.example`, then run `pnpm setup:appwrite`.

---

## 9. Task board

Legend: `[ ]` todo · `[~]` in progress · `[x]` done. Keep IDs stable.

### A. Foundation — Oct 24
- [ ] A1 Monorepo scaffold (pnpm workspace, tsconfig, .env.example, .gitignore, CLAUDE.md)
- [ ] A2 `packages/core` config + Appwrite clients + schema definitions
- [ ] A3 `scripts/setup.ts` idempotent provisioning (both DBs, tables, columns, indexes, collection, HNSW index)
- [ ] A4 `decay.ts` + unit tests

### B. Engine — Oct 24–25
- [ ] B1 `judge.ts`: extract + relation judge (Claude structured output) + heuristic fallback
- [ ] B2 `engine.ts`: remember (dedupe/supersede/conflict), recall (scoring+reinforce), forget, why, conflicts, resolve, timeline, stats
- [ ] B3 Engine tests with in-memory fake store (judge logic + scoring), no network
- [ ] C3 Live smoke test against Appwrite (verify metadata filter syntax, `$distance`, realtime channels) — **needs §8**

### C. MCP — Oct 25
- [ ] C1 MCP stdio server with all §5 tools + `deja_bootstrap` prompt, session tracking
- [ ] C2 Wire into Claude Code locally, run the demo story end-to-end

### D. Dashboard — Oct 26–28
- [ ] D1 Next.js app scaffold, design tokens, fonts, Appwrite web client, auth pages
- [ ] D2 `/api/*` route handlers (JWT-verified owner) for recall/forget/resolve/why/stats
- [ ] D3 Constellation canvas (d3-force) with retention brightness + supersede/conflict threads
- [ ] D4 Realtime: live feed + star ignite/flare animations
- [ ] D5 Memory drawer (provenance, curve sparkline, history chain)
- [ ] D6 Conflict inbox + resolve
- [ ] D7 Time-warp slider + Ask-your-brain
- [ ] D8 Landing page `/`

### E. Ship — Oct 29–31
- [ ] E1 `scripts/seed-demo.ts` (demo story data)
- [ ] E2 Deploy web to Appwrite Sites; live link
- [ ] E3 README (pitch, GIF, architecture, why two DBs, tech stack w/ OSS list, setup)
- [ ] E4 Push public repo (ask Yash first)
- [ ] E5 Record video per §7 (Yash) — target Oct 30
- [ ] E6 Submit form by **Oct 31** (Yash) — aim for Oct 30 night, buffer day

### Stretch (only after all above)
- [ ] S1 Team scope ("Hivemind"): shared memories across owners via team permissions
- [ ] S2 Remote MCP hosted on Appwrite Functions

---

## 10. Session log

Append one line per session: date · what got done · what's next / blockers.

- 2026-10-24 · Plan written. Verified SDK APIs from `node-appwrite@31.0.0` type defs (VectorsDB `createCollection{dimension}`, `createIndex{type: HnswCosine}`, `Query.vectorCosine`, `Embeddings.createTextEmbeddings{texts, model}` with models `nomic-embed-text` / `all-minilm`; TablesDB `createTable{columns, indexes}`, `createRow/updateRow/listRows/incrementRowColumn`, transactions). Found Appwrite's "Recall" tutorial → differentiation table in §1.
