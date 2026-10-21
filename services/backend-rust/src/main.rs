mod case_reports;
mod dashboard;
mod db;
mod master;
mod master_admin;

use axum::{http::StatusCode, routing::{get, patch, put}, Json, Router};
use deadpool_postgres::Pool;
use serde_json::{json, Value};
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
pub struct AppState {
    pub pool: Pool,
}

pub type ApiError = (StatusCode, Json<Value>);

pub fn internal<E: std::fmt::Display>(e: E) -> ApiError {
    tracing::error!("internal error: {e}");
    (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "success": false, "error": "Internal server error" })))
}

pub fn bad_request(msg: &str) -> ApiError {
    (StatusCode::BAD_REQUEST, Json(json!({ "success": false, "error": msg })))
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let pool = db::build_pool()?;
    let migrations_dir = std::env::var("MIGRATIONS_DIR").unwrap_or_else(|_| "/init".into());
    db::run_migrations(&pool, &migrations_dir).await?;

    let app = Router::new()
        .route("/health", get(health))
        // settings + master data
        .route("/api/v1/console/settings", get(master::console_settings))
        .route("/api/v1/master/diseases", get(master::diseases))
        .route("/api/v1/master/provinces", get(master::provinces))
        .route("/api/v1/master/kabkota", get(master::kabkota))
        .route("/api/v1/disease-concepts", get(master::disease_concepts))
        // master data CRUD (PR 004, soft delete via status)
        .route("/api/v1/admin/master/provinces", get(master_admin::provinces_list).post(master_admin::province_create))
        .route("/api/v1/admin/master/provinces/:id", put(master_admin::province_update))
        .route("/api/v1/admin/master/provinces/:id/status", patch(master_admin::province_status))
        .route("/api/v1/admin/master/kabkota", get(master_admin::kabkota_list).post(master_admin::kabkota_create))
        .route("/api/v1/admin/master/kabkota/:id", put(master_admin::kabkota_update))
        .route("/api/v1/admin/master/kabkota/:id/status", patch(master_admin::kabkota_status))
        .route("/api/v1/admin/master/diseases", get(master_admin::diseases_list).post(master_admin::disease_create))
        .route("/api/v1/admin/master/diseases/:id", put(master_admin::disease_update))
        .route("/api/v1/admin/master/diseases/:id/status", patch(master_admin::disease_status))
        // form
        .route("/api/v1/case-reports", get(case_reports::list).post(case_reports::create))
        // main dashboard (NLP shapes, form data only)
        .route("/api/v1/public-dashboard", get(dashboard::public_dashboard))
        .route("/api/v1/kpi-snapshot", get(dashboard::kpi_snapshot))
        .route("/api/v1/crawling-stats", get(dashboard::crawling_stats))
        .route("/api/v1/crawling-stats/live", get(dashboard::crawling_stats_live))
        .route("/api/v1/crawl-history/summary", get(dashboard::crawl_history_summary))
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
        .with_state(AppState { pool });

    let bind = std::env::var("BACKEND_BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8091".into());
    let listener = tokio::net::TcpListener::bind(&bind).await?;
    tracing::info!("skdr backend listening on {bind}");
    axum::serve(listener, app).await?;
    Ok(())
}
