# PR 045 — Perbarui Background Login SKDR dengan Ilustrasi Resmi

Tanggal: 11 Nov 2026 (WIB). Branch: `main`.

## Ringkasan
Memperbarui gambar latar belakang (*background*) pada panel hero halaman login SKDR (`/login`) dengan aset ilustrasi resmi bertema surveilans dan respon KLB puskesmas Indonesia (`bg login skdr.webp`). Sebelumnya halaman login masih menggunakan `home.jpg` (foto lorong fasyankes umum) dengan filter monokrom teal pekat (`opacity-30 mix-blend-luminosity`).

## Perubahan
1. **Aset Gambar**:
   - Menempatkan berkas ilustrasi `bg login skdr.webp` ke dalam direktori aset `services/frontend-next/public/images/bg login skdr.webp` (serta alias `bg-login-skdr.webp` di `public/images/` dan `public/`).
2. **Halaman Login (`services/frontend-next/app/login/page.tsx`)**:
   - Mendefinisikan `loginBg` mengarah ke `${PUBLIC_BASE_PATH}/images/bg%20login%20skdr.webp`.
   - Mengganti latar belakang hero panel dari `home.jpg` menjadi `loginBg` dengan posisi `bg-cover bg-center`.
   - Menghapus seluruh filter, `mix-blend-luminosity`, dan overlay gradien/opacity sehingga ilustrasi tampil murni 100% tanpa ditimpa lapisan apa pun.
   - Mengosongkan konten penutup pada hero panel agar karya ilustrasi Puskesmas, ambulans, dan tim surveilans terlihat utuh dan bersih.
