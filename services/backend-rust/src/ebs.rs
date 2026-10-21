//! PR 005: EBS sync from the SKDR Kemenkes API (POST multipart tahun/limit/page, header User-Key).
//! Key from env SKDR_EBS_USER_KEY (never logged). TLS verification ON (reqwest default), no cookie header.
//! Config: app_settings.ebs_sync_config. Each run is logged in ebs_sync_log. Reporter name/phone and
//! "informasi" are dropped before storage and never returned by any endpoint.
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::{Datelike, NaiveDate, NaiveDateTime};
use deadpool_postgres::Pool;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{bad_request, internal, ApiError, AppState};

/// Fields never stored nor exposed (personal data).
const PRIVATE_FIELDS: [&str; 3] = ["nama_pelapor", "telp_pelapor", "informasi"];

#[derive(Deserialize, Clone, Debug)]
pub struct SyncConfig {
    #[serde(default = "t")]
    pub enabled: bool,
    pub api_url: String,
    #[serde(default)]
    pub years: Vec<Value>,
    #[serde(default = "d_interval")]
    pub interval_minutes: u64,
    #[serde(default = "d_page")]
    pub page_size: u32,
    #[serde(default = "d_retries")]
    pub max_retries: u32,
    #[serde(default = "d_delay")]
    pub retry_delay_secs: u64,
    #[serde(default = "d_timeout")]
    pub timeout_secs: u64,
}
fn t() -> bool { true }
fn d_interval() -> u64 { 180 }
fn d_page() -> u32 { 1000 }
fn d_retries() -> u32 { 3 }
fn d_delay() -> u64 { 10 }
fn d_timeout() -> u64 { 180 }

impl SyncConfig {
    /// "current"/"previous" or literal years.
    fn resolved_years(&self) -> Vec<i32> {
        let now = chrono::Local::now().year();
        let mut ys: Vec<i32> = self
            .years
            .iter()
            .filter_map(|v| match v {
                Value::String(s) if s == "current" => Some(now),
                Value::String(s) if s == "previous" => Some(now - 1),
                Value::String(s) => s.parse().ok(),
                Value::Number(n) => n.as_i64().map(|n| n as i32),
                _ => None,
            })
            .filter(|y| (2000..=now + 1).contains(y))
            .collect();
        if ys.is_empty() {
            ys = vec![now, now - 1];
        }
        ys.sort_unstable_by(|a, b| b.cmp(a));
        ys.dedup();
        ys
    }
}

pub async fn load_config(pool: &Pool) -> anyhow::Result<SyncConfig> {
    let c = pool.get().await?;
    let row = c.query_opt("SELECT value FROM app_settings WHERE key = 'ebs_sync_config'", &[]).await?;
    let v = row.map(|r| r.get::<_, String>(0)).ok_or_else(|| anyhow::anyhow!("ebs_sync_config belum ada"))?;
    Ok(serde_json::from_str(&v)?)
}

fn s(v: &Value, k: &str) -> Option<String> {
    match v.get(k) {
        Some(Value::String(x)) => Some(x.trim().to_string()).filter(|x| !x.is_empty()),
        Some(Value::Number(n)) => Some(n.to_string()),
        _ => None,
    }
}
fn int(v: &Value, k: &str) -> i32 {
    s(v, k).and_then(|x| x.parse::<f64>().ok()).map(|f| f.max(0.0).min(i32::MAX as f64) as i32).unwrap_or(0)
}
fn coord(v: &Value, k: &str, lim: f64) -> Option<f64> {
    s(v, k).and_then(|x| x.replace(',', ".").parse::<f64>().ok()).filter(|f| f.is_finite() && f.abs() <= lim && *f != 0.0)
}

struct Run {
    pages: i32,
    fetched: i32,
    upserted: i32,
    retries: i32,
}

