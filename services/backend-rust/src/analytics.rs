//! PR 012: dashboard charts + disease pages. All aggregation happens in SQL.
//! Spec rule: EBS alerts and Kasus PE (individual reports) are separate series and are never summed.
//! Week = MMWR epi week (Sunday start), same as the dashboard filter.
use axum::{extract::{Path, Query, State}, http::StatusCode, Json};
use chrono::{Duration, NaiveDate};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

use crate::dashboard::{current_mmwr, resolve, DashQuery, Resolved};
use crate::exec_dash::wilson;
use crate::{internal, ApiError, AppState};

const WEEK: &str = "(%s - EXTRACT(DOW FROM %s)::int)";
fn week_of(col: &str) -> String { WEEK.replace("%s", col) }
const EBS_DATE: &str = "COALESCE(e.tgl_laporan, e.create_date::date)";
const PE_DATE: &str = "COALESCE(c.tgl_laporan, c.created_at::date)";

fn not_found(msg: &str) -> ApiError {
    (StatusCode::NOT_FOUND, Json(json!({ "success": false, "error": msg })))
}

pub(crate) async fn cfg(c: &deadpool_postgres::Object) -> Result<Value, ApiError> {
    Ok(c.query_opt("SELECT value FROM app_settings WHERE key = 'dashboard_executive'", &[]).await.map_err(internal)?
        .and_then(|r| serde_json::from_str(&r.get::<_, String>(0)).ok()).unwrap_or(Value::Null))
}
pub(crate) fn strs(v: Option<&Value>) -> Vec<String> {
    v.and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|s| s.as_str().map(String::from)).collect()).unwrap_or_default()
}
pub(crate) fn rate(k: i64, n: i64, cfg: &Value) -> Value {
    let below = cfg.get("fraction_below").and_then(|v| v.as_i64()).unwrap_or(10);
    let z = cfg.get("z").and_then(|v| v.as_f64()).unwrap_or(1.96);
    let ci = wilson(k, n, z);
    json!({ "num": k, "den": n, "pct": if n > 0 { Some(k as f64 * 100.0 / n as f64) } else { None },
            "as_fraction": n > 0 && n < below, "ci_low": ci.map(|c| c.0), "ci_high": ci.map(|c| c.1) })
}

/// Weeks (Sunday starts) covering the filter period; default = last 26 weeks; capped at 104.
fn weeks(f: &Resolved) -> Vec<NaiveDate> {
    let today = chrono::Utc::now().date_naive();
    let sun = |d: NaiveDate| d - Duration::days(chrono::Datelike::weekday(&d).num_days_from_sunday() as i64);
    let end = sun(f.end.unwrap_or(today).min(today.max(f.start.unwrap_or(today))));
    let start = sun(f.start.unwrap_or(end - Duration::weeks(25)));
    let mut out = vec![];
    let mut w = start.max(end - Duration::weeks(103));
    while w <= end { out.push(w); w += Duration::weeks(1); }
    out
}
fn week_json(ws: &[NaiveDate]) -> Vec<Value> {
    ws.iter().map(|w| { let (y, n) = current_mmwr(*w + Duration::days(3)); json!({ "start": w.to_string(), "year": y, "week": n, "label": format!("M{n}/{}", y % 100) }) }).collect()
}

fn src(f: &Resolved) -> (bool, bool) {
    let s = f.source.as_deref();
    (!matches!(s, Some("pe") | Some("form")), s != Some("ebs"))
}

