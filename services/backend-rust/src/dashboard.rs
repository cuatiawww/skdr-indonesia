//! NLP-PENYAKIT main-dashboard endpoints (same JSON shape), fed only by form case reports.
use axum::{extract::{Query, State}, Json};
use chrono::{Datelike, Duration, NaiveDate};
use deadpool_postgres::Object;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio_postgres::types::ToSql;

use crate::{internal, ApiError, AppState};

#[derive(Deserialize, Default, Clone)]
pub struct DashQuery {
    pub province_id: Option<i32>,
    pub kabkota_id: Option<i32>,
    pub disease: Option<String>,
    pub start_year: Option<i32>,
    pub start_week: Option<i32>,
    pub end_year: Option<i32>,
    pub end_week: Option<i32>,
    pub source: Option<String>,
}

/// MMWR week 1 starts on the Sunday on or before 4 January.
pub fn mmwr_week_start(year: i32, week: i32) -> NaiveDate {
    let jan4 = NaiveDate::from_ymd_opt(year, 1, 4).unwrap();
    let back = jan4.weekday().num_days_from_sunday() as i64;
    jan4 - Duration::days(back) + Duration::days(((week.max(1) - 1) as i64) * 7)
}

pub fn current_mmwr(today: NaiveDate) -> (i32, i32) {
    for y in [today.year() + 1, today.year(), today.year() - 1] {
        let s = mmwr_week_start(y, 1);
        if today >= s {
            return (y, ((today - s).num_days() / 7 + 1) as i32);
        }
    }
    (today.year(), 1)
}

pub struct Resolved {
    start: Option<NaiveDate>,
    end: Option<NaiveDate>,
    province: Option<i32>,
    kabkota: Option<i32>,
    disease: Option<String>,
    source: Option<String>,
    scope: String,
}

impl Resolved {
    fn params(&self) -> [&(dyn ToSql + Sync); 6] {
        [&self.start, &self.end, &self.province, &self.kabkota, &self.disease, &self.source]
    }
    fn params_no_dates(&self) -> [&(dyn ToSql + Sync); 6] {
        const NONE: Option<NaiveDate> = None;
        [&NONE, &NONE, &self.province, &self.kabkota, &self.disease, &self.source]
    }
    fn filter_key(&self) -> String {
        format!(
            "{}|{}|{}|{}|{}",
            self.source.clone().unwrap_or_else(|| "all".into()),
            self.start.map(|d| d.to_string()).unwrap_or_default(),
            self.end.map(|d| d.to_string()).unwrap_or_default(),
            self.scope,
            self.disease.clone().unwrap_or_else(|| "all".into())
        )
    }
}

const COUNTRY: &str = "Indonesia";
const LOC: &str = "COALESCE(NULLIF(r.location_name, ''), k.name, l.name, 'Tidak diketahui')";
/// Disease label: master name, else the EBS diagnosa text (unmapped EBS rows are kept).
const DN: &str = "COALESCE(d.name, r.diagnosa, 'Tidak diketahui')";

fn base() -> String {
    "FROM surveillance_reports r
     LEFT JOIN master_diseases d ON d.id = r.disease_id
     LEFT JOIN master_locations l ON l.id = r.location_id
     LEFT JOIN master_kabkota k ON k.id = r.kabkota_id
     WHERE ($1::date IS NULL OR r.report_date >= $1) AND ($2::date IS NULL OR r.report_date <= $2)
       AND ($3::int IS NULL OR r.location_id = $3) AND ($4::int IS NULL OR r.kabkota_id = $4)
       AND ($5::text IS NULL OR d.name = $5 OR d.code = $5 OR (d.id IS NULL AND r.diagnosa = $5))
       AND ($6::text IS NULL OR r.source = $6)"
        .to_string()
}

