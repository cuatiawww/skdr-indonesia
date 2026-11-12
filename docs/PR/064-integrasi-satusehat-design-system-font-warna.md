# PR 064: Integrasi SATUSEHAT / TTDK Design System (Font Manrope & Palet Warna Resmi)

## Ringkasan Perubahan
Menyelaraskan seluruh antarmuka sistem SKDR Indonesia dengan **SATUSEHAT / TTDK Design System v4** resmi dari **Digital Transformation Office (DTO) Kementerian Kesehatan Republik Indonesia** (`https://satusehat.kemkes.go.id/design-system`):
1. **Instalasi Library Resmi DTO Kemenkes**:
   - Menambahkan dependensi `@ttdk-design-system/library-react` (v1.0.1) ke `services/frontend-next`.
   - Mengintegrasikan preset Tailwind resmi (`@ttdk-design-system/library-react/tailwind-preset.cjs`) ke `tailwind.config.ts`.
   - Menginjeksi CSS design tokens resmi (`tokens.css`) ke `app/globals.css`.
2. **Standardisasi Tipografi Font Resmi (Manrope)**:
   - Mengunduh dan mem-bundle berkas font **Manrope** woff2 offline (`Manrope-400.woff2`, `Manrope-500.woff2`, `Manrope-600.woff2`, `Manrope-700.woff2`, `Manrope-800.woff2`) di `public/fonts/` agar proses build Docker tetap 100% mandiri tanpa ketergantungan internet.
   - Mendaftarkan `localFont` Manrope pada `app/layout.tsx` sebagai font keluarga primer (`--font-manrope`, `font-sans`).
   - Menyediakan backward compatibility untuk referensi Roboto.
3. **Penyelarasan Palet Warna Resmi (SATUSEHAT Green, Blue, Neutral, & Status)**:
   - **Primary Brand (SATUSEHAT Green)**:
     - `brand-500` (Default): `#16B3AC` (`22 179 172`)
     - `brand-600` (Strong/Hover): `#128F8A` (`18 143 138`)
     - `brand-700` (Dark/Active): `#0D6B67` (`13 107 103`)
     - `brand-100`/`brand-200` (Subtle): `#E1FBFA` / `#B8EDEA`
   - **Secondary / Accent (SATUSEHAT Blue)**:
     - `accent` / `blue-500`: `#3899FE` (`56 153 254`)
     - `blue-600`: `#1E81E8`
     - `blue-100`: `#EBF3FF`
   - **Surfaces & Borders**:
     - `page`: `#F1F2F3` (`241 242 243`, Neutral 50)
     - `card`: `#FFFFFF`
     - `border`: `#E4E5E7` (`228 229 231`, Stroke Subtle)
     - `rule`: `#CACCCF` (`202 204 207`, Divider)
   - **Teks & Kontras WCAG AAA**:
     - `text-primary`: `#141313` (Neutral Black)
     - `text-secondary`: `#62686F` (Neutral 600)
4. **Modul Integrasi & Komponen Reusable**:
   - `lib/satusehat-theme.ts`: Menyediakan konstanta bertipe kuat (`SATUSEHAT_TOKENS`), helper konversi warna (`hexToRgbTriplet`), helper badge class (`getSatusehatBadgeClass`), dan helper tombol standar TTDK (`getSatusehatButtonClass`).
   - `components/ui/Satusehat.tsx`: Wrapper reusable untuk komponen UI TTDK (`TtdkButton`, `TtdkBadge`, `TtdkChip`, `TtdkCard`, `TtdkTooltip`, `TtdkAlert`) dengan stylesheet otomatis terpasang.
5. **Database Migration**:
   - `database/init/074_satusehat_theme_tokens.sql`: Memperbarui konfigurasi `app_settings.theme_palette` dengan palet SATUSEHAT dan mencatat metadata di `app_settings.satusehat_design_system_status`.
   - `database/rollback/074_rollback.sql`: Skrip pemulihan ke tema Kemenkes sebelumnya (teruji aman).

## Berkas yang Diubah / Ditambahkan
- `services/frontend-next/package.json` & `package-lock.json`
- `services/frontend-next/app/layout.tsx`
- `services/frontend-next/app/globals.css`
- `services/frontend-next/tailwind.config.ts`
- `services/frontend-next/lib/theme.ts`
- `services/frontend-next/lib/satusehat-theme.ts` *(baru)*
- `services/frontend-next/components/ui/Satusehat.tsx` *(baru)*
- `services/frontend-next/public/fonts/Manrope-*.woff2` *(5 varian)*
- `database/init/074_satusehat_theme_tokens.sql` *(baru)*
- `database/rollback/074_rollback.sql` *(baru)*

## Verifikasi & Pengujian
- **Pemeriksaan Tipe Frontend**: `npx tsc --noEmit` lolos dengan 0 error.
- **Pengujian Migrasi Database**: `074_satusehat_theme_tokens.sql` berhasil diterapkan di container PostgreSQL, verifikasi query `app_settings` menampilkan tema SATUSEHAT.
- **Pengujian Rollback Database**: Diuji dalam transaksi `BEGIN ... ROLLBACK` tanpa kegagalan sintaks.
- **Pengujian HTTP Server**:
  - `GET /skdr` (Landing Page): HTTP 200 OK dengan font Manrope preloaded.
  - `GET /skdr/login`: HTTP 200 OK dengan palet dan font Manrope aktif.
  - `GET /skdr/dashboard/skdr/ringkasan`: HTTP 307 Redirect ke `/skdr/login` (proteksi auth terjaga).
