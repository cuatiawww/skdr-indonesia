# PR 049 – Isolasi Data Dasbor Zoonosis Lite dari Agregat Mingguan IBS & Pemulihan Sumber Form PE

## Latar Belakang & Masalah
1. **Titik Agregat IBS Bocor ke Dasbor Zoonosis Lite:**
   Pada PR 039 (`060_dasbor_utama_laporan_ebs_ibs.sql`), view `surveillance_reports` memasukkan seluruh baris agregat mingguan IBS (`dash_ibs_rows`) dengan `source = 'ibs'`. Karena 4 dari 24 penyakit di IBS adalah penyakit zoonosis (Antraks, GHPR/Rabies, Leptospirosis, Flu Burung), maka saat Dasbor Zoonosis Lite (`/dasbor/zoonosis-lite`) meminta data titik tanpa filter sumber khusus, ribuan titik agregat puskesmas se-Indonesia dari API Alert SKDR ikut tersedot dan membanjiri peta Zoonosis Lite.
2. **Klarifikasi API yang Berhenti di Bulan April vs API yang Berjalan:**
   - **API EBS** (`/api/ebs`) Kemkes memang berakhir di **9 April 2026**.
   - **API Alert SKDR** (`/api/alert`) Kemkes **tetap aktif sepanjang tahun 2026 (Minggu 1 s.d. Minggu 45)** dan telah menyinkronkan 515.626 data alert.
   - Titik-titik IBS yang sangat banyak tersebut berasal dari data real API Alert SKDR Kemkes, bukan data buatan. Namun titik agregat mingguan ini seharusnya hanya ditampilkan di Dasbor SKDR, Dasbor Spasial, dan Matriks Analisa, bukan di Dasbor Zoonosis Lite.
3. **Branch Form PE (`pe_cases`) Terputus:**
   Di backend `dashboard.rs`, query untuk `source=pe` sebelumnya dialihkan paksa ke `source=ibs`, dan branch `pe` dihapus dari `surveillance_reports`. Akibatnya, pemfilteran Form PE di Zoonosis Lite menghasilkan 0 data.

---

## Solusi & Perubahan yang Diterapkan
1. **Penyaringan Titik di Dasbor Zoonosis Lite (`ZoonosisLite.tsx`):**
   - Menambahkan filter ketat `source_type !== 'ibs'` pada titik lokasi peta Zoonosis Lite.
   - Peta Zoonosis Lite kini hanya menampilkan kasus dari **Laporan EBS** dan **Penyelidikan Epidemiologi (Form PE)**, membuang seluruh tumpukan titik agregat mingguan IBS.
2. **Pemulihan Sumber Form PE di `surveillance_reports` (`database/init/066_surveillance_reports_restore_pe.sql`):**
   - Mengembalikan branch `SELECT 'pe' ... FROM pe_cases` ke dalam view `surveillance_reports`.
   - View `surveillance_reports` kini memiliki 4 sumber independen: `form` (legacy), `ebs` (Laporan EBS), `pe` (Form PE Zoonosis), dan `ibs` (Laporan Agregat IBS).
3. **Backend Support untuk Sumber `pe` (`services/backend-rust/src/dashboard.rs`):**
   - Menghapus pemaksaan konversi `pe -> ibs` pada `resolve()`. Parameter `source=pe` kini langsung memfilter baris `r.source = 'pe'`.

---

## Berkas yang Diubah / Ditambahkan
1. `database/init/066_surveillance_reports_restore_pe.sql`:
   - Migrasi PostgreSQL untuk memulihkan branch `pe_cases` di view `surveillance_reports`.
2. `database/rollback/066_rollback.sql`:
   - Skrip rollback migrasi 066.
3. `services/backend-rust/src/dashboard.rs`:
   - Mempertahankan nilai `source = 'pe'` tanpa dibelokkan ke `'ibs'`.
4. `services/frontend-next/components/dashboard/ZoonosisLite.tsx`:
   - Penapis titik `source_type !== 'ibs'` pada peta Dasbor Zoonosis Lite.
5. `docs/CHANGE_LOG_MATRIX.md`:
   - Menambahkan baris catatan rilis PR 049.

---

## Hasil & Verifikasi
- Peta Dasbor Zoonosis Lite kini bersih dan hanya berfokus pada investigasi EBS dan kasus Form PE.
- Titik agregat mingguan IBS tetap utuh dan tersedia di Dasbor SKDR Utama, Dasbor Spasial, dan Dasbor Matriks Analisa.
- Integritas data surveilans tetap terjaga tanpa ada data yang terhapus atau dirusak.