async fn resolve(c: &Object, q: &DashQuery) -> Result<Resolved, ApiError> {
    let start = match (q.start_year, q.start_week) {
        (Some(y), Some(w)) => Some(mmwr_week_start(y, w)),
        _ => None,
    };
    let end = match (q.end_year, q.end_week) {
        (Some(y), Some(w)) => Some(mmwr_week_start(y, w) + Duration::days(6)),
        _ => None,
    };
    let disease = q.disease.clone().map(|d| d.trim().to_string()).filter(|d| !d.is_empty() && d.to_lowercase() != "all");
    // Scope label: kab/kota name, else province name, else Indonesia.
    let scope = if let Some(k) = q.kabkota_id {
        c.query_opt("SELECT name FROM master_kabkota WHERE id = $1", &[&k]).await.map_err(internal)?.map(|r| r.get::<_, String>(0))
    } else if let Some(p) = q.province_id {
        c.query_opt("SELECT name FROM master_locations WHERE id = $1", &[&p]).await.map_err(internal)?.map(|r| r.get::<_, String>(0))
    } else {
        None
    };
    let source = q.source.clone().map(|s| s.trim().to_lowercase()).filter(|s| s == "form" || s == "ebs");
    Ok(Resolved { start, end, province: q.province_id, kabkota: q.kabkota_id, disease, source, scope: scope.unwrap_or_else(|| COUNTRY.into()) })
}

async fn kpis(c: &Object, f: &Resolved) -> Result<Value, ApiError> {
    let sql = format!(
        "SELECT COALESCE(SUM(r.cases),0)::bigint, COALESCE(SUM(r.deaths),0)::bigint, COUNT(*)::bigint,
                COALESCE(SUM(r.cases) FILTER (WHERE r.is_reviewed),0)::bigint,
                COALESCE(SUM(r.deaths) FILTER (WHERE r.is_reviewed),0)::bigint,
                COUNT(*) FILTER (WHERE r.is_reviewed)::bigint,
                COUNT(DISTINCT {LOC})::bigint,
                COUNT(DISTINCT {LOC}) FILTER (WHERE r.latitude IS NOT NULL AND r.longitude IS NOT NULL)::bigint
         {}",
        base()
    );
    let r = c.query_one(&sql, &f.params()).await.map_err(internal)?;
    let master: i64 = c
        .query_one("SELECT COUNT(*)::bigint FROM master_kabkota WHERE is_active", &[])
        .await
        .map_err(internal)?
        .get(0);
    let (cases, deaths, events): (i64, i64, i64) = (r.get(0), r.get(1), r.get(2));
    let (cr, dr, er): (i64, i64, i64) = (r.get(3), r.get(4), r.get(5));
    let (locs, mapped): (i64, i64) = (r.get(6), r.get(7));
    Ok(json!({
        "cases": cases, "deaths": deaths, "events": events,
        "cases_reviewed": cr, "cases_unreviewed": cases - cr,
        "deaths_reviewed": dr, "deaths_unreviewed": deaths - dr,
        "events_reviewed": er, "events_unreviewed": events - er,
        "locations": locs, "locations_mapped": mapped, "locations_unmapped": locs - mapped,
        "active_locations": locs, "active_alerts": 0, "location_master_count": master,
        "locations_definition": "distinct_location_name", "kpi_source": "live_query",
        "scope": f.scope, "scope_label": f.scope,
        "snapshot_computed_at": chrono::Utc::now().to_rfc3339(), "snapshot_filter_key": f.filter_key(), "snapshot_stale": false,
    }))
}

fn outbreak(
    country: String, loc: String, province: Option<String>, disease: String, lat: Option<f64>, lng: Option<f64>,
    cases: i64, deaths: i64, events: i64, case_date: String, created: String, reviewed: bool, detail: Value, src: String,
) -> Value {
    let (sname, stype) = if src == "ebs" { ("EBS SKDR Kemenkes", "ebs") } else { ("Formulir Laporan Kasus", "form") };
    json!({
        "location_name": loc, "disease": disease, "country": country, "province": province, "city": null,
        "latitude": lat, "longitude": lng, "cases": cases, "deaths": deaths,
        "cases_reported": true, "deaths_reported": true, "event_count": events, "confidence": null,
        "threshold": 0, "severity": "NORMAL", "has_alert": false,
        "case_date": case_date, "sort_date": case_date, "case_date_precision": "day",
        "latest_date": case_date, "published_date": created, "crawled_at": created,
        "geo_level": if lat.is_some() && lng.is_some() { "location" } else { "none" },
        "is_national": false, "source_type": stype.to_uppercase(), "is_official": false,
        "sources": [{ "url": null, "source_name": sname, "source_type": stype, "published_at": created }],
        "detail": detail.as_object().map(|o| {
            let mut o = o.clone();
            o.insert("needs_review".into(), json!(!reviewed));
            o.insert("is_health_related".into(), json!(true));
            o.insert("source_name".into(), json!(sname));
            o.insert("source_type".into(), json!(stype));
            Value::Object(o)
        }).unwrap_or(json!({})),
    })
}

