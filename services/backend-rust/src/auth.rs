//! PR 029: login, sessions and user access management (flow modelled on NLP-PENYAKIT/ABVC).
//! - Passwords: Argon2id (argon2 crate defaults). Session tokens: 32 random bytes, only the SHA-256 is stored.
//! - Session = HttpOnly cookie (name/path/secure from env) or `Authorization: Bearer <token>`.
//! - Idle/absolute timeouts from app_settings (session_idle_timeout_seconds / session_absolute_timeout_seconds).
//! - `guard` middleware: dashboard reads stay public; tatakelola reads/writes need a role permission;
//!   /api/v1/users and /api/v1/roles need `user_management`.
//! - First admin: env SKDR_ADMIN_USERNAME + SKDR_ADMIN_PASSWORD, created once when no admin exists.
use axum::{
    extract::{Path, Query, Request, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};
use tokio_postgres::error::SqlState;
use uuid::Uuid;

use crate::{bad_request, internal, ApiError, AppState};

// ─── permissions ────────────────────────────────────────────────────────────

/// Permission catalogue (keys stored in user_roles.permissions). "*" = everything.
pub const PERMISSIONS: &[(&str, &str, &str)] = &[
    ("dashboard_limited", "Dasbor Limited", "Spasial & Matriks Analisa (login)"),
    ("tatakelola", "Tata Kelola", "Masuk ke area Tata Kelola (CMS)"),
    ("pe_input", "Input Form PE", "Membuat dan mengubah laporan Form PE"),
    ("pe_verify", "Verifikasi Form PE", "Memverifikasi / mengembalikan / memfinalkan laporan PE"),
    ("master_data", "Master Data", "Kelola provinsi, kab/kota, penyakit, fasyankes"),
    ("integrasi", "Integrasi", "Sinkronisasi EBS, Alert SKDR, BNPB, Flight, FIRMS, Satwa Liar"),
    ("user_management", "Manajemen Akses", "Kelola pengguna dan peran"),
];

#[derive(Clone, Debug)]
pub struct AuthUser {
    pub id: Uuid,
    pub username: String,
    pub full_name: Option<String>,
    pub role: String,
    pub role_name: String,
    pub permissions: Vec<String>,
}

impl AuthUser {
    pub fn has(&self, perm: &str) -> bool {
        self.permissions.iter().any(|p| p == "*" || p == perm)
    }
    /// Role passed to the PE workflow (pe_workflow.transitions roles: petugas / verifikator / admin).
    fn pe_role(&self) -> &'static str {
        if self.permissions.iter().any(|p| p == "*") {
            "admin"
        } else if self.has("pe_verify") {
            "verifikator"
        } else {
            "petugas"
        }
    }
    fn to_json(&self) -> Value {
        json!({ "id": self.id, "username": self.username, "full_name": self.full_name, "role": self.role,
                "role_name": self.role_name, "permissions": self.permissions })
    }
}

fn perms_from(v: &Value) -> Vec<String> {
    v.as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default()
}

// ─── crypto helpers ─────────────────────────────────────────────────────────

pub fn hash_password(password: &str) -> String {
    use argon2::{
        password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
        Argon2,
    };
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default().hash_password(password.as_bytes(), &salt).expect("argon2 hash").to_string()
}

pub fn verify_password(password: &str, stored: &str) -> bool {
    use argon2::{
        password_hash::{PasswordHash, PasswordVerifier},
        Argon2,
    };
    PasswordHash::new(stored)
        .ok()
        .map(|h| Argon2::default().verify_password(password.as_bytes(), &h).is_ok())
        .unwrap_or(false)
}

fn sha256_hex(s: &str) -> String {
    hex::encode(Sha256::digest(s.as_bytes()))
}

fn new_token() -> String {
    use rand::RngCore;
    let mut b = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut b);
    hex::encode(b)
}

/// Password policy: 8..=128 characters, at least one letter and one digit.
fn check_password(p: &str) -> Result<(), ApiError> {
    let n = p.chars().count();
    if !(8..=128).contains(&n) || !p.chars().any(|c| c.is_alphabetic()) || !p.chars().any(|c| c.is_ascii_digit()) {
        return Err(bad_request("Kata sandi minimal 8 karakter dan memuat huruf serta angka"));
    }
    Ok(())
}

// ─── cookie / token ─────────────────────────────────────────────────────────

fn cookie_name() -> String {
    std::env::var("SESSION_COOKIE_NAME").ok().filter(|s| !s.trim().is_empty()).unwrap_or_else(|| "skdr_session".into())
}

fn cookie_attrs(max_age: i64) -> String {
    let path = std::env::var("SESSION_COOKIE_PATH").ok().filter(|s| s.starts_with('/')).unwrap_or_else(|| "/".into());
    let secure = matches!(std::env::var("SESSION_COOKIE_SECURE").as_deref(), Ok("true") | Ok("1"));
    format!("Path={path}; Max-Age={max_age}; HttpOnly; SameSite=Lax{}", if secure { "; Secure" } else { "" })
}

fn set_cookie(token: &str, max_age: i64) -> HeaderMap {
    let mut h = HeaderMap::new();
    if let Ok(v) = HeaderValue::from_str(&format!("{}={}; {}", cookie_name(), token, cookie_attrs(max_age))) {
        h.insert(header::SET_COOKIE, v);
    }
    h
}

fn clear_cookie() -> HeaderMap {
    set_cookie("", 0)
}

