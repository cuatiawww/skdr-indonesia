# PR 042 - Matriks Analisa (Dasbor Limited): analisa IBS + EBS dalam satu halaman

Tanggal: 2026-11-11

## Ringkasan
Placeholder `Dasbor Limited → Matriks Analisa` diganti halaman analisa penuh. Ada satu filter bersama dengan Sumber **IBS / EBS / Semua** dan enam tab. Semua fitur Analisa Data SKDR IBS dan SKDR EBS lama (skdr.kemkes.go.id) tetap ada dalam bentuk yang diperbaiki; peta dikecualikan (masuk fase Spasial). Filter dan tab tersimpan di URL (`sumber, startYear, startWeek, endYear, endWeek, prov, kab, kec, penyakit, periode, basis, <filter lanjutan>, tab, jenis`). Setiap tab punya skeleton, ekspor Excel (.xlsx tanpa dependensi baru), kalimat **Interpretasi** otomatis, dan tooltip definisi. Teks UI berbahasa Indonesia.

## Tab
| Tab | Isi |
|---|---|
| Ringkasan & Tren | KPI (kasus, kematian, laporan, alert/sinyal, KLB, unit, kab/kota, CFR + CI 95% Wilson) dibanding periode sebelumnya dan periode sama tahun lalu; tren per minggu epid (atau bulan/tahun) dengan garis tahun lalu, rerata baseline, ambang rerata + 2 SD (minggu sama ±1, 3 tahun sebelumnya; bila histori belum cukup memakai baseline bergerak 8 minggu, metodenya ditulis); titik merah untuk minggu di atas ambang; penyakit teratas (porsi, perubahan mingguan, ambang) dan wilayah teratas (diurutkan menurut nilai, bisa ditelusuri) |
| Matriks & Laporan | Pemilih **Jenis laporan / grafik / diagram** (48 preset): matriks penyakit × wilayah, 16 laporan IBS, 5 grafik IBS, 20+ diagram EBS, laporan EBS; mode kustom baris × kolom × ukuran (17 dimensi, 7 ukuran); tabel heatmap dengan header dan kolom pertama sticky serta baris dan kolom TOTAL; grafik (batang, tumpuk, garis, pie); drilldown provinsi → kab/kota → kecamatan → unit dengan breadcrumb; catatan otomatis bila ≥ 30% berada di "(Belum diisi)" |
| Morbiditas | Kasus, porsi dari total, kematian, CFR per penyakit dan per wilayah; proporsi terhadap kunjungan hanya dari Laporan Agregat IBS yang mengisi Total Kunjungan (penyebut dan cakupannya ditampilkan); **tanpa penyebut tetap 100.000**: insiden ditandai "belum tersedia" karena data penduduk tidak ada; 0 tampil sebagai 0, bukan kosong |
| Kinerja Pelaporan | IBS: kelengkapan dan ketepatan per wilayah dan per minggu, maksimal 100%, unit × minggu dihitung sekali, garis target 80%, warna merah/kuning/hijau dengan legenda, kolom berlabel jelas (unit diharapkan, laporan diharapkan, diterima, tepat waktu, ketepatan terhadap diharapkan dan terhadap diterima), 20 unit terendah. EBS: cakupan unit Puskesmas/RS melapor ÷ fasyankes terdaftar (maksimal 100%), 7-1-7 (deteksi/notifikasi/respons dengan definisi dan median), kelengkapan isian field |
| Alert & Sinyal | Alert IBS (terverifikasi, respons ≤ 24 jam, KLB, spesimen) dan sinyal EBS: kualitas sinyal (terverifikasi/discarded/investigasi), konversi KLB (KLB terverifikasi ÷ terverifikasi), tren mingguan, per penyakit/wilayah, analisa sumber informasi, 20 kecamatan hotspot (tabel), line list berpaginasi dengan pencarian (Alert IBS / Laporan EBS / KLB terpadu), hanya baca |
| Profil Kasus | Kelompok umur × jenis kelamin (isian usia Laporan EBS dan Laporan Individu IBS), kematian dan CFR per penyakit dengan CI 95%, kematian per wilayah, empty state yang jelas bila umur/JK tidak tersedia |

