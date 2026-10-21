-- PR 018: penyamaran data pribadi pada teks bebas EBS (kronologi/tindakan/saran) di respons API.
-- Data tersimpan tidak diubah. keywords: sapaan/kata kunci yang diikuti nama (bisa ditambah tanpa ubah kode);
-- stop_words: kata berhuruf kapital yang bukan nama; style: "initials" (R. H.) atau "label" ([nama disamarkan]).
-- Rollback: rollback/031_rollback.sql
INSERT INTO app_settings (key, value, updated_at)
VALUES ('privacy_masking', '{"enabled": true, "style": "initials", "max_name_words": 4, "mask_nik": true, "mask_phone": true, "keywords": ["an.", "tn.", "ny.", "nn.", "sdr.", "sdri.", "bpk.", "bapak", "pak", "ibu", "bu", "by.", "alm.", "almh.", "pasien", "penderita", "korban", "a.n.", "atas nama", "nama:", "nama pasien", "bernama"], "stop_words": ["usia", "umur", "berusia", "berumur", "thn", "th", "tahun", "bln", "bulan", "dengan", "dan", "di", "ke", "dari", "yang", "laki", "laki-laki", "perempuan", "lk", "pr", "alamat", "warga", "ds", "desa", "dusun", "kel", "kec", "rt", "rw", "jl", "jalan", "dirawat", "dirujuk", "meninggal", "mengalami", "digigit", "sejak", "pada", "tgl", "tanggal", "rs", "rsud", "puskesmas", "pkm", "kab", "kota", "provinsi", "umurnya"]}', now())
ON CONFLICT (key) DO NOTHING;
