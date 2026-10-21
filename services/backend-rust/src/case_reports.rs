use axum::{extract::{Query, State}, http::StatusCode, Json};
use chrono::NaiveDate;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{bad_request, internal, ApiError, AppState};

#[derive(Deserialize)]
pub struct NewReport {
    pub disease_id: i32,
    pub country_id: String,
    pub location_id: Option<i32>,
    pub location_name: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub report_date: NaiveDate,
    pub cases: i32,
    #[serde(default)]
    pub deaths: i32,
    pub notes: Option<String>,
    #[serde(default)]
    pub is_reviewed: bool,
}

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
    if b.latitude.is_some() != b.longitude.is_some() {
        return Err(bad_request("Fill both latitude and longitude, or neither"));
    }
    if b.latitude.map(|v| !(-90.0..=90.0).contains(&v)).unwrap_or(false) || b.longitude.map(|v| !(-180.0..=180.0).contains(&v)).unwrap_or(false) {
        return Err(bad_request("Latitude must be -90..90 and longitude -180..180"));
    }
    let country = uuid::Uuid::parse_str(b.country_id.trim()).map_err(|_| bad_request("Invalid country"))?;
    let name = b.location_name.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    if b.location_id.is_none() && name.is_none() {
        return Err(bad_request("Choose a location or type a location name"));
    }
    let notes = b.notes.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    let c = s.pool.get().await.map_err(internal)?;
    let row = c
        .query_opt(
            "INSERT INTO case_reports (disease_id, country_id, location_id, location_name, latitude, longitude, report_date,
                                       cases, deaths, notes, is_reviewed, reviewed_at, created_by)
             SELECT d.id, ct.id, l.id, COALESCE($4::text, l.name), COALESCE($5::float8, l.latitude), COALESCE($6::float8, l.longitude),
                    $7::date, $8::int, $9::int, $10::text, $11::bool, CASE WHEN $11::bool THEN now() END, NULL
             FROM master_diseases d
             JOIN master_countries ct ON ct.id = $2::uuid AND ct.is_active
             LEFT JOIN master_locations l ON l.id = $3::int AND l.is_active AND l.country_iso2 = ct.iso2
             WHERE d.id = $1 AND d.is_active AND ($3::int IS NULL OR l.id IS NOT NULL)
             RETURNING id::text",
            &[&b.disease_id, &country, &b.location_id, &name, &b.latitude, &b.longitude, &b.report_date, &b.cases, &b.deaths,
              &notes, &b.is_reviewed],
        )
        .await
        .map_err(internal)?;
    match row {
        Some(r) => Ok((StatusCode::CREATED, Json(json!({ "success": true, "id": r.get::<_, String>(0) })))),
        None => Err(bad_request("Unknown or inactive disease, country or location")),
    }
}

#[derive(Deserialize, Default)]
pub struct Filter {
    pub from: Option<NaiveDate>,
    pub to: Option<NaiveDate>,
    pub disease_id: Option<i32>,
    pub location_id: Option<i32>,
    pub limit: Option<i64>,
}

pub async fn list(State(s): State<AppState>, Query(f): Query<Filter>) -> Result<Json<Value>, ApiError> {
    let limit = f.limit.unwrap_or(100).clamp(1, 500);
    let c = s.pool.get().await.map_err(internal)?;
    let rows = c
        .query(
            "SELECT r.id::text, r.report_date::text, d.name, COALESCE(NULLIF(r.location_name,''), l.name, ''), r.cases, r.deaths, r.notes,
                    r.created_at::text, COALESCE(ct.name, ''), r.latitude, r.longitude, r.is_reviewed
             FROM case_reports r JOIN master_diseases d ON d.id = r.disease_id
             LEFT JOIN master_locations l ON l.id = r.location_id LEFT JOIN master_countries ct ON ct.id = r.country_id
             WHERE ($1::date IS NULL OR r.report_date >= $1) AND ($2::date IS NULL OR r.report_date <= $2)
               AND ($3::int IS NULL OR r.disease_id = $3) AND ($4::int IS NULL OR r.location_id = $4)
             ORDER BY r.report_date DESC, r.created_at DESC LIMIT $5",
            &[&f.from, &f.to, &f.disease_id, &f.location_id, &limit],
        )
        .await
        .map_err(internal)?;
    let data: Vec<Value> = rows
        .iter()
        .map(|r| json!({
            "id": r.get::<_, String>(0), "report_date": r.get::<_, String>(1), "disease": r.get::<_, String>(2),
            "location": r.get::<_, String>(3), "cases": r.get::<_, i32>(4), "deaths": r.get::<_, i32>(5),
            "notes": r.get::<_, Option<String>>(6), "created_at": r.get::<_, String>(7), "country": r.get::<_, String>(8),
            "latitude": r.get::<_, Option<f64>>(9), "longitude": r.get::<_, Option<f64>>(10), "is_reviewed": r.get::<_, bool>(11),
        }))
        .collect();
    Ok(Json(json!({ "success": true, "data": data })))
}