pub fn extract_token(h: &HeaderMap) -> Option<String> {
    if let Some(v) = h.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()) {
        if let Some(t) = v.strip_prefix("Bearer ") {
            let t = t.trim();
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
    }
    let name = cookie_name();
    for c in h.get_all(header::COOKIE) {
        if let Ok(s) = c.to_str() {
            for part in s.split(';') {
                if let Some((k, v)) = part.trim().split_once('=') {
                    if k == name && !v.is_empty() {
                        return Some(v.to_string());
                    }
                }
            }
        }
    }
    None
}

fn client_ip(h: &HeaderMap) -> Option<String> {
    h.get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .or_else(|| h.get("x-real-ip").and_then(|v| v.to_str().ok()))
        .map(|s| s.trim().chars().take(64).collect())
}

// ─── login rate limit (in memory, like ABVC: 8 failures / 15 min per username) ─

static LOGIN_FAILS: Mutex<Option<HashMap<String, (u32, Instant)>>> = Mutex::new(None);
const FAIL_WINDOW: Duration = Duration::from_secs(15 * 60);
const MAX_FAILS: u32 = 8;

fn login_allowed(u: &str) -> bool {
    let mut g = LOGIN_FAILS.lock().unwrap_or_else(|e| e.into_inner());
    let m = g.get_or_insert_with(HashMap::new);
    m.retain(|_, (_, t)| t.elapsed() < FAIL_WINDOW);
    m.get(u).map(|(n, _)| *n < MAX_FAILS).unwrap_or(true)
}

fn login_failed(u: &str) {
    let mut g = LOGIN_FAILS.lock().unwrap_or_else(|e| e.into_inner());
    let m = g.get_or_insert_with(HashMap::new);
    let e = m.entry(u.to_string()).or_insert((0, Instant::now()));
    if e.1.elapsed() >= FAIL_WINDOW {
        *e = (0, Instant::now());
    }
    e.0 += 1;
}

fn login_ok(u: &str) {
    if let Ok(mut g) = LOGIN_FAILS.lock() {
        if let Some(m) = g.as_mut() {
            m.remove(u);
        }
    }
}

// ─── session policy ─────────────────────────────────────────────────────────

const DEFAULT_IDLE: i64 = 8 * 3600;
const DEFAULT_ABS: i64 = 7 * 24 * 3600;

fn clamp(idle: i64, abs: i64) -> (i64, i64) {
    let abs = if abs <= 0 { DEFAULT_ABS } else { abs.clamp(300, 30 * 24 * 3600) };
    let idle = if idle <= 0 { DEFAULT_IDLE } else { idle.max(300) };
    (idle.min(abs), abs)
}

async fn policy(c: &deadpool_postgres::Object) -> (i64, i64) {
    let rows = c
        .query(
            "SELECT key, value FROM app_settings WHERE key IN ('session_idle_timeout_seconds','session_absolute_timeout_seconds')",
            &[],
        )
        .await
        .unwrap_or_default();
    let (mut idle, mut abs) = (DEFAULT_IDLE, DEFAULT_ABS);
    for r in rows {
        let (k, v): (String, String) = (r.get(0), r.get(1));
        let n = v.trim().parse::<i64>().unwrap_or(0);
        if k == "session_idle_timeout_seconds" {
            idle = n;
        } else {
            abs = n;
        }
    }
    clamp(idle, abs)
}

pub async fn audit(c: &deadpool_postgres::Object, user_id: Option<Uuid>, username: Option<&str>, action: &str, detail: Value, ip: Option<&str>) {
    let _ = c
        .execute(
            "INSERT INTO user_activity_log (user_id, username, action, detail, ip) VALUES ($1, $2, $3, $4, $5)",
            &[&user_id, &username, &action, &detail, &ip],
        )
        .await;
}

/// Resolves a session token to a user. Expired/idle sessions are deleted. Activity is bumped at most once a minute.
pub async fn resolve(s: &AppState, token: &str) -> Result<Option<AuthUser>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let th = sha256_hex(token);
    let (idle, _) = policy(&c).await;
    let row = c
        .query_opt(
            "SELECT u.id, u.username, u.full_name, u.role, r.name, r.permissions, u.is_active,
                    (s.expires_at > now()) AND (s.last_activity_at + make_interval(secs => $2::float8) > now()) AS valid,
                    s.last_activity_at < now() - interval '60 seconds' AS stale
               FROM user_sessions s JOIN users u ON u.id = s.user_id JOIN user_roles r ON r.id = u.role
              WHERE s.token_hash = $1",
            &[&th, &(idle as f64)],
        )
        .await
        .map_err(internal)?;
    let Some(r) = row else { return Ok(None) };
    let (active, valid, stale): (bool, bool, bool) = (r.get(6), r.get(7), r.get(8));
    if !active || !valid {
        let _ = c.execute("DELETE FROM user_sessions WHERE token_hash = $1", &[&th]).await;
        return Ok(None);
    }
    if stale {
        let _ = c.execute("UPDATE user_sessions SET last_activity_at = now() WHERE token_hash = $1", &[&th]).await;
    }
    Ok(Some(AuthUser {
        id: r.get(0),
        username: r.get(1),
        full_name: r.get(2),
        role: r.get(3),
        role_name: r.get(4),
        permissions: perms_from(&r.get::<_, Value>(5)),
    }))
}

// ─── route classification ───────────────────────────────────────────────────

