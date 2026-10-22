# PR 020 — Integrasi API Lapisan Peta & Halaman Sinkronisasi (BNPB, Flight Connect, NASA FIRMS, Satwa Liar GBIF)

Status: **belum di-push**

## Ringkasan
PR ini mengaktifkan kembali dan mengintegrasikan seluruh API eksternal lapisan peta spasial (mengadopsi modul teruji dari proyek `NLP-PENYAKIT`), serta menyediakan 4 halaman pemantauan dan sinkronisasi data yang mengadopsi format UI/UX identik dengan halaman **Sinkronisasi EBS** (`/ebs`):

1. **Sinkronisasi BNPB InaRISK** (`/integrasi/bnpb`)
   - Memantau status koneksi dan kesehatan 6 layer GIS kebencanaan InaRISK (ArcGIS ImageServer & MapServer): Bahaya Banjir, Bahaya Gempa Bumi, Bahaya Tanah Longsor, Bahaya Karhutla, Indo Hillshade, dan Kepadatan Penduduk 2020.
   - Pengecekan otomatis/manual waktu respons (ping REST service).
2. **Sinkronisasi Flight Connect** (`/integrasi/flight`)
   - Memantau jaringan konektivitas penerbangan komersial domestik Indonesia (22 bandara utama, 42 rute non-stop antar-hub).
   - Menyajikan klasifikasi derajat konektivitas (*hub*, *regional*, *feeder*) untuk analisis transmisi dan importasi penyakit lintas provinsi/kab-kota.
   - **Cakupan Wilayah Domestik Indonesia**: Tombol filter multi-kawasan warisan (*ASEAN / ASEAN+3 / Global*) pada panel rute peta telah disesuaikan menjadi cakupan tunggal *Wilayah Domestik Indonesia* (sesuai mandat cakupan nasional SKDR).
3. **Sinkronisasi NASA FIRMS** (`/integrasi/firms`)
   - Menghubungkan deteksi titik panas (*fire hotspots*) aktif real-time dari instrumen satelit VIIRS (Suomi-NPP 375m) untuk surveilans ISPA dan polusi udara/asap.
   - Dilengkapi *in-memory cache* dan *last-good fallback* agar peta tetap responsif.
4. **Sinkronisasi Satwa Liar GBIF** (`/integrasi/satwa-liar`)
   - Mengambil catatan perjumpaan satwa liar khususnya unggas dan burung liar (*classKey* 212 / Aves) dari Global Biodiversity Information Facility (GBIF) di seluruh Indonesia untuk sistem kewaspadaan dini zoonosis flu burung (*Avian Influenza*).

---

## Navigasi Sidebar
Grup menu **`INTEGRASI`** di sidebar (`grp_integrasi`) kini memuat seluruh 5 modul sinkronisasi:
1. `Sinkronisasi EBS` (`/ebs`) — Radio icon
2. `Sinkronisasi BNPB` (`/integrasi/bnpb`) — ShieldAlert icon
3. `Sinkronisasi Flight Connect` (`/integrasi/flight`) — Plane icon
4. `Sinkronisasi NASA FIRMS` (`/integrasi/firms`) — Flame icon
5. `Sinkronisasi Satwa Liar` (`/integrasi/satwa-liar`) — Bird icon

Semua ikon baru (`ShieldAlert`, `Plane`, `Bird`) telah didaftarkan ke `MENU_ICON_MAP` di `services/frontend-next/lib/menu.ts`.

---

## Endpoint API Backend (Rust)
Semua endpoint diimplementasikan dalam modul baru `services/backend-rust/src/external_sync.rs` dan didaftarkan di `services/backend-rust/src/main.rs`:

### 1. Lapisan Peta Spasial (`SpatialOutbreakMap` / `AseanMap`)
- `GET /api/v1/map-layers/flight-airports`: Daftar bandara komersial dengan koordinat, derajat, dan kategori *band* (*hub*, *regional*, *feeder*).
- `GET /api/v1/map-layers/flight-routes?airport=:iata`: Jaringan rute tujuan dari bandara asal.
- `GET /api/v1/map-layers/flights`: Data posisi pesawat (simulated array).
- `GET /api/v1/map-layers/fires`: Titik panas satelit VIIRS aktif dengan *cache* 3 menit.
- `GET /api/v1/map-layers/wildlife`: Titik perjumpaan unggas liar GBIF dengan *cache* 5 menit.
- `GET /api/v1/map-layers/hazards`: Data hazard InaRISK BNPB.
- `GET /api/v1/map-layers/vectors`: Data surveilans vektor.

### 2. Status & Trigger Sinkronisasi
- `GET /api/v1/integrasi/bnpb/status` & `POST /api/v1/integrasi/bnpb/sync`
- `GET /api/v1/integrasi/flight/status` & `POST /api/v1/integrasi/flight/sync`
- `GET /api/v1/integrasi/firms/status` & `POST /api/v1/integrasi/firms/sync`
- `GET /api/v1/integrasi/satwa-liar/status` & `POST /api/v1/integrasi/satwa-liar/sync`

---

## Skema Database & Migrasi
- **`database/init/038_external_integrations.sql`**:
  - Tabel `external_sync_logs`: pencatatan riwayat sinkronisasi untuk semua layanan eksternal (`service`, `trigger`, `status`, `items_fetched`, `items_upserted`, `duration_ms`, `error`).
  - Tabel `airports`: katalog 22 bandara komersial Indonesia beserta koordinat lintang/bujur dan derajat konektivitas.
  - Tabel `flight_routes`: jaringan rute penerbangan domestik Indonesia.
  - Tabel `bnpb_layers_meta`: metadata 6 layer GIS InaRISK BNPB beserta URL REST ImageServer/MapServer dan opasitas.
  - Pembaruan `app_settings.navigation_menu` untuk memperluas `grp_integrasi` dengan 5 item sinkronisasi.
- **`database/rollback/038_rollback.sql`**: script rollback idempoten.

---

## Verifikasi & Pengujian
- **Next.js Typecheck**: `npm run typecheck` PASS tanpa error (`tsc --noEmit` code 0).
- **Backend Rust Build**: `cargo build --release` PASS tanpa error di dalam Docker container.
- **REST Endpoints**:
  - `curl -i /api/v1/map-layers/flight-airports` -> 200 OK (22 bandara)
  - `curl -i /api/v1/map-layers/flight-routes?airport=CGK` -> 200 OK (13 rute tujuan dari CGK)
  - `curl -i /api/v1/map-layers/fires` -> 200 OK (VIIRS hotspots)
  - `curl -i /api/v1/map-layers/wildlife` -> 200 OK (150 catatan perjumpaan aves GBIF)
  - `curl -i /api/v1/map-layers/hazards` -> 200 OK
  - `curl -i /api/v1/map-layers/flights` -> 200 OK
  - Status & Sync POST untuk keempat layanan -> 200 OK dan tercatat di `external_sync_logs`.
- **Frontend Pages**:
  - `/skdr/integrasi/bnpb` -> 200 OK
  - `/skdr/integrasi/flight` -> 200 OK
  - `/skdr/integrasi/firms` -> 200 OK
  - `/skdr/integrasi/satwa-liar` -> 200 OK
  - `/skdr/ebs` -> 200 OK
- **Banner Header & Beranda**:
  - `header.jpg` (28.6 KB) aktif langsung pada `DashboardHeader.tsx` di seluruh halaman.
  - `home.jpg` (1.7 MB) aktif langsung pada latar hero Beranda `app/page.tsx`.
