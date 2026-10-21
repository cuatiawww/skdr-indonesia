//! PR 004: Master Data CRUD (provinsi, kabupaten/kota, penyakit). Soft delete only: rows are
//! switched active/inactive via PATCH .../status, never removed. Error texts in Bahasa Indonesia.
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio_postgres::error::SqlState;

use crate::{bad_request, internal, ApiError, AppState};

fn err(code: StatusCode, msg: &str) -> ApiError {
    (code, Json(json!({ "success": false, "error": msg })))
}

fn db_err(e: tokio_postgres::Error, dup_msg: &str) -> ApiError {
    match e.code() {
        Some(c) if *c == SqlState::UNIQUE_VIOLATION => err(StatusCode::CONFLICT, dup_msg),
        Some(c) if *c == SqlState::FOREIGN_KEY_VIOLATION => bad_request("Data rujukan tidak ditemukan"),
        Some(c) if *c == SqlState::CHECK_VIOLATION => bad_request("Nilai tidak valid"),
        _ => internal(e),
    }
}

#[derive(Deserialize)]
pub struct ListQuery {
    search: Option<String>,
    status: Option<String>,
    province_id: Option<i32>,
    kind: Option<String>,
    page: Option<i64>,
    per_page: Option<i64>,
}

struct Paging {
    search: Option<String>,
    status: Option<bool>,
    page: i64,
    per_page: i64,
}

fn paging(q: &ListQuery) -> Paging {
    let per_page = q.per_page.unwrap_or(20).clamp(1, 600);
    Paging {
        search: q.search.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).map(|s| format!("%{s}%")),
        status: match q.status.as_deref() {
            Some("active") => Some(true),
            Some("inactive") => Some(false),
            _ => None,
        },
        page: q.page.unwrap_or(1).max(1),
        per_page,
    }
}

fn list_json(data: Vec<Value>, total: i64, p: &Paging) -> Json<Value> {
    let pages = ((total + p.per_page - 1) / p.per_page).max(1);
    Json(json!({ "success": true, "data": data, "total": total, "page": p.page, "per_page": p.per_page, "total_pages": pages }))
}

fn req(s: &Option<String>, label: &str) -> Result<String, ApiError> {
    match s.as_ref().map(|v| v.trim()).filter(|v| !v.is_empty()) {
        Some(v) => Ok(v.to_string()),
        None => Err(bad_request(&format!("{label} wajib diisi"))),
    }
}

