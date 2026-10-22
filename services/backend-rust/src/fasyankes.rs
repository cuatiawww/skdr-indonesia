//! PR 019: master fasilitas pelayanan kesehatan (Puskesmas, Rumah Sakit, …) from SATUSEHAT Master Sarana Index.
//! OAuth2 client_credentials: SATUSEHAT_CLIENT_ID / SATUSEHAT_CLIENT_SECRET from .env (never logged or returned).
//! Endpoints, jenis codes, page size and delay: app_settings.fasyankes_sync. Read-only towards SATUSEHAT;
//! idempotent upsert on kode_satusehat; every run logged in fasyankes_sync_log. Manual trigger only.
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use deadpool_postgres::Pool;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{internal, ApiError, AppState};

static RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Deserialize, Clone, Debug)]
pub struct Jenis {
    pub kode: String,
    pub label: String,
    pub slug: String,
}

#[derive(Deserialize, Clone, Debug)]
pub struct SyncConfig {
    pub auth_url: String,
    pub base_url: String,
    pub path: String,
    #[serde(default)]
    pub environment: String,
    pub jenis: Vec<Jenis>,
    #[serde(default = "d_limit")]
    pub page_limit: u32,
    #[serde(default = "d_delay")]
    pub delay_ms: u64,
    #[serde(default = "d_timeout")]
    pub timeout_secs: u64,
    #[serde(default = "d_retries")]
    pub max_retries: u32,
    /// Province codes to sync; empty = all (no kode_provinsi filter).
    #[serde(default)]
    pub provinces: Vec<String>,
}
fn d_limit() -> u32 { 100 }
fn d_delay() -> u64 { 250 }
fn d_timeout() -> u64 { 60 }
fn d_retries() -> u32 { 3 }

pub async fn load_config(c: &deadpool_postgres::Object) -> Result<SyncConfig, ApiError> {
    let row = c.query_opt("SELECT value FROM app_settings WHERE key = 'fasyankes_sync'", &[]).await.map_err(internal)?;
    let raw: String = row.map(|r| r.get(0)).ok_or_else(|| bad("Pengaturan fasyankes_sync belum ada (migrasi 035)."))?;
    serde_json::from_str(&raw).map_err(|e| bad(&format!("Pengaturan fasyankes_sync tidak valid: {e}")))
}

fn bad(msg: &str) -> ApiError {
    (StatusCode::BAD_REQUEST, Json(json!({ "success": false, "error": msg })))
}

/// Minimal application/x-www-form-urlencoded encoding.
fn enc(s: &str) -> String {
    s.bytes().map(|b| match b {
        b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
        _ => format!("%{b:02X}"),
    }).collect()
}

async fn token(http: &reqwest::Client, cfg: &SyncConfig) -> anyhow::Result<String> {
    let id = std::env::var("SATUSEHAT_CLIENT_ID").ok().filter(|v| !v.trim().is_empty())
        .ok_or_else(|| anyhow::anyhow!("SATUSEHAT_CLIENT_ID belum diisi di .env"))?;
    let secret = std::env::var("SATUSEHAT_CLIENT_SECRET").ok().filter(|v| !v.trim().is_empty())
        .ok_or_else(|| anyhow::anyhow!("SATUSEHAT_CLIENT_SECRET belum diisi di .env"))?;
    let body = format!("client_id={}&client_secret={}", enc(id.trim()), enc(secret.trim()));
    let r = http.post(format!("{}/accesstoken?grant_type=client_credentials", cfg.auth_url.trim_end_matches('/')))
        .header("Content-Type", "application/x-www-form-urlencoded").body(body).send().await?;
    let st = r.status();
    let v: Value = r.json().await.unwrap_or(Value::Null);
    v["access_token"].as_str().map(|s| s.to_string())
        .ok_or_else(|| anyhow::anyhow!("token SATUSEHAT ditolak (HTTP {st})"))
}

async fn fetch(http: &reqwest::Client, cfg: &SyncConfig, tok: &str, jenis: &str, prov: Option<&str>, page: u32) -> anyhow::Result<Value> {
    let mut url = format!("{}{}?limit={}&page={}&jenis_sarana={}", cfg.base_url.trim_end_matches('/'), cfg.path, cfg.page_limit, page, enc(jenis));
    if let Some(p) = prov { url.push_str(&format!("&kode_provinsi={}", enc(p))); }
    let mut last = String::new();
    for attempt in 0..=cfg.max_retries {
        if attempt > 0 { tokio::time::sleep(Duration::from_secs(2 * attempt as u64)).await; }
        match http.get(&url).bearer_auth(tok).send().await {
            Ok(r) if r.status().is_success() => return Ok(r.json().await?),
            Ok(r) => last = format!("HTTP {}", r.status()),
            Err(e) => last = e.to_string(),
        }
    }
    Err(anyhow::anyhow!("gagal mengambil halaman {page}: {last}"))
}

