# PR 059: Perbaikan Duplikasi React Key `_hasil_view` pada Wizard Pengawasan Gizi MBG

## Masalah
Pada formulir Pengawasan Gizi MBG (terutama Formulir 1 Ketenagaan langkah A.2 dan formulir checklist lainnya), Next.js memicu pesan kesalahan konsol:
```text
Console Error
Encountered two children with the same key, `_hasil_view`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted – the behavior is unsupported and could change in a future version.
```

Penyebabnya adalah fungsi helper `hasil` pada `services/frontend-next/lib/pengawasan-gizi/forms.ts` secara baku memberikan kunci tetap `key: '_hasil_view'` untuk semua baris kesimpulan dan skor. Pada Formulir 1 seksi `a2`, terdapat dua pemanggilan `f1Hasil` berturut-turut (`a2` dan `a`) dalam satu array seksi yang sama, sehingga merender dua komponen bersaudara dengan React key yang identik (`key="_hasil_view"`).

## Solusi
1. **Diferensiasi Kunci pada `services/frontend-next/lib/pengawasan-gizi/forms.ts`**:
   - Memperbarui fungsi `hasil` agar menerima parameter opsional `customKey?: string` dan membangkitkan kunci unik secara kontekstual:
     - `_hasil_f1_${p.f1}` untuk kesimpulan F1 (`_hasil_f1_a1`, `_hasil_f1_a2`, `_hasil_f1_a`, `_hasil_f1_b1`, `_hasil_f1_b2`, `_hasil_f1_all`).
     - `_hasil_f${spec.no}_kes` untuk kesimpulan pada Formulir 2–11.
     - Fallback auto-increment `_hasil_view_${++_hasilSeq}` untuk memastikan setiap field kesimpulan memiliki kunci unik permanen.
2. **Double-Safety pada `services/frontend-next/components/pengawasan-gizi/MbgWizard.tsx`**:
   - Memperbarui pemetaan render field pada baris 380 dan 535 dengan menyertakan indeks array (`key={`${f.key}_${fIdx}`}` dan `key={`${f.key}_${rIdx}`}`) guna menjamin keunikan kunci React secara mutlak dalam list rendering.

## Berkas yang Diubah
- `services/frontend-next/lib/pengawasan-gizi/forms.ts`
- `services/frontend-next/components/pengawasan-gizi/MbgWizard.tsx`
- `docs/PR/059-perbaikan-duplikasi-key-hasil-view-pengawasan-gizi.md`
- `docs/CHANGE_LOG_MATRIX.md`

## Verifikasi
- TypeScript Typecheck (`docker exec skdr-frontend-next npx tsc --noEmit`): **0 error**.
- Verifikasi konsol React: Tidak ada lagi pesan peringatan/error duplikasi key `_hasil_view`.
