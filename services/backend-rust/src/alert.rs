//! PR 021: sinkronisasi Alert SKDR mingguan dari API Kemenkes (POST multipart tahun/minggu/limit/page, header User-Key).
//! Kunci dari env SKDR_EBS_USER_KEY (kunci yang sama dengan EBS; tidak pernah dicatat). Konfigurasi: app_settings.skdr_alert_sync.
//! Field pribadi (temuan = daftar nama pasien, petugas_verifikasi) dibuang sebelum disimpan.
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use axum::{extract::State, http::StatusCode, Json};
use chrono::NaiveDateTime;
use deadpool_postgres::Pool;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{bad_request, internal, ApiError, AppState};

const PRIVATE_FIELDS: [&str; 2] = ["temuan", "petugas_verifikasi"];

#[derive(Deserialize, Clone, Debug)]
pub struct AlertConfig {
    #[serde(default = "t")]
    pub enabled: bool,
    pub api_url: String,
    #[serde(default = "d_back")]
    pub weeks_back: i32,
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
fn d_back() -> i32 { 8 }
fn d_interval() -> u64 { 360 }
fn d_page() -> u32 { 1000 }
fn d_retries() -> u32 { 3 }
fn d_delay() -> u64 { 10 }
fn d_timeout() -> u64 { 180 }

pub async fn load_config(pool: &Pool) -> anyhow::Result<AlertConfig> {
    let c = pool.get().await?;
    let row = c.query_opt("SELECT value FROM app_settings WHERE key = 'skdr_alert_sync'", &[]).await?;
    let v = row.map(|r| r.get::<_, String>(0)).ok_or_else(|| anyhow::anyhow!("skdr_alert_sync belum ada"))?;
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

/// (tahun, minggu) list: the last `back` MMWR weeks up to the current one, newest first.
pub fn recent_weeks(back: i32) -> Vec<(i32, i32)> {
    let today = chrono::Local::now().date_naive();
    let mut d = today;
    let mut out: Vec<(i32, i32)> = Vec::new();
    while out.len() < back.max(1) as usize {
        let w = crate::dashboard::current_mmwr(d);
        if !out.contains(&w) {
            out.push(w);
        }
        d -= chrono::Duration::days(7);
    }
    out
}

struct Run { pages: i32, fetched: i32, upserted: i32, retries: i32 }

async fn fetch_page(http: &reqwest::Client, cfg: &AlertConfig, key: &str, year: i32, week: i32, page: u32, run: &mut Run) -> anyhow::Result<Value> {
    let mut last_err = anyhow::anyhow!("tidak ada percobaan");
    for attempt in 0..=cfg.max_retries {
        if attempt > 0 {
            run.retries += 1;
            tokio::time::sleep(Duration::from_secs(cfg.retry_delay_secs * attempt as u64)).await;
        }
        let boundary = format!("----skdr{}", uuid::Uuid::new_v4().simple());
        let mut body = String::new();
        for (k, v) in [("tahun", year.to_string()), ("minggu", week.to_string()), ("limit", cfg.page_size.to_string()), ("page", page.to_string())] {
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
                Ok(v) if v.get("resultAlert").is_some() => return Ok(v),
                Ok(_) => last_err = anyhow::anyhow!("respons tanpa resultAlert"),
                Err(e) => last_err = anyhow::anyhow!("JSON tidak valid: {e}"),
            },
            Ok(r) => last_err = anyhow::anyhow!("HTTP {}", r.status()),
            Err(e) => last_err = anyhow::anyhow!("koneksi gagal: {}", e.without_url()),
        }
        tracing::warn!("Alert SKDR {year}/{week} halaman {page} percobaan {} gagal: {last_err}", attempt + 1);
    }
    Err(last_err)
}

const UPSERT: &str = "INSERT INTO skdr_alerts (uniq_id, kategori_unit_id, kategori_unit, unit_id, kode_unit, provinsi, kota, kecamatan, unit,
      latitude, longitude, nama_penyakit, kode_penyakit, tahun, minggu, kasus, jml_kematian, sts_verifikasi, tgl_verifikasi, klb, respon24,
      jenis_verif, gejala, kronologi, tindakan, spesimen_diperiksa, hasil_pemeriksaan, raw, synced_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28, now())
    ON CONFLICT (uniq_id) DO UPDATE SET kategori_unit_id=EXCLUDED.kategori_unit_id, kategori_unit=EXCLUDED.kategori_unit, unit_id=EXCLUDED.unit_id,
      kode_unit=EXCLUDED.kode_unit, provinsi=EXCLUDED.provinsi, kota=EXCLUDED.kota, kecamatan=EXCLUDED.kecamatan, unit=EXCLUDED.unit,
      latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, nama_penyakit=EXCLUDED.nama_penyakit, kode_penyakit=EXCLUDED.kode_penyakit,
      tahun=EXCLUDED.tahun, minggu=EXCLUDED.minggu, kasus=EXCLUDED.kasus, jml_kematian=EXCLUDED.jml_kematian, sts_verifikasi=EXCLUDED.sts_verifikasi,
      tgl_verifikasi=EXCLUDED.tgl_verifikasi, klb=EXCLUDED.klb, respon24=EXCLUDED.respon24, jenis_verif=EXCLUDED.jenis_verif, gejala=EXCLUDED.gejala,
      kronologi=EXCLUDED.kronologi, tindakan=EXCLUDED.tindakan, spesimen_diperiksa=EXCLUDED.spesimen_diperiksa,
      hasil_pemeriksaan=EXCLUDED.hasil_pemeriksaan, raw=EXCLUDED.raw, synced_at=now()";

