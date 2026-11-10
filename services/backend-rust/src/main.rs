mod auth;
mod cache;
mod case_reports;
mod signals;
mod privacy;
mod fasyankes;
mod nar;
mod dashboard;
mod db;
mod ebs;
mod exec_dash;
mod analytics;
mod master;
mod master_admin;
mod pe;
mod pe_engine;
mod laporan;
mod pengawasan_gizi;
mod keracunan_mbg;
mod external_sync;
mod alert;
mod kategori;
mod lab_klaster;
mod dash_alert;
mod ebs_dash;
mod impor_lama;
mod dasbor_ebs_ibs;
mod dasbor_mbg;

use axum::{http::StatusCode, routing::{delete, get, patch, post, put}, Json, Router};
use deadpool_postgres::Pool;
use serde_json::{json, Value};
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
pub struct AppState {
    pub pool: Pool,
    pub ebs_running: std::sync::Arc<std::sync::atomic::AtomicBool>,
    /// PR 021: Alert SKDR sync running flag.
    pub alert_running: std::sync::Arc<std::sync::atomic::AtomicBool>,
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
    // PR 029: first admin is seeded by migration 052 (must change the default password on first login).
    cache::load(&pool).await;
    let ebs_running = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    ebs::spawn_scheduler(pool.clone(), ebs_running.clone());
    let alert_running = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    alert::spawn_scheduler(pool.clone(), alert_running.clone());
    impor_lama::spawn_scheduler(pool.clone());

