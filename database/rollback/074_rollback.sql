-- Rollback 074: Kembalikan palet ke tema logo Kemenkes lama
INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'theme_palette',
  '{"name":"Kemenkes","brand":{"50":"#ECFAF8","100":"#CFF3EE","200":"#9FE6DC","300":"#63D3C5","400":"#2CC3B1","500":"#06B8A5","600":"#04998A","700":"#047A6F","800":"#055E56","900":"#064540"},"accent":"#05BBCC","lime":"#D7DF21","ebs":"#E8710A","pe":"#0A8FA3","ebs_scale":["#FFF1E6","#FDBA74","#F97316","#C2410C","#7C2D12"],"pe_scale":["#E0F6F9","#9EE3EC","#3FC3D4","#0A8FA3","#075E6B"],"all_scale":["#CFF3EE","#63D3C5","#06B8A5","#047A6F","#064540"]}'::jsonb,
  NOW()
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();

DELETE FROM app_settings WHERE key = 'satusehat_design_system_status';
