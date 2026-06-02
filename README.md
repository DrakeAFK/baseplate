# Baseplate  

Minimal, local-first engineering workspace  

Baseplate combines flat markdown files with a highly optimized local SQLite database to provide a zero-latency, keyboard-driven productivity environment  

---

## Architecture  

* **Files are truth**: Notes, meetings, daily logs, and task lists exist as flat Markdown files in `workspace/`  
* **DB is cache**: A local SQLite database (`workspace/.app/app.db`) indexes files for sub-millisecond relational queries and search  
* **Bi-directional sync**:  
  - Writes from the UI update the filesystem and SQLite simultaneously  
  - Disk edits (via Vim, VSCode, etc.) are detected in real-time by a `chokidar` filesystem watcher, which parses changed files and updates SQLite  
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
* **Automatic Task Extraction**: The sync engine parses standard markdown checkboxes (`- [ ] Task title`) inside meeting notes and converts them into relational tasks mapped back to the source meeting  
* **Wiki-links & Backlinks**: Support for `[[type/id]]` wiki-links, resolving them dynamically and indexing relations in an `object_links` table to build a bidirectional backlink graph  
* **FTS5 Search**: Lightning-fast, network-free search powered by SQLite’s virtual tables  
* **Command Palette**: `Ctrl+K` for fast keyboard navigation and entity creation

---

## Workspace Layout  

```text
workspace/
  .app/app.db         ← SQLite index cache & search virtual table
  projects/<slug>/    ← Project home + raw notes, docs, and decisions
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
