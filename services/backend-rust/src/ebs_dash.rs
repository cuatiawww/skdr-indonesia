//! PR 023: analitik EBS lanjutan untuk Dasbor Utama + peta Sebaran wilayah, dari ebs_reports (API EBS SKDR).
//! Semua parameter (batas kasus, kelas histogram, jendela unit diam, target respons, kata kunci tindakan/saran)
//! dari app_settings.ebs_dashboard_config (migrasi 049). Teks bebas (kronologi/tindakan/saran) tidak pernah dikirim:
//! hanya jumlah per kelas kata kunci, jadi nama orang di teks tidak keluar.
use axum::{extract::{Query, State}, Json};
use chrono::{Datelike, NaiveDate};
use deadpool_postgres::Object;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use tokio_postgres::types::ToSql;

use crate::dashboard::{resolve, DashQuery, Resolved};
use crate::{internal, ApiError, AppState};

async fn setting(c: &Object, key: &str) -> Result<Value, ApiError> {
    let r = c.query_opt("SELECT value FROM app_settings WHERE key = $1", &[&key]).await.map_err(internal)?;
    Ok(r.and_then(|r| serde_json::from_str::<Value>(&r.get::<_, String>(0)).ok()).unwrap_or_else(|| json!({})))
}
fn num(v: &Value, k: &str, d: f64) -> f64 { v.get(k).and_then(|x| x.as_f64()).unwrap_or(d) }
fn csv(s: &Option<String>) -> Vec<String> {
    s.as_deref().unwrap_or("").split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty() && x != "all").collect()
}

#[derive(Deserialize, Default)]
pub struct EbsQ { pub kel_unit: Option<String>, pub sts_rumor: Option<String>, pub klb: Option<String>,
                  pub level: Option<String>, pub parent: Option<String> }

/// Filter for ebs_reports `e`: $1..$7 = period, prov, kab, disease ids, none flag, units; $8 kel_unit, $9 sts_rumor, $10 klb.
const W: &str = "($1::date IS NULL OR e.tgl_laporan >= $1) AND ($2::date IS NULL OR e.tgl_laporan <= $2)
   AND (cardinality($3::int[]) = 0 OR e.province_id = ANY($3)) AND (cardinality($4::int[]) = 0 OR e.kabkota_id = ANY($4))
   AND (cardinality($5::int[]) = 0 OR e.disease_id = ANY($5)) AND NOT $6
   AND (cardinality($7::text[]) = 0 OR lower(trim(e.unit)) = ANY($7))
   AND (cardinality($8::text[]) = 0 OR trim(COALESCE(e.kel_unit,'')) = ANY($8))
   AND (cardinality($9::text[]) = 0 OR COALESCE(NULLIF(trim(e.sts_rumor),''),'(kosong)') = ANY($9))
   AND (cardinality($10::text[]) = 0 OR trim(COALESCE(e.klb,'')) = ANY($10))";
struct P { d0: Option<NaiveDate>, d1: Option<NaiveDate>, prov: Vec<i32>, kab: Vec<i32>, dis: Vec<i32>, none: bool, units: Vec<String>,
           ku: Vec<String>, sr: Vec<String>, klb: Vec<String> }
impl P {
    fn new(f: &Resolved, e: &EbsQ) -> P {
        P { d0: f.start, d1: f.end, prov: f.province.clone(), kab: f.kabkota.clone(), dis: f.disease_ids.clone(),
            none: !f.disease.is_empty() && f.disease_ids.is_empty(), units: f.unit.clone(),
            ku: csv(&e.kel_unit), sr: csv(&e.sts_rumor), klb: csv(&e.klb) }
    }
    fn prev(&self) -> P {
        let back = |d: Option<NaiveDate>| d.and_then(|d| d.with_year(d.year() - 1).or_else(|| Some(d - chrono::Duration::days(365))));
        P { d0: back(self.d0), d1: back(self.d1), prov: self.prov.clone(), kab: self.kab.clone(), dis: self.dis.clone(), none: self.none,
            units: self.units.clone(), ku: self.ku.clone(), sr: self.sr.clone(), klb: self.klb.clone() }
    }
    fn p(&self) -> Vec<&(dyn ToSql + Sync)> {
        vec![&self.d0, &self.d1, &self.prov, &self.kab, &self.dis, &self.none, &self.units, &self.ku, &self.sr, &self.klb]
    }
}
fn caps(cf: &Value) -> (i64, String, String) {
    let cap = num(cf, "max_kasus_per_laporan", f64::MAX).min(9.0e18) as i64;
    (cap, format!("(CASE WHEN e.jml_kasus <= {cap} THEN e.jml_kasus ELSE 0 END)"),
          format!("(CASE WHEN e.jml_kasus <= {cap} AND e.jml_kematian > 0 THEN e.jml_kematian ELSE 0 END)"))
}
fn klb_label(v: &str) -> &'static str { match v { "1" => "KLB", "0" => "Bukan KLB", "-1" => "Belum dinilai", _ => "Tidak diisi" } }

