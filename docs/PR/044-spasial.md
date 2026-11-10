# PR 044 — Dasbor Limited → Spasial (peta analisa IBS + EBS)

Tanggal: 2026-11-11 · Lingkup: Backend + DB (migrasi 064) + Frontend

## Ringkasan
Placeholder **Spasial** ("segera hadir") diganti halaman peta analisa yang memakai data sistem sendiri (Laporan Agregat IBS, Laporan EBS; Laporan Individu IBS ikut bila datanya ada). Tata letak mengikuti pola halaman analisa peta ABVC (peta penuh dengan panel mengambang), dan semua fungsi Pemetaan SKDR lama (IBS dan EBS) dibawa serta diperluas. Filter memakai panel kiri dan parameter URL yang sama dengan Matriks Analisa (PR 042/043), sehingga tautan bisa dipindah antarhalaman.

## Yang diambil dari pola ABVC (referensi, kode tidak disalin)
- Peta penuh dengan panel mengambang yang bisa dibuka-tutup: toolbar, pemilih lapisan (peta dasar, choropleth, penanda), legenda, dan panel kanan "ringkasan wilayah" (poin ringkasan, KPI, hotspot, kurva epidemi, detail wilayah).
- Ambang warna dari konfigurasi DB (di sini `app_settings.map_choropleth`, kuartil), tanpa skor risiko komposit.
- ABVC tidak punya kluster, heatmap, maupun slider waktu. Ketiganya ditambahkan di sini.

## Fitur
- **Choropleth** provinsi (nasional) → kab/kota (1 provinsi dipilih). Klik wilayah untuk popup, tombol *Fokus/Drill*, breadcrumb dan tombol Kembali untuk naik level. Kab/kota yang dipilih disorot dan peta di-zoom ke wilayah itu.
- **Indikator warna**: kasus, kematian, laporan, alert/sinyal, KLB, CFR (kelas tetap, minimal 20 kasus), dan perubahan vs minggu lalu (kelas divergen). Untuk indikator jumlah dipakai kelas kuartil dari konfigurasi, dengan legenda dan keterangan ambang.
- **Titik unit pelapor**: mode kluster (warna = status terberat di dalam kluster), mode titik (ukuran sebanding √kasus), atau dimatikan. Status IBS: KLB / terverifikasi / alert belum diverifikasi / laporan tanpa alert. Status EBS: KLB / terverifikasi / rumor / discarded. Unit dengan respons alert > 24 jam diberi cincin kuning. Lokasi perkiraan (pusat kab/kota) digambar putus-putus. Ada filter status dan kasus minimal.
- **Heatmap** kepadatan kasus (toggle).
- **Popup wilayah**: kasus, kematian, CFR, perubahan minggu terakhir vs minggu sebelumnya, perubahan vs periode sebelumnya, laporan, alert, KLB, unit, porsi kasus. **Popup titik**: angka unit, status, dan sparkline mingguan.
- **Putar ulang per minggu epid**: slider dan tombol play. Warna memakai skala tetap lintas minggu agar bisa dibandingkan.
- **Panel kanan**:
  - Ringkasan berisi interpretasi otomatis, termasuk varian bila kab/kota dipilih (peringkat di provinsi), dan kurva epidemi.
  - Hotspot berisi peringkat wilayah atau unit menurut indikator aktif. Kenaikan dihitung minimal 5 kasus, CFR minimal 20 kasus.
  - Detail wilayah berisi KPI, kurva, penyakit teratas, sub-wilayah, unit teratas, dan tautan ke Matriks Analisa.
- **Daftar di bawah peta** (pengganti tabel Pemetaan lama): pilih Hanya alert atau Semua baris, cari, Kasus ≥, urutkan, paging. Tombol **Peta** memusatkan peta ke unit, tombol **Detail** membuka modal semua isian. Tersedia **Ekspor Excel** kolom detail (maksimal 50 ribu baris).
- **KPI** 7 kartu dengan perubahan vs periode sebelumnya, kalimat interpretasi, dan bagian *Definisi & catatan data peta*.
- Menu: lencana "Segera" pada Spasial dihapus (`lib/menu.ts` dan `navigation_menu` lewat migrasi).

