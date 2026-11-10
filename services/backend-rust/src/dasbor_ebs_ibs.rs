//! PR 035: Dasbor SKDR EBS & IBS — analitik langsung dari tabel transaksi form:
//! * Halaman 1 (EBS): `laporan_ebs`
//! * Halaman 2 (IBS): `laporan_ibs` (Entri Data Agregat) + `laporan_ibs_individu` (Form Individu)
//! Seluruh angka, tren, heatmap, dan titik peta berasal langsung dari data transaksi + master wilayah/fasyankes.
//! Tidak ada data dummy/hardcoded/fallback, dan tidak ada field PII pasien/pelapor yang diekspos.
use axum::{extract::{Query, State}, Json};
use chrono::{Datelike, NaiveDate};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use tokio_postgres::types::ToSql;

use crate::laporan::{mmwr_week_one, weeks_in_year};
use crate::{internal, ApiError, AppState};

// ─── Shared helpers ───────────────────────────────────────────────────────────

fn csv_text(s: &Option<String>) -> Vec<String> {
    s.as_deref()
        .unwrap_or("")
        .split(',')
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty() && x != "all")
        .collect()
}

fn csv_ints(s: &Option<String>) -> Vec<i32> {
    s.as_deref()
        .unwrap_or("")
        .split(',')
        .filter_map(|x| x.trim().parse::<i32>().ok())
        .collect()
}

fn opt_str(s: &Option<String>) -> Option<String> {
    s.as_ref()
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty() && x != "all")
}

fn opt_date(s: &Option<String>) -> Option<NaiveDate> {
    s.as_deref()
        .map(str::trim)
        .filter(|x| !x.is_empty())
        .and_then(|x| NaiveDate::parse_from_str(x, "%Y-%m-%d").ok())
}

fn json_int(v: Option<&Value>) -> i64 {
    match v {
        Some(Value::Number(n)) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)).unwrap_or(0),
        Some(Value::String(s)) => s.trim().parse::<i64>().unwrap_or(0),
        _ => 0,
    }
    .max(0)
}

fn json_dec(v: Option<&Value>) -> Option<f64> {
    match v {
        Some(Value::Number(n)) => n.as_f64().filter(|f| f.is_finite() && *f > 0.0),
        Some(Value::String(s)) => s
            .trim()
            .replace(',', ".")
            .parse::<f64>()
            .ok()
            .filter(|f| f.is_finite() && *f > 0.0),
        _ => None,
    }
}

fn json_nonempty(v: Option<&Value>) -> bool {
    matches!(v, Some(Value::String(s)) if !s.trim().is_empty())
}

/// MMWR (year, week) for a calendar date — mirrors `lib/epi-week.ts`.
pub fn mmwr_week_of(d: NaiveDate) -> (i32, i32) {
    let y = d.year();
    let w1_next = mmwr_week_one(y + 1);
    if d >= w1_next {
        return (y + 1, 1);
    }
    let w1_cur = mmwr_week_one(y);
    if d < w1_cur {
        let w1_prev = mmwr_week_one(y - 1);
        let w = (((d - w1_prev).num_days() / 7) + 1) as i32;
        return (y - 1, w.max(1));
    }
    let w = (((d - w1_cur).num_days() / 7) + 1) as i32;
    (y, w.max(1))
}

fn week_start_date(year: i32, week: i32) -> NaiveDate {
    mmwr_week_one(year) + chrono::Duration::days((week - 1) as i64 * 7)
}

fn week_label(year: i32, week: i32) -> String {
    format!("M{week:02}/{:02}", year % 100)
}

/// Builds a contiguous MMWR week axis covering all observed `(year, week)` pairs (capped at last 52 weeks if huge).
fn build_week_axis(observed: &[(i32, i32)]) -> Vec<(i32, i32, String, String)> {
    if observed.is_empty() {
        return vec![];
    }
    let min_pair = *observed.iter().min().unwrap();
    let max_pair = *observed.iter().max().unwrap();
    let mut all = vec![];
    let (mut y, mut w) = min_pair;
    let mut guard = 0;
    while (y, w) <= max_pair && guard < 260 {
        all.push((y, w, week_start_date(y, w).format("%Y-%m-%d").to_string(), week_label(y, w)));
        w += 1;
        if w > weeks_in_year(y) {
            w = 1;
            y += 1;
        }
        guard += 1;
    }
    if all.len() > 52 {
        all.split_off(all.len() - 52)
    } else {
        all
    }
}

fn pct(num: i64, den: i64) -> Option<f64> {
    if den > 0 {
        Some((num as f64 * 1000.0 / den as f64).round() / 10.0)
    } else {
        None
    }
}

fn n(r: &tokio_postgres::Row, i: usize) -> i64 {
    r.get(i)
}

// ─── 1. DASBOR EBS (from `laporan_ebs`) ───────────────────────────────────────

#[derive(Deserialize, Default)]
pub struct EbsDashQuery {
    pub status: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub province_id: Option<String>,
    pub kabkota_id: Option<String>,
    pub penyakit: Option<String>,
    pub jenis_unit: Option<String>,
    pub status_kejadian: Option<String>,
    pub klb: Option<String>,
    pub level: Option<String>,
    pub parent: Option<i32>,
}

const USIA_BANDS: &[(&str, &str)] = &[
    ("0_7hr", "0–7 hr"),
    ("8_28hr", "8–28 hr"),
    ("lt1th", "< 1 th"),
    ("1_4th", "1–4 th"),
    ("5_9th", "5–9 th"),
    ("10_14th", "10–14 th"),
    ("15_19th", "15–19 th"),
    ("20_44th", "20–44 th"),
    ("45_54th", "45–54 th"),
    ("55_69th", "55–69 th"),
    ("gt70th", "≥ 70 th"),
];

const EBS_WHERE: &str = "l.deleted_at IS NULL
    AND ($1::text IS NULL OR l.status = $1)
    AND ($2::date IS NULL OR COALESCE(l.tgl_rumor, l.tgl_laporan) >= $2)
    AND ($3::date IS NULL OR COALESCE(l.tgl_rumor, l.tgl_laporan) <= $3)
    AND (cardinality($4::int[]) = 0 OR l.province_id = ANY($4))
    AND (cardinality($5::int[]) = 0 OR l.kabkota_id = ANY($5))
    AND (cardinality($6::text[]) = 0 OR COALESCE(NULLIF(trim(l.penyakit_rumor),''), '') = ANY($6) OR COALESCE(NULLIF(trim(l.data->>'penyakit_terverifikasi'),''), '') = ANY($6))
    AND (cardinality($7::text[]) = 0 OR COALESCE(NULLIF(trim(l.data->>'jenis_unit'),''), '') = ANY($7))
    AND (cardinality($8::text[]) = 0 OR COALESCE(NULLIF(trim(l.data->>'status_kejadian'),''), '') = ANY($8))
    AND ($9::text IS NULL OR COALESCE(NULLIF(trim(l.data->>'klb'),''), '') = $9)";

