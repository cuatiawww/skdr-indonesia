# Panduan Desain Sistem & Arsitektur UI SKDR Indonesia
## SATUSEHAT Design System & Reusable Components Guide

> **Dokumen Panduan Standar UI/UX SKDR Indonesia**  
> Dibuat sebagai *single source of truth* (pedoman tunggal) bagi developer, desainer, dan AI agent dalam merancang, memodifikasi, maupun membuat halaman antarmuka baru di lingkungan SKDR Indonesia.

---

## 1. Filosofi & Pedoman Desain

Aplikasi SKDR Indonesia mengadopsi standar visual **SATUSEHAT Design System (v4)** resmi dari **Digital Transformation Office (DTO) Kementerian Kesehatan Republik Indonesia** ([https://satusehat.kemkes.go.id/design-system](https://satusehat.kemkes.go.id/design-system)).

### Prinsip Utama:
1. **Pure White Canvas (`#FFFFFF`)**: Seluruh halaman memiliki dasar kanvas putih bersih. Jangan memakai latar belakang abu-abu tua/gelap yang membuat kartu putih tampak bertabrakan atau kusam.
2. **Keterbacaan & Hierarki Tajam**: Judul modul tegas, deskripsi informatif, dan data disajikan dengan kontras tinggi (WCAG AA/AAA).
3. **Komponen Reusable & Modular**: Hindari membuat komponen UI dari nol (*reinventing the wheel*). Gunakan komponen standar yang sudah disediakan di direktori `components/`.
4. **Konsistensi Layout 2-Grid**: Header halaman selalu menggunakan pembagian proporsional: ~70% kiri untuk Judul & Deskripsi, dan ~30% kanan untuk Tombol Aksi.
5. **Navigasi Terintegrasi**: Tombol kembali (*Back*) berada di samping pill breadcrumb, dan seluruh tingkat breadcrumb aktif dan dapat diklik.

---

## 2. Setup Sistem & Tumpukan Teknologi Frontend

Frontend dibangun dengan spesifikasi modern:
- **Framework**: Next.js 15 (App Router, React 19, TypeScript).
- **Styling**: Tailwind CSS v3 dengan token warna CSS variable dinamis (`globals.css` & `tailwind.config.ts`).
- **Ikon**: Lucide React (`lucide-react`) dengan registri terpusat di `lib/menu.ts`.
- **Notifikasi**: Sonner (`sonner` via `toast.success`, `toast.error`, `toast.info`).
- **Visualisasi Data & Peta**: Recharts, OpenLayers (`ol`), Tiptap Editor.

---

## 3. Tipografi & Font Resmi

### Font: **Manrope**
SKDR Indonesia menggunakan jenis huruf resmi **Manrope** yang dimuat secara lokal (*self-hosted Latin woff2*) di direktori `public/fonts/` untuk performa cepat dan keandalan *offline*:
- `Manrope-Regular.woff2` (400)
- `Manrope-Medium.woff2` (500)
- `Manrope-SemiBold.woff2` (600)
- `Manrope-Bold.woff2` (700)
- `Manrope-ExtraBold.woff2` (800)

Didaftarkan di `services/frontend-next/app/layout.tsx` via `next/font/local` dengan variabel CSS `--font-manrope`.

### Skala & Aturan Hierarki Tipografi:
| Elemen | Kelas Tailwind | Keterangan & Penggunaan |
| :--- | :--- | :--- |
| **Judul Halaman (H1)** | `text-xl sm:text-2xl font-bold tracking-tight text-slate-900` | Digunakan pada judul utama setiap halaman via `PageHeader`. |
| **Sub-judul / Deskripsi** | `text-xs sm:text-sm text-slate-600 leading-relaxed` | Penjelasan ringkas modul/kegunaan form. |
| **Judul Kartu / Seksi (H2)** | `text-sm font-bold text-slate-900` | Judul kartu atau blok formulir/grafik. |
| **Angka Metrik KPI** | `text-2xl sm:text-3xl font-extrabold text-slate-900` | Nilai data ringkasan pada kartu metrik dasbor. |
| **Teks Isi / Tabel (Body)** | `text-xs sm:text-sm text-slate-700` | Teks penjelasan, label formulir, dan data tabel. |
| **Label / Kode / Tag** | `font-mono text-[10px] sm:text-xs text-slate-500` | Nomor laporan, ID teknis, tanggal, atau badge. |

> [!IMPORTANT]
> **Aturan Eyebrow (Teks di Atas Judul)**:  
> **JANGAN** menambahkan teks kecil (*eyebrow/kicker*) di atas judul halaman utama. Sesuai PR 067, judul halaman langsung ditampilkan tegas tanpa teks kecil di atasnya agar tampilan bersih dan profesional.

---

## 4. Palet Warna Resmi SATUSEHAT

Variabel warna didefinisikan di `globals.css` dan dipetakan ke Tailwind via `tailwind.config.ts`. Token kuat juga tersedia di `lib/satusehat-theme.ts`.

### 1. Warna Brand & Aksen Utama
- **Primary Teal (Identitas Kemenkes / SATUSEHAT)**:
  - `bg-primary` / `#0D6B67` (Dark Teal - Brand 700)
  - `hover:bg-primary-dark` / `#094845` (Brand 800)
  - `#16B3AC` (Brand Green 500)
  - `#128F8A` (Brand Strong 600)
  - `bg-primary/10 text-primary` (Latar belakang lembut dengan teks tegas)
- **Accent Blue (Aksi Interaktif & Tautan)**:
  - `text-accent` / `#3899FE` (Blue 500)
  - `#1E81E8` (Blue 600 - Hover)
  - `bg-blue-50 text-blue-700 border-blue-200`
- **Teks Utama**: `#141313` (Neutral Black) & `#334155` (Slate 700).

### 2. Status & Lencana (Badges)
- **Sukses**: `border-emerald-200 bg-emerald-50 text-emerald-700` (Ikon: `CheckCircle2` / `Check`)
- **Peringatan / Draf**: `border-amber-200 bg-amber-50 text-amber-800` (Ikon: `AlertTriangle`)
- **Bahaya / Error / Hapus**: `border-rose-200 bg-rose-50 text-rose-700` (Ikon: `XCircle` / `Trash2`)
- **Info / Area**: `border-sky-200 bg-sky-50 text-sky-700` (Ikon: `Info` / `Compass`)

### 3. Gradien Bar Progres SATUSEHAT (Animasi Halus)
Digunakan pada stepper wizard formulir (PR 066):
```css
.pe-bar {
  background: linear-gradient(90deg, #16B3AC 0%, #128F8A 35%, #3899FE 70%, #16B3AC 100%);
  background-size: 200% 100%;
  animation: peShine 6s linear infinite;
}
```

---

## 5. Standar Ikon & Registri Ikon Navigasi

### Pustaka: **Lucide React** (`lucide-react`)
Semua ikon menggunakan Lucide React untuk konsistensi bentuk garis (*stroke*).

### Standar Ukuran Ikon:
- **Ikon tombol kecil / inline teks**: `h-3.5 w-3.5`
- **Ikon tombol standar / menu**: `h-4 w-4`
- **Ikon kartu metrik / fitur utama**: `h-5 w-5` atau `h-6 w-6`

### Registri Ikon Dinamis:
Pada `services/frontend-next/lib/menu.ts`, terdapat:
- `MENU_ICON_MAP`: Objek pemetaan nama string ikon ke komponen Lucide (misal: `'Hospital'`, `'LayoutDashboard'`, `'Utensils'`, `'Stethoscope'`, `'Bug'`, dll.).
- `resolveMenuIcon(name: string)`: Fungsi aman untuk me-resolve string ikon dengan fallback ke ikon `Circle`.

---

## 6. Standar Page Header & Breadcrumbs

### A. Komponen `PageHeader` (Layout 2-Grid ~70% / ~30%)
Lokasi: [`services/frontend-next/components/PageHeader.tsx`](file:///c:/laragon/www/skdr-indonesia/services/frontend-next/components/PageHeader.tsx)

```tsx
import PageHeader from '@/components/PageHeader'
import { Plus, RefreshCw } from 'lucide-react'

<PageHeader
  title="Nama Modul Halaman"
  subtitle="Deskripsi lengkap tentang kegunaan modul, aturan pengisian, atau sumber data analitik yang ditampilkan."
  meta={
    <div className="flex items-center gap-2">
      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700">
        Status Aktif
      </span>
    </div>
  }
  actions={
    <>
      <button className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs">
        <RefreshCw className="h-3.5 w-3.5" /> Muat Ulang
      </button>
      <button className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-xs hover:bg-primary-dark">
        <Plus className="h-3.5 w-3.5 stroke-[2.5]" /> Entri Data
      </button>
    </>
  }
/>
```

**Karakteristik Grid**:
- **Kolom Kiri (`lg:col-span-8`)**: Judul, Deskripsi, dan slot `meta` (lencana/tag).
- **Kolom Kanan (`lg:col-span-4 lg:justify-end shrink-0`)**: Deretan tombol aksi yang tersusun rapi ke kanan tanpa risiko tumpang tindih (*overlap*) atau *horizontal overflow*.

### B. Breadcrumbs & Tombol Kembali
Lokasi: [`services/frontend-next/components/layout/Breadcrumbs.tsx`](file:///c:/laragon/www/skdr-indonesia/services/frontend-next/components/layout/Breadcrumbs.tsx)
- Breadcrumbs secara otomatis terpasang di atas setiap halaman melalui `AppShell`.
- Memiliki tombol **[ <- Kembali ]** di sisi kiri kontainer breadcrumb pill.
- Semua level breadcrumb (`Beranda › Grup › Menu › Sub-menu › Detail`) aktif dan dapat diklik untuk navigasi mundur.
- **PENTING**: Halaman tidak perlu membuat tombol panah kembali kotak sendiri secara manual di samping judul!

---

## 7. Katalog Komponen Reusable

Berikut adalah daftar komponen inti yang siap pakai:

| Komponen | Berkas Path | Fungsi & Contoh Penggunaan |
| :--- | :--- | :--- |
| **`PageHeader`** | `components/PageHeader.tsx` | Header standar 2-grid untuk semua halaman. |
| **`Breadcrumbs`** | `components/layout/Breadcrumbs.tsx` | Navigasi hierarki otomatis dengan tombol Back terintegrasi. |
| **`Modal`** | `components/Modal.tsx` | Dialog modal pop-up responsif dengan animasi dan backdrop blur. |
| **`MasterUi`** | `components/master/MasterUi.tsx` | Helper form standar: `inputCls`, `Field`, `FormActions`, `MasterToolbar`, `TableState`. |
| **`Skeleton`** | `components/ui/Skeleton.tsx` | Efek loading skeleton: `SkeletonTable`, `SkeletonDetail`, `SkeletonCard`. |
| **`Satusehat`** | `components/ui/Satusehat.tsx` | Komponen resmi TTDK: `TtdkButton`, `TtdkBadge`, `TtdkChip`, `TtdkCard`, `TtdkAlert`. |
| **`NavigasiManager`** | `components/tatakelola/NavigasiManager.tsx` | Manajer navigasi sidebar dinamis (tersedia di `/tatakelola/navigasi`). |

### Standar Styling Kartu & Input:
- **Kartu Utama**: `rounded-2xl border border-slate-200 bg-white p-5 shadow-xs`
- **Kartu Sekunder**: `rounded-xl border border-slate-200/80 bg-slate-50/50 p-4`
- **Input Text / Select**:  
  `w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-2xs outline-none focus:border-primary focus:ring-1 focus:ring-primary`
- **Tombol Utama (Primary)**:  
  `inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-xs hover:bg-primary-dark transition`
- **Tombol Sekunder (Outline)**:  
  `inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition`

---

## 8. Panduan Langkah Demi Langkah: Membuat Halaman Baru

Gunakan template kode di bawah ini saat diminta membuat halaman baru:

```tsx
'use client'

import { useState } from 'react'
import { Plus, RefreshCw, Eye, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '@/components/PageHeader'
import Modal from '@/components/Modal'
import { inputCls } from '@/components/master/MasterUi'

export default function ModulBaruPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleRefresh = () => {
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      toast.success('Data berhasil dimuat ulang')
    }, 500)
  }

  return (
    <div className="w-full space-y-6 bg-page px-4 py-6 sm:px-6 lg:px-8">
      {/* 1. Page Header (Standard 2-Grid ~70/30%) */}
      <PageHeader
        title="Nama Modul Baru"
        subtitle="Penjelasan mengenai fitur atau transaksi yang dilakukan di halaman ini secara lugas dan informatif."
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
            Terverifikasi
          </span>
        }
        actions={
          <>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat Ulang
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-xs hover:bg-primary-dark"
            >
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" /> Tambah Data
            </button>
          </>
        }
      />

      {/* 2. Ringkasan Kartu KPI (Opsional) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500">Total Transaksi</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">1.250</p>
        </div>
      </div>

      {/* 3. Kontainer Konten Utama (Tabel / Form) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <h2 className="text-sm font-bold text-slate-900 mb-4">Daftar Rekapitulasi</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase">
                <th className="py-2.5 px-3">No</th>
                <th className="py-2.5 px-3">Nama</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-2.5 px-3 font-mono">01</td>
                <td className="py-2.5 px-3 font-semibold text-slate-800">Contoh Data</td>
                <td className="py-2.5 px-3">
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    Selesai
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right">
                  <button className="p-1 text-slate-500 hover:text-primary">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Modal Pop-up Interaktif */}
      <Modal open={modalOpen} title="Tambah Data Baru" onClose={() => setModalOpen(false)}>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Nama Isian</label>
            <input type="text" placeholder="Masukkan nama..." className={inputCls} />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              onClick={() => setModalOpen(false)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              onClick={() => {
                setModalOpen(false)
                toast.success('Data berhasil disimpan!')
              }}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-dark"
            >
              Simpan
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
```

### Cara Mendaftarkan Menu Baru ke Sidebar:
1. **Cara Visual (Rekomendasi)**: Buka halaman **Tata Kelola › Modul & Navigasi** (`/tatakelola/navigasi`). Tambahkan menu baru ke grup yang diinginkan, pilih ikon dari icon picker, isi rute, lalu klik **Simpan Perubahan**.
2. **Cara Kode**: Buka `services/frontend-next/lib/menu.ts`, tambahkan item ke grup terkait di `DEFAULT_NAVIGATION_CONFIG`.

---

## 9. Aturan Baku (*Do's & Don'ts*) untuk Developer & AI Agent

### DO (Wajib Dilakukan):
- Gunakan `<PageHeader>` untuk header halaman baru dengan 2-grid format.
- Manfaatkan tombol Back di Breadcrumbs, jangan buat tombol panah kembali lokal di sebelah judul.
- Pertahankan sudut membulat elegan (`rounded-2xl` untuk kontainer luar, `rounded-xl` untuk tombol/input).
- Gunakan `sonner` untuk pesan toast hasil aksi (`toast.success`, `toast.error`).
- Buat tipe TypeScript yang lengkap untuk props dan *state*.
- Dokumentasikan setiap perubahan di `docs/CHANGE_LOG_MATRIX.md` dan buat berkas di `docs/PR/`.

### DON'T (Dilarang Keras):
- **JANGAN** mengubah warna dasar kanvas dari putih murni (`#FFFFFF`) ke abu-abu atau warna gelap yang menabrak kartu.
- **JANGAN** memodifikasi atau meng-override ukuran, padding, atau margin kartu yang sudah ada bila pengguna hanya meminta penyesuaian warna/font.
- **JANGAN** memasang teks *eyebrow* kecil di atas judul modul.
- **JANGAN** menggunakan *web scraping*, crawling, atau NLP di proyek ini (data murni berasal dari form pelaporan kasus fasyankes & API SKDR).
- **JANGAN** meng-hardcode rahasia atau konfigurasi lingkungan (gunakan `.env` dan tabel `app_settings`).