fn s(v: &Value) -> Option<String> {
    match v { Value::String(x) if !x.trim().is_empty() => Some(x.trim().to_string()), Value::Number(n) => Some(n.to_string()), _ => None }
}
fn f(v: &Value) -> Option<f64> {
    let x = v.as_f64().or_else(|| v.as_str().and_then(|t| t.parse().ok()))?;
    if x == 0.0 { None } else { Some(x) }
}

/// Upsert one page; returns rows stored. Province/kab ids mapped by Kemendagri code.
pub(crate) async fn store(pool: &Pool, rows: &[Value]) -> anyhow::Result<i32> {
    let c = pool.get().await?;
    let mut n = 0;
    for r in rows {
        let Some(kode) = s(&r["kode_satusehat"]) else { continue };
        let Some(nama) = s(&r["nama"]) else { continue };
        let updated: Option<String> = s(&r["updated_at"]);
        n += c.execute(
            "INSERT INTO master_fasyankes (kode_satusehat, kode_sarana, nama, jenis_kode, jenis_nama, subjenis_nama, kelas_nama,
                kode_provinsi, kode_kabkota, kode_kecamatan, nama_kecamatan, province_id, kabkota_id, alamat, telp, latitude, longitude,
                status_aktif, operasional, status_sarana, organization_id, src_updated_at, synced_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
                (SELECT id FROM master_locations WHERE code = $8 LIMIT 1), (SELECT id FROM master_kabkota WHERE code = $9 LIMIT 1),
                $12,$13,$14,$15,$16,$17,$18,$19,$20::text::timestamptz, now())
             ON CONFLICT (kode_satusehat) DO UPDATE SET kode_sarana=EXCLUDED.kode_sarana, nama=EXCLUDED.nama, jenis_kode=EXCLUDED.jenis_kode,
                jenis_nama=EXCLUDED.jenis_nama, subjenis_nama=EXCLUDED.subjenis_nama, kelas_nama=EXCLUDED.kelas_nama,
                kode_provinsi=EXCLUDED.kode_provinsi, kode_kabkota=EXCLUDED.kode_kabkota, kode_kecamatan=EXCLUDED.kode_kecamatan,
                nama_kecamatan=EXCLUDED.nama_kecamatan, province_id=EXCLUDED.province_id, kabkota_id=EXCLUDED.kabkota_id,
                alamat=EXCLUDED.alamat, telp=EXCLUDED.telp, latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude,
                status_aktif=EXCLUDED.status_aktif, operasional=EXCLUDED.operasional, status_sarana=EXCLUDED.status_sarana,
                organization_id=EXCLUDED.organization_id, src_updated_at=EXCLUDED.src_updated_at, synced_at=now()",
            &[&kode, &s(&r["kode_sarana"]), &nama, &s(&r["jenis_sarana"]["kode"]), &s(&r["jenis_sarana"]["nama_alt"]).or(s(&r["jenis_sarana"]["nama"])),
              &s(&r["subjenis"]["nama"]), &s(&r["kelas_sarana"]["nama"]), &s(&r["provinsi"]["kode"]), &s(&r["kabkota"]["kode"]),
              &s(&r["kecamatan"]["kode"]), &s(&r["kecamatan"]["nama"]), &s(&r["alamat"]), &s(&r["telp"]), &f(&r["latitude"]), &f(&r["longitude"]),
              &r["status_aktif"].as_bool(), &r["operasional"].as_bool(), &s(&r["status_sarana"]), &s(&r["organization_id"]), &updated],
        ).await? as i32;
    }
    Ok(n)
}

#[derive(Deserialize, Default)]
pub struct SyncBody {
    /// jenis slugs or codes; empty = all configured
    #[serde(default)]
    pub jenis: Vec<String>,
    /// province codes; empty = config.provinces (empty = nasional)
    #[serde(default)]
    pub provinces: Vec<String>,
    /// stop after this many pages per jenis/province (sample run); None = all
    pub max_pages: Option<u32>,
}

