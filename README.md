# Baseplate  

Minimal, local-first engineering workspace  

Baseplate combines flat markdown files with a highly optimized local SQLite database to provide a zero-latency, keyboard-driven productivity environment  

---

## Architecture  

* **Files are truth**: Projects, tasks, notes, meetings, and daily logs have canonical Markdown/YAML representations in `workspace/`
* **DB is cache**: A local SQLite database (`workspace/.app/app.db`) indexes files for sub-millisecond relational queries and search  
* **Bi-directional sync**:  
  - Writes from the UI update the filesystem and SQLite simultaneously  
  - Disk additions, edits, and deletions (via Vim, VSCode, etc.) are detected in real time and reconciled into SQLite
  - The SQLite index can be rebuilt from canonical files from Settings
* **Durable writes**: Markdown is written through atomic file replacement, disk conflicts are surfaced in the editor, and bounded local history snapshots are retained
* **Database tuning**: Runs in WAL mode with normal sync and memory-based temp stores:  
  ```sql
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA temp_store = MEMORY;
  PRAGMA foreign_keys = ON;
  ```

---

## Mechanics  

* **Prefix-based IDs**: Every record uses Stripe-style prefixed identifiers (`prj_` for projects, `tsk_` for tasks, `nte_` for notes, `mtg_` for meetings, `dly_` for daily logs)  
* **Linked Task Extraction**: Meeting checkboxes become stable linked tasks; status changes synchronize back into their originating Markdown
* **Wiki-links & Backlinks**: Support for `[[type/id]]` wiki-links, resolving them dynamically and indexing relations in an `object_links` table to build a bidirectional backlink graph  
* **FTS5 Search**: Lightning-fast, network-free search powered by SQLite’s virtual tables  
* **Command Palette**: `Ctrl+K` for fast keyboard navigation and entity creation
* **Workbench**: A global execution surface for active work, attention, next actions, quick capture, inbox triage, and repository resume context
* **Repository Context**: Projects can attach a local Git repository and expose branch, dirty state, upstream distance, and the latest commit

---

## Workspace Layout  

```text
workspace/
  .app/app.db         ← SQLite index cache & search virtual table
  projects/<slug>/    ← Project home + raw notes, docs, and decisions
    tasks/<task-id>.md ← Canonical task records
  daily/<year>/       ← Daily scratchpads and scheduled tasks
  inbox/inbox.md      ← Quick capture file
```

---

## Core Tech  

* Svelte 5 + Runes  
* Tailwind CSS 4 + DaisyUI 5  
* better-sqlite3  
* chokidar  
* markdown-it & gray-matter

---

## Setup & Running  

Requires Node >= 22  

```bash  
npm install  
npm run dev  
```  

### Environmental configuration  
To change the default data storage directory, set `WORKSPACE_DIR` before running:  
```bash  
WORKSPACE_DIR=/path/to/custom/dir npm run dev  
```  

### Quality Control  
```bash
npm run test       # Unit / Integration
npm run test:e2e   # Playwright
```

---

## Privacy  
Your files and SQLite databases live strictly inside `workspace/`, which is ignored by `.gitignore`. Nothing leaves your machine  

Docker Compose publishes the application on all host interfaces so it can be reached directly over a trusted LAN or tailnet. Set `HOST_PORT` and `ORIGIN` in `.env` when the application is not served from `http://localhost:5173`. Do not expose the application port directly to the public internet.
