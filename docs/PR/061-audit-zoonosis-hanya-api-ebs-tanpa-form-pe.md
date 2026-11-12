# PR 061 – Fleksibilitas Sumber Zoonosis (EBS & Form PE), Penanganan Nilai Kosong/Nol Alami, dan Resolusi 400 Bad Request

## Latar Belakang & Ringkasan Perubahan
Sesuai arahan pengguna, modul Zoonosis (**Dasbor Zoonosis General** dan **Dasbor Zoonosis Lite**) mendukung visualisasi data yang bersumber dari **API EBS** (`dash_ebs_reports`) maupun **Form PE** (`pe_cases` / Penyelidikan Epidemiologi individu). Apabila belum terdapat inputan data pada Form PE, antarmuka secara alami menampilkan status kosong / angka 0 (nol) tanpa manipulasi dummy maupun angka hardcoded.

Selain itu, PR ini menyelesaikan bug `400 Bad Request` pada Zoonosis Lite akibat duplikasi parameter query string `source` pada pemanggilan endpoint backend.

---

### Rincian Perubahan

1. **Selektor Sumber Fleksibel (Semua / EBS / Form PE)**:
   - Pada [`ZoonosisLite.tsx`](file:///c:/laragon/www/skdr-indonesia/services/frontend-next/components/dashboard/ZoonosisLite.tsx), ditambahkan tombol selektor Sumber pada bilah filter:
     - **Semua**: Menggabungkan sinyal & kasus EBS dengan kasus & kematian Form PE.
     - **EBS**: Menampilkan data murni dari API EBS.
     - **Form PE**: Menampilkan data murni dari Form PE. Jika belum ada inputan pada database `pe_cases`, nilai kasus/kematian akan tampil 0 / kosong secara alami.
   - Pada [`ZoonosisGeneralView.tsx`](file:///c:/laragon/www/skdr-indonesia/services/frontend-next/components/dashboard/ZoonosisGeneralView.tsx), selektor Sumber (`sumber`, `onSumberChange`) pada `SkdrFilterBar` diaktifkan penuh dan terhubung ke `ExecutiveSummary` serta `SpatialOutbreakMap`.

2. **Resolusi 400 Bad Request (Eliminasi Duplikasi Parameter `source`)**:
   - Pembuatan query string `qs` menggunakan `toQs` yang secara bersih menyertakan `source: src !== 'all' ? src : undefined`.
   - Pemanggilan `fetchFrom` (`/api/v1/analytics/overview`, `/api/v1/public-dashboard`, `/api/v1/dashboard/executive`) tidak lagi menambahkan string manual `&source=...`. Hal ini mencegah duplikasi parameter yang sebelumnya ditolak oleh deserializer Axum/serde di Rust backend dengan status `400 Bad Request: Failed to deserialize query string: duplicate field 'source'`.
   - Ketiga endpoint terverifikasi mengembalikan status `HTTP 200 OK`.

3. **Kartu Penyakit Zoonosis (Disease Cards)**:
   - Kasus dan kematian dihitung sesuai sumber yang dipilih (`all`: EBS + PE, `ebs`: EBS murni, `pe`: PE murni).
   - Teks keterangan di bawah kartu menampilkan rincian kedua sumber: `EBS {ebsCases} kasus ({ebs} sinyal) · PE {pe} kasus`. Jika tidak ada inputan PE, akan tertulis `PE 0 kasus`.
   - Perhitungan CFR (Wilson 95% CI) dan sparkline kurva mingguan otomatis menyesuaikan sumber yang dipilih.

4. **Peta & Lapisan Spasial**:
   - Lapisan titik lokasi kasus mendukung filter `all`, `ebs`, dan `pe`.
   - Drawer lapisan menampilkan rincian titik lokasi EBS dan titik lokasi Form PE.
   - Parameter `sourceMode={src}` diteruskan ke komponen peta `SpatialOutbreakMap`.

5. **Heatmap & Modal Analisis Zoonosis Lite**:
   - [`ZoonosisLiteHeatmap.tsx`](file:///c:/laragon/www/skdr-indonesia/services/frontend-next/components/dashboard/ZoonosisLiteHeatmap.tsx) mendukung visualisasi mingguan per provinsi dan per penyakit untuk EBS maupun Form PE.
   - [`ZoonosisLiteModal.tsx`](file:///c:/laragon/www/skdr-indonesia/services/frontend-next/components/dashboard/ZoonosisLiteModal.tsx) mengaktifkan kembali Tab 5 `kematian` ("Kematian Form PE") dari endpoint `/api/v1/signals/pe-deaths`. Jika belum ada laporan kematian PE pada filter terpilih, modal menampilkan pesan kosong ramah pengguna (`t('skdr.cfrList.empty')`).

6. **Integritas Data & Bebas Dummy**:
   - Seluruh data berasal murni dari PostgreSQL via Rust backend API. Tidak ada data palsu, mock, atau angka hardcoded.
   - Seluruh perubahan tersimpan di branch lokal (tidak di-push ke remote sesuai instruksi).

---

## File Terkait
- `services/frontend-next/components/dashboard/ZoonosisLite.tsx` (diperbarui)
- `services/frontend-next/components/dashboard/DiseaseTable.tsx` (diperbarui)
- `docs/CHANGE_LOG_MATRIX.md` (diperbarui)
- `docs/PR/061-audit-zoonosis-hanya-api-ebs-tanpa-form-pe.md` (diperbarui)