async fn store_page(pool: &Pool, rows: &[Value], year: i32, week: i32) -> anyhow::Result<i32> {
    let mut c = pool.get().await?;
    let tx = c.transaction().await?;
    let stmt = tx.prepare(UPSERT).await?;
    let mut n = 0;
    for row in rows {
        let Some(id) = s(row, "uniq_id").and_then(|x| x.parse::<i64>().ok()) else { continue };
        let mut raw = row.clone();
        if let Some(o) = raw.as_object_mut() {
            for k in PRIVATE_FIELDS {
                o.remove(k);
            }
        }
        let y = s(row, "tahun").and_then(|x| x.parse::<i32>().ok()).unwrap_or(year);
        let w = s(row, "minggu").and_then(|x| x.parse::<i32>().ok()).unwrap_or(week);
        let tv = s(row, "tgl_verifikasi").and_then(|x| NaiveDateTime::parse_from_str(&x, "%Y-%m-%d %H:%M:%S").ok());
        tx.execute(
            &stmt,
            &[&id, &s(row, "kategori_unit_id"), &s(row, "kategori_unit_pelapor"), &s(row, "unit_id"), &s(row, "kode_unit"), &s(row, "provinsi"),
              &s(row, "kota"), &s(row, "kecamatan"), &s(row, "unit"), &coord(row, "lat", 90.0), &coord(row, "lng", 180.0), &s(row, "nama_penyakit"),
              &s(row, "kode_penyakit"), &y, &w, &int(row, "kasus"), &int(row, "jml_kematian"), &s(row, "sts_verifikasi"), &tv, &s(row, "klb"),
              &s(row, "respon24"), &s(row, "jenis_verif"), &s(row, "gejala"), &s(row, "kronologi"), &s(row, "tindakan"),
              &s(row, "spesimen_diperiksa"), &s(row, "hasil_pemeriksaan"), &raw],
        )
        .await?;
        n += 1;
    }
    tx.commit().await?;
    Ok(n)
}

