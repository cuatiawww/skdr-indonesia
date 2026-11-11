# PR 048 – Sembunyikan Menu Dasbor SKDR EBS & IBS dan Ubah Nama Dasbor Utama Menjadi Dasbor SKDR

## Ringkasan Perubahan
1. **Sembunyikan menu "Dasbor SKDR EBS & IBS" dari sidebar:**
   - Item menu `mod_dasbor_ebs_ibs` pada grup Dasbor dinonaktifkan (`enabled: false`) dan difilter pada navigasi sidebar.
   - Halaman `/dasbor/ebs-ibs` tetap ada di sistem dan tidak dihapus, hanya disembunyikan dari daftar navigasi sidebar kiri sesuai permintaan pengguna.
2. **Ubah nama "Dasbor Utama" menjadi "Dasbor SKDR":**
   - Label item `mod_main_dashboard` (URL `/main-dashboard`) diperbarui menjadi **"Dasbor SKDR"** baik pada konfigurasi bawaan `DEFAULT_NAVIGATION_CONFIG`, migrasi database `app_settings`, kamus i18n (`locales/id.json`), dan modal pengenalan modul.

---

## Berkas yang Diubah / Ditambahkan
1. `database/init/065_hide_ebs_ibs_menu_rename_dasbor_skdr.sql`:
   - Migrasi database PostgreSQL idempoten untuk mengupdate satu baris `app_settings.navigation_menu` (`enabled = false` untuk `mod_dasbor_ebs_ibs` dan `label = 'Dasbor SKDR'` untuk `mod_main_dashboard`).
2. `database/rollback/065_rollback.sql`:
   - Skrip rollback migrasi yang mengembalikan status `navigation_menu` dari backup `app_settings_bak_065`.
3. `services/frontend-next/lib/menu.ts`:
   - `DEFAULT_NAVIGATION_CONFIG`: `mod_main_dashboard` diubah labelnya menjadi `'Dasbor SKDR'`, `mod_dasbor_ebs_ibs` diatur `{ enabled: false }`.
   - `convertConfigToSidebarGroups`: penapis aktif menyaring keluar `mod_dasbor_ebs_ibs` dan memastikan label `mod_main_dashboard` tampil sebagai `'Dasbor SKDR'`.
4. `services/frontend-next/components/landing/LandingModals.tsx`:
   - Rujukan nama modul diperbarui menjadi 'Dasbor SKDR & Peta Nasional'.
5. `services/frontend-next/locales/id.json`:
   - Entri teks `mainDashboard` dan subjudul diperbarui ke 'Dasbor SKDR'.
6. `docs/CHANGE_LOG_MATRIX.md`:
   - Menambahkan baris catatan rilis PR 048.

---

## Pengujian & Verifikasi
- Pengujian sintaks JSON i18n (`node -e "JSON.parse(...)"`): lolos tanpa error.
- Pengujian struktur migrasi SQL (`065_hide_ebs_ibs_menu_rename_dasbor_skdr.sql` & rollback): idempoten dengan filter `jsonb_typeof(value::jsonb) = 'array'`.
- Sidebar menu Dasbor kini menampilkan urutan:
  1. Ringkasan Dasbor (`/dashboard`)
  2. Dasbor SKDR (`/main-dashboard`)
  3. Dasbor Zoonosis Lite (`/dasbor/zoonosis-lite`)
  4. Dasbor MBG (`/dasbor/mbg`)
  5. Penyakit (`/penyakit`)
  6. Mode TV (`/tv`)
