## Sumber data dan aturan

### Dua sumber yang tidak dijumlahkan
| | EBS | Kasus PE |
|---|---|---|
| Asal | API SKDR Kemenkes (sinkronisasi) | Form PE di sistem ini |
| Satuan | Alert (laporan sinyal), berisi jumlah kasus/kematian agregat | Satu orang per baris |
| Lencana | **EBS** (oranye) | **Kasus PE** (biru) |
| Dipakai untuk | Alert, % terverifikasi, notifikasi 7-1-7, tren & peta alert | CFR konfirmasi, status alur PE, umur & jenis kelamin, % NIK |

**Aturan spesifikasi:** alert EBS dan Kasus PE **tidak boleh dijumlahkan** menjadi satu total. Setiap kartu dan grafik memakai lencana sumber. Filter global **Sumber** (Semua / EBS / Kasus PE) menampilkan atau menyembunyikan bagian per sumber; pada pilihan "Semua", kedua sumber tetap ditampilkan berdampingan, tidak dijumlah. Peta titik di dasbor utama menampilkan satu sumber (EBS, atau Kasus PE bila filter Sumber = Kasus PE).

### Data pribadi (PII)
- Nama dan nomor telepon pelapor EBS **tidak disimpan**.
- Daftar dan dasbor hanya menampilkan **inisial** pasien; nama lengkap dan NIK hanya ada di detail Form PE.
- Kunci API EBS disimpan di `.env`, tidak pernah ditampilkan atau di-commit.

### Penghapusan data
- Form PE hanya bisa dihapus saat berstatus **Draf**, dengan *soft delete* (`deleted_at`); setiap penghapusan tercatat di riwayat (`pe_case_events`).
- Menu lama **"Formulir Laporan Kasus"** dan **"Laporan Kasus"** (PR 001–003) disembunyikan karena digantikan Form PE. Tabel `case_reports` dan datanya **tidak dihapus**; data lama masih ikut dihitung pada cakupan wilayah dan tersedia lewat API `/api/v1/case-reports`.

### Asumsi terbuka (perlu konfirmasi)
1. **Definisi alert** per penyakit (sheet No. 36). Sementara: 1 laporan EBS = 1 alert.
2. **Avian Influenza "probabel"**: kriteria belum final di sheet; klasifikasi memakai aturan sementara.
3. Arti **"direspons"** dan titik akhir respons 7-1-7.
4. Status klaster **aktif/selesai** (usulan: 2× masa inkubasi tanpa kasus baru).
5. Acuan wilayah: filter memakai wilayah **unit pelapor** (PE) dan wilayah EBS; domisili kasus belum dipakai untuk peta.
6. Pemetaan diagnosa EBS ke master penyakit: alert tanpa pemetaan tidak masuk grafik per penyakit (jumlahnya ditampilkan sebagai catatan).