async fn fetch_page(http: &reqwest::Client, cfg: &SyncConfig, key: &str, year: i32, page: u32, run: &mut Run) -> anyhow::Result<Value> {
    let mut last_err = anyhow::anyhow!("tidak ada percobaan");
    for attempt in 0..=cfg.max_retries {
        if attempt > 0 {
            run.retries += 1;
            tokio::time::sleep(Duration::from_secs(cfg.retry_delay_secs * attempt as u64)).await;
        }
        // multipart/form-data with an explicit Content-Length (same as the reference curl; no chunked encoding).
        let boundary = format!("----skdr{}", uuid::Uuid::new_v4().simple());
        let mut body = String::new();
        for (k, v) in [("tahun", year.to_string()), ("limit", cfg.page_size.to_string()), ("page", page.to_string())] {
            body.push_str(&format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n"));
        }
        body.push_str(&format!("--{boundary}--\r\n"));
        let res = http
            .post(&cfg.api_url)
            .header("User-Key", key)
            .header(reqwest::header::CONTENT_TYPE, format!("multipart/form-data; boundary={boundary}"))
            .header(reqwest::header::ACCEPT, "application/json")
            .body(body)
            .send()
            .await;
        match res {
            Ok(r) if r.status().is_success() => match r.json::<Value>().await {
                Ok(v) if v.get("resultEbs").is_some() => return Ok(v),
                Ok(_) => last_err = anyhow::anyhow!("respons tanpa resultEbs"),
                Err(e) => last_err = anyhow::anyhow!("JSON tidak valid: {e}"),
            },
            Ok(r) => last_err = anyhow::anyhow!("HTTP {}", r.status()),
            Err(e) => {
                let e = e.without_url();
                let mut msg = e.to_string();
                let mut src = std::error::Error::source(&e);
                while let Some(s) = src {
                    msg.push_str(": ");
                    msg.push_str(&s.to_string());
                    src = s.source();
                }
                last_err = anyhow::anyhow!("koneksi gagal: {msg}")
            }
        }
        tracing::warn!("EBS tahun {year} halaman {page} percobaan {} gagal: {last_err}", attempt + 1);
    }
    Err(last_err)
}

const UPSERT: &str = "INSERT INTO ebs_reports (id_ebs, no_ebs, propinsi, kota, distrik, kel_unit, unit, kode_depdagri_prop, kode_depdagri_kota,
      kode_depdagri_distrik, sts_rumor, diagnosa, verifikasi, jml_kasus, jml_kematian, kronologi, tindakan, saran, klb, latitude, longitude,
      tgl_laporan, create_date, update_date, raw, synced_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25, now())
    ON CONFLICT (id_ebs) DO UPDATE SET no_ebs=EXCLUDED.no_ebs, propinsi=EXCLUDED.propinsi, kota=EXCLUDED.kota, distrik=EXCLUDED.distrik,
      kel_unit=EXCLUDED.kel_unit, unit=EXCLUDED.unit, kode_depdagri_prop=EXCLUDED.kode_depdagri_prop, kode_depdagri_kota=EXCLUDED.kode_depdagri_kota,
      kode_depdagri_distrik=EXCLUDED.kode_depdagri_distrik, sts_rumor=EXCLUDED.sts_rumor, diagnosa=EXCLUDED.diagnosa, verifikasi=EXCLUDED.verifikasi,
      jml_kasus=EXCLUDED.jml_kasus, jml_kematian=EXCLUDED.jml_kematian, kronologi=EXCLUDED.kronologi, tindakan=EXCLUDED.tindakan,
      saran=EXCLUDED.saran, klb=EXCLUDED.klb, latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, tgl_laporan=EXCLUDED.tgl_laporan,
      create_date=EXCLUDED.create_date, update_date=EXCLUDED.update_date, raw=EXCLUDED.raw, synced_at=now()";

async fn store_page(pool: &Pool, rows: &[Value]) -> anyhow::Result<i32> {
    let mut c = pool.get().await?;
    let tx = c.transaction().await?;
    let stmt = tx.prepare(UPSERT).await?;
    let mut n = 0;
    for row in rows {
        let Some(id) = s(row, "id").and_then(|x| x.parse::<i64>().ok()) else { continue };
        let mut raw = row.clone();
        if let Some(o) = raw.as_object_mut() {
            for k in PRIVATE_FIELDS {
                o.remove(k);
            }
        }
        let date = s(row, "tgl_laporan").and_then(|x| NaiveDate::parse_from_str(&x, "%Y-%m-%d").ok());
        let ts = |k: &str| s(row, k).and_then(|x| NaiveDateTime::parse_from_str(&x, "%Y-%m-%d %H:%M:%S").ok());
        tx.execute(
            &stmt,
            &[&id, &s(row, "no_ebs"), &s(row, "propinsi"), &s(row, "kota"), &s(row, "distrik"), &s(row, "kel_unit"), &s(row, "unit"),
              &s(row, "kode_depdagri_prop"), &s(row, "kode_depdagri_kota"), &s(row, "kode_depdagri_distrik"), &s(row, "sts_rumor"),
              &s(row, "diagnosa"), &s(row, "verifikasi"), &int(row, "jml_kasus"), &int(row, "jml_kematian"), &s(row, "kronologi"),
              &s(row, "tindakan"), &s(row, "saran"), &s(row, "klb"), &coord(row, "lat", 90.0), &coord(row, "lng", 180.0),
              &date, &ts("create_date"), &ts("update_date"), &raw],
        )
        .await?;
        n += 1;
    }
    tx.commit().await?;
    Ok(n)
}

