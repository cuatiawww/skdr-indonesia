use axum::{extract::{Query, State}, Json};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{internal, ApiError, AppState};

fn page(data: Vec<Value>) -> Json<Value> {
    let n = data.len();
    Json(json!({ "success": true, "data": data, "total": n, "page": 1, "per_page": n.max(1), "total_pages": 1 }))
}

/// Same shape as NLP `GET /api/v1/disease-concepts` (used by the epi filter bar).
pub async fn disease_concepts(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let rows = c
        .query("SELECT id, code, name, is_active FROM master_diseases ORDER BY name", &[])
        .await
        .map_err(internal)?;
    Ok(page(rows
        .iter()
        .map(|r| json!({
            "id": r.get::<_, i32>(0).to_string(), "disease_id": r.get::<_, String>(1), "canonical_name": r.get::<_, String>(2),
            "is_active": r.get::<_, bool>(3), "is_public": true, "category": null, "alias_count": 0,
        }))
        .collect()))
}

pub async fn diseases(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let rows = c
        .query("SELECT id, code, name FROM master_diseases WHERE is_active ORDER BY name", &[])
        .await
        .map_err(internal)?;
    Ok(page(rows
        .iter()
        .map(|r| json!({ "id": r.get::<_, i32>(0), "code": r.get::<_, String>(1), "name": r.get::<_, String>(2) }))
        .collect()))
}

#[derive(Deserialize)]
pub struct LocQuery {
    country_iso2: Option<String>,
}

pub async fn locations(State(s): State<AppState>, Query(q): Query<LocQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let iso = q.country_iso2.map(|s| s.trim().to_uppercase()).filter(|s| !s.is_empty());
    let rows = c
        .query(
            "SELECT id, code, name, level, country_iso2, latitude, longitude FROM master_locations
             WHERE is_active AND ($1::text IS NULL OR country_iso2 = $1) ORDER BY name",
            &[&iso],
        )
        .await
        .map_err(internal)?;
    Ok(page(rows
        .iter()
        .map(|r| json!({
            "id": r.get::<_, i32>(0), "code": r.get::<_, String>(1), "name": r.get::<_, String>(2), "level": r.get::<_, String>(3),
            "country_iso2": r.get::<_, String>(4), "latitude": r.get::<_, Option<f64>>(5), "longitude": r.get::<_, Option<f64>>(6),
        }))
        .collect()))
}

#[derive(Deserialize)]
pub struct CountryQuery {
    q: Option<String>,
    region_id: Option<String>,
}

pub async fn countries(State(s): State<AppState>, Query(q): Query<CountryQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let search = q.q.map(|s| format!("%{}%", s.trim().to_lowercase())).filter(|s| s != "%%");
    let region = q.region_id.and_then(|s| uuid::Uuid::parse_str(s.trim()).ok());
    let rows = c
        .query(
            "SELECT c.id::text, c.iso2, c.iso3, c.name, c.flag_code, c.home_region, c.display_order, c.is_active, c.created_at::text,
                    COALESCE((SELECT json_agg(json_build_object('id', r.id, 'code', r.code, 'name', r.name) ORDER BY r.display_order)
                              FROM master_country_regions cr JOIN master_regions r ON r.id = cr.region_id WHERE cr.country_id = c.id), '[]'::json)
             FROM master_countries c
             WHERE c.is_active AND ($1::text IS NULL OR lower(c.name) LIKE $1 OR lower(c.iso2) LIKE $1 OR lower(c.iso3) LIKE $1)
               AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM master_country_regions x WHERE x.country_id = c.id AND x.region_id = $2))
             ORDER BY c.display_order, c.name",
            &[&search, &region],
        )
        .await
        .map_err(internal)?;
    Ok(page(rows
        .iter()
        .map(|r| json!({
            "id": r.get::<_, String>(0), "iso2": r.get::<_, String>(1), "iso3": r.get::<_, String>(2), "name": r.get::<_, String>(3),
            "flag_code": r.get::<_, Option<String>>(4), "home_region": r.get::<_, Option<String>>(5), "display_order": r.get::<_, i32>(6),
            "is_active": r.get::<_, bool>(7), "created_at": r.get::<_, String>(8), "updated_at": r.get::<_, String>(8),
            "regions": r.get::<_, Value>(9), "aliases": [], "alias_count": 0, "primary_language": null,
        }))
        .collect()))
}

pub async fn regions(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let rows = c
        .query(
            "SELECT r.id::text, r.code, r.name, r.display_order, r.is_active,
                    COALESCE((SELECT json_agg(json_build_object('id', c.id, 'iso2', c.iso2, 'iso3', c.iso3, 'name', c.name, 'flag_code', c.flag_code)
                                       ORDER BY c.display_order, c.name)
                              FROM master_country_regions cr JOIN master_countries c ON c.id = cr.country_id WHERE cr.region_id = r.id), '[]'::json)
             FROM master_regions r WHERE r.is_active ORDER BY r.display_order",
            &[],
        )
        .await
        .map_err(internal)?;
    Ok(page(rows
        .iter()
        .map(|r| {
            let countries: Value = r.get(5);
            let n = countries.as_array().map(|a| a.len()).unwrap_or(0);
            json!({ "id": r.get::<_, String>(0), "code": r.get::<_, String>(1), "name": r.get::<_, String>(2),
                    "display_order": r.get::<_, i32>(3), "is_active": r.get::<_, bool>(4), "countries": countries, "country_count": n, "member_count": n })
        })
        .collect()))
}

/// Same shape as NLP `GET /api/v1/console/settings` (branding + navigation menu from app_settings).
pub async fn console_settings(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let rows = c.query("SELECT key, value FROM app_settings", &[]).await.map_err(internal)?;
    let mut cfg = serde_json::Map::new();
    for k in ["app_name", "app_tagline", "footer_text", "sidebar_logo_url", "login_logo_url", "favicon_url", "ticker_text"] {
        cfg.insert(k.into(), json!(""));
    }
    for r in rows {
        let (k, v): (String, String) = (r.get(0), r.get(1));
        if k.starts_with("session_") {
            continue;
        }
        let val = if k == "navigation_menu" { serde_json::from_str(&v).unwrap_or(json!([])) } else { json!(v) };
        cfg.insert(k, val);
    }
    Ok(Json(json!({ "success": true, "data": { "config_data": cfg, "updated_at": null, "updated_by": null } })))
}
