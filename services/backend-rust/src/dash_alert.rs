//! PR 022: seksi Dasbor Utama dari Alert SKDR mingguan (skdr_alert_fakta): epi curve, Alert, CFR, 7-1-7.
//! Semua angka dihitung dari data API yang tersinkron; parameter tampilan (jendela rata-rata bergerak, ambang, urutan seksi)
//! dari app_settings (migrasi 047). Tidak ada nilai contoh/perkiraan: bila data tidak ada, field bernilai null.
use axum::{extract::{Query, State}, Json};
use deadpool_postgres::Object;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use tokio_postgres::types::ToSql;

use crate::dashboard::{resolve, DashQuery};
use crate::lab_klaster::{af, AW};
use crate::{internal, ApiError, AppState};

async fn setting(c: &Object, key: &str) -> Result<Value, ApiError> {
    let r = c.query_opt("SELECT value FROM app_settings WHERE key = $1", &[&key]).await.map_err(internal)?;
    Ok(r.and_then(|r| serde_json::from_str::<Value>(&r.get::<_, String>(0)).ok()).unwrap_or_else(|| json!({})))
}
fn num(v: &Value, k: &str) -> Option<f64> { v.get(k).and_then(|x| x.as_f64()) }
/// PR 022: alerts whose `kasus` exceeds epicurve_config.max_kasus_per_alert are implausible entries at the source
/// (e.g. 21 juta kasus ISPA satu unit satu minggu). They are excluded from sums and listed as "perlu dicek".
fn cap(cf: &Value) -> i64 { num(cf, "max_kasus_per_alert").map(|x| x as i64).unwrap_or(i64::MAX) }
fn ks(cap: i64) -> String { format!("(CASE WHEN a.kasus <= {cap} THEN a.kasus ELSE 0 END)") }
fn kd(cap: i64) -> String { format!("(CASE WHEN a.kasus <= {cap} THEN a.jml_kematian ELSE 0 END)") }
async fn outliers(c: &Object, p: &[&(dyn ToSql + Sync)], cap: i64) -> Result<Vec<Value>, ApiError> {
    if cap == i64::MAX { return Ok(vec![]); }
    let r = c.query(&format!("SELECT a.tahun, a.minggu, COALESCE(d.name, a.nama_penyakit, '-'), a.kota, a.provinsi, a.kasus, a.jml_kematian
        FROM skdr_alert_fakta a LEFT JOIN master_diseases d ON d.id = a.disease_id WHERE {AW} AND a.kasus > {cap} ORDER BY a.kasus DESC LIMIT 20"), p)
        .await.map_err(internal)?;
    Ok(r.iter().map(|r| json!({ "year": r.get::<_, i32>(0), "week": r.get::<_, i32>(1), "disease": r.get::<_, String>(2),
        "kabkota": r.get::<_, Option<String>>(3), "province": r.get::<_, Option<String>>(4), "cases": r.get::<_, i32>(5), "deaths": r.get::<_, i32>(6) })).collect())
}

/// Wilson 95% CI, percent.
fn wilson(k: i64, n: i64) -> Value {
    if n <= 0 { return json!({ "num": k, "den": n, "pct": null, "ci_low": null, "ci_high": null }); }
    let (z, nn) = (1.96f64, n as f64);
    let p = k as f64 / nn;
    let d = 1.0 + z * z / nn;
    let c = (p + z * z / (2.0 * nn)) / d;
    let h = z * (p * (1.0 - p) / nn + z * z / (4.0 * nn * nn)).sqrt() / d;
    json!({ "num": k, "den": n, "pct": p * 100.0, "ci_low": (c - h).max(0.0) * 100.0, "ci_high": (c + h).min(1.0) * 100.0 })
}

/// GET /api/v1/dashboard/sections — urutan dan visibilitas seksi Dasbor Utama (app_settings.dashboard_sections).
pub async fn sections(State(s): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    Ok(Json(json!({ "success": true, "data": setting(&c, "dashboard_sections").await? })))
}

#[derive(Deserialize, Default)]
pub struct EpiQ { pub group: Option<String> }

/// GET /api/v1/epicurve — kasus & kematian per minggu epid, ditumpuk per penyakit / kategori, + rata-rata bergerak,
/// ambang (rerata + k·SD minggu-minggu sebelumnya) dan perbandingan tahun sebelumnya (bila datanya ada).
pub async fn epicurve(State(s): State<AppState>, Query(q): Query<DashQuery>, Query(e): Query<EpiQ>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let f = resolve(&c, &q).await?;
    let mut a = af(&q, &f);
    let cf = setting(&c, "epicurve_config").await?;
    let ma_n = num(&cf, "ma_weeks").unwrap_or(4.0).max(1.0) as usize;
    let base_n = num(&cf, "baseline_weeks").unwrap_or(8.0).max(2.0) as usize;
    let sd_k = num(&cf, "sd_k").unwrap_or(2.0);
    let top = num(&cf, "top_groups").unwrap_or(8.0) as usize;
    let cap = cap(&cf);
    let (kse, kde) = (ks(cap), kd(cap));
    // no period chosen: latest synced year
    if a.w0 == 0 && a.w1 == 999_999 {
        let y: Option<i32> = c.query_one("SELECT MAX(tahun) FROM skdr_alert_fakta", &[]).await.map_err(internal)?.get(0);
        if let Some(y) = y { a.w0 = y * 100 + 1; a.w1 = y * 100 + 53; }
    }
    let group = e.group.unwrap_or_else(|| "disease".into());
    let (gsel, gjoin) = match group.as_str() {
        "kategori" => ("COALESCE(cat.short_name, 'Tanpa kategori')",
            "LEFT JOIN master_disease_category_map cm ON cm.disease_id = a.disease_id AND cm.is_primary LEFT JOIN master_disease_categories cat ON cat.id = cm.category_id"),
        "total" => ("'Total'", ""),
        _ => ("COALESCE(d.name, a.nama_penyakit, 'Tidak diketahui')", ""),
    };
    let sql = format!("SELECT a.tahun, a.minggu, {gsel}, COALESCE(SUM({kse}),0)::bigint, COALESCE(SUM({kde}),0)::bigint, COUNT(*)::bigint,
            COUNT(*) FILTER (WHERE a.is_klb)::bigint
        FROM skdr_alert_fakta a LEFT JOIN master_diseases d ON d.id = a.disease_id {gjoin} WHERE {AW} GROUP BY 1, 2, 3");
    let p: Vec<&(dyn ToSql + Sync)> = a.p().to_vec();
    let rows = c.query(&sql, &p).await.map_err(internal)?;
    // previous year, same filter, totals only
    let (pw0, pw1) = (a.w0 - 100, a.w1 - 100);
    let mut pa = af(&q, &f); pa.w0 = pw0; pa.w1 = pw1;
    let pp: Vec<&(dyn ToSql + Sync)> = pa.p().to_vec();
    let out_cur = outliers(&c, &p, cap).await?;
    let out_prev = outliers(&c, &pp, cap).await?;
    let prev = c.query(&format!("SELECT a.tahun*100 + a.minggu + 100, COALESCE(SUM({kse}),0)::bigint, COALESCE(SUM({kde}),0)::bigint
        FROM skdr_alert_fakta a WHERE {AW} GROUP BY 1"), &pp).await.map_err(internal)?;
    let prev: HashMap<i32, (i64, i64)> = prev.iter().map(|r| (r.get(0), (r.get(1), r.get(2)))).collect();

    // weeks axis: every week from first to last week with data (gaps filled with 0)
    let mut wset: Vec<i32> = rows.iter().map(|r| r.get::<_, i32>(0) * 100 + r.get::<_, i32>(1)).collect();
    wset.sort(); wset.dedup();
    let weeks: Vec<i32> = match (wset.first(), wset.last()) {
        (Some(&lo), Some(&hi)) => {
            let mut v = vec![]; let mut w = lo;
            while w <= hi {
                if w % 100 < 53 || wset.contains(&w) { v.push(w); }
                w = if w % 100 >= 53 { (w / 100 + 1) * 100 + 1 } else { w + 1 };
            }
            v
        }
        _ => vec![],
    };
    let idx: HashMap<i32, usize> = weeks.iter().enumerate().map(|(i, w)| (*w, i)).collect();
    let nw = weeks.len();
    let mut groups: BTreeMap<String, (Vec<i64>, Vec<i64>, i64, i64)> = BTreeMap::new();
    let (mut tc, mut td, mut ta, mut tk) = (vec![0i64; nw], vec![0i64; nw], vec![0i64; nw], vec![0i64; nw]);
    for r in &rows {
        let w = r.get::<_, i32>(0) * 100 + r.get::<_, i32>(1);
        let Some(&i) = idx.get(&w) else { continue };
        let (cs, ds, al, kl): (i64, i64, i64, i64) = (r.get(3), r.get(4), r.get(5), r.get(6));
        let g = groups.entry(r.get::<_, String>(2)).or_insert_with(|| (vec![0; nw], vec![0; nw], 0, 0));
        g.0[i] += cs; g.1[i] += ds; g.2 += cs; g.3 += ds;
        tc[i] += cs; td[i] += ds; ta[i] += al; tk[i] += kl;
    }
    let mut gl: Vec<(String, (Vec<i64>, Vec<i64>, i64, i64))> = groups.into_iter().collect();
    gl.sort_by(|x, y| y.1.2.cmp(&x.1.2));
    if gl.len() > top + 1 {
        let rest: Vec<_> = gl.split_off(top);
        let mut o = (vec![0i64; nw], vec![0i64; nw], 0i64, 0i64);
        for (_, g) in rest { for i in 0..nw { o.0[i] += g.0[i]; o.1[i] += g.1[i]; } o.2 += g.2; o.3 += g.3; }
        gl.push(("Lainnya".into(), o));
    }
    let wk_out: Vec<Value> = (0..nw).map(|i| {
        let ma = if i + 1 >= ma_n { Some(tc[i + 1 - ma_n..=i].iter().sum::<i64>() as f64 / ma_n as f64) } else { None };
        let thr = if i >= base_n {
            let b = &tc[i - base_n..i];
            let m = b.iter().sum::<i64>() as f64 / base_n as f64;
            let sd = (b.iter().map(|x| (*x as f64 - m).powi(2)).sum::<f64>() / (base_n as f64 - 1.0)).sqrt();
            Some(m + sd_k * sd)
        } else { None };
        let pv = prev.get(&weeks[i]);
        json!({ "year": weeks[i] / 100, "week": weeks[i] % 100, "label": format!("M{}/{:02}", weeks[i] % 100, (weeks[i] / 100) % 100),
            "cases": tc[i], "deaths": td[i], "alerts": ta[i], "klb_alerts": tk[i], "ma": ma, "threshold": thr,
            "above": thr.map(|t| tc[i] as f64 > t).unwrap_or(false),
            "prev_cases": pv.map(|x| x.0), "prev_deaths": pv.map(|x| x.1) })
    }).collect();
    let (sc, sd): (i64, i64) = (tc.iter().sum(), td.iter().sum());
    Ok(Json(json!({ "success": true, "data": {
        "group": group, "weeks": wk_out,
        "groups": gl.iter().map(|(k, g)| json!({ "label": k, "cases": g.0, "deaths": g.1, "total_cases": g.2, "total_deaths": g.3 })).collect::<Vec<_>>(),
        "totals": { "cases": sc, "deaths": sd, "cfr": wilson(sd, sc) },
        "prev_available": !prev.is_empty(), "prev_year": if a.w0 > 0 { Some(a.w0 / 100 - 1) } else { None },
        "config": { "ma_weeks": ma_n, "baseline_weeks": base_n, "sd_k": sd_k, "max_kasus_per_alert": if cap == i64::MAX { None } else { Some(cap) } },
        "outliers": out_cur, "outliers_prev": out_prev,
        "filters": { "scope": f.scope, "disease": f.disease_label() },
    }})))
}

/// GET /api/v1/alert-skdr — seksi Alert, CFR dan 7-1-7 dari Alert SKDR.
pub async fn alert_skdr(State(s): State<AppState>, Query(q): Query<DashQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let f = resolve(&c, &q).await?;
    let a = af(&q, &f);
    let cf = setting(&c, "epicurve_config").await?;
    let notif_days = num(&cf, "t717_notify_days").unwrap_or(1.0) as i32;
    let cap = cap(&cf);
    let (kse, kde) = (ks(cap), kd(cap));
    let p: Vec<&(dyn ToSql + Sync)> = a.p().to_vec();
    let from = format!("FROM skdr_alert_fakta a LEFT JOIN master_diseases d ON d.id = a.disease_id WHERE {AW}");
    // lag = tanggal verifikasi - akhir minggu epid (Sabtu)
    let lag = "(a.tgl_verifikasi::date - (to_date(a.tahun::text || lpad(a.minggu::text, 2, '0'), 'IYYYIW') + 5))";
    let k = c.query_one(&format!(
        "SELECT COUNT(*)::bigint, COUNT(*) FILTER (WHERE a.sts_verif)::bigint, COUNT(*) FILTER (WHERE a.is_klb)::bigint,
                COUNT(*) FILTER (WHERE a.respon24_ok)::bigint, COALESCE(SUM({kse}),0)::bigint, COALESCE(SUM({kde}),0)::bigint,
                COUNT(DISTINCT a.unit_id)::bigint, COUNT(*) FILTER (WHERE a.tgl_verifikasi IS NOT NULL)::bigint,
                COUNT(*) FILTER (WHERE a.tgl_verifikasi IS NOT NULL AND {lag} <= {notif_days})::bigint,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY {lag})::float8,
                COUNT(*) FILTER (WHERE a.sts_verif AND a.respon24_ok)::bigint {from}"), &p).await.map_err(internal)?;
    let st = c.query(&format!(
        "SELECT CASE WHEN a.sts_verif THEN 'Terverifikasi' ELSE 'Belum diverifikasi' END,
                CASE COALESCE(a.klb_kode,'') WHEN '1' THEN 'KLB' WHEN '2' THEN 'Bukan KLB' WHEN '0' THEN 'Belum ditetapkan' ELSE 'Tidak diisi' END,
                COUNT(*)::bigint {from} GROUP BY 1, 2 ORDER BY 3 DESC"), &p).await.map_err(internal)?;
    let dis = c.query(&format!(
        "SELECT COALESCE(d.name, a.nama_penyakit, 'Tidak diketahui'), COUNT(*)::bigint, COUNT(*) FILTER (WHERE a.sts_verif)::bigint,
                COUNT(*) FILTER (WHERE a.is_klb)::bigint, COUNT(*) FILTER (WHERE a.respon24_ok)::bigint,
                COALESCE(SUM({kse}),0)::bigint, COALESCE(SUM({kde}),0)::bigint,
                COUNT(*) FILTER (WHERE a.tgl_verifikasi IS NOT NULL)::bigint,
                COUNT(*) FILTER (WHERE a.tgl_verifikasi IS NOT NULL AND {lag} <= {notif_days})::bigint,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY {lag})::float8
         {from} GROUP BY 1 ORDER BY 2 DESC"), &p).await.map_err(internal)?;
    let trend = c.query(&format!(
        "SELECT a.tahun, a.minggu, COUNT(*)::bigint, COUNT(*) FILTER (WHERE a.sts_verif)::bigint, COUNT(*) FILTER (WHERE a.respon24_ok)::bigint
         {from} GROUP BY 1, 2 ORDER BY 1, 2"), &p).await.map_err(internal)?;
    let outl = outliers(&c, &p, cap).await?;
    let n = |r: &tokio_postgres::Row, i: usize| r.get::<_, i64>(i);
    let stage = |den: i64, ok: i64, known: i64, med: Option<f64>| json!({ "den": den, "on_time": ok, "late": known - ok, "missing": den - known,
        "pct": if known > 0 { Some(ok as f64 * 100.0 / known as f64) } else { None }, "median_days": med });
    Ok(Json(json!({ "success": true, "data": {
        "kpis": { "alerts": n(&k,0), "verified": n(&k,1), "klb": n(&k,2), "respon24": n(&k,3), "cases": n(&k,4), "deaths": n(&k,5),
                  "units": n(&k,6), "verified_respon24": n(&k,10) },
        "cfr": { "overall": wilson(n(&k,5), n(&k,4)),
                 "by_disease": dis.iter().filter(|r| n(r,5) > 0).map(|r| json!({ "disease": r.get::<_, String>(0), "cfr": wilson(n(r,6), n(r,5)) })).collect::<Vec<_>>() },
        "outliers": outl, "max_kasus_per_alert": if cap == i64::MAX { None } else { Some(cap) },
        "status": st.iter().map(|r| json!({ "verifikasi": r.get::<_, String>(0), "klb": r.get::<_, String>(1), "count": n(r,2) })).collect::<Vec<_>>(),
        "by_disease": dis.iter().map(|r| json!({ "disease": r.get::<_, String>(0), "alerts": n(r,1), "verified": n(r,2), "klb": n(r,3),
            "respon24": n(r,4), "cases": n(r,5), "deaths": n(r,6),
            "notify": stage(n(r,1), n(r,8), n(r,7), r.get::<_, Option<f64>>(9)) })).collect::<Vec<_>>(),
        "trend": trend.iter().map(|r| json!({ "year": r.get::<_, i32>(0), "week": r.get::<_, i32>(1), "alerts": n(r,2), "verified": n(r,3), "respon24": n(r,4) })).collect::<Vec<_>>(),
        "t717": {
            "detection": null,
            "detection_reason": "Belum dapat dihitung: tanggal mulai sakit belum tersedia.",
            "notification": stage(n(&k,0), n(&k,8), n(&k,7), k.get::<_, Option<f64>>(9)),
            "notification_basis": format!("Dari akhir minggu laporan sampai alert diverifikasi; target ≤ {notif_days} hari."),
            "response": stage(n(&k,0), n(&k,3), n(&k,0), None),
            "response_basis": "Alert yang ditanggapi dalam 24 jam.",
        },
        "filters": { "scope": f.scope, "disease": f.disease_label() },
    }})))
}