async fn run(pool: Pool, cfg: SyncConfig, body: SyncBody, log_id: i64) {
    let mut pages = 0i32;
    let mut upserted = 0i32;
    let result: anyhow::Result<()> = async {
        let http = reqwest::Client::builder().timeout(Duration::from_secs(cfg.timeout_secs)).user_agent("skdr-indonesia-fasyankes-sync/1.0").build()?;
        let tok = token(&http, &cfg).await?;
        let jenis: Vec<&Jenis> = cfg.jenis.iter().filter(|j| body.jenis.is_empty() || body.jenis.iter().any(|x| x == &j.slug || x == &j.kode)).collect();
        let provs: Vec<Option<String>> = {
            let p = if body.provinces.is_empty() { cfg.provinces.clone() } else { body.provinces.clone() };
            if p.is_empty() { vec![None] } else { p.into_iter().map(Some).collect() }
        };
        for j in jenis {
            for p in &provs {
                let mut page = 1u32;
                loop {
                    let v = fetch(&http, &cfg, &tok, &j.kode, p.as_deref(), page).await?;
                    let rows = v["data"].as_array().cloned().unwrap_or_default();
                    let total = v["total_page"].as_u64().unwrap_or(0) as u32;
                    upserted += store(&pool, &rows).await?;
                    pages += 1;
                    pool.get().await?.execute("UPDATE fasyankes_sync_log SET pages=$2, upserted=$3 WHERE id=$1", &[&log_id, &pages, &upserted]).await?;
                    if rows.is_empty() || page >= total || body.max_pages.map_or(false, |m| page >= m) { break; }
                    page += 1;
                    tokio::time::sleep(Duration::from_millis(cfg.delay_ms)).await;
                }
            }
        }
        Ok(())
    }.await;
    let (st, msg) = match &result { Ok(()) => ("selesai", None), Err(e) => ("gagal", Some(e.to_string())) };
    if let Ok(c) = pool.get().await {
        let _ = c.execute("UPDATE fasyankes_sync_log SET status=$2, message=$3, finished_at=now(), pages=$4, upserted=$5 WHERE id=$1",
            &[&log_id, &st, &msg, &pages, &upserted]).await;
    }
    RUNNING.store(false, Ordering::SeqCst);
}

/// POST /api/v1/admin/fasyankes/sync — manual trigger (runs in background).
pub async fn sync_now(State(s): State<AppState>, body: Option<Json<SyncBody>>) -> Result<Json<Value>, ApiError> {
    let body = body.map(|b| b.0).unwrap_or_default();
    let c = s.pool.get().await.map_err(internal)?;
    let cfg = load_config(&c).await?;
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err((StatusCode::CONFLICT, Json(json!({ "success": false, "error": "Sinkronisasi fasyankes sedang berjalan." }))));
    }
    // a run interrupted by a backend restart stays "running" in the log; close it before starting a new one
    let _ = c.execute("UPDATE fasyankes_sync_log SET status = 'terputus', finished_at = now(), message = 'Proses terhenti sebelum selesai' WHERE status = 'running'", &[]).await;
    let scope = json!({ "jenis": body.jenis, "provinces": body.provinces, "max_pages": body.max_pages, "environment": cfg.environment });
    let id: i64 = match c.query_one("INSERT INTO fasyankes_sync_log (scope) VALUES ($1) RETURNING id", &[&scope]).await {
        Ok(r) => r.get(0),
        Err(e) => { RUNNING.store(false, Ordering::SeqCst); return Err(internal(e)); }
    };
    tokio::spawn(run(s.pool.clone(), cfg, body, id));
    Ok(Json(json!({ "success": true, "data": { "log_id": id } })))
}

/// GET /api/v1/admin/fasyankes/status — running flag, counts per jenis, last runs.
pub async fn status(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let cfg = load_config(&c).await?;
    let counts: Vec<Value> = c.query("SELECT jenis_kode, COUNT(*)::bigint, COUNT(province_id)::bigint, MAX(synced_at)::text FROM master_fasyankes GROUP BY 1 ORDER BY 1", &[])
        .await.map_err(internal)?.iter().map(|r| json!({ "jenis_kode": r.get::<_, Option<String>>(0), "total": r.get::<_, i64>(1), "mapped_province": r.get::<_, i64>(2), "last_synced": r.get::<_, Option<String>>(3) })).collect();
    let logs: Vec<Value> = c.query("SELECT id, started_at::text, finished_at::text, status, scope, pages, upserted, message FROM fasyankes_sync_log ORDER BY id DESC LIMIT 10", &[])
        .await.map_err(internal)?.iter().map(|r| json!({ "id": r.get::<_, i64>(0), "started_at": r.get::<_, String>(1), "finished_at": r.get::<_, Option<String>>(2),
            "status": r.get::<_, String>(3), "scope": r.get::<_, Option<Value>>(4), "pages": r.get::<_, i32>(5), "upserted": r.get::<_, i32>(6), "message": r.get::<_, Option<String>>(7) })).collect();
    let jenis: Vec<Value> = cfg.jenis.iter().map(|j| json!({ "kode": j.kode, "label": j.label, "slug": j.slug })).collect();
    Ok(Json(json!({ "success": true, "data": { "running": RUNNING.load(Ordering::SeqCst), "environment": cfg.environment, "jenis": jenis, "counts": counts, "logs": logs,
        "credentials_set": std::env::var("SATUSEHAT_CLIENT_ID").map(|v| !v.trim().is_empty()).unwrap_or(false) } })))
}