const ISO_TS: &str = "to_char(%s AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')";
fn iso(col: &str) -> String {
    ISO_TS.replace("%s", col)
}

async fn locations(c: &Object, f: &Resolved) -> Result<Vec<Value>, ApiError> {
    let sql = format!(
        "SELECT '{COUNTRY}', {LOC}, MAX(l.name), {DN},
                (array_agg(r.latitude ORDER BY r.created_at DESC) FILTER (WHERE r.latitude IS NOT NULL))[1],
                (array_agg(r.longitude ORDER BY r.created_at DESC) FILTER (WHERE r.longitude IS NOT NULL))[1],
                SUM(r.cases)::bigint, SUM(r.deaths)::bigint, COUNT(*)::bigint, MAX(r.report_date)::text,
                {}, BOOL_AND(r.is_reviewed), MIN(r.source)
         {} GROUP BY 2, 4 ORDER BY 7 DESC LIMIT 1000",
        iso("MAX(r.created_at)"),
        base()
    );
    let rows = c.query(&sql, &f.params()).await.map_err(internal)?;
    Ok(rows
        .iter()
        .map(|r| {
            let (cases, deaths): (i64, i64) = (r.get(6), r.get(7));
            outbreak(
                r.get(0), r.get(1), r.get(2), r.get(3), r.get(4), r.get(5), cases, deaths, r.get(8), r.get(9), r.get(10), r.get(11),
                json!({ "case_count": cases, "death_count": deaths }), r.get(12),
            )
        })
        .collect())
}

async fn signal_feed(c: &Object, f: &Resolved) -> Result<Vec<Value>, ApiError> {
    let sql = format!(
        "SELECT r.id::text, '{COUNTRY}', {LOC}, l.name, {DN}, r.latitude, r.longitude, r.cases, r.deaths,
                r.report_date::text, {}, r.is_reviewed, r.notes, r.source
         {} ORDER BY r.report_date DESC, r.created_at DESC LIMIT 200",
        iso("r.created_at"),
        base()
    );
    let rows = c.query(&sql, &f.params()).await.map_err(internal)?;
    Ok(rows
        .iter()
        .map(|r| {
            let (cases, deaths) = (r.get::<_, i32>(7) as i64, r.get::<_, i32>(8) as i64);
            let date: String = r.get(9);
            let created: String = r.get(10);
            outbreak(
                r.get(1), r.get(2), r.get(3), r.get(4), r.get(5), r.get(6), cases, deaths, 1, date.clone(), created.clone(), r.get(11),
                json!({
                    "event_id": r.get::<_, String>(0), "url": null, "content": r.get::<_, Option<String>>(12),
                    "published_at": created, "crawled_at": created, "case_date": date, "event_date": date,
                    "case_count": cases, "death_count": deaths, "publish_source": r.get::<_, String>(13),
                }), r.get(13),
            )
        })
        .collect())
}

async fn grouped(c: &Object, f: &Resolved, col: &str) -> Result<Vec<Value>, ApiError> {
    let sql = format!(
        "SELECT {col}, COALESCE(SUM(r.cases),0)::bigint, COALESCE(SUM(r.deaths),0)::bigint, COUNT(*)::bigint
         {} GROUP BY 1 ORDER BY 2 DESC, 1",
        base()
    );
    Ok(c.query(&sql, &f.params())
        .await
        .map_err(internal)?
        .iter()
        .map(|r| json!({ "name": r.get::<_, String>(0), "cases": r.get::<_, i64>(1), "deaths": r.get::<_, i64>(2), "events": r.get::<_, i64>(3) }))
        .collect())
}

async fn by_province(c: &Object, f: &Resolved) -> Result<Vec<Value>, ApiError> {
    let mut rows = grouped(c, f, "COALESCE(l.name, 'Tidak diketahui')").await?;
    // Every province is listed, with 0 when it has no reports (all 38 unless filtered to one province).
    let names = c
        .query("SELECT name FROM master_locations WHERE is_active AND ($1::int IS NULL OR id = $1) ORDER BY name", &[&f.province])
        .await
        .map_err(internal)?;
    for n in names {
        let name: String = n.get(0);
        if !rows.iter().any(|r| r["name"] == json!(name)) {
            rows.push(json!({ "name": name, "cases": 0, "deaths": 0, "events": 0 }));
        }
    }
    Ok(rows)
}

