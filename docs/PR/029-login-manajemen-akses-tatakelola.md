# PR 029 — Login, manajemen akses pengguna, dan pemisahan /dashboard vs /tatakelola

Tanggal: 9 Nov 2026 (WIB). Branch: `main` (lokal, belum di-push).

## Latar belakang
SKDR belum punya login (auth dihapus di migrasi 006). Diminta: halaman login dengan alur seperti ABVC
(NLP-PENYAKIT) tetapi berdesain SKDR, manajemen akses pengguna, serta pemisahan area **Dasbor** dan **Tata Kelola**
mengikuti diagram AKSES: Dasbor, Dasbor Limited (Spasial, Matriks Analisa), CMS/Tata Kelola.
Dasbor Limited **ditunda**: untuk sekarang hanya menu + halaman "Segera hadir".
**Revisi (9 Nov 2026):** atas permintaan Yosua *semua* dasbor kini wajib login (tidak ada lagi dasbor publik) dan
admin pertama di-seed lewat migrasi 052 dengan kata sandi bawaan yang wajib diganti saat login pertama (bukan dari `.env`).

## Alur (mengikuti ABVC)
1. Semua halaman kecuali `/login` tanpa sesi → `middleware.ts` (server) mengalihkan ke `/login?redirect=<halaman>`;
   route handler Next di `/api/*` (mis. `/api/gfs`) menjawab 401.
2. `POST /api/auth/login` (nama pengguna/email + kata sandi) → backend memverifikasi Argon2id, membuat sesi,
   mengirim cookie `skdr_session` (HttpOnly, SameSite=Lax; nama/path/secure dari env).
3. Setelah login kembali ke halaman asal (`redirect`, hanya path relatif — tidak ada open redirect).
4. `AuthGuard` (klien) memeriksa `GET /api/auth/session`. Bila `must_change_password` = true, yang tampil hanya
   layar **Ganti Kata Sandi** (atau Keluar) di halaman mana pun; backend juga menolak semua API selain `/api/auth/*`
   dengan 403 `PASSWORD_CHANGE_REQUIRED` sampai kata sandi diganti. Kartu 403 bila peran tidak berhak.
5. Timeout idle 8 jam & absolut 7 hari (`app_settings.session_*`), dicek backend setiap request.
6. Logout `POST /api/auth/logout` menghapus sesi + cookie; tab lain ikut keluar (storage event).
7. Gagal login 8× dalam 15 menit per nama pengguna → dikunci sementara (seperti ABVC).

## Akses
| Area | Halaman | Syarat |
|---|---|---|
| Login | `/login` | terbuka (satu-satunya halaman tanpa login) |
| Beranda | `/` | login (peran apa pun), sidebar menampilkan semua grup |
| Dasbor | `/dashboard` (baru), `/main-dashboard`, `/dasbor/*`, `/penyakit`, `/tv`, `/dokumentasi` | login (peran apa pun) |
| Dasbor Limited | `/dashboard/spasial`, `/dashboard/matriks-analisa` (segera hadir) | login + `dashboard_limited` |
| Tata Kelola | `/tatakelola` (baru), `/pe/*`, `/ebs`, `/integrasi/*`, `/master/*` | login + `tatakelola` (`master_data`, `integrasi` untuk menunya) |
| Manajemen Akses | `/tatakelola/pengguna`, `/tatakelola/peran`, `/tatakelola/log-akses` | `user_management` |

Rute lama tetap di tempatnya (tidak dipindah), hanya diklasifikasikan ke area Tata Kelola. Sidebar di halaman
area Dasbor hanya berisi grup Dasbor; di area Tata Kelola hanya grup Tata Kelola (`navigation_menu[].area`).
Header: tombol **Masuk** untuk tamu, atau sakelar Dasbor ↔ Tata Kelola + menu pengguna (ganti kata sandi, keluar).

Backend (`auth::guard`, sebelum cache): hanya `/health`, `/api/auth/*`, preflight OPTIONS, dan
`GET /api/v1/console/settings` (khusus tamu: hanya kunci branding untuk halaman login) yang terbuka; semua GET dasbor
perlu sesi (peran apa pun). Perlu izin: GET `/api/v1/admin/*`,
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
Di-seed oleh migrasi `052_seed_admin_must_change_password.sql` (hardcode atas permintaan Yosua, risiko sudah
dijelaskan): nama pengguna **`admin`**, peran `admin`, kata sandi bawaan **`Skdr@2026Admin`** (disimpan sebagai hash
Argon2id), `must_change_password = true`, `ON CONFLICT DO NOTHING` (admin yang sudah ada tidak diubah). Login pertama
langsung diminta mengganti kata sandi; sebelum itu tidak ada halaman/API lain yang bisa dibuka. **Segera ganti di
server mana pun**: siapa saja yang membaca repo ini mengetahui kata sandi bawaannya.
Pengguna baru dan kata sandi yang di-reset admin juga wajib diganti saat login berikutnya. Tidak ada lagi
`SKDR_ADMIN_*` di `.env`.

## Berkas
- DB: `database/init/052_seed_admin_must_change_password.sql` (+ `rollback/052_rollback.sql`): kolom
  `users.must_change_password`, seed admin, judul grup `grp_dasbor` "Dasbor Publik" → "Dasbor" (backup
  `app_settings_bak_052`).
- DB: `database/init/051_auth_users_roles.sql` (+ `rollback/051_rollback.sql`): `user_roles`, `users`,
  `user_sessions` (hanya SHA-256 token), `user_activity_log`, `app_settings.session_*`, area di `navigation_menu`
  + grup Dasbor Limited, Tata Kelola, Manajemen Akses (backup `app_settings_bak_051`). Ringan: tabel baru kecil +
  UPDATE satu baris.
- Backend: `src/auth.rs` (baru), `src/main.rs`, `src/master.rs` (settings untuk tamu hanya branding), `Cargo.toml`
  (argon2, sha2, hex, rand).
- Frontend: `middleware.ts`, `lib/access.ts`, `lib/skdr-auth.tsx`, `lib/access-api.ts`, `components/AuthGuard.tsx`,
  `components/layout/{UserMenu,AreaHub}.tsx`, `app/login`, `app/dashboard/*`, `app/tatakelola/*`, perubahan di
  `AppShell`, `DashboardHeader`, `DashboardSidebar` (badge), `LayoutContent`, `layout.tsx`, `lib/menu.ts`,
  `lib/pe-api.ts`, `lib/skdr-master-api.ts`, `locales/{id,en}.json`.
- Lainnya: `.env.example` (`SESSION_COOKIE_*` opsional, `SMOKE_USERNAME`/`SMOKE_PASSWORD` opsional untuk smoke test),
  `docker-compose.yml` (SESSION_COOKIE_NAME ke frontend), `scripts/smoke_test.sh` (login dulu, semua request pakai sesi).

## Deploy
Migrasi 051–052 jalan otomatis saat backend start. Login sebagai `admin` / kata sandi bawaan lalu langsung ganti.
Di HTTPS set `SESSION_COOKIE_SECURE=true` (dan `SESSION_COOKIE_PATH=/skdr` bila domain dipakai bersama aplikasi
lain); tanpa itu dipakai bawaan (`skdr_session`, `/`, `false`). Setelah deploy semua dasbor dan penulisan data wajib login.

## Uji
Lihat baris PR 029 di `docs/CHANGE_LOG_MATRIX.md`.
