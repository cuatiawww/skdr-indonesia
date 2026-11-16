# PR 074: Switcher Kategori Dasbor (Kinerja, IBS, EBS, MBG, Zoonosis) pada Rute /menu

Tanggal: 16 November 2026  
Status: Selesai & Terverifikasi  
Tipe: Frontend / Navigation & UI

---

## 1. Latar Belakang & Kebutuhan

Sesuai permintaan pengguna:
- Pada route path `/menu` ketika navigasi/sidebar aktif berada pada item `DASHBOARD`:
  - Tombol switcher header `[ DASBOR ] [ TATA KELOLA ]` diganti menjadi 5 kategori dasbor:
    1. **Kinerja**
    2. **IBS**
    3. **EBS**
    4. **MBG**
    5. **Zoonosis**
- Pada route path lainnya (`/dashboard`, `/tatakelola`, `/beranda`, dll.), switcher `[ DASBOR ] [ TATA KELOLA ]` tetap asli tanpa perubahan (zero regression).
- Jika ada perubahan pada git, lakukan `git pull` terlebih dahulu sebelum implementasi, lalu lakukan `git push`.

---

## 2. Perubahan Implementasi

### A. Switcher Header Kategori Dasbor (`UserMenu.tsx`)
- Komponen `AreaSwitch` pada [UserMenu.tsx](file:///d:/laragon_new/www/Dashboard-SKDR/services/frontend-next/components/layout/UserMenu.tsx) diperbarui:
  - Mendeteksi rute `isMenu = pathname === '/menu' || pathname.startsWith('/menu/')`.
  - Jika berada di `/menu`, merender navigasi tab ber-pill dengan 5 tombol kategori resmi:
    - `<Activity /> Kinerja` (`/menu?tab=kinerja`)
    - `<TrendingUp /> IBS` (`/menu?tab=ibs`)
    - `<Radio /> EBS` (`/menu?tab=ebs`)
    - `<Utensils /> MBG` (`/menu?tab=mbg`)
    - `<Bug /> Zoonosis` (`/menu?tab=zoonosis`)
  - Tombol aktif ditandai secara visual dengan `bg-primary text-white shadow-sm`.
  - Pada rute selain `/menu`, switcher tetap merender `[ DASBOR ] [ TATA KELOLA ]` sesuai otentikasi peran pengguna.

### B. Halaman Tampilan Kategori `/menu` (`app/menu/page.tsx`)
- [app/menu/page.tsx](file:///d:/laragon_new/www/Dashboard-SKDR/services/frontend-next/app/menu/page.tsx) diperbarui untuk menyajikan konten dinamis berbasis 5 kategori dasbor yang dipilih:
  1. **Kinerja**: Sintesis surveilans nasional, WHO 7-1-7 & kinerja EBS, Deteksi Outbreak & Iklim, Buletin & Infografis, Ringkasan Dasbor, dan Mode TV Komando.
  2. **IBS**: Tren Penyakit (IBS), Distribusi & Demografi, Ringkasan Utama, Dasbor SKDR EBS & IBS, Matriks Analisa, dan Spasial Kasus IBS.
  3. **EBS**: Ringkasan Utama, WHO 7-1-7, Deteksi Outbreak, Dasbor SKDR EBS & IBS, Laporan Rumor EBS, dan Spasial Sinyal EBS.
  4. **MBG**: Ringkasan Eksekutif MBG, Analisa Keracunan Pangan, Audit Pengawasan Gizi, Peta Spasial MBG, Pengawasan Gizi SPPG, dan Laporan Kejadian Keracunan.
  5. **Zoonosis**: Zoonosis General, Zoonosis Lite, PD3I, Tular Vektor & Zoonotik, Menular Langsung, Tular Makanan & Air, PIE, dan Profil Penyakit.
- Dilengkapi pill bar sekunder di dalam kanvas halaman untuk kemudahan peralihan tab di layar desktop maupun perangkat seluler.

---

## 3. Berkas yang Diubah

1. `services/frontend-next/components/layout/UserMenu.tsx` (Penyelarasan switcher `AreaSwitch` 5 kategori saat rute `/menu`).
2. `services/frontend-next/app/menu/page.tsx` (Tampilan grid modul dinamis sesuai 5 kategori tab).
3. `docs/CHANGE_LOG_MATRIX.md` (Pencatatan PR 074).
4. `docs/PR/074-switcher-kategori-dasbor-pada-menu.md` (Dokumentasi PR 074).

---

## 4. Hasil Pengujian & Verifikasi

1. **Sinkronisasi Git Awal (`git pull`)**:
   - `git pull origin main` dijalankan sebelum perubahan kode (status: `Already up to date`).
2. **Typecheck TypeScript**:
   - `npm run typecheck` (`tsc --noEmit`) pada container frontend berjalan sukses dengan **0 errors**.
3. **Uji Render HTTP & Validasi Elemen**:
   - `GET /skdr/menu`: Berstatus **200 OK**, elemen `data-testid="menu-tab-switch"` aktif menampilkan kelima tab (`Kinerja`, `IBS`, `EBS`, `MBG`, `Zoonosis`).
   - `GET /skdr/dashboard`: Berstatus **200 OK**, mempertahankan `[ DASBOR ] [ TATA KELOLA ]` asli tanpa kemunculan `menu-tab-switch` (**zero regression**).