async fn trends(c: &Object, f: &Resolved) -> Result<Value, ApiError> {
    let cur = "r.report_date >= date_trunc('month', current_date)";
    let prev = "r.report_date >= date_trunc('month', current_date) - interval '1 month' AND r.report_date < date_trunc('month', current_date)";
    let sql = format!(
        "SELECT COALESCE(SUM(r.cases) FILTER (WHERE {cur}),0)::bigint, COALESCE(SUM(r.cases) FILTER (WHERE {prev}),0)::bigint,
                COALESCE(SUM(r.deaths) FILTER (WHERE {cur}),0)::bigint, COALESCE(SUM(r.deaths) FILTER (WHERE {prev}),0)::bigint,
                COUNT(*) FILTER (WHERE {cur})::bigint, COUNT(*) FILTER (WHERE {prev})::bigint,
                COUNT(DISTINCT {LOC}) FILTER (WHERE {cur})::bigint, COUNT(DISTINCT {LOC}) FILTER (WHERE {prev})::bigint,
                to_char(current_date, 'YYYY-MM'), to_char(current_date - interval '1 month', 'YYYY-MM')
         {}",
        base()
    );
    let r = c.query_one(&sql, &f.params_no_dates()).await.map_err(internal)?;
    let p = |i: usize| json!({ "current": r.get::<_, i64>(i), "previous": r.get::<_, i64>(i + 1) });
    Ok(json!({
        "cases": p(0), "deaths": p(2), "events": p(4), "locations": p(6),
        "alerts": { "current": 0, "previous": 0 },
        "current_month": r.get::<_, String>(8), "previous_month": r.get::<_, String>(9),
    }))
}

pub async fn public_dashboard(State(s): State<AppState>, Query(q): Query<DashQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let f = resolve(&c, &q).await?;
    let (ey, ew) = current_mmwr(chrono::Local::now().date_naive());
    let years: Vec<i32> = c
        .query("SELECT DISTINCT EXTRACT(YEAR FROM report_date)::int FROM surveillance_reports ORDER BY 1 DESC", &[])
        .await
        .map_err(internal)?
        .iter()
        .map(|r| r.get(0))
        .collect();
    let diseases: Vec<String> = c
        .query("SELECT name FROM master_diseases WHERE is_active ORDER BY name", &[])
        .await
        .map_err(internal)?
        .iter()
        .map(|r| r.get(0))
        .collect();
    Ok(Json(json!({
        "success": true,
        "data": {
            "updated_at": chrono::Utc::now().to_rfc3339(),
            "available_years": years, "available_diseases": diseases,
            "current_epi_week": ew, "current_epi_year": ey,
            "filters": {
                "country": COUNTRY, "scope": f.scope, "province_id": q.province_id, "kabkota_id": q.kabkota_id, "disease": f.disease, "source": null,
                "start_date": f.start.map(|d| d.to_string()), "end_date": f.end.map(|d| d.to_string()),
                "start_year": q.start_year, "start_week": q.start_week, "end_year": q.end_year, "end_week": q.end_week, "year": q.end_year,
            },
            "kpis": kpis(&c, &f).await?,
            "alerts": [],
            "signal_feed": signal_feed(&c, &f).await?,
            "signal_feed_page_size": 20,
            "locations": locations(&c, &f).await?,
            "map_locations_limit": 1000,
            "by_disease": grouped(&c, &f, DN).await?,
            "by_province": by_province(&c, &f).await?,
            "ai_summary": { "text": "", "provider": "unavailable", "cached": false, "mode": "disabled" },
            "trends": trends(&c, &f).await?,
            "weekly_trend": [],
        }
    })))
}

pub async fn kpi_snapshot(State(s): State<AppState>, Query(q): Query<DashQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let f = resolve(&c, &q).await?;
    Ok(Json(json!({
        "success": true,
        "data": {
            "kpis": kpis(&c, &f).await?,
            "snapshot": { "computed_at": chrono::Utc::now().to_rfc3339(), "filter_key": f.filter_key(), "is_stale": false, "kpi_source": "live_query" }
        }
    })))
}