Filter lanjutan (bisa dilipat) hanya menampilkan filter yang berlaku untuk tab dan sumber terpilih. Filter yang tidak berlaku tidak dikirim. Isi filter lanjutan: jenis unit, kelompok (Pemerintah/TNI/Polri/Swasta), status rumor, status KLB, situasi KLB, W1, sumber informasi, spesimen/lab, respons, verifikasi; ditambah basis penyakit rumor/terverifikasi (EBS) dan agregasi mingguan/bulanan/tahunan.

## Pemetaan fitur lama → baru
| Fitur lama (skdr.kemkes.go.id) | Sekarang di | Perbaikan |
|---|---|---|
| IBS Morbiditas (proporsi vs kunjungan) | Tab Morbiditas | Penyebut dan cakupan kunjungan ditampilkan; insiden hanya bila ada penduduk (tidak memakai 100.000 tetap); CFR; urut menurut nilai |
| IBS Alert (line list, respon < 24 jam, KLB, verifikasi) | Tab Alert & Sinyal + Jenis laporan "Line list alert" / "Respons alert ≤ 24 jam menurut tempat" / "Indikator alert" | Persentase dengan pembilang/penyebut, tren, hotspot, pencarian, paginasi, ekspor Excel ≤ 50.000 baris |
| IBS Kelengkapan & Ketepatan (grafik + tabel) | Tab Kinerja Pelaporan; Jenis laporan "Kelengkapan" / "Ketepatan" | Maksimal 100%, unit × minggu dedup, hanya minggu yang sudah berakhir, garis target 80%, 3 warna + legenda, kolom berlabel, unit terendah, tren mingguan |
| IBS Grafik: penyakit menurut tempat | Jenis laporan "Grafik penyakit menurut tempat" | Batang tumpuk diurutkan menurut nilai + tabel heatmap + drilldown |
| IBS Grafik: total kasus, lab, kematian menurut tempat | "Grafik total kasus, lab & kematian menurut tempat" | Multi-ukuran dalam satu tabel/grafik |
| IBS Grafik: tren total kasus | "Grafik tren total kasus" + Tab Ringkasan | Minggu epid, tahun lalu, ambang, interpretasi |
| IBS Grafik: alert menurut tempat | "Grafik alert menurut tempat" | Alert + KLB |
| IBS Grafik: penyakit potensial wabah | "Grafik penyakit potensial wabah" | Daftar penyakit diatur di `app_settings.matriks_analisa.potensial_wabah` |
| IBS Laporan 16 jenis (kasus/kematian/lab menurut tempat atau penyakit, penyakit × tempat termasuk nasional, indikator alert, kelengkapan, ketepatan, line list alert/agregat) | Pemilih Jenis laporan, grup "IBS - Laporan" (16 preset + line list Individu IBS, jenis unit, kelompok) | Semua bisa diekspor ke Excel dengan judul, filter, dan interpretasi; nasional = provinsi dikosongkan |
| IBS filter unit pelapor, kelompok, periode | Filter lanjutan (jenis unit, kelompok) + Agregasi mingguan/bulanan/tahunan | Hanya tampil bila berlaku |
| EBS Diagram 20 jenis | Grup "EBS - Diagram" (21 preset: KLB dari rumor, status rumor, W1, per bulan, per tempat, penyakit terverifikasi, sumber laporan, rumor vs terverifikasi, status KLB per tempat/penyakit, situasi KLB per tempat/penyakit, kelompok umur, jenis kelamin, kasus vs kematian, respons per penyakit/tempat, W1 per penyakit/tempat, KLB Ya tanpa W1, spesimen) | Tabel + grafik + interpretasi + catatan field kosong |
| EBS Laporan: daftar laporan | "Daftar Laporan EBS" / line list di Tab Alert & Sinyal | Pencarian, paginasi, ekspor |
| EBS Laporan: Surveilans Terpadu Penyakit Berbasis KLB | "Surveilans Terpadu Penyakit Berbasis KLB" | Umur pria/wanita per kelompok, kasus/meninggal, tanggal mulai/akhir/diketahui/ditanggulangi; umur yang tidak diisi tampil "–" (bukan 0) |
| EBS filter (status rumor, status KLB, sumber informasi, rumor vs terverifikasi, lab, W1, respons) | Filter lanjutan + toggle "Penyakit menurut: Terverifikasi/Rumor" | Nilai "(Belum diisi)" bisa difilter |
| EBS Lanjutan (kualitas sinyal, konversi KLB, kelengkapan/cakupan, tren, sumber, 20 kecamatan hotspot, 7-1-7) | Tab Alert & Sinyal + Tab Kinerja Pelaporan | Definisi setiap indikator, pembilang/penyebut, median 7-1-7 |
| Peta (IBS/EBS pemetaan) | Tidak termasuk; masuk fase Spasial | - |

