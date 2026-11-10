//! PR 036: periodic import of the old SKDR API sync tables into the new report matrices
//! (ebs_reports -> laporan_ebs, skdr_alerts/skdr_alert_fakta -> laporan_ibs). All mapping lives in SQL
//! (migration 060, skdr_impor_lama_jalankan); settings in app_settings.laporan_impor_lama (enabled, interval_menit, ...).
use std::time::Duration;

use deadpool_postgres::Pool;
use serde_json::Value;

async fn interval_minutes(pool: &Pool) -> Option<u64> {
    let c = pool.get().await.ok()?;
    let row = c.query_opt("SELECT value FROM app_settings WHERE key = 'laporan_impor_lama'", &[]).await.ok()??;
    let v: Value = serde_json::from_str(&row.get::<_, String>(0)).ok()?;
    if !v.get("enabled").and_then(Value::as_bool).unwrap_or(false) {
        return None;
    }
    Some(v.get("interval_menit").and_then(Value::as_u64).unwrap_or(30).max(5))
}

async fn run_once(pool: &Pool) -> anyhow::Result<Value> {
    let c = pool.get().await?;
    c.batch_execute("SET statement_timeout = 0").await?;
    let r = c.query_one("SELECT skdr_impor_lama_jalankan()", &[]).await;
    let _ = c.batch_execute("RESET statement_timeout").await;
    Ok(r?.get(0))
}

pub fn spawn_scheduler(pool: Pool) {
    tokio::spawn(async move {
        // let the EBS / Alert sync schedulers start first
        tokio::time::sleep(Duration::from_secs(90)).await;
        loop {
            let wait = match interval_minutes(&pool).await {
                Some(m) => {
                    match run_once(&pool).await {
                        Ok(v) => tracing::info!("impor API SKDR lama -> laporan: {v}"),
                        Err(e) => tracing::warn!("impor API SKDR lama -> laporan gagal: {e}"),
                    }
                    m
                }
                None => 30,
            };
            tokio::time::sleep(Duration::from_secs(wait * 60)).await;
        }
    });
}