## Pemetaan lama → Spasial
| Pemetaan lama (IBS/EBS) | Spasial |
|---|---|
| Google Map penanda alert | Peta OpenLayers (tile proxy OSM sendiri), titik unit dengan kluster/titik + status KLB/verifikasi/respons |
| Filter tahun/minggu, periode bulan (EBS) | Rentang minggu epid + preset (panel kiri, URL bersama) |
| Provinsi / Kab/Kota / Kecamatan | Sama. Provinsi/kab juga lewat klik peta (drill). Kecamatan memfilter titik, KPI, dan daftar |
| Unit pelapor, kelompok, tipe data, penyakit | Panel kiri + Filter lanjutan (sama dengan Matriks Analisa) |
| Kasus ≥ | Kasus minimal pada lapisan titik dan "Kasus ≥" pada daftar |
| Respon ≤ 24 jam, KLB, Verifikasi | Filter lanjutan + status titik + cincin respons > 24 jam |
| EBS: Status KLB saat ini, Status Rumor, Formulir W1, Sumber informasi, Lab/spesimen, Penyakit terverifikasi/rumor | Filter lanjutan EBS + kolom daftar + modal Detail |
| Tabel di bawah peta (No…Penyakit, Kasus, KLB, Verifikasi, Respon, Map, Detail) | Daftar dengan kolom yang sama + Kematian/Lab, tombol Peta dan Detail, Ekspor Excel |
| (tidak ada) | Choropleth + legenda/ambang, heatmap, hotspot, popup CFR & perubahan, putar ulang mingguan, interpretasi |

## Data & batasan (jujur)
- Laporan EBS dan IBS **tidak menyimpan koordinat**. Koordinat unit diambil dari data Alert SKDR yang diimpor (`skdr_alerts`, modus koordinat per unit di dalam bbox Indonesia), dengan cadangan `master_fasyankes`. IBS dicocokkan lewat kode unit, EBS lewat nama unit yang dinormalisasi + kab/kota.
- Cakupan di DB lokal: Jawa Barat IBS M40–M44 2026 ada 1.294 unit, 99,9% berkoordinat unit. Jawa Barat EBS M1–M14 ada 409 unit, 97,8% berkoordinat unit. Sisanya diletakkan di pusat kab/kota, ditandai "perkiraan" dan digambar putus-putus.
- **Tidak ada poligon kecamatan**, sehingga choropleth berhenti di kab/kota.
- Laporan Individu IBS di DB lokal berisi 0 baris. Bila nanti terisi, data itu ikut lewat sumber yang sama.
- Minggu terakhir pada rentang bisa bernilai rendah atau 0 karena keterlambatan laporan (contoh: EBS M13–M14 2026). Baca "perubahan vs minggu lalu" dengan hati-hati.
- Respons API di-cache lewat `api_cache` (prefix `/api/v1/analisa/`). Materialized view lokasi di-refresh di latar paling sering sekali per 12 jam.

## Berkas
- `database/init/064_spasial.sql`, `database/rollback/064_rollback.sql`: fungsi `skdr_norm_nama`, MV `analisa_unit_lokasi` + unique index, dan pembaruan menu (dengan cadangan `app_settings_bak_064`).
- `services/backend-rust/src/spasial.rs` (baru): `GET /api/v1/analisa/spasial`, `/spasial/wilayah`, `/spasial/daftar`.
- `services/backend-rust/src/{analisa.rs,main.rs}`: helper dibuat `pub(crate)`, field query `kasus_min`/`wlv`/`wid`, dan routing.
- `services/frontend-next/lib/spasial-api.ts`, `components/spasial/{SpasialClient,SpasialMap,SpasialPanel,SpasialDaftar}.tsx`, `app/dashboard/spasial/page.tsx`, `lib/menu.ts`.

## Verifikasi
- `cargo check --release --locked --tests`: 0 error, 0 warning. `tsc --noEmit`: 0 error. `next build` (NEXT_PUBLIC_BASE_PATH=/skdr) sukses.
- DB lokal: migrasi 064 dibangun sekitar 2,5 detik (MV 6,4 MB), rollback diuji. Endpoint IBS Jabar M40–M44 selesai sekitar 170 ms, EBS Jabar M1–M14 sekitar 460 ms, IBS nasional dengan titik ringkas (array) sekitar 1,2 detik.
- Render headless (sesi tiruan, data DB lokal):
  - IBS dan EBS Jawa Barat
  - choropleth nasional
  - titik + heatmap
  - hotspot wilayah/unit
  - popup + detail wilayah
  - putar ulang
  - Kab. Bandung
  - panel filter disembunyikan
  - modal Detail daftar
  - Semua sumber dengan indikator KLB

## Rollback
`database/rollback/064_rollback.sql` (hapus MV + fungsi, kembalikan menu dari cadangan, hapus baris `schema_migrations`), lalu revert commit frontend/backend.
