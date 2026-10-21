//! PR 006: PE form API (shared core for all PE forms). Form schemas come from pe_form_definitions (versioned),
//! workflow from app_settings.pe_workflow. No login yet: the caller's role is read from the optional
//! `X-SKDR-Role` header (role hook) and only enforced when pe_workflow.enforce_roles = true.
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Map, Value};

use crate::pe_engine::{filled, today, Engine, Obj};
use crate::{bad_request, internal, ApiError, AppState};

fn err(code: StatusCode, msg: &str) -> ApiError {
    (code, Json(json!({ "success": false, "error": msg })))
}

async fn workflow(c: &deadpool_postgres::Object) -> Result<Value, ApiError> {
    let row = c.query_opt("SELECT value FROM app_settings WHERE key = 'pe_workflow'", &[]).await.map_err(internal)?;
    let v: Value = row.and_then(|r| serde_json::from_str(&r.get::<_, String>(0)).ok()).unwrap_or(json!({}));
    Ok(v)
}

fn offset(wf: &Value) -> i64 {
    wf.get("utc_offset_hours").and_then(|v| v.as_i64()).unwrap_or(7)
}

fn role(h: &HeaderMap, wf: &Value) -> String {
    h.get("x-skdr-role")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty() && s.len() < 40)
        .unwrap_or_else(|| wf.get("default_role").and_then(|v| v.as_str()).unwrap_or("petugas").to_string())
}

struct Def {
    id: i32,
    version: i32,
    disease_id: Option<i32>,
    schema: Value,
}

async fn def_latest(c: &deadpool_postgres::Object, form: &str) -> Result<Def, ApiError> {
    let r = c
        .query_opt(
            "SELECT id, version, disease_id, schema FROM pe_form_definitions WHERE form_key = $1 AND is_active ORDER BY version DESC LIMIT 1",
            &[&form],
        )
        .await
        .map_err(internal)?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Form PE tidak ditemukan"))?;
    Ok(Def { id: r.get(0), version: r.get(1), disease_id: r.get(2), schema: r.get(3) })
}

async fn def_by_id(c: &deadpool_postgres::Object, id: i32) -> Result<Def, ApiError> {
    let r = c
        .query_one("SELECT id, version, disease_id, schema FROM pe_form_definitions WHERE id = $1", &[&id])
        .await
        .map_err(internal)?;
    Ok(Def { id: r.get(0), version: r.get(1), disease_id: r.get(2), schema: r.get(3) })
}

pub async fn forms(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let rows = c
        .query(
            "SELECT DISTINCT ON (d.form_key) d.form_key, d.version, d.title, d.disease_id,
               (SELECT count(*) FROM pe_cases p WHERE p.form_key = d.form_key AND p.deleted_at IS NULL) AS n
             FROM pe_form_definitions d WHERE d.is_active ORDER BY d.form_key, d.version DESC",
            &[],
        )
        .await
        .map_err(internal)?;
    let data: Vec<Value> = rows
        .iter()
        .map(|r| json!({ "form_key": r.get::<_, String>(0), "version": r.get::<_, i32>(1), "title": r.get::<_, String>(2),
                          "disease_id": r.get::<_, Option<i32>>(3), "cases": r.get::<_, i64>(4) }))
        .collect();
    Ok(Json(json!({ "success": true, "data": data })))
}

pub async fn form(State(s): State<AppState>, Path(key): Path<String>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let d = def_latest(&c, &key).await?;
    let wf = workflow(&c).await?;
    Ok(Json(json!({ "success": true, "data": { "definition_id": d.id, "version": d.version, "disease_id": d.disease_id,
        "schema": d.schema, "workflow": wf, "today": today(offset(&wf)).format("%Y-%m-%d").to_string() } })))
}

// ---------------- cases ----------------

#[derive(Deserialize)]
pub struct CaseQuery {
    form: Option<String>,
    status: Option<String>,
    classification: Option<String>,
    search: Option<String>,
    province_id: Option<i32>,
    kabkota_id: Option<i32>,
    page: Option<i64>,
    per_page: Option<i64>,
}

/// Initials only in lists ("Budi Santoso" -> "B. S."), full data only on the detail endpoint.
fn mask(name: &str) -> String {
    name.split_whitespace().filter_map(|w| w.chars().next()).map(|c| format!("{}.", c.to_uppercase())).collect::<Vec<_>>().join(" ")
}

