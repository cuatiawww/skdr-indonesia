-- 006: no login/logout in SKDR for now (Yosua, 2026-10-21). Remove auth tables added in 003.
DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS users;
DELETE FROM app_settings WHERE key IN ('session_idle_timeout_seconds','session_absolute_timeout_seconds');
