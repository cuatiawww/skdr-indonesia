//! PR 018: GET /api/v1/signals/:source/:id — full detail of one signal for the "Lihat" modal.
//! source = "ebs" (id = id_ebs) or "pe" (id = pe_cases.id). Only stored fields are returned; dates that the source
//! does not carry are null and listed in `missing` (the UI shows "Data belum tersedia"), never estimated.
//! 7-1-7 targets (7 / 1 / 7 days) are the framework definition; colour thresholds come from dashboard_executive.t717.
use axum::{extract::{Path, Query, State}, http::StatusCode, Json};
use crate::dashboard::{current_mmwr, resolve, DashQuery};
use chrono::NaiveDate;
use serde_json::{json, Value};

use crate::{internal, ApiError, AppState};

fn not_found() -> ApiError { (StatusCode::NOT_FOUND, Json(json!({ "success": false, "error": "Sinyal tidak ditemukan" }))) }

fn stage(from: Option<NaiveDate>, to: Option<NaiveDate>, target: i64, from_label: &str, to_label: &str) -> Value {
    let days = match (from, to) { (Some(a), Some(b)) => Some((b - a).num_days()), _ => None };
    json!({ "from": from.map(|d| d.to_string()), "to": to.map(|d| d.to_string()), "from_label": from_label, "to_label": to_label,
            "days": days, "target": target, "on_time": days.map(|d| d <= target) })
}

