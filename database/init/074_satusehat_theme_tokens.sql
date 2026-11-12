-- 074: SATUSEHAT / TTDK Design System v4 Theme Tokens
-- Menyelaraskan palet brand, aksen, dan permukaan dasbor SKDR dengan standar SATUSEHAT Kemenkes RI.
-- Brand Green: #16B3AC (500), #128F8A (600), #0D6B67 (700)
-- Brand Blue: #3899FE (500), #1E81E8 (600)
-- Neutral Surfaces: #FFFFFF (Card), #F1F2F3 (Page), #E4E5E7 (Border)

INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'theme_palette',
  '{"name":"SATUSEHAT","brand":{"50":"#F0FCFB","100":"#E1FBFA","200":"#B8EDEA","300":"#80DCD8","400":"#20D6CD","500":"#16B3AC","600":"#128F8A","700":"#0D6B67","800":"#094845","900":"#062F2D"},"accent":"#3899FE","lime":"#90C821","ebs":"#EC7303","pe":"#16B3AC","ebs_scale":["#FFEAD3","#FFA78A","#FF6A38","#EC7303","#C15100"],"pe_scale":["#E1FBFA","#B8EDEA","#80DCD8","#16B3AC","#0D6B67"],"all_scale":["#E1FBFA","#B8EDEA","#16B3AC","#0D6B67","#062F2D"]}'::jsonb,
  NOW()
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();

-- Catat status migrasi sistem desain SATUSEHAT
INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'satusehat_design_system_status',
  '{"version":"4.0.0","library":"@ttdk-design-system/library-react","font":"Manrope","primary_color":"#16B3AC","accent_color":"#3899FE","enabled":true}'::jsonb,
  NOW()
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();