    let state = AppState { pool, ebs_running, alert_running };
    let app = Router::new()
        .route("/health", get(health))
        // PR 029: login/session + user access management (users, roles, access log)
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/logout", post(auth::logout))
        .route("/api/auth/session", get(auth::session))
        .route("/api/auth/password", post(auth::change_password))
        .route("/api/v1/users", get(auth::users_list).post(auth::user_create))
        .route("/api/v1/users/:id", put(auth::user_update))
        .route("/api/v1/users/:id/status", patch(auth::user_status))
        .route("/api/v1/roles", get(auth::roles_list).post(auth::role_create))
        .route("/api/v1/roles/:id", put(auth::role_update).delete(auth::role_delete))
        .route("/api/v1/access-log", get(auth::access_log))
        // settings + master data
        .route("/api/v1/console/settings", get(master::console_settings))
        .route("/api/v1/master/diseases", get(master::diseases))
        // PR 021: kategori penyakit, Laboratorium, Klaster, Alert SKDR
        .route("/api/v1/master/disease-categories", get(kategori::list))
        .route("/api/v1/laboratorium", get(lab_klaster::laboratorium))
        .route("/api/v1/klaster", get(lab_klaster::klaster))
        .route("/api/v1/epicurve", get(dash_alert::epicurve))
        .route("/api/v1/alert-skdr", get(dash_alert::alert_skdr))
        .route("/api/v1/dashboard/sections", get(dash_alert::sections))
        .route("/api/v1/ebs-analitik", get(ebs_dash::analitik))
        .route("/api/v1/ebs-wilayah", get(ebs_dash::wilayah))
        // PR 035: Dasbor SKDR EBS & IBS (dari transaksi Form Laporan EBS, Entri Data Agregat & Form Individu IBS)
        .route("/api/v1/dasbor/ebs-ibs/ebs", get(dasbor_ebs_ibs::ebs))
        .route("/api/v1/dasbor/ebs-ibs/ibs", get(dasbor_ebs_ibs::ibs))
        // PR 036: Dasbor MBG (dari transaksi Pengawasan Gizi MBG & Keracunan Pangan MBG)
        .route("/api/v1/dasbor/mbg/pengawasan-gizi", get(dasbor_mbg::pengawasan_gizi))
        .route("/api/v1/dasbor/mbg/keracunan", get(dasbor_mbg::keracunan))
        .route("/api/v1/integrasi/alert-skdr/status", get(alert::status))
        .route("/api/v1/integrasi/alert-skdr/sync", post(alert::sync_now))
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
        // PR 030: Laporan EBS / IBS (wizard input, draf, kirim, lampiran)
        .route("/api/v1/laporan-ref/opsi", get(laporan::opsi))
        .route("/api/v1/laporan-ref/kecamatan", get(laporan::kecamatan))
        .route("/api/v1/laporan-ref/unit", get(laporan::unit))
        .route("/api/v1/laporan-ref/prefill", get(laporan::prefill))
        .route("/api/v1/laporan-ref/duplikat/:jenis", get(laporan::duplikat))
        .route("/api/v1/laporan/:jenis", get(laporan::list).post(laporan::create))
        .route("/api/v1/laporan/:jenis/:id", get(laporan::get_one).put(laporan::update).delete(laporan::remove))
        .route("/api/v1/laporan/:jenis/:id/kirim", post(laporan::kirim))
        .route("/api/v1/laporan/:jenis/:id/lampiran", post(laporan::lampiran_upload).layer(axum::extract::DefaultBodyLimit::max(laporan::MAX_LAMPIRAN + 64 * 1024)))
        .route("/api/v1/laporan/:jenis/:id/lampiran/:lid", get(laporan::lampiran_get).delete(laporan::lampiran_delete))
        // PR 033: Pengawasan Gizi MBG (kunjungan + Formulir 1–13, draf, kirim, lampiran)
        .route("/api/v1/pengawasan-gizi-ref/prefill", get(pengawasan_gizi::prefill))
        .route("/api/v1/pengawasan-gizi", get(pengawasan_gizi::list).post(pengawasan_gizi::create))
        .route("/api/v1/pengawasan-gizi/:id", get(pengawasan_gizi::get_one).put(pengawasan_gizi::update).delete(pengawasan_gizi::remove))
        .route("/api/v1/pengawasan-gizi/:id/kirim", post(pengawasan_gizi::kirim))
        .route("/api/v1/pengawasan-gizi/:id/form/:no", get(pengawasan_gizi::form_get).put(pengawasan_gizi::form_save))
        .route("/api/v1/pengawasan-gizi/:id/form/:no/kirim", post(pengawasan_gizi::form_kirim))
        .route("/api/v1/pengawasan-gizi/:id/form/:no/buka", post(pengawasan_gizi::form_buka))
        .route("/api/v1/pengawasan-gizi/:id/lampiran", post(pengawasan_gizi::lampiran_upload).layer(axum::extract::DefaultBodyLimit::max(laporan::MAX_LAMPIRAN + 64 * 1024)))
        .route("/api/v1/pengawasan-gizi/:id/lampiran/:lid", get(pengawasan_gizi::lampiran_get).delete(pengawasan_gizi::lampiran_delete))
        // PR 034: Keracunan Pangan MBG
        .route("/api/v1/keracunan-mbg-ref/prefill", get(keracunan_mbg::prefill))
        .route("/api/v1/keracunan-mbg-ref/sppg", get(keracunan_mbg::sppg))
        .route("/api/v1/keracunan-mbg", get(keracunan_mbg::list).post(keracunan_mbg::create))
        .route("/api/v1/keracunan-mbg/export", get(keracunan_mbg::export))
        .route("/api/v1/keracunan-mbg/:id", get(keracunan_mbg::get_one).put(keracunan_mbg::update).delete(keracunan_mbg::remove))
        .route("/api/v1/keracunan-mbg/:id/kirim", post(keracunan_mbg::kirim))
        .route("/api/v1/keracunan-mbg/:id/tutup", post(keracunan_mbg::tutup))
        .route("/api/v1/keracunan-mbg/:id/buka", post(keracunan_mbg::buka))
        .route("/api/v1/keracunan-mbg/:id/harian", post(keracunan_mbg::harian))
        .route("/api/v1/keracunan-mbg/:id/harian/:uid", delete(keracunan_mbg::harian_delete))
        .route("/api/v1/keracunan-mbg/:id/lampiran", post(keracunan_mbg::lampiran_upload).layer(axum::extract::DefaultBodyLimit::max(laporan::MAX_LAMPIRAN + 64 * 1024)))
        .route("/api/v1/keracunan-mbg/:id/lampiran/:lid", get(keracunan_mbg::lampiran_get).delete(keracunan_mbg::lampiran_delete))
        // form
        .route("/api/v1/case-reports", get(case_reports::list).post(case_reports::create))
        // main dashboard (NLP shapes, form data only)
        .route("/api/v1/public-dashboard", get(dashboard::public_dashboard))
        .route("/api/v1/kpi-snapshot", get(dashboard::kpi_snapshot))
        .route("/api/v1/dashboard/executive", get(exec_dash::executive))
        .route("/api/v1/analytics/overview", get(analytics::overview))
        .route("/api/v1/analytics/summary", get(analytics::summary))
        .route("/api/v1/analytics/latest", get(analytics::latest))
        .route("/api/v1/analytics/home", get(analytics::home))
        .route("/api/v1/analytics/diseases", get(analytics::diseases))
        .route("/api/v1/analytics/diseases/:code", get(analytics::disease))
        // PR 018: one detail endpoint for the signal modal (EBS or PE)
        .route("/api/v1/signals/pe-deaths", get(signals::pe_deaths))
        .route("/api/v1/signals/:source/:id", get(signals::detail))
        .route("/api/v1/nar/summary", get(nar::summary))
        .route("/api/v1/master/fasyankes", get(fasyankes::list))
        .route("/api/v1/filters/units", get(fasyankes::units))
        .route("/api/v1/admin/fasyankes/status", get(fasyankes::status))
        .route("/api/v1/admin/fasyankes/sync", post(fasyankes::sync_now))
        .route("/api/v1/crawling-stats", get(dashboard::crawling_stats))
        .route("/api/v1/crawling-stats/live", get(dashboard::crawling_stats_live))
        .route("/api/v1/crawl-history/summary", get(dashboard::crawl_history_summary))
        // PR 019: External map layers & integration sync (BNPB, Flight Connect, NASA FIRMS, Satwa Liar)
        .route("/api/v1/map-layers/flight-airports", get(external_sync::map_flight_airports))
        .route("/api/v1/map-layers/flight-routes", get(external_sync::map_flight_routes))
        .route("/api/v1/map-layers/flights", get(external_sync::map_flights))
        .route("/api/v1/map-layers/fires", get(external_sync::map_fires))
        .route("/api/v1/map-layers/wildlife", get(external_sync::map_wildlife))
        .route("/api/v1/map-layers/hazards", get(external_sync::map_hazards))
        .route("/api/v1/map-layers/vectors", get(external_sync::map_vectors))
        .route("/api/v1/integrasi/bnpb/status", get(external_sync::bnpb_status))
        .route("/api/v1/integrasi/bnpb/sync", post(external_sync::bnpb_sync))
        .route("/api/v1/integrasi/flight/status", get(external_sync::flight_status))
        .route("/api/v1/integrasi/flight/sync", post(external_sync::flight_sync))
        .route("/api/v1/integrasi/firms/status", get(external_sync::firms_status))
        .route("/api/v1/integrasi/firms/sync", post(external_sync::firms_sync))
        .route("/api/v1/integrasi/satwa-liar/status", get(external_sync::wildlife_status))
        .route("/api/v1/integrasi/satwa-liar/sync", post(external_sync::wildlife_sync))
        // PR 016: short response cache for dashboard/analytics reads (config: app_settings 'api_cache').
        .layer(axum::middleware::from_fn(cache::layer))
        // PR 029: auth guard runs before the response cache (public dashboard reads stay open, see auth::classify).
        .layer(axum::middleware::from_fn_with_state(state.clone(), auth::guard))
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
        .with_state(state);

    let bind = std::env::var("BACKEND_BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8091".into());
    let listener = tokio::net::TcpListener::bind(&bind).await?;
    tracing::info!("skdr backend listening on {bind}");
    axum::serve(listener, app).await?;
    Ok(())
}
