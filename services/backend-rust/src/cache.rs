//! PR 016: short server-side response cache for the read-heavy dashboard/analytics GET endpoints.
//! Configured from app_settings 'api_cache' (migration 025): {"ttl_seconds": 30, "prefixes": ["/api/v1/public-dashboard", ...]}.
//! Any non-GET request (a write) clears the whole cache so edits show up immediately; EBS sync writes are bounded by the TTL.
use axum::{body::{to_bytes, Body}, extract::Request, http::{header, HeaderValue, Method, StatusCode}, middleware::Next, response::Response};
use std::{collections::HashMap, sync::{LazyLock, Mutex, RwLock}, time::{Duration, Instant}};

#[derive(Clone)]
pub struct CacheConfig { pub ttl: Duration, pub prefixes: Vec<String> }

static CONFIG: RwLock<Option<CacheConfig>> = RwLock::new(None);
static STORE: LazyLock<Mutex<HashMap<String, (Instant, Vec<u8>)>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
const MAX_ENTRIES: usize = 500;
const MAX_BODY: usize = 8 * 1024 * 1024;

pub async fn load(pool: &deadpool_postgres::Pool) {
    let cfg = async {
        let c = pool.get().await.ok()?;
        let row = c.query_opt("SELECT value FROM app_settings WHERE key = 'api_cache'", &[]).await.ok()??;
        let v: serde_json::Value = serde_json::from_str(&row.get::<_, String>(0)).ok()?;
        let ttl = v.get("ttl_seconds")?.as_u64()?;
        let prefixes = v.get("prefixes")?.as_array()?.iter().filter_map(|p| p.as_str().map(String::from)).collect();
        Some(CacheConfig { ttl: Duration::from_secs(ttl), prefixes })
    }.await;
    match &cfg {
        Some(c) => tracing::info!("api cache: ttl {}s, {} prefixes", c.ttl.as_secs(), c.prefixes.len()),
        None => tracing::info!("api cache disabled (no app_settings 'api_cache')"),
    }
    *CONFIG.write().unwrap() = cfg;
}

pub async fn layer(req: Request, next: Next) -> Response {
    if req.method() != Method::GET {
        let res = next.run(req).await;
        STORE.lock().unwrap().clear();
        return res;
    }
    let Some(cfg) = CONFIG.read().unwrap().clone() else { return next.run(req).await };
    let path = req.uri().path().to_string();
    if cfg.ttl.is_zero() || !cfg.prefixes.iter().any(|p| path.starts_with(p.as_str())) {
        return next.run(req).await;
    }
    let key = req.uri().to_string();
    if let Some((at, body)) = STORE.lock().unwrap().get(&key).cloned() {
        if at.elapsed() < cfg.ttl {
            return json_response(body, "HIT");
        }
    }
    let res = next.run(req).await;
    if res.status() != StatusCode::OK { return res; }
    let (parts, body) = res.into_parts();
    let Ok(bytes) = to_bytes(body, MAX_BODY).await else {
        return Response::from_parts(parts, Body::from(r#"{"success":false,"error":"response too large"}"#));
    };
    {
        let mut s = STORE.lock().unwrap();
        if s.len() >= MAX_ENTRIES { s.retain(|_, (at, _)| at.elapsed() < cfg.ttl); if s.len() >= MAX_ENTRIES { s.clear(); } }
        s.insert(key, (Instant::now(), bytes.to_vec()));
    }
    let mut r = Response::from_parts(parts, Body::from(bytes));
    r.headers_mut().insert("x-skdr-cache", HeaderValue::from_static("MISS"));
    r
}

fn json_response(body: Vec<u8>, state: &'static str) -> Response {
    let mut r = Response::new(Body::from(body));
    r.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static("application/json"));
    r.headers_mut().insert("x-skdr-cache", HeaderValue::from_static(state));
    r
}
