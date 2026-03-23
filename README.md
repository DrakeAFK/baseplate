# Baseplate

Minimal, local, engineering workspace.

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
2. Run the dev server.
   ```bash
   npm run dev
   ```

The repo assumes a modern Node runtime (≥22) and respects `engine-strict`. If you want to relocate your data folder, set `WORKSPACE_DIR` before running any command and the code will work off that path instead of `workspace/`.

## Layout

Baseplate uses a 3-panel layout inspired by Discord, Notion, and Todoist:

```
┌──────┬──────────────────┬──────────────────────────────────┐
│ Rail │  Channel Panel   │         Main Content             │
│ 56px │     240px        │           flex-1                 │
│      │                  │                                  │
│  ◉   │  ▾ Project Alpha │  [active page / editor]          │
│  ⌕   │    # Overview    │                                  │
│  ▤   │    # Notes       │                                  │
│  ⚙   │    # Meetings    │                                  │
│      │                  │                                  │
│      │  ▾ Project Beta  │                                  │
│      │    # Overview    │                                  │
│      │                  │                                  │
│      │  ─ All Notes ─   │                                  │
└──────┴──────────────────┴──────────────────────────────────┘
```

- **Rail** (56px): Icon-only nav for Today, Search, Inbox, Settings, and the command palette trigger.
- **Channel Panel** (240px): Projects listed with collapsible sub-items (Overview, Notes, Meetings). Also has cross-project meta-views like "All Notes".
- **Main Content**: The focused page — daily note, project dashboard, note editor, search results, etc.

## Workspace & database life cycle
`src/lib/server/db/connection.ts`: `getDb()` ensures `workspace/.app/app.db` exists, turns on WAL mode, and runs `src/lib/server/db/migrate.ts`. The first request that hits the server will trigger that pipeline so you never have to create the SQLite file by hand.

`src/lib/server/workspace/paths.ts` outlines the layout:
```text
workspace/
  .app/app.db         ← sqlite state
  projects/<slug>/    ← markdown project home + notes/docs/decisions/meetings
  daily/<year>/<date>.md
  inbox/inbox.md
```
`src/lib/server/services/workspace.ts` bootstraps the folders, seeds the default "Quick Work" project and Inbox note, and spins up a Chokidar watcher that reindexes every Markdown change so search stays sharp.

All API routes (`/api/projects`, `/api/meetings`, `/api/notes`, `/api/tasks`, etc.) point at that same DB, so when you create a project, add a meeting, or save a note the SQLite + file system are both updated and reflected in the UI immediately.

## Day-to-day flow

### Rail navigation
- **Today (◉)** — Daily note with inline editor, "My Tasks" panel showing tasks scheduled/due today across all projects, and a link to yesterday's note for easy reference.
- **Search (⌕)** — Full-text search over the DB (`search_fts`), find anything with Markdown content.
- **Inbox (▤)** — Mirrors `workspace/inbox/inbox.md`. Drop thoughts in there, then triage into projects.
- **Settings (⚙)** — Workspace-level toggles and configuration.

### Channel panel
Every project appears with collapsible sub-items:
- **Overview** — Project dashboard with execution board (task lanes), notes, meetings, backlinks, and activity feed.
- **Notes** — Direct link to the project's notes section.
- **Meetings** — Direct link to the project's meetings section.

Use the **+** button on a project group header to quick-create a task for that project.

### Command palette
Ctrl+K opens the command palette for fast navigation, creating entities, and jumping to recent work.

### Projects, meetings, and notes
Every project gets:
- a persistent `project.md` under `workspace/projects/<slug>/project.md`.
- directories for `notes`, `docs`, `decisions`, and `meetings` that follow the auto-generated filename convention (`YYYY-MM-DD--slug.md` for meetings, `<noteSlug>.md` for notes).

Meeting and note views live at `/projects/[slug]/meetings/[meetingId]` and `/projects/[slug]/notes/[noteId]`, so bookmarks survive restarts.

## When you start adding things
- `workspace/.app/app.db` is created automatically on the first run/first DB access.
- All Markdown files live under `workspace/` and are intentionally excluded from git to keep your data private.
- The workspace stays in sync with the DB via `chokidar`. Save a note in the UI and you get:
  1. a Markdown file under the correct folder,
  2. a row in SQLite (`notes`, `meetings`, `tasks`),
  3. an updated search index.

If you ever want to reset, delete `workspace/.app` and the watcher will rebuild from the Markdown files the next time the server starts.

## Extras
- `CommandPalette` listens for Ctrl+K and lets you jump anywhere or spawn a new entity without touching the mouse.
- App-wide state lives inside `src/lib/components/app-shell/AppShell.svelte`, which wires together the rail, channel panel, main content area, modals, and palette.

Keep the `workspace/` folder out of git unless you mean to.