pub async fn cases(State(s): State<AppState>, Query(q): Query<CaseQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let per_page = q.per_page.unwrap_or(20).clamp(1, 200);
    let page = q.page.unwrap_or(1).max(1);
    let off = (page - 1) * per_page;
    let search = q.search.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).map(|s| format!("%{s}%"));
    let status = q.status.clone().filter(|s| !s.is_empty() && s != "all");
    let class = q.classification.clone().filter(|s| !s.is_empty() && s != "all");
    let rows = c
        .query(
            "SELECT p.id, p.no_pe, p.status, COALESCE(p.classification_override, p.classification), p.classification_override IS NOT NULL,
                    p.patient_name, p.tgl_laporan::text, p.tgl_pe::text, p.onset_date::text, l.name, k.name, p.outcome,
                    to_char(p.updated_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'), jsonb_array_length(p.errors), p.form_version,
                    cl.code, count(*) OVER (), p.form_key
             FROM pe_cases p
             LEFT JOIN master_locations l ON l.id = p.province_id
             LEFT JOIN master_kabkota k ON k.id = p.kabkota_id
             LEFT JOIN pe_clusters cl ON cl.id = p.cluster_id
             WHERE p.deleted_at IS NULL AND ($1::text IS NULL OR p.form_key = $1) AND ($2::text IS NULL OR p.status = $2)
               AND ($3::text IS NULL OR COALESCE(p.classification_override, p.classification, 'belum') = $3)
               AND ($4::text IS NULL OR p.no_pe ILIKE $4 OR p.patient_name ILIKE $4 OR k.name ILIKE $4)
               AND ($5::int IS NULL OR p.province_id = $5) AND ($6::int IS NULL OR p.kabkota_id = $6)
             ORDER BY p.updated_at DESC LIMIT $7 OFFSET $8",
            &[&q.form, &status, &class, &search, &q.province_id, &q.kabkota_id, &per_page, &off],
        )
        .await
        .map_err(internal)?;
    let total = rows.first().map(|r| r.get::<_, i64>(16)).unwrap_or(0);
    let data: Vec<Value> = rows
        .iter()
        .map(|r| json!({
            "id": r.get::<_, i64>(0), "no_pe": r.get::<_, String>(1), "status": r.get::<_, String>(2),
            "classification": r.get::<_, Option<String>>(3), "overridden": r.get::<_, bool>(4),
            "patient_initials": r.get::<_, Option<String>>(5).map(|n| mask(&n)),
            "tgl_laporan": r.get::<_, Option<String>>(6), "tgl_pe": r.get::<_, Option<String>>(7), "onset_date": r.get::<_, Option<String>>(8),
            "province": r.get::<_, Option<String>>(9), "kabkota": r.get::<_, Option<String>>(10), "outcome": r.get::<_, Option<String>>(11),
            "updated_at": r.get::<_, Option<String>>(12), "error_count": r.get::<_, i32>(13), "form_version": r.get::<_, i32>(14),
            "cluster_code": r.get::<_, Option<String>>(15), "form_key": r.get::<_, Option<String>>(17),
        }))
        .collect();
    // per-status counts for the list header
    let counts = c
        .query("SELECT status, count(*) FROM pe_cases WHERE deleted_at IS NULL AND ($1::text IS NULL OR form_key = $1) GROUP BY status", &[&q.form])
        .await
        .map_err(internal)?;
    let mut by_status = Map::new();
    for r in counts {
        by_status.insert(r.get::<_, String>(0), json!(r.get::<_, i64>(1)));
    }
    let pages = ((total + per_page - 1) / per_page).max(1);
    Ok(Json(json!({ "success": true, "data": data, "total": total, "page": page, "per_page": per_page, "total_pages": pages, "by_status": by_status })))
}

#[derive(Deserialize)]
pub struct CaseBody {
    form_key: Option<String>,
    data: Value,
}

fn col_values(schema: &Value, data: &Obj) -> Map<String, Value> {
    let mut m = Map::new();
    for (_, f, _) in crate::pe_engine::all_root_fields(schema) {
        if let (Some(col), Some(key)) = (f.get("col").and_then(|v| v.as_str()), f.get("key").and_then(|v| v.as_str())) {
            m.insert(col.to_string(), data.get(key).cloned().unwrap_or(Value::Null));
        }
    }
    m
}

