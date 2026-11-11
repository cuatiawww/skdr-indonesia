# PR 053 — Penyelarasan Peta Dasbor MBG dengan Gaya Spasial & Dasbor SKDR (Tanpa Carto)

## Ringkasan Perubahan
Mengganti *basemap* Carto (`basemaps.cartocdn.com`) dan tata letak lama pada peta **Dasbor MBG** (`/dasbor/mbg` dan `/dashboard/mbg/{ringkasan,keracunan,pengawasan}`) agar menggunakan *tile proxy* internal (`${PUBLIC_BASE_PATH}/osm-tiles/{z}/{x}/{y}.png`) serta arsitektur kontrol dan visualisasi yang identik dengan halaman **Spasial (`/dashboard/spasial`)** dan **Dasbor SKDR (`/main-dashboard`)**.

## Detail Perubahan
1. **Penghapusan Tile Carto & Penyelarasan Basemap (`EbsIbsLayerMap.tsx` & `AseanMap.tsx`)**:
   - Menghapus ketergantungan pada `https://{a-d}.basemaps.cartocdn.com/{light_all,dark_all}/{z}/{x}/{y}.png`.
   - Menggunakan *tile proxy* internal `new OSM({ url: \`\${PUBLIC_BASE_PATH}/osm-tiles/{z}/{x}/{y}.png\`, crossOrigin: 'anonymous' })` dengan 4 mode peta dasar seperti `SpasialMap.tsx`:
     - **`Terang` (`light`)**: OSM *tile proxy* dengan filter CSS `.spasial-base canvas { filter: grayscale(1) brightness(1.08) contrast(0.88) }`.
     - **`OSM` (`osm`)**: OSM *tile proxy* berwarna penuh.
     - **`Satelit` (`satellite`)**: Citra satelit Esri World Imagery.
     - **`Polos` (`none`)**: Tanpa lapisan ubin dasar (hanya batas poligon wilayah).
2. **Penyelarasan Antarmuka Peta dengan `SpasialMap.tsx`**:
   - **Floating Top-Center Toolbar**: Tombol `Kembali` (saat *drill-down* Kab/Kota), *breadcrumb* wilayah + jumlah titik/wilayah, tombol `Lapisan`, tombol `Legenda`, tombol `Tampilkan seluruh wilayah` (*fit extent*), dan tombol `Layar penuh`.
   - **Floating Layer Switcher Popover (`Lapisan peta`)**: Pilihan peta dasar (`Terang | OSM | Satelit | Polos`), *toggle* & transparansi *Choropleth*, dropdown indikator warna wilayah, mode titik lokasi/SPPG (`Kluster | Titik | Sembunyi` menggunakan `ol/source/Cluster`), serta *toggle* & pengaturan *Heatmap spasial*.
   - **Floating Collapsible Legend (`Legenda`)**: Legenda kelas warna wilayah (`#e5e7eb` untuk 0/tanpa data), legenda titik/kluster, dan *heatmap* di pojok kiri bawah yang dapat dilipat atau ditutup.
   - **Auto-Fit Extent & Drill-Down Kabupaten/Kota**: Otomatis menyesuaikan *bounding box* (`view.fit`) ke seluruh Indonesia atau ke provinsi terpilih, dilengkapi `ResizeObserver` serta pemuatan seluruh poligon Kabupaten/Kota dalam provinsi yang dipilih (`/wilayah-data?level=kabupaten` + *fallback* `indonesia-kabupaten.geojson`).
   - **Click Popup (`ol/Overlay`) & Cursor Hover Pill**: Menampilkan *tooltip* ringkas mengikuti kursor dan *popup* interaktif saat wilayah, titik SPPG, atau kluster diklik (termasuk tombol **"Perbesar ke kab/kota provinsi ini"**).
3. **Selalu Menampilkan Kanvas Peta pada Dasbor MBG (`MbgSections.tsx` & `MbgRingkasan.tsx`)**:
   - Memastikan kedua peta (**Peta Keracunan Pangan MBG** & **Peta Pengawasan Gizi MBG**) selalu dirender meskipun jumlah kejadian/kunjungan pada filter aktif bernilai `0`, konsisten dengan perilaku halaman Spasial dan Dasbor SKDR.

## File yang Diubah
- `services/frontend-next/components/dasbor-ebs-ibs/EbsIbsLayerMap.tsx`
- `services/frontend-next/components/dasbor-mbg/MbgSections.tsx`
- `services/frontend-next/components/dasbor-mbg/MbgRingkasan.tsx`
- `services/frontend-next/components/AseanMap.tsx`
- `docs/PR/053-penyelarasan-peta-dasbor-mbg-ke-spasial-osm.md`
- `docs/CHANGE_LOG_MATRIX.md`

## Verifikasi
- `npx tsc --noEmit` внутри `skdr-frontend-next`: **0 error**.
- Pemeriksaan seluruh referensi `cartocdn` pada komponen peta: tidak ada lagi pemanggilan tile Carto pada `EbsIbsLayerMap.tsx` maupun `AseanMap.tsx`.