#[derive(Deserialize)]
pub struct ListQuery {
    pub jenis: Option<String>,
    pub province_id: Option<String>,
    pub kabkota_id: Option<String>,
    pub q: Option<String>,
    pub page: Option<i64>,
    pub limit: Option<i64>,
}
fn ints(v: &Option<String>) -> Vec<i32> { v.as_deref().unwrap_or("").split(',').filter_map(|x| x.trim().parse().ok()).collect() }

/// GET /api/v1/master/fasyankes?jenis=puskesmas&province_id=&kabkota_id=&q=&page=&limit=
pub async fn list(State(s): State<AppState>, Query(q): Query<ListQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let cfg = load_config(&c).await?;
    let jenis = q.jenis.as_deref().unwrap_or("");
    let kode: Option<String> = cfg.jenis.iter().find(|j| j.slug == jenis || j.kode == jenis).map(|j| j.kode.clone());
    if !jenis.is_empty() && kode.is_none() { return Err(bad("Jenis fasyankes tidak dikenal.")); }
    let (prov, kab) = (ints(&q.province_id), ints(&q.kabkota_id));
    let term = q.q.as_deref().map(|t| t.trim().to_lowercase()).filter(|t| !t.is_empty()).map(|t| format!("%{t}%"));
    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let page = q.page.unwrap_or(1).max(1);
    let wh = "($1::text IS NULL OR f.jenis_kode = $1) AND (cardinality($2::int[]) = 0 OR f.province_id = ANY($2))
              AND (cardinality($3::int[]) = 0 OR f.kabkota_id = ANY($3))
              AND ($4::text IS NULL OR lower(f.nama) LIKE $4 OR f.kode_satusehat LIKE $4 OR lower(COALESCE(f.kode_sarana, '')) LIKE $4)";
    let total: i64 = c.query_one(&format!("SELECT COUNT(*)::bigint FROM master_fasyankes f WHERE {wh}"), &[&kode, &prov, &kab, &term]).await.map_err(internal)?.get(0);
    let rows = c.query(&format!(
        "SELECT f.kode_satusehat, f.kode_sarana, f.nama, f.jenis_nama, f.subjenis_nama, f.kelas_nama, l.name, k.name, f.nama_kecamatan, f.alamat,
                f.latitude, f.longitude, f.status_aktif, f.operasional, f.status_sarana, f.synced_at::text
         FROM master_fasyankes f LEFT JOIN master_locations l ON l.id = f.province_id LEFT JOIN master_kabkota k ON k.id = f.kabkota_id
         WHERE {wh} ORDER BY l.name NULLS LAST, k.name NULLS LAST, f.nama LIMIT $5 OFFSET $6"), &[&kode, &prov, &kab, &term, &limit, &((page - 1) * limit)]).await.map_err(internal)?;
    let data: Vec<Value> = rows.iter().map(|r| json!({
        "kode_satusehat": r.get::<_, String>(0), "kode_sarana": r.get::<_, Option<String>>(1), "nama": r.get::<_, String>(2),
        "jenis": r.get::<_, Option<String>>(3), "subjenis": r.get::<_, Option<String>>(4), "kelas": r.get::<_, Option<String>>(5),
        "provinsi": r.get::<_, Option<String>>(6), "kabkota": r.get::<_, Option<String>>(7), "kecamatan": r.get::<_, Option<String>>(8),
        "alamat": r.get::<_, Option<String>>(9), "latitude": r.get::<_, Option<f64>>(10), "longitude": r.get::<_, Option<f64>>(11),
        "status_aktif": r.get::<_, Option<bool>>(12), "operasional": r.get::<_, Option<bool>>(13), "status_sarana": r.get::<_, Option<String>>(14),
        "synced_at": r.get::<_, String>(15) })).collect();
    Ok(Json(json!({ "success": true, "data": data, "meta": { "total": total, "page": page, "limit": limit, "source": "SATUSEHAT Master Sarana Index", "environment": cfg.environment } })))
}

#[derive(Deserialize)]
pub struct UnitQuery {
    pub province_id: Option<String>,
    pub kabkota_id: Option<String>,
}

/// Normalised facility name used to compare free-text unit names with the master (drops type words/punctuation).
pub(crate) const NORM_SQL: &str = "trim(regexp_replace(regexp_replace(lower(%s), '[^a-z0-9]+', ' ', 'g'), '\\m(uptd|upt|puskesmas|pkm|rsud|rsu|rs|rumah sakit|umum|daerah|kab|kabupaten|kota)\\M', ' ', 'g'))";

/// GET /api/v1/filters/units — Unit pelapor options: reporting units as recorded in EBS (`unit`) and PE (`unit_pelapor`),
/// cascading from province/kab-kota; each flagged when its name matches a master fasyankes in the same kab/kota.
pub async fn units(State(s): State<AppState>, Query(q): Query<UnitQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let (prov, kab) = (ints(&q.province_id), ints(&q.kabkota_id));
    let nm = NORM_SQL.replace("%s", "g.label");
    let nf = NORM_SQL.replace("%s", "f.nama");
    let rows = c.query(&format!(
        "WITH u AS (
           SELECT trim(e.unit) name, e.kabkota_id, e.province_id, NULLIF(trim(e.kel_unit), '') kind, 'ebs' src FROM ebs_reports e WHERE NULLIF(trim(e.unit), '') IS NOT NULL
           UNION ALL
           SELECT trim(p.data->>'unit_pelapor'), p.kabkota_id, p.province_id, NULL, 'pe' FROM pe_cases p WHERE p.deleted_at IS NULL AND NULLIF(trim(p.data->>'unit_pelapor'), '') IS NOT NULL),
         g AS (
           SELECT lower(u.name) val, MIN(u.name) label, MIN(u.kind) kind, u.kabkota_id, COUNT(*) FILTER (WHERE u.src = 'ebs') ebs, COUNT(*) FILTER (WHERE u.src = 'pe') pe
           FROM u WHERE (cardinality($1::int[]) = 0 OR u.province_id = ANY($1)) AND (cardinality($2::int[]) = 0 OR u.kabkota_id = ANY($2))
           GROUP BY 1, 4),
         m AS (
           SELECT g.*, EXISTS (SELECT 1 FROM master_fasyankes f WHERE f.kabkota_id = g.kabkota_id AND {nf} = {nm} AND {nm} <> '') matched FROM g)
         SELECT m.val, MIN(m.label), MIN(m.kind), SUM(m.ebs)::bigint, SUM(m.pe)::bigint, MIN(k.name), bool_or(m.matched)
         FROM m LEFT JOIN master_kabkota k ON k.id = m.kabkota_id GROUP BY 1 ORDER BY 2 LIMIT 3000"), &[&prov, &kab]).await.map_err(internal)?;
    let data: Vec<Value> = rows.iter().map(|r| json!({ "value": r.get::<_, String>(0), "label": r.get::<_, String>(1), "kind": r.get::<_, Option<String>>(2),
        "ebs": r.get::<_, i64>(3), "pe": r.get::<_, i64>(4), "kabkota": r.get::<_, Option<String>>(5), "in_master": r.get::<_, Option<bool>>(6).unwrap_or(false) })).collect();
    Ok(Json(json!({ "success": true, "data": data })))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn form_encoding() {
        assert_eq!(enc("ab-c_1.~"), "ab-c_1.~");
        assert_eq!(enc("a b&c=d/e"), "a%20b%26c%3Dd%2Fe");
    }
    #[test]
    fn value_helpers() {
        assert_eq!(s(&json!("  x ")), Some("x".into()));
        assert_eq!(s(&json!("")), None);
        assert_eq!(s(&json!(64)), Some("64".into()));
        assert_eq!(f(&json!(0)), None);
        assert_eq!(f(&json!("4.75")), Some(4.75));
    }
    #[test]
    fn config_parses_defaults() {
        let c: SyncConfig = serde_json::from_value(json!({ "auth_url": "a", "base_url": "b", "path": "/p", "jenis": [{ "kode": "102", "label": "Puskesmas", "slug": "puskesmas" }] })).unwrap();
        assert_eq!(c.page_limit, 100);
        assert!(c.provinces.is_empty());
    }
}