## Backend / DB
- `services/backend-rust/src/analisa.rs` (baru) + 8 route `GET /api/v1/analisa/{opsi,ringkasan,pivot,morbiditas,kinerja,sinyal,daftar,profil}` (login wajib, default `auth::classify`; cache api 30 detik).
- Migrasi `063_matriks_analisa.sql`, rollback `database/rollback/063_rollback.sql`:
  - kolom `laporan_ibs_baris.kecamatan/jenis_unit/kelompok` + trigger pengisi + backfill;
  - indeks `idx_laporan_ibs_baris_analisa` dan `idx_laporan_ibs_kinerja`;
  - fungsi `skdr_epi_ws`, `skdr_tgl`; view `analisa_ebs_fakta`, `analisa_ibs_fakta`;
  - `app_settings.matriks_analisa` (target 80%, ambang 80/60, batas ketepatan 10 hari, baseline, potensial wabah);
  - badge "Segera" dihapus dari menu; prefix cache `/api/v1/analisa/`; cadangan setting di `app_settings_bak_063`.
- Nama pasien disamarkan (`S*** A*****`). Alamat, NIK, kronologi, dan kontak tidak pernah dikirim.

## Uji
- `cargo check` 0 error; unit test analisa 4/4; smoke langsung ke DB lokal (7 skenario × 11 endpoint) semua OK; `tsc --noEmit` 0 error; migrasi 063 diterapkan backend lokal.
- Render headless 24 tampilan (IBS/EBS/Semua, Jawa Barat, drilldown Kab. Bandung, preset laporan/diagram) tanpa page error. Sesi pada render ini disimulasikan, dan data API berasal dari DB lokal lewat harness tes sementara yang tidak di-commit.
- Contoh Jawa Barat M40–M44 2026 (IBS): 81.660 kasus, 5 kematian, 4.502 Laporan Agregat IBS, 8.878 alert (96,8% terverifikasi, 93,7% respons ≤ 24 jam), 17 KLB; kelengkapan 66,4% (4.502/6.785), ketepatan 61,7%; terendah Sukabumi 29,3%.
- Waktu kueri (lokal): nasional M40–44 ringkasan 1,1 s, kinerja 2,0 s, lainnya < 0,3 s; Jawa Barat < 0,5 s; nasional 1 tahun penuh ringkasan 2,6 s, kinerja 3,4 s.

## Catatan data
- Laporan EBS (impor API lama) berakhir 2026-04-09. Akibatnya EBS M40–44 2026 kosong, dan halaman menampilkan peringatan di luar rentang data.
- Data impor EBS tidak memuat W1, sumber informasi, usia, lab, situasi KLB, tanggal mulai gejala, dan kelompok. Output yang memakai field ini menampilkan catatan, bukan angka.
- Laporan Agregat IBS impor hanya berisi unit × minggu yang memiliki alert, sehingga kelengkapan lebih rendah dari kenyataan. Total Kunjungan belum terisi, jadi proporsi kunjungan tampil "–". Data penduduk belum ada, jadi insiden tidak dihitung. Laporan Individu IBS = 0.
- Respons EBS adalah proksi: pembaruan pertama laporan setelah dibuat.
