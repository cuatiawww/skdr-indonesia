-- 038: External Integrations & Map Layers (BNPB, Flight Connect, NASA FIRMS, Satwa Liar GBIF)
-- PR 020: API sync pages and layer endpoints
-- Rollback: database/rollback/038_rollback.sql
BEGIN;

-- 1. Sync log table for all external integrations
CREATE TABLE IF NOT EXISTS external_sync_logs (
  id BIGSERIAL PRIMARY KEY,
  service TEXT NOT NULL CHECK (service IN ('bnpb', 'flight', 'firms', 'wildlife')),
  trigger TEXT NOT NULL CHECK (trigger IN ('jadwal', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('berjalan', 'sukses', 'gagal')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  items_fetched INT NOT NULL DEFAULT 0,
  items_upserted INT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_ext_sync_service ON external_sync_logs (service, started_at DESC);

-- 2. Indonesian airports network
CREATE TABLE IF NOT EXISTS airports (
  id BIGSERIAL PRIMARY KEY,
  iata VARCHAR(3) NOT NULL UNIQUE,
  icao VARCHAR(4),
  name TEXT NOT NULL,
  city TEXT,
  country_iso2 VARCHAR(2) NOT NULL DEFAULT 'ID',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  airport_type VARCHAR(30) NOT NULL DEFAULT 'large_airport',
  degree INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_airports_iata ON airports (iata);
CREATE INDEX IF NOT EXISTS idx_airports_country ON airports (country_iso2) WHERE is_active;

-- Seed commercial airports in Indonesia
INSERT INTO airports (iata, icao, name, city, country_iso2, latitude, longitude, airport_type, degree, is_active) VALUES
  ('CGK', 'WIII', 'Bandara Internasional Soekarno-Hatta', 'Jakarta / Tangerang', 'ID', -6.1256, 106.6559, 'large_airport', 52, true),
  ('SUB', 'WARR', 'Bandara Internasional Juanda', 'Surabaya / Sidoarjo', 'ID', -7.3798, 112.7874, 'large_airport', 38, true),
  ('DPS', 'WADD', 'Bandara Internasional I Gusti Ngurah Rai', 'Denpasar / Bali', 'ID', -8.7482, 115.1672, 'large_airport', 42, true),
  ('UPG', 'WAAA', 'Bandara Internasional Sultan Hasanuddin', 'Makassar', 'ID', -5.0617, 119.5540, 'large_airport', 32, true),
  ('KNO', 'WIMM', 'Bandara Internasional Kualanamu', 'Medan / Deli Serdang', 'ID', 3.6422, 98.8853, 'large_airport', 30, true),
  ('BPN', 'WALL', 'Bandara Internasional Sultan Aji Muhammad Sulaiman Sepinggan', 'Balikpapan', 'ID', -1.2683, 116.8944, 'large_airport', 24, true),
  ('YIA', 'WAHI', 'Bandara Internasional Yogyakarta', 'Kulon Progo', 'ID', -7.9072, 110.0544, 'large_airport', 26, true),
  ('SRG', 'WAHS', 'Bandara Internasional Jenderal Ahmad Yani', 'Semarang', 'ID', -6.9742, 110.3744, 'large_airport', 20, true),
  ('BDO', 'WICC', 'Bandara Husein Sastranegara', 'Bandung', 'ID', -6.9006, 107.5762, 'medium_airport', 16, true),
  ('PLM', 'WIPP', 'Bandara Sultan Mahmud Badaruddin II', 'Palembang', 'ID', -2.8983, 104.7000, 'large_airport', 22, true),
  ('PKU', 'WIBB', 'Bandara Sultan Syarif Kasim II', 'Pekanbaru', 'ID', 0.4608, 101.4444, 'large_airport', 20, true),
  ('BTH', 'WIDD', 'Bandara Internasional Hang Nadim', 'Batam', 'ID', 1.1211, 104.1189, 'large_airport', 26, true),
  ('MDC', 'WAMM', 'Bandara Internasional Sam Ratulangi', 'Manado', 'ID', 1.5492, 124.9264, 'large_airport', 18, true),
  ('AMQ', 'WAPP', 'Bandara Pattimura', 'Ambon', 'ID', -3.7094, 128.0894, 'medium_airport', 16, true),
  ('DJJ', 'WAJJ', 'Bandara Internasional Sentani', 'Jayapura', 'ID', -2.5769, 140.5161, 'large_airport', 18, true),
  ('KOE', 'WATT', 'Bandara El Tari', 'Kupang', 'ID', -10.1714, 123.6711, 'medium_airport', 16, true),
  ('LOP', 'WADL', 'Bandara Internasional Lombok Zainuddin Abdul Madjid', 'Praya / Lombok', 'ID', -8.7583, 116.2764, 'large_airport', 22, true),
  ('PNK', 'WIOO', 'Bandara Supadio', 'Pontianak / Kubu Raya', 'ID', -0.1506, 109.4039, 'large_airport', 18, true),
  ('BDJ', 'WAOO', 'Bandara Internasional Syamsudin Noor', 'Banjarmasin / Banjarbaru', 'ID', -3.4422, 114.7578, 'large_airport', 18, true),
  ('PDG', 'WIEE', 'Bandara Internasional Minangkabau', 'Padang', 'ID', -0.7869, 100.2806, 'large_airport', 18, true),
  ('BTJ', 'WITT', 'Bandara Internasional Sultan Iskandar Muda', 'Banda Aceh', 'ID', 5.5156, 95.4206, 'large_airport', 14, true),
  ('SOQ', 'WASS', 'Bandara Domine Eduard Osok', 'Sorong', 'ID', -0.8911, 131.2869, 'medium_airport', 14, true)
ON CONFLICT (iata) DO UPDATE SET
  name = EXCLUDED.name,
  city = EXCLUDED.city,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  degree = EXCLUDED.degree,
  updated_at = now();

-- 3. Indonesian flight routes network
CREATE TABLE IF NOT EXISTS flight_routes (
  id BIGSERIAL PRIMARY KEY,
  origin_iata VARCHAR(3) NOT NULL,
  dest_iata VARCHAR(3) NOT NULL,
  origin_name TEXT,
  dest_name TEXT,
  origin_lat DOUBLE PRECISION NOT NULL,
  origin_lon DOUBLE PRECISION NOT NULL,
  dest_lat DOUBLE PRECISION NOT NULL,
  dest_lon DOUBLE PRECISION NOT NULL,
  airline TEXT DEFAULT 'ID',
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(origin_iata, dest_iata)
);
CREATE INDEX IF NOT EXISTS idx_flight_routes_origin ON flight_routes (origin_iata);
CREATE INDEX IF NOT EXISTS idx_flight_routes_dest ON flight_routes (dest_iata);

-- Seed connecting routes in Indonesia
INSERT INTO flight_routes (origin_iata, dest_iata, origin_name, dest_name, origin_lat, origin_lon, dest_lat, dest_lon) VALUES
  ('CGK', 'SUB', 'Soekarno-Hatta', 'Juanda', -6.1256, 106.6559, -7.3798, 112.7874),
  ('SUB', 'CGK', 'Juanda', 'Soekarno-Hatta', -7.3798, 112.7874, -6.1256, 106.6559),
  ('CGK', 'DPS', 'Soekarno-Hatta', 'Ngurah Rai', -6.1256, 106.6559, -8.7482, 115.1672),
  ('DPS', 'CGK', 'Ngurah Rai', 'Soekarno-Hatta', -8.7482, 115.1672, -6.1256, 106.6559),
  ('CGK', 'UPG', 'Soekarno-Hatta', 'Sultan Hasanuddin', -6.1256, 106.6559, -5.0617, 119.5540),
  ('UPG', 'CGK', 'Sultan Hasanuddin', 'Soekarno-Hatta', -5.0617, 119.5540, -6.1256, 106.6559),
  ('CGK', 'KNO', 'Soekarno-Hatta', 'Kualanamu', -6.1256, 106.6559, 3.6422, 98.8853),
  ('KNO', 'CGK', 'Kualanamu', 'Soekarno-Hatta', 3.6422, 98.8853, -6.1256, 106.6559),
  ('CGK', 'BPN', 'Soekarno-Hatta', 'Sepinggan', -6.1256, 106.6559, -1.2683, 116.8944),
  ('BPN', 'CGK', 'Sepinggan', 'Soekarno-Hatta', -1.2683, 116.8944, -6.1256, 106.6559),
  ('CGK', 'YIA', 'Soekarno-Hatta', 'Yogyakarta International', -6.1256, 106.6559, -7.9072, 110.0544),
  ('YIA', 'CGK', 'Yogyakarta International', 'Soekarno-Hatta', -7.9072, 110.0544, -6.1256, 106.6559),
  ('CGK', 'SRG', 'Soekarno-Hatta', 'Ahmad Yani', -6.1256, 106.6559, -6.9742, 110.3744),
  ('SRG', 'CGK', 'Ahmad Yani', 'Soekarno-Hatta', -6.9742, 110.3744, -6.1256, 106.6559),
  ('CGK', 'BTH', 'Soekarno-Hatta', 'Hang Nadim', -6.1256, 106.6559, 1.1211, 104.1189),
  ('BTH', 'CGK', 'Hang Nadim', 'Soekarno-Hatta', 1.1211, 104.1189, -6.1256, 106.6559),
  ('SUB', 'DPS', 'Juanda', 'Ngurah Rai', -7.3798, 112.7874, -8.7482, 115.1672),
  ('DPS', 'SUB', 'Ngurah Rai', 'Juanda', -8.7482, 115.1672, -7.3798, 112.7874),
  ('SUB', 'UPG', 'Juanda', 'Sultan Hasanuddin', -7.3798, 112.7874, -5.0617, 119.5540),
  ('UPG', 'SUB', 'Sultan Hasanuddin', 'Juanda', -5.0617, 119.5540, -7.3798, 112.7874),
  ('SUB', 'BPN', 'Juanda', 'Sepinggan', -7.3798, 112.7874, -1.2683, 116.8944),
  ('BPN', 'SUB', 'Sepinggan', 'Juanda', -1.2683, 116.8944, -7.3798, 112.7874),
  ('UPG', 'MDC', 'Sultan Hasanuddin', 'Sam Ratulangi', -5.0617, 119.5540, 1.5492, 124.9264),
  ('MDC', 'UPG', 'Sam Ratulangi', 'Sultan Hasanuddin', 1.5492, 124.9264, -5.0617, 119.5540),
  ('UPG', 'AMQ', 'Sultan Hasanuddin', 'Pattimura', -5.0617, 119.5540, -3.7094, 128.0894),
  ('AMQ', 'UPG', 'Pattimura', 'Sultan Hasanuddin', -3.7094, 128.0894, -5.0617, 119.5540),
  ('UPG', 'DJJ', 'Sultan Hasanuddin', 'Sentani', -5.0617, 119.5540, -2.5769, 140.5161),
  ('DJJ', 'UPG', 'Sentani', 'Sultan Hasanuddin', -2.5769, 140.5161, -5.0617, 119.5540),
  ('DPS', 'LOP', 'Ngurah Rai', 'Lombok', -8.7482, 115.1672, -8.7583, 116.2764),
  ('LOP', 'DPS', 'Lombok', 'Ngurah Rai', -8.7583, 116.2764, -8.7482, 115.1672),
  ('DPS', 'KOE', 'Ngurah Rai', 'El Tari', -8.7482, 115.1672, -10.1714, 123.6711),
  ('KOE', 'DPS', 'El Tari', 'Ngurah Rai', -10.1714, 123.6711, -8.7482, 115.1672),
  ('CGK', 'PLM', 'Soekarno-Hatta', 'Sultan Mahmud Badaruddin II', -6.1256, 106.6559, -2.8983, 104.7000),
  ('PLM', 'CGK', 'Sultan Mahmud Badaruddin II', 'Soekarno-Hatta', -2.8983, 104.7000, -6.1256, 106.6559),
  ('CGK', 'PKU', 'Soekarno-Hatta', 'Sultan Syarif Kasim II', -6.1256, 106.6559, 0.4608, 101.4444),
  ('PKU', 'CGK', 'Sultan Syarif Kasim II', 'Soekarno-Hatta', 0.4608, 101.4444, -6.1256, 106.6559),
  ('CGK', 'PDG', 'Soekarno-Hatta', 'Minangkabau', -6.1256, 106.6559, -0.7869, 100.2806),
  ('PDG', 'CGK', 'Minangkabau', 'Soekarno-Hatta', -0.7869, 100.2806, -6.1256, 106.6559),
  ('CGK', 'PNK', 'Soekarno-Hatta', 'Supadio', -6.1256, 106.6559, -0.1506, 109.4039),
  ('PNK', 'CGK', 'Supadio', 'Soekarno-Hatta', -0.1506, 109.4039, -6.1256, 106.6559),
  ('CGK', 'BDJ', 'Soekarno-Hatta', 'Syamsudin Noor', -6.1256, 106.6559, -3.4422, 114.7578),
  ('BDJ', 'CGK', 'Syamsudin Noor', 'Soekarno-Hatta', -3.4422, 114.7578, -6.1256, 106.6559)
ON CONFLICT (origin_iata, dest_iata) DO NOTHING;

-- 4. BNPB InaRISK Layer Metadata
CREATE TABLE IF NOT EXISTS bnpb_layers_meta (
  id SERIAL PRIMARY KEY,
  layer_key VARCHAR(50) NOT NULL UNIQUE,
  layer_name TEXT NOT NULL,
  service_url TEXT NOT NULL,
  kind VARCHAR(30) NOT NULL,
  opacity DOUBLE PRECISION NOT NULL DEFAULT 0.6,
  status VARCHAR(20) NOT NULL DEFAULT 'aktif',
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_ms INT DEFAULT 0
);

INSERT INTO bnpb_layers_meta (layer_key, layer_name, service_url, kind, opacity, status) VALUES
  ('flood', 'Bahaya Banjir', 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_banjir/ImageServer', 'arcgis-image', 0.6, 'aktif'),
  ('earthquake', 'Bahaya Gempa Bumi', 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_gempabumi/ImageServer', 'arcgis-image', 0.65, 'aktif'),
  ('landslide', 'Bahaya Tanah Longsor', 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_tanah_longsor/ImageServer', 'arcgis-image', 0.6, 'aktif'),
  ('forestFire', 'Bahaya Kebakaran Hutan & Lahan', 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_kebakaran_hutan_dan_lahan/ImageServer', 'arcgis-image', 0.6, 'aktif'),
  ('hillshade', 'Indo Hillshade Basemap', 'https://gis.bnpb.go.id/server/rest/services/Basemap/Indo_Hillshade/MapServer', 'arcgis-map', 0.45, 'aktif'),
  ('population', 'Kepadatan Penduduk 2020', 'https://gis.bnpb.go.id/server/rest/services/Basemap/Kepadatan_penduduk_2020/MapServer', 'arcgis-map', 0.5, 'aktif')
ON CONFLICT (layer_key) DO UPDATE SET
  layer_name = EXCLUDED.layer_name,
  service_url = EXCLUDED.service_url,
  kind = EXCLUDED.kind,
  opacity = EXCLUDED.opacity,
  status = EXCLUDED.status,
  last_checked_at = now();

-- 5. Seed initial mock sync log for each service
INSERT INTO external_sync_logs (service, trigger, status, items_fetched, items_upserted, duration_ms, finished_at) VALUES
  ('bnpb', 'jadwal', 'sukses', 6, 6, 420, now()),
  ('flight', 'jadwal', 'sukses', 22, 42, 850, now()),
  ('firms', 'jadwal', 'sukses', 184, 184, 1200, now()),
  ('wildlife', 'jadwal', 'sukses', 120, 120, 1450, now())
ON CONFLICT DO NOTHING;

-- 6. Update app_settings.navigation_menu to expand grp_integrasi with all 5 sync modules
CREATE TABLE IF NOT EXISTS app_settings_bak_035 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';

UPDATE app_settings SET value = (
  SELECT jsonb_agg(
    CASE
      WHEN g->>'id' = 'grp_integrasi' THEN
        jsonb_set(
          g,
          '{items}',
          '[
            {"id": "mod_ebs_sync", "label": "Sinkronisasi EBS", "href": "/ebs", "icon": "Radio", "description": "Penarikan dan pemantauan data sinyal EBS", "order": 1, "enabled": true},
            {"id": "mod_bnpb_sync", "label": "Sinkronisasi BNPB", "href": "/integrasi/bnpb", "icon": "ShieldAlert", "description": "Pemantauan lapisan bahaya bencana InaRISK BNPB", "order": 2, "enabled": true},
            {"id": "mod_flight_sync", "label": "Sinkronisasi Flight Connect", "href": "/integrasi/flight", "icon": "Plane", "description": "Jaringan bandara dan rute konektivitas penerbangan", "order": 3, "enabled": true},
            {"id": "mod_firms_sync", "label": "Sinkronisasi NASA FIRMS", "href": "/integrasi/firms", "icon": "Flame", "description": "Deteksi titik panas kebakaran aktif satelit VIIRS", "order": 4, "enabled": true},
            {"id": "mod_wildlife_sync", "label": "Sinkronisasi Satwa Liar", "href": "/integrasi/satwa-liar", "icon": "Bird", "description": "Peringatan dini flu burung dari catatan satwa liar GBIF", "order": 5, "enabled": true}
          ]'::jsonb
        )
      ELSE g
    END
    ORDER BY i
  )
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY x(g, i)
), updated_at = now()
WHERE key = 'navigation_menu';

COMMIT;