fn col_str(m: &Map<String, Value>, k: &str) -> Option<String> {
    m.get(k).and_then(|v| match v {
        Value::String(s) if !s.trim().is_empty() => Some(s.trim().to_string()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    })
}
fn col_int(m: &Map<String, Value>, k: &str) -> Option<i32> {
    col_str(m, k).and_then(|s| s.parse::<f64>().ok()).map(|f| f as i32)
}
fn col_date(m: &Map<String, Value>, k: &str) -> Option<chrono::NaiveDate> {
    col_str(m, k).and_then(|s| chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok())
}

/// DB-backed checks the pure engine cannot do: kab/kota belongs to the chosen province, cluster/EBS exist.
async fn db_checks(c: &deadpool_postgres::Object, schema: &Value, form: &str, data: &Obj) -> Result<Vec<Value>, ApiError> {
    let mut out = vec![];
    for (step, f, _) in crate::pe_engine::all_root_fields(schema) {
        let key = f.get("key").and_then(|v| v.as_str()).unwrap_or("");
        let label = f.get("label").and_then(|v| v.as_str()).unwrap_or("");
        let v = data.get(key);
        if !filled(v) {
            continue;
        }
        let id = v.and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())));
        match f.get("type").and_then(|v| v.as_str()) {
            Some("kabkota") => {
                let prov = f.get("depends").and_then(|d| d.as_str()).and_then(|d| data.get(d))
                    .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).map(|x| x as i32);
                let ok = match id {
                    Some(id) => c.query_opt("SELECT 1 FROM master_kabkota WHERE id = $1 AND ($2::int IS NULL OR province_id = $2)", &[&(id as i32), &prov])
                        .await.map_err(internal)?.is_some(),
                    None => false,
                };
                if !ok { out.push(json!({"key": key, "step": step, "label": label, "msg": format!("{label} tidak sesuai dengan provinsi yang dipilih")})); }
            }
            Some("province") => {
                let ok = match id { Some(id) => c.query_opt("SELECT 1 FROM master_locations WHERE id = $1", &[&(id as i32)]).await.map_err(internal)?.is_some(), None => false };
                if !ok { out.push(json!({"key": key, "step": step, "label": label, "msg": format!("Pilihan {label} tidak valid")})); }
            }
            Some("cluster") => {
                let ok = match id { Some(id) => c.query_opt("SELECT 1 FROM pe_clusters WHERE id = $1 AND form_key = $2", &[&(id as i32), &form]).await.map_err(internal)?.is_some(), None => false };
                if !ok { out.push(json!({"key": key, "step": step, "label": label, "msg": "Klaster tidak ditemukan"})); }
            }
            Some("ebs") => {
                let t = v.and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                if t != "none" {
                    let ok = match t.parse::<i64>() { Ok(n) => c.query_opt("SELECT 1 FROM ebs_reports WHERE id_ebs = $1", &[&n]).await.map_err(internal)?.is_some(), Err(_) => false };
                    if !ok { out.push(json!({"key": key, "step": step, "label": label, "msg": "No. EBS tidak ditemukan pada data EBS tersinkron"})); }
                }
            }
            _ => {}
        }
    }
    Ok(out)
}

struct Evaluated {
    data: Obj,
    errors: Vec<Value>,
    warnings: Vec<Value>,
    class: Option<(String, String, String)>,
}

async fn evaluate(c: &deadpool_postgres::Object, def: &Def, form: &str, no_pe: &str, raw: &Value, off: i64) -> Result<Evaluated, ApiError> {
    let mut data = raw.as_object().cloned().ok_or_else(|| bad_request("Data form tidak valid"))?;
    let eng = Engine::new(&def.schema, today(off));
    eng.derive(&mut data, no_pe);
    let (errs, warns) = eng.validate(&data);
    let mut errors: Vec<Value> = errs.iter().map(|i| i.json()).collect();
    errors.extend(db_checks(c, &def.schema, form, &data).await?);
    let mut warnings: Vec<Value> = warns.iter().map(|i| i.json()).collect();
    let class = eng.classify(&data);
    // manual "Status Laporan" vs. computed classification
    if let (Some(cl), Some(cfg)) = (&class, def.schema.get("classification")) {
        if let Some(mf) = cfg.get("manual_field").and_then(|v| v.as_str()) {
            if let Some(manual) = data.get(mf).and_then(|v| v.as_str()) {
                let mapped = cfg.get("manual_map").and_then(|m| m.get(manual)).and_then(|v| v.as_str());
                if mapped.is_some() && mapped != Some(cl.0.as_str()) {
                    warnings.push(json!({"key": mf, "step": "p1", "label": "Status Laporan",
                        "msg": format!("Status Laporan \"{manual}\" berbeda dengan klasifikasi sistem \"{}\". Periksa kembali.", cl.1)}));
                }
            }
        }
    }
    Ok(Evaluated { data, errors, warnings, class })
}

