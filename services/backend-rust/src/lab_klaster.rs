//! PR 021: seksi Laboratorium dan Klaster, dari data API (Alert SKDR mingguan + EBS). Tidak memakai data form.
//! Aturan (kata hasil positif/negatif, nilai KLB, diagnosa klaster) dari app_settings.lab_klaster_config.
use axum::{extract::{Query, State}, Json};
use deadpool_postgres::Object;
use serde_json::{json, Value};
use tokio_postgres::types::ToSql;

use crate::dashboard::{resolve, DashQuery, Resolved};
use crate::{internal, ApiError, AppState};

async fn conf(c: &Object) -> Result<Value, ApiError> {
    let r = c.query_opt("SELECT value FROM app_settings WHERE key = 'lab_klaster_config'", &[]).await.map_err(internal)?;
    Ok(r.and_then(|r| serde_json::from_str::<Value>(&r.get::<_, String>(0)).ok()).unwrap_or_else(|| json!({})))
}
fn strs(v: &Value, k: &str) -> Vec<String> {
    v.get(k).and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_lowercase())).collect()).unwrap_or_default()
}
fn likes(v: &[String]) -> Vec<String> {
    v.iter().filter(|w| !w.is_empty()).map(|w| format!("%{}%", w.replace('%', "\\%").replace('_', "\\_"))).collect()
}

/// Shared filter for skdr_alerts `a`: epi-week range ($1,$2 as tahun*100+minggu), provinsi ($3), kab/kota ($4), penyakit ids ($5),
/// "no match" flag ($6, a disease/category was chosen but matched nothing), unit names ($7, lower-case).
pub(crate) struct AF { pub(crate) w0: i32, pub(crate) w1: i32, prov: Vec<i32>, kab: Vec<i32>, dis: Vec<i32>, none: bool, units: Vec<String> }
pub(crate) const AW: &str = "a.yw BETWEEN $1 AND $2
   AND (cardinality($3::int[]) = 0 OR a.province_id = ANY($3)) AND (cardinality($4::int[]) = 0 OR a.kabkota_id = ANY($4))
   AND (cardinality($5::int[]) = 0 OR a.disease_id = ANY($5)) AND NOT $6
   AND (cardinality($7::text[]) = 0 OR a.unit_key = ANY($7)) AND a.is_case";
impl AF {
    pub(crate) fn p(&self) -> [&(dyn ToSql + Sync); 7] { [&self.w0, &self.w1, &self.prov, &self.kab, &self.dis, &self.none, &self.units] }
}
pub(crate) fn af(q: &DashQuery, f: &Resolved) -> AF {
    let w0 = match (q.start_year, q.start_week) { (Some(y), Some(w)) => y * 100 + w, _ => 0 };
    let w1 = match (q.end_year, q.end_week) { (Some(y), Some(w)) => y * 100 + w, _ => 999_999 };
    AF { w0, w1, prov: f.province.clone(), kab: f.kabkota.clone(), dis: f.disease_ids.clone(),
         none: !f.disease.is_empty() && f.disease_ids.is_empty(), units: f.unit.clone() }
}
/// Same narrowing for ebs_reports `e`, by report date.
const EW: &str = "($1::date IS NULL OR e.tgl_laporan >= $1) AND ($2::date IS NULL OR e.tgl_laporan <= $2)
   AND (cardinality($3::int[]) = 0 OR e.province_id = ANY($3)) AND (cardinality($4::int[]) = 0 OR e.kabkota_id = ANY($4))
   AND (cardinality($5::int[]) = 0 OR e.disease_id = ANY($5)) AND NOT $6
   AND (cardinality($7::text[]) = 0 OR lower(trim(e.unit)) = ANY($7))";

