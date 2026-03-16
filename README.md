# Baseplate

Minimalist workspace built on SvelteKit; think theprimeagen knocking together a personal command center without the fluff.

## Tech stack
- **SvelteKit 2.50 + Vite 7** for client/server routing and fast hot reload.
- **Tailwind CSS 4** with `@tailwindcss/forms`, `@tailwindcss/typography`, and **DaisyUI** for the skin.
- **mdsvex + Markdown tooling** (sanitize-html, markdown-it, gray-matter) so every note, meeting, or doc stores as Markdown.
- **better-sqlite3 + migrations** drive the workspace DB; `Zod` validates inbound API data.
- **Chokidar** watches the `workspace/` blobs and keeps the search index (FTS) in sync.
- **Vitest + Playwright** for unit/e2e sanity checks when you want the confidence.

## Getting started
1. Install dependencies.
   ```bash
   npm install
   ```
2. Run the dev server (opens the browser if you want).
   ```bash
   npm run dev -- --open
   ```
3. Build for production and verify if needed.
   ```bash
   npm run build
   npm run check
   npm run test
   npm run test:e2e
   ```

The repo assumes a modern Node runtime (≥18) and respects `engine-strict`. If you want to relocate your data folder, set `WORKSPACE_DIR` before running any command and the code will work off that path instead of `workspace/`.

## Workspace & database life cycle
`src/lib/server/db/connection.ts` is where the magic happens: `getDb()` ensures `workspace/.app/app.db` exists, turns on WAL mode, and runs `src/lib/server/db/migrate.ts`. The first request that hits the server will trigger that pipeline so you never have to create the SQLite file by hand.

`src/lib/server/workspace/paths.ts` outlines the layout:
```text
workspace/
  .app/app.db         ← sqlite state
  projects/<slug>/    ← markdown project home + notes/docs/decisions/meetings
  daily/<year>/<date>.md
  inbox/inbox.md
```
`src/lib/server/services/workspace.ts` bootstraps the folders, seeds the default “Quick Work” project and Inbox note, and spins up a Chokidar watcher that reindexes every Markdown change so search stays sharp.

All API routes (`/api/projects`, `/api/meetings`, `/api/notes`, `/api/tasks`, etc.) point at that same DB, so when you create a project, add a meeting, or save a note the SQLite + file system are both updated and reflected in the UI immediately.

## Day-to-day flow
### Tabs
- **Today** surfaces the focus dashboard built by `getOrCreateTodayDashboard`. Use it for quick entry points into what needs attention.
- **Projects** is where every project lives. Each card links to dashboards that show task trees, meeting history, and note collections. Once a project exists you can jump straight into meetings or notes, or use the “New” button to spin up tasks, meetings, or notes.
- **Search** runs full-text searches over the DB (`search_fts`) so you can find anything that has Markdown content or linked objects.
- **Inbox** mirrors `workspace/inbox/inbox.md`. Drop thoughts in there, then triage them into projects or meetings.
- **Settings** currently phases into workspace-level toggles and acts as the landing spot for future configuration.

### Projects, meetings, and notes
Every project gets:
- a persistent `project.md` under `workspace/projects/<slug>/project.md`.
- directories for `notes`, `docs`, `decisions`, and `meetings` that follow the auto-generated filename convention (`YYYY-MM-DD--slug.md` for meetings, `<noteSlug>.md` for notes).

Use the command palette (Ctrl + K) or the New button in the sidebar/header to:
1. Create a project (`kind` = standard/perpetual, summary stored in DB + Markdown).
2. Add a task directly to a project (exists in the `tasks` table).
3. Kick off a meeting (creates a row in `meetings` + Markdown file under the project tree).
4. Drop a note (`note`, `doc`, or `decision`) that both writes a Markdown file and indexes the truth in SQLite.

Meeting and note views live at `/projects/[slug]/meetings/[meetingId]` and `/projects/[slug]/notes/[noteId]`, so bookmarks survive restarts. The backend reindexes linked objects and keeps the `object_links` table tidy whenever you save content.

## When you start adding things
- `workspace/.app/app.db` is created automatically on the first run/first DB access.
- All Markdown files live under `workspace/` and are intentionally excluded from git to keep your data private.
- The inbox, daily notes, and projects folder stay in sync with the DB via `chokidar`. Save a note in the UI and you get:
  1. a Markdown file under the correct folder,
  2. a row in SQLite (`notes`, `meetings`, `tasks`),
  3. an updated search index.

If you ever want to reset, delete `workspace/.app` and the watcher will rebuild from the Markdown files the next time the server starts.

## Extras
- `CommandPalette` listens for Ctrl + K and lets you jump anywhere or spawn a new entity without touching the mouse.
- The sidebar lists active projects and links directly to the detail pages so you can keep an eye on the stuff you care about.
- App-wide state lives inside `src/lib/components/app-shell/AppShell.svelte`, which wires together the nav, modals, and palette without hiding what’s actually happening.

That’s it. Keep the workspace folder out of git, keep taking notes, and if something breaks the logs from `npm run dev` usually spell out what to fix first.