async fn next_no_pe(c: &deadpool_postgres::Object, form: &str, prefix: &str, off: i64) -> Result<String, ApiError> {
    let year = chrono::Datelike::year(&today(off));
    let r = c
        .query_one(
            "INSERT INTO pe_counters (form_key, year, last_no) VALUES ($1, $2, 1)
             ON CONFLICT (form_key, year) DO UPDATE SET last_no = pe_counters.last_no + 1 RETURNING last_no",
            &[&form, &year],
        )
        .await
        .map_err(internal)?;
    Ok(format!("{prefix}-{year}-{:06}", r.get::<_, i32>(0)))
}

async fn persist(c: &deadpool_postgres::Object, id: i64, def: &Def, ev: &Evaluated) -> Result<(), ApiError> {
    let cols = col_values(&def.schema, &ev.data);
    let (code, basis) = ev.class.as_ref().map(|c| (Some(c.0.clone()), Some(c.2.clone()))).unwrap_or((None, None));
    let prev: Option<String> = c.query_one("SELECT classification FROM pe_cases WHERE id = $1", &[&id]).await.map_err(internal)?.get(0);
    c.execute(
        "UPDATE pe_cases SET data = $2, errors = $3, warnings = $4, classification = $5, classification_basis = $6,
            cluster_id = $7, ebs_link = $8, province_id = $9, kabkota_id = $10, status_laporan = $11, tgl_laporan = $12, tgl_pe = $13,
            tgl_rumor = $14, onset_date = $15, first_visit_date = $16, death_date = $17, outcome = $18, sex = $19, age_years = $20,
            patient_name = $21, nik = $22, updated_at = now()
         WHERE id = $1",
        &[&id, &Value::Object(ev.data.clone()), &Value::Array(ev.errors.clone()), &Value::Array(ev.warnings.clone()), &code, &basis,
          &col_int(&cols, "cluster_id"), &col_str(&cols, "ebs_link"), &col_int(&cols, "province_id"), &col_int(&cols, "kabkota_id"),
          &col_str(&cols, "status_laporan"), &col_date(&cols, "tgl_laporan"), &col_date(&cols, "tgl_pe"), &col_date(&cols, "tgl_rumor"),
          &col_date(&cols, "onset_date"), &col_date(&cols, "first_visit_date"), &col_date(&cols, "death_date"), &col_str(&cols, "outcome"),
          &col_str(&cols, "sex"), &col_int(&cols, "age_years"), &col_str(&cols, "patient_name"), &col_str(&cols, "nik")],
    )
    .await
    .map_err(internal)?;
    if prev != code {
        c.execute("INSERT INTO pe_case_events (case_id, event, from_value, to_value, actor_role) VALUES ($1, 'klasifikasi', $2, $3, 'sistem')",
            &[&id, &prev, &code]).await.map_err(internal)?;
    }
    Ok(())
}

pub async fn case_create(State(s): State<AppState>, headers: HeaderMap, Json(b): Json<CaseBody>) -> Result<(StatusCode, Json<Value>), ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let form = b.form_key.clone().ok_or_else(|| bad_request("form_key wajib diisi"))?;
    let def = def_latest(&c, &form).await?;
    let wf = workflow(&c).await?;
    let off = offset(&wf);
    let prefix = def.schema.get("no_pe_prefix").and_then(|v| v.as_str()).unwrap_or("PE").to_string();
    let no_pe = next_no_pe(&c, &form, &prefix, off).await?;
    let ev = evaluate(&c, &def, &form, &no_pe, &b.data, off).await?;
    let r = c
        .query_one(
            "INSERT INTO pe_cases (no_pe, form_key, definition_id, form_version, disease_id) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            &[&no_pe, &form, &def.id, &def.version, &def.disease_id],
        )
        .await
        .map_err(internal)?;
    let id: i64 = r.get(0);
    c.execute("INSERT INTO pe_case_events (case_id, event, to_value, actor_role) VALUES ($1, 'dibuat', 'draf', $2)", &[&id, &role(&headers, &wf)])
        .await.map_err(internal)?;
    persist(&c, id, &def, &ev).await?;
    Ok((StatusCode::CREATED, Json(json!({ "success": true, "data": case_json(&c, id).await? }))))
}

