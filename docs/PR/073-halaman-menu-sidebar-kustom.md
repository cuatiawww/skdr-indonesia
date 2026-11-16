# PR 073: Halaman Baru /menu dengan Sidebar Kustom Terstruktur & Preservasi Utuh /dashboard

Tanggal: 16 November 2026  
Status: Selesai & Terverifikasi  
Tipe: Frontend / Navigation

---

## 1. Latar Belakang & Kebutuhan

Sesuai permintaan pengguna:
1. Melakukan `git pull` sebelum implementasi (berhasil disinkronkan hingga commit `e5b2d6c` / PR 072).
2. Membuat halaman baru pada route path `/menu` yang dasarnya meng-copy tampilan dari route path `/dashboard`.
3. Memastikan tidak ada perubahan sama sekali pada `/dashboard` (zero regression, `app/dashboard/page.tsx` dan sidebar `/dashboard` tetap asli).
4. Perbedaan pada `/menu` hanyalah pada Sidebar yang menampilkan daftar hierarki kustom:
   - **DASHBOARD**
   - **KONFIGURASI**
     - **WILAYAH**
     - **PARAMETER**
       -- **EBS**
       -- **IBS**
       -- **TGC**
   - **SKDR EBS**
   - **SKDR IBS**
   - **TGC**
   - **PROGRAM MBG**
   - **WA GATEWAY**
   - **SKRINING SKDR**
   - **INTEGRASI**
   - **BULETIN SKDR**
   - **INFOGRAFIS**
   - **BANTUAN**
     -- **KONTAK**
     -- **PETUNJUK PENGGUNAAN**
   - **SITUASI KHUSUS SKDR**
   - **MEDIA MONITORING**
5. Melakukan commit dan `git push` ke repositori remote.

---

## 2. Perubahan Implementasi

### A. Komponen Sidebar Kustom `/menu` (`MenuSidebar.tsx`)
- Dibuat komponen `services/frontend-next/components/layout/MenuSidebar.tsx` khusus untuk rute `/menu`.
- Mengimplementasikan seluruh 20 item navigasi bertingkat persis sesuai spesifikasi pengguna:
  - Level 1 Top Items: `DASHBOARD`, `SKDR EBS`, `SKDR IBS`, `TGC`, `PROGRAM MBG`, `WA GATEWAY`, `SKRINING SKDR`, `INTEGRASI`, `BULETIN SKDR`, `INFOGRAFIS`, `SITUASI KHUSUS SKDR`, `MEDIA MONITORING`.
  - Nested Folders / Accordions:
    - `KONFIGURASI` (akordion level 1) membawahi `WILAYAH` dan `PARAMETER` (akordion level 2) yang membawahi `EBS`, `IBS`, dan `TGC` (level 3).
    - `BANTUAN` membawahi `KONTAK` dan `PETUNJUK PENGGUNAAN`.
- Fitur navigasi:
  - Desktop expanded mode (`w-[280px]`) & mobile slide-in drawer mode.
  - Desktop rail mode (`lg:w-[72px]`) collapsible dengan flyout popover interaktif untuk item ber-anak menu dan hover tooltip.
  - Active state visual indicator (`bg-primary/10 text-primary font-bold`).
  - Kemenkes branding header terpadu (logo resmi, judul & tagline aplikasi).

### B. Halaman `/menu` (`app/menu/page.tsx`)
- Meng-copy struktur tampilan landing dasbor dari `app/dashboard/page.tsx` menggunakan `<AreaHub area="dashboard" selfHref="/menu" />`.
- `app/dashboard/page.tsx` dipertahankan utuh 100% tanpa perubahan satu karakter pun.

### C. Pengaturan Akses & Layout (`lib/access.ts` & `AppShell.tsx`)
- `services/frontend-next/lib/access.ts`: Menambahkan `/menu` ke dalam `DASHBOARD_PREFIXES` sehingga memiliki `routeArea = 'dashboard'` dan dilindungi otentikasi `Need::Login` seperti halnya `/dashboard`.
- `services/frontend-next/components/layout/AppShell.tsx`:
  - Mendeteksi `isMenu = pathname === "/menu" || pathname?.startsWith("/menu/")`.
  - Merender `MenuSidebar` jika berada pada rute `/menu`, dan tetap merender `DashboardSidebar` bawaan pada seluruh rute dasbor lainnya.

---

## 3. Berkas yang Diubah / Dibuat

1. `services/frontend-next/app/menu/page.tsx` (Baru: halaman landing `/menu`).
2. `services/frontend-next/components/layout/MenuSidebar.tsx` (Baru: sidebar khusus `/menu` dengan 20 item hierarki).
3. `services/frontend-next/components/layout/AppShell.tsx` (Integrasi kondisional `MenuSidebar` saat rute `/menu`).
4. `services/frontend-next/lib/access.ts` (Pendaftaran rute `/menu` ke `DASHBOARD_PREFIXES`).
5. `docs/CHANGE_LOG_MATRIX.md` (Pencatatan PR 073).
6. `docs/PR/073-halaman-menu-sidebar-kustom.md` (Dokumen dokumentasi PR 073).

---

## 4. Hasil Pengujian & Verifikasi

1. **Typecheck TypeScript**:
   - `npm run typecheck` (`tsc --noEmit`) pada container frontend berjalan dengan status **0 errors** (lulus sempurna).
2. **Uji Render Halaman `/skdr/menu`**:
   - Status HTTP: `200 OK` (panjang HTML ~56.5 KB).
   - Elemen `data-testid="nav-menu-sidebar"` terdeteksi aktif.
   - Seluruh 20 item navigasi yang diminta (`DASHBOARD`, `KONFIGURASI`, `WILAYAH`, `PARAMETER`, `EBS`, `IBS`, `TGC`, `SKDR EBS`, `SKDR IBS`, `PROGRAM MBG`, `WA GATEWAY`, `SKRINING SKDR`, `INTEGRASI`, `BULETIN SKDR`, `INFOGRAFIS`, `BANTUAN`, `KONTAK`, `PETUNJUK PENGGUNAAN`, `SITUASI KHUSUS SKDR`, `MEDIA MONITORING`) terbukti tampil utuh pada HTML.
3. **Preservasi Halaman `/skdr/dashboard`**:
   - Status HTTP: `200 OK`.
   - Menggunakan `data-testid="nav-sidebar"` (sidebar asli `DashboardSidebar`).
   - Tidak ada elemen `nav-menu-sidebar` pada `/dashboard`.
   - Terverifikasi **zero regression** pada `/dashboard`.
