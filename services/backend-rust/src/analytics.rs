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

async fn cfg(c: &deadpool_postgres::Object) -> Result<Value, ApiError> {
    Ok(c.query_opt("SELECT value FROM app_settings WHERE key = 'dashboard_executive'", &[]).await.map_err(internal)?
        .and_then(|r| serde_json::from_str(&r.get::<_, String>(0)).ok()).unwrap_or(Value::Null))
}
fn strs(v: Option<&Value>) -> Vec<String> {
    v.and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|s| s.as_str().map(String::from)).collect()).unwrap_or_default()
}
fn rate(k: i64, n: i64, cfg: &Value) -> Value {
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
    let dis: Option<i32> = match &f.disease {
        Some(d) => c.query_opt("SELECT id FROM master_diseases WHERE code = $1 OR name = $1", &[d]).await.map_err(internal)?.map(|r| r.get(0)),
        None => None,
    };
    let dis_missing = f.disease.is_some() && dis.is_none();
    let mut series: HashMap<(String, i32), (String, String, Vec<i64>, Vec<i64>)> = HashMap::new();
    let mut heat: HashMap<(String, i32), Vec<i64>> = HashMap::new(); // (metric, province) -> per week
    let mut unmapped = 0i64;
    let n = ws.len();
    if show_ebs && !dis_missing {
        let sql = format!(
            "SELECT {w} wk, e.disease_id, d.code, d.name, e.province_id, COUNT(*)::bigint, COALESCE(SUM(e.jml_kasus),0)::bigint
             FROM ebs_reports e LEFT JOIN master_diseases d ON d.id = e.disease_id
             WHERE {dt} BETWEEN $1 AND $2 AND ($3::int IS NULL OR e.province_id = $3) AND ($4::int IS NULL OR e.kabkota_id = $4)
               AND ($5::int IS NULL OR e.disease_id = $5)
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
               AND ($3::int IS NULL OR c.province_id = $3) AND ($4::int IS NULL OR c.kabkota_id = $4) AND ($5::int IS NULL OR c.disease_id = $5)
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
    let provs = c.query("SELECT id, code, name FROM master_locations WHERE is_active AND ($1::int IS NULL OR id = $1) ORDER BY code", &[&f.province]).await.map_err(internal)?;
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
    json!({ "id": r.get::<_, i32>(0), "code": r.get::<_, String>(1), "name": r.get::<_, String>(2), "english_name": r.get::<_, Option<String>>(3),
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
        AND {EBS_DATE} BETWEEN $3 AND $4 AND ($5::int IS NULL OR e.province_id = $5) AND ($6::int IS NULL OR e.kabkota_id = $6)");
    let pe_where = format!("c.disease_id = $1 AND c.deleted_at IS NULL AND c.status = ANY($2)
        AND {PE_DATE} BETWEEN $3 AND $4 AND ($5::int IS NULL OR c.province_id = $5) AND ($6::int IS NULL OR c.kabkota_id = $6)");
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
    let by_kab = f.province.is_some();
    let (rid_e, rid_p) = if by_kab { ("e.kabkota_id", "c.kabkota_id") } else { ("e.province_id", "c.province_id") };
    let reg_tbl = if by_kab { "SELECT id, code, name FROM master_kabkota WHERE is_active AND province_id = $1 ORDER BY code" } else { "SELECT id, code, name FROM master_locations WHERE is_active AND $1::int IS NULL ORDER BY code" };
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
        latest_ebs = c.query(&format!("SELECT e.no_ebs, {EBS_DATE}::text, e.kota, e.propinsi, e.sts_rumor, e.jml_kasus, e.jml_kematian, COALESCE(NULLIF(trim(e.verifikasi), ''), e.diagnosa)
              FROM ebs_reports e WHERE {ebs_where} ORDER BY {EBS_DATE} DESC NULLS LAST, e.id_ebs DESC LIMIT 10"), &ep).await.map_err(internal)?
            .iter().map(|r| json!({ "no_ebs": r.get::<_, Option<String>>(0), "date": r.get::<_, Option<String>>(1), "kabkota": r.get::<_, Option<String>>(2),
                "province": r.get::<_, Option<String>>(3), "status": r.get::<_, Option<String>>(4), "cases": r.get::<_, Option<i32>>(5), "deaths": r.get::<_, Option<i32>>(6), "diagnosa": r.get::<_, Option<String>>(7) })).collect();
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
