use anyhow::Context;
use deadpool_postgres::{Config, ManagerConfig, Pool, RecyclingMethod, Runtime};
use tokio_postgres::NoTls;

fn env_req(key: &str) -> anyhow::Result<String> {
    std::env::var(key).with_context(|| format!("missing env var {key}"))
}

pub fn build_pool() -> anyhow::Result<Pool> {
    let mut cfg = Config::new();
    cfg.host = Some(env_req("DB_HOST")?);
    cfg.port = Some(env_req("DB_PORT")?.parse().context("DB_PORT must be a number")?);
    cfg.user = Some(env_req("DB_USER")?);
    cfg.password = Some(env_req("DB_PASSWORD")?);
    cfg.dbname = Some(env_req("DB_NAME")?);
    cfg.manager = Some(ManagerConfig { recycling_method: RecyclingMethod::Fast });
    Ok(cfg.create_pool(Some(Runtime::Tokio1), NoTls)?)
}

/// Applies database/init/*.sql in filename order, once each (tracked in schema_migrations).
pub async fn run_migrations(pool: &Pool, dir: &str) -> anyhow::Result<()> {
    let mut client = pool.get().await?;
    client
        .batch_execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                filename TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        )
        .await?;
    let mut files: Vec<_> = std::fs::read_dir(dir)
        .with_context(|| format!("cannot read migrations dir {dir}"))?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map(|x| x == "sql").unwrap_or(false))
        .collect();
    files.sort();
    for path in files {
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        let done = client
            .query_opt("SELECT 1 FROM schema_migrations WHERE filename = $1", &[&name])
            .await?
            .is_some();
        if done {
            continue;
        }
        let sql = std::fs::read_to_string(&path)?;
        let tx = client.transaction().await?;
        tx.batch_execute(&sql).await.with_context(|| format!("migration {name} failed"))?;
        tx.execute("INSERT INTO schema_migrations (filename) VALUES ($1)", &[&name]).await?;
        tx.commit().await?;
        tracing::info!("applied migration {name}");
    }
    Ok(())
}