fn opt(s: &Option<String>) -> Option<String> {
    s.as_ref().map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

fn coords(lat: Option<f64>, lng: Option<f64>, required: bool) -> Result<(), ApiError> {
    if required && (lat.is_none() || lng.is_none()) {
        return Err(bad_request("Lintang dan bujur wajib diisi"));
    }
    if lat.is_some() != lng.is_some() {
        return Err(bad_request("Isi lintang dan bujur sekaligus, atau kosongkan keduanya"));
    }
    // Indonesia bounding box (approx. 6°N–11°S, 95°E–141°E) with margin.
    if lat.map(|v| !(-12.0..=7.0).contains(&v)).unwrap_or(false) || lng.map(|v| !(94.0..=142.0).contains(&v)).unwrap_or(false) {
        return Err(bad_request("Koordinat harus berada di wilayah Indonesia (lintang -12..7, bujur 94..142)"));
    }
    Ok(())
}

fn digits(s: &str, n: usize) -> bool {
    s.len() == n && s.chars().all(|c| c.is_ascii_digit())
}

#[derive(Deserialize)]
pub struct StatusBody {
    is_active: bool,
}

fn changed(n: u64, id: i32) -> Result<Json<Value>, ApiError> {
    if n == 0 {
        return Err(err(StatusCode::NOT_FOUND, "Data tidak ditemukan"));
    }
    Ok(Json(json!({ "success": true, "id": id })))
}

// ---------------- Provinsi ----------------

const PROV_SQL: &str = "SELECT p.id, p.code, p.name, p.latitude, p.longitude, p.is_active,
    (SELECT count(*) FROM master_kabkota k WHERE k.province_id = p.id) AS kab_count, count(*) OVER () AS total
    FROM master_locations p
    WHERE ($1::text IS NULL OR p.name ILIKE $1 OR p.code ILIKE $1) AND ($2::bool IS NULL OR p.is_active = $2)";

pub async fn provinces_list(State(s): State<AppState>, Query(q): Query<ListQuery>) -> Result<Json<Value>, ApiError> {
    let p = paging(&q);
    let c = s.pool.get().await.map_err(internal)?;
    let off = (p.page - 1) * p.per_page;
    let rows = c
        .query(&format!("{PROV_SQL} ORDER BY p.code LIMIT $3 OFFSET $4"), &[&p.search, &p.status, &p.per_page, &off])
        .await
        .map_err(internal)?;
    let total = rows.first().map(|r| r.get::<_, i64>(7)).unwrap_or(0);
    let data = rows
        .iter()
        .map(|r| json!({
            "id": r.get::<_, i32>(0), "code": r.get::<_, String>(1), "name": r.get::<_, String>(2),
            "latitude": r.get::<_, Option<f64>>(3), "longitude": r.get::<_, Option<f64>>(4),
            "is_active": r.get::<_, bool>(5), "kabkota_count": r.get::<_, i64>(6),
        }))
        .collect();
    Ok(list_json(data, total, &p))
}

#[derive(Deserialize)]
pub struct ProvinceBody {
    code: Option<String>,
    name: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    is_active: Option<bool>,
}

fn check_province(b: &ProvinceBody) -> Result<(String, String), ApiError> {
    let code = req(&b.code, "Kode provinsi")?;
    if !digits(&code, 2) {
        return Err(bad_request("Kode provinsi harus 2 digit angka (contoh: 31)"));
    }
    let name = req(&b.name, "Nama provinsi")?;
    coords(b.latitude, b.longitude, true)?;
    Ok((code, name))
}

const PROV_DUP: &str = "Kode provinsi sudah digunakan";

pub async fn province_create(State(s): State<AppState>, Json(b): Json<ProvinceBody>) -> Result<(StatusCode, Json<Value>), ApiError> {
    let (code, name) = check_province(&b)?;
    let c = s.pool.get().await.map_err(internal)?;
    let r = c
        .query_one(
            "INSERT INTO master_locations (code, name, level, latitude, longitude, is_active) VALUES ($1, $2, 'province', $3, $4, $5) RETURNING id",
            &[&code, &name, &b.latitude, &b.longitude, &b.is_active.unwrap_or(true)],
        )
        .await
        .map_err(|e| db_err(e, PROV_DUP))?;
    Ok((StatusCode::CREATED, Json(json!({ "success": true, "id": r.get::<_, i32>(0) }))))
}

pub async fn province_update(State(s): State<AppState>, Path(id): Path<i32>, Json(b): Json<ProvinceBody>) -> Result<Json<Value>, ApiError> {
    let (code, name) = check_province(&b)?;
    let c = s.pool.get().await.map_err(internal)?;
    let n = c
        .execute(
            "UPDATE master_locations SET code = $2, name = $3, latitude = $4, longitude = $5, is_active = COALESCE($6, is_active), updated_at = now() WHERE id = $1",
            &[&id, &code, &name, &b.latitude, &b.longitude, &b.is_active],
        )
        .await
        .map_err(|e| db_err(e, PROV_DUP))?;
    changed(n, id)
}

pub async fn province_status(State(s): State<AppState>, Path(id): Path<i32>, Json(b): Json<StatusBody>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let n = c
        .execute("UPDATE master_locations SET is_active = $2, updated_at = now() WHERE id = $1", &[&id, &b.is_active])
        .await
        .map_err(internal)?;
    changed(n, id)
}

// ---------------- Kabupaten/Kota ----------------

const KAB_SQL: &str = "SELECT k.id, k.code, k.kemendagri_code, k.name, k.kind, k.province_id, p.name, k.latitude, k.longitude, k.is_active,
    count(*) OVER () AS total
    FROM master_kabkota k JOIN master_locations p ON p.id = k.province_id
    WHERE ($1::text IS NULL OR k.name ILIKE $1 OR k.code ILIKE $1 OR k.kemendagri_code ILIKE $1)
      AND ($2::bool IS NULL OR k.is_active = $2) AND ($3::int IS NULL OR k.province_id = $3) AND ($6::text IS NULL OR k.kind = $6)";

pub async fn kabkota_list(State(s): State<AppState>, Query(q): Query<ListQuery>) -> Result<Json<Value>, ApiError> {
    let p = paging(&q);
    let c = s.pool.get().await.map_err(internal)?;
    let off = (p.page - 1) * p.per_page;
    let rows = c
        .query(
            &format!("{KAB_SQL} ORDER BY k.kemendagri_code LIMIT $4 OFFSET $5"),
            &[&p.search, &p.status, &q.province_id, &p.per_page, &off, &opt(&q.kind)],
        )
        .await
        .map_err(internal)?;
    let total = rows.first().map(|r| r.get::<_, i64>(10)).unwrap_or(0);
    let data = rows
        .iter()
        .map(|r| json!({
            "id": r.get::<_, i32>(0), "code": r.get::<_, String>(1), "kemendagri_code": r.get::<_, String>(2),
            "name": r.get::<_, String>(3), "kind": r.get::<_, String>(4), "province_id": r.get::<_, i32>(5),
            "province_name": r.get::<_, String>(6), "latitude": r.get::<_, f64>(7), "longitude": r.get::<_, f64>(8),
            "is_active": r.get::<_, bool>(9),
        }))
        .collect();
    Ok(list_json(data, total, &p))
}

#[derive(Deserialize)]
pub struct KabBody {
    code: Option<String>,
    kemendagri_code: Option<String>,
    province_id: Option<i32>,
    name: Option<String>,
    kind: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    is_active: Option<bool>,
}

struct KabValid {
    code: String,
    kcode: String,
    province_id: i32,
    name: String,
    kind: String,
}

async fn check_kab(c: &deadpool_postgres::Object, b: &KabBody) -> Result<KabValid, ApiError> {
    let province_id = b.province_id.ok_or_else(|| bad_request("Provinsi wajib dipilih"))?;
    let kcode = req(&b.kemendagri_code, "Kode Kemendagri")?;
    let parts: Vec<&str> = kcode.split('.').collect();
    if parts.len() != 2 || !digits(parts[0], 2) || !digits(parts[1], 2) {
        return Err(bad_request("Kode Kemendagri harus berformat NN.NN (contoh: 31.71)"));
    }
    let code = req(&b.code, "Kode BPS")?;
    if !digits(&code, 4) {
        return Err(bad_request("Kode BPS harus 4 digit angka (contoh: 3171)"));
    }
    let name = req(&b.name, "Nama kabupaten/kota")?;
    let kind = req(&b.kind, "Jenis")?;
    if kind != "kabupaten" && kind != "kota" {
        return Err(bad_request("Jenis harus 'kabupaten' atau 'kota'"));
    }
    coords(b.latitude, b.longitude, true)?;
    let prov = c
        .query_opt("SELECT code FROM master_locations WHERE id = $1", &[&province_id])
        .await
        .map_err(internal)?
        .ok_or_else(|| bad_request("Provinsi tidak ditemukan"))?;
    let pcode: String = prov.get(0);
    if parts[0] != pcode {
        return Err(bad_request(&format!("Kode Kemendagri harus diawali kode provinsi ({pcode}.)")));
    }
    Ok(KabValid { code, kcode, province_id, name, kind })
}

const KAB_DUP: &str = "Kode Kemendagri sudah digunakan";

pub async fn kabkota_create(State(s): State<AppState>, Json(b): Json<KabBody>) -> Result<(StatusCode, Json<Value>), ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let v = check_kab(&c, &b).await?;
    let r = c
        .query_one(
            "INSERT INTO master_kabkota (code, kemendagri_code, province_id, name, kind, latitude, longitude, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
            &[&v.code, &v.kcode, &v.province_id, &v.name, &v.kind, &b.latitude, &b.longitude, &b.is_active.unwrap_or(true)],
        )
        .await
        .map_err(|e| db_err(e, KAB_DUP))?;
    Ok((StatusCode::CREATED, Json(json!({ "success": true, "id": r.get::<_, i32>(0) }))))
}

