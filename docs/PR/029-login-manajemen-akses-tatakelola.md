# PR 029 — Login, manajemen akses pengguna, dan pemisahan /dashboard vs /tatakelola

Tanggal: 9 Nov 2026 (WIB). Branch: `main` (lokal, belum di-push).

## Latar belakang
SKDR belum punya login (auth dihapus di migrasi 006). Diminta: halaman login dengan alur seperti ABVC
(NLP-PENYAKIT) tetapi berdesain SKDR, manajemen akses pengguna, serta pemisahan area **Dasbor** dan **Tata Kelola**
mengikuti diagram AKSES: Dasbor Publik (terbuka), Dasbor Limited (Spasial, Matriks Analisa), CMS/Tata Kelola.
Dasbor Limited **ditunda**: untuk sekarang hanya menu + halaman "Segera hadir".

## Alur (mengikuti ABVC)
1. Halaman terlindungi tanpa sesi → `middleware.ts` (server) mengalihkan ke `/login?redirect=<halaman>`.
2. `POST /api/auth/login` (nama pengguna/email + kata sandi) → backend memverifikasi Argon2id, membuat sesi,
   mengirim cookie `skdr_session` (HttpOnly, SameSite=Lax; nama/path/secure dari env).
3. Setelah login kembali ke halaman asal (`redirect`, hanya path relatif — tidak ada open redirect).
4. `AuthGuard` (klien) memeriksa `GET /api/auth/session`, menampilkan kartu 403 bila peran tidak berhak.
5. Timeout idle 8 jam & absolut 7 hari (`app_settings.session_*`), dicek backend setiap request.
6. Logout `POST /api/auth/logout` menghapus sesi + cookie; tab lain ikut keluar (storage event).
7. Gagal login 8× dalam 15 menit per nama pengguna → dikunci sementara (seperti ABVC).

## Akses
| Area | Halaman | Syarat |
|---|---|---|
| Beranda | `/` | publik, sidebar menampilkan semua grup |
| Dasbor Publik | `/dashboard` (baru), `/main-dashboard`, `/dasbor/*`, `/penyakit`, `/tv`, `/dokumentasi` | publik (seperti sebelumnya) |
| Dasbor Limited | `/dashboard/spasial`, `/dashboard/matriks-analisa` (segera hadir) | login + `dashboard_limited` |
| Tata Kelola | `/tatakelola` (baru), `/pe/*`, `/ebs`, `/integrasi/*`, `/master/*` | login + `tatakelola` (`master_data`, `integrasi` untuk menunya) |
| Manajemen Akses | `/tatakelola/pengguna`, `/tatakelola/peran`, `/tatakelola/log-akses` | `user_management` |

Rute lama tetap di tempatnya (tidak dipindah), hanya diklasifikasikan ke area Tata Kelola. Sidebar di halaman
area Dasbor hanya berisi grup Dasbor; di area Tata Kelola hanya grup Tata Kelola (`navigation_menu[].area`).
Header: tombol **Masuk** untuk tamu, atau sakelar Dasbor ↔ Tata Kelola + menu pengguna (ganti kata sandi, keluar).

Backend (`auth::guard`, sebelum cache): semua GET dasbor tetap publik. Perlu izin: GET `/api/v1/admin/*`,
`/api/v1/integrasi/*`, `/api/v1/pe/cases|clusters|ebs-search`, `/api/v1/case-reports` (`tatakelola`); semua tulis
(`pe_input`, `master_data`, `integrasi`, lainnya `tatakelola`); `/api/v1/users|roles|access-log` (`user_management`).
Header `X-SKDR-Role` dari klien diabaikan; backend mengisinya dari peran pengguna (admin/verifikator/petugas) untuk
alur status Form PE.

## Peran bawaan (migrasi 051)
| Kode | Nama | Hak akses |
|---|---|---|
| admin | Administrator | `*` (terkunci) |
| pengelola | Pengelola Data | dashboard_limited, tatakelola, pe_input, pe_verify, master_data, integrasi |
| verifikator | Verifikator PE | dashboard_limited, tatakelola, pe_input, pe_verify |
| petugas | Petugas Input | dashboard_limited, tatakelola, pe_input |
| viewer | Pengguna Dasbor | dashboard_limited |
Peran baru bisa dibuat di `/tatakelola/peran`. Penjagaan: tidak bisa menonaktifkan diri sendiri, harus selalu ada
≥1 pengguna aktif yang bisa mengelola akses, peran bawaan tidak bisa dihapus. Nonaktif/ganti peran/reset kata sandi
mengakhiri semua sesi pengguna itu.

## Admin pertama
Tidak ada kata sandi di git/migrasi. Saat backend start, bila belum ada pengguna ber-peran `admin` dan env
`SKDR_ADMIN_USERNAME` + `SKDR_ADMIN_PASSWORD` terisi (lihat `.env.example`), backend membuat admin itu sekali
(Argon2id). Bila admin sudah ada, env diabaikan. Ganti kata sandi lewat menu pengguna setelah login pertama.

## Berkas
- DB: `database/init/051_auth_users_roles.sql` (+ `rollback/051_rollback.sql`): `user_roles`, `users`,
  `user_sessions` (hanya SHA-256 token), `user_activity_log`, `app_settings.session_*`, area di `navigation_menu`
  + grup Dasbor Limited, Tata Kelola, Manajemen Akses (backup `app_settings_bak_051`). Ringan: tabel baru kecil +
  UPDATE satu baris.
- Backend: `src/auth.rs` (baru), `src/main.rs`, `Cargo.toml` (argon2, sha2, hex, rand).
- Frontend: `middleware.ts`, `lib/access.ts`, `lib/skdr-auth.tsx`, `lib/access-api.ts`, `components/AuthGuard.tsx`,
  `components/layout/{UserMenu,AreaHub}.tsx`, `app/login`, `app/dashboard/*`, `app/tatakelola/*`, perubahan di
  `AppShell`, `DashboardHeader`, `DashboardSidebar` (badge), `LayoutContent`, `layout.tsx`, `lib/menu.ts`,
  `lib/pe-api.ts`, `lib/skdr-master-api.ts`, `locales/{id,en}.json`.
- Lainnya: `.env.example`, `docker-compose.yml` (SESSION_COOKIE_NAME ke frontend), `scripts/smoke_test.sh` (login dulu).

## Deploy
Tambahkan `SKDR_ADMIN_USERNAME`/`SKDR_ADMIN_PASSWORD` di `.env` server sebelum start pertama; di HTTPS set
`SESSION_COOKIE_SECURE=true` (dan `SESSION_COOKIE_PATH=/skdr` bila domain dipakai bersama aplikasi lain).
Setelah deploy, semua penulisan data (Form PE, master, sinkronisasi) wajib login.

## Uji
Lihat baris PR 029 di `docs/CHANGE_LOG_MATRIX.md`.
