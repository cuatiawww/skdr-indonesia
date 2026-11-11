# PR 056: Laporan Analisis Sistem Dasbor & Alur Data Form SKDR Kemenkes RI

- **Tanggal:** 2026-11-11
- **Lapisan:** Dokumentasi & Referensi Arsitektur

## Ringkasan Perubahan
Menyusun dokumen referensi komprehensif hasil penelusuran langsung (*live inspection*) pada sistem resmi SKDR Kemenkes RI (`https://skdr.kemkes.go.id`) via agen browser untuk dijadikan acuan arsitektur *revamp* sistem SKDR Indonesia lokal:
1. **Peta Modul & Navigasi**: Dasbor Utama, Dasbor 2 (Tren, Distribusi, AAR, WHO 7-1-7, ISPA), Form IBS (36 Penyakit), Form EBS (4 Tab Rumor/KLB), Form MBG (6 Tab Keracunan/Sanitasi), Parameter, dan WhatsApp Gateway.
2. **Spesifikasi Dasbor Utama**: Struktur 4 panel inti (Peringatan Dini, Peta Kluster Verifikasi 7.800+ faskes, Kelengkapan Laporan mingguan, dan Ketepatan waktu lapor dengan ambang 80%).
3. **Alur Data End-to-End**: Mulai dari fasyankes/kader mengisi form $\to$ Ingestion & Algoritma Deteksi Ambang $\to$ Meja Verifikasi Alert Dinkes/TGC $\to$ Agregasi Dasbor Nasional & Spasial.
4. **Acuan Teknis Revamp**: Modernisasi frontend ke Next.js + Tailwind, migrasi peta dari Google Maps ke OpenStreetMap/Internal Tile Proxy, dan standardisasi RESTful JSON API.

## File Terkait
- `docs/LAPORAN_ANALISIS_SKDR_KEMKES.md`
- `docs/PR/056-analisis-alur-data-dan-dasbor-skdr-kemkes.md`
- `docs/CHANGE_LOG_MATRIX.md`
