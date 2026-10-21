-- 024 (PR 016): Kemenkes logo palette as DB theme tokens + source (EBS / Kasus PE) display config for the global Sumber
-- filter. Colours sampled from public/Logo-Kemenkes.png: teal #06B8A5, cyan #05BBCC, lime #D7DF21.
-- Read by /api/v1/console/settings -> SettingsProvider (applyPalette) -> CSS variables; CSS defaults in app/globals.css.
-- Rollback: database/rollback/024_rollback.sql. Previous rows (if any) are kept in app_settings_bak_024.
BEGIN;
CREATE TABLE IF NOT EXISTS app_settings_bak_024 AS SELECT key, value FROM app_settings WHERE key IN ('theme_palette', 'dashboard_sources');
INSERT INTO app_settings (key, value) VALUES
('theme_palette', $tp${"name":"Kemenkes","brand":{"50":"#ECFAF8","100":"#CFF3EE","200":"#9FE6DC","300":"#63D3C5","400":"#2CC3B1","500":"#06B8A5","600":"#04998A","700":"#047A6F","800":"#055E56","900":"#064540"},"accent":"#05BBCC","lime":"#D7DF21","ebs":"#E8710A","pe":"#0A8FA3","ebs_scale":["#FFF1E6","#FDBA74","#F97316","#C2410C","#7C2D12"],"pe_scale":["#E0F6F9","#9EE3EC","#3FC3D4","#0A8FA3","#075E6B"],"all_scale":["#CFF3EE","#63D3C5","#06B8A5","#047A6F","#064540"]}$tp$),
('dashboard_sources', $ds${"default":"all","sources":{"ebs":{"label":"EBS","unit":"sinyal","symbol":"circle"},"pe":{"label":"Kasus PE","unit":"kasus","symbol":"diamond"}},"combined_rule":"EBS (sinyal) dan Kasus PE (kasus individu) tidak pernah dijumlahkan tanpa label; angka gabungan selalu diberi label \"sinyal EBS + kasus PE\"."}$ds$)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
COMMIT;
