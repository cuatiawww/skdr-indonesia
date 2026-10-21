# PR 013 — Dasbor lebih padat: grafik lebih besar, kartu sama tinggi, tanpa ruang kosong

Tanggal: 2026-10-21 · Commit lokal (tidak di-push).

## Perubahan
1. **CFR per penyakit (Kasus PE, IK 95% Wilson)**: batang horizontal tebal (maks. 44 px) untuk estimasi titik dan whisker IK (tebal 2,5 px).
   Label nilai per penyakit di sumbu Y: nama (14 px, tebal) dan "0% (0/8), IK 0,0–32,4%" (13 px). Font sumbu X 13 px.
   Sumbu X diperbesar otomatis sampai batas atas IK tertinggi + 15%, dibulatkan ke langkah 1/2/5/10/20 (sekarang 0–40%, bukan 0–100%).
   Tinggi grafik minimal 340 px atau 88 px per penyakit, dan ikut tinggi tabel (tinggi grafik = tinggi tabel = 507 px). Grafik dan tabel masing-masing setengah lebar.
   Penyakit dengan penyebut 0 tidak lagi menampilkan potongan batang.
2. **Status laporan PE**: donut diperbesar (200–260 px, menyesuaikan kartu) dengan total di tengah. Legenda di sampingnya 14 px, jumlah 18 px tebal, ditambah persentase.
   **Kelengkapan NIK** menjadi KPI 30 px di bagian bawah kartu. Ruang kosong di bawah dihapus.
3. **Cakupan wilayah pelapor**: KPI besar 36 px (Provinsi 97,4%, Kab/Kota 75,9%) dengan pembilang/penyebut dan progress bar tebal 16 px.
   Ditambah daftar **provinsi belum melapor** dan **5 provinsi dengan cakupan kab/kota terendah** (dengan bar), keduanya dari API.
   Backend `exec_dash.rs` kini mengembalikan `coverage.provinces_missing` dan `coverage.kab_by_province` (agregasi di SQL).
4. **Umum**:
   - `Panel` sekarang `flex h-full flex-col`, sehingga kartu dalam satu baris sama tinggi. Judul panel 16 px.
   - Baris bawah dasbor berisi 3 kolom mulai ≥1280 px (sebelumnya 2+1 di 1440 px). Gauge 7-1-7 lebih besar (128 px, 4 kolom di ≥1536 px).
   - Grafik tren mingguan tumbuh mengisi kartu; kotak dalam absolut mencegah loop resize ResponsiveContainer.
   - Seluruh font grafik naik dari 10–11 px ke ≥12 px (tren, heatmap, choropleth, halaman Penyakit).
   - Halaman detail Penyakit:
     - kurva epidemi 320 px, umur/jenis kelamin 288 px
     - daftar wilayah teratas 14 px dengan bar porsi
     - kartu CFR dipusatkan vertikal
     - peta dipusatkan di kartunya

## Hasil uji (nyata, 2026-10-21)
| Uji | Hasil |
|---|---|
| tsc --noEmit | 0 error |
| smoke_test.sh | PASS |
| analytics_api_test.py | ALL PASS (regresi) |
| Playwright 1440 px dan 1920 px | Ruang kosong di bawah konten kartu ≤ 6 px di semua kartu dasbor. Satu pengecualian di detail Penyakit 1440 px: "Laporan PE terbaru" 57 px karena tabelnya berbaris lebih sedikit daripada tabel EBS di sebelahnya. Font teks grafik minimum 12 px; tinggi grafik CFR = tinggi tabel = 507 px; KPI cakupan 36 px; 0 page/console error |

Screenshot: `/workspace/pr013-screenshots/` (box): `p13_dashboard_{1440,1920}.png`, `p13_cfr_{1440,1920}.png`, `p13_bottom_row_{1440,1920}.png`, `p13_penyakit_detail_{1440,1920}.png`.
