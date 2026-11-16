# PR 076: Penghapusan Daftar Modul Kinerja pada /menu & Penegasan Redirect Login ke /dashboard

Tanggal: 16 November 2026  
Status: Selesai & Terverifikasi  
Tipe: Frontend / Navigation & Auth

---

## 1. Latar Belakang & Kebutuhan

Sesuai permintaan pengguna:
1. **Daftar Modul Kinerja pada Dashboard `/menu` dihapus**:
   - Pada halaman `/menu` ketika active tab adalah **Kinerja**, seksi `DAFTAR MODUL KINERJA` (grid kartu tautan modul yang sebelumnya berada di bawah diagram) dihapus. Tampilan tab Kinerja kini sepenuhnya terfokus pada visualisasi analitik eksekutif (Toolbar filter minggu, 6 KPI Cards, dan 4 Redesigned Charts).
   - Tab lainnya (`IBS`, `EBS`, `MBG`, `Zoonosis`) tetap menyajikan daftar modul masing-masing untuk navigasi kontekstual.
2. **Redirect Pasca-Login Tetap ke `/dashboard`**:
   - Dipastikan seluruh alur autentikasi dan login masuk secara langsung (*direct*) ke `/dashboard`, dan tidak pernah diarahkan ke `/menu`.
3. Setelah selesai, lakukan `git push`.

---

## 2. Perubahan Implementasi

### A. Halaman Kategori `/menu` (`app/menu/page.tsx`)
- Pada [app/menu/page.tsx](file:///d:/laragon_new/www/Dashboard-SKDR/services/frontend-next/app/menu/page.tsx):
  - Bagian grid modul (`<section className="space-y-3"> DAFTAR MODUL ... </section>`) dikondisikan hanya muncul untuk kategori selain Kinerja (`activeTab !== 'kinerja'`).
  - Ketika tab aktif adalah `kinerja`, hanya komponen `<KinerjaView />` (KPI Cards + 4 Charts) yang dirender tanpa duplikasi daftar kartu modul di bawahnya.

### B. Pengamanan Alur Redirect Login (`lib/access.ts` & `components/layout/UserMenu.tsx`)
- Pada [lib/access.ts](file:///d:/laragon_new/www/Dashboard-SKDR/services/frontend-next/lib/access.ts) fungsi `safeRedirect`:
  - Ditambahkan proteksi guard: jika parameter tujuan redirect adalah `/menu` atau berawalan `/menu/`, `safeRedirect` akan otomatis menggantinya kembali ke nilai *fallback* baku yaitu `/dashboard`.
  - Hal ini menjamin bahwa meskipun terdapat parameter URL `?redirect=/menu`, alur login tidak akan mengarahkan pengguna ke `/menu`, melainkan tetap langsung ke `/dashboard`.
- Pada [UserMenu.tsx](file:///d:/laragon_new/www/Dashboard-SKDR/services/frontend-next/components/layout/UserMenu.tsx):
  - Tombol masuk (*sign in*) saat berada di halaman `/menu` tidak menyematkan query param `redirect=/menu`, melainkan mengarahkan ke `/login` polos yang secara *default* akan menuju `/dashboard` saat berhasil login.

---

## 3. Berkas yang Diubah

1. `services/frontend-next/app/menu/page.tsx` (Penghapusan seksi `DAFTAR MODUL KINERJA` saat active tab `kinerja`).
2. `services/frontend-next/lib/access.ts` (Guard `safeRedirect` memblokir redirect pasca-login ke `/menu` dan mengembalikannya ke `/dashboard`).
3. `services/frontend-next/components/layout/UserMenu.tsx` (Pembersihan parameter redirect login saat berada di rute `/menu`).
4. `docs/CHANGE_LOG_MATRIX.md` (Pencatatan PR 076).
5. `docs/PR/076-hapus-daftar-modul-kinerja-dan-redirect-login-dashboard.md` (Dokumentasi PR 076 ini).

---

## 4. Hasil Pengujian & Verifikasi

1. **TypeScript Typecheck**:
   - `docker exec skdr-frontend-next npm run typecheck` (`tsc --noEmit`) -> 0 error.
2. **Verifikasi Tampilan Tab Kinerja**:
   - Rute `/menu?tab=kinerja` hanya menampilkan `KinerjaView` (6 KPI Cards + 4 Charts) yang bersih dan rapi tanpa adanya elemen `DAFTAR MODUL KINERJA`.
   - Tab lain (`/menu?tab=ibs`, `ebs`, `mbg`, `zoonosis`) tetap menampilkan daftar kartu modul masing-masing.
3. **Verifikasi Redirect Login**:
   - Fungsi `safeRedirect('/menu')` mengembalikan `/dashboard`.
   - Fungsi `safeRedirect('/menu?tab=kinerja')` mengembalikan `/dashboard`.
   - Login dari modal maupun `/login` tetap masuk ke `/dashboard`.