/// GET /api/v1/dasbor/ebs-ibs/ebs
pub async fn ebs(State(st): State<AppState>, Query(q): Query<EbsDashQuery>) -> Result<Json<Value>, ApiError> {
    let c = st.pool.get().await.map_err(internal)?;
    let status = opt_str(&q.status).filter(|s| s == "dikirim" || s == "draf");
    let from = opt_date(&q.from);
    let to = opt_date(&q.to);
    let prov = csv_ints(&q.province_id);
    let kab = csv_ints(&q.kabkota_id);
    let penyakit = csv_text(&q.penyakit);
    let jenis_unit = csv_text(&q.jenis_unit);
    let status_kejadian = csv_text(&q.status_kejadian);
    let klb = opt_str(&q.klb).filter(|s| s == "Ya" || s == "Tidak");
    let params: Vec<&(dyn ToSql + Sync)> = vec![&status, &from, &to, &prov, &kab, &penyakit, &jenis_unit, &status_kejadian, &klb];

    // 1) KPIs & intervention counts
    let kpi_sql = format!(
        "SELECT
            COUNT(*)::bigint,
            COUNT(*) FILTER (WHERE l.status = 'dikirim')::bigint,
            COUNT(*) FILTER (WHERE l.status = 'draf')::bigint,
            COALESCE(SUM(COALESCE(l.jml_kasus, 0)), 0)::bigint,
            COALESCE(SUM(COALESCE(l.jml_kematian, 0)), 0)::bigint,
            COUNT(*) FILTER (WHERE l.data->>'klb' = 'Ya')::bigint,
            COUNT(*) FILTER (WHERE l.data->>'klb' = 'Ya' AND l.data->>'klb_status' = 'Masih Berlangsung')::bigint,
            COUNT(*) FILTER (WHERE l.data->>'klb' = 'Ya' AND l.data->>'klb_status' = 'Berakhir')::bigint,
            COUNT(*) FILTER (WHERE l.data->>'spesimen' = 'Ya')::bigint,
            COALESCE(SUM(CASE WHEN l.data->>'spesimen' = 'Ya' AND COALESCE(l.data->>'lab_jml_diperiksa','') ~ '^[0-9]+$' THEN (l.data->>'lab_jml_diperiksa')::bigint ELSE 0 END), 0)::bigint,
            COALESCE(SUM(CASE WHEN l.data->>'spesimen' = 'Ya' AND COALESCE(l.data->>'lab_jml_positif','') ~ '^[0-9]+$' THEN (l.data->>'lab_jml_positif')::bigint ELSE 0 END), 0)::bigint,
            COUNT(*) FILTER (WHERE l.data->>'tatalaksana' = 'Ya')::bigint,
            COUNT(*) FILTER (WHERE l.data->>'klb' = 'Ya' AND l.data->>'w1' = 'Ya')::bigint,
            COUNT(*) FILTER (WHERE l.data->>'klb' = 'Ya' AND l.data->>'sk_klb' = 'Ya')::bigint,
            COUNT(*) FILTER (WHERE l.data->>'klb' = 'Ya' AND l.data->>'tgc' = 'Ya')::bigint,
            COUNT(*) FILTER (WHERE l.data->>'pfr' = 'Ya')::bigint,
            COUNT(*) FILTER (WHERE l.data->>'komrisk' = 'Ya')::bigint,
            COUNT(*) FILTER (WHERE l.data->>'koordinasi' = 'Ya')::bigint,
            COUNT(DISTINCT NULLIF(COALESCE(NULLIF(trim(l.data->>'unit_kode'),''), lower(trim(COALESCE(l.unit_nama,'')))), ''))::bigint,
            COUNT(DISTINCT l.province_id)::bigint,
            COUNT(DISTINCT l.kabkota_id)::bigint,
            MIN(COALESCE(l.tgl_rumor, l.tgl_laporan))::text,
            MAX(COALESCE(l.tgl_rumor, l.tgl_laporan))::text
         FROM laporan_ebs l WHERE {EBS_WHERE}"
    );
    let kr = c.query_one(&kpi_sql, &params).await.map_err(internal)?;
    let total_lap = n(&kr, 0);
    let total_kasus = n(&kr, 3);
    let total_kematian = n(&kr, 4);

    // 2) Breakdowns
    let by_dis_rows = c
        .query(
            &format!(
                "SELECT COALESCE(NULLIF(trim(l.penyakit_rumor),''), '(Belum diisi)'),
                        COUNT(*)::bigint,
                        COALESCE(SUM(COALESCE(l.jml_kasus,0)),0)::bigint,
                        COALESCE(SUM(COALESCE(l.jml_kematian,0)),0)::bigint,
                        COUNT(*) FILTER (WHERE l.data->>'klb' = 'Ya')::bigint,
                        COUNT(*) FILTER (WHERE COALESCE(l.data->>'status_kejadian','') LIKE 'Terverifikasi%')::bigint
                 FROM laporan_ebs l WHERE {EBS_WHERE}
                 GROUP BY 1 ORDER BY 3 DESC, 2 DESC LIMIT 20"
            ),
            &params,
        )
        .await
        .map_err(internal)?;

    let by_sts_rows = c
        .query(
            &format!(
                "SELECT COALESCE(NULLIF(trim(l.data->>'status_kejadian'),''), '(Belum diisi)'),
                        COUNT(*)::bigint,
                        COALESCE(SUM(COALESCE(l.jml_kasus,0)),0)::bigint,
                        COALESCE(SUM(COALESCE(l.jml_kematian,0)),0)::bigint
                 FROM laporan_ebs l WHERE {EBS_WHERE}
                 GROUP BY 1 ORDER BY 2 DESC"
            ),
            &params,
        )
        .await
        .map_err(internal)?;

    let by_sumber_rows = c
        .query(
            &format!(
                "SELECT COALESCE(NULLIF(trim(l.data->>'sumber_informasi'),''), '(Belum diisi)'),
                        COUNT(*)::bigint,
                        COALESCE(SUM(COALESCE(l.jml_kasus,0)),0)::bigint
                 FROM laporan_ebs l WHERE {EBS_WHERE}
                 GROUP BY 1 ORDER BY 2 DESC LIMIT 15"
            ),
            &params,
        )
        .await
        .map_err(internal)?;

    let by_unit_rows = c
        .query(
            &format!(
                "SELECT COALESCE(NULLIF(trim(l.data->>'jenis_unit'),''), '(Belum diisi)'),
                        COUNT(*)::bigint,
                        COALESCE(SUM(COALESCE(l.jml_kasus,0)),0)::bigint,
                        COUNT(DISTINCT NULLIF(COALESCE(NULLIF(trim(l.data->>'unit_kode'),''), lower(trim(COALESCE(l.unit_nama,'')))), ''))::bigint
                 FROM laporan_ebs l WHERE {EBS_WHERE}
                 GROUP BY 1 ORDER BY 2 DESC"
            ),
            &params,
        )
        .await
        .map_err(internal)?;

    let by_lab_rows = c
        .query(
            &format!(
                "SELECT COALESCE(NULLIF(trim(l.data->>'lab_hasil'),''), '(Belum diisi)'),
                        COUNT(*)::bigint,
                        COALESCE(SUM(CASE WHEN COALESCE(l.data->>'lab_jml_diperiksa','') ~ '^[0-9]+$' THEN (l.data->>'lab_jml_diperiksa')::bigint ELSE 0 END), 0)::bigint,
                        COALESCE(SUM(CASE WHEN COALESCE(l.data->>'lab_jml_positif','') ~ '^[0-9]+$' THEN (l.data->>'lab_jml_positif')::bigint ELSE 0 END), 0)::bigint
                 FROM laporan_ebs l WHERE {EBS_WHERE} AND l.data->>'spesimen' = 'Ya'
                 GROUP BY 1 ORDER BY 2 DESC LIMIT 15"
            ),
            &params,
        )
        .await
        .map_err(internal)?;

    let by_tl_rows = c
        .query(
            &format!(
                "SELECT t.item, COUNT(*)::bigint
                 FROM laporan_ebs l,
                      LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(l.data->'tatalaksana_jenis') = 'array' THEN l.data->'tatalaksana_jenis' ELSE '[]'::jsonb END) AS t(item)
                 WHERE {EBS_WHERE} AND l.data->>'tatalaksana' = 'Ya'
                 GROUP BY 1 ORDER BY 2 DESC"
            ),
            &params,
        )
        .await
        .map_err(internal)?;

    // 3) Intervensi matrix (exact field values: Ya / Tidak / Belum diisi)
    let interv_rows = c
        .query(
            &format!(
                "SELECT
                    COALESCE(NULLIF(trim(l.data->>'spesimen'),''), '(Belum diisi)'),
                    COALESCE(NULLIF(trim(l.data->>'tatalaksana'),''), '(Belum diisi)'),
                    COALESCE(NULLIF(trim(l.data->>'klb'),''), '(Belum diisi)'),
                    COALESCE(NULLIF(trim(l.data->>'pfr'),''), '(Belum diisi)'),
                    COALESCE(NULLIF(trim(l.data->>'komrisk'),''), '(Belum diisi)'),
                    COALESCE(NULLIF(trim(l.data->>'koordinasi'),''), '(Belum diisi)'),
                    l.data->'usia',
                    COALESCE(l.tgl_rumor, l.tgl_laporan),
                    l.status,
                    l.province_id,
                    COALESCE(ml.name, '(Belum diisi)'),
                    COALESCE(NULLIF(trim(l.penyakit_rumor),''), '(Belum diisi)'),
                    COALESCE(l.jml_kasus, 0)::bigint,
                    COALESCE(l.jml_kematian, 0)::bigint,
                    COALESCE(l.data->>'klb' = 'Ya', FALSE)
                 FROM laporan_ebs l
                 LEFT JOIN master_locations ml ON ml.id = l.province_id
                 WHERE {EBS_WHERE}"
            ),
            &params,
        )
        .await
        .map_err(internal)?;

    // Aggregate age pyramid, intervention breakdown, weekly trend, and heatmap in one pass
    let mut usia_pria = vec![0i64; USIA_BANDS.len()];
    let mut usia_wanita = vec![0i64; USIA_BANDS.len()];
    let mut interv_counts: [HashMap<String, i64>; 6] = Default::default();
    let mut week_map: BTreeMap<(i32, i32), (i64, i64, i64, i64, i64, i64)> = BTreeMap::new(); // (lap, dikirim, draf, kasus, kematian, klb)
    let mut heat_prov: HashMap<String, (Option<i32>, String, HashMap<(i32, i32), (i64, i64)>, i64, i64, i64)> = HashMap::new();
    let mut heat_dis: HashMap<String, (HashMap<(i32, i32), (i64, i64)>, i64, i64, i64)> = HashMap::new();
    let mut obs_weeks: Vec<(i32, i32)> = vec![];

    for r in &interv_rows {
        for idx in 0..6 {
            let v: String = r.get(idx);
            *interv_counts[idx].entry(v).or_insert(0) += 1;
        }
        if let Some(Value::Object(u)) = r.get::<_, Option<Value>>(6) {
            for (bi, (bk, _)) in USIA_BANDS.iter().enumerate() {
                if let Some(Value::Object(pm)) = u.get("pria") {
                    usia_pria[bi] += json_int(pm.get(*bk));
                }
                if let Some(Value::Object(wm)) = u.get("wanita") {
                    usia_wanita[bi] += json_int(wm.get(*bk));
                }
            }
        }
        let dt: Option<NaiveDate> = r.get(7);
        let st_str: String = r.get(8);
        let pid: Option<i32> = r.get(9);
        let pname: String = r.get(10);
        let dis: String = r.get(11);
        let ks: i64 = r.get(12);
        let km: i64 = r.get(13);
        let is_klb: bool = r.get(14);
        if let Some(d) = dt {
            let yw = mmwr_week_of(d);
            obs_weeks.push(yw);
            let e = week_map.entry(yw).or_insert((0, 0, 0, 0, 0, 0));
            e.0 += 1;
            if st_str == "dikirim" { e.1 += 1; } else { e.2 += 1; }
            e.3 += ks;
            e.4 += km;
            if is_klb { e.5 += 1; }

            let pk = pid.map(|x| x.to_string()).unwrap_or_else(|| "none".into());
            let pe = heat_prov.entry(pk).or_insert_with(|| (pid, pname.clone(), HashMap::new(), 0, 0, 0));
            let pw = pe.2.entry(yw).or_insert((0, 0));
            pw.0 += 1;
            pw.1 += ks;
            pe.3 += 1;
            pe.4 += ks;
            pe.5 += km;

            let de = heat_dis.entry(dis.clone()).or_insert_with(|| (HashMap::new(), 0, 0, 0));
            let dw = de.0.entry(yw).or_insert((0, 0));
            dw.0 += 1;
            dw.1 += ks;
            de.1 += 1;
            de.2 += ks;
            de.3 += km;
        }
    }

    let axis = build_week_axis(&obs_weeks);
    let mut hp_rows: Vec<_> = heat_prov
        .into_values()
        .map(|(pid, name, wm, t_lap, t_ks, t_km)| {
            let vals_lap: Vec<i64> = axis.iter().map(|(y, w, _, _)| wm.get(&(*y, *w)).map(|x| x.0).unwrap_or(0)).collect();
            let vals_ks: Vec<i64> = axis.iter().map(|(y, w, _, _)| wm.get(&(*y, *w)).map(|x| x.1).unwrap_or(0)).collect();
            json!({ "id": pid, "name": name, "values_laporan": vals_lap, "values_kasus": vals_ks,
                    "total_laporan": t_lap, "total_kasus": t_ks, "total_kematian": t_km })
        })
        .collect();
    hp_rows.sort_by(|a, b| b["total_kasus"].as_i64().cmp(&a["total_kasus"].as_i64()).then_with(|| b["total_laporan"].as_i64().cmp(&a["total_laporan"].as_i64())));

    let mut hd_rows: Vec<_> = heat_dis
        .into_iter()
        .map(|(name, (wm, t_lap, t_ks, t_km))| {
            let vals_lap: Vec<i64> = axis.iter().map(|(y, w, _, _)| wm.get(&(*y, *w)).map(|x| x.0).unwrap_or(0)).collect();
            let vals_ks: Vec<i64> = axis.iter().map(|(y, w, _, _)| wm.get(&(*y, *w)).map(|x| x.1).unwrap_or(0)).collect();
            json!({ "name": name, "values_laporan": vals_lap, "values_kasus": vals_ks,
                    "total_laporan": t_lap, "total_kasus": t_ks, "total_kematian": t_km })
        })
        .collect();
    hd_rows.sort_by(|a, b| b["total_kasus"].as_i64().cmp(&a["total_kasus"].as_i64()).then_with(|| b["total_laporan"].as_i64().cmp(&a["total_laporan"].as_i64())));

    // 4) Map Choropleth + Spatial Points
    let level = q.level.clone().filter(|x| x == "kab").unwrap_or_else(|| "prov".into());
    let mut map_params = params.clone();
    let parent_id = q.parent;
    let map_regions = if level == "kab" {
        let extra = if parent_id.is_some() {
            map_params.push(parent_id.as_ref().unwrap());
            "AND l.province_id = $10"
        } else {
            ""
        };
        c.query(
            &format!(
                "SELECT l.kabkota_id::text, COALESCE(k.name, '(Belum diisi)'), replace(k.kemendagri_code, '.', ''),
                        k.latitude::float8, k.longitude::float8,
                        COUNT(*)::bigint,
                        COUNT(*) FILTER (WHERE l.status = 'dikirim')::bigint,
                        COUNT(*) FILTER (WHERE l.status = 'draf')::bigint,
                        COALESCE(SUM(COALESCE(l.jml_kasus,0)),0)::bigint,
                        COALESCE(SUM(COALESCE(l.jml_kematian,0)),0)::bigint,
                        COUNT(*) FILTER (WHERE l.data->>'klb' = 'Ya')::bigint,
                        COUNT(*) FILTER (WHERE l.data->>'spesimen' = 'Ya')::bigint,
                        COUNT(DISTINCT NULLIF(COALESCE(NULLIF(trim(l.data->>'unit_kode'),''), lower(trim(COALESCE(l.unit_nama,'')))), ''))::bigint
                 FROM laporan_ebs l
                 JOIN master_kabkota k ON k.id = l.kabkota_id
                 WHERE {EBS_WHERE} {extra}
                 GROUP BY 1, k.name, k.kemendagri_code, k.latitude, k.longitude
                 ORDER BY 9 DESC, 6 DESC"
            ),
            &map_params,
        )
        .await
        .map_err(internal)?
    } else {
        c.query(
            &format!(
                "SELECT l.province_id::text, ml.name, ml.code,
                        ml.latitude::float8, ml.longitude::float8,
                        COUNT(*)::bigint,
                        COUNT(*) FILTER (WHERE l.status = 'dikirim')::bigint,
                        COUNT(*) FILTER (WHERE l.status = 'draf')::bigint,
                        COALESCE(SUM(COALESCE(l.jml_kasus,0)),0)::bigint,
                        COALESCE(SUM(COALESCE(l.jml_kematian,0)),0)::bigint,
                        COUNT(*) FILTER (WHERE l.data->>'klb' = 'Ya')::bigint,
                        COUNT(*) FILTER (WHERE l.data->>'spesimen' = 'Ya')::bigint,
                        COUNT(DISTINCT NULLIF(COALESCE(NULLIF(trim(l.data->>'unit_kode'),''), lower(trim(COALESCE(l.unit_nama,'')))), ''))::bigint
                 FROM laporan_ebs l
                 JOIN master_locations ml ON ml.id = l.province_id
                 WHERE {EBS_WHERE}
                 GROUP BY 1, ml.name, ml.code, ml.latitude, ml.longitude
                 ORDER BY 9 DESC, 6 DESC"
            ),
            &params,
        )
        .await
        .map_err(internal)?
    };

    let map_points = c
        .query(
            &format!(
                "SELECT
                    COALESCE(NULLIF(trim(MAX(l.unit_nama)),''), MAX(k.name), MAX(ml.name), 'Unit Pelapor'),
                    MAX(NULLIF(trim(l.data->>'jenis_unit'),'')),
                    MAX(ml.name),
                    MAX(k.name),
                    COALESCE(MAX(f.latitude), MAX(k.latitude), MAX(ml.latitude))::float8 AS lat,
                    COALESCE(MAX(f.longitude), MAX(k.longitude), MAX(ml.longitude))::float8 AS lng,
                    CASE WHEN MAX(f.latitude) IS NOT NULL THEN 'fasyankes'
                         WHEN MAX(k.latitude) IS NOT NULL THEN 'kabkota'
                         WHEN MAX(ml.latitude) IS NOT NULL THEN 'provinsi'
                         ELSE NULL END AS coord_source,
                    COUNT(*)::bigint,
                    COALESCE(SUM(COALESCE(l.jml_kasus,0)),0)::bigint,
                    COALESCE(SUM(COALESCE(l.jml_kematian,0)),0)::bigint,
                    COUNT(*) FILTER (WHERE l.data->>'klb' = 'Ya')::bigint,
                    MAX(COALESCE(l.tgl_rumor, l.tgl_laporan))::text
                 FROM laporan_ebs l
                 LEFT JOIN master_fasyankes f ON f.kode_satusehat = NULLIF(trim(l.data->>'unit_kode'),'')
                 LEFT JOIN master_kabkota k ON k.id = l.kabkota_id
                 LEFT JOIN master_locations ml ON ml.id = l.province_id
                 WHERE {EBS_WHERE}
                 GROUP BY COALESCE(NULLIF(trim(l.data->>'unit_kode'),''), lower(trim(COALESCE(l.unit_nama,'')))), l.kabkota_id, l.province_id
                 HAVING COALESCE(MAX(f.latitude), MAX(k.latitude), MAX(ml.latitude)) IS NOT NULL
                    AND COALESCE(MAX(f.longitude), MAX(k.longitude), MAX(ml.longitude)) IS NOT NULL
                 ORDER BY 9 DESC, 8 DESC
                 LIMIT 500"
            ),
            &params,
        )
        .await
        .map_err(internal)?;

    // 5) Recent non-PII summary rows
    let recent_rows = c
        .query(
            &format!(
                "SELECT l.id, l.no_laporan, l.status, l.tgl_laporan::text, l.tgl_rumor::text,
                        l.penyakit_rumor, l.data->>'penyakit_terverifikasi', l.data->>'status_kejadian',
                        ml.name, k.name, l.unit_nama, l.data->>'jenis_unit',
                        l.jml_kasus, l.jml_kematian, l.data->>'klb', l.data->>'klb_status', l.data->>'spesimen'
                 FROM laporan_ebs l
                 LEFT JOIN master_locations ml ON ml.id = l.province_id
                 LEFT JOIN master_kabkota k ON k.id = l.kabkota_id
                 WHERE {EBS_WHERE}
                 ORDER BY COALESCE(l.submitted_at, l.updated_at) DESC
                 LIMIT 50"
            ),
            &params,
        )
        .await
        .map_err(internal)?;

    // 6) Dynamic filter options derived strictly from actual `laporan_ebs` records
    let opt_prov = c.query("SELECT DISTINCT ml.id, ml.name FROM laporan_ebs l JOIN master_locations ml ON ml.id = l.province_id WHERE l.deleted_at IS NULL ORDER BY ml.name", &[]).await.map_err(internal)?;
    let opt_kab = c.query("SELECT DISTINCT k.id, k.province_id, k.name FROM laporan_ebs l JOIN master_kabkota k ON k.id = l.kabkota_id WHERE l.deleted_at IS NULL ORDER BY k.name", &[]).await.map_err(internal)?;
    let opt_dis = c.query("SELECT DISTINCT v FROM (SELECT NULLIF(trim(penyakit_rumor),'') AS v FROM laporan_ebs WHERE deleted_at IS NULL UNION SELECT NULLIF(trim(data->>'penyakit_terverifikasi'),'') FROM laporan_ebs WHERE deleted_at IS NULL) t WHERE v IS NOT NULL ORDER BY 1", &[]).await.map_err(internal)?;
    let opt_ju = c.query("SELECT DISTINCT NULLIF(trim(data->>'jenis_unit'),'') AS v FROM laporan_ebs WHERE deleted_at IS NULL AND NULLIF(trim(data->>'jenis_unit'),'') IS NOT NULL ORDER BY 1", &[]).await.map_err(internal)?;
    let opt_sk = c.query("SELECT DISTINCT NULLIF(trim(data->>'status_kejadian'),'') AS v FROM laporan_ebs WHERE deleted_at IS NULL AND NULLIF(trim(data->>'status_kejadian'),'') IS NOT NULL ORDER BY 1", &[]).await.map_err(internal)?;
    let opt_range = c.query_one("SELECT MIN(COALESCE(tgl_rumor, tgl_laporan))::text, MAX(COALESCE(tgl_rumor, tgl_laporan))::text FROM laporan_ebs WHERE deleted_at IS NULL", &[]).await.map_err(internal)?;

    let interv_labels = [
        ("spesimen", "Pengambilan Spesimen"),
        ("tatalaksana", "Tata Laksana Kasus"),
        ("klb", "Memenuhi Kriteria KLB"),
        ("pfr", "Pengendalian Faktor Risiko"),
        ("komrisk", "Komunikasi Risiko"),
        ("koordinasi", "Koordinasi Lintas Sektor/LP"),
    ];

    Ok(Json(json!({
        "success": true,
        "data": {
            "kpis": {
                "total_laporan": total_lap,
                "dikirim": n(&kr, 1),
                "draf": n(&kr, 2),
                "total_kasus": total_kasus,
                "total_kematian": total_kematian,
                "cfr_pct": pct(total_kematian, total_kasus),
                "klb_ya": n(&kr, 5),
                "klb_berlangsung": n(&kr, 6),
                "klb_berakhir": n(&kr, 7),
                "spesimen_ya": n(&kr, 8),
                "lab_diperiksa": n(&kr, 9),
                "lab_positif": n(&kr, 10),
                "tatalaksana_ya": n(&kr, 11),
                "w1_ya": n(&kr, 12),
                "sk_klb_ya": n(&kr, 13),
                "tgc_ya": n(&kr, 14),
                "pfr_ya": n(&kr, 15),
                "komrisk_ya": n(&kr, 16),
                "koordinasi_ya": n(&kr, 17),
                "unit_unik": n(&kr, 18),
                "provinsi_unik": n(&kr, 19),
                "kabkota_unik": n(&kr, 20),
                "date_min": kr.get::<_, Option<String>>(21),
                "date_max": kr.get::<_, Option<String>>(22),
            },
            "weekly_trend": week_map.into_iter().map(|((y, w), (lap, dik, dr, ks, km, klb))| json!({
                "year": y, "week": w,
                "week_start": week_start_date(y, w).format("%Y-%m-%d").to_string(),
                "label": week_label(y, w),
                "laporan": lap, "dikirim": dik, "draf": dr, "kasus": ks, "kematian": km, "klb": klb
            })).collect::<Vec<_>>(),
            "by_disease": by_dis_rows.iter().map(|r| json!({
                "penyakit": r.get::<_, String>(0),
                "laporan": n(r, 1), "kasus": n(r, 2), "kematian": n(r, 3), "klb": n(r, 4), "terverifikasi": n(r, 5)
            })).collect::<Vec<_>>(),
            "by_status_kejadian": by_sts_rows.iter().map(|r| json!({
                "status_kejadian": r.get::<_, String>(0), "laporan": n(r, 1), "kasus": n(r, 2), "kematian": n(r, 3)
            })).collect::<Vec<_>>(),
            "by_sumber_informasi": by_sumber_rows.iter().map(|r| json!({
                "sumber": r.get::<_, String>(0), "laporan": n(r, 1), "kasus": n(r, 2)
            })).collect::<Vec<_>>(),
            "by_jenis_unit": by_unit_rows.iter().map(|r| json!({
                "jenis_unit": r.get::<_, String>(0), "laporan": n(r, 1), "kasus": n(r, 2), "unit_unik": n(r, 3)
            })).collect::<Vec<_>>(),
            "by_lab_hasil": by_lab_rows.iter().map(|r| json!({
                "hasil": r.get::<_, String>(0), "laporan": n(r, 1), "diperiksa": n(r, 2), "positif": n(r, 3)
            })).collect::<Vec<_>>(),
            "by_tatalaksana": by_tl_rows.iter().map(|r| json!({
                "jenis": r.get::<_, String>(0), "count": n(r, 1)
            })).collect::<Vec<_>>(),
            "intervensi": interv_labels.iter().enumerate().map(|(i, (k, lbl))| json!({
                "key": k, "label": lbl,
                "ya": interv_counts[i].get("Ya").copied().unwrap_or(0),
                "tidak": interv_counts[i].get("Tidak").copied().unwrap_or(0),
                "kosong": interv_counts[i].get("(Belum diisi)").copied().unwrap_or(0),
            })).collect::<Vec<_>>(),
            "age_sex_pyramid": USIA_BANDS.iter().enumerate().map(|(i, (k, lbl))| json!({
                "band": k, "label": lbl, "pria": usia_pria[i], "wanita": usia_wanita[i], "total": usia_pria[i] + usia_wanita[i]
            })).collect::<Vec<_>>(),
            "heatmap": {
                "weeks": axis.iter().map(|(y, w, s, l)| json!({ "year": y, "week": w, "start": s, "label": l })).collect::<Vec<_>>(),
                "by_province": hp_rows,
                "by_disease": hd_rows,
            },
            "map": {
                "level": level,
                "parent": parent_id,
                "regions": map_regions.iter().map(|r| json!({
                    "key": r.get::<_, String>(0),
                    "name": r.get::<_, String>(1),
                    "geo": r.get::<_, String>(2),
                    "lat": r.get::<_, Option<f64>>(3),
                    "lng": r.get::<_, Option<f64>>(4),
                    "laporan": n(r, 5), "dikirim": n(r, 6), "draf": n(r, 7),
                    "kasus": n(r, 8), "kematian": n(r, 9), "klb": n(r, 10), "spesimen": n(r, 11), "unit_unik": n(r, 12)
                })).collect::<Vec<_>>(),
                "points": map_points.iter().map(|r| json!({
                    "unit_nama": r.get::<_, String>(0),
                    "jenis_unit": r.get::<_, Option<String>>(1),
                    "province_name": r.get::<_, Option<String>>(2),
                    "kabkota_name": r.get::<_, Option<String>>(3),
                    "lat": r.get::<_, f64>(4),
                    "lng": r.get::<_, f64>(5),
                    "coord_source": r.get::<_, Option<String>>(6),
                    "laporan": n(r, 7), "kasus": n(r, 8), "kematian": n(r, 9), "klb": n(r, 10),
                    "last_date": r.get::<_, Option<String>>(11),
                })).collect::<Vec<_>>(),
            },
            "recent_reports": recent_rows.iter().map(|r| json!({
                "id": r.get::<_, i64>(0),
                "no_laporan": r.get::<_, String>(1),
                "status": r.get::<_, String>(2),
                "tgl_laporan": r.get::<_, Option<String>>(3),
                "tgl_rumor": r.get::<_, Option<String>>(4),
                "penyakit_rumor": r.get::<_, Option<String>>(5),
                "penyakit_terverifikasi": r.get::<_, Option<String>>(6),
                "status_kejadian": r.get::<_, Option<String>>(7),
                "province_name": r.get::<_, Option<String>>(8),
                "kabkota_name": r.get::<_, Option<String>>(9),
                "unit_nama": r.get::<_, Option<String>>(10),
                "jenis_unit": r.get::<_, Option<String>>(11),
                "jml_kasus": r.get::<_, Option<i32>>(12),
                "jml_kematian": r.get::<_, Option<i32>>(13),
                "klb": r.get::<_, Option<String>>(14),
                "klb_status": r.get::<_, Option<String>>(15),
                "spesimen": r.get::<_, Option<String>>(16),
            })).collect::<Vec<_>>(),
            "filter_options": {
                "provinces": opt_prov.iter().map(|r| json!({ "id": r.get::<_, i32>(0), "name": r.get::<_, String>(1) })).collect::<Vec<_>>(),
                "kabkota": opt_kab.iter().map(|r| json!({ "id": r.get::<_, i32>(0), "province_id": r.get::<_, i32>(1), "name": r.get::<_, String>(2) })).collect::<Vec<_>>(),
                "penyakit": opt_dis.iter().map(|r| r.get::<_, String>(0)).collect::<Vec<_>>(),
                "jenis_unit": opt_ju.iter().map(|r| r.get::<_, String>(0)).collect::<Vec<_>>(),
                "status_kejadian": opt_sk.iter().map(|r| r.get::<_, String>(0)).collect::<Vec<_>>(),
                "date_min": opt_range.get::<_, Option<String>>(0),
                "date_max": opt_range.get::<_, Option<String>>(1),
            }
        }
    })))
}