#[derive(Debug, PartialEq)]
#[allow(dead_code)]
pub enum Need {
    Public,
    Login,
    Perm(&'static str),
}

fn under(path: &str, prefix: &str) -> bool {
    path == prefix || path.starts_with(&format!("{prefix}/"))
}

/// What a request needs. Dashboard (public) reads stay open; everything that edits data or shows
/// tatakelola-only data (PE case records, admin lists, sync status) needs a permission.
pub fn classify(method: &Method, path: &str) -> Need {
    if path == "/health" || under(path, "/api/auth") {
        return Need::Public;
    }
    if under(path, "/api/v1/users") || under(path, "/api/v1/roles") || under(path, "/api/v1/access-log") {
        return Need::Perm("user_management");
    }
    let read = *method == Method::GET || *method == Method::HEAD || *method == Method::OPTIONS;
    if read {
        if under(path, "/api/v1/admin")
            || under(path, "/api/v1/integrasi")
            || under(path, "/api/v1/pe/cases")
            || under(path, "/api/v1/pe/clusters")
            || under(path, "/api/v1/pe/ebs-search")
            || under(path, "/api/v1/case-reports")
        {
            return Need::Perm("tatakelola");
        }
        return Need::Public;
    }
    // writes
    if under(path, "/api/v1/admin/master") || under(path, "/api/v1/admin/fasyankes") {
        return Need::Perm("master_data");
    }
    if under(path, "/api/v1/admin/ebs") || under(path, "/api/v1/integrasi") {
        return Need::Perm("integrasi");
    }
    if under(path, "/api/v1/pe") || under(path, "/api/v1/case-reports") {
        return Need::Perm("pe_input");
    }
    Need::Perm("tatakelola")
}

fn deny(code: StatusCode, msg: &str, tag: &str) -> Response {
    (code, Json(json!({ "success": false, "error": msg, "code": tag }))).into_response()
}

/// Axum middleware: authenticates the caller (if a token is present), enforces `classify`, and replaces the
/// PE role hook header (`X-SKDR-Role`) with the role of the logged-in user.
pub async fn guard(State(s): State<AppState>, mut req: Request, next: Next) -> Response {
    let need = classify(req.method(), req.uri().path());
    let user = match extract_token(req.headers()) {
        Some(t) => match resolve(&s, &t).await {
            Ok(u) => u,
            Err(e) => return e.into_response(),
        },
        None => None,
    };
    req.headers_mut().remove("x-skdr-role");
    match (&need, &user) {
        (Need::Public, _) => {}
        (_, None) => return deny(StatusCode::UNAUTHORIZED, "Silakan masuk terlebih dahulu", "SESSION_REQUIRED"),
        (Need::Login, Some(_)) => {}
        (Need::Perm(p), Some(u)) => {
            if !u.has(p) {
                return deny(StatusCode::FORBIDDEN, "Akun Anda tidak memiliki akses ke fitur ini", "FORBIDDEN");
            }
        }
    }
    if let Some(u) = &user {
        req.headers_mut().insert("x-skdr-role", HeaderValue::from_static(u.pe_role()));
        req.extensions_mut().insert(u.clone());
    }
    next.run(req).await
}

// ─── bootstrap admin ────────────────────────────────────────────────────────

/// Creates the first admin from SKDR_ADMIN_USERNAME / SKDR_ADMIN_PASSWORD when no admin user exists yet.
/// Never updates an existing user and never logs the password.
pub async fn bootstrap_admin(pool: &deadpool_postgres::Pool) -> anyhow::Result<()> {
    let user = std::env::var("SKDR_ADMIN_USERNAME").unwrap_or_default().trim().to_string();
    let pass = std::env::var("SKDR_ADMIN_PASSWORD").unwrap_or_default();
    let c = pool.get().await?;
    let has_admin = c.query_opt("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1", &[]).await?.is_some();
    if has_admin {
        return Ok(());
    }
    if user.is_empty() || pass.is_empty() {
        tracing::warn!("no admin user yet: set SKDR_ADMIN_USERNAME and SKDR_ADMIN_PASSWORD in .env to create the first admin");
        return Ok(());
    }
    if check_password(&pass).is_err() {
        tracing::warn!("SKDR_ADMIN_PASSWORD does not meet the password policy (min 8 chars, letters and digits); admin not created");
        return Ok(());
    }
    let hash = tokio::task::spawn_blocking(move || hash_password(&pass)).await?;
    let full = std::env::var("SKDR_ADMIN_FULL_NAME").ok().filter(|s| !s.trim().is_empty()).unwrap_or_else(|| "Administrator".into());
    let n = c
        .execute(
            "INSERT INTO users (username, full_name, password_hash, role, created_by) VALUES ($1, $2, $3, 'admin', 'bootstrap')
             ON CONFLICT DO NOTHING",
            &[&user, &full, &hash],
        )
        .await?;
    if n > 0 {
        tracing::info!("bootstrap admin user created: {user}");
    } else {
        tracing::warn!("bootstrap admin not created: username {user} already exists with another role");
    }
    Ok(())
}

// ─── /api/auth ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct LoginBody {
    username: Option<String>,
    password: Option<String>,
}

