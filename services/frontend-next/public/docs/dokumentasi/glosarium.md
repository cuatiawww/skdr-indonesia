## Glosarium

| Istilah | Definisi |
|---|---|
| **EBS** (Event-Based Surveillance) | Surveilans berbasis kejadian: sinyal/rumor dari masyarakat, media, atau fasyankes yang dicatat di SKDR Kemenkes dan disinkronkan ke sistem ini. Satu **alert EBS** bisa berisi lebih dari satu kasus. |
| **Alert EBS** | Satu laporan EBS. Definisi alert per penyakit belum disepakati (sheet No. 36); sementara 1 laporan EBS = 1 alert. |
| **Kasus PE / laporan individu** | Satu orang yang dicatat dalam Form Penyelidikan Epidemiologi. Ini data individu, berbeda dengan alert EBS. |
| **PE** (Penyelidikan Epidemiologi) | Penyelidikan lapangan terhadap kasus atau KLB untuk memastikan diagnosis, mencari sumber, kontak, dan faktor risiko. Di sistem ini diisi lewat Form PE per penyakit (Leptospirosis, Rabies/GHPR, Antraks, Avian Influenza). |
| **Klaster** | Kumpulan kasus yang terkait waktu, tempat, atau sumber pajanan. Satu klaster bisa memiliki banyak Kasus PE. |
| **KLB** (Kejadian Luar Biasa) | Peningkatan kejadian kesakitan/kematian yang bermakna secara epidemiologis pada suatu daerah dalam kurun waktu tertentu. Data pemantauan KLB disimpan pada klaster, bukan pada tiap PE, agar tidak terhitung ganda. |
| **CFR** (Case Fatality Rate) | Kematian ÷ kasus dengan akhir yang diketahui (sembuh atau meninggal) × 100%. Pada dasbor eksekutif hanya dihitung dari kasus **konfirmasi** (rabies: klinis + konfirmasi). Bila penyebut < 10 ditulis sebagai pecahan. |
| **95% CI Wilson** | Selang kepercayaan 95% untuk proporsi dengan metode skor Wilson; lebih stabil dibanding metode Wald untuk angka kecil. |
| **7-1-7** | Target kinerja: deteksi ≤ 7 hari sejak kejadian, notifikasi ≤ 1 hari sejak deteksi, respons awal selesai ≤ 7 hari sejak notifikasi. |
| **Minggu epidemiologi (epi week)** | Minggu kalender epidemiologi (MMWR): dimulai hari Minggu; minggu 1 adalah minggu yang memuat 4 Januari. Label grafik: `M{minggu}/{tahun}`. |
| **Suspek** | Memenuhi kriteria klinis definisi kasus, tanpa bukti epidemiologis/laboratorium yang cukup. |
| **Probabel** | Suspek dengan kaitan epidemiologis atau hasil laboratorium pendukung (bukan konfirmasi). |
| **Konfirmasi** | Dibuktikan dengan pemeriksaan laboratorium konfirmasi sesuai juknis. |
| **GHPR** | Gigitan Hewan Penular Rabies. Kasus GHPR bukan kasus rabies dan tidak dihitung dalam CFR. |
| **Rabies klinis** | Gejala klinis rabies (mis. hidrofobia, aerofobia) dengan riwayat gigitan HPR; dihitung bersama konfirmasi untuk CFR rabies. |

### Klasifikasi per penyakit (ringkas)
| Penyakit | Suspek | Probabel | Konfirmasi |
|---|---|---|---|
| Leptospirosis | Demam akut + nyeri otot/sakit kepala + riwayat pajanan lingkungan berisiko | Suspek + RDT/tanda klinis berat pendukung | MAT/PCR/kultur positif |
| Rabies / GHPR | GHPR: riwayat gigitan HPR | Rabies klinis: gejala neurologis khas | Laboratorium positif |
| Antraks | Gejala kulit/cerna/napas khas + pajanan hewan/produk hewan | Suspek + kaitan epidemiologis dengan kasus/hewan positif | Kultur/PCR B. anthracis positif |
| Avian Influenza | ILI/pneumonia + pajanan unggas/kontak dalam 14 hari | **Definisi "probabel" masih perlu dikonfirmasi** | RT-PCR H5 positif |

Aturan lengkap tersimpan di konfigurasi formulir (versi form) dan diuji dengan unit test mesin klasifikasi.