pub async fn case_update(State(s): State<AppState>, Path(id): Path<i64>, Json(b): Json<CaseBody>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let r = c.query_opt("SELECT definition_id, status, no_pe, form_key FROM pe_cases WHERE id = $1 AND deleted_at IS NULL", &[&id]).await.map_err(internal)?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "PE tidak ditemukan"))?;
    let wf = workflow(&c).await?;
    let status: String = r.get(1);
    let editable = wf.get("editable_status").and_then(|v| v.as_array()).map(|a| a.iter().any(|x| x.as_str() == Some(&status))).unwrap_or(status == "draf");
    if !editable {
        return Err(err(StatusCode::CONFLICT, "PE dengan status ini tidak dapat diubah. Minta verifikator mengembalikan PE untuk revisi."));
    }
    let def = def_by_id(&c, r.get(0)).await?;
    let ev = evaluate(&c, &def, &r.get::<_, String>(3), &r.get::<_, String>(2), &b.data, offset(&wf)).await?;
    persist(&c, id, &def, &ev).await?;
    Ok(Json(json!({ "success": true, "data": case_json(&c, id).await? })))
}

async fn case_json(c: &deadpool_postgres::Object, id: i64) -> Result<Value, ApiError> {
    let r = c
        .query_opt(
            "SELECT p.id, p.no_pe, p.form_key, p.form_version, p.definition_id, p.status, p.data, p.errors, p.warnings, p.classification,
                    p.classification_basis, p.classification_override, p.override_reason, p.cluster_id,
                    to_char(p.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'), to_char(p.updated_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS')
             FROM pe_cases p WHERE p.id = $1 AND p.deleted_at IS NULL",
            &[&id],
        )
        .await
        .map_err(internal)?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "PE tidak ditemukan"))?;
    let def = def_by_id(c, r.get(4)).await?;
    let eng = Engine::new(&def.schema, chrono::Utc::now().date_naive());
    let code: Option<String> = r.get(9);
    let ov: Option<String> = r.get(11);
    let events = c
        .query(
            "SELECT event, from_value, to_value, note, actor_role, to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI')
             FROM pe_case_events WHERE case_id = $1 ORDER BY id DESC LIMIT 100",
            &[&id],
        )
        .await
        .map_err(internal)?;
    Ok(json!({
        "id": r.get::<_, i64>(0), "no_pe": r.get::<_, String>(1), "form_key": r.get::<_, String>(2), "form_version": r.get::<_, i32>(3),
        "status": r.get::<_, String>(5), "data": r.get::<_, Value>(6), "errors": r.get::<_, Value>(7), "warnings": r.get::<_, Value>(8),
        "classification": code.clone(), "classification_label": code.as_deref().and_then(|c| eng.class_label(c)),
        "classification_basis": r.get::<_, Option<String>>(10),
        "classification_override": ov.clone(), "classification_override_label": ov.as_deref().and_then(|c| eng.class_label(c)),
        "override_reason": r.get::<_, Option<String>>(12), "cluster_id": r.get::<_, Option<i32>>(13),
        "created_at": r.get::<_, Option<String>>(14), "updated_at": r.get::<_, Option<String>>(15),
        "events": events.iter().map(|e| json!({ "event": e.get::<_, String>(0), "from": e.get::<_, Option<String>>(1), "to": e.get::<_, Option<String>>(2),
            "note": e.get::<_, Option<String>>(3), "role": e.get::<_, Option<String>>(4), "at": e.get::<_, Option<String>>(5) })).collect::<Vec<_>>(),
    }))
}

#[derive(Deserialize, Default)]
pub struct DeleteBody {
    reason: Option<String>,
}

/// PR 011: soft delete (sets deleted_at). Only Draf records; logged in pe_case_events (audit trail).
pub async fn case_delete(State(s): State<AppState>, headers: HeaderMap, Path(id): Path<i64>, body: Option<Json<DeleteBody>>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let wf = workflow(&c).await?;
    let r = c.query_opt("SELECT status, no_pe FROM pe_cases WHERE id = $1 AND deleted_at IS NULL", &[&id]).await.map_err(internal)?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "PE tidak ditemukan"))?;
    let status: String = r.get(0);
    if status != "draf" {
        return Err(err(StatusCode::CONFLICT, "Hanya PE berstatus Draf yang dapat dihapus."));
    }
    let actor = role(&headers, &wf);
    let deleted_by = headers.get("x-user").and_then(|v| v.to_str().ok()).map(|s| s.chars().take(120).collect::<String>()).unwrap_or_else(|| actor.clone());
    let n = c.execute("UPDATE pe_cases SET deleted_at = now(), deleted_by = $2 WHERE id = $1 AND deleted_at IS NULL AND status = 'draf'", &[&id, &deleted_by])
        .await.map_err(internal)?;
    if n == 0 {
        return Err(err(StatusCode::CONFLICT, "Hanya PE berstatus Draf yang dapat dihapus."));
    }
    let note = body.and_then(|b| b.0.reason).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    c.execute("INSERT INTO pe_case_events (case_id, event, from_value, to_value, note, actor_role) VALUES ($1, 'dihapus', $2, 'dihapus', $3, $4)",
        &[&id, &status, &note, &actor]).await.map_err(internal)?;
    Ok(Json(json!({ "success": true, "data": { "id": id, "no_pe": r.get::<_, String>(1), "deleted": true } })))
}