/// Links alerts to provinsi / kab-kota (names as already resolved for EBS rows, then master names) and penyakit (skdr_penyakit_map).
pub async fn apply_mapping(pool: &Pool) -> anyhow::Result<()> {
    let c = pool.get().await?;
    c.batch_execute(
        "UPDATE skdr_alerts a SET province_id = x.pid FROM (
            SELECT DISTINCT ON (upper(trim(propinsi))) upper(trim(propinsi)) n, province_id pid FROM ebs_reports
            WHERE province_id IS NOT NULL GROUP BY 1, 2 ORDER BY upper(trim(propinsi)), COUNT(*) DESC) x
          WHERE x.n = upper(trim(a.provinsi)) AND a.province_id IS DISTINCT FROM x.pid;
         UPDATE skdr_alerts a SET province_id = p.id FROM master_locations p
          WHERE a.province_id IS NULL AND upper(trim(p.name)) = upper(trim(a.provinsi));
         UPDATE skdr_alerts a SET kabkota_id = x.kid FROM (
            SELECT DISTINCT ON (upper(trim(propinsi)), upper(trim(kota))) upper(trim(propinsi)) p, upper(trim(kota)) k, kabkota_id kid FROM ebs_reports
            WHERE kabkota_id IS NOT NULL GROUP BY 1, 2, 3 ORDER BY upper(trim(propinsi)), upper(trim(kota)), COUNT(*) DESC) x
          WHERE x.p = upper(trim(a.provinsi)) AND x.k = upper(trim(a.kota)) AND a.kabkota_id IS DISTINCT FROM x.kid;
         UPDATE skdr_alerts a SET kabkota_id = k.id FROM master_kabkota k
          WHERE a.kabkota_id IS NULL AND a.province_id = k.province_id
            AND upper(trim(k.name)) = upper(trim(regexp_replace(a.kota, '^(KAB\\.|KABUPATEN|KOTA ADM\\.|KOTA)\\s*', '', 'i')));
         INSERT INTO skdr_penyakit_map (kode_penyakit, nama)
          SELECT kode_penyakit, max(nama_penyakit) FROM skdr_alerts WHERE kode_penyakit IS NOT NULL GROUP BY 1
          ON CONFLICT (kode_penyakit) DO NOTHING;
         UPDATE skdr_alerts a SET disease_id = m.disease_id FROM skdr_penyakit_map m
          WHERE m.kode_penyakit = a.kode_penyakit AND a.disease_id IS DISTINCT FROM m.disease_id;",
    )
    .await?;
    classify(&c, false).await
}

