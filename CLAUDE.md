# Déjà — agent instructions

1. Read `PLAN.md` fully before doing anything. It is the single source of truth: pitch, architecture,
   data model, algorithms, design, task board, session log.
2. Work the first unchecked task in PLAN.md §9 unless the user says otherwise. Tick it when done and
   append a line to §10 Session log.
3. Hackathon rules (§0) are hard constraints: everything is written from scratch in this repo; never
   copy code from other projects. List any new OSS dependency in README's tech stack.
4. Use the real SDK signatures — check `node_modules/node-appwrite/dist/services/*.d.ts` rather than
   guessing. Object-param style (`tablesDB.createRow({ ... })`).
5. Before UI work, read `~/design-inspiration/CATALOG.md` and PLAN.md §6.
6. Run `pnpm -r typecheck && pnpm -r test` before committing. Commit small, descriptive commits.
7. Never push or make the repo public without asking Yash.
