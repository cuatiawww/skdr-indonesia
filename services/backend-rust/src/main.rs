mod case_reports;
mod db;
mod master;

use axum::{http::StatusCode, routing::get, Json, Router};
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
        .route("/api/v1/settings", get(master::settings))
        .route("/api/v1/master/diseases", get(master::diseases))
        .route("/api/v1/master/locations", get(master::locations))
        .route("/api/v1/case-reports", get(case_reports::list).post(case_reports::create))
        .route("/api/v1/dashboard/summary", get(case_reports::summary))
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
        .with_state(AppState { pool });

    let bind = std::env::var("BACKEND_BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8091".into());
    let listener = tokio::net::TcpListener::bind(&bind).await?;
    tracing::info!("skdr backend listening on {bind}");
    axum::serve(listener, app).await?;
    Ok(())
}