// ─── 2. DASBOR IBS (from `laporan_ibs` + `laporan_ibs_individu`) ──────────────

#[derive(Deserialize, Default)]
pub struct IbsDashQuery {
    pub status: Option<String>,
    pub ibs_source: Option<String>,
    pub tahun: Option<i32>,
    pub start_week: Option<i32>,
    pub end_week: Option<i32>,
    pub province_id: Option<String>,
    pub kabkota_id: Option<String>,
    pub penyakit: Option<String>,
    pub jenis_unit: Option<String>,
    pub level: Option<String>,
    pub parent: Option<i32>,
}

const AGE_GROUPS: &[&str] = &[
    "< 1 th",
    "1–4 th",
    "5–9 th",
    "10–14 th",
    "15–19 th",
    "20–44 th",
    "45–59 th",
    "≥ 60 th",
    "(Belum diisi)",
];

fn age_group_of(d: &serde_json::Map<String, Value>) -> &'static str {
    let yt = json_int_opt(d.get("umur_tahun"));
    let yb = json_int_opt(d.get("umur_bulan"));
    let yh = json_int_opt(d.get("umur_hari"));
    if yt.is_none() && yb.is_none() && yh.is_none() {
        return "(Belum diisi)";
    }
    let y = yt.unwrap_or(0) as f64 + yb.unwrap_or(0) as f64 / 12.0 + yh.unwrap_or(0) as f64 / 365.0;
    if y < 1.0 { "< 1 th" }
    else if y < 5.0 { "1–4 th" }
    else if y < 10.0 { "5–9 th" }
    else if y < 15.0 { "10–14 th" }
    else if y < 20.0 { "15–19 th" }
    else if y < 45.0 { "20–44 th" }
    else if y < 60.0 { "45–59 th" }
    else { "≥ 60 th" }
}