pub async fn login(State(s): State<AppState>, headers: HeaderMap, Json(b): Json<LoginBody>) -> Result<Response, ApiError> {
    let username = b.username.unwrap_or_default().trim().to_string();
    let password = b.password.unwrap_or_default();
    if username.is_empty() || password.is_empty() {
        return Err(bad_request("Nama pengguna dan kata sandi wajib diisi"));
    }
    let key = username.to_lowercase();
    if !login_allowed(&key) {
        return Ok(deny(StatusCode::TOO_MANY_REQUESTS, "Terlalu banyak percobaan gagal. Coba lagi dalam 15 menit.", "LOGIN_LOCKED"));
    }
    let ip = client_ip(&headers);
    let c = s.pool.get().await.map_err(internal)?;
    let row = c
        .query_opt(
            "SELECT u.id, u.username, u.password_hash, u.is_active FROM users u
              WHERE lower(u.username) = lower($1) OR (u.email IS NOT NULL AND lower(u.email) = lower($1)) LIMIT 1",
            &[&username],
        )
        .await
        .map_err(internal)?;
    let fail = || deny(StatusCode::UNAUTHORIZED, "Nama pengguna atau kata sandi salah", "INVALID_CREDENTIALS");
    let Some(r) = row else {
        login_failed(&key);
        // constant-ish time: still run one hash so unknown users are not obviously faster
        let _ = tokio::task::spawn_blocking(move || hash_password(&password)).await;
        return Ok(fail());
    };
    let (uid, uname, stored, active): (Uuid, String, String, bool) = (r.get(0), r.get(1), r.get(2), r.get(3));
    let ok = tokio::task::spawn_blocking(move || verify_password(&password, &stored)).await.map_err(internal)?;
    if !ok {
        login_failed(&key);
        audit(&c, Some(uid), Some(&uname), "LOGIN_FAILED", json!({}), ip.as_deref()).await;
        return Ok(fail());
    }
    if !active {
        return Ok(deny(StatusCode::FORBIDDEN, "Akun Anda nonaktif. Hubungi administrator.", "ACCOUNT_INACTIVE"));
    }
    login_ok(&key);
    let (idle, abs) = policy(&c).await;
    let token = new_token();
    let ua: Option<String> = headers.get(header::USER_AGENT).and_then(|v| v.to_str().ok()).map(|s| s.chars().take(255).collect());
    let _ = c.execute("DELETE FROM user_sessions WHERE expires_at < now()", &[]).await;
    c.execute(
        "INSERT INTO user_sessions (token_hash, user_id, expires_at, ip, user_agent)
         VALUES ($1, $2, now() + make_interval(secs => $3::float8), $4, $5)",
        &[&sha256_hex(&token), &uid, &(abs as f64), &ip, &ua],
    )
    .await
    .map_err(internal)?;
    c.execute("UPDATE users SET last_login_at = now() WHERE id = $1", &[&uid]).await.map_err(internal)?;
    audit(&c, Some(uid), Some(&uname), "LOGIN", json!({}), ip.as_deref()).await;
    let user = resolve(&s, &token).await?.ok_or_else(|| internal("session not found after login"))?;
    let body = json!({ "success": true, "data": { "user": user.to_json(),
        "session": { "idle_timeout_seconds": idle, "absolute_timeout_seconds": abs } } });
    Ok((set_cookie(&token, abs), Json(body)).into_response())
}

pub async fn logout(State(s): State<AppState>, headers: HeaderMap) -> Result<Response, ApiError> {
    if let Some(t) = extract_token(&headers) {
        let c = s.pool.get().await.map_err(internal)?;
        let row = c
            .query_opt(
                "DELETE FROM user_sessions s USING users u WHERE s.token_hash = $1 AND u.id = s.user_id RETURNING u.id, u.username",
                &[&sha256_hex(&t)],
            )
            .await
            .map_err(internal)?;
        if let Some(r) = row {
            let (id, name): (Uuid, String) = (r.get(0), r.get(1));
            audit(&c, Some(id), Some(&name), "LOGOUT", json!({}), client_ip(&headers).as_deref()).await;
        }
    }
    Ok((clear_cookie(), Json(json!({ "success": true }))).into_response())
}

pub async fn session(State(s): State<AppState>, headers: HeaderMap) -> Result<Response, ApiError> {
    let user = match extract_token(&headers) {
        Some(t) => resolve(&s, &t).await?,
        None => None,
    };
    // Anonymous is a normal state on public pages: 200 with user = null (no console noise), stale cookie cleared.
    let Some(u) = user else {
        let body = Json(json!({ "success": true, "data": { "user": null } }));
        return Ok(if extract_token(&headers).is_some() { (clear_cookie(), body).into_response() } else { body.into_response() });
    };
    let c = s.pool.get().await.map_err(internal)?;
    let (idle, abs) = policy(&c).await;
    Ok(Json(json!({ "success": true, "data": { "user": u.to_json(),
        "session": { "idle_timeout_seconds": idle, "absolute_timeout_seconds": abs } } }))
    .into_response())
}

/// Change own password (any logged-in user).
#[derive(Deserialize)]
pub struct PasswordBody {
    current_password: Option<String>,
    new_password: Option<String>,
}

pub async fn change_password(State(s): State<AppState>, headers: HeaderMap, Json(b): Json<PasswordBody>) -> Result<Response, ApiError> {
    let Some(t) = extract_token(&headers) else {
        return Ok(deny(StatusCode::UNAUTHORIZED, "Silakan masuk terlebih dahulu", "SESSION_REQUIRED"));
    };
    let Some(u) = resolve(&s, &t).await? else {
        return Ok(deny(StatusCode::UNAUTHORIZED, "Silakan masuk terlebih dahulu", "SESSION_REQUIRED"));
    };
    let cur = b.current_password.unwrap_or_default();
    let new = b.new_password.unwrap_or_default();
    check_password(&new)?;
    let c = s.pool.get().await.map_err(internal)?;
    let stored: String = c.query_one("SELECT password_hash FROM users WHERE id = $1", &[&u.id]).await.map_err(internal)?.get(0);
    let ok = tokio::task::spawn_blocking(move || verify_password(&cur, &stored)).await.map_err(internal)?;
    if !ok {
        return Err(bad_request("Kata sandi saat ini salah"));
    }
    let hash = tokio::task::spawn_blocking(move || hash_password(&new)).await.map_err(internal)?;
    c.execute("UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1", &[&u.id, &hash]).await.map_err(internal)?;
    // end other sessions of this user, keep the current one
    c.execute("DELETE FROM user_sessions WHERE user_id = $1 AND token_hash <> $2", &[&u.id, &sha256_hex(&t)])
        .await
        .map_err(internal)?;
    audit(&c, Some(u.id), Some(&u.username), "PASSWORD_CHANGED", json!({}), client_ip(&headers).as_deref()).await;
    Ok(Json(json!({ "success": true })).into_response())
}

