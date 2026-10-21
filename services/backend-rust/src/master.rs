use axum::{extract::State, Json};
use serde_json::{json, Value};

use crate::{internal, ApiError, AppState};

pub async fn diseases(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let rows = c
        .query("SELECT id, code, name FROM master_diseases WHERE is_active ORDER BY name", &[])
        .await
        .map_err(internal)?;
    let data: Vec<Value> = rows
        .iter()
        .map(|r| json!({ "id": r.get::<_, i32>(0), "code": r.get::<_, String>(1), "name": r.get::<_, String>(2) }))
        .collect();
    Ok(Json(json!({ "success": true, "data": data })))
}

pub async fn locations(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let rows = c
        .query("SELECT id, code, name, level FROM master_locations WHERE is_active ORDER BY name", &[])
        .await
        .map_err(internal)?;
    let data: Vec<Value> = rows
        .iter()
        .map(|r| json!({ "id": r.get::<_, i32>(0), "code": r.get::<_, String>(1), "name": r.get::<_, String>(2), "level": r.get::<_, String>(3) }))
        .collect();
    Ok(Json(json!({ "success": true, "data": data })))
}

pub async fn settings(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let rows = c.query("SELECT key, value FROM app_settings", &[]).await.map_err(internal)?;
    let mut map = serde_json::Map::new();
    for r in rows {
        map.insert(r.get::<_, String>(0), Value::String(r.get::<_, String>(1)));
    }
    Ok(Json(json!({ "success": true, "data": map })))
}