/// PR 023: same per-alert case cap as epi curve / Alert (epicurve_config.max_kasus_per_alert, migration 048).
async fn kcap(c: &Object) -> i64 {
    let r = c.query_opt("SELECT value FROM app_settings WHERE key = 'epicurve_config'", &[]).await.ok().flatten();
    r.and_then(|r| serde_json::from_str::<Value>(&r.get::<_, String>(0)).ok())
        .and_then(|v| v.get("max_kasus_per_alert").and_then(|x| x.as_i64())).unwrap_or(i64::MAX)
}

const LBL: &str = "COALESCE(d.name, a.nama_penyakit, 'Tidak diketahui')";

pub async fn laboratorium(State(s): State<AppState>, Query(q): Query<DashQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let f = resolve(&c, &q).await?;
    let a = af(&q, &f);
    let cf = conf(&c).await?;
    let kc = kcap(&c).await;
    let top = cf.get("top_n").and_then(|v| v.as_i64()).unwrap_or(15);
    // derived at sync time from lab_klaster_config (alert::classify)
    let cls = "a.lab_kelas";
    let spec = "a.ada_spesimen";
    let p: Vec<&(dyn ToSql + Sync)> = a.p().to_vec();
    let from = format!("FROM skdr_alert_fakta a LEFT JOIN master_diseases d ON d.id = a.disease_id WHERE {AW}");
    let k = c.query_one(&format!(
        "SELECT COUNT(*)::bigint, COUNT(*) FILTER (WHERE {spec})::bigint, COUNT(*) FILTER (WHERE {cls} <> 'belum')::bigint,
                COUNT(*) FILTER (WHERE {cls} = 'positif')::bigint, COUNT(*) FILTER (WHERE {cls} = 'negatif')::bigint,
                COUNT(*) FILTER (WHERE {cls} IN ('lainnya','proses'))::bigint, COALESCE(SUM(CASE WHEN a.kasus <= {kc} THEN a.kasus ELSE 0 END),0)::bigint,
                COUNT(DISTINCT a.unit_id) FILTER (WHERE {spec})::bigint, COUNT(*) FILTER (WHERE {cls} = 'proses')::bigint {from}"), &p).await.map_err(internal)?;
    let by_disease = c.query(&format!(
        "SELECT {LBL}, COUNT(*)::bigint, COUNT(*) FILTER (WHERE {spec})::bigint, COUNT(*) FILTER (WHERE {cls} = 'positif')::bigint,
                COUNT(*) FILTER (WHERE {cls} = 'negatif')::bigint, COUNT(*) FILTER (WHERE {cls} IN ('lainnya','proses'))::bigint {from}
         GROUP BY 1 ORDER BY 3 DESC, 2 DESC LIMIT {top}"), &p).await.map_err(internal)?;
    let by_prov = c.query(&format!(
        "SELECT COALESCE(l.name, a.provinsi, 'Tidak diketahui'), COUNT(*)::bigint, COUNT(*) FILTER (WHERE {spec})::bigint,
                COUNT(*) FILTER (WHERE {cls} = 'positif')::bigint
         FROM skdr_alert_fakta a LEFT JOIN master_diseases d ON d.id = a.disease_id LEFT JOIN master_locations l ON l.id = a.province_id WHERE {AW}
         GROUP BY 1 ORDER BY 3 DESC, 2 DESC LIMIT {top}"), &p).await.map_err(internal)?;
    let trend = c.query(&format!(
        "SELECT a.tahun, a.minggu, COUNT(*)::bigint, COUNT(*) FILTER (WHERE {spec})::bigint, COUNT(*) FILTER (WHERE {cls} = 'positif')::bigint
         {from} GROUP BY 1, 2 ORDER BY 1, 2"), &p).await.map_err(internal)?;
    let specimens = c.query(&format!(
        "SELECT a.spesimen, COUNT(*)::bigint {from} AND {spec} GROUP BY 1 ORDER BY 2 DESC LIMIT {top}"), &p).await.map_err(internal)?;
    let masker = crate::privacy::Masker::load(&c).await;
    let recent = c.query(&format!(
        "SELECT a.tahun, a.minggu, {LBL}, a.unit, a.kota, a.provinsi, s.spesimen_diperiksa, s.hasil_pemeriksaan, {cls}, a.kasus
         FROM skdr_alert_fakta a LEFT JOIN master_diseases d ON d.id = a.disease_id JOIN skdr_alerts s ON s.id = a.alert_id
         WHERE {AW} AND {spec} ORDER BY a.yw DESC, a.alert_id DESC LIMIT 50"), &p).await.map_err(internal)?;
    // EBS: diagnosa yang menyebut hasil/konfirmasi laboratorium
    let words = likes(&strs(&cf, "ebs_lab_diagnosa_words"));
    let ebs = ebs_params(&q, &f);
    let mut ep: Vec<&(dyn ToSql + Sync)> = ebs.p();
    ep.push(&words);
    let e = c.query(&format!(
        "SELECT trim(e.diagnosa), COUNT(*)::bigint, COALESCE(SUM(e.jml_kasus),0)::bigint FROM ebs_reports e WHERE {EW} AND lower(e.diagnosa) LIKE ANY($8)
         GROUP BY 1 ORDER BY 2 DESC"), &ep).await.map_err(internal)?;
    let n = |r: &tokio_postgres::Row, i: usize| r.get::<_, i64>(i);
    Ok(Json(json!({ "success": true, "data": {
        "kpis": { "alerts": n(&k,0), "with_specimen": n(&k,1), "with_result": n(&k,2), "positive": n(&k,3), "negative": n(&k,4),
                  "other": n(&k,5), "cases": n(&k,6), "units_with_specimen": n(&k,7), "in_process": n(&k,8) },
        "class_labels": cf.get("lab_class_labels").cloned().unwrap_or_else(|| json!({})),
        "by_disease": by_disease.iter().map(|r| json!({ "disease": r.get::<_, String>(0), "alerts": n(r,1), "with_specimen": n(r,2),
            "positive": n(r,3), "negative": n(r,4), "other": n(r,5) })).collect::<Vec<_>>(),
        "by_province": by_prov.iter().map(|r| json!({ "province": r.get::<_, String>(0), "alerts": n(r,1), "with_specimen": n(r,2), "positive": n(r,3) })).collect::<Vec<_>>(),
        "trend": trend.iter().map(|r| json!({ "year": r.get::<_, i32>(0), "week": r.get::<_, i32>(1), "alerts": n(r,2), "with_specimen": n(r,3), "positive": n(r,4) })).collect::<Vec<_>>(),
        "specimens": specimens.iter().map(|r| json!({ "specimen": r.get::<_, Option<String>>(0), "count": n(r,1) })).collect::<Vec<_>>(),
        "recent": recent.iter().map(|r| {
            let m = |i: usize| r.get::<_, Option<String>>(i).map(|t| masker.mask(&t).0);
            json!({ "year": r.get::<_, i32>(0), "week": r.get::<_, i32>(1), "disease": r.get::<_, String>(2), "unit": r.get::<_, Option<String>>(3),
                "kabkota": r.get::<_, Option<String>>(4), "province": r.get::<_, Option<String>>(5), "specimen": m(6), "result": m(7),
                "result_class": r.get::<_, String>(8), "cases": r.get::<_, i32>(9) })
        }).collect::<Vec<_>>(),
        "ebs_lab": e.iter().map(|r| json!({ "diagnosa": r.get::<_, String>(0), "reports": n(r,1), "cases": n(r,2) })).collect::<Vec<_>>(),
        "filters": { "scope": f.scope, "disease": f.disease_label() },
    }})))
}

struct EP { d0: Option<chrono::NaiveDate>, d1: Option<chrono::NaiveDate>, prov: Vec<i32>, kab: Vec<i32>, dis: Vec<i32>, none: bool, units: Vec<String> }
impl EP {
    fn p(&self) -> Vec<&(dyn ToSql + Sync)> { vec![&self.d0, &self.d1, &self.prov, &self.kab, &self.dis, &self.none, &self.units] }
}
fn ebs_params(_q: &DashQuery, f: &Resolved) -> EP {
    EP { d0: f.start, d1: f.end, prov: f.province.clone(), kab: f.kabkota.clone(), dis: f.disease_ids.clone(),
         none: !f.disease.is_empty() && f.disease_ids.is_empty(), units: f.unit.clone() }
}

pub async fn klaster(State(s): State<AppState>, Query(q): Query<DashQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let f = resolve(&c, &q).await?;
    let a = af(&q, &f);
    let cf = conf(&c).await?;
    let kc = kcap(&c).await;
    let top = cf.get("top_n").and_then(|v| v.as_i64()).unwrap_or(15);
    let p: Vec<&(dyn ToSql + Sync)> = a.p().to_vec();
    let from = format!("FROM skdr_alert_fakta a LEFT JOIN master_diseases d ON d.id = a.disease_id LEFT JOIN master_kabkota k ON k.id = a.kabkota_id WHERE {AW}");
    let isk = "a.is_klb";
    let r24 = "a.respon24_ok";
    let kp = c.query_one(&format!(
        "SELECT COUNT(*)::bigint, COUNT(*) FILTER (WHERE {isk})::bigint, COALESCE(SUM(CASE WHEN a.kasus <= {kc} THEN a.kasus ELSE 0 END) FILTER (WHERE {isk}),0)::bigint,
                COALESCE(SUM(CASE WHEN a.kasus <= {kc} THEN a.jml_kematian ELSE 0 END) FILTER (WHERE {isk}),0)::bigint,
                COUNT(DISTINCT (COALESCE(a.kabkota_id::text, a.kota), {LBL})) FILTER (WHERE {isk})::bigint,
                COUNT(*) FILTER (WHERE {r24})::bigint, COUNT(*) FILTER (WHERE {isk} AND {r24})::bigint {from}"), &p).await.map_err(internal)?;
    // Klaster = KLB alerts grouped by (kab/kota, penyakit) in the period.
    let clusters = c.query(&format!(
        "SELECT {LBL}, COALESCE(k.name, a.kota), a.provinsi, COUNT(*)::bigint, COUNT(DISTINCT a.unit_id)::bigint, COALESCE(SUM(CASE WHEN a.kasus <= {kc} THEN a.kasus ELSE 0 END),0)::bigint,
                COALESCE(SUM(CASE WHEN a.kasus <= {kc} THEN a.jml_kematian ELSE 0 END),0)::bigint, MIN(a.yw), MAX(a.yw),
                AVG(a.latitude), AVG(a.longitude), COUNT(*) FILTER (WHERE {r24})::bigint
         {from} AND {isk} GROUP BY 1, 2, 3 ORDER BY 6 DESC, 4 DESC LIMIT 200"), &p).await.map_err(internal)?;
    let by_disease = c.query(&format!(
        "SELECT {LBL}, COUNT(*)::bigint, COUNT(*) FILTER (WHERE {isk})::bigint, COALESCE(SUM(CASE WHEN a.kasus <= {kc} THEN a.kasus ELSE 0 END) FILTER (WHERE {isk}),0)::bigint
         {from} GROUP BY 1 HAVING COUNT(*) FILTER (WHERE {isk}) > 0 ORDER BY 3 DESC LIMIT {top}"), &p).await.map_err(internal)?;
    let trend = c.query(&format!(
        "SELECT a.tahun, a.minggu, COUNT(*)::bigint, COUNT(*) FILTER (WHERE {isk})::bigint {from} GROUP BY 1, 2 ORDER BY 1, 2"), &p).await.map_err(internal)?;
    // EBS: laporan bertanda KLB atau diagnosa klaster tidak lazim
    let eklb = strs(&cf, "ebs_klb_values");
    let ediag = strs(&cf, "ebs_cluster_diagnosa");
    let ebs = ebs_params(&q, &f);
    let mut ep: Vec<&(dyn ToSql + Sync)> = ebs.p();
    ep.push(&eklb); ep.push(&ediag);
    let ew = format!("FROM ebs_reports e LEFT JOIN master_diseases d ON d.id = e.disease_id LEFT JOIN master_kabkota k ON k.id = e.kabkota_id
        WHERE {EW} AND (lower(trim(COALESCE(e.klb,''))) = ANY($8) OR lower(trim(COALESCE(e.diagnosa,''))) = ANY($9))");
    let ek = c.query_one(&format!("SELECT COUNT(*)::bigint, COALESCE(SUM(e.jml_kasus),0)::bigint, COALESCE(SUM(e.jml_kematian),0)::bigint {ew}"), &ep)
        .await.map_err(internal)?;
    let elist = c.query(&format!(
        "SELECT e.no_ebs, to_char(e.tgl_laporan,'YYYY-MM-DD'), COALESCE(d.name, trim(e.diagnosa)), COALESCE(k.name, e.kota), e.propinsi,
                e.jml_kasus, e.jml_kematian, e.verifikasi, e.latitude, e.longitude
         {ew} ORDER BY e.tgl_laporan DESC NULLS LAST, e.id DESC LIMIT 100"), &ep).await.map_err(internal)?;
    let n = |r: &tokio_postgres::Row, i: usize| r.get::<_, i64>(i);
    let wk = |v: i32| format!("{}-M{:02}", v / 100, v % 100);
    Ok(Json(json!({ "success": true, "data": {
        "kpis": { "alerts": n(&kp,0), "klb_alerts": n(&kp,1), "klb_cases": n(&kp,2), "klb_deaths": n(&kp,3), "clusters": n(&kp,4),
                  "respon24": n(&kp,5), "klb_respon24": n(&kp,6), "ebs_klb": n(&ek,0), "ebs_klb_cases": n(&ek,1), "ebs_klb_deaths": n(&ek,2) },
        "clusters": clusters.iter().map(|r| json!({ "disease": r.get::<_, String>(0), "kabkota": r.get::<_, Option<String>>(1),
            "province": r.get::<_, Option<String>>(2), "alerts": n(r,3), "units": n(r,4), "cases": n(r,5), "deaths": n(r,6),
            "first_week": wk(r.get(7)), "last_week": wk(r.get(8)), "latitude": r.get::<_, Option<f64>>(9), "longitude": r.get::<_, Option<f64>>(10),
            "respon24": n(r,11) })).collect::<Vec<_>>(),
        "by_disease": by_disease.iter().map(|r| json!({ "disease": r.get::<_, String>(0), "alerts": n(r,1), "klb_alerts": n(r,2), "klb_cases": n(r,3) })).collect::<Vec<_>>(),
        "trend": trend.iter().map(|r| json!({ "year": r.get::<_, i32>(0), "week": r.get::<_, i32>(1), "alerts": n(r,2), "klb_alerts": n(r,3) })).collect::<Vec<_>>(),
        "ebs": elist.iter().map(|r| json!({ "no_ebs": r.get::<_, Option<String>>(0), "date": r.get::<_, Option<String>>(1), "disease": r.get::<_, Option<String>>(2),
            "kabkota": r.get::<_, Option<String>>(3), "province": r.get::<_, Option<String>>(4), "cases": r.get::<_, i32>(5), "deaths": r.get::<_, i32>(6),
            "status": r.get::<_, Option<String>>(7), "latitude": r.get::<_, Option<f64>>(8), "longitude": r.get::<_, Option<f64>>(9) })).collect::<Vec<_>>(),
        "filters": { "scope": f.scope, "disease": f.disease_label() },
    }})))
}
