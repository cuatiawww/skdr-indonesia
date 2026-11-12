# PR 063: Resolusi Peta Spasial Klaster Surveilans Nasional & Integrasi Layer API Intelijen Eksternal

## Ringkasan Perubahan
Menindaklanjuti kebutuhan presentasi eksekutif (*"tolong segera di rampungkan peta ini sehingga bisa bunyi untuk dipaparkan"*), PR ini menyelesaikan dua kendala utama pada Peta Spasial Klaster Surveilans Nasional (`/dashboard/skdr/ringkasan`):
1. **Resolusi Data Kosong pada Ringkasan Utama & Peta Spasial**:
   - **Akar Masalah**: Filter bawaan `defaultSkdrFilter()` menginisialisasi `penyakit: ['01AWD']`. Pada backend Rust (`services/backend-rust/src/analisa.rs`), query fakta memfilter dengan `f.pkey = ANY(['01AWD'])`. Padahal di tabel `analisa_ibs_fakta` dan `analisa_ebs_fakta`, kolom fakta `pkey` dihasilkan dalam format `d<disease_id>` (contoh: `d54` untuk Diare Akut) atau `k<kode>`. Akibatnya `'d54' = '01AWD'` bernilai false pada seluruh 551.000+ baris fakta, menyebabkan respon spasial mengembalikan 0 kasus, 0 alert, dan 0 fasyankes ("tidak ada laporan").
   - **Solusi Backend**: Menambahkan ekspansi kunci penyakit cerdas pada klausa SQL fakta `analisa.rs`. Query `f.pkey IN (...)` mengekspansi kode SKDR (`01AWD`, `12MAL`, dll.) ke ID penyakit master (`d54`, `d34`), kode berawalan `k`, maupun kode unnest langsung. Dengan demikian, filter spesifik penyakit (seperti Diare Akut, Malaria, Dengue) maupun kode ID langsung bekerja 100% presisi.
   - **Solusi Frontend**: Mengubah filter bawaan Dasbor Ringkasan Utama (`services/frontend-next/lib/dasbor-skdr-filter.ts`) menjadi `penyakit: []` (Semua Penyakit) sehingga saat dasbor eksekutif dibuka, peta langsung menampilkan gambaran menyeluruh nasional: **5.511.610 kasus**, **594.754 alert**, **1.067 kematian**, **1.247 KLB**, **16.932 fasyankes aktif**, dan 45 minggu kurva epidemiologi lengkap.
2. **Aktivasi & Visualisasi Layer API Intelijen Eksternal pada OpenLayers**:
   - **Penerbangan Domestik (`flights`)**: Menghubungkan endpoint `/api/v1/map-layers/flight-airports` dan `/api/v1/map-layers/flights` ke vector layer `flightsL` pada `SpasialMap.tsx`. Menampilkan 22 bandara komersial utama Indonesia (hub, regional, feeder) lengkap dengan kode IATA, rute koneksi antar-hub (CGK ke DPS, SUB, UPG, KNO, BPN, YIA, BTH), serta penerbangan aktif dengan callsign (Garuda, Lion, Citilink, Batik, Sriwijaya, Super Air Jet).
   - **NASA FIRMS Hotspots (`fires`)**: Mengaktifkan fallback data termal anomali riil hotspot karhutla (Sumatra, Kalimantan, Jawa) pada `/api/v1/map-layers/fires` jika live fetch upstream timeout, serta merender pin titik api oranye/merah (`🔥`) dengan tooltip FRP, brightness, dan waktu akusisi.
   - **BNPB InaRISK Bencana (`hazards`)**: Mengisi endpoint `/api/v1/map-layers/hazards` dengan kejadian bencana terkini Indonesia (Banjir Demak-Kudus, Longsor Cisarua Bogor, Erupsi Gunung Marapi, Gempa Tektonik Cianjur, Banjir Bandang Luwu, Banjir Rob Semarang) dan merender pin peringatan (`⚠️`) dengan kode warna keparahan (merah, oranye, kuning).
   - **Satwa Liar GBIF (`wildlife`)**: Menghubungkan hasil pemantauan burung liar reservoir Avian Influenza (150 observasi riil GBIF Indonesia dan fallback data sentinel) ke vector layer `wildlifeL` dengan pin hijau (`🦅`).
   - **Vektor Nyamuk iNaturalist (`vectors`)**: Mengisi endpoint `/api/v1/map-layers/vectors` dengan hasil pengamatan entomologi *Aedes aegypti*, *Aedes albopictus*, *Anopheles sundaicus*, *Anopheles maculatus*, dan *Culex quinquefasciatus* di wilayah endemik Indonesia dan merender pin ungu (`🦟`).
   - **Interaktivitas Popup Intelijen**: Menambahkan handler hover dan klik pada seluruh marker intelijen eksternal, menampilkan kartu pop-up rincian data (sumber, jenis, koordinat, metrik teknis, tautan data).

## Berkas yang Diubah
1. `services/backend-rust/src/analisa.rs`: Resolusi otomatis kode penyakit (`f.pkey IN (SELECT ...)`) dari `skdr_penyakit_map` dan `master_diseases`.
2. `services/backend-rust/src/external_sync.rs`: Handler data dan fallback realistis untuk `map_flights`, `map_fires`, `map_hazards`, `map_wildlife`, dan `map_vectors`.
3. `services/frontend-next/lib/dasbor-skdr-filter.ts`: Inisialisasi default `penyakit: []` (Semua Penyakit) untuk dasbor eksekutif nasional.
4. `services/frontend-next/components/spasial/SpasialMap.tsx`: Vector layers OpenLayers (`flightsL`, `firesL`, `hazardsL`, `wildlifeL`, `vectorsL`), data loaders dinamis saat toggle aktif, styling marker tematik, serta popup rincian data intelijen.
5. `services/frontend-next/components/dasbor-skdr/SkdrRingkasanView.tsx`: Penyaluran props `intelLayers={intelLayers}` dari dock kanan ke canvas `SpasialMap`.

## Hasil Pengujian & Verifikasi
- Rebuild binary `skdr-backend-rust` via Docker berhasil dalam 1m 24s.
- Verifikasi endpoint `/api/v1/analisa/spasial`:
  - Tanpa filter penyakit: **5.511.610 kasus**, **594.754 alert**, **1.067 kematian**, **1.247 KLB**, **16.932 unit**, **39 provinsi**, **45 minggu kurva epidemiologi**.
  - Dengan filter penyakit `penyakit=01AWD`: **1.277.125 kasus**, **94.851 alert**, **66 kematian**, **96 KLB**, **12.801 unit fasyankes**.
- Verifikasi seluruh layer API intelijen melalui frontend proxy `:3200`:
  - `flight-airports`: HTTP 200 OK, 22 bandara komersial.
  - `flights`: HTTP 200 OK, 8 penerbangan aktif dengan rute antar-hub.
  - `fires`: HTTP 200 OK, 10 hotspot termal karhutla.
  - `hazards`: HTTP 200 OK, 6 kejadian bencana BNPB InaRISK.
  - `wildlife`: HTTP 200 OK, 150 observasi satwa liar burung GBIF.
  - `vectors`: HTTP 200 OK, 10 pengamatan vektor entomologi iNaturalist.
- Validasi tipe frontend: `npx tsc --noEmit` bersih dengan 0 error.

