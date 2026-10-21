mod case_reports;
mod dashboard;
mod db;
mod ebs;
mod exec_dash;
mod master;
mod master_admin;
mod pe;
mod pe_engine;

use axum::{http::StatusCode, routing::{get, patch, post, put}, Json, Router};
use deadpool_postgres::Pool;
use serde_json::{json, Value};
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
pub struct AppState {
    pub pool: Pool,
    pub ebs_running: std::sync::Arc<std::sync::atomic::AtomicBool>,
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
    let ebs_running = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    ebs::spawn_scheduler(pool.clone(), ebs_running.clone());

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
        // EBS sync (PR 005)
        .route("/api/v1/admin/ebs/status", get(ebs::status))
        .route("/api/v1/admin/ebs/sync", post(ebs::sync_now))
        .route("/api/v1/admin/ebs/diagnosa", get(ebs::diagnosa_list))
        .route("/api/v1/admin/ebs/diagnosa/:id", put(ebs::diagnosa_map))
        // PE forms (PR 006+): shared engine, config-driven schemas
        .route("/api/v1/pe/forms", get(pe::forms))
        .route("/api/v1/pe/forms/:key", get(pe::form))
        .route("/api/v1/pe/cases", get(pe::cases).post(pe::case_create))
        .route("/api/v1/pe/cases/:id", get(pe::case_get).put(pe::case_update).delete(pe::case_delete))
        .route("/api/v1/pe/cases/:id/status", post(pe::case_status))
        .route("/api/v1/pe/cases/:id/classification", put(pe::case_classification))
        .route("/api/v1/pe/clusters", get(pe::clusters).post(pe::cluster_create))
        .route("/api/v1/pe/clusters/:id", put(pe::cluster_update))
        .route("/api/v1/pe/ebs-search", get(pe::ebs_search))
        // form
        .route("/api/v1/case-reports", get(case_reports::list).post(case_reports::create))
        // main dashboard (NLP shapes, form data only)
        .route("/api/v1/public-dashboard", get(dashboard::public_dashboard))
        .route("/api/v1/kpi-snapshot", get(dashboard::kpi_snapshot))
        .route("/api/v1/dashboard/executive", get(exec_dash::executive))
        .route("/api/v1/crawling-stats", get(dashboard::crawling_stats))
        .route("/api/v1/crawling-stats/live", get(dashboard::crawling_stats_live))
        .route("/api/v1/crawl-history/summary", get(dashboard::crawl_history_summary))
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
        .with_state(AppState { pool, ebs_running });

    let bind = std::env::var("BACKEND_BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8091".into());
    let listener = tokio::net::TcpListener::bind(&bind).await?;
    tracing::info!("skdr backend listening on {bind}");
    axum::serve(listener, app).await?;
    Ok(())
}
