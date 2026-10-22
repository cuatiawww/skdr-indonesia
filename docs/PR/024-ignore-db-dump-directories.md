# PR 024 — Ignore Database Dump Directories in .gitignore

## Summary
Added `database/dump/`, `DB/dump/`, and `dump/` patterns to `.gitignore` so local database backups and PostgreSQL dump files (`.sql`, `.dump`, `.sql.gz`) are prevented from being accidentally tracked or committed to the repository.

## Changes
- `.gitignore`: Added `database/dump/`, `DB/dump/`, and `dump/` rules under `# uploads & backups (never commit)`.
