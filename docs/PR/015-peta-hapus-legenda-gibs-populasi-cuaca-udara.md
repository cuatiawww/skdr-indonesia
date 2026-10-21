# PR 015 — Peta dasbor: hapus legenda intensitas, lapisan NASA GIBS, populasi, cuaca, dan kualitas udara

## Tujuan
Peta Sinyal Surveilans di dasbor utama hanya menampilkan lapisan yang dipakai SKDR. Legenda dan lapisan yang tidak relevan dihapus sepenuhnya dari kode, bukan sekadar disembunyikan.

## Perubahan
- `components/AseanMap.tsx`:
  - Panel legenda **Intensitas Kasus & Kematian** dihapus (gradasi Koroplet Rendah/Sedang/Pekat, penanda IBS (resmi) / Nasional (titik tengah negara), teks penjelas), beserta prop `hideLegend`, state `legendOpen`, dan `overlayActive`.
  - Seluruh lapisan tile NASA GIBS dihapus (VIIRS Warna Asli, MODIS Terra Warna Asli, Indeks Aerosol, Indeks Vegetasi NDVI, Cahaya Malam Hari, Suhu Permukaan Darat) serta lapisan kepadatan GPWv4.
  - Lapisan **Denominator Populasi** (metadata WorldPop + kartu GeoTIFF) dihapus.
  - Lapisan penanda ibu kota **Cuaca Ibu Kota** dan **Kualitas Udara Ibu Kota** (Open-Meteo / CAMS AQI) dihapus, termasuk popup `environment` di `IntelPopup`.
- `components/SpatialOutbreakMap.tsx`: grup **Observasi Bumi Satelit (NASA GIBS)** dan tiga baris lapisan (Populasi, Cuaca, Kualitas Udara) dihapus dari panel Pengaturan Peta & Lapisan; state `gibs` dan ikon yang tidak dipakai dihapus.
- `lib/api.ts`: `fetchWorldPopMeta` dan `fetchMapEnvironment` dihapus (tidak ada pemanggil lain).
- `lib/map-layer-client.mjs`: TTL `population` dan `environment` dihapus.
- `types/index.ts`: tipe `WorldPopMeta`, `NasaGibsLayers`, `EnvironmentMarker`, `MapEnvironmentResponse` dan field `population`/`weather`/`airQuality` di `ExternalIntelLayers` dihapus.
- Locale `id` dan `en`: 38 key yang tidak lagi dipakai dihapus (`skdr.map.*` GIBS/populasi/cuaca/udara/`choropleth`, `skdr.amap.*` WorldPop/Open-Meteo/AQI/legenda).
- `next.config.mjs`: host `gibs.earthdata.nasa.gov`, `*.earthdata.nasa.gov`, `api.open-meteo.com`, `air-quality-api.open-meteo.com` dihapus dari CSP.

Yang tetap: penanda sinyal, batas administrasi, peta kepadatan kasus (koroplet), aliran angin, rute penerbangan, titik api NASA FIRMS, satwa liar GBIF, dan seluruh lapisan BNPB InaRISK (termasuk Kepadatan Penduduk BNPB).

## Migrasi
Tidak ada. Konfigurasi lapisan ini ada di kode frontend, tidak di-seed dari DB.

## Uji
- `tsc --noEmit` exit 0 (di container `skdr-frontend-next`).
- ESLint belum dikonfigurasi di repo (`next lint` meminta setup interaktif), jadi tidak dijalankan.
- `/skdr/main-dashboard` mengembalikan 200 dari dev server (hot reload).
- Playwright 1440×900: semua teks target tidak ada di DOM halaman maupun panel pengaturan; grup BNPB InaRISK masih ada; 0 console error.

## Sisa
- Endpoint backend `/api/v1/map-layers/population` dan `/api/v1/map-layers/environment` masih ada di backend-rust tetapi tidak lagi dipanggil frontend.

## Deploy
1. Pull, lalu rebuild/restart frontend.
2. Backend dan DB tidak berubah.