// ─── users CRUD (/api/v1/users, needs user_management) ──────────────────────

fn err(code: StatusCode, msg: &str) -> ApiError {
    (code, Json(json!({ "success": false, "error": msg })))
}

fn db_err(e: tokio_postgres::Error, dup: &str) -> ApiError {
    match e.code() {
        Some(c) if *c == SqlState::UNIQUE_VIOLATION => err(StatusCode::CONFLICT, dup),
        Some(c) if *c == SqlState::FOREIGN_KEY_VIOLATION => bad_request("Peran tidak ditemukan"),
        _ => internal(e),
    }
}

fn actor(req_user: &Option<axum::Extension<AuthUser>>) -> Result<AuthUser, ApiError> {
    req_user.as_ref().map(|e| e.0.clone()).ok_or_else(|| err(StatusCode::UNAUTHORIZED, "Silakan masuk terlebih dahulu"))
}

fn opt(s: &Option<String>) -> Option<String> {
    s.as_ref().map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

fn valid_username(u: &str) -> bool {
    (3..=50).contains(&u.len()) && u.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

fn valid_email(e: &str) -> bool {
    e.len() <= 120 && e.contains('@') && e.contains('.') && !e.contains(' ')
}

#[derive(Deserialize)]
pub struct UserQuery {
    search: Option<String>,
    status: Option<String>,
    role: Option<String>,
    page: Option<i64>,
    per_page: Option<i64>,
}

const USER_COLS: &str = "u.id, u.username, u.full_name, u.email, u.role, r.name, u.is_active, u.last_login_at::text, u.created_at::text, u.created_by";

fn user_row(r: &tokio_postgres::Row) -> Value {
    json!({ "id": r.get::<_, Uuid>(0), "username": r.get::<_, String>(1), "full_name": r.get::<_, Option<String>>(2),
            "email": r.get::<_, Option<String>>(3), "role": r.get::<_, String>(4), "role_name": r.get::<_, String>(5),
            "is_active": r.get::<_, bool>(6), "last_login_at": r.get::<_, Option<String>>(7),
            "created_at": r.get::<_, String>(8), "created_by": r.get::<_, Option<String>>(9) })
}

pub async fn users_list(State(s): State<AppState>, Query(q): Query<UserQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let per_page = q.per_page.unwrap_or(20).clamp(1, 200);
    let page = q.page.unwrap_or(1).max(1);
    let search = opt(&q.search).map(|s| format!("%{s}%"));
    let status: Option<bool> = match q.status.as_deref() {
        Some("active") => Some(true),
        Some("inactive") => Some(false),
        _ => None,
    };
    let role = opt(&q.role);
    let filter = "($1::text IS NULL OR u.username ILIKE $1 OR u.full_name ILIKE $1 OR u.email ILIKE $1)
                  AND ($2::bool IS NULL OR u.is_active = $2) AND ($3::text IS NULL OR u.role = $3)";
    let total: i64 = c
        .query_one(&format!("SELECT count(*) FROM users u WHERE {filter}"), &[&search, &status, &role])
        .await
        .map_err(internal)?
        .get(0);
    let rows = c
        .query(
            &format!(
                "SELECT {USER_COLS} FROM users u JOIN user_roles r ON r.id = u.role WHERE {filter}
                 ORDER BY u.is_active DESC, lower(u.username) LIMIT $4 OFFSET $5"
            ),
            &[&search, &status, &role, &per_page, &((page - 1) * per_page)],
        )
        .await
        .map_err(internal)?;
    let pages = ((total + per_page - 1) / per_page).max(1);
    Ok(Json(json!({ "success": true, "data": rows.iter().map(user_row).collect::<Vec<_>>(), "total": total,
                    "page": page, "per_page": per_page, "total_pages": pages })))
}

#[derive(Deserialize)]
pub struct UserBody {
    username: Option<String>,
    full_name: Option<String>,
    email: Option<String>,
    role: Option<String>,
    password: Option<String>,
    is_active: Option<bool>,
}

async fn get_user(c: &deadpool_postgres::Object, id: Uuid) -> Result<Value, ApiError> {
    let r = c
        .query_opt(&format!("SELECT {USER_COLS} FROM users u JOIN user_roles r ON r.id = u.role WHERE u.id = $1"), &[&id])
        .await
        .map_err(internal)?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Pengguna tidak ditemukan"))?;
    Ok(user_row(&r))
}

/// True when `id` is the only active user whose role grants user_management (or "*").
async fn is_last_manager(c: &deadpool_postgres::Object, id: Uuid) -> Result<bool, ApiError> {
    let n: i64 = c
        .query_one(
            "SELECT count(*) FROM users u JOIN user_roles r ON r.id = u.role
              WHERE u.is_active AND u.id <> $1 AND (r.permissions ? '*' OR r.permissions ? 'user_management')",
            &[&id],
        )
        .await
        .map_err(internal)?
        .get(0);
    Ok(n == 0)
}

async fn role_manages(c: &deadpool_postgres::Object, role: &str) -> Result<bool, ApiError> {
    Ok(c
        .query_opt("SELECT 1 FROM user_roles WHERE id = $1 AND (permissions ? '*' OR permissions ? 'user_management')", &[&role])
        .await
        .map_err(internal)?
        .is_some())
}

pub async fn user_create(
    State(s): State<AppState>,
    me: Option<axum::Extension<AuthUser>>,
    headers: HeaderMap,
    Json(b): Json<UserBody>,
) -> Result<Json<Value>, ApiError> {
    let me = actor(&me)?;
    let username = opt(&b.username).ok_or_else(|| bad_request("Nama pengguna wajib diisi"))?;
    if !valid_username(&username) {
        return Err(bad_request("Nama pengguna 3–50 karakter: huruf, angka, titik, garis bawah, atau tanda hubung"));
    }
    let email = opt(&b.email);
    if email.as_deref().map(|e| !valid_email(e)).unwrap_or(false) {
        return Err(bad_request("Format email tidak valid"));
    }
    let role = opt(&b.role).ok_or_else(|| bad_request("Peran wajib dipilih"))?;
    let password = b.password.unwrap_or_default();
    check_password(&password)?;
    let hash = tokio::task::spawn_blocking(move || hash_password(&password)).await.map_err(internal)?;
    let c = s.pool.get().await.map_err(internal)?;
    let id: Uuid = c
        .query_one(
            "INSERT INTO users (username, full_name, email, password_hash, role, is_active, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
            &[&username, &opt(&b.full_name), &email, &hash, &role, &b.is_active.unwrap_or(true), &me.username],
        )
        .await
        .map_err(|e| db_err(e, "Nama pengguna atau email sudah dipakai"))?
        .get(0);
    audit(&c, Some(me.id), Some(&me.username), "USER_CREATED", json!({ "target": username, "role": role }), client_ip(&headers).as_deref()).await;
    Ok(Json(json!({ "success": true, "data": get_user(&c, id).await? })))
}

pub async fn user_update(
    State(s): State<AppState>,
    me: Option<axum::Extension<AuthUser>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(b): Json<UserBody>,
) -> Result<Json<Value>, ApiError> {
    let me = actor(&me)?;
    let c = s.pool.get().await.map_err(internal)?;
    let cur = get_user(&c, id).await?;
    let role = opt(&b.role).unwrap_or_else(|| cur["role"].as_str().unwrap_or_default().to_string());
    let active = b.is_active.unwrap_or(cur["is_active"].as_bool().unwrap_or(true));
    let email = opt(&b.email);
    if email.as_deref().map(|e| !valid_email(e)).unwrap_or(false) {
        return Err(bad_request("Format email tidak valid"));
    }
    let losing_manage = !active || !role_manages(&c, &role).await?;
    if losing_manage && role_manages(&c, cur["role"].as_str().unwrap_or_default()).await? && is_last_manager(&c, id).await? {
        return Err(bad_request("Harus ada minimal satu pengguna aktif yang dapat mengelola akses"));
    }
    if id == me.id && !active {
        return Err(bad_request("Anda tidak dapat menonaktifkan akun sendiri"));
    }
    let new_hash = match b.password.as_deref().filter(|p| !p.is_empty()) {
        Some(p) => {
            check_password(p)?;
            let p = p.to_string();
            Some(tokio::task::spawn_blocking(move || hash_password(&p)).await.map_err(internal)?)
        }
        None => None,
    };
    c.execute(
        "UPDATE users SET full_name = $2, email = $3, role = $4, is_active = $5,
                password_hash = COALESCE($6, password_hash), updated_at = now() WHERE id = $1",
        &[&id, &opt(&b.full_name), &email, &role, &active, &new_hash],
    )
    .await
    .map_err(|e| db_err(e, "Email sudah dipakai pengguna lain"))?;
    if !active || new_hash.is_some() || role != cur["role"].as_str().unwrap_or_default() {
        c.execute("DELETE FROM user_sessions WHERE user_id = $1", &[&id]).await.map_err(internal)?;
    }
    audit(
        &c,
        Some(me.id),
        Some(&me.username),
        "USER_UPDATED",
        json!({ "target": cur["username"], "role": role, "is_active": active, "password_reset": new_hash.is_some() }),
        client_ip(&headers).as_deref(),
    )
    .await;
    Ok(Json(json!({ "success": true, "data": get_user(&c, id).await? })))
}

#[derive(Deserialize)]
pub struct StatusBody {
    is_active: bool,
}

pub async fn user_status(
    State(s): State<AppState>,
    me: Option<axum::Extension<AuthUser>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(b): Json<StatusBody>,
) -> Result<Json<Value>, ApiError> {
    let me = actor(&me)?;
    let c = s.pool.get().await.map_err(internal)?;
    let cur = get_user(&c, id).await?;
    if !b.is_active {
        if id == me.id {
            return Err(bad_request("Anda tidak dapat menonaktifkan akun sendiri"));
        }
        if role_manages(&c, cur["role"].as_str().unwrap_or_default()).await? && is_last_manager(&c, id).await? {
            return Err(bad_request("Harus ada minimal satu pengguna aktif yang dapat mengelola akses"));
        }
    }
    c.execute("UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1", &[&id, &b.is_active]).await.map_err(internal)?;
    if !b.is_active {
        c.execute("DELETE FROM user_sessions WHERE user_id = $1", &[&id]).await.map_err(internal)?;
    }
    audit(&c, Some(me.id), Some(&me.username), if b.is_active { "USER_ACTIVATED" } else { "USER_DEACTIVATED" },
        json!({ "target": cur["username"] }), client_ip(&headers).as_deref()).await;
    Ok(Json(json!({ "success": true, "data": get_user(&c, id).await? })))
}

// ─── roles (/api/v1/roles, needs user_management) ───────────────────────────

fn role_row(r: &tokio_postgres::Row) -> Value {
    json!({ "id": r.get::<_, String>(0), "name": r.get::<_, String>(1), "description": r.get::<_, Option<String>>(2),
            "permissions": r.get::<_, Value>(3), "is_system": r.get::<_, bool>(4), "user_count": r.get::<_, i64>(5) })
}

const ROLE_SQL: &str = "SELECT r.id, r.name, r.description, r.permissions, r.is_system,
       (SELECT count(*) FROM users u WHERE u.role = r.id) FROM user_roles r";

pub async fn roles_list(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let rows = c.query(&format!("{ROLE_SQL} ORDER BY r.is_system DESC, r.name"), &[]).await.map_err(internal)?;
    let catalog: Vec<Value> = PERMISSIONS.iter().map(|(k, l, d)| json!({ "key": k, "label": l, "description": d })).collect();
    Ok(Json(json!({ "success": true, "data": rows.iter().map(role_row).collect::<Vec<_>>(), "permissions": catalog })))
}

#[derive(Deserialize)]
pub struct RoleBody {
    id: Option<String>,
    name: Option<String>,
    description: Option<String>,
    permissions: Option<Vec<String>>,
}

fn clean_perms(p: Option<Vec<String>>) -> Result<Value, ApiError> {
    let mut out: Vec<String> = Vec::new();
    for k in p.unwrap_or_default() {
        if !PERMISSIONS.iter().any(|(key, _, _)| *key == k) {
            return Err(bad_request(&format!("Hak akses tidak dikenal: {k}")));
        }
        if !out.contains(&k) {
            out.push(k);
        }
    }
    // tatakelola sub-permissions imply access to the tatakelola area
    if out.iter().any(|k| matches!(k.as_str(), "pe_input" | "pe_verify" | "master_data" | "integrasi" | "user_management"))
        && !out.iter().any(|k| k == "tatakelola")
    {
        out.push("tatakelola".into());
    }
    Ok(json!(out))
}

pub async fn role_create(
    State(s): State<AppState>,
    me: Option<axum::Extension<AuthUser>>,
    headers: HeaderMap,
    Json(b): Json<RoleBody>,
) -> Result<Json<Value>, ApiError> {
    let me = actor(&me)?;
    let id = opt(&b.id).map(|s| s.to_lowercase()).ok_or_else(|| bad_request("Kode peran wajib diisi"))?;
    if !(2..=40).contains(&id.len()) || !id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_') {
        return Err(bad_request("Kode peran 2–40 karakter: huruf kecil, angka, atau garis bawah"));
    }
    let name = opt(&b.name).ok_or_else(|| bad_request("Nama peran wajib diisi"))?;
    let perms = clean_perms(b.permissions)?;
    let c = s.pool.get().await.map_err(internal)?;
    c.execute(
        "INSERT INTO user_roles (id, name, description, permissions, is_system) VALUES ($1, $2, $3, $4, FALSE)",
        &[&id, &name, &opt(&b.description), &perms],
    )
    .await
    .map_err(|e| db_err(e, "Kode peran sudah dipakai"))?;
    audit(&c, Some(me.id), Some(&me.username), "ROLE_CREATED", json!({ "role": id, "permissions": perms }), client_ip(&headers).as_deref()).await;
    let r = c.query_one(&format!("{ROLE_SQL} WHERE r.id = $1"), &[&id]).await.map_err(internal)?;
    Ok(Json(json!({ "success": true, "data": role_row(&r) })))
}

pub async fn role_update(
    State(s): State<AppState>,
    me: Option<axum::Extension<AuthUser>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(b): Json<RoleBody>,
) -> Result<Json<Value>, ApiError> {
    let me = actor(&me)?;
    if id == "admin" {
        return Err(bad_request("Peran Administrator tidak dapat diubah"));
    }
    let c = s.pool.get().await.map_err(internal)?;
    let exists = c.query_opt("SELECT 1 FROM user_roles WHERE id = $1", &[&id]).await.map_err(internal)?.is_some();
    if !exists {
        return Err(err(StatusCode::NOT_FOUND, "Peran tidak ditemukan"));
    }
    let name = opt(&b.name).ok_or_else(|| bad_request("Nama peran wajib diisi"))?;
    let perms = clean_perms(b.permissions)?;
    let drops_manage = !perms.as_array().map(|a| a.iter().any(|p| p == "user_management")).unwrap_or(false);
    if drops_manage && role_manages(&c, &id).await? {
        let others: i64 = c
            .query_one(
                "SELECT count(*) FROM users u JOIN user_roles r ON r.id = u.role
                  WHERE u.is_active AND r.id <> $1 AND (r.permissions ? '*' OR r.permissions ? 'user_management')",
                &[&id],
            )
            .await
            .map_err(internal)?
            .get(0);
        if others == 0 {
            return Err(bad_request("Harus ada minimal satu pengguna aktif yang dapat mengelola akses"));
        }
    }
    c.execute(
        "UPDATE user_roles SET name = $2, description = $3, permissions = $4, updated_at = now() WHERE id = $1",
        &[&id, &name, &opt(&b.description), &perms],
    )
    .await
    .map_err(internal)?;
    audit(&c, Some(me.id), Some(&me.username), "ROLE_UPDATED", json!({ "role": id, "permissions": perms }), client_ip(&headers).as_deref()).await;
    let r = c.query_one(&format!("{ROLE_SQL} WHERE r.id = $1"), &[&id]).await.map_err(internal)?;
    Ok(Json(json!({ "success": true, "data": role_row(&r) })))
}

pub async fn role_delete(
    State(s): State<AppState>,
    me: Option<axum::Extension<AuthUser>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let me = actor(&me)?;
    let c = s.pool.get().await.map_err(internal)?;
    let r = c
        .query_opt(&format!("{ROLE_SQL} WHERE r.id = $1"), &[&id])
        .await
        .map_err(internal)?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Peran tidak ditemukan"))?;
    if r.get::<_, bool>(4) {
        return Err(bad_request("Peran bawaan sistem tidak dapat dihapus"));
    }
    if r.get::<_, i64>(5) > 0 {
        return Err(bad_request("Peran masih dipakai pengguna; pindahkan pengguna ke peran lain dulu"));
    }
    c.execute("DELETE FROM user_roles WHERE id = $1", &[&id]).await.map_err(internal)?;
    audit(&c, Some(me.id), Some(&me.username), "ROLE_DELETED", json!({ "role": id }), client_ip(&headers).as_deref()).await;
    Ok(Json(json!({ "success": true })))
}

/// Latest access log rows (login/logout/user changes), newest first.
#[derive(Deserialize)]
pub struct LogQuery {
    limit: Option<i64>,
}

pub async fn access_log(State(s): State<AppState>, Query(q): Query<LogQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let rows = c
        .query(
            "SELECT id, username, action, detail, ip, created_at::text FROM user_activity_log ORDER BY id DESC LIMIT $1",
            &[&q.limit.unwrap_or(100).clamp(1, 500)],
        )
        .await
        .map_err(internal)?;
    let data: Vec<Value> = rows
        .iter()
        .map(|r| json!({ "id": r.get::<_, i64>(0), "username": r.get::<_, Option<String>>(1), "action": r.get::<_, String>(2),
                         "detail": r.get::<_, Value>(3), "ip": r.get::<_, Option<String>>(4), "created_at": r.get::<_, String>(5) }))
        .collect();
    Ok(Json(json!({ "success": true, "data": data })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn argon2_round_trip() {
        let h = hash_password("Rahasia123");
        assert!(h.starts_with("$argon2"));
        assert!(verify_password("Rahasia123", &h));
        assert!(!verify_password("salah123", &h));
        assert!(!verify_password("x", "not-a-hash"));
    }

    #[test]
    fn password_policy() {
        assert!(check_password("abc12345").is_ok());
        assert!(check_password("short1").is_err());
        assert!(check_password("onlyletters").is_err());
        assert!(check_password("12345678").is_err());
    }

    #[test]
    fn classify_routes() {
        let g = Method::GET;
        let p = Method::POST;
        assert_eq!(classify(&g, "/api/v1/public-dashboard"), Need::Public);
        assert_eq!(classify(&g, "/api/v1/pe/forms"), Need::Public);
        assert_eq!(classify(&g, "/api/v1/signals/pe-deaths"), Need::Public);
        assert_eq!(classify(&p, "/api/auth/login"), Need::Public);
        assert_eq!(classify(&g, "/api/v1/pe/cases"), Need::Perm("tatakelola"));
        assert_eq!(classify(&g, "/api/v1/admin/master/provinces"), Need::Perm("tatakelola"));
        assert_eq!(classify(&g, "/api/v1/integrasi/bnpb/status"), Need::Perm("tatakelola"));
        assert_eq!(classify(&p, "/api/v1/pe/cases"), Need::Perm("pe_input"));
        assert_eq!(classify(&Method::PUT, "/api/v1/admin/master/diseases/3"), Need::Perm("master_data"));
        assert_eq!(classify(&p, "/api/v1/admin/ebs/sync"), Need::Perm("integrasi"));
        assert_eq!(classify(&p, "/api/v1/integrasi/firms/sync"), Need::Perm("integrasi"));
        assert_eq!(classify(&g, "/api/v1/users"), Need::Perm("user_management"));
        assert_eq!(classify(&p, "/api/v1/roles"), Need::Perm("user_management"));
        assert_eq!(classify(&p, "/api/v1/anything-else"), Need::Perm("tatakelola"));
        assert_eq!(classify(&g, "/api/v1/usersx"), Need::Public);
    }

    #[test]
    fn perms_and_pe_role() {
        let mut u = AuthUser { id: Uuid::nil(), username: "a".into(), full_name: None, role: "x".into(), role_name: "X".into(), permissions: vec!["*".into()] };
        assert!(u.has("user_management"));
        assert_eq!(u.pe_role(), "admin");
        u.permissions = vec!["tatakelola".into(), "pe_verify".into()];
        assert_eq!(u.pe_role(), "verifikator");
        assert!(!u.has("master_data"));
        u.permissions = vec!["tatakelola".into(), "pe_input".into()];
        assert_eq!(u.pe_role(), "petugas");
    }

    #[test]
    fn clean_perms_adds_tatakelola() {
        let v = clean_perms(Some(vec!["pe_input".into()])).unwrap();
        assert!(v.as_array().unwrap().iter().any(|x| x == "tatakelola"));
        assert!(clean_perms(Some(vec!["hack".into()])).is_err());
        let v = clean_perms(Some(vec!["dashboard_limited".into()])).unwrap();
        assert_eq!(v.as_array().unwrap().len(), 1);
    }

    #[test]
    fn session_clamp() {
        assert_eq!(clamp(0, 0), (DEFAULT_IDLE, DEFAULT_ABS));
        assert_eq!(clamp(10, 100), (300, 300));
        assert_eq!(clamp(9999999, 3600), (3600, 3600));
    }
}
