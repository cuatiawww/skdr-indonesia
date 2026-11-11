# PR 058: Integrasi Dasbor Zoonosis Lite ke dalam Dasbor Zoonosis (Relabel Dasbor Kategori)

## Latar Belakang & Kebutuhan
Sebelumnya, modul **Dasbor Zoonosis Lite** (`/dasbor/zoonosis-lite`) disuntikkan secara dinamis sebagai entri menu tersendiri di bawah *Dasbor SKDR*. Di sisi lain, terdapat menu **Dasbor Kategori** (`mod_dasbor_kategori`) yang menampilkan sub-menu kategori penyakit dari tabel `master_disease_categories`.

Sesuai instruksi pengguna:
1. Label menu **Dasbor Kategori** diubah menjadi **Dasbor Zoonosis** (`mod_dasbor_kategori`, ikon `Bug`).
2. **Dasbor Zoonosis Lite** dimasukkan ke dalam sub-menu **Dasbor Zoonosis** sebagai sub-menu utama (*first sub-item*), diikuti oleh kategori-kategori surveilans lainnya (`Zoonosis (Semua)`, `PD3I`, `Tular Vektor`, `Menular Langsung`, `Tular Makanan & Air`, dan `PIE`).
3. Struktur sidebar tidak lagi menampilkan Zoonosis Lite sebagai menu akar mandiri yang terpisah, menciptakan hierarki dasbor yang rapi dan terorganisir.

## Perubahan yang Dilakukan

1. **Migrasi Database (`database/init/072_rename_dasbor_kategori_to_zoonosis.sql`)**:
   - Memperbarui objek menu `mod_dasbor_kategori` pada `app_settings.navigation_menu`:
     - `label`: `"Dasbor Zoonosis"`
     - `description`: `"Dasbor analitik penyakit zoonosis dan per kategori"`
     - `icon`: `"Bug"`
     - `order`: `1.7` (diletakkan tepat di antara Dasbor SKDR dan Dasbor MBG)
   - Membersihkan entri `mod_zoonosis_lite` bila sempat tercatat pada level akar menu `grp_dasbor`.
   - File rollback: `database/rollback/072_rollback.sql`.

2. **Pengembangan Navigasi Frontend (`services/frontend-next/lib/nav.ts`)**:
   - Menambahkan `sub_zoonosis_lite` (`Zoonosis Lite`, ikon `Activity`, rute `/dasbor/zoonosis-lite`) sebagai sub-menu pertama di bawah `mod_dasbor_kategori` (Dasbor Zoonosis).
   - Menyelaraskan sub-menu kategori penyakit: kategori `ZOONOSIS` diberi label `Zoonosis (Semua)` dan diikuti oleh kategori aktif lainnya (`PD3I`, `Tular Vektor`, dst.).
   - Mekanisme `useNavMatch` secara otomatis mengenali rute `/dasbor/zoonosis-lite` sebagai sub-item aktif dari `Dasbor Zoonosis` dan membuka akordeon sidebar dengan benar.

3. **Penyelarasan Menu Konfigurasi (`services/frontend-next/lib/menu.ts`)**:
   - Mendaftarkan `DASBOR_ZOONOSIS_MENU_ITEM` ke dalam `DEFAULT_NAVIGATION_CONFIG`.
   - Memperbarui `ensureZoonosisLiteMenu` agar membersihkan entri lepasan di tingkat akar dan menyerahkan perenderan Zoonosis Lite ke dalam sub-menu Dasbor Zoonosis.

## Berkas yang Diubah / Dibuat
- `database/init/072_rename_dasbor_kategori_to_zoonosis.sql`: Migrasi database penggantian label Dasbor Kategori menjadi Dasbor Zoonosis.
- `database/rollback/072_rollback.sql`: Rollback migrasi memulihkan snapshot `app_settings_bak_072`.
- `services/frontend-next/lib/menu.ts`: Registrasi `DASBOR_ZOONOSIS_MENU_ITEM` dan penyesuaian `ensureZoonosisLiteMenu`.
- `services/frontend-next/lib/nav.ts`: Integrasi `Zoonosis Lite` ke dalam subItems `mod_dasbor_kategori`.
- `docs/PR/058-integrasi-zoonosis-lite-ke-dasbor-zoonosis.md`: Catatan dokumentasi PR 058.
- `docs/CHANGE_LOG_MATRIX.md`: Pencatatan entri riwayat PR 058.

## Verifikasi
- TypeScript Typecheck (`docker exec skdr-frontend-next npx tsc --noEmit`): **0 error**.
- Uji apply & rollback migrasi SQL pada `skdr-postgres`: Berhasil dieksekusi bolak-balik tanpa kegagalan (`BEGIN UPDATE 1 COMMIT`).
- Verifikasi rute HTTP:
  - `/skdr/dasbor/zoonosis-lite` -> HTTP 307 (proteksi auth aktif dan rute valid).
  - `/skdr/dasbor/kategori/zoonosis` -> HTTP 307.
- Git commit lokal: Tersimpan secara lokal, **tidak di-push ke remote/Gitea**.