pub async fn case_get(State(s): State<AppState>, Path(id): Path<i64>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    Ok(Json(json!({ "success": true, "data": case_json(&c, id).await? })))
}

#[derive(Deserialize)]
pub struct StatusBody {
    to: String,
    note: Option<String>,
}

pub async fn case_status(State(s): State<AppState>, headers: HeaderMap, Path(id): Path<i64>, Json(b): Json<StatusBody>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let wf = workflow(&c).await?;
    let r = c.query_opt("SELECT status, jsonb_array_length(errors) FROM pe_cases WHERE id = $1 AND deleted_at IS NULL", &[&id]).await.map_err(internal)?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "PE tidak ditemukan"))?;
    let from: String = r.get(0);
    let n_err: i32 = r.get(1);
    let tr = wf.get("transitions").and_then(|v| v.as_array()).into_iter().flatten()
        .find(|t| t.get("from").and_then(|v| v.as_str()) == Some(&from) && t.get("to").and_then(|v| v.as_str()) == Some(b.to.as_str()))
        .cloned()
        .ok_or_else(|| err(StatusCode::CONFLICT, "Perubahan status ini tidak diizinkan"))?;
    let who = role(&headers, &wf);
    if wf.get("enforce_roles").and_then(|v| v.as_bool()).unwrap_or(false) {
        let allowed = tr.get("roles").and_then(|v| v.as_array()).map(|a| a.iter().any(|x| x.as_str() == Some(&who))).unwrap_or(true);
        if !allowed {
            return Err(err(StatusCode::FORBIDDEN, "Peran Anda tidak dapat melakukan perubahan status ini"));
        }
    }
    let note = b.note.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    if tr.get("note_required").and_then(|v| v.as_bool()).unwrap_or(false) && note.is_none() {
        return Err(bad_request("Catatan wajib diisi"));
    }
    if tr.get("validate").and_then(|v| v.as_bool()).unwrap_or(false) && n_err > 0 {
        return Err((StatusCode::UNPROCESSABLE_ENTITY, Json(json!({ "success": false,
            "error": format!("PE belum lengkap: masih ada {n_err} isian yang belum valid"), "data": case_json(&c, id).await? }))));
    }
    let stamp = match b.to.as_str() { "dikirim" => ", submitted_at = now()", "terverifikasi" => ", verified_at = now()", "final" => ", finalized_at = now()", _ => "" };
    c.execute(&format!("UPDATE pe_cases SET status = $2, updated_at = now(){stamp} WHERE id = $1"), &[&id, &b.to]).await.map_err(internal)?;
    c.execute("INSERT INTO pe_case_events (case_id, event, from_value, to_value, note, actor_role) VALUES ($1, 'status', $2, $3, $4, $5)",
        &[&id, &from, &b.to, &note, &who]).await.map_err(internal)?;
    Ok(Json(json!({ "success": true, "data": case_json(&c, id).await? })))
}

#[derive(Deserialize)]
pub struct OverrideBody {
    code: Option<String>,
    reason: Option<String>,
}

pub async fn case_classification(State(s): State<AppState>, headers: HeaderMap, Path(id): Path<i64>, Json(b): Json<OverrideBody>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let wf = workflow(&c).await?;
    let r = c.query_opt("SELECT definition_id, status, classification_override FROM pe_cases WHERE id = $1 AND deleted_at IS NULL", &[&id]).await.map_err(internal)?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "PE tidak ditemukan"))?;
    if r.get::<_, String>(1) == "final" {
        return Err(err(StatusCode::CONFLICT, "PE final tidak dapat diubah"));
    }
    let def = def_by_id(&c, r.get(0)).await?;
    let eng = Engine::new(&def.schema, chrono::Utc::now().date_naive());
    let code = b.code.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let reason = b.reason.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    if let Some(cd) = &code {
        if eng.class_label(cd).is_none() {
            return Err(bad_request("Klasifikasi tidak valid"));
        }
        if reason.is_none() {
            return Err(bad_request("Alasan koreksi klasifikasi wajib diisi"));
        }
    }
    let prev: Option<String> = r.get(2);
    c.execute("UPDATE pe_cases SET classification_override = $2, override_reason = $3, updated_at = now() WHERE id = $1", &[&id, &code, &reason])
        .await.map_err(internal)?;
    c.execute("INSERT INTO pe_case_events (case_id, event, from_value, to_value, note, actor_role) VALUES ($1, 'koreksi_klasifikasi', $2, $3, $4, $5)",
        &[&id, &prev, &code, &reason, &role(&headers, &wf)]).await.map_err(internal)?;
    Ok(Json(json!({ "success": true, "data": case_json(&c, id).await? })))
}