/// Derived columns from app_settings.lab_klaster_config: ada_spesimen, lab_kelas, is_klb, respon24_ok.
/// `all` = recompute every row (after a config change); otherwise only rows not yet classified or touched in the last day.
pub async fn classify(c: &deadpool_postgres::Object, all: bool) -> anyhow::Result<()> {
    let v: Value = c.query_opt("SELECT value FROM app_settings WHERE key = 'lab_klaster_config'", &[]).await?
        .and_then(|r| serde_json::from_str(&r.get::<_, String>(0)).ok()).unwrap_or_else(|| json!({}));
    let l = |k: &str| -> Vec<String> { v.get(k).and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_lowercase())).collect()).unwrap_or_default() };
    let pat = |k: &str| -> Vec<String> { l(k).into_iter().filter(|w| !w.is_empty()).map(|w| format!("%{}%", w.replace('%', "\\%").replace('_', "\\_"))).collect() };
    let map: Value = v.get("lab_result_map").cloned().unwrap_or_else(|| json!({}));
    let (empty, pos, neg, klb, r24) = (l("lab_empty_values"), pat("lab_positive_words"), pat("lab_negative_words"), l("klb_values"), l("respon24_ok"));
    c.execute(
        "UPDATE skdr_alerts a SET
            ada_spesimen = lower(trim(COALESCE(a.spesimen_diperiksa,''))) <> ALL($1),
            lab_kelas = CASE WHEN lower(trim(COALESCE(a.hasil_pemeriksaan,''))) = ANY($1) THEN 'belum'
                             WHEN ($6::jsonb ? lower(trim(a.hasil_pemeriksaan))) THEN $6::jsonb ->> lower(trim(a.hasil_pemeriksaan))
                             WHEN lower(a.hasil_pemeriksaan) LIKE ANY($3) THEN 'negatif'
                             WHEN lower(a.hasil_pemeriksaan) LIKE ANY($2) THEN 'positif' ELSE 'lainnya' END,
            is_klb = lower(trim(COALESCE(a.klb,''))) = ANY($4),
            respon24_ok = lower(trim(COALESCE(a.respon24,''))) = ANY($5)
         WHERE $7 OR a.lab_kelas IS NULL OR a.synced_at > now() - interval '1 day'",
        &[&empty, &pos, &neg, &klb, &r24, &map, &all],
    )
    .await?;
    // narrow copy for the Laboratorium / Klaster aggregates (skdr_alert_fakta)
    c.batch_execute(
        "BEGIN;
         DELETE FROM skdr_alert_fakta;
         INSERT INTO skdr_alert_fakta (alert_id, tahun, minggu, yw, province_id, kabkota_id, disease_id, kode_penyakit, nama_penyakit,
                provinsi, kota, unit, unit_key, unit_id, kasus, jml_kematian, latitude, longitude, ada_spesimen, spesimen, lab_kelas,
                is_klb, respon24_ok, is_case, sts_verif, tgl_verifikasi, klb_kode)
         SELECT a.id, a.tahun, a.minggu, a.tahun*100 + a.minggu, a.province_id, a.kabkota_id, a.disease_id, a.kode_penyakit, a.nama_penyakit,
                a.provinsi, a.kota, a.unit, lower(trim(a.unit)), a.unit_id, a.kasus, a.jml_kematian, a.latitude, a.longitude,
                COALESCE(a.ada_spesimen, false), CASE WHEN a.ada_spesimen THEN initcap(lower(trim(a.spesimen_diperiksa))) END,
                COALESCE(a.lab_kelas, 'belum'), COALESCE(a.is_klb, false), COALESCE(a.respon24_ok, false), COALESCE(m.is_case, true),
                trim(COALESCE(a.sts_verifikasi,'')) = '1', a.tgl_verifikasi, trim(a.klb)
         FROM skdr_alerts a LEFT JOIN skdr_penyakit_map m ON m.kode_penyakit = a.kode_penyakit;
         COMMIT;
         ANALYZE skdr_alert_fakta;",
    )
    .await?;
    Ok(())
}

pub async fn run_sync(pool: Pool, running: Arc<AtomicBool>, trigger: &str, weeks: Vec<(i32, i32)>) -> anyhow::Result<()> {
    if running.swap(true, Ordering::SeqCst) {
        anyhow::bail!("sinkronisasi Alert SKDR sedang berjalan");
    }
    let res = run_inner(&pool, trigger, &weeks).await;
    running.store(false, Ordering::SeqCst);
    res
}

