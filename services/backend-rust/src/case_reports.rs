use axum::{extract::{Query, State}, http::StatusCode, Json};
use chrono::NaiveDate;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{bad_request, internal, ApiError, AppState};

#[derive(Deserialize)]
pub struct NewReport {
    pub disease_id: i32,
    pub location_id: i32,
    pub report_date: NaiveDate,
    pub cases: i32,
    #[serde(default)]
    pub deaths: i32,
    pub notes: Option<String>,
}

#[derive(Deserialize, Default)]
pub struct Filter {
    pub from: Option<NaiveDate>,
    pub to: Option<NaiveDate>,
    pub disease_id: Option<i32>,
    pub location_id: Option<i32>,
    pub limit: Option<i64>,
}

const WHERE: &str = "($1::date IS NULL OR r.report_date >= $1) AND ($2::date IS NULL OR r.report_date <= $2) \
    AND ($3::int IS NULL OR r.disease_id = $3) AND ($4::int IS NULL OR r.location_id = $4)";

pub async fn create(State(s): State<AppState>, Json(b): Json<NewReport>) -> Result<(StatusCode, Json<Value>), ApiError> {
    if b.cases < 0 || b.deaths < 0 {
        return Err(bad_request("Cases and deaths must be 0 or more"));
    }
    if b.deaths > b.cases {
        return Err(bad_request("Deaths cannot exceed cases"));
    }
    if b.report_date > chrono::Local::now().date_naive() {
        return Err(bad_request("Report date cannot be in the future"));
    }
    let notes = b.notes.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    let c = s.pool.get().await.map_err(internal)?;
    let row = c
        .query_opt(
            "INSERT INTO case_reports (disease_id, location_id, report_date, cases, deaths, notes)
             SELECT d.id, l.id, $3::date, $4::int, $5::int, $6::text
             FROM master_diseases d, master_locations l
             WHERE d.id = $1 AND d.is_active AND l.id = $2 AND l.is_active
             RETURNING id::text",
            &[&b.disease_id, &b.location_id, &b.report_date, &b.cases, &b.deaths, &notes],
        )
        .await
        .map_err(internal)?;
    match row {
        Some(r) => Ok((StatusCode::CREATED, Json(json!({ "success": true, "id": r.get::<_, String>(0) })))),
        None => Err(bad_request("Unknown or inactive disease/location")),
    }
}

pub async fn list(State(s): State<AppState>, Query(f): Query<Filter>) -> Result<Json<Value>, ApiError> {
    let limit = f.limit.unwrap_or(100).clamp(1, 500);
    let c = s.pool.get().await.map_err(internal)?;
    let sql = format!(
        "SELECT r.id::text, r.report_date::text, d.name, l.name, r.cases, r.deaths, r.notes, r.created_at::text
         FROM case_reports r JOIN master_diseases d ON d.id = r.disease_id JOIN master_locations l ON l.id = r.location_id
         WHERE {WHERE} ORDER BY r.report_date DESC, r.created_at DESC LIMIT $5"
    );
    let rows = c
        .query(&sql, &[&f.from, &f.to, &f.disease_id, &f.location_id, &limit])
        .await
        .map_err(internal)?;
    let data: Vec<Value> = rows
        .iter()
        .map(|r| json!({
            "id": r.get::<_, String>(0), "report_date": r.get::<_, String>(1),
            "disease": r.get::<_, String>(2), "location": r.get::<_, String>(3),
            "cases": r.get::<_, i32>(4), "deaths": r.get::<_, i32>(5),
            "notes": r.get::<_, Option<String>>(6), "created_at": r.get::<_, String>(7),
        }))
        .collect();
    Ok(Json(json!({ "success": true, "data": data })))
}

pub async fn summary(State(s): State<AppState>, Query(f): Query<Filter>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let p: [&(dyn tokio_postgres::types::ToSql + Sync); 4] = [&f.from, &f.to, &f.disease_id, &f.location_id];
    let t = c
        .query_one(
            &format!("SELECT COUNT(*), COALESCE(SUM(r.cases),0)::bigint, COALESCE(SUM(r.deaths),0)::bigint,
                      COUNT(DISTINCT r.location_id), COUNT(DISTINCT r.disease_id) FROM case_reports r WHERE {WHERE}"),
            &p,
        )
        .await
        .map_err(internal)?;
    let group = |col: &str| {
        format!(
            "SELECT x.name, COALESCE(SUM(r.cases),0)::bigint, COALESCE(SUM(r.deaths),0)::bigint, COUNT(*)
             FROM case_reports r JOIN {col} x ON x.id = r.{fk} WHERE {WHERE}
             GROUP BY x.name ORDER BY 2 DESC, 1 LIMIT 15",
            fk = if col == "master_diseases" { "disease_id" } else { "location_id" }
        )
    };
    let to_json = |rows: Vec<tokio_postgres::Row>| -> Vec<Value> {
        rows.iter()
            .map(|r| json!({ "name": r.get::<_, String>(0), "cases": r.get::<_, i64>(1), "deaths": r.get::<_, i64>(2), "reports": r.get::<_, i64>(3) }))
            .collect()
    };
    let by_disease = to_json(c.query(&group("master_diseases"), &p).await.map_err(internal)?);
    let by_location = to_json(c.query(&group("master_locations"), &p).await.map_err(internal)?);
    let trend: Vec<Value> = c
        .query(
            &format!("SELECT r.report_date::text, COALESCE(SUM(r.cases),0)::bigint, COALESCE(SUM(r.deaths),0)::bigint
                      FROM case_reports r WHERE {WHERE} GROUP BY r.report_date ORDER BY r.report_date"),
            &p,
        )
        .await
        .map_err(internal)?
        .iter()
        .map(|r| json!({ "date": r.get::<_, String>(0), "cases": r.get::<_, i64>(1), "deaths": r.get::<_, i64>(2) }))
        .collect();
    let cases = t.get::<_, i64>(1);
    let deaths = t.get::<_, i64>(2);
    Ok(Json(json!({
        "success": true,
        "data": {
            "totals": {
                "reports": t.get::<_, i64>(0), "cases": cases, "deaths": deaths,
                "cfr": if cases > 0 { (deaths as f64) * 100.0 / (cases as f64) } else { 0.0 },
                "locations": t.get::<_, i64>(3), "diseases": t.get::<_, i64>(4),
            },
            "by_disease": by_disease, "by_location": by_location, "trend": trend,
        }
    })))
}