pub async fn kabkota_update(State(s): State<AppState>, Path(id): Path<i32>, Json(b): Json<KabBody>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let v = check_kab(&c, &b).await?;
    let n = c
        .execute(
            "UPDATE master_kabkota SET code = $2, kemendagri_code = $3, province_id = $4, name = $5, kind = $6, latitude = $7, longitude = $8,
             is_active = COALESCE($9, is_active), updated_at = now() WHERE id = $1",
            &[&id, &v.code, &v.kcode, &v.province_id, &v.name, &v.kind, &b.latitude, &b.longitude, &b.is_active],
        )
        .await
        .map_err(|e| db_err(e, KAB_DUP))?;
    changed(n, id)
}

pub async fn kabkota_status(State(s): State<AppState>, Path(id): Path<i32>, Json(b): Json<StatusBody>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let n = c
        .execute("UPDATE master_kabkota SET is_active = $2, updated_at = now() WHERE id = $1", &[&id, &b.is_active])
        .await
        .map_err(internal)?;
    changed(n, id)
}

// ---------------- Penyakit ----------------

const DIS_SQL: &str = "SELECT d.id, d.code, d.name, d.english_name, d.category, d.is_zoonotic, d.description, d.aliases_id, d.is_active,
    (SELECT count(*) FROM case_reports r WHERE r.disease_id = d.id) AS report_count, count(*) OVER () AS total,
    d.icd10, d.symptoms, d.transmission
    FROM master_diseases d
    WHERE ($1::text IS NULL OR d.name ILIKE $1 OR d.code ILIKE $1 OR d.english_name ILIKE $1 OR d.category ILIKE $1 OR d.aliases_id::text ILIKE $1)
      AND ($2::bool IS NULL OR d.is_active = $2)";