// ---------------- clusters ----------------

#[derive(Deserialize)]
pub struct ClusterQuery {
    form: Option<String>,
    status: Option<String>,
}

const CLUSTER_SQL: &str = "SELECT cl.id, cl.code, cl.form_key, cl.name, cl.province_id, l.name, cl.kabkota_id, k.name, cl.kecamatan,
    cl.tgl_rumor::text, cl.lokasi, cl.status, cl.monitoring, (SELECT count(*) FROM pe_cases p WHERE p.cluster_id = cl.id AND p.deleted_at IS NULL),
    to_char(cl.updated_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI')
    FROM pe_clusters cl LEFT JOIN master_locations l ON l.id = cl.province_id LEFT JOIN master_kabkota k ON k.id = cl.kabkota_id";

fn cluster_json(r: &tokio_postgres::Row) -> Value {
    json!({ "id": r.get::<_, i32>(0), "code": r.get::<_, String>(1), "form_key": r.get::<_, String>(2), "name": r.get::<_, String>(3),
        "province_id": r.get::<_, Option<i32>>(4), "province": r.get::<_, Option<String>>(5), "kabkota_id": r.get::<_, Option<i32>>(6),
        "kabkota": r.get::<_, Option<String>>(7), "kecamatan": r.get::<_, Option<String>>(8), "tgl_rumor": r.get::<_, Option<String>>(9),
        "lokasi": r.get::<_, Option<String>>(10), "status": r.get::<_, String>(11), "monitoring": r.get::<_, Value>(12),
        "cases": r.get::<_, i64>(13), "updated_at": r.get::<_, Option<String>>(14) })
}

pub async fn clusters(State(s): State<AppState>, Query(q): Query<ClusterQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let status = q.status.filter(|s| !s.is_empty() && s != "all");
    let rows = c
        .query(&format!("{CLUSTER_SQL} WHERE ($1::text IS NULL OR cl.form_key = $1) AND ($2::text IS NULL OR cl.status = $2) ORDER BY cl.id DESC LIMIT 500"),
            &[&q.form, &status])
        .await
        .map_err(internal)?;
    Ok(Json(json!({ "success": true, "data": rows.iter().map(cluster_json).collect::<Vec<_>>() })))
}

#[derive(Deserialize)]
pub struct ClusterBody {
    form_key: Option<String>,
    name: Option<String>,
    province_id: Option<i32>,
    kabkota_id: Option<i32>,
    kecamatan: Option<String>,
    tgl_rumor: Option<String>,
    lokasi: Option<String>,
    status: Option<String>,
    monitoring: Option<Value>,
}

fn trimmed(s: &Option<String>) -> Option<String> {
    s.as_ref().map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

async fn check_cluster(c: &deadpool_postgres::Object, def: &Def, b: &ClusterBody, off: i64) -> Result<(String, Option<chrono::NaiveDate>, Value), ApiError> {
    let name = trimmed(&b.name).ok_or_else(|| bad_request("Nama klaster wajib diisi"))?;
    let tgl = match trimmed(&b.tgl_rumor) {
        Some(t) => Some(chrono::NaiveDate::parse_from_str(&t, "%Y-%m-%d").map_err(|_| bad_request("Tanggal rumor tidak valid"))?),
        None => None,
    };
    if tgl.map(|d| d > today(off)).unwrap_or(false) {
        return Err(bad_request("Tanggal rumor tidak boleh setelah hari ini"));
    }
    if let Some(k) = b.kabkota_id {
        if c.query_opt("SELECT 1 FROM master_kabkota WHERE id = $1 AND ($2::int IS NULL OR province_id = $2)", &[&k, &b.province_id])
            .await.map_err(internal)?.is_none() {
            return Err(bad_request("Kab/Kota tidak sesuai dengan provinsi yang dipilih"));
        }
    }
    let mon = b.monitoring.clone().unwrap_or(json!({}));
    let obj = mon.as_object().cloned().ok_or_else(|| bad_request("Data pemantauan tidak valid"))?;
    let any_filled = obj.values().any(|v| filled(Some(v)));
    if any_filled {
        let fields: Vec<Value> = def.schema.get("cluster_fields").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let eng = Engine::new(&def.schema, today(off));
        let errs = eng.validate_fields(&fields, &obj);
        if !errs.is_empty() {
            return Err((StatusCode::UNPROCESSABLE_ENTITY, Json(json!({ "success": false, "error": "Data pemantauan belum valid",
                "errors": errs.iter().map(|i| i.json()).collect::<Vec<_>>() }))));
        }
    }
    Ok((name, tgl, mon))
}

pub async fn cluster_create(State(s): State<AppState>, Json(b): Json<ClusterBody>) -> Result<(StatusCode, Json<Value>), ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let form = trimmed(&b.form_key).ok_or_else(|| bad_request("form_key wajib diisi"))?;
    let def = def_latest(&c, &form).await?;
    let off = offset(&workflow(&c).await?);
    let (name, tgl, mon) = check_cluster(&c, &def, &b, off).await?;
    let prefix = def.schema.get("no_pe_prefix").and_then(|v| v.as_str()).unwrap_or("PE").replacen("PE-", "KL-", 1);
    let code = next_no_pe(&c, &format!("{form}#klaster"), &prefix, off).await?;
    let r = c
        .query_one(
            "INSERT INTO pe_clusters (code, form_key, disease_id, name, province_id, kabkota_id, kecamatan, tgl_rumor, lokasi, monitoring)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
            &[&code, &form, &def.disease_id, &name, &b.province_id, &b.kabkota_id, &trimmed(&b.kecamatan), &tgl, &trimmed(&b.lokasi), &mon],
        )
        .await
        .map_err(internal)?;
    let id: i32 = r.get(0);
    let row = c.query_one(&format!("{CLUSTER_SQL} WHERE cl.id = $1"), &[&id]).await.map_err(internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "success": true, "data": cluster_json(&row) }))))
}

