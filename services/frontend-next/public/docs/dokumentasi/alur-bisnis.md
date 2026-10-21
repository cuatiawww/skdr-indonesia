## Alur bisnis SKDR

Diagram di bawah menggambarkan alur data dari sinyal EBS sampai dasbor. Klik kotak yang bertautan untuk membuka halaman terkait.

```mermaid
flowchart LR
  A["API EBS Kemenkes<br/>(SKDR)"] -->|Sinkronisasi terjadwal| B["Sinkronisasi EBS<br/>ebs_reports"]
  B --> C{"Verifikasi sinyal<br/>sts_rumor"}
  C -->|Discarded| X["Tidak ditindaklanjuti"]
  C -->|Terverifikasi| D["Alert EBS"]
  D -->|Buat PE| E["Form PE: Draf"]
  F["Laporan fasyankes /<br/>penemuan aktif"] --> E
  E -->|Kirim| G["Dikirim"]
  G -->|Verifikator| H{"Verifikasi"}
  H -->|Dikembalikan + catatan| E2["Dikembalikan"]
  E2 -->|Perbaiki lalu kirim| G
  H -->|Terverifikasi| I["Terverifikasi"]
  I -->|Finalkan| J["Final"]
  E -.->|Mesin klasifikasi| K["Klasifikasi kasus<br/>suspek / probabel / konfirmasi"]
  E -.->|Tautkan| L["Klaster / KLB"]
  D --> M["Dasbor eksekutif<br/>(sumber EBS)"]
  G --> N["Dasbor eksekutif<br/>(sumber Kasus PE)"]
  I --> N
  J --> N
  click B "{BASE}/ebs" "Buka Sinkronisasi EBS"
  click E "{BASE}/pe/lepto" "Buka Form PE"
  click M "{BASE}/main-dashboard" "Buka dasbor"
  click N "{BASE}/main-dashboard" "Buka dasbor"
  classDef ebs fill:#fff1e6,stroke:#c2410c,color:#7c2d12
  classDef pe fill:#e0f2fe,stroke:#0060A9,color:#0b3a66
  class A,B,C,D,M ebs
  class E,E2,G,H,I,J,K,L,N,F pe
```

**Warna:** oranye = sumber **EBS** (alert/sinyal), biru = **Kasus PE** (laporan individu). Kedua sumber ditampilkan terpisah dan **tidak pernah dijumlahkan**.

### Status Form PE
| Status | Arti | Siapa | Bisa diedit? | Bisa dihapus? |
|---|---|---|---|---|
| Draf | Sedang diisi, tersimpan otomatis | Petugas | Ya | Ya (soft delete) |
| Dikirim | Diajukan untuk verifikasi | Petugas | Tidak | Tidak |
| Dikembalikan | Dikembalikan verifikator dengan catatan | Verifikator | Ya | Tidak |
| Terverifikasi | Diterima verifikator kab/kota | Verifikator | Tidak | Tidak |
| Final | Dikunci untuk analisis | Verifikator/admin | Tidak | Tidak |

Dasbor eksekutif menghitung Kasus PE berstatus **Dikirim, Terverifikasi, dan Final** (pengaturan `pe_count_statuses`).

## Alur 7-1-7

```mermaid
flowchart LR
  S(["Kejadian muncul<br/>(mulai sakit / pajanan)"]) -->|"Deteksi ≤ 7 hari"| T(["Rumor diketahui<br/>(A.11)"])
  T -->|"Notifikasi ≤ 1 hari"| U(["Dilaporkan ke sistem<br/>(tanggal dibuat EBS)"])
  U -->|"Respons awal ≤ 7 hari"| V(["Tindakan respons awal selesai<br/>(B.20–B.39)"])
  classDef ok fill:#ecfdf5,stroke:#10b981,color:#065f46
  classDef gap fill:#f1f5f9,stroke:#94a3b8,color:#475569
  class U ok
  class T,V gap
```

Saat ini hanya **notifikasi ≤ 1 hari** yang bisa dihitung (tanggal dibuat − tanggal laporan EBS). API EBS belum mengirim tanggal rumor diketahui (A.11) dan tanggal tindakan respons (B.20–B.39), jadi deteksi dan respons ditampilkan sebagai "data belum tersedia".
