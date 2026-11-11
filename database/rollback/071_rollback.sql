-- Rollback PR 057: Kembalikan navigation_menu dari app_settings_bak_071
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_settings_bak_071'
  ) THEN
    UPDATE app_settings
    SET value = (SELECT value FROM app_settings_bak_071 WHERE key = 'navigation_menu'),
        updated_at = now()
    WHERE key = 'navigation_menu';

    DROP TABLE app_settings_bak_071;
  END IF;
END $$;

COMMIT;
