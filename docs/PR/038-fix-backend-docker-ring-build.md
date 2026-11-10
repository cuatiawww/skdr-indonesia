# PR 038 — Perbaikan Build Backend Docker (`ring` `curve25519.c` / `/tmp` & Cache CI)

Tanggal: 10 Nov 2026 (WIB). Branch: `main`.

## Akar Masalah
Saat Gitea Actions menjalankan langkah `Build backend image validation` (`docker build --pull -t skdr-indonesia-backend-ci services/backend-rust`), kompilasi crate `ring v0.17.14` (`crypto/curve25519/curve25519.c`) berhenti pada akhir berkas (`1924 | }`, `compilation terminated.`, `cc-rs` exit status `1`).

Pemeriksaan terhadap konfigurasi build menunjukkan penyebab gabungan berikut:
1. Secara bawaan `ring v0.17.14` meneruskan flag `-g3` ke `cc`:
   - `curve25519.c` yang dikompilasi dengan `-O3 -g3` menghasilkan berkas assembly sementara sebesar **13 MB** di `/tmp` (dan objek `curve25519.o` sebesar **2.0 MB**), sedangkan dengan `CFLAGS="-g0"` berkas sementara di `/tmp` turun menjadi **563 KB** (~23x lebih kecil) dan `curve25519.o` menjadi **138 KB** (~15x lebih kecil).
   - Pada ruang `/tmp` / disk container yang terbatas, GCC menghentikan kompilasi tepat di akhir berkas (`1924:1: fatal error: error writing to /tmp/cc...: No space left on device`, `1924 | }`, `compilation terminated.`).
2. `services/backend-rust/Dockerfile` sebelumnya menyalin seluruh `src/` sebelum kompilasi dependensi, tanpa membatasi paralelisme build Cargo dan tanpa `.dockerignore`, sehingga setiap commit selalu mengompilasi ulang seluruh ~200 crate termasuk `ring` secara paralel penuh.
3. `.gitea/workflows/skdr-deploy.yml` dan `scripts/deploy-gitea.sh` tidak membersihkan image sementara `skdr-indonesia-backend-ci` maupun layer dangling (`<none>`) antar deploy sehingga cache build menumpuk pada host runner.

## Perubahan
- [`services/backend-rust/Dockerfile`](../../services/backend-rust/Dockerfile):
  - Menetapkan `ENV CFLAGS="-g0"` dan `ENV CARGO_BUILD_JOBS="2"` pada stage `builder` untuk mengecilkan ukuran file sementara `cc` di `/tmp` dan membatasi lonjakan memori/disk paralel.
  - Memisahkan layer pre-build dependensi (`Cargo.toml` + `Cargo.lock*` dengan stub `src/main.rs` memakai `--locked`) sebelum `COPY src ./src`, menghapus fingerprint/artefak stub `backend-rust`, membangun ulang binary rilis, lalu menjalankan `strip target/release/backend-rust` (menghasilkan binary `12M` pada stage `debian:bookworm-slim`).
- [`services/backend-rust/.dockerignore`](../../services/backend-rust/.dockerignore): mengecualikan `target/` dan `.git/` dari konteks Docker build.
- [`.gitea/workflows/skdr-deploy.yml`](../../.gitea/workflows/skdr-deploy.yml): membersihkan `skdr-indonesia-backend-ci`, image dangling (`docker image prune -f`), serta cache build lebih dari 24 jam sebelum build dan membersihkan image validasi sementara pada `trap ... EXIT`.
- [`scripts/deploy-gitea.sh`](../../scripts/deploy-gitea.sh): menjalankan `docker image prune -f` setelah `docker compose up -d --build --force-recreate`.

## Verifikasi
- Pengukuran `cc` pada `ring-0.17.14/crypto/curve25519/curve25519.c` di `rust:1-slim-bookworm`:
  - Default (`-g3`): `.s` **13 MB**, `curve25519.o` **2.0 MB**.
  - Dengan `CFLAGS="-g0"`: `.s` **563 KB**, `curve25519.o` **138 KB**.
- `docker build --pull --no-cache -t skdr-indonesia-backend-ci services/backend-rust`: berhasil dibangun ulang dari nol (`12M` `/app/backend-rust`, verifikasi startup berhenti sesuai kontrak pada `Error: missing env var DB_HOST`).
- `docker build -t skdr-indonesia-backend-ci services/backend-rust` kedua: seluruh layer cache berfungsi (`Using cache`).
- `bash -n scripts/deploy-gitea.sh`: valid tanpa syntax error.
