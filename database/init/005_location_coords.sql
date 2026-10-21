-- 005: province capital coordinates (approximate) so form reports can be mapped; backfill old reports.
UPDATE master_locations m SET latitude = v.lat, longitude = v.lng FROM (VALUES
 ('11',5.55,95.32),('12',3.59,98.67),('13',-0.95,100.35),('14',0.51,101.45),('15',-1.61,103.61),
 ('16',-2.99,104.76),('17',-3.80,102.27),('18',-5.43,105.26),('19',-2.13,106.11),('21',0.92,104.45),
 ('31',-6.21,106.85),('32',-6.91,107.61),('33',-6.97,110.42),('34',-7.80,110.37),('35',-7.25,112.75),
 ('36',-6.12,106.15),('51',-8.65,115.22),('52',-8.58,116.12),('53',-10.18,123.61),('61',-0.03,109.33),
 ('62',-2.21,113.92),('63',-3.44,114.83),('64',-0.50,117.15),('65',2.84,117.37),('71',1.47,124.84),
 ('72',-0.90,119.87),('73',-5.15,119.43),('74',-3.97,122.51),('75',0.54,123.06),('76',-2.68,118.89),
 ('81',-3.70,128.18),('82',0.74,127.56),('91',-2.53,140.72),('92',-0.86,134.06),('93',-8.49,140.40),
 ('94',-3.37,135.50),('95',-4.09,138.95),('96',-0.88,131.25)
) v(code, lat, lng) WHERE m.code = v.code AND m.country_iso2 = 'ID';

UPDATE case_reports r SET
  country_id = COALESCE(r.country_id, (SELECT id FROM master_countries WHERE iso2 = l.country_iso2)),
  location_name = COALESCE(r.location_name, l.name),
  latitude = COALESCE(r.latitude, l.latitude),
  longitude = COALESCE(r.longitude, l.longitude)
FROM master_locations l WHERE l.id = r.location_id;

INSERT INTO app_settings (key, value) VALUES
 ('navigation_menu', '[{"id":"grp_surveillance","title":"SURVEILLANCE","order":1,"enabled":true,"items":[{"id":"mod_main_dashboard","label":"Main Dashboard","icon":"LayoutDashboard","href":"/main-dashboard","order":1,"enabled":true},{"id":"mod_case_form","label":"Case Report Form","icon":"FileText","href":"/form","order":2,"enabled":true},{"id":"mod_case_reports","label":"Case Reports","icon":"FileSpreadsheet","href":"/reports","order":3,"enabled":true}]}]'),
 ('session_idle_timeout_seconds', '28800'),
 ('session_absolute_timeout_seconds', '604800')
ON CONFLICT (key) DO NOTHING;
