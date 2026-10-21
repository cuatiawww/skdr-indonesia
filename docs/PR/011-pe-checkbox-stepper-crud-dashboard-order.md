# PR 011 — Form PE: checkbox group, stepper interaktif, CRUD daftar PE; urutan dasbor

## Perubahan
1. **Checkbox group** (`components/pe/PeFields.tsx`): semua field `multiselect` di 4 formulir PE (18 field, termasuk kolom tabel) dirender sebagai checkbox asli + label, grid responsif 1/2/3/4 kolom (`sm`/`lg`/`2xl`), state error merah sama. "Lainnya" memunculkan input teks. Opsi eksklusif (`Tidak ada tanda berat`, `Tidak ada`) menghapus opsi lain dan sebaliknya. Single-select tetap dropdown (tidak ada chip single-select).
2. **Urutan dasbor utama**: 4 kartu ringkasan → peta lebar penuh → CFR, 7-1-7, status PE, cakupan (slot `afterCards` di `ExecutiveSummary`).
3. **Stepper "Kemajuan Pengisian"** (`PeFormEditor.tsx`, dipakai 4 formulir): lingkaran nomor → centang hijau bila lengkap; ikon peringatan amber + jumlah error; langkah aktif disorot & sedikit membesar; garis penghubung terisi sesuai progres; cincin progres per langkah (terisi/wajib); progress bar gradien beranimasi + persentase (mematuhi `prefers-reduced-motion`); sticky di atas; scrollspy + smooth scroll untuk bagian (section) pada langkah aktif; tooltip hover/focus berisi ringkasan isian yang belum valid (maks. 6 + "n lainnya"); scroll horizontal di mobile; tombol "Lompat ke isian berikutnya yang belum valid" (pindah langkah bila perlu, scroll + fokus + sorot field). Catatan: langkah tetap berupa halaman terpisah; scrollspy bekerja pada bagian di dalam langkah aktif.
4. **CRUD daftar PE** (4 formulir):
   - Aksi per baris: Lihat (`?mode=lihat`, hanya baca + banner), Edit (hanya status Draf/Dikembalikan sesuai `workflow.editable_status`; selain itu nonaktif dengan tooltip "Minta verifikator mengembalikan PE untuk revisi"), Hapus (hanya Draf). Tombol "Tambah PE" tetap.
   - Hapus = soft delete: migrasi `020_pe_soft_delete.sql` (`deleted_at`, `deleted_by`, indeks parsial) + `rollback/020_rollback.sql`. Modal konfirmasi merah menampilkan No. PE + inisial pasien (nama lengkap tidak dimuat di daftar demi privasi). Toast sukses/gagal.
   - Backend REST: `GET/PUT/DELETE /api/v1/pe/cases/:id`. DELETE hanya Draf (selain itu 409), dicatat di `pe_case_events` (event `dihapus`). Baris terhapus dikecualikan dari daftar, hitungan status, jumlah per form/klaster, GET/PUT/status/klasifikasi, dan dasbor eksekutif.
   - Filter baru provinsi + kab/kota (selain pencarian, tab status, klasifikasi, paginasi yang sudah ada).
5. Test baru `scripts/pe/pe_crud_test.py`.

## Verifikasi
- cargo test: 7/7 lulus (test membaca skema dari `database/pe`, jadi container test harus me-mount root repo).
- tsc: 0 error. pe_api_test 4/4 PASS. pe_crud_test 4/4 PASS (update, hapus draf OK, hapus status Final ditolak 409, terhapus → 404, tidak muncul di daftar). Audit: `dibuat`→`dihapus` tercatat. Smoke test PASS; halaman 200.
- Playwright: 0 chip, checkbox eksklusif & Lainnya OK; urutan dasbor y 553 < 970 < 1746 < 2332, peta 1536px; stepper sticky (top 0), scrollspy aktif, lompat-ke-invalid memfokuskan field, mobile scroll-x tanpa overflow halaman; mode Lihat 0/30 input aktif; daftar: 20 Lihat, 14 Edit, 6 Edit nonaktif (Final), 14 Hapus, 2 filter wilayah, modal hapus + Batal OK.
- Baris uji PR 011 ("UJI PR011 … Hapus") sengaja di-soft-delete oleh test; baris uji lain tidak dihapus.