fn json_int_opt(v: Option<&Value>) -> Option<i64> {
    match v {
        Some(Value::Number(n)) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)).filter(|x| *x >= 0),
        Some(Value::String(s)) if !s.trim().is_empty() => s.trim().parse::<i64>().ok().filter(|x| *x >= 0),
        _ => None,
    }
}

#[derive(Default)]
struct VitalAcc {
    count: i64,
    sum: f64,
    min: Option<f64>,
    max: Option<f64>,
}

impl VitalAcc {
    fn push(&mut self, v: Option<f64>) {
        if let Some(x) = v {
            self.count += 1;
            self.sum += x;
            self.min = Some(match self.min { Some(m) => m.min(x), None => x });
            self.max = Some(match self.max { Some(m) => m.max(x), None => x });
        }
    }
    fn to_json(&self) -> Value {
        if self.count == 0 {
            json!({ "count": 0, "avg": null, "min": null, "max": null })
        } else {
            let avg = (self.sum / self.count as f64 * 10.0).round() / 10.0;
            json!({ "count": self.count, "avg": avg, "min": self.min, "max": self.max })
        }
    }
}

const IBS_WHERE: &str = "l.deleted_at IS NULL
    AND ($1::text IS NULL OR l.status = $1)
    AND ($2::int IS NULL OR l.tahun = $2)
    AND ($3::int IS NULL OR l.minggu >= $3)
    AND ($4::int IS NULL OR l.minggu <= $4)
    AND (cardinality($5::int[]) = 0 OR l.province_id = ANY($5))
    AND (cardinality($6::int[]) = 0 OR l.kabkota_id = ANY($6))
    AND cardinality($7::text[]) >= 0
    AND (cardinality($8::text[]) = 0 OR COALESCE(NULLIF(trim(l.data->>'jenis_unit'),''), '') = ANY($8))";

const IND_WHERE: &str = "i.deleted_at IS NULL
    AND ($1::text IS NULL OR i.status = $1)
    AND ($2::int IS NULL OR i.tahun = $2)
    AND ($3::int IS NULL OR i.minggu >= $3)
    AND ($4::int IS NULL OR i.minggu <= $4)
    AND (cardinality($5::int[]) = 0 OR i.province_id = ANY($5))
    AND (cardinality($6::int[]) = 0 OR i.kabkota_id = ANY($6))
    AND (cardinality($7::text[]) = 0 OR i.penyakit = ANY($7))
    AND (cardinality($8::text[]) = 0 OR COALESCE(NULLIF(trim(i.data->>'jenis_unit'),''), '') = ANY($8))";