/// Links rows to provinsi / kab-kota / penyakit (idempotent, set-based).
pub async fn apply_mapping(pool: &Pool) -> anyhow::Result<()> {
    let c = pool.get().await?;
    c.batch_execute(
        "UPDATE ebs_reports e SET province_id = p.id FROM master_locations p
           WHERE p.code = e.kode_depdagri_prop AND e.province_id IS DISTINCT FROM p.id;
         UPDATE ebs_reports e SET kabkota_id = k.id FROM master_kabkota k
           WHERE length(e.kode_depdagri_kota) = 4 AND k.kemendagri_code = substr(e.kode_depdagri_kota,1,2) || '.' || substr(e.kode_depdagri_kota,3,2)
             AND e.kabkota_id IS DISTINCT FROM k.id;
         INSERT INTO ebs_diagnosa_alias (diagnosa)
           SELECT DISTINCT lower(trim(diagnosa)) FROM ebs_reports WHERE trim(COALESCE(diagnosa,'')) <> '' ON CONFLICT (diagnosa) DO NOTHING;
         UPDATE ebs_diagnosa_alias a SET disease_id = d.id, match_source = 'otomatis', updated_at = now()
           FROM master_diseases d
           WHERE a.disease_id IS NULL AND a.match_source IS NULL AND d.is_active
             AND (lower(d.name) = a.diagnosa OR lower(COALESCE(d.english_name,'')) = a.diagnosa OR lower(d.code) = a.diagnosa
                  OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(d.aliases_id,'[]'::jsonb)) x WHERE lower(x) = a.diagnosa));
         UPDATE ebs_reports e SET disease_id = a.disease_id FROM ebs_diagnosa_alias a
           WHERE a.diagnosa = lower(trim(e.diagnosa)) AND e.disease_id IS DISTINCT FROM a.disease_id;",
    )
    .await?;
    Ok(())
}

pub async fn run_sync(pool: Pool, running: Arc<AtomicBool>, trigger: &'static str) -> anyhow::Result<i64> {
    if running.swap(true, Ordering::SeqCst) {
        anyhow::bail!("Sinkronisasi EBS sedang berjalan");
    }
    let res = run_inner(&pool, trigger).await;
    running.store(false, Ordering::SeqCst);
    res
}

async fn run_inner(pool: &Pool, trigger: &'static str) -> anyhow::Result<i64> {
    let cfg = load_config(pool).await?;
    let years = cfg.resolved_years();
    let years_txt = years.iter().map(|y| y.to_string()).collect::<Vec<_>>().join(",");
    let log_id: i64 = pool
        .get()
        .await?
        .query_one("INSERT INTO ebs_sync_log (trigger, years, status) VALUES ($1, $2, 'berjalan') RETURNING id", &[&trigger, &years_txt])
        .await?
        .get(0);
    let mut run = Run { pages: 0, fetched: 0, upserted: 0, retries: 0 };
    let result: anyhow::Result<()> = async {
        let key = std::env::var("SKDR_EBS_USER_KEY").ok().filter(|k| !k.trim().is_empty())
            .ok_or_else(|| anyhow::anyhow!("SKDR_EBS_USER_KEY belum diisi di .env"))?;
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(cfg.timeout_secs))
            .user_agent("skdr-indonesia-ebs-sync/1.0")
            .http1_only()
            // The API matches the header name case-sensitively ("User-Key"); hyper lowercases by default.
            .http1_title_case_headers()
            .build()?;
        for year in &years {
            let mut page = 1u32;
            loop {
                let v = fetch_page(&http, &cfg, &key, *year, page, &mut run).await
                    .map_err(|e| anyhow::anyhow!("tahun {year} halaman {page}: {e}"))?;
                let total_page = v["resultEbs"]["paging"]["total_page"].as_u64()
                    .or_else(|| v["resultEbs"]["paging"]["total_page"].as_str().and_then(|x| x.parse().ok())).unwrap_or(0) as u32;
                let rows = v["resultEbs"]["data"].as_array().cloned().unwrap_or_default();
                run.pages += 1;
                run.fetched += rows.len() as i32;
                run.upserted += store_page(pool, &rows).await?;
                pool.get().await?.execute(
                    "UPDATE ebs_sync_log SET pages=$2, rows_fetched=$3, rows_upserted=$4, retries=$5 WHERE id=$1",
                    &[&log_id, &run.pages, &run.fetched, &run.upserted, &run.retries]).await?;
                if rows.is_empty() || page >= total_page {
                    break;
                }
                page += 1;
            }
        }
        apply_mapping(pool).await
    }
    .await;
    let (status, err) = match &result {
        Ok(()) => ("sukses", None),
        Err(e) => ("gagal", Some(e.to_string())),
    };
    pool.get().await?.execute(
        "UPDATE ebs_sync_log SET status=$2, error=$3, finished_at=now(), pages=$4, rows_fetched=$5, rows_upserted=$6, retries=$7 WHERE id=$1",
        &[&log_id, &status, &err, &run.pages, &run.fetched, &run.upserted, &run.retries]).await?;
    tracing::info!("EBS sync #{log_id} {status}: halaman={} baris={} upsert={}", run.pages, run.fetched, run.upserted);
    result.map(|_| log_id)
}