pub async fn diseases_list(State(s): State<AppState>, Query(q): Query<ListQuery>) -> Result<Json<Value>, ApiError> {
    let p = paging(&q);
    let c = s.pool.get().await.map_err(internal)?;
    let off = (p.page - 1) * p.per_page;
    let rows = c
        .query(&format!("{DIS_SQL} ORDER BY d.name LIMIT $3 OFFSET $4"), &[&p.search, &p.status, &p.per_page, &off])
        .await
        .map_err(internal)?;
    let total = rows.first().map(|r| r.get::<_, i64>(10)).unwrap_or(0);
    let data = rows
        .iter()
        .map(|r| json!({
            "id": r.get::<_, i32>(0), "code": r.get::<_, String>(1), "name": r.get::<_, String>(2),
            "english_name": r.get::<_, Option<String>>(3), "category": r.get::<_, Option<String>>(4),
            "is_zoonotic": r.get::<_, bool>(5), "description": r.get::<_, Option<String>>(6),
            "aliases_id": r.get::<_, Value>(7), "is_active": r.get::<_, bool>(8), "report_count": r.get::<_, i64>(9),
            "icd10": r.get::<_, Option<String>>(11), "symptoms": r.get::<_, Option<String>>(12), "transmission": r.get::<_, Option<String>>(13),
        }))
        .collect();
    Ok(list_json(data, total, &p))
}

#[derive(Deserialize)]
pub struct DiseaseBody {
    code: Option<String>,
    name: Option<String>,
    english_name: Option<String>,
    category: Option<String>,
    is_zoonotic: Option<bool>,
    description: Option<String>,
    aliases_id: Option<Vec<String>>,
    is_active: Option<bool>,
    icd10: Option<String>,
    symptoms: Option<String>,
    transmission: Option<String>,
}

fn check_disease(b: &DiseaseBody) -> Result<(String, String, Value), ApiError> {
    let code = req(&b.code, "Kode penyakit")?.to_uppercase();
    if code.len() > 40 || !code.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_') || code.starts_with("OLD_") {
        return Err(bad_request("Kode penyakit hanya huruf besar, angka, dan garis bawah (maks. 40), contoh: DENGUE"));
    }
    let name = req(&b.name, "Nama penyakit")?;
    let mut aliases: Vec<String> = b.aliases_id.clone().unwrap_or_default().into_iter().map(|a| a.trim().to_string()).filter(|a| !a.is_empty()).collect();
    aliases.dedup();
    Ok((code, name, json!(aliases)))
}

const DIS_DUP: &str = "Kode penyakit sudah digunakan";

pub async fn disease_create(State(s): State<AppState>, Json(b): Json<DiseaseBody>) -> Result<(StatusCode, Json<Value>), ApiError> {
    let (code, name, aliases) = check_disease(&b)?;
    let c = s.pool.get().await.map_err(internal)?;
    let r = c
        .query_one(
            "INSERT INTO master_diseases (code, name, canonical_name, english_name, category, is_zoonotic, description, aliases_id, is_active, icd10, symptoms, transmission)
             VALUES ($1, $2, $1, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id",
            &[&code, &name, &opt(&b.english_name), &opt(&b.category), &b.is_zoonotic.unwrap_or(false), &opt(&b.description), &aliases,
              &b.is_active.unwrap_or(true), &opt(&b.icd10), &opt(&b.symptoms), &opt(&b.transmission)],
        )
        .await
        .map_err(|e| db_err(e, DIS_DUP))?;
    Ok((StatusCode::CREATED, Json(json!({ "success": true, "id": r.get::<_, i32>(0) }))))
}

pub async fn disease_update(State(s): State<AppState>, Path(id): Path<i32>, Json(b): Json<DiseaseBody>) -> Result<Json<Value>, ApiError> {
    let (code, name, aliases) = check_disease(&b)?;
    let c = s.pool.get().await.map_err(internal)?;
    let n = c
        .execute(
            "UPDATE master_diseases SET code = $2, name = $3, english_name = $4, category = $5, is_zoonotic = $6, description = $7,
             aliases_id = $8, is_active = COALESCE($9, is_active), icd10 = $10, symptoms = $11, transmission = $12, updated_at = now() WHERE id = $1",
            &[&id, &code, &name, &opt(&b.english_name), &opt(&b.category), &b.is_zoonotic.unwrap_or(false), &opt(&b.description), &aliases,
              &b.is_active, &opt(&b.icd10), &opt(&b.symptoms), &opt(&b.transmission)],
        )
        .await
        .map_err(|e| db_err(e, DIS_DUP))?;
    changed(n, id)
}

pub async fn disease_status(State(s): State<AppState>, Path(id): Path<i32>, Json(b): Json<StatusBody>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let n = c
        .execute("UPDATE master_diseases SET is_active = $2, updated_at = now() WHERE id = $1", &[&id, &b.is_active])
        .await
        .map_err(internal)?;
    changed(n, id)
}
