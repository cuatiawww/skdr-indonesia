-- Rollback PR 018 / 033: hapus pengaturan kelas choropleth (frontend kembali ke gradasi lama).
DELETE FROM app_settings WHERE key = 'map_choropleth';