/// Background scheduler: checks every minute, runs when the last successful/started run is older than interval_minutes.
pub fn spawn_scheduler(pool: Pool, running: Arc<AtomicBool>) {
    tokio::spawn(async move {
        // Runs left 'berjalan' by a previous process were interrupted (done before any new run can start).
        if let Ok(c) = pool.get().await {
            let _ = c.execute("UPDATE ebs_sync_log SET status='gagal', finished_at=now(), error='terputus (backend dimulai ulang)' WHERE status='berjalan'", &[]).await;
        }
        tokio::time::sleep(Duration::from_secs(20)).await;
        loop {
            let due = async {
                let cfg = load_config(&pool).await?;
                if !cfg.enabled {
                    return anyhow::Ok(false);
                }
                let c = pool.get().await?;
                let r = c.query_one(
                    "SELECT COALESCE(MAX(started_at) < now() - make_interval(mins => $1::int), true) FROM ebs_sync_log WHERE status <> 'gagal' OR started_at > now() - interval '30 minutes'",
                    &[&(cfg.interval_minutes as i32)]).await?;
                Ok(r.get::<_, bool>(0))
            }
            .await;
            match due {
                Ok(true) => {
                    if let Err(e) = run_sync(pool.clone(), running.clone(), "jadwal").await {
                        tracing::warn!("EBS sync terjadwal gagal: {e}");
                    }
                }
                Ok(false) => {}
                Err(e) => tracing::warn!("EBS scheduler: {e}"),
            }
            tokio::time::sleep(Duration::from_secs(60)).await;
        }
    });
}

// ---------------- endpoints ----------------

pub async fn sync_now(State(s): State<AppState>) -> Result<(StatusCode, Json<Value>), ApiError> {
    if s.ebs_running.load(Ordering::SeqCst) {
        return Err((StatusCode::CONFLICT, Json(json!({ "success": false, "error": "Sinkronisasi EBS sedang berjalan" }))));
    }
    let (pool, running) = (s.pool.clone(), s.ebs_running.clone());
    tokio::spawn(async move {
        if let Err(e) = run_sync(pool, running, "manual").await {
            tracing::warn!("EBS sync manual gagal: {e}");
        }
    });
    Ok((StatusCode::ACCEPTED, Json(json!({ "success": true, "message": "Sinkronisasi EBS dimulai" }))))
}