async fn run_inner(pool: &Pool, trigger: &str, weeks: &[(i32, i32)]) -> anyhow::Result<()> {
    let cfg = load_config(pool).await?;
    let scope = weeks.iter().map(|(y, w)| format!("{y}-M{w}")).collect::<Vec<_>>().join(",");
    let log_id: i64 = {
        let c = pool.get().await?;
        c.query_one("INSERT INTO skdr_alert_sync_log (trigger, scope, status) VALUES ($1, $2, 'berjalan') RETURNING id", &[&trigger, &scope])
            .await?
            .get(0)
    };
    let mut run = Run { pages: 0, fetched: 0, upserted: 0, retries: 0 };
    let result: anyhow::Result<()> = async {
        let key = std::env::var("SKDR_EBS_USER_KEY").ok().filter(|k| !k.trim().is_empty())
            .ok_or_else(|| anyhow::anyhow!("SKDR_EBS_USER_KEY belum diisi di .env"))?;
        let http = reqwest::Client::builder()
            .user_agent("skdr-indonesia-alert-sync/1.0")
            .http1_only()
            .http1_title_case_headers()
            .timeout(Duration::from_secs(cfg.timeout_secs))
            .build()?;
        for (year, week) in weeks {
            let mut page = 1u32;
            loop {
                let v = fetch_page(&http, &cfg, &key, *year, *week, page, &mut run).await
                    .map_err(|e| anyhow::anyhow!("{year} minggu {week} halaman {page}: {e}"))?;
                let r = &v["resultAlert"];
                let rows = r["data"].as_array().cloned().unwrap_or_default();
                let total_page = r["paging"]["total_page"].as_u64().unwrap_or(0) as u32;
                run.pages += 1;
                run.fetched += rows.len() as i32;
                run.upserted += store_page(pool, &rows, *year, *week).await?;
                if rows.is_empty() || page >= total_page {
                    break;
                }
                page += 1;
            }
        }
        apply_mapping(pool).await?;
        Ok(())
    }
    .await;
    let c = pool.get().await?;
    let (status, err) = match &result { Ok(_) => ("selesai", None), Err(e) => ("gagal", Some(e.to_string())) };
    c.execute(
        "UPDATE skdr_alert_sync_log SET status=$2, finished_at=now(), pages=$3, rows_fetched=$4, rows_upserted=$5, retries=$6, error=$7 WHERE id=$1",
        &[&log_id, &status, &run.pages, &run.fetched, &run.upserted, &run.retries, &err],
    )
    .await?;
    result
}

