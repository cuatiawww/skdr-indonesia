-- Rollback PR 020 / 038: external_sync_logs, airports, flight_routes, bnpb_layers_meta
BEGIN;

DROP TABLE IF EXISTS bnpb_layers_meta CASCADE;
DROP TABLE IF EXISTS flight_routes CASCADE;
DROP TABLE IF EXISTS airports CASCADE;
DROP TABLE IF EXISTS external_sync_logs CASCADE;

-- Restore navigation menu if needed
UPDATE app_settings
SET val = jsonb_set(
  val,
  '{navigation_menu}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN elem->>'id' = 'grp_integrasi' THEN
          jsonb_set(
            elem,
            '{items}',
            jsonb_build_array(
              jsonb_build_object('id', 'nav_ebs', 'label', 'Sinkronisasi EBS', 'href', '/ebs', 'icon', 'Radio', 'target', '_self')
            )
          )
        ELSE elem
      END
    )
    FROM jsonb_array_elements(val->'navigation_menu') elem
  )
)
WHERE key = 'ui';

COMMIT;
