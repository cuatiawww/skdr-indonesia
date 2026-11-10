# PR 040 — Hilangkan Indikator `Static route` & Perbaikan Hydration Mismatch Footer (Cloudflare)

Tanggal: 10 Nov 2026 (WIB). Branch: `main`.

## Akar Masalah
1. Kontainer frontend (`docker-compose.yml`) menjalankan Next.js menggunakan `npm run dev`, sehingga Next.js 15 menampilkan indikator development **Static route** (ikon petir hitam di kiri bawah) serta badge **1 error** bila terdapat warning/error di sisi klien.
2. Pada domain publik (`https://skdr.mediaciptainformasi.web.id/skdr`), proxy Cloudflare mengaktifkan fitur **Email Address Obfuscation**, sehingga HTML hasil SSR pada komponen [`LandingFooter.tsx`](../../services/frontend-next/components/landing/LandingFooter.tsx) (`info@kemkes.go.id / skdr@kemkes.go.id` dan tautan `mailto:info@kemkes.go.id`) ditulis ulang sebelum React melakukan hidrasi di browser dan memicu error `Hydration failed because the server rendered HTML didn't match the client`.

## Perubahan
- [`services/frontend-next/next.config.mjs`](../../services/frontend-next/next.config.mjs):
  - Menambahkan `devIndicators: { appIsrStatus: false, buildActivity: false }` untuk menghilangkan indikator **Static route** maupun aktivitas build di sudut bawah tampilan.
- [`services/frontend-next/components/landing/LandingFooter.tsx`](../../services/frontend-next/components/landing/LandingFooter.tsx):
  - Menambahkan helper `SafeEmail` yang memecah elemen `local`, `@`, dan `domain` agar HTML SSR tidak memicu regex penyamaran email Cloudflare namun tetap tampil normal bagi pengguna.
  - Menunda penetapan `href="mailto:..."` pada tombol ikon email hingga `useEffect` di sisi klien (SSR memakai `#kontak`).

## Verifikasi
- `npm run typecheck` (`tsc --noEmit` di `skdr-frontend-next`): **0 error**.
- Verifikasi HTML SSR `http://127.0.0.1:3200/skdr`: `emails_in_ssr: []`, `mailtos_in_ssr: []`, teks `kemkes.go.id` tetap terender di HTML (`SafeEmail_span: True`).
- Verifikasi headless Chrome (`http://127.0.0.1:3200/skdr`, 1440×900):
  - Tidak ada `"Static route"` / `static-indicator` pada DOM maupun tangkapan layar.
  - Tidak ada error hidrasi ataupun console error React.
  - Email dan tautan `mailto:` tetap aktif setelah hidrasi klien.
- `verify_pr037.py`: seluruh cek PR 037 lulus kembali (`/` → `/skdr` 200, 7 aset gambar 200, proteksi `/beranda` & `/dashboard`).
