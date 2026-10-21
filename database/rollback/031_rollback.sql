-- Rollback PR 018 / 031: hapus konfigurasi penyamaran (backend kembali ke bawaan kode yang sama).
DELETE FROM app_settings WHERE key = 'privacy_masking';
