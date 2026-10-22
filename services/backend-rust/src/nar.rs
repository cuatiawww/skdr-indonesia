//! PR 018: NAR–SKDR section (Spesifikasi Dashboard Executive items 76–81).
//! Only item 76 (% NIK terisi, excluding GHPR) and the "tanpa NIK" segment of item 80 can be computed from SKDR data;
//! items that need the NAR (lab) API are returned as `blocked` with what integration is required — never estimated.
//! Excluded classifications and the NIK validity pattern come from app_settings.dashboard_executive.nar (migration 030).
use axum::{extract::{Query, State}, Json};
use serde_json::{json, Value};

use crate::analytics::{cfg, rate, strs};
use crate::dashboard::{resolve, DashQuery};
use crate::{internal, ApiError, AppState};

const PE_DATE: &str = "COALESCE(c.tgl_laporan, c.created_at::date)";

pub async fn summary(State(s): State<AppState>, Query(q): Query<DashQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let f = resolve(&c, &q).await?;
    let conf = cfg(&c).await?;
    let counted = strs(conf.get("pe_count_statuses"));
    let nar = conf.get("nar").cloned().unwrap_or(Value::Null);
    let excl = strs(nar.get("exclude_classes"));
    let pattern = nar.get("nik_valid_pattern").and_then(|v| v.as_str()).unwrap_or("^[0-9]{16}$").to_string();
    let w0 = f.start.unwrap_or(chrono::NaiveDate::from_ymd_opt(1900, 1, 1).unwrap());
    let w1 = f.end.unwrap_or(chrono::NaiveDate::from_ymd_opt(2999, 12, 31).unwrap());
    let rows = c.query(&format!(
        "SELECT d.code, d.name, COUNT(*)::bigint,
                COUNT(*) FILTER (WHERE NULLIF(trim(c.nik), '') IS NOT NULL)::bigint,
                COUNT(*) FILTER (WHERE trim(c.nik) ~ $8)::bigint
         FROM pe_cases c JOIN master_diseases d ON d.id = c.disease_id
         WHERE c.deleted_at IS NULL AND c.status = ANY($6) AND {PE_DATE} BETWEEN $1 AND $2
           AND (cardinality($3::int[]) = 0 OR c.province_id = ANY($3)) AND (cardinality($4::int[]) = 0 OR c.kabkota_id = ANY($4)) AND skdr_unit_ok(c.data->>'unit_pelapor')
           AND (cardinality($5::int[]) = 0 OR c.disease_id = ANY($5))
           AND NOT (COALESCE(c.classification_override, c.classification, '') = ANY($7))
         GROUP BY 1, 2 ORDER BY 2"),
        &[&w0, &w1, &f.province, &f.kabkota, &f.disease_ids, &counted, &excl, &pattern]).await.map_err(internal)?;
    let (mut n, mut k, mut v) = (0i64, 0i64, 0i64);
    let per: Vec<Value> = rows.iter().map(|r| {
        let (t, fl, va): (i64, i64, i64) = (r.get(2), r.get(3), r.get(4));
        n += t; k += fl; v += va;
        json!({ "code": r.get::<_, String>(0), "name": r.get::<_, String>(1), "total": t, "with_nik": fl, "valid_nik": va, "without_nik": t - fl,
                "pct": rate(fl, t, &conf),
                // item 80 segments: only "tanpa NIK" is known without NAR
                "segments": { "tanpa_nik": t - fl, "match_nar": null, "nik_tidak_cocok": null } })
    }).collect();
    let needs = "Integrasi API NAR (data hasil laboratorium per NIK) dan kesepakatan pencocokan NIK SKDR–NAR";
    Ok(Json(json!({ "success": true, "data": {
        "filters": { "scope": f.scope, "disease": f.disease_label(), "start_date": f.start.map(|d| d.to_string()), "end_date": f.end.map(|d| d.to_string()) },
        "excluded_classes": excl,
        "nik": { "total": n, "with_nik": k, "valid_nik": v, "pct": rate(k, n, &conf), "pct_valid": rate(v, n, &conf), "per_disease": per },
        "items": [
            { "no": 76, "title": "% kasus SKDR dengan NIK terisi (tanpa GHPR)", "status": "implemented" },
            { "no": 77, "title": "% kasus cocok di NAR (berdasarkan NIK)", "status": "blocked", "needs": needs },
            { "no": 78, "title": "Status SKDR perlu diperbarui (hasil lab NAR berbeda)", "status": "blocked", "needs": needs },
            { "no": 79, "title": "Positif di NAR tanpa laporan SKDR", "status": "blocked", "needs": needs },
            { "no": 80, "title": "Batang rekonsiliasi per penyakit (cocok / tidak cocok / tanpa NIK)", "status": "partial", "needs": needs },
            { "no": 81, "title": "Tabel perlu tindak lanjut", "status": "blocked", "needs": needs },
        ],
    }})))
}
