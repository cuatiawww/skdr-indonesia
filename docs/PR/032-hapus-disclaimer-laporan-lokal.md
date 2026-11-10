# PR 032 — Hapus disclaimer teks penyimpanan laporan lokal

## Summary
Menghapus teks disclaimer bawah tabel daftar laporan: `"Laporan disimpan di database SKDR Indonesia (lokal) — belum dikirim ke skdr.kemkes.go.id."` pada komponen `LaporanList`.

## Changes
- `services/frontend-next/components/laporan/LaporanList.tsx`: Menghapus elemen `<p className="text-[11px] text-slate-400">Laporan disimpan di database SKDR Indonesia (lokal) — belum dikirim ke skdr.kemkes.go.id.</p>` di bawah tabel laporan.

## Migration
None. Tidak ada perubahan database maupun backend.

## Affected Pages
- `/ebs/laporan` (Daftar Laporan EBS)
- `/ibs/laporan` (Daftar Entri Data Agregat IBS)
- `/ibs/individu` (Daftar Form Individu IBS)

