"""PR 012: generate database/init/021_penyakit_dashboard.sql (disease reference columns + seed, PE rows in
surveillance_reports, menu Penyakit/Dokumentasi, hide legacy Formulir/Laporan Kasus menu). Content in Bahasa Indonesia;
editable later in Master Data > Data Penyakit. Sources: WHO fact sheets / ICD-10 (2019) codes."""
import json, pathlib
D = {
 'ANTHRAX': ('A22', 'Penyakit infeksi akut yang disebabkan bakteri Bacillus anthracis; zoonosis yang terutama menyerang ternak herbivora.', 'Kulit: benjolan gatal lalu luka berkeropeng hitam (eschar). Pencernaan: mual, muntah, nyeri perut, diare berdarah. Pernapasan: demam, sesak, syok.', 'Kontak dengan hewan/produk hewan sakit, konsumsi daging terkontaminasi, atau menghirup spora. Tidak menular antarmanusia.'),
 'COVID19': ('U07.1', 'Penyakit saluran napas yang disebabkan virus SARS-CoV-2.', 'Demam, batuk, nyeri tenggorokan, hilang penciuman/perasa, sesak napas pada kasus berat.', 'Droplet dan aerosol dari saluran napas orang terinfeksi; kontak dengan permukaan terkontaminasi.'),
 'MPOX': ('B04', 'Penyakit zoonosis akibat virus mpox (orthopoxvirus).', 'Demam, sakit kepala, pembesaran kelenjar getah bening, ruam yang berkembang menjadi lepuh dan keropeng.', 'Kontak erat kulit ke kulit (termasuk seksual), lesi, cairan tubuh, benda terkontaminasi, atau hewan terinfeksi.'),
 'MEASLES': ('B05', 'Penyakit virus yang sangat menular, dapat dicegah dengan imunisasi campak-rubela.', 'Demam tinggi, batuk, pilek, mata merah, bercak Koplik, lalu ruam makulopapular dari wajah ke seluruh tubuh.', 'Droplet dan aerosol (airborne) dari penderita.'),
 'CHIKUNGUNYA': ('A92.0', 'Penyakit virus yang ditularkan nyamuk Aedes.', 'Demam mendadak, nyeri sendi hebat, ruam, sakit kepala, nyeri otot.', 'Gigitan nyamuk Aedes aegypti/albopictus yang terinfeksi.'),
 'DENGUE': ('A97', 'Infeksi virus dengue yang ditularkan nyamuk Aedes; dapat berkembang menjadi demam berdarah dengue.', 'Demam tinggi 2–7 hari, nyeri kepala dan belakang mata, nyeri otot/sendi, ruam, tanda perdarahan; tanda bahaya: nyeri perut, muntah terus, lemas.', 'Gigitan nyamuk Aedes aegypti/albopictus yang terinfeksi.'),
 'CRIMEAN_CONGO_HF': ('A98.0', 'Demam berdarah virus (CCHF) yang ditularkan kutu.', 'Demam mendadak, nyeri otot, pusing, mual, perdarahan.', 'Gigitan kutu Hyalomma, kontak darah/jaringan hewan atau pasien terinfeksi.'),
 'LASSA_FEVER': ('A96.2', 'Demam berdarah virus akut yang endemis di Afrika Barat.', 'Demam, lemas, sakit kepala, nyeri dada, muntah, perdarahan pada kasus berat.', 'Kontak dengan urin/feses tikus Mastomys yang terinfeksi; antarmanusia melalui cairan tubuh.'),
 'RIFT_VALLEY_FEVER': ('A92.4', 'Penyakit virus zoonosis yang terutama menyerang ternak.', 'Demam, nyeri otot dan sendi, sakit kepala; komplikasi mata, ensefalitis, atau perdarahan.', 'Kontak darah/organ hewan terinfeksi atau gigitan nyamuk.'),
 'DIPHTHERIA': ('A36', 'Infeksi bakteri Corynebacterium diphtheriae; dapat dicegah dengan imunisasi DPT.', 'Demam, nyeri tenggorokan, selaput putih keabuan di tenggorok, leher bengkak (bull neck), sesak.', 'Droplet saluran napas dan kontak dengan lesi kulit penderita.'),
 'EBOLA': ('A98.4', 'Penyakit virus Ebola, demam berdarah berat dengan fatalitas tinggi.', 'Demam mendadak, lemas, nyeri otot, sakit kepala, muntah, diare, perdarahan.', 'Kontak langsung dengan darah/cairan tubuh pasien atau hewan terinfeksi.'),
 'LYMPHATIC_FILARIASIS': ('B74', 'Penyakit cacing filaria yang menyerang saluran getah bening (kaki gajah).', 'Demam berulang, peradangan kelenjar getah bening, pembengkakan tungkai/lengan atau skrotum.', 'Gigitan nyamuk yang mengandung larva cacing filaria.'),
 'AVIAN_INFLUENZA': ('J09', 'Influenza A subtipe unggas (mis. H5N1) yang dapat menular ke manusia.', 'Demam ≥38°C, batuk, nyeri tenggorokan, sesak napas; dapat berkembang menjadi pneumonia berat.', 'Kontak dengan unggas sakit/mati atau lingkungan tercemar; penularan antarmanusia sangat terbatas.'),
 'HFMD': ('B08.4', 'Penyakit tangan, kaki, dan mulut akibat enterovirus (mis. Coxsackie A16, EV71), sering pada anak.', 'Demam, sariawan di mulut, ruam/lepuh di telapak tangan dan kaki.', 'Kontak dengan cairan lepuh, ludah, feses, atau droplet penderita.'),
 'HIV_AIDS': ('B20–B24', 'Infeksi Human Immunodeficiency Virus yang melemahkan sistem kekebalan; tahap lanjut disebut AIDS.', 'Awal: gejala mirip flu; lanjut: berat badan turun, diare kronis, infeksi oportunistik.', 'Hubungan seksual, darah (jarum suntik), dan dari ibu ke bayi.'),
 'HANTAVIRUS': ('A98.5', 'Infeksi hantavirus yang ditularkan tikus.', 'Demam, nyeri otot, gangguan ginjal (HFRS) atau sesak napas (HPS).', 'Menghirup debu tercemar urin/feses/ludah tikus.'),
 'HENIPAVIRAL': ('B33.8', 'Infeksi virus genus Henipavirus (Hendra, Nipah, dll.).', 'Demam, sakit kepala, gangguan napas, ensefalitis.', 'Kontak dengan kelelawar buah, hewan perantara, atau cairan tubuh penderita.'),
 'LEPTOSPIROSIS': ('A27', 'Penyakit zoonosis akibat bakteri Leptospira.', 'Demam mendadak, nyeri otot betis, mata merah (conjunctival suffusion), sakit kepala; berat: ikterus, gagal ginjal, perdarahan.', 'Kontak kulit luka/selaput lendir dengan air atau tanah tercemar urin hewan (terutama tikus), terutama saat banjir.'),
 'MERS': ('B34.2', 'Middle East Respiratory Syndrome akibat MERS-CoV.', 'Demam, batuk, sesak napas, pneumonia; kadang diare.', 'Kontak dengan unta dromedaris; antarmanusia melalui kontak erat, terutama di fasilitas kesehatan.'),
 'MALARIA': ('B50–B54', 'Penyakit parasit Plasmodium yang ditularkan nyamuk Anopheles.', 'Demam berulang disertai menggigil dan berkeringat, sakit kepala, anemia.', 'Gigitan nyamuk Anopheles betina yang terinfeksi.'),
 'MARBURG': ('A98.3', 'Penyakit virus Marburg, demam berdarah berat sekerabat Ebola.', 'Demam tinggi, sakit kepala berat, nyeri otot, diare, perdarahan.', 'Kontak dengan kelelawar Rousettus atau cairan tubuh penderita.'),
 'MELIOIDOSIS': ('A24', 'Infeksi bakteri Burkholderia pseudomallei dari tanah dan air.', 'Demam, batuk, nyeri dada, abses, sepsis.', 'Kontak kulit luka dengan tanah/air tercemar, menghirup, atau menelan.'),
 'NIPAH': ('B33.8', 'Penyakit virus Nipah, zoonosis dengan fatalitas tinggi.', 'Demam, sakit kepala, gangguan napas, penurunan kesadaran (ensefalitis).', 'Kontak dengan kelelawar buah atau babi terinfeksi, makanan tercemar, atau cairan tubuh penderita.'),
 'UNKNOWN_DISEASE': ('R69', 'Kejadian penyakit yang penyebabnya belum diketahui atau belum terklasifikasi (Disease X).', 'Bervariasi; perlu penyelidikan epidemiologi dan laboratorium.', 'Belum diketahui.'),
 'PERTUSSIS': ('A37', 'Batuk rejan akibat bakteri Bordetella pertussis; dapat dicegah dengan imunisasi DPT.', 'Batuk beruntun dengan bunyi melengking (whoop), muntah setelah batuk, apnea pada bayi.', 'Droplet saluran napas penderita.'),
 'POLIO': ('A80', 'Poliomielitis akibat virus polio; dapat dicegah dengan imunisasi.', 'Sebagian besar tanpa gejala; lumpuh layu akut (AFP) pada sebagian kecil.', 'Fekal-oral (makanan/air tercemar) dan droplet.'),
 'RABIES': ('A82', 'Penyakit virus yang menyerang saraf pusat, hampir selalu fatal bila gejala muncul.', 'Nyeri/kesemutan di bekas gigitan, demam, gelisah, takut air (hidrofobia), takut udara, kejang, kelumpuhan.', 'Gigitan atau cakaran hewan penular rabies (anjing, kucing, kera) yang terinfeksi.'),
 'TYPHOID': ('A01.0', 'Demam tifoid akibat bakteri Salmonella Typhi.', 'Demam bertahap meningkat, sakit kepala, nyeri perut, sembelit atau diare, lidah kotor.', 'Makanan atau air yang tercemar feses penderita/pembawa.'),
 'TUBERCULOSIS': ('A15–A19', 'Infeksi bakteri Mycobacterium tuberculosis, paling sering menyerang paru.', 'Batuk ≥2 minggu, batuk darah, demam, keringat malam, berat badan turun.', 'Percik renik (airborne) dari penderita TBC paru.'),
 'WEST_NILE': ('A92.3', 'Infeksi virus West Nile yang ditularkan nyamuk Culex.', 'Sebagian besar tanpa gejala; demam, sakit kepala, ruam; berat: ensefalitis.', 'Gigitan nyamuk Culex yang terinfeksi dari burung.'),
 'ZIKA': ('A92.5', 'Infeksi virus Zika yang ditularkan nyamuk Aedes; berisiko mikrosefali pada janin.', 'Demam ringan, ruam, mata merah, nyeri sendi.', 'Gigitan nyamuk Aedes, hubungan seksual, dan dari ibu ke janin.'),
}
q = lambda s: "'" + s.replace("'", "''") + "'"
rows = ',\n'.join(f"  ({q(k)}, {q(v[0])}, {q(v[1])}, {q(v[2])}, {q(v[3])})" for k, v in D.items())
menu_add = [
  {"id": "mod_penyakit", "href": "/penyakit", "icon": "Stethoscope", "label": "Penyakit", "order": 2, "enabled": True},
  {"id": "mod_dokumentasi", "href": "/dokumentasi", "icon": "BookText", "label": "Dokumentasi", "order": 5, "enabled": True},
]
sql = f"""-- 021 (PR 012): disease reference columns (ICD-10, gejala, penularan; description in Bahasa Indonesia), PE rows in
-- surveillance_reports (source 'pe'), menu Penyakit + Dokumentasi, legacy menu "Formulir Laporan Kasus"/"Laporan Kasus" hidden.
-- Generated by scripts/penyakit/emit_021.py. Rollback: database/rollback/021_rollback.sql. case_reports data is NOT dropped.
BEGIN;
CREATE TABLE IF NOT EXISTS master_diseases_bak_021 AS SELECT id, code, description FROM master_diseases;
ALTER TABLE master_diseases ADD COLUMN IF NOT EXISTS icd10 TEXT, ADD COLUMN IF NOT EXISTS symptoms TEXT, ADD COLUMN IF NOT EXISTS transmission TEXT;
UPDATE master_diseases d SET icd10 = v.icd, description = v.descr, symptoms = v.sym, transmission = v.trans, updated_at = now()
FROM (VALUES
{rows}
) AS v(code, icd, descr, sym, trans) WHERE d.code = v.code;

CREATE OR REPLACE VIEW surveillance_reports AS
 SELECT 'form'::text AS source, (r.id)::text AS id, r.disease_id, NULL::text AS diagnosa, r.location_id, r.kabkota_id, r.location_name,
    r.latitude, r.longitude, r.report_date, r.cases, r.deaths, r.is_reviewed, r.created_at, r.notes
   FROM case_reports r
UNION ALL
 SELECT 'ebs'::text, ('ebs-'::text || e.id_ebs), e.disease_id, NULLIF(TRIM(BOTH FROM e.diagnosa), ''::text), e.province_id, e.kabkota_id, NULL::text,
    COALESCE(e.latitude, k.latitude, p.latitude), COALESCE(e.longitude, k.longitude, p.longitude), COALESCE(e.tgl_laporan, (e.create_date)::date),
    e.jml_kasus, LEAST(e.jml_kematian, e.jml_kasus), (e.sts_rumor = 'Terverifikasi'::text),
    COALESCE((e.create_date AT TIME ZONE 'Asia/Jakarta'::text), e.synced_at), NULL::text
   FROM ebs_reports e LEFT JOIN master_kabkota k ON k.id = e.kabkota_id LEFT JOIN master_locations p ON p.id = e.province_id
UNION ALL
 SELECT 'pe'::text, ('pe-'::text || c.id), c.disease_id, NULL::text, c.province_id, c.kabkota_id, NULL::text,
    COALESCE(k.latitude, p.latitude), COALESCE(k.longitude, p.longitude), COALESCE(c.tgl_laporan, c.created_at::date),
    1, CASE WHEN c.outcome = 'Meninggal' THEN 1 ELSE 0 END, c.status IN ('terverifikasi', 'final'), c.created_at, NULL::text
   FROM pe_cases c LEFT JOIN master_kabkota k ON k.id = c.kabkota_id LEFT JOIN master_locations p ON p.id = c.province_id
  WHERE c.deleted_at IS NULL
    AND c.status IN (SELECT jsonb_array_elements_text(value::jsonb -> 'pe_count_statuses') FROM app_settings WHERE key = 'dashboard_executive');

CREATE TABLE IF NOT EXISTS app_settings_bak_021 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';
UPDATE app_settings SET value = (
  SELECT jsonb_agg(CASE WHEN g->>'id' = 'grp_surveillance' THEN jsonb_set(g, '{{items}}', (
      SELECT jsonb_agg(i ORDER BY (i->>'order')::int) FROM (
        SELECT CASE WHEN i->>'id' = 'mod_ebs_sync' THEN jsonb_set(i, '{{order}}', '3') ELSE i END AS i
          FROM jsonb_array_elements(g->'items') i WHERE i->>'id' NOT IN ('mod_case_form', 'mod_case_reports', 'mod_penyakit', 'mod_dokumentasi')
        UNION ALL SELECT x FROM jsonb_array_elements({q(json.dumps(menu_add, ensure_ascii=False))}::jsonb) x) s))
    ELSE g END ORDER BY ord)
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS t(g, ord))::text, updated_at = now()
WHERE key = 'navigation_menu';
COMMIT;
"""
root = pathlib.Path(__file__).resolve().parents[2]
(root / 'database/init/021_penyakit_dashboard.sql').write_text(sql)
(root / 'database/rollback/021_rollback.sql').write_text("""-- Rollback 021 (PR 012)
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_021 b WHERE a.key = b.key;
CREATE OR REPLACE VIEW surveillance_reports AS
 SELECT 'form'::text AS source, (r.id)::text AS id, r.disease_id, NULL::text AS diagnosa, r.location_id, r.kabkota_id, r.location_name,
    r.latitude, r.longitude, r.report_date, r.cases, r.deaths, r.is_reviewed, r.created_at, r.notes
   FROM case_reports r
UNION ALL
 SELECT 'ebs'::text, ('ebs-'::text || e.id_ebs), e.disease_id, NULLIF(TRIM(BOTH FROM e.diagnosa), ''::text), e.province_id, e.kabkota_id, NULL::text,
    COALESCE(e.latitude, k.latitude, p.latitude), COALESCE(e.longitude, k.longitude, p.longitude), COALESCE(e.tgl_laporan, (e.create_date)::date),
    e.jml_kasus, LEAST(e.jml_kematian, e.jml_kasus), (e.sts_rumor = 'Terverifikasi'::text),
    COALESCE((e.create_date AT TIME ZONE 'Asia/Jakarta'::text), e.synced_at), NULL::text
   FROM ebs_reports e LEFT JOIN master_kabkota k ON k.id = e.kabkota_id LEFT JOIN master_locations p ON p.id = e.province_id;
UPDATE master_diseases d SET description = b.description FROM master_diseases_bak_021 b WHERE b.id = d.id;
ALTER TABLE master_diseases DROP COLUMN IF EXISTS icd10, DROP COLUMN IF EXISTS symptoms, DROP COLUMN IF EXISTS transmission;
DROP TABLE IF EXISTS master_diseases_bak_021, app_settings_bak_021;
DELETE FROM schema_migrations WHERE filename = '021_penyakit_dashboard.sql';
COMMIT;
""")
print('ok', len(D))