pub fn spawn_scheduler(pool: Pool, running: Arc<AtomicBool>) {
    tokio::spawn(async move {
        if let Ok(c) = pool.get().await {
            let _ = c.execute("UPDATE skdr_alert_sync_log SET status='gagal', finished_at=now(), error='terputus (backend dimulai ulang)' WHERE status='berjalan'", &[]).await;
            // rows synced before the derived columns existed (or never classified)
            let empty: bool = c.query_one("SELECT NOT EXISTS (SELECT 1 FROM skdr_alert_fakta) AND EXISTS (SELECT 1 FROM skdr_alerts)", &[]).await
                .map(|r| r.get(0)).unwrap_or(false);
            let unclassified: bool = c.query_one("SELECT EXISTS (SELECT 1 FROM skdr_alerts WHERE lab_kelas IS NULL)", &[]).await
                .map(|r| r.get(0)).unwrap_or(false);
            if empty || unclassified {
                if let Err(e) = classify(&c, false).await {
                    tracing::warn!("Alert SKDR klasifikasi awal gagal: {e}");
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(45)).await;
        loop {
            let due = async {
                let cfg = load_config(&pool).await?;
                if !cfg.enabled || std::env::var("SKDR_EBS_USER_KEY").map(|k| k.trim().is_empty()).unwrap_or(true) {
                    return anyhow::Ok(None);
                }
                let c = pool.get().await?;
                let r = c.query_one(
                    "SELECT COALESCE(MAX(started_at) < now() - make_interval(mins => $1::int), true) FROM skdr_alert_sync_log WHERE status <> 'gagal' OR started_at > now() - interval '30 minutes'",
                    &[&(cfg.interval_minutes as i32)]).await?;
                Ok(if r.get::<_, bool>(0) { Some(cfg.weeks_back) } else { None })
            }
            .await;
            match due {
                Ok(Some(back)) => {
                    if let Err(e) = run_sync(pool.clone(), running.clone(), "jadwal", recent_weeks(back)).await {
                        tracing::warn!("Alert SKDR sync terjadwal gagal: {e}");
                    }
                }
                Ok(None) => {}
                Err(e) => tracing::warn!("Alert SKDR scheduler: {e}"),
            }
            tokio::time::sleep(Duration::from_secs(60)).await;
        }
    });
}

#[derive(Deserialize, Default)]
pub struct SyncBody {
    tahun: Option<i32>,
    minggu_dari: Option<i32>,
    minggu_sampai: Option<i32>,
}

pub async fn sync_now(State(s): State<AppState>, body: Option<Json<SyncBody>>) -> Result<(StatusCode, Json<Value>), ApiError> {
    if s.alert_running.load(Ordering::SeqCst) {
        return Err((StatusCode::CONFLICT, Json(json!({ "success": false, "error": "Sinkronisasi Alert SKDR sedang berjalan" }))));
    }
    let b = body.map(|Json(b)| b).unwrap_or_default();
    let weeks: Vec<(i32, i32)> = match b.tahun {
        Some(y) => {
            let (a, z) = (b.minggu_dari.unwrap_or(1), b.minggu_sampai.unwrap_or(53));
            if !(2000..=2100).contains(&y) || a < 1 || z > 53 || a > z {
                return Err(bad_request("tahun/minggu tidak valid (minggu 1-53, dari <= sampai)"));
            }
            (a..=z).rev().map(|w| (y, w)).collect()
        }
        None => {
            let back = load_config(&s.pool).await.map(|c| c.weeks_back).unwrap_or(8);
            recent_weeks(back)
        }
    };
    let n = weeks.len();
    let (pool, running) = (s.pool.clone(), s.alert_running.clone());
    tokio::spawn(async move {
        if let Err(e) = run_sync(pool, running, "manual", weeks).await {
            tracing::warn!("Alert SKDR sync manual gagal: {e}");
        }
    });
    Ok((StatusCode::ACCEPTED, Json(json!({ "success": true, "message": format!("Sinkronisasi Alert SKDR dimulai ({n} minggu)") }))))
}

pub async fn status(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let cfg = load_config(&s.pool).await.ok();
    let logs = c
        .query(
            "SELECT id, trigger, left(scope, 200), status, to_char(started_at AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD HH24:MI:SS'),
                    to_char(finished_at AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD HH24:MI:SS'), pages, rows_fetched, rows_upserted, retries, error
             FROM skdr_alert_sync_log ORDER BY id DESC LIMIT 20",
            &[],
        )
        .await
        .map_err(internal)?;
    let t = c
        .query_one(
            "SELECT COUNT(*)::bigint, COUNT(province_id)::bigint, COUNT(kabkota_id)::bigint, COUNT(disease_id)::bigint,
                    COALESCE(MIN(tahun*100+minggu),0), COALESCE(MAX(tahun*100+minggu),0) FROM skdr_alerts",
            &[],
        )
        .await
        .map_err(internal)?;
    let fmt = |v: i32| if v == 0 { Value::Null } else { json!(format!("{}-M{}", v / 100, v % 100)) };
    Ok(Json(json!({ "success": true, "data": {
        "running": s.alert_running.load(Ordering::SeqCst),
        "key_configured": std::env::var("SKDR_EBS_USER_KEY").map(|k| !k.trim().is_empty()).unwrap_or(false),
        "config": cfg.map(|c| json!({ "enabled": c.enabled, "api_url": c.api_url, "weeks_back": c.weeks_back, "interval_minutes": c.interval_minutes, "page_size": c.page_size })),
        "totals": { "rows": t.get::<_, i64>(0), "with_province": t.get::<_, i64>(1), "with_kabkota": t.get::<_, i64>(2), "with_disease": t.get::<_, i64>(3),
                    "first_week": fmt(t.get(4)), "last_week": fmt(t.get(5)) },
        "logs": logs.iter().map(|r| json!({
            "id": r.get::<_, i64>(0), "trigger": r.get::<_, String>(1), "scope": r.get::<_, Option<String>>(2), "status": r.get::<_, String>(3),
            "started_at": r.get::<_, Option<String>>(4), "finished_at": r.get::<_, Option<String>>(5), "pages": r.get::<_, i32>(6),
            "rows_fetched": r.get::<_, i32>(7), "rows_upserted": r.get::<_, i32>(8), "retries": r.get::<_, i32>(9), "error": r.get::<_, Option<String>>(10),
        })).collect::<Vec<_>>(),
    }})))
}
