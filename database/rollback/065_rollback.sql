-- Rollback PR 048 (065_hide_ebs_ibs_menu_rename_dasbor_skdr.sql): kembalikan menu Dasbor Utama dan aktifkan mod_dasbor_ebs_ibs.
BEGIN;

UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_065 b WHERE a.key = b.key;

DROP TABLE IF EXISTS app_settings_bak_065;

DELETE FROM schema_migrations WHERE filename = '065_hide_ebs_ibs_menu_rename_dasbor_skdr.sql';

COMMIT;