async fn form_counts(c: &Object) -> Result<(i64, i64, i64, i64, Option<String>), ApiError> {
    let r = c
        .query_one(
            &format!(
                "SELECT COUNT(*)::bigint,
                        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))::bigint,
                        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()) - interval '1 month' AND created_at < date_trunc('month', now()))::bigint,
                        COUNT(*) FILTER (WHERE is_reviewed)::bigint, {}
                 FROM surveillance_reports",
                iso("MAX(created_at)")
            ),
            &[],
        )
        .await
        .map_err(internal)?;
    Ok((r.get(0), r.get(1), r.get(2), r.get(3), r.get(4)))
}

fn breakdown(total: i64, reviewed: i64) -> Value {
    // Form mapping: Processed / Health stored = reviewed reports; waiting = unreviewed.
    json!({ "processed_health": reviewed, "non_health": 0, "waiting": total - reviewed, "in_progress": 0, "stuck": 0,
            "failed": 0, "duplicate": 0, "archived": 0, "other": 0, "stuck_after_minutes": 0 })
}

pub async fn crawling_stats(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let (total, this_month, last_month, reviewed, last_at) = form_counts(&c).await?;
    let monthly = c
        .query(
            "SELECT EXTRACT(MONTH FROM created_at)::int, COUNT(*)::bigint FROM surveillance_reports
             WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now()) GROUP BY 1",
            &[],
        )
        .await
        .map_err(internal)?;
    let year = chrono::Local::now().year();
    let months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    let perf: Vec<Value> = (1..=12)
        .map(|m| {
            let n = monthly.iter().find(|r| r.get::<_, i32>(0) == m).map(|r| r.get::<_, i64>(1)).unwrap_or(0);
            json!({ "month_num": m, "month_label": months[(m - 1) as usize], "sub_label": format!("{} {}", months[(m - 1) as usize], year),
                    "total_count": n, "news_count": 0, "social_count": 0, "ibs_count": 0, "form_count": n })
        })
        .collect();
    let now = chrono::Local::now();
    Ok(Json(json!({
        "success": true,
        "data": {
            "total": total, "total_crawled_all_time": total, "this_month": this_month, "last_month": last_month,
            "total_processed": reviewed, "health_stored_in_db": reviewed, "non_health_stored_in_db": 0, "stored_in_db": total,
            "nlp_processing": 0, "status_breakdown": breakdown(total, reviewed),
            "total_news": 0, "total_social": 0, "total_ibs": 0, "monthly_performance": perf,
            "current_month": now.format("%Y-%m").to_string(),
            "previous_month": (now.date_naive().with_day(1).unwrap() - Duration::days(1)).format("%Y-%m").to_string(),
            "live_crawled": 0, "current_live_crawl": 0, "active_run_count": 0, "active_since": null,
            "collector_status": "IDLE", "last_report_at": last_at, "last_run_at": null, "enabled_sources": 0,
            "crawler_mode": "form_only",
            "by_source_type": [{ "source_type": "form", "total": total, "processed": reviewed, "this_month": this_month }],
        }
    })))
}

pub async fn crawling_stats_live(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let (total, _, _, reviewed, _) = form_counts(&c).await?;
    Ok(Json(json!({
        "success": true,
        "data": { "total": total, "status_breakdown": breakdown(total, reviewed), "throughput_per_minute": 0,
                  "throughput_window_minutes": 0, "poll_seconds": 15, "server_time": chrono::Utc::now().to_rfc3339() }
    })))
}

pub async fn crawl_history_summary(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let r = c
        .query_one(
            "SELECT COUNT(*)::bigint, COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL)::bigint,
                    COUNT(*) FILTER (WHERE NOT is_reviewed)::bigint FROM surveillance_reports",
            &[],
        )
        .await
        .map_err(internal)?;
    let (total, geo, review): (i64, i64, i64) = (r.get(0), r.get(1), r.get(2));
    Ok(Json(json!({
        "success": true,
        "data": { "raw_reports": total, "disease_events": total, "mapped": geo, "with_geo": geo, "without_geo": total - geo,
                  "needs_review": review, "jobs": 0, "matrix_rows": 0, "noise_excluded": 0, "by_channel": { "form": total },
                  "quality": { "surveillance": total, "review": 0, "noise": 0 }, "phase": "form", "default_quality": "all",
                  "fields": [], "note": "" }
    })))
}