pub async fn cluster_update(State(s): State<AppState>, Path(id): Path<i32>, Json(b): Json<ClusterBody>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let r = c.query_opt("SELECT form_key FROM pe_clusters WHERE id = $1", &[&id]).await.map_err(internal)?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Klaster tidak ditemukan"))?;
    let form: String = r.get(0);
    let def = def_latest(&c, &form).await?;
    let off = offset(&workflow(&c).await?);
    let (name, tgl, mon) = check_cluster(&c, &def, &b, off).await?;
    let status = trimmed(&b.status).unwrap_or_else(|| "aktif".into());
    if status != "aktif" && status != "selesai" {
        return Err(bad_request("Status klaster tidak valid"));
    }
    c.execute(
        "UPDATE pe_clusters SET name=$2, province_id=$3, kabkota_id=$4, kecamatan=$5, tgl_rumor=$6, lokasi=$7, status=$8, monitoring=$9, updated_at=now() WHERE id=$1",
        &[&id, &name, &b.province_id, &b.kabkota_id, &trimmed(&b.kecamatan), &tgl, &trimmed(&b.lokasi), &status, &mon],
    )
    .await
    .map_err(internal)?;
    let row = c.query_one(&format!("{CLUSTER_SQL} WHERE cl.id = $1"), &[&id]).await.map_err(internal)?;
    Ok(Json(json!({ "success": true, "data": cluster_json(&row) })))
}

// ---------------- EBS lookup for "Link No. EBS" ----------------

#[derive(Deserialize)]
pub struct EbsQuery {
    q: Option<String>,
    kabkota_id: Option<i32>,
    disease_id: Option<i32>,
}

pub async fn ebs_search(State(s): State<AppState>, Query(q): Query<EbsQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let term = q.q.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).map(|s| format!("%{s}%"));
    let rows = c
        .query(
            "SELECT id_ebs, no_ebs, tgl_laporan::text, diagnosa, kota, jml_kasus FROM ebs_reports
             WHERE ($1::text IS NULL OR id_ebs::text LIKE $1 OR no_ebs ILIKE $1)
               AND ($2::int IS NULL OR kabkota_id = $2) AND ($3::int IS NULL OR disease_id = $3)
             ORDER BY tgl_laporan DESC NULLS LAST LIMIT 20",
            &[&term, &q.kabkota_id, &q.disease_id],
        )
        .await
        .map_err(internal)?;
    Ok(Json(json!({ "success": true, "data": rows.iter().map(|r| json!({ "id_ebs": r.get::<_, i64>(0), "no_ebs": r.get::<_, Option<String>>(1),
        "tgl_laporan": r.get::<_, Option<String>>(2), "diagnosa": r.get::<_, Option<String>>(3), "kota": r.get::<_, Option<String>>(4),
        "jml_kasus": r.get::<_, i32>(5) })).collect::<Vec<_>>() })))
}