/// GET /api/v1/analytics/overview — weekly trend per disease (EBS alerts/cases, Kasus PE) + heatmap epi week × province.
pub async fn overview(State(s): State<AppState>, Query(q): Query<DashQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let f = resolve(&c, &q).await?;
    let conf = cfg(&c).await?;
    let counted = strs(conf.get("pe_count_statuses"));
    let ws = weeks(&f);
    let (w0, w1) = (ws[0], *ws.last().unwrap() + Duration::days(6));
    let idx: HashMap<NaiveDate, usize> = ws.iter().enumerate().map(|(i, w)| (*w, i)).collect();
    let (show_ebs, show_pe) = src(&f);
    // PR 018: multi-select — disease codes/names resolved to ids once in resolve()
    let dis: Vec<i32> = f.disease_ids.clone();
    let dis_missing = !f.disease.is_empty() && dis.is_empty();
    let mut series: HashMap<(String, i32), (String, String, Vec<i64>, Vec<i64>)> = HashMap::new();
    let mut heat: HashMap<(String, i32), Vec<i64>> = HashMap::new(); // (metric, province) -> per week
    let mut unmapped = 0i64;
    let n = ws.len();
    if show_ebs && !dis_missing {
        let sql = format!(
            "SELECT {w} wk, e.disease_id, d.code, d.name, e.province_id, COUNT(*)::bigint, COALESCE(SUM(e.jml_kasus),0)::bigint
             FROM ebs_reports e LEFT JOIN master_diseases d ON d.id = e.disease_id
             WHERE {dt} BETWEEN $1 AND $2 AND (cardinality($3::int[]) = 0 OR e.province_id = ANY($3)) AND (cardinality($4::int[]) = 0 OR e.kabkota_id = ANY($4)) AND skdr_unit_ok(e.unit)
               AND (cardinality($5::int[]) = 0 OR e.disease_id = ANY($5))
             GROUP BY 1, 2, 3, 4, 5", w = week_of(EBS_DATE), dt = EBS_DATE);
        for r in c.query(&sql, &[&w0, &w1, &f.province, &f.kabkota, &dis]).await.map_err(internal)? {
            let Some(&i) = idx.get(&r.get::<_, NaiveDate>(0)) else { continue };
            let (alerts, cases): (i64, i64) = (r.get(5), r.get(6));
            if let Some(p) = r.get::<_, Option<i32>>(4) {
                heat.entry(("ebs_alerts".into(), p)).or_insert_with(|| vec![0; n])[i] += alerts;
                heat.entry(("ebs_cases".into(), p)).or_insert_with(|| vec![0; n])[i] += cases;
            }
            match r.get::<_, Option<i32>>(1) {
                Some(d) => {
                    let e = series.entry(("ebs".into(), d)).or_insert_with(|| (r.get(2), r.get(3), vec![0; n], vec![0; n]));
                    e.2[i] += alerts; e.3[i] += cases;
                }
                None => unmapped += alerts,
            }
        }
    }
    if show_pe && !dis_missing {
        let sql = format!(
            "SELECT {w} wk, c.disease_id, d.code, d.name, c.province_id, COUNT(*)::bigint, COUNT(*) FILTER (WHERE c.outcome = 'Meninggal')::bigint
             FROM pe_cases c LEFT JOIN master_diseases d ON d.id = c.disease_id
             WHERE c.deleted_at IS NULL AND c.status = ANY($6) AND {dt} BETWEEN $1 AND $2
               AND (cardinality($3::int[]) = 0 OR c.province_id = ANY($3)) AND (cardinality($4::int[]) = 0 OR c.kabkota_id = ANY($4)) AND skdr_unit_ok(c.data->>'unit_pelapor') AND (cardinality($5::int[]) = 0 OR c.disease_id = ANY($5))
             GROUP BY 1, 2, 3, 4, 5", w = week_of(PE_DATE), dt = PE_DATE);
        for r in c.query(&sql, &[&w0, &w1, &f.province, &f.kabkota, &dis, &counted]).await.map_err(internal)? {
            let Some(&i) = idx.get(&r.get::<_, NaiveDate>(0)) else { continue };
            let (cases, deaths): (i64, i64) = (r.get(5), r.get(6));
            if let Some(p) = r.get::<_, Option<i32>>(4) { heat.entry(("pe_cases".into(), p)).or_insert_with(|| vec![0; n])[i] += cases; }
            if let Some(d) = r.get::<_, Option<i32>>(1) {
                let e = series.entry(("pe".into(), d)).or_insert_with(|| (r.get(2), r.get(3), vec![0; n], vec![0; n]));
                e.2[i] += cases; e.3[i] += deaths;
            }
        }
    }
    let mut out_series: Map<String, Value> = Map::new();
    for key in ["ebs", "pe"] {
        let mut v: Vec<(i64, Value)> = series.iter().filter(|((s, _), _)| s == key).map(|((_, id), (code, name, a, b))| {
            let tot: i64 = a.iter().sum();
            (tot, if key == "ebs" { json!({ "disease_id": id, "code": code, "name": name, "total": tot, "alerts": a, "cases": b }) }
                  else { json!({ "disease_id": id, "code": code, "name": name, "total": tot, "cases": a, "deaths": b }) })
        }).collect();
        v.sort_by(|a, b| b.0.cmp(&a.0));
        out_series.insert(key.into(), Value::Array(v.into_iter().map(|x| x.1).collect()));
    }
    let provs = c.query("SELECT id, code, name FROM master_locations WHERE is_active AND (cardinality($1::int[]) = 0 OR id = ANY($1)) ORDER BY code", &[&f.province]).await.map_err(internal)?;
    let mut heat_out: Map<String, Value> = Map::new();
    for m in ["ebs_alerts", "ebs_cases", "pe_cases"] {
        let rows: Vec<Value> = provs.iter().map(|p| {
            let id: i32 = p.get(0);
            let v = heat.get(&(m.to_string(), id)).cloned().unwrap_or_else(|| vec![0; n]);
            json!({ "province_id": id, "code": p.get::<_, String>(1), "name": p.get::<_, String>(2), "total": v.iter().sum::<i64>(), "values": v })
        }).collect();
        heat_out.insert(m.into(), Value::Array(rows));
    }
    Ok(Json(json!({ "success": true, "data": {
        "weeks": week_json(&ws), "sources": { "ebs": show_ebs, "pe": show_pe },
        "trend": out_series, "ebs_unmapped_alerts": unmapped, "heatmap": heat_out, "disease_not_found": dis_missing,
        "pe_count_statuses": counted,
    }})))
}

const DIS_COLS: &str = "d.id, d.code, d.name, d.english_name, d.category, d.is_zoonotic, d.description, d.icd10, d.symptoms, d.transmission";
fn dis_json(r: &tokio_postgres::Row) -> Value {
    json!({ "id": r.get::<_, i32>(0), "code": r.get::<_, Option<String>>(1), "name": r.get::<_, String>(2), "english_name": r.get::<_, Option<String>>(3),
            "category": r.get::<_, Option<String>>(4), "is_zoonotic": r.get::<_, bool>(5), "description": r.get::<_, Option<String>>(6),
            "icd10": r.get::<_, Option<String>>(7), "symptoms": r.get::<_, Option<String>>(8), "transmission": r.get::<_, Option<String>>(9) })
}

/// GET /api/v1/analytics/diseases — grid of active master diseases with EBS alert and Kasus PE totals (separate).
pub async fn diseases(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let counted = strs(cfg(&c).await?.get("pe_count_statuses"));
    let sql = format!(
        "SELECT {DIS_COLS},
           (SELECT COUNT(*) FROM ebs_reports e WHERE e.disease_id = d.id)::bigint,
           (SELECT COUNT(*) FROM pe_cases c WHERE c.disease_id = d.id AND c.deleted_at IS NULL AND c.status = ANY($1))::bigint
         FROM master_diseases d WHERE d.is_active ORDER BY d.name");
    let rows = c.query(&sql, &[&counted]).await.map_err(internal)?;
    let data: Vec<Value> = rows.iter().map(|r| {
        let mut v = dis_json(r);
        v["ebs_alerts"] = json!(r.get::<_, i64>(10)); v["pe_cases"] = json!(r.get::<_, i64>(11));
        v
    }).collect();
    Ok(Json(json!({ "success": true, "data": data })))
}

/// GET /api/v1/analytics/diseases/:code — disease page: info, epi curve, region map, age/sex, CFR, top regions, latest reports.
pub async fn disease(State(s): State<AppState>, Path(code): Path<String>, Query(q): Query<DashQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let code = code.trim().to_uppercase();
    let d = c.query_opt(&format!("SELECT {DIS_COLS} FROM master_diseases d WHERE upper(d.code) = $1"), &[&code]).await.map_err(internal)?
        .ok_or_else(|| not_found("Penyakit tidak ditemukan"))?;
    let info = dis_json(&d);
    let did: i32 = d.get(0);
    let f = resolve(&c, &q).await?;
    let conf = cfg(&c).await?;
    let counted = strs(conf.get("pe_count_statuses"));
    let dead = conf.pointer("/outcome/dead").and_then(|v| v.as_str()).unwrap_or("Meninggal").to_string();
    let known = { let k = strs(conf.pointer("/outcome/known")); if k.is_empty() { vec!["Sembuh".to_string(), dead.clone()] } else { k } };
    let vprefix = conf.pointer("/ebs/verified_prefix").and_then(|v| v.as_str()).unwrap_or("Terverifikasi").to_string();
    // zoonosis group config (EBS text matching for diagnoses without disease_id, CFR confirmed classes)
    let group = conf.get("groups").and_then(|g| g.as_array()).and_then(|a| a.iter().find(|g| strs(g.get("disease_codes")).contains(&code)).cloned());
    let matches: Vec<String> = group.as_ref().map(|g| g.get("ebs_sub").and_then(|x| x.as_array()).map(|a| a.iter().flat_map(|s| strs(s.get("match"))).map(|m| m.to_lowercase()).collect()).unwrap_or_default()).unwrap_or_default();
    let confirmed: Vec<String> = group.as_ref().map(|g| strs(g.pointer("/cfr/confirmed"))).unwrap_or_default();
    let (show_ebs, show_pe) = src(&f);
    let ws = weeks(&f);
    let (w0, w1) = (ws[0], *ws.last().unwrap() + Duration::days(6));
    let n = ws.len();
    let idx: HashMap<NaiveDate, usize> = ws.iter().enumerate().map(|(i, w)| (*w, i)).collect();
    let ebs_where = format!("(e.disease_id = $1 OR lower(COALESCE(NULLIF(trim(e.verifikasi), ''), trim(e.diagnosa))) = ANY($2))
        AND {EBS_DATE} BETWEEN $3 AND $4 AND (cardinality($5::int[]) = 0 OR e.province_id = ANY($5)) AND (cardinality($6::int[]) = 0 OR e.kabkota_id = ANY($6)) AND skdr_unit_ok(e.unit)");
    let pe_where = format!("c.disease_id = $1 AND c.deleted_at IS NULL AND c.status = ANY($2)
        AND {PE_DATE} BETWEEN $3 AND $4 AND (cardinality($5::int[]) = 0 OR c.province_id = ANY($5)) AND (cardinality($6::int[]) = 0 OR c.kabkota_id = ANY($6)) AND skdr_unit_ok(c.data->>'unit_pelapor')");
    let ep: [&(dyn tokio_postgres::types::ToSql + Sync); 6] = [&did, &matches, &w0, &w1, &f.province, &f.kabkota];
    let pp: [&(dyn tokio_postgres::types::ToSql + Sync); 6] = [&did, &counted, &w0, &w1, &f.province, &f.kabkota];

    // epi curve
    let (mut e_alerts, mut e_cases, mut e_deaths, mut p_cases, mut p_deaths) = (vec![0i64; n], vec![0i64; n], vec![0i64; n], vec![0i64; n], vec![0i64; n]);
    if show_ebs {
        for r in c.query(&format!("SELECT {} wk, COUNT(*)::bigint, COALESCE(SUM(e.jml_kasus),0)::bigint, COALESCE(SUM(LEAST(e.jml_kematian, e.jml_kasus)),0)::bigint FROM ebs_reports e WHERE {ebs_where} GROUP BY 1", week_of(EBS_DATE)), &ep).await.map_err(internal)? {
            if let Some(&i) = idx.get(&r.get::<_, NaiveDate>(0)) { e_alerts[i] = r.get(1); e_cases[i] = r.get(2); e_deaths[i] = r.get(3); }
        }
    }
    if show_pe {
        for r in c.query(&format!("SELECT {} wk, COUNT(*)::bigint, COUNT(*) FILTER (WHERE c.outcome = $7)::bigint FROM pe_cases c WHERE {pe_where} GROUP BY 1", week_of(PE_DATE)),
            &[pp[0], pp[1], pp[2], pp[3], pp[4], pp[5], &dead]).await.map_err(internal)? {
            if let Some(&i) = idx.get(&r.get::<_, NaiveDate>(0)) { p_cases[i] = r.get(1); p_deaths[i] = r.get(2); }
        }
    }
    // regions: province level, or kab/kota inside the chosen province
    let by_kab = !f.province.is_empty();
    let (rid_e, rid_p) = if by_kab { ("e.kabkota_id", "c.kabkota_id") } else { ("e.province_id", "c.province_id") };
    let reg_tbl = if by_kab { "SELECT id, code, name FROM master_kabkota WHERE is_active AND province_id = ANY($1) ORDER BY code" } else { "SELECT id, code, name FROM master_locations WHERE is_active AND cardinality($1::int[]) = 0 ORDER BY code" };
    let mut regions: Vec<(i32, String, String, i64, i64, i64)> = c.query(reg_tbl, &[&f.province]).await.map_err(internal)?
        .iter().map(|r| (r.get(0), r.get(1), r.get(2), 0, 0, 0)).collect();
    let pos: HashMap<i32, usize> = regions.iter().enumerate().map(|(i, r)| (r.0, i)).collect();
    if show_ebs {
        for r in c.query(&format!("SELECT {rid_e}, COUNT(*)::bigint, COALESCE(SUM(e.jml_kasus),0)::bigint FROM ebs_reports e WHERE {ebs_where} AND {rid_e} IS NOT NULL GROUP BY 1"), &ep).await.map_err(internal)? {
            if let Some(&i) = pos.get(&r.get::<_, i32>(0)) { regions[i].3 = r.get(1); regions[i].4 = r.get(2); }
        }
    }
    if show_pe {
        for r in c.query(&format!("SELECT {rid_p}, COUNT(*)::bigint FROM pe_cases c WHERE {pe_where} AND {rid_p} IS NOT NULL GROUP BY 1"), &pp).await.map_err(internal)? {
            if let Some(&i) = pos.get(&r.get::<_, i32>(0)) { regions[i].5 = r.get(1); }
        }
    }
    let regions_json: Vec<Value> = regions.iter().map(|r| json!({ "id": r.0, "code": r.1, "name": r.2, "ebs_alerts": r.3, "ebs_cases": r.4, "pe_cases": r.5 })).collect();
    let top = |k: usize| { let mut v: Vec<&(i32, String, String, i64, i64, i64)> = regions.iter().filter(|r| [r.3, r.4, r.5][k] > 0).collect();
        v.sort_by(|a, b| [b.3, b.4, b.5][k].cmp(&[a.3, a.4, a.5][k])); v.into_iter().take(10).map(|r| json!({ "id": r.0, "code": r.1, "name": r.2, "value": ([r.3, r.4, r.5][k]) })).collect::<Vec<_>>() };

    // age & sex (Kasus PE only; EBS has no individual data)
    let mut age = vec![]; let mut sex = vec![];
    let (mut pe_known, mut pe_dead, mut pe_unknown) = (0i64, 0i64, 0i64);
    if show_pe {
        age = c.query(&format!("SELECT CASE WHEN c.age_years IS NULL THEN 'Tidak diketahui' WHEN c.age_years < 5 THEN '0–4' WHEN c.age_years < 15 THEN '5–14'
                 WHEN c.age_years < 25 THEN '15–24' WHEN c.age_years < 45 THEN '25–44' WHEN c.age_years < 65 THEN '45–64' ELSE '≥65' END g,
                 COUNT(*) FILTER (WHERE c.sex ILIKE 'laki%')::bigint, COUNT(*) FILTER (WHERE c.sex ILIKE 'perempuan%')::bigint,
                 COUNT(*) FILTER (WHERE c.sex IS NULL OR NOT (c.sex ILIKE 'laki%' OR c.sex ILIKE 'perempuan%'))::bigint
               FROM pe_cases c WHERE {pe_where} GROUP BY 1"), &pp).await.map_err(internal)?
            .iter().map(|r| json!({ "group": r.get::<_, String>(0), "male": r.get::<_, i64>(1), "female": r.get::<_, i64>(2), "unknown": r.get::<_, i64>(3) })).collect();
        sex = c.query(&format!("SELECT COALESCE(NULLIF(c.sex, ''), 'Tidak diketahui'), COUNT(*)::bigint FROM pe_cases c WHERE {pe_where} GROUP BY 1 ORDER BY 2 DESC"), &pp).await.map_err(internal)?
            .iter().map(|r| json!({ "sex": r.get::<_, String>(0), "n": r.get::<_, i64>(1) })).collect();
        let r = c.query_one(&format!("SELECT COUNT(*) FILTER (WHERE c.outcome = ANY($7))::bigint, COUNT(*) FILTER (WHERE c.outcome = $8)::bigint,
                COUNT(*) FILTER (WHERE c.outcome IS NULL OR NOT (c.outcome = ANY($7)))::bigint
              FROM pe_cases c WHERE {pe_where} AND (cardinality($9::text[]) = 0 OR COALESCE(c.classification_override, c.classification) = ANY($9))"),
            &[pp[0], pp[1], pp[2], pp[3], pp[4], pp[5], &known, &dead, &confirmed]).await.map_err(internal)?;
        pe_known = r.get(0); pe_dead = r.get(1); pe_unknown = r.get(2);
    }
    let (mut ebs_vc, mut ebs_vd) = (0i64, 0i64);
    let mut latest_ebs = vec![]; let mut latest_pe = vec![];
    if show_ebs {
        let r = c.query_one(&format!("SELECT COALESCE(SUM(e.jml_kasus),0)::bigint, COALESCE(SUM(LEAST(e.jml_kematian, e.jml_kasus)),0)::bigint FROM ebs_reports e WHERE {ebs_where} AND e.sts_rumor ILIKE $7 || '%'"),
            &[ep[0], ep[1], ep[2], ep[3], ep[4], ep[5], &vprefix]).await.map_err(internal)?;
        ebs_vc = r.get(0); ebs_vd = r.get(1);
        latest_ebs = c.query(&format!("SELECT e.no_ebs, {EBS_DATE}::text, e.kota, e.propinsi, e.sts_rumor, e.jml_kasus, e.jml_kematian, COALESCE(NULLIF(trim(e.verifikasi), ''), e.diagnosa), e.id_ebs
              FROM ebs_reports e WHERE {ebs_where} ORDER BY {EBS_DATE} DESC NULLS LAST, e.id_ebs DESC LIMIT 10"), &ep).await.map_err(internal)?
            .iter().map(|r| json!({ "no_ebs": r.get::<_, Option<String>>(0), "date": r.get::<_, Option<String>>(1), "kabkota": r.get::<_, Option<String>>(2),
                "province": r.get::<_, Option<String>>(3), "status": r.get::<_, Option<String>>(4), "cases": r.get::<_, Option<i32>>(5), "deaths": r.get::<_, Option<i32>>(6), "diagnosa": r.get::<_, Option<String>>(7), "id": r.get::<_, i64>(8) })).collect();
    }
    if show_pe {
        latest_pe = c.query(&format!("SELECT c.id, c.no_pe, c.form_key, c.status, COALESCE(c.classification_override, c.classification), {PE_DATE}::text, k.name, l.name, c.patient_name
              FROM pe_cases c LEFT JOIN master_kabkota k ON k.id = c.kabkota_id LEFT JOIN master_locations l ON l.id = c.province_id
              WHERE {pe_where} ORDER BY {PE_DATE} DESC, c.id DESC LIMIT 10"), &pp).await.map_err(internal)?
            .iter().map(|r| json!({ "id": r.get::<_, i64>(0), "no_pe": r.get::<_, String>(1), "form_key": r.get::<_, String>(2), "status": r.get::<_, String>(3),
                "classification": r.get::<_, Option<String>>(4), "date": r.get::<_, Option<String>>(5), "kabkota": r.get::<_, Option<String>>(6), "province": r.get::<_, Option<String>>(7),
                "patient_initials": r.get::<_, Option<String>>(8).map(|n| n.split_whitespace().filter_map(|w| w.chars().next()).map(|ch| format!("{}.", ch.to_uppercase())).collect::<Vec<_>>().join(" ")) })).collect();
    }
    let sum = |v: &Vec<i64>| v.iter().sum::<i64>();
    Ok(Json(json!({ "success": true, "data": {
        "disease": info, "weeks": week_json(&ws), "sources": { "ebs": show_ebs, "pe": show_pe },
        "level": if by_kab { "kabkota" } else { "province" }, "scope": f.scope,
        "totals": { "ebs_alerts": sum(&e_alerts), "ebs_cases": sum(&e_cases), "ebs_deaths": sum(&e_deaths), "pe_cases": sum(&p_cases), "pe_deaths": sum(&p_deaths) },
        "epi": { "ebs_alerts": e_alerts, "ebs_cases": e_cases, "ebs_deaths": e_deaths, "pe_cases": p_cases, "pe_deaths": p_deaths },
        "regions": regions_json, "top": { "ebs_alerts": top(0), "ebs_cases": top(1), "pe_cases": top(2) },
        "age": age, "sex": sex,
        "cfr": {
            "pe": { "rate": rate(pe_dead, pe_known, &conf), "unknown": pe_unknown, "confirmed_classes": confirmed, "label": group.as_ref().and_then(|g| g.pointer("/cfr/confirmed_label").cloned()) },
            "ebs": { "rate": rate(ebs_vd, ebs_vc, &conf), "basis": "alert terverifikasi (jml_kematian / jml_kasus)" },
        },
        "latest": { "ebs": latest_ebs, "pe": latest_pe }, "pe_form": group.as_ref().and_then(|g| g.get("pe_form").cloned()),
    }})))
}

/// PR 016: GET /api/v1/analytics/summary — one payload for the main dashboard, following the global Sumber filter:
/// KPI totals per source, a registry-driven disease table (master_diseases + pe_form_definitions) with weekly
/// sparklines, and per-province figures for the map popup. EBS (sinyal) and Kasus PE are always separate fields.
pub async fn summary(State(s): State<AppState>, Query(q): Query<DashQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let f = resolve(&c, &q).await?;
    let conf = cfg(&c).await?;
    let counted = strs(conf.get("pe_count_statuses"));
    let ws = weeks(&f);
    let (w0, w1) = (ws[0], *ws.last().unwrap() + Duration::days(6));
    let n = ws.len();
    let idx: HashMap<NaiveDate, usize> = ws.iter().enumerate().map(|(i, w)| (*w, i)).collect();
    let (show_ebs, show_pe) = src(&f);
    // PR 018: multi-select — disease codes/names resolved to ids once in resolve()
    let dis: Vec<i32> = f.disease_ids.clone();
    let dis_missing = !f.disease.is_empty() && dis.is_empty();
    let ebs_where = format!("{EBS_DATE} BETWEEN $1 AND $2 AND (cardinality($3::int[]) = 0 OR e.province_id = ANY($3)) AND (cardinality($4::int[]) = 0 OR e.kabkota_id = ANY($4)) AND skdr_unit_ok(e.unit) AND (cardinality($5::int[]) = 0 OR e.disease_id = ANY($5))");
    let pe_where = format!("c.deleted_at IS NULL AND c.status = ANY($6) AND {PE_DATE} BETWEEN $1 AND $2 AND (cardinality($3::int[]) = 0 OR c.province_id = ANY($3)) AND (cardinality($4::int[]) = 0 OR c.kabkota_id = ANY($4)) AND skdr_unit_ok(c.data->>'unit_pelapor') AND (cardinality($5::int[]) = 0 OR c.disease_id = ANY($5))");
    let ep: [&(dyn tokio_postgres::types::ToSql + Sync); 5] = [&w0, &w1, &f.province, &f.kabkota, &dis];
    let pp: [&(dyn tokio_postgres::types::ToSql + Sync); 6] = [&w0, &w1, &f.province, &f.kabkota, &dis, &counted];
    let on_ebs = show_ebs && !dis_missing;
    let on_pe = show_pe && !dis_missing;

    // KPI totals (EBS: alerts = reports, cases = jml_kasus; PE: individual reports)
    let mut kpi_ebs = Value::Null;
    let mut kpi_pe = Value::Null;
    if on_ebs {
        let r = c.query_one(&format!("SELECT COUNT(*)::bigint, COALESCE(SUM(e.jml_kasus),0)::bigint, COALESCE(SUM(LEAST(e.jml_kematian, e.jml_kasus)),0)::bigint,
                COUNT(DISTINCT e.province_id)::bigint, COUNT(DISTINCT e.kabkota_id)::bigint, COUNT(*) FILTER (WHERE e.sts_rumor ILIKE 'Terverifikasi%')::bigint
              FROM ebs_reports e WHERE {ebs_where}"), &ep).await.map_err(internal)?;
        kpi_ebs = json!({ "alerts": r.get::<_, i64>(0), "cases": r.get::<_, i64>(1), "deaths": r.get::<_, i64>(2), "provinces": r.get::<_, i64>(3), "kabkota": r.get::<_, i64>(4), "verified": r.get::<_, i64>(5) });
    }
    if on_pe {
        let r = c.query_one(&format!("SELECT COUNT(*)::bigint, COUNT(*) FILTER (WHERE c.outcome = 'Meninggal')::bigint,
                COUNT(DISTINCT c.province_id)::bigint, COUNT(DISTINCT c.kabkota_id)::bigint, COUNT(*) FILTER (WHERE c.status IN ('terverifikasi','final'))::bigint
              FROM pe_cases c WHERE {pe_where}"), &pp).await.map_err(internal)?;
        kpi_pe = json!({ "cases": r.get::<_, i64>(0), "deaths": r.get::<_, i64>(1), "provinces": r.get::<_, i64>(2), "kabkota": r.get::<_, i64>(3), "verified": r.get::<_, i64>(4) });
    }

    // disease registry rows (active master diseases; has_pe_form from pe_form_definitions)
    let reg = c.query("SELECT d.id, d.code, d.name, d.category, d.is_zoonotic,
            (SELECT p.form_key FROM pe_form_definitions p WHERE p.disease_id = d.id AND p.is_active ORDER BY p.version DESC LIMIT 1)
         FROM master_diseases d WHERE d.is_active AND (cardinality($1::int[]) = 0 OR d.id = ANY($1)) ORDER BY d.name", &[&dis]).await.map_err(internal)?;
    // per disease × week
    let mut ebs_w: HashMap<i32, (Vec<i64>, Vec<i64>, i64)> = HashMap::new(); // alerts, cases, deaths
    let mut pe_w: HashMap<i32, (Vec<i64>, i64)> = HashMap::new(); // cases, deaths
    let mut regs: HashMap<i32, (i64, i64)> = HashMap::new(); // disease -> (ebs provinces, pe provinces)
    let mut ebs_unmapped = 0i64;
    if on_ebs {
        for r in c.query(&format!("SELECT {w}, e.disease_id, COUNT(*)::bigint, COALESCE(SUM(e.jml_kasus),0)::bigint, COALESCE(SUM(LEAST(e.jml_kematian, e.jml_kasus)),0)::bigint
                FROM ebs_reports e WHERE {ebs_where} GROUP BY 1, 2", w = week_of(EBS_DATE)), &ep).await.map_err(internal)? {
            let Some(&i) = idx.get(&r.get::<_, NaiveDate>(0)) else { continue };
            match r.get::<_, Option<i32>>(1) {
                Some(d) => { let e = ebs_w.entry(d).or_insert_with(|| (vec![0; n], vec![0; n], 0)); e.0[i] += r.get::<_, i64>(2); e.1[i] += r.get::<_, i64>(3); e.2 += r.get::<_, i64>(4); }
                None => ebs_unmapped += r.get::<_, i64>(2),
            }
        }
        for r in c.query(&format!("SELECT e.disease_id, COUNT(DISTINCT e.province_id)::bigint FROM ebs_reports e WHERE {ebs_where} AND e.disease_id IS NOT NULL GROUP BY 1"), &ep).await.map_err(internal)? {
            regs.entry(r.get(0)).or_default().0 = r.get(1);
        }
    }
    if on_pe {
        for r in c.query(&format!("SELECT {w}, c.disease_id, COUNT(*)::bigint, COUNT(*) FILTER (WHERE c.outcome = 'Meninggal')::bigint
                FROM pe_cases c WHERE {pe_where} AND c.disease_id IS NOT NULL GROUP BY 1, 2", w = week_of(PE_DATE)), &pp).await.map_err(internal)? {
            let Some(&i) = idx.get(&r.get::<_, NaiveDate>(0)) else { continue };
            let e = pe_w.entry(r.get(1)).or_insert_with(|| (vec![0; n], 0)); e.0[i] += r.get::<_, i64>(2); e.1 += r.get::<_, i64>(3);
        }
        for r in c.query(&format!("SELECT c.disease_id, COUNT(DISTINCT c.province_id)::bigint FROM pe_cases c WHERE {pe_where} AND c.disease_id IS NOT NULL GROUP BY 1"), &pp).await.map_err(internal)? {
            regs.entry(r.get(0)).or_default().1 = r.get(1);
        }
    }
    // PR 018: disease summary cards — last data date, 24 h change (arrival timestamps) and known outcomes per disease
    let known_out = strs(conf.pointer("/outcome/known"));
    let mut last: HashMap<i32, (Option<NaiveDate>, Option<NaiveDate>)> = HashMap::new();
    let mut d24e: HashMap<i32, Value> = HashMap::new();
    let mut d24p: HashMap<i32, Value> = HashMap::new();
    let mut known_pe: HashMap<i32, i64> = HashMap::new();
    let lp: [&(dyn tokio_postgres::types::ToSql + Sync); 3] = [&f.province, &f.kabkota, &dis];
    if on_ebs {
        for r in c.query(&format!("SELECT e.disease_id, MAX({EBS_DATE}) FROM ebs_reports e WHERE {ebs_where} AND e.disease_id IS NOT NULL GROUP BY 1"), &ep).await.map_err(internal)? {
            last.entry(r.get(0)).or_default().0 = r.get(1);
        }
        let fl = "(cardinality($1::int[]) = 0 OR e.province_id = ANY($1)) AND (cardinality($2::int[]) = 0 OR e.kabkota_id = ANY($2)) AND skdr_unit_ok(e.unit) AND (cardinality($3::int[]) = 0 OR e.disease_id = ANY($3))";
        for r in c.query(&format!("SELECT e.disease_id,
                    COUNT(*) FILTER (WHERE (e.create_date AT TIME ZONE 'Asia/Jakarta') >= now() - interval '24 hours' AND (e.create_date AT TIME ZONE 'Asia/Jakarta') <= now())::bigint,
                    COUNT(*) FILTER (WHERE (e.create_date AT TIME ZONE 'Asia/Jakarta') >= now() - interval '48 hours' AND (e.create_date AT TIME ZONE 'Asia/Jakarta') < now() - interval '24 hours')::bigint,
                    bool_or((e.create_date AT TIME ZONE 'Asia/Jakarta') < now() - interval '24 hours')
                FROM ebs_reports e WHERE {fl} AND e.disease_id IS NOT NULL AND e.create_date IS NOT NULL GROUP BY 1"), &lp).await.map_err(internal)? {
            if r.get::<_, Option<bool>>(3).unwrap_or(false) { d24e.insert(r.get(0), json!({ "cur": r.get::<_, i64>(1), "prev": r.get::<_, i64>(2) })); }
        }
    }
    if on_pe {
        let pk: [&(dyn tokio_postgres::types::ToSql + Sync); 7] = [&w0, &w1, &f.province, &f.kabkota, &dis, &counted, &known_out];
        for r in c.query(&format!("SELECT c.disease_id, MAX({PE_DATE}), COUNT(*) FILTER (WHERE c.outcome = ANY($7))::bigint FROM pe_cases c WHERE {pe_where} AND c.disease_id IS NOT NULL GROUP BY 1"), &pk).await.map_err(internal)? {
            last.entry(r.get(0)).or_default().1 = r.get(1);
            known_pe.insert(r.get(0), r.get(2));
        }
        let fl = "c.deleted_at IS NULL AND c.status = ANY($4) AND (cardinality($1::int[]) = 0 OR c.province_id = ANY($1)) AND (cardinality($2::int[]) = 0 OR c.kabkota_id = ANY($2)) AND skdr_unit_ok(c.data->>'unit_pelapor') AND (cardinality($3::int[]) = 0 OR c.disease_id = ANY($3))";
        let lpp: [&(dyn tokio_postgres::types::ToSql + Sync); 4] = [&f.province, &f.kabkota, &dis, &counted];
        for r in c.query(&format!("SELECT c.disease_id,
                    COUNT(*) FILTER (WHERE c.created_at >= now() - interval '24 hours' AND c.created_at <= now())::bigint,
                    COUNT(*) FILTER (WHERE c.created_at >= now() - interval '48 hours' AND c.created_at < now() - interval '24 hours')::bigint,
                    bool_or(c.created_at < now() - interval '24 hours')
                FROM pe_cases c WHERE {fl} AND c.disease_id IS NOT NULL GROUP BY 1"), &lpp).await.map_err(internal)? {
            if r.get::<_, Option<bool>>(3).unwrap_or(false) { d24p.insert(r.get(0), json!({ "cur": r.get::<_, i64>(1), "prev": r.get::<_, i64>(2) })); }
        }
    }
    // PR 016 (sheet No. 17): Kasus PE per case status, labels/order from the registry (dashboard_executive.groups[].pe_status)
    let mut cls: HashMap<(i32, String), i64> = HashMap::new();
    if on_pe {
        for r in c.query(&format!("SELECT c.disease_id, COALESCE(NULLIF(COALESCE(c.classification_override, c.classification), ''), '') , COUNT(*)::bigint
                FROM pe_cases c WHERE {pe_where} AND c.disease_id IS NOT NULL GROUP BY 1, 2"), &pp).await.map_err(internal)? {
            cls.insert((r.get(0), r.get(1)), r.get(2));
        }
    }
    let status_defs: HashMap<String, Vec<(String, String)>> = conf.get("groups").and_then(|g| g.as_array()).map(|a| a.iter().flat_map(|g| {
        let defs: Vec<(String, String)> = g.get("pe_status").and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|s| Some((s.get("code")?.as_str()?.to_string(), s.get("label")?.as_str()?.to_string()))).collect()).unwrap_or_default();
        strs(g.get("disease_codes")).into_iter().map(move |code| (code, defs.clone()))
    }).collect()).unwrap_or_default();
    let status_of = |id: i32, code: &str| -> Value {
        let Some(defs) = status_defs.get(code) else { return Value::Null };
        let known: Vec<&str> = defs.iter().map(|d| d.0.as_str()).collect();
        let other: i64 = cls.iter().filter(|((d, k), _)| *d == id && !known.contains(&k.as_str())).map(|(_, v)| *v).sum();
        json!({ "classes": defs.iter().map(|(k, l)| json!({ "code": k, "label": l, "n": cls.get(&(id, k.clone())).copied().unwrap_or(0) })).collect::<Vec<_>>(), "unclassified": other })
    };
    // change = last 4 weeks vs previous 4 weeks (per source, never combined)
    let delta = |v: &Vec<i64>| -> Value {
        if v.len() < 8 { return Value::Null }
        let l = v.len();
        let (a, b): (i64, i64) = (v[l - 4..].iter().sum(), v[l - 8..l - 4].iter().sum());
        json!({ "last4": a, "prev4": b })
    };
    let diseases: Vec<Value> = reg.iter().map(|r| {
        let id: i32 = r.get(0);
        let e = ebs_w.get(&id);
        let p = pe_w.get(&id);
        let rg = regs.get(&id).copied().unwrap_or((0, 0));
        json!({
            "id": id, "code": r.get::<_, String>(1), "name": r.get::<_, String>(2), "category": r.get::<_, Option<String>>(3),
            "is_zoonotic": r.get::<_, bool>(4), "pe_form": r.get::<_, Option<String>>(5),
            "ebs": if on_ebs { json!({ "alerts": e.map(|x| x.0.iter().sum::<i64>()).unwrap_or(0), "cases": e.map(|x| x.1.iter().sum::<i64>()).unwrap_or(0),
                    "deaths": e.map(|x| x.2).unwrap_or(0), "provinces": rg.0,
                    "spark_alerts": e.map(|x| x.0.clone()).unwrap_or_else(|| vec![0; n]), "spark_cases": e.map(|x| x.1.clone()).unwrap_or_else(|| vec![0; n]),
                    "delta_alerts": e.map(|x| delta(&x.0)).unwrap_or(Value::Null), "delta_cases": e.map(|x| delta(&x.1)).unwrap_or(Value::Null),
                    "last_date": last.get(&id).and_then(|x| x.0).map(|d| d.to_string()), "d24": d24e.get(&id).cloned().unwrap_or(Value::Null) }) } else { Value::Null },
            "pe": if on_pe { json!({ "cases": p.map(|x| x.0.iter().sum::<i64>()).unwrap_or(0), "deaths": p.map(|x| x.1).unwrap_or(0), "provinces": rg.1,
                    "spark": p.map(|x| x.0.clone()).unwrap_or_else(|| vec![0; n]), "delta": p.map(|x| delta(&x.0)).unwrap_or(Value::Null),
                    "status": status_of(id, &r.get::<_, String>(1)),
                    "known_outcome": known_pe.get(&id).copied().unwrap_or(0),
                    "last_date": last.get(&id).and_then(|x| x.1).map(|d| d.to_string()), "d24": d24p.get(&id).cloned().unwrap_or(Value::Null) }) } else { Value::Null },
        })
    }).collect();

    // per province (map popup / choropleth); keyed by master_locations
    let mut prov: HashMap<i32, [i64; 5]> = HashMap::new(); // ebs alerts, ebs cases, ebs deaths, pe cases, pe deaths
    if on_ebs {
        for r in c.query(&format!("SELECT e.province_id, COUNT(*)::bigint, COALESCE(SUM(e.jml_kasus),0)::bigint, COALESCE(SUM(LEAST(e.jml_kematian, e.jml_kasus)),0)::bigint
                FROM ebs_reports e WHERE {ebs_where} AND e.province_id IS NOT NULL GROUP BY 1"), &ep).await.map_err(internal)? {
            let v = prov.entry(r.get(0)).or_default(); v[0] = r.get(1); v[1] = r.get(2); v[2] = r.get(3);
        }
    }
    if on_pe {
        for r in c.query(&format!("SELECT c.province_id, COUNT(*)::bigint, COUNT(*) FILTER (WHERE c.outcome = 'Meninggal')::bigint
                FROM pe_cases c WHERE {pe_where} AND c.province_id IS NOT NULL GROUP BY 1"), &pp).await.map_err(internal)? {
            let v = prov.entry(r.get(0)).or_default(); v[3] = r.get(1); v[4] = r.get(2);
        }
    }
    let provinces: Vec<Value> = c.query("SELECT id, code, name FROM master_locations WHERE is_active ORDER BY code", &[]).await.map_err(internal)?
        .iter().filter_map(|r| {
            let id: i32 = r.get(0);
            prov.get(&id).map(|v| json!({ "id": id, "code": r.get::<_, String>(1), "name": r.get::<_, String>(2),
                "ebs_alerts": v[0], "ebs_cases": v[1], "ebs_deaths": v[2], "pe_cases": v[3], "pe_deaths": v[4] }))
        }).collect();

    // PR 016: KPI card trend — daily series for the last 30 days of the period (by report date) and the change over the
    // last 24 hours vs the 24 hours before, by real arrival timestamps (EBS create_date in WIB, PE created_at).
    // d24 = null when the source has no rows older than 24 h for this filter (UI shows "—"); never synthesised.
    let today = chrono::Local::now().date_naive();
    let cap = if w1 < today { w1 } else { today };
    // The sparkline spans exactly the selected epi-week range (global filter): daily buckets when the range is
    // ≤ 56 days, otherwise epi weeks. "until" = latest report date with data (UI note "data s.d. …"); no private window.
    let fe = "(cardinality($3::int[]) = 0 OR e.province_id = ANY($3)) AND (cardinality($4::int[]) = 0 OR e.kabkota_id = ANY($4)) AND skdr_unit_ok(e.unit) AND (cardinality($5::int[]) = 0 OR e.disease_id = ANY($5))";
    let fpe = "c.deleted_at IS NULL AND c.status = ANY($6) AND (cardinality($3::int[]) = 0 OR c.province_id = ANY($3)) AND (cardinality($4::int[]) = 0 OR c.kabkota_id = ANY($4)) AND skdr_unit_ok(c.data->>'unit_pelapor') AND (cardinality($5::int[]) = 0 OR c.disease_id = ANY($5))";
    let ebs_latest: Option<NaiveDate> = if on_ebs { c.query_one(&format!("SELECT MAX({EBS_DATE}) FROM ebs_reports e WHERE {EBS_DATE} BETWEEN $1 AND $2 AND {fe}"), &ep).await.map_err(internal)?.get(0) } else { None };
    let pe_latest: Option<NaiveDate> = if on_pe { c.query_one(&format!("SELECT MAX({PE_DATE}) FROM pe_cases c WHERE {PE_DATE} BETWEEN $1 AND $2 AND {fpe}"), &pp).await.map_err(internal)?.get(0) } else { None };
    let latest = [ebs_latest, pe_latest].into_iter().flatten().max();
    let d0 = w0;
    let d1 = cap;
    let daily = (d1 - d0).num_days() < 56;
    let days: Vec<NaiveDate> = if daily { (0..=(d1 - d0).num_days().max(0)).map(|i| d0 + Duration::days(i)).collect() } else { ws.iter().copied().filter(|w| *w <= d1).collect() };
    let nb = days.len();
    let didx: HashMap<NaiveDate, usize> = days.iter().enumerate().map(|(i, d)| (*d, i)).collect();
    let bucket_e = if daily { EBS_DATE.to_string() } else { week_of(EBS_DATE) };
    let bucket_p = if daily { PE_DATE.to_string() } else { week_of(PE_DATE) };
    let rp: [&(dyn tokio_postgres::types::ToSql + Sync); 5] = [&d0, &d1, &f.province, &f.kabkota, &dis];
    let rpp: [&(dyn tokio_postgres::types::ToSql + Sync); 6] = [&d0, &d1, &f.province, &f.kabkota, &dis, &counted];
    let pair = |cur: i64, prev: i64| json!({ "cur": cur, "prev": prev });
    let mut trend_ebs = Value::Null;
    let mut trend_pe = Value::Null;
    if on_ebs {
        let mut a = [vec![0i64; nb], vec![0i64; nb], vec![0i64; nb], vec![0i64; nb]];
        for r in c.query(&format!("SELECT {bucket_e} d, COUNT(*)::bigint, COALESCE(SUM(e.jml_kasus),0)::bigint, COALESCE(SUM(LEAST(e.jml_kematian, e.jml_kasus)),0)::bigint, COUNT(DISTINCT e.province_id)::bigint
                FROM ebs_reports e WHERE {ebs_where} GROUP BY 1"), &rp).await.map_err(internal)? {
            let Some(&i) = didx.get(&r.get::<_, NaiveDate>(0)) else { continue };
            for k in 0..4 { a[k][i] = r.get::<_, i64>(k + 1); }
        }
        let fl = "(cardinality($1::int[]) = 0 OR e.province_id = ANY($1)) AND (cardinality($2::int[]) = 0 OR e.kabkota_id = ANY($2)) AND skdr_unit_ok(e.unit) AND (cardinality($3::int[]) = 0 OR e.disease_id = ANY($3))";
        let fp: [&(dyn tokio_postgres::types::ToSql + Sync); 3] = [&f.province, &f.kabkota, &dis];
        let r = c.query_one(&format!("WITH x AS (SELECT e.jml_kasus k, LEAST(e.jml_kematian, e.jml_kasus) m, e.province_id p,
                    CASE WHEN (e.create_date AT TIME ZONE 'Asia/Jakarta') >= now() - interval '24 hours' THEN 1 ELSE 0 END cur
                  FROM ebs_reports e WHERE {fl} AND e.create_date IS NOT NULL
                    AND (e.create_date AT TIME ZONE 'Asia/Jakarta') >= now() - interval '48 hours' AND (e.create_date AT TIME ZONE 'Asia/Jakarta') <= now())
             SELECT COUNT(*) FILTER (WHERE cur = 1)::bigint, COUNT(*) FILTER (WHERE cur = 0)::bigint,
                    COALESCE(SUM(k) FILTER (WHERE cur = 1),0)::bigint, COALESCE(SUM(k) FILTER (WHERE cur = 0),0)::bigint,
                    COALESCE(SUM(m) FILTER (WHERE cur = 1),0)::bigint, COALESCE(SUM(m) FILTER (WHERE cur = 0),0)::bigint,
                    COUNT(DISTINCT p) FILTER (WHERE cur = 1)::bigint, COUNT(DISTINCT p) FILTER (WHERE cur = 0)::bigint,
                    EXISTS (SELECT 1 FROM ebs_reports e WHERE {fl} AND (e.create_date AT TIME ZONE 'Asia/Jakarta') < now() - interval '24 hours')
             FROM x"), &fp).await.map_err(internal)?;
        let g = |i: usize| r.get::<_, i64>(i);
        let d24 = if r.get::<_, bool>(8) { json!({ "alerts": pair(g(0), g(1)), "cases": pair(g(2), g(3)), "deaths": pair(g(4), g(5)), "provinces": pair(g(6), g(7)) }) } else { Value::Null };
        let [al, ca, de, pr] = a;
        trend_ebs = json!({ "alerts": al, "cases": ca, "deaths": de, "provinces": pr, "d24": d24 });
    }
    if on_pe {
        let mut a = [vec![0i64; nb], vec![0i64; nb], vec![0i64; nb]];
        for r in c.query(&format!("SELECT {bucket_p} d, COUNT(*)::bigint, COUNT(*) FILTER (WHERE c.outcome = 'Meninggal')::bigint, COUNT(DISTINCT c.province_id)::bigint
                FROM pe_cases c WHERE {pe_where} GROUP BY 1"), &rpp).await.map_err(internal)? {
            let Some(&i) = didx.get(&r.get::<_, NaiveDate>(0)) else { continue };
            for k in 0..3 { a[k][i] = r.get::<_, i64>(k + 1); }
        }
        let fl = "c.deleted_at IS NULL AND c.status = ANY($4) AND (cardinality($1::int[]) = 0 OR c.province_id = ANY($1)) AND (cardinality($2::int[]) = 0 OR c.kabkota_id = ANY($2)) AND skdr_unit_ok(c.data->>'unit_pelapor') AND (cardinality($3::int[]) = 0 OR c.disease_id = ANY($3))";
        let fp: [&(dyn tokio_postgres::types::ToSql + Sync); 4] = [&f.province, &f.kabkota, &dis, &counted];
        let r = c.query_one(&format!("WITH x AS (SELECT c.outcome o, c.province_id p, CASE WHEN c.created_at >= now() - interval '24 hours' THEN 1 ELSE 0 END cur
                  FROM pe_cases c WHERE {fl} AND c.created_at >= now() - interval '48 hours' AND c.created_at <= now())
             SELECT COUNT(*) FILTER (WHERE cur = 1)::bigint, COUNT(*) FILTER (WHERE cur = 0)::bigint,
                    COUNT(*) FILTER (WHERE cur = 1 AND o = 'Meninggal')::bigint, COUNT(*) FILTER (WHERE cur = 0 AND o = 'Meninggal')::bigint,
                    COUNT(DISTINCT p) FILTER (WHERE cur = 1)::bigint, COUNT(DISTINCT p) FILTER (WHERE cur = 0)::bigint,
                    EXISTS (SELECT 1 FROM pe_cases c WHERE {fl} AND c.created_at < now() - interval '24 hours')
             FROM x"), &fp).await.map_err(internal)?;
        let g = |i: usize| r.get::<_, i64>(i);
        let d24 = if r.get::<_, bool>(6) { json!({ "cases": pair(g(0), g(1)), "deaths": pair(g(2), g(3)), "provinces": pair(g(4), g(5)) }) } else { Value::Null };
        let [ca, de, pr] = a;
        trend_pe = json!({ "cases": ca, "deaths": de, "provinces": pr, "d24": d24 });
    }
    // PR 016: 7-1-7 (sheet "Spesifikasi Dashboard Executive" No. 41–45), Alert EBS only, denominator = all alerts except
    // discarded. Notification = Tanggal dibuat (create_date) − Tanggal (A.2, tgl_laporan) ≤ 1 day. Detection needs
    // Tanggal Rumor Diketahui (A.11) and Response needs the response-action dates (B.20/B.28/B.30/B.34/B.37/B.39);
    // the EBS API feed does not deliver those fields, so both are reported as unavailable (never estimated).
    let mut t717 = Value::Null;
    if on_ebs {
        let ecfg = cfg(&c).await?;
        let discarded = strs(ecfg.pointer("/ebs/discarded"));
        let mut ep2: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = ep.to_vec();
        ep2.push(&discarded);
        let lag = "(e.create_date::date - e.tgl_laporan)";
        let q = format!("SELECT e.disease_id, COUNT(*)::bigint,
                COUNT(*) FILTER (WHERE {lag} <= 1)::bigint, COUNT(*) FILTER (WHERE {lag} > 1)::bigint,
                COUNT(*) FILTER (WHERE e.create_date IS NULL OR e.tgl_laporan IS NULL)::bigint,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY {lag})::float8, GROUPING(e.disease_id)::int
              FROM ebs_reports e WHERE {ebs_where} AND NOT (COALESCE(e.sts_rumor, '') = ANY($6))
              GROUP BY ROLLUP (e.disease_id)");
        let mut overall = Value::Null;
        let mut per: HashMap<i32, Value> = HashMap::new();
        for r in c.query(&q, &ep2).await.map_err(internal)? {
            let (den, ok, late, miss): (i64, i64, i64, i64) = (r.get(1), r.get(2), r.get(3), r.get(4));
            let v = json!({ "den": den, "on_time": ok, "late": late, "missing": miss, "median_days": r.get::<_, Option<f64>>(5),
                "pct": if den > 0 { Some((ok as f64) * 100.0 / den as f64) } else { None } });
            if r.get::<_, i32>(6) == 1 { overall = v; } else if let Some(d) = r.get::<_, Option<i32>>(0) { per.insert(d, v); }
        }
        let rows: Vec<Value> = reg.iter().filter_map(|r| { let id: i32 = r.get(0); per.get(&id).map(|v| json!({ "id": id, "code": r.get::<_, String>(1), "name": r.get::<_, String>(2), "notification": v })) }).collect();
        let missing_fields = json!({
            "detection": ["Tanggal Rumor Diketahui"],
            "response": ["Tanggal Tatalaksana Kasus", "Tanggal PE", "Tanggal Mobilisasi TGC", "Tanggal pengendalian faktor risiko", "Tanggal Penyuluhan/Komunikasi Risiko", "Tanggal Koordinasi Rapat LP/LS"],
        });
        // PR 018: per-signal timing (latest alerts in the filter) for the 7-1-7 detail; each row opens the signal modal
        let sig = c.query(&format!("SELECT e.id_ebs, e.no_ebs, COALESCE(d.name, e.diagnosa), e.kota, e.propinsi, e.tgl_laporan::text,
                    to_char(e.create_date, 'YYYY-MM-DD HH24:MI'), {lag}, e.sts_rumor
                FROM ebs_reports e LEFT JOIN master_diseases d ON d.id = e.disease_id
                WHERE {ebs_where} AND NOT (COALESCE(e.sts_rumor, '') = ANY($6))
                ORDER BY {EBS_DATE} DESC NULLS LAST, e.id_ebs DESC LIMIT 30"), &ep2).await.map_err(internal)?;
        let signals: Vec<Value> = sig.iter().map(|r| json!({ "id": r.get::<_, i64>(0), "no_ebs": r.get::<_, Option<String>>(1), "disease": r.get::<_, Option<String>>(2),
            "kabkota": r.get::<_, Option<String>>(3), "province": r.get::<_, Option<String>>(4), "tgl_laporan": r.get::<_, Option<String>>(5),
            "created": r.get::<_, Option<String>>(6), "notif_days": r.get::<_, Option<i32>>(7), "status": r.get::<_, Option<String>>(8) })).collect();
        t717 = json!({ "notification": overall, "detection": null, "response": null, "missing_fields": missing_fields, "diseases": rows, "signals": signals,
            "thresholds": ecfg.pointer("/t717/thresholds").cloned().unwrap_or(Value::Null) });
    }

    let kpi_trend = json!({ "days": days.iter().map(|d| d.to_string()).collect::<Vec<_>>(), "bucket": if daily { "day" } else { "week" }, "until": latest.map(|d| d.to_string()), "period_start": d0.to_string(), "period_end": cap.to_string(),
        "ebs_latest": ebs_latest.map(|d| d.to_string()), "pe_latest": pe_latest.map(|d| d.to_string()), "ebs": trend_ebs, "pe": trend_pe });

    Ok(Json(json!({ "success": true, "data": {
        "weeks": week_json(&ws), "sources": { "ebs": show_ebs, "pe": show_pe }, "disease_not_found": dis_missing, "scope": f.scope,
        "kpi": { "ebs": kpi_ebs, "pe": kpi_pe }, "kpi_trend": kpi_trend, "t717": t717, "ebs_unmapped_alerts": ebs_unmapped,
        "diseases": diseases, "provinces": provinces,
    }})))
}

/// PR 016: GET /api/v1/analytics/latest — "Rilis data terkini" on Beranda: the latest report date per province and per
/// disease, per source (EBS / Kasus PE), plus the latest date overall. Counted PE statuses come from app_settings.
pub async fn latest(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let counted = strs(cfg(&c).await?.get("pe_count_statuses"));
    let base = format!("WITH x AS (
            SELECT 'ebs'::text s, e.province_id p, e.disease_id d, {EBS_DATE} dt FROM ebs_reports e WHERE {EBS_DATE} <= current_date
            UNION ALL
            SELECT 'pe', c.province_id, c.disease_id, {PE_DATE} FROM pe_cases c WHERE c.deleted_at IS NULL AND c.status = ANY($1) AND {PE_DATE} <= current_date)");
    let prov = c.query(&format!("{base} SELECT l.name, x.s, MAX(x.dt)::text FROM x JOIN master_locations l ON l.id = x.p GROUP BY 1, 2 ORDER BY MAX(x.dt) DESC, 1 LIMIT 8"), &[&counted]).await.map_err(internal)?;
    let dis = c.query(&format!("{base} SELECT d.name, d.code, x.s, MAX(x.dt)::text FROM x JOIN master_diseases d ON d.id = x.d WHERE d.is_active GROUP BY 1, 2, 3 ORDER BY MAX(x.dt) DESC, 1 LIMIT 8"), &[&counted]).await.map_err(internal)?;
    let tot = c.query_one(&format!("{base} SELECT MAX(dt) FILTER (WHERE s = 'ebs')::text, MAX(dt) FILTER (WHERE s = 'pe')::text FROM x"), &[&counted]).await.map_err(internal)?;
    let monitored: i64 = c.query_one("SELECT COUNT(*)::bigint FROM master_diseases WHERE is_active", &[]).await.map_err(internal)?.get(0);
    Ok(Json(json!({ "success": true, "data": {
        "ebs_latest": tot.get::<_, Option<String>>(0), "pe_latest": tot.get::<_, Option<String>>(1), "diseases_monitored": monitored,
        "provinces": prov.iter().map(|r| json!({ "name": r.get::<_, String>(0), "source": r.get::<_, String>(1), "last_date": r.get::<_, String>(2) })).collect::<Vec<_>>(),
        "diseases": dis.iter().map(|r| json!({ "name": r.get::<_, String>(0), "code": r.get::<_, String>(1), "source": r.get::<_, String>(2), "last_date": r.get::<_, String>(3) })).collect::<Vec<_>>(),
    }})))
}

/// PR 016: Beranda — one aggregated call (cached by the analytics/ prefix of the response cache).
/// "Minggu terakhir" = the 7 days ending at each source's own latest data date (sources lag differently).
/// EBS and PE figures are always returned separately; nothing is summed across sources.
pub async fn home(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let conf = cfg(&c).await?;
    let counted = strs(conf.get("pe_count_statuses"));
    let dead = conf.pointer("/outcome/dead").and_then(|v| v.as_str()).unwrap_or("Meninggal").to_string();
    let x = format!("WITH x AS (
            SELECT 'ebs'::text s, e.province_id p, e.disease_id d, {EBS_DATE} dt, COALESCE(e.jml_kasus,0)::bigint k, COALESCE(LEAST(e.jml_kematian, e.jml_kasus),0)::bigint m
              FROM ebs_reports e WHERE {EBS_DATE} <= current_date
            UNION ALL
            SELECT 'pe', c.province_id, c.disease_id, {PE_DATE}, 1::bigint, (c.outcome = $2)::int::bigint
              FROM pe_cases c WHERE c.deleted_at IS NULL AND c.status = ANY($1) AND {PE_DATE} <= current_date),
          lt AS (SELECT s, MAX(dt) mx FROM x GROUP BY s)");
    let p: [&(dyn tokio_postgres::types::ToSql + Sync); 2] = [&counted, &dead];
    // last-7-days snapshot per source
    let wk = c.query(&format!("{x} SELECT x.s, lt.mx::text, COUNT(*)::bigint, COALESCE(SUM(x.k),0)::bigint, COUNT(DISTINCT x.p)::bigint
        FROM x JOIN lt ON lt.s = x.s WHERE x.dt > lt.mx - 7 GROUP BY 1, 2"), &p).await.map_err(internal)?;
    let mut week = serde_json::Map::new();
    for r in &wk { week.insert(r.get::<_, String>(0), json!({ "until": r.get::<_, String>(1), "records": r.get::<_, i64>(2), "cases": r.get::<_, i64>(3), "provinces": r.get::<_, i64>(4) })); }
    let reviewed: i64 = c.query_one(&format!("{x} SELECT COUNT(DISTINCT x.p)::bigint FROM x JOIN lt ON lt.s = x.s WHERE x.dt > lt.mx - 7 AND x.p IS NOT NULL"), &p).await.map_err(internal)?.get(0);
    // provinces ranked by coverage (number of diseases, then records)
    let pr = c.query(&format!("{x} SELECT l.id, l.code, l.name, COUNT(DISTINCT x.d)::bigint,
            COALESCE(SUM(x.k) FILTER (WHERE x.s='ebs'),0)::bigint, COALESCE(SUM(x.m) FILTER (WHERE x.s='ebs'),0)::bigint, COUNT(*) FILTER (WHERE x.s='ebs')::bigint,
            COALESCE(SUM(x.k) FILTER (WHERE x.s='pe'),0)::bigint, COALESCE(SUM(x.m) FILTER (WHERE x.s='pe'),0)::bigint,
            MIN(x.dt)::text, MAX(x.dt)::text, COUNT(*)::bigint
        FROM x JOIN master_locations l ON l.id = x.p WHERE l.is_active GROUP BY 1, 2, 3 ORDER BY 4 DESC, 12 DESC, 3 LIMIT 6"), &p).await.map_err(internal)?;
    let ds = c.query(&format!("{x} SELECT d.code, d.name, d.category, COUNT(*) FILTER (WHERE x.s='ebs')::bigint, COUNT(*) FILTER (WHERE x.s='pe')::bigint
        FROM master_diseases d LEFT JOIN x ON x.d = d.id WHERE d.is_active GROUP BY 1, 2, 3 ORDER BY COUNT(x.d) DESC, 2 LIMIT 8"), &p).await.map_err(internal)?;
    let cnt = c.query_one(&format!("{x} SELECT (SELECT COUNT(*) FROM master_locations WHERE is_active)::bigint, (SELECT COUNT(*) FROM master_diseases WHERE is_active)::bigint,
            COUNT(DISTINCT x.p)::bigint, COUNT(DISTINCT x.d)::bigint, COUNT(*) FILTER (WHERE x.s='ebs')::bigint, COUNT(*) FILTER (WHERE x.s='pe')::bigint FROM x"), &p).await.map_err(internal)?;
    let indicators = conf.pointer("/indicators").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
    Ok(Json(json!({ "success": true, "data": {
        "week": week, "provinces_reviewed": reviewed,
        "counts": { "provinces_total": cnt.get::<_, i64>(0), "diseases_total": cnt.get::<_, i64>(1), "provinces_with_data": cnt.get::<_, i64>(2),
                    "diseases_with_data": cnt.get::<_, i64>(3), "ebs_records": cnt.get::<_, i64>(4), "pe_records": cnt.get::<_, i64>(5), "indicators": indicators },
        "top_provinces": pr.iter().map(|r| json!({ "id": r.get::<_, i32>(0), "code": r.get::<_, Option<String>>(1), "name": r.get::<_, String>(2), "diseases": r.get::<_, i64>(3),
            "ebs": { "cases": r.get::<_, i64>(4), "deaths": r.get::<_, i64>(5), "alerts": r.get::<_, i64>(6) }, "pe": { "cases": r.get::<_, i64>(7), "deaths": r.get::<_, i64>(8) },
            "first": r.get::<_, String>(9), "last": r.get::<_, String>(10) })).collect::<Vec<_>>(),
        "top_diseases": ds.iter().map(|r| json!({ "code": r.get::<_, String>(0), "name": r.get::<_, String>(1), "category": r.get::<_, Option<String>>(2),
            "ebs": r.get::<_, i64>(3), "pe": r.get::<_, i64>(4) })).collect::<Vec<_>>(),
    }})))
}
