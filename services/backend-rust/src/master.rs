use axum::{extract::{Query, State}, Json};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{internal, ApiError, AppState};

fn page(data: Vec<Value>) -> Json<Value> {
    let n = data.len();
    Json(json!({ "success": true, "data": data, "total": n, "page": 1, "per_page": n.max(1), "total_pages": 1 }))
}

const DISEASE_COLS: &str = "id, code, name, canonical_name, english_name, category, is_zoonotic, aliases_id, is_active";

fn disease_json(r: &tokio_postgres::Row) -> Value {
    json!({
        "id": r.get::<_, i32>(0), "code": r.get::<_, String>(1), "name": r.get::<_, String>(2),
        "canonical_name": r.get::<_, Option<String>>(3), "english_name": r.get::<_, Option<String>>(4),
        "category": r.get::<_, Option<String>>(5), "is_zoonotic": r.get::<_, bool>(6), "aliases_id": r.get::<_, Value>(7),
    })
}

/// Same shape as NLP `GET /api/v1/disease-concepts`; canonical_name carries the Indonesian display name used across the UI.
pub async fn disease_concepts(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let rows = c
        .query(&format!("SELECT {DISEASE_COLS} FROM master_diseases WHERE is_active ORDER BY name"), &[])
        .await
        .map_err(internal)?;
    Ok(page(rows
        .iter()
        .map(|r| {
            let aliases: Value = r.get(7);
            json!({
                "id": r.get::<_, i32>(0).to_string(), "disease_id": r.get::<_, String>(1), "canonical_name": r.get::<_, String>(2),
                "english_name": r.get::<_, Option<String>>(4), "category": r.get::<_, Option<String>>(5),
                "is_active": r.get::<_, bool>(8), "is_public": true, "alias_count": aliases.as_array().map(|a| a.len()).unwrap_or(0),
            })
        })
        .collect()))
}

pub async fn diseases(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let rows = c
        .query(&format!("SELECT {DISEASE_COLS} FROM master_diseases WHERE is_active ORDER BY name"), &[])
        .await
        .map_err(internal)?;
    Ok(page(rows.iter().map(disease_json).collect()))
}

/// Provinces (38).
pub async fn provinces(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let rows = c
        .query("SELECT id, code, name, latitude, longitude FROM master_locations WHERE is_active ORDER BY name", &[])
        .await
        .map_err(internal)?;
    Ok(page(rows
        .iter()
        .map(|r| json!({
            "id": r.get::<_, i32>(0), "code": r.get::<_, String>(1), "name": r.get::<_, String>(2),
            "latitude": r.get::<_, Option<f64>>(3), "longitude": r.get::<_, Option<f64>>(4),
        }))
        .collect()))
}

#[derive(Deserialize)]
pub struct KabQuery {
    province_id: Option<i32>,
}

/// Kabupaten/kota (514), optionally for one province.
pub async fn kabkota(State(s): State<AppState>, Query(q): Query<KabQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let rows = c
        .query(
            "SELECT k.id, k.code, k.kemendagri_code, k.name, k.kind, k.province_id, p.name, k.latitude, k.longitude
             FROM master_kabkota k JOIN master_locations p ON p.id = k.province_id
             WHERE k.is_active AND ($1::int IS NULL OR k.province_id = $1) ORDER BY k.name",
            &[&q.province_id],
        )
        .await
        .map_err(internal)?;
    Ok(page(rows
        .iter()
        .map(|r| json!({
            "id": r.get::<_, i32>(0), "code": r.get::<_, String>(1), "kemendagri_code": r.get::<_, String>(2),
            "name": r.get::<_, String>(3), "kind": r.get::<_, String>(4), "province_id": r.get::<_, i32>(5),
            "province_name": r.get::<_, String>(6), "latitude": r.get::<_, f64>(7), "longitude": r.get::<_, f64>(8),
        }))
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
