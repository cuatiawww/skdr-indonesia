# PR 069: Dokumen Panduan Standar Desain Sistem UI, Tipografi & Komponen Reusable SKDR Indonesia

**Nomor PR**: 069  
**Tanggal**: 12 November 2026  
**Penulis**: Antigravity  
**Kategori**: Dokumentasi & UI/UX Standards  
**Status**: Selesai  

---

## 1. Konteks & Latar Belakang
Untuk memastikan konsistensi visual, kejelasan arsitektur, dan kemudahan bagi pengembang maupun AI agent dalam merancang halaman atau modul baru, dibuat satu dokumen panduan tunggal (*single source of truth*) yang merangkum seluruh standar desain sistem, font, warna, pustaka ikon, serta katalog komponen reusable di lingkungan SKDR Indonesia.

---

## 2. Rincian Dokumen (`docs/UI_DESIGN_SYSTEM_GUIDE.md`)
Dokumen mencakup:
1. **Filosofi & Pedoman Desain**: Standar resmi SATUSEHAT Design System v4 DTO Kemenkes RI, kanvas putih murni (*Pure White* `#FFFFFF`), dan hierarki kontras tinggi.
2. **Setup Sistem & Teknologi Frontend**: Next.js 15 App Router, React 19, Tailwind CSS v3, CSS variables runtime, dan TypeScript.
3. **Tipografi & Font Resmi**: Standar font **Manrope** lokal (*offline Latin woff2 400–800*), skala ukuran, dan aturan larangan *eyebrow* di atas judul.
4. **Palet Warna Resmi**: Primary Teal (`#16B3AC` / `#0D6B67`), Accent Blue (`#3899FE`), status badges (Emerald, Amber, Rose, Sky), serta gradien SATUSEHAT (`.pe-bar`).
5. **Standar Ikon**: Pustaka Lucide React (`lucide-react`), ukuran standar (`h-3.5`, `h-4`, `h-5`), serta registri ikon `MENU_ICON_MAP` dan `resolveMenuIcon(name)`.
6. **Standar Page Header & Breadcrumbs**: Tata letak responsif 2-Grid (~70% judul & deskripsi di kiri, ~30% tombol aksi di kanan anti-overflow), serta tombol Back terintegrasi di Breadcrumbs.
7. **Katalog Komponen Reusable**: `PageHeader`, `Breadcrumbs`, `Modal`, `MasterUi` (`inputCls`, `Field`, `FormActions`), `Skeleton`, `Satusehat` TTDK components, dan modul `NavigasiManager`.
8. **Template Kode Halaman Baru**: Contoh boilerplate kode lengkap siap pakai untuk membuat halaman baru dengan standar SATUSEHAT.
9. **Aturan Baku (Do's & Don'ts)**: Checklist wajib bagi developer dan AI agent.

---

## 3. Berkas yang Diubah / Ditambahkan
- `docs/UI_DESIGN_SYSTEM_GUIDE.md` (Dokumen panduan komprehensif)
- `docs/PR/069-panduan-desain-sistem-ui-komponen-reusable.md`
- `docs/CHANGE_LOG_MATRIX.md`

---

## 4. Pengujian & Verifikasi
- Struktur Markdown terverifikasi rapi dan mematuhi GitHub Flavored Markdown (GFM).
- Kode contoh diuji dan selaras dengan tumpukan teknologi Next.js 15, Tailwind, dan Lucide React terkini.