/// GET /api/v1/ebs-analitik
pub async fn analitik(State(s): State<AppState>, Query(q): Query<DashQuery>, Query(eq): Query<EbsQ>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let f = resolve(&c, &q).await?;
    let cf = setting(&c, "ebs_dashboard_config").await?;
    let (cap, ks, kd) = caps(&cf);
    let pr = P::new(&f, &eq);
    let p = pr.p();
    let from = format!("FROM ebs_reports e WHERE {W}");
    let n = |r: &tokio_postgres::Row, i: usize| r.get::<_, i64>(i);

    let kp = c.query_one(&format!("SELECT COUNT(*)::bigint, COALESCE(SUM({ks}),0)::bigint, COALESCE(SUM({kd}),0)::bigint,
        COUNT(*) FILTER (WHERE e.latitude IS NOT NULL AND e.longitude IS NOT NULL AND e.latitude <> 0)::bigint,
        COUNT(*) FILTER (WHERE e.jml_kasus > {cap})::bigint, COUNT(*) FILTER (WHERE e.jml_kematian < 0)::bigint,
        COUNT(DISTINCT lower(trim(e.unit)))::bigint, MAX(e.tgl_laporan)::text {from}"), &p).await.map_err(internal)?;

    let kel = c.query(&format!("SELECT COALESCE(NULLIF(trim(e.kel_unit),''),'(kosong)'), COUNT(*)::bigint, COALESCE(SUM({ks}),0)::bigint {from} GROUP BY 1 ORDER BY 2 DESC"), &p).await.map_err(internal)?;
    let top_n = num(&cf, "top_units", 15.0) as i64;
    let units = c.query(&format!("SELECT e.unit, MAX(e.kel_unit), MAX(e.kota), COUNT(*)::bigint, COALESCE(SUM({ks}),0)::bigint, MAX(e.tgl_laporan)::text
        {from} AND trim(COALESCE(e.unit,'')) <> '' GROUP BY 1 ORDER BY 4 DESC LIMIT {top_n}"), &p).await.map_err(internal)?;

    // unit diam: melapor di jendela dasar, tidak melapor di N minggu terakhir (acuan = akhir data dalam filter)
    let (bw, sw) = (num(&cf, "silent_baseline_weeks", 12.0) as i32, num(&cf, "silent_weeks", 4.0) as i32);
    let silent = c.query(&format!("WITH ref AS (SELECT MAX(e.tgl_laporan) r FROM ebs_reports e WHERE {W}),
        u AS (SELECT e.unit, MAX(e.kel_unit) ku, MAX(e.kota) kota,
                     COUNT(*) FILTER (WHERE e.tgl_laporan > ref.r - {sw}*7 - {bw}*7 AND e.tgl_laporan <= ref.r - {sw}*7)::bigint base,
                     COUNT(*) FILTER (WHERE e.tgl_laporan > ref.r - {sw}*7)::bigint recent, MAX(e.tgl_laporan)::text last
              FROM ebs_reports e, ref WHERE {W} AND trim(COALESCE(e.unit,'')) <> '' AND e.tgl_laporan > ref.r - {sw}*7 - {bw}*7 GROUP BY 1)
        SELECT unit, ku, kota, base, last, (SELECT r::text FROM ref) FROM u WHERE recent = 0 AND base >= 2 ORDER BY base DESC LIMIT 50"), &p).await.map_err(internal)?;
    let silent_total = c.query_one(&format!("WITH ref AS (SELECT MAX(e.tgl_laporan) r FROM ebs_reports e WHERE {W}),
        u AS (SELECT e.unit, COUNT(*) FILTER (WHERE e.tgl_laporan <= ref.r - {sw}*7) base, COUNT(*) FILTER (WHERE e.tgl_laporan > ref.r - {sw}*7) recent
              FROM ebs_reports e, ref WHERE {W} AND trim(COALESCE(e.unit,'')) <> '' AND e.tgl_laporan > ref.r - {sw}*7 - {bw}*7 GROUP BY 1)
        SELECT COUNT(*) FILTER (WHERE recent = 0 AND base >= 2)::bigint, COUNT(*) FILTER (WHERE base >= 2)::bigint FROM u"), &p).await.map_err(internal)?;

    // 7-1-7 respons: pembaruan status pertama (update_date) sejak laporan dibuat (create_date)
    let tgt = num(&cf, "respons_target_days", 7.0);
    let rsp = c.query_one(&format!("SELECT COUNT(*)::bigint, COUNT(*) FILTER (WHERE e.update_date IS NOT NULL AND e.update_date >= e.create_date)::bigint,
        COUNT(*) FILTER (WHERE e.update_date IS NOT NULL AND e.update_date >= e.create_date AND extract(epoch FROM e.update_date - e.create_date)/86400 <= {tgt})::bigint,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM e.update_date - e.create_date)/86400)
          FILTER (WHERE e.update_date IS NOT NULL AND e.update_date >= e.create_date)::float8 {from}"), &p).await.map_err(internal)?;
    let rsp_dis = c.query(&format!("SELECT COALESCE(d.name, trim(e.diagnosa), '-'), COUNT(*)::bigint,
        COUNT(*) FILTER (WHERE e.update_date IS NOT NULL AND e.update_date >= e.create_date)::bigint,
        COUNT(*) FILTER (WHERE e.update_date IS NOT NULL AND e.update_date >= e.create_date AND extract(epoch FROM e.update_date - e.create_date)/86400 <= {tgt})::bigint,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM e.update_date - e.create_date)/86400)
          FILTER (WHERE e.update_date IS NOT NULL AND e.update_date >= e.create_date)::float8
        FROM ebs_reports e LEFT JOIN master_diseases d ON d.id = e.disease_id WHERE {W} GROUP BY 1 ORDER BY 2 DESC LIMIT 15"), &p).await.map_err(internal)?;

    // funnel + tren status
    let funnel = c.query(&format!("SELECT COALESCE(NULLIF(trim(e.sts_rumor),''),'(kosong)'), COUNT(*)::bigint {from} GROUP BY 1 ORDER BY 2 DESC"), &p).await.map_err(internal)?;
    let st_trend = c.query(&format!("SELECT to_char(date_trunc('week', e.tgl_laporan),'YYYY-MM-DD'), COALESCE(NULLIF(trim(e.sts_rumor),''),'(kosong)'), COUNT(*)::bigint
        {from} GROUP BY 1, 2 ORDER BY 1"), &p).await.map_err(internal)?;
    // diagnosa awal -> verifikasi
    let mx = c.query(&format!("SELECT trim(e.diagnosa), COALESCE(NULLIF(trim(e.verifikasi),''),'(belum)'), COUNT(*)::bigint {from}
        AND trim(COALESCE(e.diagnosa,'')) <> '' GROUP BY 1, 2"), &p).await.map_err(internal)?;
    // histogram + outlier + kematian negatif
    let bins: Vec<i64> = cf.get("histogram_bins").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_i64()).collect())
        .unwrap_or_else(|| vec![0, 1, 2, 5, 10, 20, 50, 100, 500, 1000]);
    let hist_rows = c.query(&format!("SELECT e.jml_kasus, COUNT(*)::bigint {from} GROUP BY 1"), &p).await.map_err(internal)?;
    let mut hist = vec![0i64; bins.len()];
    for r in &hist_rows {
        let v: i32 = r.get(0);
        let i = bins.iter().rposition(|b| (v as i64) >= *b).unwrap_or(0);
        hist[i] += n(r, 1);
    }
    let flag = num(&cf, "outlier_flag_kasus", 100.0) as i32;
    let out = c.query(&format!("SELECT e.no_ebs, e.tgl_laporan::text, COALESCE(d.name, trim(e.diagnosa)), e.kota, e.propinsi, e.jml_kasus, e.jml_kematian
        FROM ebs_reports e LEFT JOIN master_diseases d ON d.id = e.disease_id WHERE {W} AND (e.jml_kasus >= {flag} OR e.jml_kematian < 0)
        ORDER BY (e.jml_kematian < 0) DESC, e.jml_kasus DESC LIMIT 40"), &p).await.map_err(internal)?;
    let klb = c.query(&format!("SELECT trim(COALESCE(e.klb,'')), COUNT(*)::bigint, COALESCE(SUM({ks}),0)::bigint, COALESCE(SUM({kd}),0)::bigint {from} GROUP BY 1 ORDER BY 1 DESC"), &p).await.map_err(internal)?;
    let coord = c.query(&format!("SELECT COALESCE(l.name, e.propinsi), COUNT(*)::bigint,
        COUNT(*) FILTER (WHERE e.latitude IS NOT NULL AND e.longitude IS NOT NULL AND e.latitude <> 0)::bigint
        FROM ebs_reports e LEFT JOIN master_locations l ON l.id = e.province_id WHERE {W} GROUP BY 1 ORDER BY 2 DESC"), &p).await.map_err(internal)?;
    // tindakan / saran: kelas kata kunci, hanya jumlah
    let mut classes = vec![];
    for (field, key) in [("tindakan", "tindakan_kelas"), ("saran", "saran_kelas")] {
        let Some(obj) = cf.get(key).and_then(|v| v.as_object()) else { continue };
        let filled = c.query_one(&format!("SELECT COUNT(*) FILTER (WHERE length(trim(COALESCE(e.{field},''))) > 3)::bigint {from}"), &p).await.map_err(internal)?;
        let mut rows = vec![];
        for (label, words) in obj {
            let pats: Vec<String> = words.as_array().map(|a| a.iter().filter_map(|w| w.as_str().map(|w| format!("%{}%", w.to_lowercase()))).collect()).unwrap_or_default();
            if pats.is_empty() { continue; }
            let mut pp = pr.p();
            pp.push(&pats);
            let r = c.query_one(&format!("SELECT COUNT(*)::bigint {from} AND lower(e.{field}) LIKE ANY($11)"), &pp).await.map_err(internal)?;
            rows.push(json!({ "kelas": label, "count": n(&r, 0) }));
        }
        rows.sort_by(|a, b| b["count"].as_i64().cmp(&a["count"].as_i64()));
        classes.push(json!({ "field": field, "filled": n(&filled, 0), "classes": rows }));
    }
    // perbandingan tahun lalu (mingguan)
    let wk = || format!("SELECT extract(isoyear FROM e.tgl_laporan)::int, extract(week FROM e.tgl_laporan)::int, COUNT(*)::bigint, COALESCE(SUM({ks}),0)::bigint
        FROM ebs_reports e WHERE {W} GROUP BY 1, 2 ORDER BY 1, 2");
    let cur = c.query(&wk(), &p).await.map_err(internal)?;
    let pv = pr.prev();
    let prev_rows = if pr.d0.is_some() { c.query(&wk(), &pv.p()).await.map_err(internal)? } else { vec![] };
    let prev: HashMap<(i32, i32), (i64, i64)> = prev_rows.iter().map(|r| ((r.get::<_, i32>(0) + 1, r.get::<_, i32>(1)), (n(r, 2), n(r, 3)))).collect();

    let pct = |a: i64, b: i64| if b > 0 { Some(a as f64 * 100.0 / b as f64) } else { None };
    Ok(Json(json!({ "success": true, "data": {
        "kpis": { "reports": n(&kp,0), "cases": n(&kp,1), "deaths": n(&kp,2), "with_coords": n(&kp,3), "coords_pct": pct(n(&kp,3), n(&kp,0)),
                  "over_cap": n(&kp,4), "negative_deaths": n(&kp,5), "units": n(&kp,6), "last_date": kp.get::<_, Option<String>>(7) },
        "config": { "max_kasus_per_laporan": if cap >= 9_000_000_000_000_000_000 { None } else { Some(cap) }, "outlier_flag_kasus": flag,
                    "silent_weeks": sw, "silent_baseline_weeks": bw, "respons_target_days": tgt, "histogram_bins": bins },
        "kel_unit": kel.iter().map(|r| json!({ "kel_unit": r.get::<_, String>(0), "reports": n(r,1), "cases": n(r,2) })).collect::<Vec<_>>(),
        "units": units.iter().map(|r| json!({ "unit": r.get::<_, Option<String>>(0), "kel_unit": r.get::<_, Option<String>>(1), "kabkota": r.get::<_, Option<String>>(2),
            "reports": n(r,3), "cases": n(r,4), "last": r.get::<_, Option<String>>(5) })).collect::<Vec<_>>(),
        "silent": { "count": n(&silent_total,0), "active_base": n(&silent_total,1), "ref_date": silent.first().and_then(|r| r.get::<_, Option<String>>(5)),
            "rows": silent.iter().map(|r| json!({ "unit": r.get::<_, Option<String>>(0), "kel_unit": r.get::<_, Option<String>>(1), "kabkota": r.get::<_, Option<String>>(2),
                "base_reports": n(r,3), "last": r.get::<_, Option<String>>(4) })).collect::<Vec<_>>() },
        "respons": { "den": n(&rsp,0), "with_update": n(&rsp,1), "on_time": n(&rsp,2), "late": n(&rsp,1) - n(&rsp,2), "missing": n(&rsp,0) - n(&rsp,1),
                     "pct": pct(n(&rsp,2), n(&rsp,1)), "median_days": rsp.get::<_, Option<f64>>(3),
                     "by_disease": rsp_dis.iter().map(|r| json!({ "disease": r.get::<_, String>(0), "reports": n(r,1), "with_update": n(r,2), "on_time": n(r,3),
                        "pct": pct(n(r,3), n(r,2)), "median_days": r.get::<_, Option<f64>>(4) })).collect::<Vec<_>>() },
        "funnel": funnel.iter().map(|r| json!({ "status": r.get::<_, String>(0), "count": n(r,1) })).collect::<Vec<_>>(),
        "status_trend": st_trend.iter().map(|r| json!({ "week": r.get::<_, String>(0), "status": r.get::<_, String>(1), "count": n(r,2) })).collect::<Vec<_>>(),
        "diagnosa_matrix": mx.iter().map(|r| json!({ "awal": r.get::<_, String>(0), "verifikasi": r.get::<_, String>(1), "count": n(r,2) })).collect::<Vec<_>>(),
        "histogram": bins.iter().enumerate().map(|(i, b)| json!({ "from": b, "to": bins.get(i + 1).map(|x| x - 1), "count": hist[i] })).collect::<Vec<_>>(),
        "flags": out.iter().map(|r| json!({ "no_ebs": r.get::<_, Option<String>>(0), "date": r.get::<_, Option<String>>(1), "disease": r.get::<_, Option<String>>(2),
            "kabkota": r.get::<_, Option<String>>(3), "province": r.get::<_, Option<String>>(4), "cases": r.get::<_, i32>(5), "deaths": r.get::<_, i32>(6),
            "reason": if r.get::<_, i32>(6) < 0 { "kematian negatif" } else if (r.get::<_, i32>(5) as i64) > cap { "di atas batas, tidak dihitung" } else { "kasus besar, cek" } })).collect::<Vec<_>>(),
        "klb": klb.iter().map(|r| { let v: String = r.get(0); json!({ "code": v, "label": klb_label(&v), "reports": n(r,1), "cases": n(r,2), "deaths": n(r,3) }) }).collect::<Vec<_>>(),
        "coords_by_province": coord.iter().map(|r| json!({ "province": r.get::<_, Option<String>>(0), "reports": n(r,1), "with_coords": n(r,2), "pct": pct(n(r,2), n(r,1)) })).collect::<Vec<_>>(),
        "text_classes": classes,
        "weekly": cur.iter().map(|r| { let k = (r.get::<_, i32>(0), r.get::<_, i32>(1)); let pv = prev.get(&k);
            json!({ "year": k.0, "week": k.1, "label": format!("M{}/{:02}", k.1, k.0 % 100), "reports": n(r,2), "cases": n(r,3),
                    "prev_reports": pv.map(|x| x.0), "prev_cases": pv.map(|x| x.1) }) }).collect::<Vec<_>>(),
        "prev_available": !prev.is_empty(),
        "filters": { "scope": f.scope, "disease": f.disease_label(), "kel_unit": pr.ku, "sts_rumor": pr.sr, "klb": pr.klb },
    }})))
}

/// GET /api/v1/ebs-wilayah?level=prov|kab|kec&parent=… — data peta EBS rinci (choropleth provinsi / kab-kota, titik kecamatan).
pub async fn wilayah(State(s): State<AppState>, Query(q): Query<DashQuery>, Query(eq): Query<EbsQ>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let f = resolve(&c, &q).await?;
    let cf = setting(&c, "ebs_dashboard_config").await?;
    let (_cap, ks, kd) = caps(&cf);
    let level = eq.level.clone().unwrap_or_else(|| "prov".into());
    let mut pr = P::new(&f, &eq);
    let parent = eq.parent.clone().unwrap_or_default();
    // drill-down narrows the filter: prov -> its kab/kota, kab -> its kecamatan
    if level == "kab" { if let Ok(id) = parent.parse::<i32>() { pr.prov = vec![id]; } }
    if level == "kec" { if let Ok(id) = parent.parse::<i32>() { pr.kab = vec![id]; } }
    let (key, name, geo, lat, lng, join) = match level.as_str() {
        "kab" => ("e.kabkota_id::text", "COALESCE(k.name, MAX(e.kota))", "replace(k.kemendagri_code,'.','')", "k.latitude", "k.longitude",
                  "LEFT JOIN master_kabkota k ON k.id = e.kabkota_id"),
        "kec" => ("COALESCE(NULLIF(trim(e.kode_depdagri_distrik),''), lower(trim(e.distrik)))", "MAX(initcap(lower(trim(e.distrik))))", "NULL::text",
                  "AVG(NULLIF(e.latitude,0))", "AVG(NULLIF(e.longitude,0))", ""),
        _ => ("e.province_id::text", "COALESCE(l.name, MAX(e.propinsi))", "l.code", "l.latitude", "l.longitude",
              "LEFT JOIN master_locations l ON l.id = e.province_id"),
    };
    let gb = match level.as_str() { "kab" => "GROUP BY 1, k.name, k.kemendagri_code, k.latitude, k.longitude", "kec" => "GROUP BY 1", _ => "GROUP BY 1, l.name, l.code, l.latitude, l.longitude" };
    let sql = || -> String {
        format!("SELECT {key}, {name}, {geo}, {lat}::float8, {lng}::float8, COUNT(*)::bigint, COALESCE(SUM({ks}),0)::bigint, COALESCE(SUM({kd}),0)::bigint,
                COUNT(*) FILTER (WHERE e.latitude IS NOT NULL AND e.longitude IS NOT NULL AND e.latitude <> 0)::bigint,
                COUNT(*) FILTER (WHERE trim(COALESCE(e.klb,'')) = '1')::bigint
         FROM ebs_reports e {join} WHERE {W} AND {key} IS NOT NULL {gb}")
    };
    let rows = c.query(&sql(), &pr.p()).await.map_err(internal)?;
    let pv = pr.prev();
    let prev_rows = if pr.d0.is_some() { c.query(&sql(), &pv.p()).await.map_err(internal)? } else { vec![] };
    let prev: HashMap<String, i64> = prev_rows.iter().map(|r| (r.get::<_, String>(0), r.get::<_, i64>(5))).collect();
    let opts = c.query("SELECT 'kel_unit', COALESCE(NULLIF(trim(kel_unit),''),'(kosong)'), COUNT(*)::bigint FROM ebs_reports GROUP BY 2
                        UNION ALL SELECT 'sts_rumor', COALESCE(NULLIF(trim(sts_rumor),''),'(kosong)'), COUNT(*)::bigint FROM ebs_reports GROUP BY 2 ORDER BY 1, 3 DESC", &[])
        .await.map_err(internal)?;
    let n = |r: &tokio_postgres::Row, i: usize| r.get::<_, i64>(i);
    Ok(Json(json!({ "success": true, "data": {
        "level": level, "parent": parent, "prev_available": !prev.is_empty(),
        "regions": rows.iter().map(|r| { let k: String = r.get(0); let pv = if pr.d0.is_some() { Some(*prev.get(&k).unwrap_or(&0)) } else { None };
            json!({ "key": k, "name": r.get::<_, Option<String>>(1), "geo": r.get::<_, Option<String>>(2), "lat": r.get::<_, Option<f64>>(3), "lng": r.get::<_, Option<f64>>(4),
                "reports": n(r,5), "cases": n(r,6), "deaths": n(r,7), "with_coords": n(r,8), "klb": n(r,9),
                "coords_pct": if n(r,5) > 0 { Some(n(r,8) as f64 * 100.0 / n(r,5) as f64) } else { None }, "prev_reports": pv }) }).collect::<Vec<_>>(),
        "options": {
            "kel_unit": opts.iter().filter(|r| r.get::<_, String>(0) == "kel_unit").map(|r| json!({ "value": r.get::<_, String>(1), "count": n(r,2) })).collect::<Vec<_>>(),
            "sts_rumor": opts.iter().filter(|r| r.get::<_, String>(0) == "sts_rumor").map(|r| json!({ "value": r.get::<_, String>(1), "count": n(r,2) })).collect::<Vec<_>>(),
            "klb": [ { "value": "-1", "label": "Belum dinilai" }, { "value": "0", "label": "Bukan KLB" }, { "value": "1", "label": "KLB" } ],
        },
        "filters": { "scope": f.scope, "disease": f.disease_label() },
    }})))
}
