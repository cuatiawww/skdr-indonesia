# PR 021 — Gitea Actions auto-deploy production

Status: **implementasi lokal, menunggu push**

## Ringkasan
Menambahkan workflow Gitea Actions untuk validasi dan deployment otomatis setiap push ke branch `main`.

## Workflow

File `.gitea/workflows/skdr-deploy.yml` memiliki dua job:

1. **Validate**
   - checkout source;
   - Rust format/check;
   - instalasi dependency frontend tanpa audit npm;
   - TypeScript typecheck;
   - validasi model Docker Compose.
2. **Deploy production**
   - hanya untuk push ke `main`;
   - memakai runner native `mcidev-production` dengan labels `production` dan `docker`;
   - menjalankan script deployment pada checkout persistent host;
   - force recreate backend/frontend;
   - menunggu backend healthy dan smoke test URL publik.

## Migration database

Migration `database/init/*.sql` tetap dijalankan otomatis oleh backend saat startup. Script deployment membandingkan commit sebelumnya dengan commit target. Jika ada perubahan migration, script membuat backup gzip database `skdr_indonesia` sebelum `docker compose up`.

Migration yang sudah tercatat di `schema_migrations` tidak dijalankan ulang.

## Keamanan dan rollback

- `.env` production tetap di host dan tidak masuk Git.
- Credential hanya di-load sebagai environment process, tidak dicetak ke log.
- Deployment memakai `flock` agar push tidak berjalan bersamaan dengan deployment lain.
- Tidak ada `docker compose down -v`, volume prune, atau publish port baru.
- Rollback source/image tidak otomatis membatalkan migration database; rollback migration tetap memakai prosedur PostgreSQL yang sesuai.

## Verifikasi

Sebelum workflow dipush:

- `bash -n scripts/deploy-gitea.sh`;
- validasi workflow YAML;
- `cargo fmt --check`;
- `cargo check --locked`;
- `npm run typecheck`;
- `docker compose config --quiet`;
- smoke test container dan URL publik setelah push pertama.
