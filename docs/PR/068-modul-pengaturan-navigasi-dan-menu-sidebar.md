# PR 068: Modul Pengaturan Navigasi & Menu Sidebar SKDR (Tata Kelola)

**Nomor PR**: 068  
**Tanggal**: 12 November 2026  
**Penulis**: Antigravity  
**Kategori**: Fullstack (Backend Rust + Frontend Next.js + DB Migration)  
**Status**: Selesai  

---

## 1. Konteks & Latar Belakang
Pengguna dan administrator membutuhkan antarmuka visual yang mudah dan fleksibel untuk mengkustomisasi menu sidebar aplikasi SKDR Indonesia:
1. Mengubah nama grup navigasi, urutan grup, area navigasi (`home`, `dashboard`, `tatakelola`), serta perizinan akses.
2. Menambah, mengedit, mengurutkan (geser naik/turun), atau menghapus menu modul di dalam grup.
3. Menyesuaikan rute URL, label nama, ikon (dari pustaka visual Lucide resmi), lencana (*badge* seperti "Baru", "Segera"), dan deskripsi modul.
4. Menambah dan mengelola sub-menu bertingkat di bawah menu induk.
5. Mengaktifkan/menonaktifkan (*toggle active*) setiap level grup, menu, atau sub-menu secara instan.
6. Menyediakan fitur *Live Preview* tampilan sidebar nyata dan tombol *Reset Default* untuk mengembalikan struktur bawaan sistem bila diperlukan.

---

## 2. Rincian Perubahan

### A. Backend Rust (`services/backend-rust`)
- **`master.rs`**:
  - Menambahkan handler `update_settings` yang menerima `PUT` / `POST` pada `/api/v1/console/settings`.
  - Memeriksa otentikasi sesi (pengguna harus login dan memiliki hak akses `tatakelola` atau ber-role `admin`).
  - Menyimpan konfigurasi `navigation_menu` ke tabel `app_settings` menggunakan upsert `ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`.
  - Memperluas kunci konfigurasi publik `BRANDING` di `console_settings` agar menyertakan `navigation_menu` dan `theme_palette` sehingga kustomisasi menu langsung diterapkan ke seluruh pengguna.
- **`main.rs`**:
  - Mendaftarkan rute `.route("/api/v1/console/settings", get(master::console_settings).put(master::update_settings).post(master::update_settings))`.

### B. Database Migration (`database/init` & `database/rollback`)
- **`075_menu_modul_navigasi.sql`**:
  - Membackup `app_settings` ke `app_settings_bak_075`.
  - Memperbarui `navigation_menu` dengan menambahkan menu `mod_navigasi` (*Modul & Navigasi*) berikon `SlidersHorizontal` dan rute `/tatakelola/navigasi` di bawah grup Tata Kelola (`grp_tatakelola`).
- **`075_rollback.sql`**:
  - Mengembalikan `navigation_menu` dari `app_settings_bak_075`.

### C. Frontend Next.js (`services/frontend-next`)
- **`lib/menu.ts`**:
  - Mendaftarkan ikon tambahan ke `MENU_ICON_MAP` (`Clock`, `TrendingUp`, `Bug`, `FolderTree`, `FilePlus`, `Key`, `Lock`, `Sparkles`, `Share2`, `Calendar`).
  - Menambahkan menu `mod_navigasi` pada `DEFAULT_NAVIGATION_CONFIG`.
- **`lib/settings-context.tsx`**:
  - Menambahkan metode `saveNavigationMenu(menu)` dan `resetNavigationMenu()` ke `SettingsContext` untuk komunikasi reaktif langsung dengan backend dan pembaruan cache instan.
- **`components/tatakelola/NavigasiManager.tsx`**:
  - Komponen antarmuka visual lengkap:
    - Kontrol bar dengan pencarian cepat (*search*), filter per area (`Semua`, `Beranda`, `Dasbor`, `Tata Kelola`), dan tombol tambah grup.
    - Pohon hierarki Grup › Menu › Sub-Menu dengan tombol geser urutan (*Move Up / Move Down*), saklar aktif (*toggle*), edit, dan hapus.
    - Modal dialog khusus untuk Tambah/Edit Grup, Tambah/Edit Menu, dan Tambah/Edit Sub-Menu.
    - Pemilih ikon visual (*Icon Picker*) interaktif dengan fitur pencarian ikon Lucide.
    - Panel pratinjau samping (*Live Sidebar Preview*) yang menyimulasikan tampilan navigasi secara *real-time*.
    - Tombol *Simpan Perubahan*, *Batal*, dan *Reset Default*.
- **`app/tatakelola/navigasi/page.tsx`**:
  - Halaman rute resmi `/tatakelola/navigasi` di bawah navigasi Tata Kelola.

---

## 3. Berkas yang Diubah / Ditambahkan
- `services/backend-rust/src/master.rs`
- `services/backend-rust/src/main.rs`
- `database/init/075_menu_modul_navigasi.sql`
- `database/rollback/075_rollback.sql`
- `services/frontend-next/lib/menu.ts`
- `services/frontend-next/lib/settings-context.tsx`
- `services/frontend-next/components/tatakelola/NavigasiManager.tsx`
- `services/frontend-next/app/tatakelola/navigasi/page.tsx`
- `docs/PR/068-modul-pengaturan-navigasi-dan-menu-sidebar.md`
- `docs/CHANGE_LOG_MATRIX.md`

---

## 4. Pengujian & Verifikasi
- Migrasi DB 075 dieksekusi sukses di container `skdr-postgres` (tabel cadangan `app_settings_bak_075` aman).
- `npx tsc --noEmit` lulus dengan 0 error.
- Rebuild image `skdr-indonesia-skdr-backend-rust` berhasil via Docker.
- Sinkronisasi file frontend ke container `skdr-frontend-next` via `docker cp`.
- Uji HTTP curl pada rute `/skdr/tatakelola/navigasi` dan `/skdr/api/v1/console/settings`: HTTP 200 OK.