pub async fn detail(State(s): State<AppState>, Path((source, id)): Path<(String, i64)>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let th = c.query_opt("SELECT value FROM app_settings WHERE key = 'dashboard_executive'", &[]).await.map_err(internal)?
        .and_then(|r| serde_json::from_str::<Value>(&r.get::<_, String>(0)).ok()).and_then(|v| v.pointer("/t717/thresholds").cloned()).unwrap_or(Value::Null);
    match source.as_str() {
        "ebs" => {
            let r = c.query_opt(
                "SELECT e.id_ebs, e.no_ebs, COALESCE(d.name, e.diagnosa), d.code, e.diagnosa, e.verifikasi, e.sts_rumor, e.klb,
                        e.propinsi, e.kota, e.distrik, e.kel_unit, e.unit, COALESCE(e.latitude, k.latitude), COALESCE(e.longitude, k.longitude), e.latitude IS NOT NULL,
                        e.tgl_laporan, e.create_date::date, to_char(e.create_date, 'YYYY-MM-DD HH24:MI'), to_char(e.update_date, 'YYYY-MM-DD HH24:MI'),
                        e.jml_kasus, e.jml_kematian, e.kronologi, e.tindakan, e.saran, to_char(e.synced_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI')
                 FROM ebs_reports e LEFT JOIN master_diseases d ON d.id = e.disease_id LEFT JOIN master_kabkota k ON k.id = e.kabkota_id
                 WHERE e.id_ebs = $1", &[&id]).await.map_err(internal)?.ok_or_else(not_found)?;
            let no_ebs: Option<String> = r.get(1);
            let pe = c.query("SELECT id, no_pe, form_key, status FROM pe_cases WHERE deleted_at IS NULL AND (ebs_link = $1 OR ebs_link = $2) ORDER BY id",
                &[&no_ebs.clone().unwrap_or_default(), &id.to_string()]).await.map_err(internal)?;
            let (tgl, created): (Option<NaiveDate>, Option<NaiveDate>) = (r.get(16), r.get(17));
            // PR 018: personal data in free text is masked here (config app_settings.privacy_masking); stored rows are untouched.
            let masker = crate::privacy::Masker::load(&c).await;
            let mut masked_n = 0usize;
            let mut mk = |i: usize| r.get::<_, Option<String>>(i).map(|t| { let (m, k) = masker.mask(&t); masked_n += k; m });
            let (kr, ti, sa) = (mk(22), mk(23), mk(24));
            let texts = json!({ "kronologi": kr, "tindakan": ti, "saran": sa });
            Ok(Json(json!({ "success": true, "data": {
                "source": "ebs", "id": r.get::<_, i64>(0), "ref": no_ebs, "disease": r.get::<_, Option<String>>(2), "disease_code": r.get::<_, Option<String>>(3),
                "diagnosa": r.get::<_, Option<String>>(4), "verifikasi": r.get::<_, Option<String>>(5), "status": r.get::<_, Option<String>>(6), "klb": r.get::<_, Option<String>>(7),
                "classification": Value::Null,
                "location": { "province": r.get::<_, Option<String>>(8), "kabkota": r.get::<_, Option<String>>(9), "kecamatan": r.get::<_, Option<String>>(10),
                              "kelurahan": r.get::<_, Option<String>>(11), "unit": r.get::<_, Option<String>>(12),
                              "lat": r.get::<_, Option<f64>>(13), "lng": r.get::<_, Option<f64>>(14), "exact": r.get::<_, bool>(15) },
                "timeline": [
                    { "key": "kemunculan", "label": "Kemunculan / rumor diketahui", "date": null },
                    { "key": "laporan", "label": "Tanggal laporan", "date": tgl.map(|d| d.to_string()) },
                    { "key": "notifikasi", "label": "Tanggal dibuat di SKDR (notifikasi)", "date": r.get::<_, Option<String>>(18) },
                    { "key": "respons", "label": "Tindakan respons awal", "date": null },
                    { "key": "pembaruan", "label": "Pembaruan terakhir", "date": r.get::<_, Option<String>>(19) },
                ],
                "t717": { "detection": stage(None, tgl, 7, "Rumor diketahui", "Tanggal laporan"),
                          "notification": stage(tgl, created, 1, "Tanggal laporan", "Tanggal dibuat"),
                          "response": stage(created, None, 7, "Tanggal dibuat", "Tindakan respons awal"), "thresholds": th },
                "missing": ["Tanggal Rumor Diketahui", "Tanggal tindakan respons awal"],
                "counts": { "cases": r.get::<_, Option<i32>>(20), "deaths": r.get::<_, Option<i32>>(21) },
                "texts": texts, "privacy": { "masked": masker.enabled, "replacements": masked_n },
                "reporter": r.get::<_, Option<String>>(12), "synced_at": r.get::<_, Option<String>>(25),
                "links": pe.iter().map(|p| json!({ "label": p.get::<_, String>(1), "href": format!("/pe/{}/{}?mode=lihat", p.get::<_, String>(2), p.get::<_, i64>(0)), "status": p.get::<_, String>(3) })).collect::<Vec<_>>(),
            }})))
        }
        "pe" => {
            let r = c.query_opt(
                "SELECT p.id, p.no_pe, p.form_key, d.name, d.code, p.status, COALESCE(p.classification_override, p.classification), p.classification_override IS NOT NULL,
                        l.name, k.name, p.data->>'kecamatan', COALESCE(p.data->>'unit_pelapor', p.data->>'puskesmas'), k.latitude, k.longitude,
                        p.tgl_rumor, p.onset_date, p.tgl_laporan, p.created_at::date, to_char(p.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'), p.tgl_pe,
                        to_char(p.submitted_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'), to_char(p.verified_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'),
                        to_char(p.finalized_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'), p.outcome, p.death_date::text, p.ebs_link, p.patient_name,
                        COALESCE(p.data->>'nama_petugas', p.data->>'nama_petugas_pe'), p.classification_basis, p.sex, p.age_years, cl.code,
                        df.schema->'classification'
                 FROM pe_cases p LEFT JOIN master_diseases d ON d.id = p.disease_id LEFT JOIN master_locations l ON l.id = p.province_id
                 LEFT JOIN master_kabkota k ON k.id = p.kabkota_id LEFT JOIN pe_clusters cl ON cl.id = p.cluster_id
                 LEFT JOIN pe_form_definitions df ON df.id = p.definition_id
                 WHERE p.id = $1 AND p.deleted_at IS NULL", &[&id]).await.map_err(internal)?.ok_or_else(not_found)?;
            let (rumor, onset, tgl, created, tpe): (Option<NaiveDate>, Option<NaiveDate>, Option<NaiveDate>, Option<NaiveDate>, Option<NaiveDate>) = (r.get(14), r.get(15), r.get(16), r.get(17), r.get(19));
            let emerg = onset.or(rumor);
            let cls: Option<String> = r.get(6);
            let schema_cls: Option<Value> = r.get(32);
            let cls_label = cls.as_ref().and_then(|code| schema_cls.as_ref().and_then(|v| {
                v.get("rules").and_then(|x| x.as_array()).into_iter().flatten().chain(v.get("fallback").into_iter())
                    .find(|x| x.get("code").and_then(|c| c.as_str()) == Some(code.as_str())).and_then(|x| x.get("label")).cloned()
            }));
            let initials = r.get::<_, Option<String>>(26).map(|n| n.split_whitespace().filter_map(|w| w.chars().next()).map(|ch| format!("{}.", ch.to_uppercase())).collect::<Vec<_>>().join(" "));
            let outcome: Option<String> = r.get(23);
            let mut missing = vec![];
            if emerg.is_none() { missing.push("Tanggal mulai sakit / tanggal rumor"); }
            if tgl.is_none() { missing.push("Tanggal laporan"); }
            if tpe.is_none() { missing.push("Tanggal PE"); }
            let form: String = r.get(2);
            Ok(Json(json!({ "success": true, "data": {
                "source": "pe", "id": r.get::<_, i64>(0), "ref": r.get::<_, String>(1), "form_key": form, "disease": r.get::<_, Option<String>>(3), "disease_code": r.get::<_, Option<String>>(4),
                "status": r.get::<_, String>(5), "classification": { "code": cls, "label": cls_label, "overridden": r.get::<_, bool>(7), "basis": r.get::<_, Option<String>>(28) },
                "location": { "province": r.get::<_, Option<String>>(8), "kabkota": r.get::<_, Option<String>>(9), "kecamatan": r.get::<_, Option<String>>(10),
                              "unit": r.get::<_, Option<String>>(11), "lat": r.get::<_, Option<f64>>(12), "lng": r.get::<_, Option<f64>>(13), "exact": false },
                "timeline": [
                    { "key": "kemunculan", "label": if onset.is_some() { "Mulai sakit (kemunculan)" } else { "Tanggal rumor" }, "date": emerg.map(|d| d.to_string()) },
                    { "key": "laporan", "label": "Tanggal laporan (deteksi)", "date": tgl.map(|d| d.to_string()) },
                    { "key": "notifikasi", "label": "Dientri di SKDR (notifikasi)", "date": r.get::<_, Option<String>>(18) },
                    { "key": "respons", "label": "Tanggal PE (respons)", "date": tpe.map(|d| d.to_string()) },
                    { "key": "dikirim", "label": "Dikirim", "date": r.get::<_, Option<String>>(20) },
                    { "key": "verifikasi", "label": "Diverifikasi", "date": r.get::<_, Option<String>>(21) },
                    { "key": "final", "label": "Final", "date": r.get::<_, Option<String>>(22) },
                ],
                "t717": { "detection": stage(emerg, tgl, 7, "Mulai sakit / rumor", "Tanggal laporan"),
                          "notification": stage(tgl, created, 1, "Tanggal laporan", "Dientri di SKDR"),
                          "response": stage(created, tpe, 7, "Dientri di SKDR", "Tanggal PE"), "thresholds": th },
                "missing": missing,
                "counts": { "cases": 1, "deaths": if outcome.as_deref() == Some("Meninggal") { 1 } else { 0 } },
                "outcome": outcome, "death_date": r.get::<_, Option<String>>(24), "patient": { "initials": initials, "sex": r.get::<_, Option<String>>(29), "age_years": r.get::<_, Option<i32>>(30) },
                "cluster": r.get::<_, Option<String>>(31), "ebs_link": r.get::<_, Option<String>>(25), "reporter": r.get::<_, Option<String>>(27),
                "links": [{ "label": "Buka formulir PE", "href": format!("/pe/{}/{}?mode=lihat", form, r.get::<_, i64>(0)) }],
            }})))
        }
        _ => Err((StatusCode::BAD_REQUEST, Json(json!({ "success": false, "error": "Sumber harus ebs atau pe" })))),
    }
}

#[derive(serde::Deserialize)]
pub struct DeathsQuery { pub form: String, pub classes: String }

/// PR 018: deaths among PE reports of the given form + classifications (the starred CFR rows: suspek/probabel/GHPR),
/// within the global filters. Feeds the "Lihat →" list on the CFR table; each row opens the signal modal.
pub async fn pe_deaths(State(s): State<AppState>, Query(q): Query<DeathsQuery>, Query(dq): Query<DashQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let f = resolve(&c, &dq).await?;
    let conf = c.query_opt("SELECT value FROM app_settings WHERE key = 'dashboard_executive'", &[]).await.map_err(internal)?
        .and_then(|r| serde_json::from_str::<Value>(&r.get::<_, String>(0)).ok()).unwrap_or(Value::Null);
    let dead = conf.pointer("/outcome/dead").and_then(|v| v.as_str()).unwrap_or("Meninggal").to_string();
    let counted: Vec<String> = conf.get("pe_count_statuses").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
    let classes: Vec<String> = q.classes.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect();
    let rows = c.query(
        "SELECT p.id, p.no_pe, COALESCE(p.data->>'unit_pelapor', p.data->>'puskesmas', p.data->>'nama_faskes'), k.name, l.name,
                COALESCE(p.tgl_laporan, p.created_at::date), p.status, COALESCE(p.classification_override, p.classification), p.death_date::text
         FROM pe_cases p LEFT JOIN master_kabkota k ON k.id = p.kabkota_id LEFT JOIN master_locations l ON l.id = p.province_id
         WHERE p.deleted_at IS NULL AND p.form_key = $1 AND COALESCE(p.classification_override, p.classification) = ANY($2) AND p.outcome = $3
           AND (cardinality($4::text[]) = 0 OR p.status = ANY($4))
           AND ($5::date IS NULL OR COALESCE(p.tgl_laporan, p.created_at::date) >= $5) AND ($6::date IS NULL OR COALESCE(p.tgl_laporan, p.created_at::date) <= $6)
           AND (cardinality($7::int[]) = 0 OR p.province_id = ANY($7)) AND (cardinality($8::int[]) = 0 OR p.kabkota_id = ANY($8)) AND skdr_unit_ok(p.data->>'unit_pelapor')
         ORDER BY 6 DESC, p.id DESC LIMIT 500",
        &[&q.form, &classes, &dead, &counted, &f.start, &f.end, &f.province, &f.kabkota]).await.map_err(internal)?;
    let data: Vec<Value> = rows.iter().map(|r| {
        let d: Option<NaiveDate> = r.get(5);
        let wk = d.map(|d| { let (y, w) = current_mmwr(d); format!("M{w}/{y}") });
        json!({ "id": r.get::<_, i64>(0), "no_pe": r.get::<_, String>(1), "unit": r.get::<_, Option<String>>(2), "kabkota": r.get::<_, Option<String>>(3),
                "province": r.get::<_, Option<String>>(4), "date": d.map(|x| x.to_string()), "epi_week": wk, "status": r.get::<_, String>(6),
                "classification": r.get::<_, Option<String>>(7), "death_date": r.get::<_, Option<String>>(8), "form_key": q.form })
    }).collect();
    Ok(Json(json!({ "success": true, "data": data })))
}