pub async fn status(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let cfg = load_config(&s.pool).await.ok();
    let logs = c
        .query(
            "SELECT id, trigger, years, status, to_char(started_at AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD HH24:MI:SS'),
                    to_char(finished_at AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD HH24:MI:SS'), pages, rows_fetched, rows_upserted, retries, error
             FROM ebs_sync_log ORDER BY id DESC LIMIT 20",
            &[],
        )
        .await
        .map_err(internal)?;
    let t = c
        .query_one(
            "SELECT COUNT(*)::bigint, COUNT(province_id)::bigint, COUNT(kabkota_id)::bigint, COUNT(disease_id)::bigint,
                    COUNT(*) FILTER (WHERE latitude IS NOT NULL)::bigint, COALESCE(SUM(jml_kasus),0)::bigint,
                    to_char(MIN(tgl_laporan),'YYYY-MM-DD'), to_char(MAX(tgl_laporan),'YYYY-MM-DD')
             FROM ebs_reports",
            &[],
        )
        .await
        .map_err(internal)?;
    let per_year = c
        .query("SELECT EXTRACT(YEAR FROM tgl_laporan)::int, COUNT(*)::bigint FROM ebs_reports WHERE tgl_laporan IS NOT NULL GROUP BY 1 ORDER BY 1 DESC", &[])
        .await
        .map_err(internal)?;
    Ok(Json(json!({
        "success": true,
        "data": {
            "running": s.ebs_running.load(Ordering::SeqCst),
            "key_configured": std::env::var("SKDR_EBS_USER_KEY").map(|k| !k.trim().is_empty()).unwrap_or(false),
            "config": cfg.map(|c| json!({ "enabled": c.enabled, "api_url": c.api_url, "years": c.resolved_years(),
                "interval_minutes": c.interval_minutes, "page_size": c.page_size, "max_retries": c.max_retries })),
            "totals": { "rows": t.get::<_, i64>(0), "with_province": t.get::<_, i64>(1), "with_kabkota": t.get::<_, i64>(2),
                        "with_disease": t.get::<_, i64>(3), "with_coordinates": t.get::<_, i64>(4), "cases": t.get::<_, i64>(5),
                        "first_date": t.get::<_, Option<String>>(6), "last_date": t.get::<_, Option<String>>(7) },
            "per_year": per_year.iter().map(|r| json!({ "year": r.get::<_, i32>(0), "rows": r.get::<_, i64>(1) })).collect::<Vec<_>>(),
            "logs": logs.iter().map(|r| json!({
                "id": r.get::<_, i64>(0), "trigger": r.get::<_, String>(1), "years": r.get::<_, String>(2), "status": r.get::<_, String>(3),
                "started_at": r.get::<_, Option<String>>(4), "finished_at": r.get::<_, Option<String>>(5), "pages": r.get::<_, i32>(6),
                "rows_fetched": r.get::<_, i32>(7), "rows_upserted": r.get::<_, i32>(8), "retries": r.get::<_, i32>(9),
                "error": r.get::<_, Option<String>>(10),
            })).collect::<Vec<_>>(),
        }
    })))
}

/// Diagnosa mapping coverage (EBS diagnosa -> master penyakit).
pub async fn diagnosa_list(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let rows = c
        .query(
            "SELECT a.id, a.diagnosa, a.disease_id, d.name, a.match_source,
                    (SELECT COUNT(*) FROM ebs_reports e WHERE lower(trim(e.diagnosa)) = a.diagnosa)::bigint AS n,
                    (SELECT COALESCE(SUM(jml_kasus),0) FROM ebs_reports e WHERE lower(trim(e.diagnosa)) = a.diagnosa)::bigint AS cases,
                    (SELECT max(trim(e.diagnosa)) FROM ebs_reports e WHERE lower(trim(e.diagnosa)) = a.diagnosa) AS label
             FROM ebs_diagnosa_alias a LEFT JOIN master_diseases d ON d.id = a.disease_id ORDER BY n DESC, a.diagnosa",
            &[],
        )
        .await
        .map_err(internal)?;
    Ok(Json(json!({ "success": true, "data": rows.iter().map(|r| json!({
        "id": r.get::<_, i32>(0), "diagnosa": r.get::<_, Option<String>>(7).unwrap_or_else(|| r.get(1)),
        "disease_id": r.get::<_, Option<i32>>(2), "disease_name": r.get::<_, Option<String>>(3),
        "match_source": r.get::<_, Option<String>>(4), "reports": r.get::<_, i64>(5), "cases": r.get::<_, i64>(6),
    })).collect::<Vec<_>>() })))
}

#[derive(Deserialize)]
pub struct MapBody {
    disease_id: Option<i32>,
}

pub async fn diagnosa_map(State(s): State<AppState>, Path(id): Path<i32>, Json(b): Json<MapBody>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    if let Some(d) = b.disease_id {
        if c.query_opt("SELECT 1 FROM master_diseases WHERE id = $1 AND is_active", &[&d]).await.map_err(internal)?.is_none() {
            return Err(bad_request("Penyakit tidak ditemukan atau tidak aktif"));
        }
    }
    let n = c
        .execute("UPDATE ebs_diagnosa_alias SET disease_id = $2, match_source = 'manual', updated_at = now() WHERE id = $1", &[&id, &b.disease_id])
        .await
        .map_err(internal)?;
    if n == 0 {
        return Err((StatusCode::NOT_FOUND, Json(json!({ "success": false, "error": "Diagnosa tidak ditemukan" }))));
    }
    c.execute(
        "UPDATE ebs_reports e SET disease_id = a.disease_id FROM ebs_diagnosa_alias a WHERE a.id = $1 AND a.diagnosa = lower(trim(e.diagnosa))",
        &[&id],
    )
    .await
    .map_err(internal)?;
    Ok(Json(json!({ "success": true, "id": id })))
}
