# dev/seed — data demo lokal (BUKAN migrasi)

File di folder ini **tidak** dijalankan otomatis (berbeda dengan `database/init`). Hanya untuk pengembangan lokal /
tangkapan layar. **Jangan dijalankan di server produksi.**

| File | Isi |
|---|---|
| `mbg_demo.sql` | Data demo Dasbor MBG (PR 052b): 52 kejadian Keracunan Pangan MBG (+ perkembangan kasus harian) dan 72 kunjungan Pengawasan Gizi MBG dengan Formulir 1–13, 15 kab/kota di 5 provinsi, Mei–Nov 2026, koordinat di `data.lat/lng`. 14 SPPG muncul di kedua modul (tautan risiko). Semua baris bertanda `DEMO-MBG-…` dan nama `[DEMO] …`. Menjalankan ulang aman (baris DEMO lama dihapus dulu). |
| `mbg_demo_hapus.sql` | Menghapus seluruh baris `DEMO-MBG-%` (form & update ikut terhapus lewat ON DELETE CASCADE). |
| `gen_mbg_demo.py` | Generator deterministik untuk `mbg_demo.sql` / `mbg_demo_hapus.sql` (`python3 dev/seed/gen_mbg_demo.py` dari root repo). |

Menjalankan (Docker lokal):

```bash
docker exec -i skdr-postgres psql -U skdr -d skdr_indonesia -v ON_ERROR_STOP=1 -q < dev/seed/mbg_demo.sql
docker exec -i skdr-postgres psql -U skdr -d skdr_indonesia -v ON_ERROR_STOP=1 -q < dev/seed/mbg_demo_hapus.sql
```