/// GET /api/v1/dasbor/ebs-ibs/ibs
pub async fn ibs(State(st): State<AppState>, Query(q): Query<IbsDashQuery>) -> Result<Json<Value>, ApiError> {
    let c = st.pool.get().await.map_err(internal)?;
    let status = opt_str(&q.status).filter(|s| s == "dikirim" || s == "draf");
    let src = opt_str(&q.ibs_source).filter(|s| s == "agregat" || s == "individu");
    let use_agr = src.as_deref() != Some("individu");
    let use_ind = src.as_deref() != Some("agregat");
    let tahun = q.tahun;
    let sw = q.start_week.filter(|w| (1..=53).contains(w));
    let ew = q.end_week.filter(|w| (1..=53).contains(w));
    let prov = csv_ints(&q.province_id);
    let kab = csv_ints(&q.kabkota_id);
    let penyakit = csv_text(&q.penyakit);
    let jenis_unit = csv_text(&q.jenis_unit);
    let params: Vec<&(dyn ToSql + Sync)> = vec![&status, &tahun, &sw, &ew, &prov, &kab, &penyakit, &jenis_unit];

    // Load master 24 IBS diseases from `ibs_penyakit`
    let master_dis = c
        .query("SELECT kode, kode_sms, nama FROM ibs_penyakit WHERE NOT is_total AND is_active ORDER BY urutan", &[])
        .await
        .map_err(internal)?;
    let dis_meta: Vec<(String, String, String)> = master_dis.iter().map(|r| (r.get(0), r.get(1), r.get(2))).collect();
    let dis_set: HashSet<String> = if penyakit.is_empty() {
        dis_meta.iter().map(|d| d.0.clone()).collect()
    } else {
        penyakit.iter().cloned().collect()
    };

    // ─── A. Entri Data Agregat (`laporan_ibs`) ────────────────────────────────
    let mut agr_total = 0i64;
    let mut agr_dikirim = 0i64;
    let mut agr_draf = 0i64;
    let mut agr_kasus = 0i64;
    let mut agr_kematian = 0i64;
    let mut agr_lab = 0i64;
    let mut agr_kunjungan = 0i64;
    let mut agr_nihil = 0i64;
    let mut agr_units: HashSet<String> = HashSet::new();
    let mut agr_provs: HashSet<i32> = HashSet::new();
    let mut agr_kabs: HashSet<i32> = HashSet::new();
    let mut dis_agr: HashMap<String, (i64, i64, i64, i64)> = HashMap::new(); // (kasus, kematian, lab, laporan_terisi)
    let mut week_agr: BTreeMap<(i32, i32), (i64, i64, i64, i64, i64)> = BTreeMap::new(); // (lap, kasus, kematian, lab, kunjungan)
    let mut heat_agr_prov: HashMap<String, (Option<i32>, String, HashMap<(i32, i32), (i64, i64)>, i64, i64)> = HashMap::new();
    let mut heat_dis_agr: HashMap<String, HashMap<(i32, i32), i64>> = HashMap::new();
    let mut obs_weeks: Vec<(i32, i32)> = vec![];
    let mut unit_stats: HashMap<String, (String, Option<String>, Option<String>, Option<String>, i64, i64, i64, i64)> = HashMap::new(); // (unit_nama, jenis_unit, prov, kab, agr_lap, agr_ks, agr_kunj, ind_pas)
    let mut jenis_unit_stats: HashMap<String, (i64, i64, i64)> = HashMap::new(); // (agr_lap, agr_ks, ind_pas)
    let mut kelompok_stats: HashMap<String, (i64, i64)> = HashMap::new();
    let mut recent_agregat: Vec<Value> = vec![];

    if use_agr {
        let agr_rows = c
            .query(
                &format!(
                    "SELECT l.id, l.no_laporan, l.status, l.tahun, l.minggu,
                            l.province_id, ml.name, l.kabkota_id, k.name,
                            COALESCE(NULLIF(trim(l.unit_nama),''), '(Unit tidak diisi)'),
                            l.unit_key,
                            COALESCE(NULLIF(trim(l.data->>'jenis_unit'),''), '(Belum diisi)'),
                            COALESCE(NULLIF(trim(l.data->>'kelompok'),''), '(Belum diisi)'),
                            COALESCE(l.total_kunjungan, 0)::bigint,
                            COALESCE(l.data->>'konfirmasi_nihil' = 'true', FALSE),
                            l.data->'rows'
                     FROM laporan_ibs l
                     LEFT JOIN master_locations ml ON ml.id = l.province_id
                     LEFT JOIN master_kabkota k ON k.id = l.kabkota_id
                     WHERE {IBS_WHERE}
                     ORDER BY COALESCE(l.submitted_at, l.updated_at) DESC"
                ),
                &params,
            )
            .await
            .map_err(internal)?;

        for r in &agr_rows {
            let id: i64 = r.get(0);
            let no_lap: String = r.get(1);
            let st_str: String = r.get(2);
            let th: Option<i32> = r.get(3);
            let mg: Option<i32> = r.get(4);
            let pid: Option<i32> = r.get(5);
            let pname: Option<String> = r.get(6);
            let kid: Option<i32> = r.get(7);
            let kname: Option<String> = r.get(8);
            let unama: String = r.get(9);
            let ukey: Option<String> = r.get(10);
            let ju: String = r.get(11);
            let kel: String = r.get(12);
            let kunj: i64 = r.get(13);
            let nihil: bool = r.get(14);
            let rows_val: Option<Value> = r.get(15);

            // Sum across selected diseases (or all 24 when unfiltered)
            let mut r_ks = 0i64;
            let mut r_km = 0i64;
            let mut r_lb = 0i64;
            let mut any_match = penyakit.is_empty();
            if let Some(Value::Object(rmap)) = &rows_val {
                for (code, cell) in rmap {
                    if !dis_set.contains(code) {
                        continue;
                    }
                    if let Value::Object(cm) = cell {
                        let cks = json_int(cm.get("kasus"));
                        let ckm = json_int(cm.get("kematian"));
                        let clb = json_int(cm.get("lab"));
                        if cks > 0 || ckm > 0 || clb > 0 {
                            any_match = true;
                            let de = dis_agr.entry(code.clone()).or_insert((0, 0, 0, 0));
                            de.0 += cks;
                            de.1 += ckm;
                            de.2 += clb;
                            de.3 += 1;
                            if let (Some(y), Some(m)) = (th, mg) {
                                *heat_dis_agr.entry(code.clone()).or_default().entry((y, m)).or_insert(0) += cks;
                            }
                        }
                        r_ks += cks;
                        r_km += ckm;
                        r_lb += clb;
                    }
                }
            }
            if !any_match {
                continue;
            }

            agr_total += 1;
            if st_str == "dikirim" { agr_dikirim += 1; } else { agr_draf += 1; }
            agr_kasus += r_ks;
            agr_kematian += r_km;
            agr_lab += r_lb;
            agr_kunjungan += kunj;
            if nihil { agr_nihil += 1; }
            if let Some(uk) = ukey.as_ref().filter(|x| !x.is_empty()) { agr_units.insert(uk.clone()); } else { agr_units.insert(unama.to_lowercase()); }
            if let Some(p) = pid { agr_provs.insert(p); }
            if let Some(k) = kid { agr_kabs.insert(k); }

            if let (Some(y), Some(m)) = (th, mg) {
                obs_weeks.push((y, m));
                let w = week_agr.entry((y, m)).or_insert((0, 0, 0, 0, 0));
                w.0 += 1; w.1 += r_ks; w.2 += r_km; w.3 += r_lb; w.4 += kunj;

                let pk = pid.map(|x| x.to_string()).unwrap_or_else(|| "none".into());
                let pe = heat_agr_prov.entry(pk).or_insert_with(|| (pid, pname.clone().unwrap_or_else(|| "(Belum diisi)".into()), HashMap::new(), 0, 0));
                let pw = pe.2.entry((y, m)).or_insert((0, 0));
                pw.0 += 1; pw.1 += r_ks;
                pe.3 += 1; pe.4 += r_ks;
            }

            let ju_e = jenis_unit_stats.entry(ju.clone()).or_insert((0, 0, 0));
            ju_e.0 += 1; ju_e.1 += r_ks;
            let kl_e = kelompok_stats.entry(kel.clone()).or_insert((0, 0));
            kl_e.0 += 1; kl_e.1 += r_ks;

            let uk_stat = ukey.unwrap_or_else(|| format!("{}|{}", unama.to_lowercase(), kid.unwrap_or(0)));
            let ue = unit_stats.entry(uk_stat).or_insert_with(|| (unama.clone(), Some(ju.clone()), pname.clone(), kname.clone(), 0, 0, 0, 0));
            ue.4 += 1; ue.5 += r_ks; ue.6 += kunj;

            if recent_agregat.len() < 50 {
                recent_agregat.push(json!({
                    "id": id, "no_laporan": no_lap, "status": st_str, "tahun": th, "minggu": mg,
                    "province_name": pname, "kabkota_name": kname, "unit_nama": unama, "jenis_unit": ju, "kelompok": kel,
                    "total_kasus": r_ks, "total_kematian": r_km, "total_lab": r_lb, "total_kunjungan": kunj
                }));
            }
        }
    }

    // ─── B. Form Individu (`laporan_ibs_individu`) ────────────────────────────
    let mut ind_total = 0i64;
    let mut ind_dikirim = 0i64;
    let mut ind_draf = 0i64;
    let mut ind_pria = 0i64;
    let mut ind_wanita = 0i64;
    let mut ind_meninggal = 0i64;
    let mut ind_perawatan = 0i64;
    let mut ind_sakit = 0i64;
    let mut ind_sehat = 0i64;
    let mut ind_vital = 0i64;
    let mut ind_soap = 0i64;
    let mut ind_units: HashSet<String> = HashSet::new();
    let mut ind_provs: HashSet<i32> = HashSet::new();
    let mut ind_kabs: HashSet<i32> = HashSet::new();
    let mut dis_ind: HashMap<String, (i64, i64)> = HashMap::new(); // (pasien, meninggal)
    let mut week_ind: BTreeMap<(i32, i32), (i64, i64)> = BTreeMap::new(); // (pasien, meninggal)
    let mut heat_ind_prov: HashMap<String, (Option<i32>, String, HashMap<(i32, i32), i64>, i64)> = HashMap::new();
    let mut heat_dis_ind: HashMap<String, HashMap<(i32, i32), i64>> = HashMap::new();
    let mut kelamin_map: HashMap<String, i64> = HashMap::new();
    let mut status_akhir_map: HashMap<String, i64> = HashMap::new();
    let mut pekerjaan_map: HashMap<String, i64> = HashMap::new();
    let mut imunisasi_map: HashMap<String, i64> = HashMap::new();
    let mut imt_kat_map: HashMap<&'static str, i64> = HashMap::new();
    let mut age_map: HashMap<&'static str, (i64, i64, i64)> = HashMap::new(); // (pria, wanita, total)
    let (mut v_tinggi, mut v_berat, mut v_imt, mut v_suhu, mut v_sistole, mut v_diastole) =
        (VitalAcc::default(), VitalAcc::default(), VitalAcc::default(), VitalAcc::default(), VitalAcc::default(), VitalAcc::default());
    let mut recent_individu: Vec<Value> = vec![];

    let dis_label_map: HashMap<String, String> = dis_meta.iter().map(|(k, sms, nm)| (k.clone(), format!("{sms} — {nm}"))).collect();

    if use_ind {
        let ind_rows = c
            .query(
                &format!(
                    "SELECT i.id, i.no_laporan, i.status, i.tahun, i.minggu,
                            i.province_id, ml.name, i.kabkota_id, k.name,
                            COALESCE(NULLIF(trim(i.unit_nama),''), '(Unit tidak diisi)'),
                            i.unit_key,
                            COALESCE(NULLIF(trim(i.data->>'jenis_unit'),''), '(Belum diisi)'),
                            i.kelamin, i.umur, i.penyakit, i.tgl_periksa::text, i.diagnosa, i.status_akhir,
                            i.data
                     FROM laporan_ibs_individu i
                     LEFT JOIN master_locations ml ON ml.id = i.province_id
                     LEFT JOIN master_kabkota k ON k.id = i.kabkota_id
                     WHERE {IND_WHERE}
                     ORDER BY COALESCE(i.submitted_at, i.updated_at) DESC"
                ),
                &params,
            )
            .await
            .map_err(internal)?;

        for r in &ind_rows {
            let id: i64 = r.get(0);
            let no_lap: String = r.get(1);
            let st_str: String = r.get(2);
            let th: Option<i32> = r.get(3);
            let mg: Option<i32> = r.get(4);
            let pid: Option<i32> = r.get(5);
            let pname: Option<String> = r.get(6);
            let kid: Option<i32> = r.get(7);
            let kname: Option<String> = r.get(8);
            let unama: String = r.get(9);
            let ukey: Option<String> = r.get(10);
            let ju: String = r.get(11);
            let kelamin: Option<String> = r.get(12);
            let umur: Option<String> = r.get(13);
            let peny: Option<String> = r.get(14);
            let tgl_p: Option<String> = r.get(15);
            let diag: Option<String> = r.get(16);
            let st_akhir: Option<String> = r.get(17);
            let data_val: Value = r.get(18);
            let empty_map = serde_json::Map::new();
            let d = data_val.as_object().unwrap_or(&empty_map);

            ind_total += 1;
            if st_str == "dikirim" { ind_dikirim += 1; } else { ind_draf += 1; }
            if let Some(uk) = ukey.as_ref().filter(|x| !x.is_empty()) { ind_units.insert(uk.clone()); } else { ind_units.insert(unama.to_lowercase()); }
            if let Some(p) = pid { ind_provs.insert(p); }
            if let Some(k) = kid { ind_kabs.insert(k); }

            let kl = kelamin.clone().filter(|x| !x.trim().is_empty()).unwrap_or_else(|| "(Belum diisi)".into());
            if kl == "Pria" { ind_pria += 1; } else if kl == "Wanita" { ind_wanita += 1; }
            *kelamin_map.entry(kl.clone()).or_insert(0) += 1;

            let sa = st_akhir.clone().filter(|x| !x.trim().is_empty()).unwrap_or_else(|| "(Belum diisi)".into());
            let is_dead = sa == "Meninggal";
            match sa.as_str() {
                "Meninggal" => ind_meninggal += 1,
                "Masih dalam perawatan" => ind_perawatan += 1,
                "Sakit" => ind_sakit += 1,
                "Sehat" => ind_sehat += 1,
                _ => {}
            }
            *status_akhir_map.entry(sa.clone()).or_insert(0) += 1;

            let ag = age_group_of(d);
            let ae = age_map.entry(ag).or_insert((0, 0, 0));
            if kl == "Pria" { ae.0 += 1; } else if kl == "Wanita" { ae.1 += 1; }
            ae.2 += 1;

            let pkj = d.get("pekerjaan").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()).unwrap_or("(Belum diisi)").to_string();
            *pekerjaan_map.entry(pkj).or_insert(0) += 1;
            let imn = d.get("status_imunisasi").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()).unwrap_or("(Belum diisi)").to_string();
            *imunisasi_map.entry(imn).or_insert(0) += 1;

            let tg = json_dec(d.get("tinggi"));
            let br = json_dec(d.get("berat"));
            let imt_v = json_dec(d.get("imt")).or_else(|| match (tg, br) {
                (Some(t), Some(b)) if t > 0.0 && b > 0.0 => Some((b / ((t / 100.0).powi(2)) * 10.0).round() / 10.0),
                _ => None,
            });
            let su = json_dec(d.get("suhu"));
            let sy = json_dec(d.get("sistole"));
            let di = json_dec(d.get("diastole"));
            v_tinggi.push(tg);
            v_berat.push(br);
            v_imt.push(imt_v);
            v_suhu.push(su);
            v_sistole.push(sy);
            v_diastole.push(di);
            if tg.is_some() || br.is_some() || su.is_some() || sy.is_some() || di.is_some() {
                ind_vital += 1;
            }
            if ["soap_s", "soap_o", "soap_a", "soap_p"].iter().any(|k| json_nonempty(d.get(*k))) {
                ind_soap += 1;
            }
            let imt_kat = match imt_v {
                Some(v) if v < 18.5 => "Berat badan kurang",
                Some(v) if v < 25.0 => "Normal",
                Some(v) if v < 27.0 => "Berat badan lebih",
                Some(_) => "Obesitas",
                None => "(Belum diukur)",
            };
            *imt_kat_map.entry(imt_kat).or_insert(0) += 1;

            if let Some(pcode) = &peny {
                let de = dis_ind.entry(pcode.clone()).or_insert((0, 0));
                de.0 += 1;
                if is_dead { de.1 += 1; }
                if let (Some(y), Some(m)) = (th, mg) {
                    *heat_dis_ind.entry(pcode.clone()).or_default().entry((y, m)).or_insert(0) += 1;
                }
            }

            if let (Some(y), Some(m)) = (th, mg) {
                obs_weeks.push((y, m));
                let w = week_ind.entry((y, m)).or_insert((0, 0));
                w.0 += 1;
                if is_dead { w.1 += 1; }

                let pk = pid.map(|x| x.to_string()).unwrap_or_else(|| "none".into());
                let pe = heat_ind_prov.entry(pk).or_insert_with(|| (pid, pname.clone().unwrap_or_else(|| "(Belum diisi)".into()), HashMap::new(), 0));
                *pe.2.entry((y, m)).or_insert(0) += 1;
                pe.3 += 1;
            }

            let ju_e = jenis_unit_stats.entry(ju.clone()).or_insert((0, 0, 0));
            ju_e.2 += 1;
            let uk_stat = ukey.unwrap_or_else(|| format!("{}|{}", unama.to_lowercase(), kid.unwrap_or(0)));
            let ue = unit_stats.entry(uk_stat).or_insert_with(|| (unama.clone(), Some(ju.clone()), pname.clone(), kname.clone(), 0, 0, 0, 0));
            ue.7 += 1;

            if recent_individu.len() < 50 {
                let plabel = peny.as_ref().and_then(|k| dis_label_map.get(k)).cloned().or_else(|| peny.clone());
                recent_individu.push(json!({
                    "id": id, "no_laporan": no_lap, "status": st_str, "tahun": th, "minggu": mg,
                    "tgl_periksa": tgl_p, "penyakit_kode": peny, "penyakit_label": plabel,
                    "kelamin": kelamin, "umur": umur, "status_akhir": st_akhir, "diagnosa": diag,
                    "province_name": pname, "kabkota_name": kname, "unit_nama": unama
                }));
            }
        }
    }

    // ─── C. Weekly trend + Heatmap synthesis ──────────────────────────────────
    let axis = build_week_axis(&obs_weeks);
    let all_weeks: BTreeSet<(i32, i32)> = week_agr.keys().chain(week_ind.keys()).copied().collect();
    let weekly_trend: Vec<Value> = all_weeks
        .into_iter()
        .map(|(y, m)| {
            let a = week_agr.get(&(y, m)).copied().unwrap_or((0, 0, 0, 0, 0));
            let i = week_ind.get(&(y, m)).copied().unwrap_or((0, 0));
            json!({
                "tahun": y, "minggu": m,
                "week_start": week_start_date(y, m).format("%Y-%m-%d").to_string(),
                "label": week_label(y, m),
                "agregat_laporan": a.0, "agregat_kasus": a.1, "agregat_kematian": a.2, "agregat_lab": a.3, "agregat_kunjungan": a.4,
                "individu_pasien": i.0, "individu_meninggal": i.1
            })
        })
        .collect();

    let all_prov_keys: HashSet<String> = heat_agr_prov.keys().chain(heat_ind_prov.keys()).cloned().collect();
    let mut heat_prov_rows: Vec<Value> = all_prov_keys
        .into_iter()
        .map(|pk| {
            let a = heat_agr_prov.get(&pk);
            let i = heat_ind_prov.get(&pk);
            let pid = a.and_then(|x| x.0).or_else(|| i.and_then(|x| x.0));
            let name = a.map(|x| x.1.clone()).or_else(|| i.map(|x| x.1.clone())).unwrap_or_else(|| "(Belum diisi)".into());
            let vals_agr_ks: Vec<i64> = axis.iter().map(|(y, w, _, _)| a.and_then(|x| x.2.get(&(*y, *w))).map(|z| z.1).unwrap_or(0)).collect();
            let vals_agr_lap: Vec<i64> = axis.iter().map(|(y, w, _, _)| a.and_then(|x| x.2.get(&(*y, *w))).map(|z| z.0).unwrap_or(0)).collect();
            let vals_ind: Vec<i64> = axis.iter().map(|(y, w, _, _)| i.and_then(|x| x.2.get(&(*y, *w))).copied().unwrap_or(0)).collect();
            json!({
                "id": pid, "name": name,
                "values_agregat_kasus": vals_agr_ks,
                "values_agregat_laporan": vals_agr_lap,
                "values_individu_pasien": vals_ind,
                "total_agregat_laporan": a.map(|x| x.3).unwrap_or(0),
                "total_agregat_kasus": a.map(|x| x.4).unwrap_or(0),
                "total_individu_pasien": i.map(|x| x.3).unwrap_or(0),
            })
        })
        .collect();
    heat_prov_rows.sort_by(|a, b| {
        (b["total_agregat_kasus"].as_i64().unwrap_or(0) + b["total_individu_pasien"].as_i64().unwrap_or(0))
            .cmp(&(a["total_agregat_kasus"].as_i64().unwrap_or(0) + a["total_individu_pasien"].as_i64().unwrap_or(0)))
    });

    let mut heat_dis_rows: Vec<Value> = dis_meta
        .iter()
        .filter_map(|(kode, sms, nama)| {
            let ta = dis_agr.get(kode).map(|x| x.0).unwrap_or(0);
            let ti = dis_ind.get(kode).map(|x| x.0).unwrap_or(0);
            if ta == 0 && ti == 0 {
                return None;
            }
            let am = heat_dis_agr.get(kode);
            let im = heat_dis_ind.get(kode);
            let va: Vec<i64> = axis.iter().map(|(y, w, _, _)| am.and_then(|m| m.get(&(*y, *w))).copied().unwrap_or(0)).collect();
            let vi: Vec<i64> = axis.iter().map(|(y, w, _, _)| im.and_then(|m| m.get(&(*y, *w))).copied().unwrap_or(0)).collect();
            Some(json!({
                "kode": kode, "kode_sms": sms, "name": format!("{sms} — {nama}"),
                "values_agregat_kasus": va, "values_individu_pasien": vi,
                "total_agregat_kasus": ta, "total_individu_pasien": ti,
            }))
        })
        .collect();
    heat_dis_rows.sort_by(|a, b| {
        (b["total_agregat_kasus"].as_i64().unwrap_or(0) + b["total_individu_pasien"].as_i64().unwrap_or(0))
            .cmp(&(a["total_agregat_kasus"].as_i64().unwrap_or(0) + a["total_individu_pasien"].as_i64().unwrap_or(0)))
    });

    // ─── D. Map Choropleth + Spatial Points (merging Agregat + Individu) ──────
    let level = q.level.clone().filter(|x| x == "kab").unwrap_or_else(|| "prov".into());
    let parent_id = q.parent;
    #[derive(Default)]
    struct RegAgg {
        name: String,
        geo: String,
        lat: Option<f64>,
        lng: Option<f64>,
        agr_lap: i64,
        agr_ks: i64,
        agr_km: i64,
        agr_lb: i64,
        agr_kunj: i64,
        ind_pas: i64,
        ind_men: i64,
        units: i64,
    }
    let mut reg_map: HashMap<String, RegAgg> = HashMap::new();

    if use_agr {
        let mut mp = params.clone();
        let extra = if level == "kab" && parent_id.is_some() {
            mp.push(parent_id.as_ref().unwrap());
            "AND l.province_id = $9"
        } else {
            ""
        };
        let rows = if level == "kab" {
            c.query(
                &format!(
                    "SELECT l.kabkota_id::text, k.name, replace(k.kemendagri_code, '.', ''),
                            k.latitude::float8, k.longitude::float8,
                            COUNT(DISTINCT l.id)::bigint,
                            COALESCE(SUM(r.ks),0)::bigint, COALESCE(SUM(r.km),0)::bigint, COALESCE(SUM(r.lb),0)::bigint,
                            COALESCE(SUM(COALESCE(l.total_kunjungan,0)),0)::bigint,
                            COUNT(DISTINCT NULLIF(COALESCE(l.unit_key, lower(trim(COALESCE(l.unit_nama,'')))), ''))::bigint
                     FROM laporan_ibs l
                     JOIN master_kabkota k ON k.id = l.kabkota_id
                     LEFT JOIN LATERAL (
                        SELECT COALESCE(SUM(CASE WHEN COALESCE(val->>'kasus','') ~ '^[0-9]+$' THEN (val->>'kasus')::bigint ELSE 0 END),0) AS ks,
                               COALESCE(SUM(CASE WHEN COALESCE(val->>'kematian','') ~ '^[0-9]+$' THEN (val->>'kematian')::bigint ELSE 0 END),0) AS km,
                               COALESCE(SUM(CASE WHEN COALESCE(val->>'lab','') ~ '^[0-9]+$' THEN (val->>'lab')::bigint ELSE 0 END),0) AS lb
                        FROM jsonb_each(COALESCE(l.data->'rows', '{{}}'::jsonb)) AS j(k, val)
                        JOIN ibs_penyakit p ON p.kode = j.k AND NOT p.is_total
                        WHERE (cardinality($7::text[]) = 0 OR p.kode = ANY($7))
                     ) r ON TRUE
                     WHERE {IBS_WHERE} {extra}
                       AND (cardinality($7::text[]) = 0 OR (r.ks + r.km + r.lb) > 0)
                     GROUP BY 1, k.name, k.kemendagri_code, k.latitude, k.longitude"
                ),
                &mp,
            )
            .await
            .map_err(internal)?
        } else {
            c.query(
                &format!(
                    "SELECT l.province_id::text, ml.name, ml.code,
                            ml.latitude::float8, ml.longitude::float8,
                            COUNT(DISTINCT l.id)::bigint,
                            COALESCE(SUM(r.ks),0)::bigint, COALESCE(SUM(r.km),0)::bigint, COALESCE(SUM(r.lb),0)::bigint,
                            COALESCE(SUM(COALESCE(l.total_kunjungan,0)),0)::bigint,
                            COUNT(DISTINCT NULLIF(COALESCE(l.unit_key, lower(trim(COALESCE(l.unit_nama,'')))), ''))::bigint
                     FROM laporan_ibs l
                     JOIN master_locations ml ON ml.id = l.province_id
                     LEFT JOIN LATERAL (
                        SELECT COALESCE(SUM(CASE WHEN COALESCE(val->>'kasus','') ~ '^[0-9]+$' THEN (val->>'kasus')::bigint ELSE 0 END),0) AS ks,
                               COALESCE(SUM(CASE WHEN COALESCE(val->>'kematian','') ~ '^[0-9]+$' THEN (val->>'kematian')::bigint ELSE 0 END),0) AS km,
                               COALESCE(SUM(CASE WHEN COALESCE(val->>'lab','') ~ '^[0-9]+$' THEN (val->>'lab')::bigint ELSE 0 END),0) AS lb
                        FROM jsonb_each(COALESCE(l.data->'rows', '{{}}'::jsonb)) AS j(k, val)
                        JOIN ibs_penyakit p ON p.kode = j.k AND NOT p.is_total
                        WHERE (cardinality($7::text[]) = 0 OR p.kode = ANY($7))
                     ) r ON TRUE
                     WHERE {IBS_WHERE}
                       AND (cardinality($7::text[]) = 0 OR (r.ks + r.km + r.lb) > 0)
                     GROUP BY 1, ml.name, ml.code, ml.latitude, ml.longitude"
                ),
                &params,
            )
            .await
            .map_err(internal)?
        };
        for r in &rows {
            let key: String = r.get(0);
            let e = reg_map.entry(key).or_default();
            e.name = r.get(1);
            e.geo = r.get(2);
            e.lat = r.get(3);
            e.lng = r.get(4);
            e.agr_lap = n(r, 5);
            e.agr_ks = n(r, 6);
            e.agr_km = n(r, 7);
            e.agr_lb = n(r, 8);
            e.agr_kunj = n(r, 9);
            e.units = n(r, 10);
        }
    }

    if use_ind {
        let mut mp = params.clone();
        let extra = if level == "kab" && parent_id.is_some() {
            mp.push(parent_id.as_ref().unwrap());
            "AND i.province_id = $9"
        } else {
            ""
        };
        let rows = if level == "kab" {
            c.query(
                &format!(
                    "SELECT i.kabkota_id::text, k.name, replace(k.kemendagri_code, '.', ''),
                            k.latitude::float8, k.longitude::float8,
                            COUNT(*)::bigint,
                            COUNT(*) FILTER (WHERE i.status_akhir = 'Meninggal')::bigint,
                            COUNT(DISTINCT NULLIF(COALESCE(i.unit_key, lower(trim(COALESCE(i.unit_nama,'')))), ''))::bigint
                     FROM laporan_ibs_individu i
                     JOIN master_kabkota k ON k.id = i.kabkota_id
                     WHERE {IND_WHERE} {extra}
                     GROUP BY 1, k.name, k.kemendagri_code, k.latitude, k.longitude"
                ),
                &mp,
            )
            .await
            .map_err(internal)?
        } else {
            c.query(
                &format!(
                    "SELECT i.province_id::text, ml.name, ml.code,
                            ml.latitude::float8, ml.longitude::float8,
                            COUNT(*)::bigint,
                            COUNT(*) FILTER (WHERE i.status_akhir = 'Meninggal')::bigint,
                            COUNT(DISTINCT NULLIF(COALESCE(i.unit_key, lower(trim(COALESCE(i.unit_nama,'')))), ''))::bigint
                     FROM laporan_ibs_individu i
                     JOIN master_locations ml ON ml.id = i.province_id
                     WHERE {IND_WHERE}
                     GROUP BY 1, ml.name, ml.code, ml.latitude, ml.longitude"
                ),
                &params,
            )
            .await
            .map_err(internal)?
        };
        for r in &rows {
            let key: String = r.get(0);
            let e = reg_map.entry(key).or_default();
            if e.name.is_empty() { e.name = r.get(1); e.geo = r.get(2); e.lat = r.get(3); e.lng = r.get(4); }
            e.ind_pas = n(r, 5);
            e.ind_men = n(r, 6);
            e.units = e.units.max(n(r, 7));
        }
    }

    // Spatial unit points across Agregat + Individu
    #[derive(Default)]
    struct PtAgg {
        unit_nama: String,
        jenis_unit: Option<String>,
        province_name: Option<String>,
        kabkota_name: Option<String>,
        lat: f64,
        lng: f64,
        coord_source: Option<String>,
        agr_lap: i64,
        agr_ks: i64,
        agr_km: i64,
        ind_pas: i64,
        last_periode: Option<String>,
    }
    let mut pt_map: HashMap<String, PtAgg> = HashMap::new();
    if use_agr {
        let pts = c
            .query(
                &format!(
                    "SELECT
                        COALESCE(l.unit_key, lower(trim(COALESCE(l.unit_nama,'')))) || '|' || COALESCE(l.kabkota_id::text,'') AS pkey,
                        COALESCE(NULLIF(trim(MAX(l.unit_nama)),''), MAX(k.name), MAX(ml.name), 'Unit Pelapor'),
                        MAX(NULLIF(trim(l.data->>'jenis_unit'),'')),
                        MAX(ml.name), MAX(k.name),
                        COALESCE(MAX(f.latitude), MAX(k.latitude), MAX(ml.latitude))::float8,
                        COALESCE(MAX(f.longitude), MAX(k.longitude), MAX(ml.longitude))::float8,
                        CASE WHEN MAX(f.latitude) IS NOT NULL THEN 'fasyankes'
                             WHEN MAX(k.latitude) IS NOT NULL THEN 'kabkota'
                             WHEN MAX(ml.latitude) IS NOT NULL THEN 'provinsi' ELSE NULL END,
                        COUNT(DISTINCT l.id)::bigint,
                        COALESCE(SUM(r.ks),0)::bigint,
                        COALESCE(SUM(r.km),0)::bigint,
                        MAX(CASE WHEN l.tahun IS NOT NULL AND l.minggu IS NOT NULL THEN 'M' || lpad(l.minggu::text,2,'0') || '/' || (l.tahun % 100)::text ELSE NULL END)
                     FROM laporan_ibs l
                     LEFT JOIN master_fasyankes f ON f.kode_satusehat = NULLIF(trim(l.data->>'unit_kode'),'')
                     LEFT JOIN master_kabkota k ON k.id = l.kabkota_id
                     LEFT JOIN master_locations ml ON ml.id = l.province_id
                     LEFT JOIN LATERAL (
                        SELECT COALESCE(SUM(CASE WHEN COALESCE(val->>'kasus','') ~ '^[0-9]+$' THEN (val->>'kasus')::bigint ELSE 0 END),0) AS ks,
                               COALESCE(SUM(CASE WHEN COALESCE(val->>'kematian','') ~ '^[0-9]+$' THEN (val->>'kematian')::bigint ELSE 0 END),0) AS km,
                               COALESCE(SUM(CASE WHEN COALESCE(val->>'lab','') ~ '^[0-9]+$' THEN (val->>'lab')::bigint ELSE 0 END),0) AS lb
                        FROM jsonb_each(COALESCE(l.data->'rows', '{{}}'::jsonb)) AS j(k, val)
                        JOIN ibs_penyakit p ON p.kode = j.k AND NOT p.is_total
                        WHERE (cardinality($7::text[]) = 0 OR p.kode = ANY($7))
                     ) r ON TRUE
                     WHERE {IBS_WHERE}
                       AND (cardinality($7::text[]) = 0 OR (r.ks + r.km + r.lb) > 0)
                     GROUP BY 1
                     HAVING COALESCE(MAX(f.latitude), MAX(k.latitude), MAX(ml.latitude)) IS NOT NULL
                        AND COALESCE(MAX(f.longitude), MAX(k.longitude), MAX(ml.longitude)) IS NOT NULL
                     LIMIT 500"
                ),
                &params,
            )
            .await
            .map_err(internal)?;
        for r in &pts {
            let pkey: String = r.get(0);
            let e = pt_map.entry(pkey).or_default();
            e.unit_nama = r.get(1);
            e.jenis_unit = r.get(2);
            e.province_name = r.get(3);
            e.kabkota_name = r.get(4);
            e.lat = r.get(5);
            e.lng = r.get(6);
            e.coord_source = r.get(7);
            e.agr_lap = n(r, 8);
            e.agr_ks = n(r, 9);
            e.agr_km = n(r, 10);
            e.last_periode = r.get(11);
        }
    }
    if use_ind {
        let pts = c
            .query(
                &format!(
                    "SELECT
                        COALESCE(i.unit_key, lower(trim(COALESCE(i.unit_nama,'')))) || '|' || COALESCE(i.kabkota_id::text,'') AS pkey,
                        COALESCE(NULLIF(trim(MAX(i.unit_nama)),''), MAX(k.name), MAX(ml.name), 'Unit Pelapor'),
                        MAX(NULLIF(trim(i.data->>'jenis_unit'),'')),
                        MAX(ml.name), MAX(k.name),
                        COALESCE(MAX(f.latitude), MAX(k.latitude), MAX(ml.latitude))::float8,
                        COALESCE(MAX(f.longitude), MAX(k.longitude), MAX(ml.longitude))::float8,
                        CASE WHEN MAX(f.latitude) IS NOT NULL THEN 'fasyankes'
                             WHEN MAX(k.latitude) IS NOT NULL THEN 'kabkota'
                             WHEN MAX(ml.latitude) IS NOT NULL THEN 'provinsi' ELSE NULL END,
                        COUNT(*)::bigint,
                        MAX(CASE WHEN i.tahun IS NOT NULL AND i.minggu IS NOT NULL THEN 'M' || lpad(i.minggu::text,2,'0') || '/' || (i.tahun % 100)::text ELSE NULL END)
                     FROM laporan_ibs_individu i
                     LEFT JOIN master_fasyankes f ON f.kode_satusehat = NULLIF(trim(i.data->>'unit_kode'),'')
                     LEFT JOIN master_kabkota k ON k.id = i.kabkota_id
                     LEFT JOIN master_locations ml ON ml.id = i.province_id
                     WHERE {IND_WHERE}
                     GROUP BY 1
                     HAVING COALESCE(MAX(f.latitude), MAX(k.latitude), MAX(ml.latitude)) IS NOT NULL
                        AND COALESCE(MAX(f.longitude), MAX(k.longitude), MAX(ml.longitude)) IS NOT NULL
                     LIMIT 500"
                ),
                &params,
            )
            .await
            .map_err(internal)?;
        for r in &pts {
            let pkey: String = r.get(0);
            let e = pt_map.entry(pkey).or_default();
            if e.unit_nama.is_empty() {
                e.unit_nama = r.get(1);
                e.jenis_unit = r.get(2);
                e.province_name = r.get(3);
                e.kabkota_name = r.get(4);
                e.lat = r.get(5);
                e.lng = r.get(6);
                e.coord_source = r.get(7);
            }
            e.ind_pas = n(r, 8);
            if e.last_periode.is_none() { e.last_periode = r.get(9); }
        }
    }

    // ─── E. Filter options derived strictly from DB ───────────────────────────
    let opt_years = c
        .query(
            "SELECT DISTINCT tahun FROM (SELECT tahun FROM laporan_ibs WHERE deleted_at IS NULL AND tahun IS NOT NULL UNION SELECT tahun FROM laporan_ibs_individu WHERE deleted_at IS NULL AND tahun IS NOT NULL) t ORDER BY 1 DESC",
            &[],
        )
        .await
        .map_err(internal)?;
    let opt_prov = c
        .query(
            "SELECT DISTINCT ml.id, ml.name FROM (SELECT province_id FROM laporan_ibs WHERE deleted_at IS NULL UNION SELECT province_id FROM laporan_ibs_individu WHERE deleted_at IS NULL) t JOIN master_locations ml ON ml.id = t.province_id ORDER BY ml.name",
            &[],
        )
        .await
        .map_err(internal)?;
    let opt_kab = c
        .query(
            "SELECT DISTINCT k.id, k.province_id, k.name FROM (SELECT kabkota_id FROM laporan_ibs WHERE deleted_at IS NULL UNION SELECT kabkota_id FROM laporan_ibs_individu WHERE deleted_at IS NULL) t JOIN master_kabkota k ON k.id = t.kabkota_id ORDER BY k.name",
            &[],
        )
        .await
        .map_err(internal)?;
    let opt_ju = c
        .query(
            "SELECT DISTINCT v FROM (SELECT NULLIF(trim(data->>'jenis_unit'),'') AS v FROM laporan_ibs WHERE deleted_at IS NULL UNION SELECT NULLIF(trim(data->>'jenis_unit'),'') FROM laporan_ibs_individu WHERE deleted_at IS NULL) t WHERE v IS NOT NULL ORDER BY 1",
            &[],
        )
        .await
        .map_err(internal)?;

    // Format sorted breakdowns
    let mut by_ju: Vec<Value> = jenis_unit_stats
        .into_iter()
        .map(|(k, (al, ak, ip))| json!({ "jenis_unit": k, "agregat_laporan": al, "agregat_kasus": ak, "individu_pasien": ip }))
        .collect();
    by_ju.sort_by(|a, b| {
        (b["agregat_laporan"].as_i64().unwrap_or(0) + b["individu_pasien"].as_i64().unwrap_or(0))
            .cmp(&(a["agregat_laporan"].as_i64().unwrap_or(0) + a["individu_pasien"].as_i64().unwrap_or(0)))
    });

    let mut by_kel: Vec<Value> = kelompok_stats
        .into_iter()
        .map(|(k, (lap, ks))| json!({ "kelompok": k, "laporan": lap, "kasus": ks }))
        .collect();
    by_kel.sort_by(|a, b| b["laporan"].as_i64().cmp(&a["laporan"].as_i64()));

    let mut top_units: Vec<Value> = unit_stats
        .into_values()
        .map(|(un, ju, pn, kn, al, ak, kunj, ip)| json!({
            "unit_nama": un, "jenis_unit": ju, "province_name": pn, "kabkota_name": kn,
            "agregat_laporan": al, "agregat_kasus": ak, "agregat_kunjungan": kunj, "individu_pasien": ip
        }))
        .collect();
    top_units.sort_by(|a, b| {
        (b["agregat_kasus"].as_i64().unwrap_or(0) + b["individu_pasien"].as_i64().unwrap_or(0))
            .cmp(&(a["agregat_kasus"].as_i64().unwrap_or(0) + a["individu_pasien"].as_i64().unwrap_or(0)))
    });
    top_units.truncate(20);

    let sorted_map = |m: HashMap<String, i64>| -> Vec<Value> {
        let mut v: Vec<_> = m.into_iter().map(|(k, cnt)| json!({ "label": k, "count": cnt })).collect();
        v.sort_by(|a, b| b["count"].as_i64().cmp(&a["count"].as_i64()));
        v
    };

    let mut regions_out: Vec<Value> = reg_map
        .into_iter()
        .map(|(k, v)| json!({
            "key": k, "name": v.name, "geo": v.geo, "lat": v.lat, "lng": v.lng,
            "agregat_laporan": v.agr_lap, "agregat_kasus": v.agr_ks, "agregat_kematian": v.agr_km,
            "agregat_lab": v.agr_lb, "agregat_kunjungan": v.agr_kunj,
            "individu_pasien": v.ind_pas, "individu_meninggal": v.ind_men, "unit_unik": v.units
        }))
        .collect();
    regions_out.sort_by(|a, b| {
        (b["agregat_kasus"].as_i64().unwrap_or(0) + b["individu_pasien"].as_i64().unwrap_or(0))
            .cmp(&(a["agregat_kasus"].as_i64().unwrap_or(0) + a["individu_pasien"].as_i64().unwrap_or(0)))
    });

    let mut points_out: Vec<Value> = pt_map
        .into_values()
        .map(|p| json!({
            "unit_nama": p.unit_nama, "jenis_unit": p.jenis_unit,
            "province_name": p.province_name, "kabkota_name": p.kabkota_name,
            "lat": p.lat, "lng": p.lng, "coord_source": p.coord_source,
            "agregat_laporan": p.agr_lap, "agregat_kasus": p.agr_ks, "agregat_kematian": p.agr_km,
            "individu_pasien": p.ind_pas, "last_periode": p.last_periode
        }))
        .collect();
    points_out.sort_by(|a, b| {
        (b["agregat_kasus"].as_i64().unwrap_or(0) + b["individu_pasien"].as_i64().unwrap_or(0))
            .cmp(&(a["agregat_kasus"].as_i64().unwrap_or(0) + a["individu_pasien"].as_i64().unwrap_or(0)))
    });

    let by_imt_kategori: Vec<Value> = ["Berat badan kurang", "Normal", "Berat badan lebih", "Obesitas", "(Belum diukur)"]
        .iter()
        .map(|k| json!({ "kategori": k, "count": imt_kat_map.get(k).copied().unwrap_or(0) }))
        .collect();

    Ok(Json(json!({
        "success": true,
        "data": {
            "kpis": {
                "agregat": {
                    "total_laporan": agr_total, "dikirim": agr_dikirim, "draf": agr_draf,
                    "total_kasus": agr_kasus, "total_kematian": agr_kematian, "total_lab": agr_lab,
                    "total_kunjungan": agr_kunjungan,
                    "cfr_pct": pct(agr_kematian, agr_kasus),
                    "proporsi_kunjungan_pct": pct(agr_kasus, agr_kunjungan),
                    "nihil_count": agr_nihil,
                    "unit_unik": agr_units.len() as i64,
                    "provinsi_unik": agr_provs.len() as i64,
                    "kabkota_unik": agr_kabs.len() as i64,
                },
                "individu": {
                    "total_laporan": ind_total, "dikirim": ind_dikirim, "draf": ind_draf,
                    "pria": ind_pria, "wanita": ind_wanita,
                    "meninggal": ind_meninggal, "dalam_perawatan": ind_perawatan, "sakit": ind_sakit, "sehat": ind_sehat,
                    "dengan_vital": ind_vital, "dengan_soap": ind_soap,
                    "unit_unik": ind_units.len() as i64,
                    "provinsi_unik": ind_provs.len() as i64,
                    "kabkota_unik": ind_kabs.len() as i64,
                }
            },
            "weekly_trend": weekly_trend,
            "by_disease": dis_meta.iter().map(|(kode, sms, nama)| {
                let a = dis_agr.get(kode).copied().unwrap_or((0, 0, 0, 0));
                let i = dis_ind.get(kode).copied().unwrap_or((0, 0));
                json!({
                    "kode": kode, "kode_sms": sms, "nama": nama,
                    "agregat_kasus": a.0, "agregat_kematian": a.1, "agregat_lab": a.2, "agregat_laporan_terisi": a.3,
                    "individu_pasien": i.0, "individu_meninggal": i.1
                })
            }).collect::<Vec<_>>(),
            "individu_demographics": {
                "by_kelamin": sorted_map(kelamin_map),
                "by_status_akhir": sorted_map(status_akhir_map),
                "by_age_group": AGE_GROUPS.iter().map(|g| {
                    let (p, w, t) = age_map.get(g).copied().unwrap_or((0, 0, 0));
                    json!({ "group": g, "pria": p, "wanita": w, "total": t })
                }).collect::<Vec<_>>(),
                "by_pekerjaan": sorted_map(pekerjaan_map),
                "by_status_imunisasi": sorted_map(imunisasi_map),
                "by_imt_kategori": by_imt_kategori,
                "vital_summary": {
                    "tinggi": v_tinggi.to_json(), "berat": v_berat.to_json(), "imt": v_imt.to_json(),
                    "suhu": v_suhu.to_json(), "sistole": v_sistole.to_json(), "diastole": v_diastole.to_json(),
                }
            },
            "by_jenis_unit": by_ju,
            "by_kelompok": by_kel,
            "top_units": top_units,
            "heatmap": {
                "weeks": axis.iter().map(|(y, w, s, l)| json!({ "year": y, "week": w, "start": s, "label": l })).collect::<Vec<_>>(),
                "by_province": heat_prov_rows,
                "by_disease": heat_dis_rows,
            },
            "map": {
                "level": level, "parent": parent_id,
                "regions": regions_out,
                "points": points_out,
            },
            "recent_agregat": recent_agregat,
            "recent_individu": recent_individu,
            "filter_options": {
                "years": opt_years.iter().map(|r| r.get::<_, i32>(0)).collect::<Vec<_>>(),
                "provinces": opt_prov.iter().map(|r| json!({ "id": r.get::<_, i32>(0), "name": r.get::<_, String>(1) })).collect::<Vec<_>>(),
                "kabkota": opt_kab.iter().map(|r| json!({ "id": r.get::<_, i32>(0), "province_id": r.get::<_, i32>(1), "name": r.get::<_, String>(2) })).collect::<Vec<_>>(),
                "diseases": dis_meta.iter().map(|(k, sms, n)| json!({ "kode": k, "kode_sms": sms, "nama": n })).collect::<Vec<_>>(),
                "jenis_unit": opt_ju.iter().map(|r| r.get::<_, String>(0)).collect::<Vec<_>>(),
            }
        }
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mmwr_week_of_matches_boundary() {
        assert_eq!(mmwr_week_of(NaiveDate::from_ymd_opt(2026, 1, 4).unwrap()), (2026, 1));
        assert_eq!(mmwr_week_of(NaiveDate::from_ymd_opt(2026, 1, 11).unwrap()), (2026, 2));
        assert_eq!(mmwr_week_of(NaiveDate::from_ymd_opt(2025, 1, 1).unwrap()), (2025, 1));
    }

    #[test]
    fn age_group_computes_infant_and_adult() {
        let mut infant = serde_json::Map::new();
        infant.insert("umur_tahun".into(), json!(0));
        infant.insert("umur_bulan".into(), json!(6));
        assert_eq!(age_group_of(&infant), "< 1 th");

        let mut adult = serde_json::Map::new();
        adult.insert("umur_tahun".into(), json!(34));
        assert_eq!(age_group_of(&adult), "20–44 th");

        let empty = serde_json::Map::new();
        assert_eq!(age_group_of(&empty), "(Belum diisi)");
    }

    #[test]
    fn route_access_is_dashboard_login() {
        use axum::http::Method;
        assert_eq!(crate::auth::classify(&Method::GET, "/api/v1/dasbor/ebs-ibs/ebs"), crate::auth::Need::Login);
        assert_eq!(crate::auth::classify(&Method::GET, "/api/v1/dasbor/ebs-ibs/ibs"), crate::auth::Need::Login);
    }
}
