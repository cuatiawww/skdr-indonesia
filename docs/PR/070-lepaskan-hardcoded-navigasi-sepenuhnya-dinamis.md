# PR 070: Lepaskan Hardcoded Navigasi & Jadikan Seluruh Sub-Menu Sepenuhnya Dinamis

**Tanggal:** 2026-11-12  
**Modul/Area:** Tata Kelola / Navigasi Sidebar (`/tatakelola/navigasi`)  
**Penulis/Pengembang:** Agent Antigravity  

---

## 1. Latar Belakang & Masalah
Sebelumnya, pada halaman konfigurasi navigasi (`/tatakelola/navigasi`), menu **Dasbor Zoonosis** dan **Form PE** tidak menampilkan sub-menu lengkapnya (hanya menampilkan 0 sub-menu pada Dasbor Zoonosis, dan 1 sub-menu pada Form PE). Hal ini disebabkan oleh:
1. Adanya penimpaan dinamis (*hardcoded injection*) pada `lib/nav.ts` (`item.source === 'disease_categories'` dan `item.source === 'pe_forms'`) yang menyuntikkan sub-menu langsung ke sidebar tampilan pengguna tetapi mengabaikan konfigurasi di database `app_settings.navigation_menu`.
2. Di database `app_settings`, item `mod_dasbor_kategori` tidak memiliki daftar `subItems` eksplisit dan masih memiliki tag `source: "disease_categories"`.
3. Fungsi pembantu `ensureBorderCountriesMenu`, `ensureZoonosisLiteMenu`, dan `normalizeDasborMbgMenu` memodifikasi konfigurasi menu secara otomatis di belakang layar.

Akibatnya, admin/pengguna tidak dapat mengedit label, mengubah urutan, menyembunyikan, atau menambah sub-menu untuk kategori zoonosis maupun form PE melalui Modul Navigasi (`/tatakelola/navigasi`).

---

## 2. Perubahan yang Dilakukan

### A. Frontend (`services/frontend-next`)
1. **`lib/menu.ts`**:
   - Mendefinisikan seluruh 7 sub-item `DASBOR_ZOONOSIS_SUB_ITEMS` secara eksplisit:
     - `sub_zoonosis_general` (Zoonosis General)
     - `sub_zoonosis_lite` (Zoonosis Lite)
     - `sub_kategori_pd3i` (PD3I)
     - `sub_kategori_tular_vektor` (Tular Vektor)
     - `sub_kategori_menular_langsung` (Menular Langsung)
     - `sub_kategori_tular_makanan_air` (Tular Makanan & Air)
     - `sub_kategori_pie` (PIE)
   - Mendefinisikan 5 sub-item `FORM_PE_SUB_ITEMS` secara eksplisit:
     - `sub_pe_daftar` (Daftar PE)
     - `sub_pe_lepto` (Leptospirosis)
     - `sub_pe_rabies` (Rabies)
     - `sub_pe_antraks` (Antraks)
     - `sub_pe_ai` (Flu Burung)
   - Menghapus atribut `source: 'disease_categories'` dan `source: 'pe_forms'`.
   - Mengubah fungsi `normalizeDasborMbgMenu`, `ensureBorderCountriesMenu`, dan `ensureZoonosisLiteMenu` menjadi passthrough murni (`(menu) => menu`).
   - Menyederhanakan `convertConfigToSidebarGroups` sehingga memetakan konfigurasi persis seperti apa yang tersimpan di DB tanpa pemfilteran atau penggantian label tersembunyi.

2. **`lib/nav.ts`**:
   - Menghilangkan blok *injector* `item.source === 'disease_categories'` dan `item.source === 'pe_forms'`.
   - Menjadikan `useNavGroups()` murni mengonsumsi `settings.navigation_menu || DEFAULT_NAVIGATION_CONFIG` dan mengonversinya langsung dengan `convertConfigToSidebarGroups`.
   - Mempertahankan ekspor fungsi `peFormLabel` untuk kebutuhan form PE.

3. **`lib/settings-context.tsx`**:
   - Menghilangkan pemanggilan `ensureBorderCountriesMenu` saat memuat pengaturan dari API, sehingga menu yang tersimpan di database langsung dipakai apa adanya.

4. **`components/tatakelola/NavigasiManager.tsx`**:
   - Menambahkan `mod_dasbor_kategori: true` pada `expandedItems` state awal agar seluruh sub-menu Dasbor Zoonosis langsung terbuka secara default di tabel konfigurasi navigasi.

### B. Database Migration (`database/init/076_sub_menu_dinamis_zoonosis_dan_pe.sql`)
- Membuat tabel pencadangan `app_settings_bak_076`.
- Memperbarui kolom `value` pada `app_settings` (`key = 'navigation_menu'`) untuk:
  - Menyematkan array `subItems` lengkap (7 sub-item) pada item `mod_dasbor_kategori`.
  - Menyematkan array `subItems` lengkap (5 sub-item) pada item `mod_form_pe`.
  - Menghapus flag `source` dari kedua item tersebut.
- Menyediakan file rollback di `database/rollback/076_rollback.sql`.

---

## 3. Verifikasi & Pengujian
1. **Migrasi Database PostgreSQL**:
   - `076_sub_menu_dinamis_zoonosis_dan_pe.sql` berhasil dieksekusi tanpa eror.
2. **Kompilasi TypeScript**:
   - `npx tsc --noEmit` lolos 100% dengan 0 error.
3. **Pemeriksaan API Endpoint `/api/v1/console/settings`**:
   - `mod_dasbor_kategori` menghasilkan 7 `subItems` (Zoonosis General, Zoonosis Lite, PD3I, Tular Vektor, Menular Langsung, Tular Makanan & Air, PIE).
   - `mod_form_pe` menghasilkan 5 `subItems` (Daftar PE, Leptospirosis, Rabies, Antraks, Flu Burung).
4. **Navigasi Manager UI**:
   - Semua sub-menu tampil di UI `/tatakelola/navigasi` dan dapat diedit, digeser urutannya, serta disimpan kembali ke DB secara dinamis.
