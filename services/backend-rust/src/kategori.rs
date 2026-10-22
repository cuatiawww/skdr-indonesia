//! PR 021: kategori penyakit (master_disease_categories + master_disease_category_map), untuk filter dasbor,
//! dasbor per kategori, dan sub-menu "Dasbor Kategori" (dibuat dari DB, bukan daftar di kode).
use axum::{extract::State, Json};
use serde_json::{json, Value};

use crate::{internal, ApiError, AppState};

pub async fn list(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let rows = c
        .query(
            "SELECT c.code, c.name, c.short_name, c.description, c.color, c.icon, c.sort_order,
                    COALESCE(jsonb_agg(jsonb_build_object('code', d.code, 'name', d.name, 'is_primary', m.is_primary) ORDER BY d.name)
                             FILTER (WHERE d.id IS NOT NULL), '[]'::jsonb)
             FROM master_disease_categories c
             LEFT JOIN master_disease_category_map m ON m.category_id = c.id
             LEFT JOIN master_diseases d ON d.id = m.disease_id AND d.is_active
             WHERE c.is_active GROUP BY c.id ORDER BY c.sort_order, c.name",
            &[],
        )
        .await
        .map_err(internal)?;
    Ok(Json(json!({ "success": true, "data": rows.iter().map(|r| json!({
        "code": r.get::<_, String>(0), "name": r.get::<_, String>(1), "short_name": r.get::<_, String>(2),
        "description": r.get::<_, Option<String>>(3), "color": r.get::<_, Option<String>>(4), "icon": r.get::<_, Option<String>>(5),
        "order": r.get::<_, i32>(6), "diseases": r.get::<_, Value>(7),
    })).collect::<Vec<_>>() })))
}

/// Replaces a disease's categories; the first code is the primary one. Unknown codes are an error.
pub async fn set_for_disease(c: &deadpool_postgres::Object, disease_id: i32, codes: &[String]) -> Result<(), ApiError> {
    let codes: Vec<String> = codes.iter().map(|x| x.trim().to_uppercase()).filter(|x| !x.is_empty()).collect();
    let found: i64 = c
        .query_one("SELECT COUNT(DISTINCT code)::bigint FROM master_disease_categories WHERE code = ANY($1)", &[&codes])
        .await
        .map_err(internal)?
        .get(0);
    let distinct = { let mut v = codes.clone(); v.sort(); v.dedup(); v.len() as i64 };
    if found != distinct {
        return Err(crate::bad_request("Kategori penyakit tidak dikenal"));
    }
    c.execute("DELETE FROM master_disease_category_map WHERE disease_id = $1", &[&disease_id]).await.map_err(internal)?;
    let primary = codes.first().cloned().unwrap_or_default();
    c.execute(
        "INSERT INTO master_disease_category_map (disease_id, category_id, is_primary)
         SELECT $1, id, code = $3 FROM master_disease_categories WHERE code = ANY($2) ON CONFLICT DO NOTHING",
        &[&disease_id, &codes, &primary],
    )
    .await
    .map_err(internal)?;
    Ok(())
}
