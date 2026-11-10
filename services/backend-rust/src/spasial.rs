//! PR 044: Spasial (Dasbor Limited) - peta analisa SKDR IBS & EBS, filter sama dengan Matriks Analisa ([`crate::analisa::Q`]).
//! Sumber data: Laporan EBS, Laporan Agregat IBS (+ Laporan Individu IBS pada daftar) lewat [`crate::analisa::facts`].
//! Laporan EBS/IBS tidak menyimpan koordinat: titik unit pelapor diambil dari `analisa_unit_lokasi` (migrasi 064:
//! koordinat unit pada Alert SKDR, cadangan master_fasyankes). Unit tanpa koordinat diletakkan di pusat kab/kota dan
//! ditandai `ap` (perkiraan) - tidak pernah dianggap lokasi persis. Choropleth memakai kode BPS wilayah
//! (master_locations.code / master_kabkota.code = id_provinsi / kode_kab pada GeoJSON public/data).
use axum::{extract::{Query, State}, Json};
use chrono::{Duration, NaiveDate};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicI64, Ordering};

use crate::analisa::{chg, facts, fmt_n, meta, names, pct, wilson, wlabel, F, P, Q, Src};
use crate::dasbor_ebs_ibs::opt_str;
use crate::{internal, ApiError, AppState};

/// Batas minggu untuk seri putar ulang per minggu (lebih panjang: seri tidak dikirim).
const MAX_SERI: i64 = 60;
const MAX_TITIK: usize = 25_000;

static REFRESHED: AtomicI64 = AtomicI64::new(0);

/// Refresh `analisa_unit_lokasi` di latar belakang, paling sering satu kali per 12 jam per proses backend.
fn refresh_lokasi(st: &AppState) {
    let now = chrono::Utc::now().timestamp();
    let last = REFRESHED.load(Ordering::Relaxed);
    if now - last < 12 * 3600 || REFRESHED.compare_exchange(last, now, Ordering::SeqCst, Ordering::Relaxed).is_err() { return; }
    let pool = st.pool.clone();
    tokio::spawn(async move {
        if let Ok(c) = pool.get().await {
            if let Err(e) = c.batch_execute("REFRESH MATERIALIZED VIEW CONCURRENTLY analisa_unit_lokasi").await {
                tracing::warn!("refresh analisa_unit_lokasi gagal: {e}");
            }
        }
    });
}

fn weeks_of(a: NaiveDate, b: NaiveDate) -> Vec<NaiveDate> {
    let mut v = vec![];
    let mut d = a;
    while d <= b { v.push(d); d += Duration::days(7); }
    v
}

fn cfr(m: i64, k: i64) -> Value { if k > 0 { json!((m as f64 * 1000.0 / k as f64).round() / 10.0) } else { Value::Null } }

struct Wil { id: i32, code: String, name: String, lat: Option<f64>, lon: Option<f64> }

async fn wilayah(c: &deadpool_postgres::Object, prov: Option<i32>) -> Result<Vec<Wil>, ApiError> {
    let rows = match prov {
        None => c.query("SELECT id, COALESCE(code, ''), name, latitude, longitude FROM master_locations ORDER BY name", &[]).await,
        Some(p) => c.query("SELECT id, COALESCE(code, ''), name, latitude, longitude FROM master_kabkota WHERE province_id = $1 ORDER BY name", &[&p]).await,
    }.map_err(internal)?;
    Ok(rows.iter().map(|r| Wil { id: r.get(0), code: r.get(1), name: r.get(2), lat: r.get(3), lon: r.get(4) }).collect())
}

#[derive(Default, Clone, Copy)]
struct Agg { k: i64, m: i64, l: i64, a: i64, b: i64 }
impl Agg {
    fn add(&mut self, o: &Agg) { self.k += o.k; self.m += o.m; self.l += o.l; self.a += o.a; self.b += o.b; }
}

// ─── GET /api/v1/analisa/spasial ─────────────────────────────────────────────
/// Choropleth (provinsi; bila satu provinsi dipilih: kab/kota provinsi itu), titik unit pelapor, ringkasan, interpretasi.
pub async fn spasial(State(st): State<AppState>, Query(q): Query<Q>) -> Result<Json<Value>, ApiError> {
    let t0 = std::time::Instant::now();
    refresh_lokasi(&st);
    let c = st.pool.get().await.map_err(internal)?;
    let f = F::from(&q);
    let nm = names(&c).await?;
    let nw = (f.d1 - f.d0).num_days() / 7 + 1;
    let pd0 = f.d0 - Duration::weeks(nw);
    let last = f.d1;
    let before = f.d1 - Duration::days(7);
    let weeks = weeks_of(f.d0, f.d1);
    let widx: HashMap<NaiveDate, usize> = weeks.iter().enumerate().map(|(i, d)| (*d, i)).collect();
    let seri = nw <= MAX_SERI;

    // Wilayah choropleth: filter kab/kecamatan tidak dipakai agar seluruh kab/kota provinsi tetap terlihat (yang dipilih disorot).
    let prov1 = if f.prov.len() == 1 { Some(f.prov[0]) } else { None };
    let lv_kab = prov1.is_some();
    let mut fa = F::from(&q);
    fa.kab.clear();
    fa.kec = None;
    let wl = wilayah(&c, prov1).await?;
    let key = if lv_kab { "f.kab" } else { "f.prov" };
    let mut p = P::default();
    let src = facts(&fa, &mut p, pd0, f.d1, false);
    let qa = format!("SELECT {key}, f.ws, COALESCE(sum(f.kasus), 0)::bigint, COALESCE(sum(f.mati), 0)::bigint, count(DISTINCT f.src || f.id)::bigint,
                             count(*) FILTER (WHERE f.alert)::bigint, count(*) FILTER (WHERE f.klb = 'Ya')::bigint
                      FROM {src} GROUP BY 1, 2");
    let mut p2 = P::default();
    let src2 = facts(&fa, &mut p2, f.d0, f.d1, false);
    let qu = format!("SELECT {key}, count(DISTINCT f.ukey)::bigint FROM {src2} GROUP BY 1");
    // Ringkasan memakai filter lengkap (termasuk kab/kecamatan).
    let mut p3 = P::default();
    let src3 = facts(&f, &mut p3, pd0, f.d1, false);
    let qt = format!("SELECT f.ws, COALESCE(sum(f.kasus), 0)::bigint, COALESCE(sum(f.mati), 0)::bigint, count(DISTINCT f.src || f.id)::bigint,
                             count(*) FILTER (WHERE f.alert)::bigint, count(*) FILTER (WHERE f.klb = 'Ya')::bigint
                      FROM {src3} GROUP BY 1");
    let mut p4 = P::default();
    let src4 = facts(&f, &mut p4, f.d0, f.d1, false);
    let qp = format!(
        "WITH x AS (SELECT f.src, f.ukey, f.ws, min(f.unit) AS unit, min(f.kab) AS kab, min(f.prov) AS prov, min(f.kec) AS kec, min(f.jenis_unit) AS ju,
                           COALESCE(sum(f.kasus), 0)::bigint AS k, COALESCE(sum(f.mati), 0)::bigint AS m, count(DISTINCT f.id)::bigint AS l,
                           count(*) FILTER (WHERE f.alert)::bigint AS a, count(*) FILTER (WHERE f.klb = 'Ya')::bigint AS b,
                           count(*) FILTER (WHERE f.verif = 'Terverifikasi')::bigint AS v, count(*) FILTER (WHERE f.verif = 'Discarded')::bigint AS d,
                           count(*) FILTER (WHERE f.respon = '≤ 24 jam')::bigint AS r, count(*) FILTER (WHERE f.respon IS NOT NULL)::bigint AS rn
                    FROM {src4} GROUP BY 1, 2, 3),
              u AS (SELECT src, ukey, min(unit) AS unit, min(kab) AS kab, min(prov) AS prov, min(kec) AS kec, min(ju) AS ju FROM x GROUP BY 1, 2),
              g AS (SELECT u.*, COALESCE(lk.lat, ln.lat) AS lat, COALESCE(lk.lon, ln.lon) AS lon, COALESCE(lk.sumber, ln.sumber) AS sb
                    FROM u LEFT JOIN analisa_unit_lokasi lk ON u.src <> 'ebs' AND lk.kunci = 'k:' || u.ukey
                           LEFT JOIN analisa_unit_lokasi ln ON ln.kunci = 'n:' || skdr_norm_nama(u.unit) || '|' || u.kab)
         SELECT g.src, g.ukey, g.unit, g.kab, g.prov, g.kec, g.ju, g.lat, g.lon, g.sb, x.ws, x.k, x.m, x.l, x.a, x.b, x.v, x.d, x.r, x.rn
         FROM x JOIN g USING (src, ukey)");
    let (b1, b2, b3, b4) = (p.refs(), p2.refs(), p3.refs(), p4.refs());
    let (ra, ru, rt, rp, rc) = tokio::try_join!(
        c.query(&qa, &b1), c.query(&qu, &b2), c.query(&qt, &b3), c.query(&qp, &b4),
        c.query("SELECT 'k', id, latitude, longitude FROM master_kabkota WHERE latitude IS NOT NULL UNION ALL
                 SELECT 'p', id, latitude, longitude FROM master_locations WHERE latitude IS NOT NULL", &[])
    ).map_err(internal)?;

    // ── wilayah ──
    let mut cur: HashMap<i32, Agg> = HashMap::new();
    let mut prev: HashMap<i32, i64> = HashMap::new();
    let mut wk: HashMap<(i32, NaiveDate), i64> = HashMap::new();
    let mut ser: HashMap<i32, Vec<Agg>> = HashMap::new();
    let mut tanpa_wil = Agg::default();
    for r in &ra {
        let id: Option<i32> = r.get(0);
        let ws: NaiveDate = r.get(1);
        let g = Agg { k: r.get(2), m: r.get(3), l: r.get(4), a: r.get(5), b: r.get(6) };
        let Some(id) = id else { if ws >= f.d0 { tanpa_wil.add(&g); } continue; };
        *wk.entry((id, ws)).or_default() += g.k;
        if ws >= f.d0 {
            cur.entry(id).or_default().add(&g);
            if seri { if let Some(i) = widx.get(&ws) { ser.entry(id).or_insert_with(|| vec![Agg::default(); weeks.len()])[*i].add(&g); } }
        } else { *prev.entry(id).or_default() += g.k; }
    }
    let units: HashMap<i32, i64> = ru.iter().filter_map(|r| r.get::<_, Option<i32>>(0).map(|i| (i, r.get::<_, i64>(1)))).collect();
    let tot_k: i64 = cur.values().map(|a| a.k).sum();
    let mut areas: Vec<Value> = wl.iter().map(|w| {
        let a = cur.get(&w.id).copied().unwrap_or_default();
        let pv = prev.get(&w.id).copied().unwrap_or(0);
        let (x1, x0) = (wk.get(&(w.id, last)).copied().unwrap_or(0), wk.get(&(w.id, before)).copied().unwrap_or(0));
        let s = if seri {
            let v = ser.get(&w.id).cloned().unwrap_or_else(|| vec![Agg::default(); weeks.len()]);
            json!({ "k": v.iter().map(|x| x.k).collect::<Vec<_>>(), "m": v.iter().map(|x| x.m).collect::<Vec<_>>(), "l": v.iter().map(|x| x.l).collect::<Vec<_>>(),
                    "a": v.iter().map(|x| x.a).collect::<Vec<_>>(), "b": v.iter().map(|x| x.b).collect::<Vec<_>>() })
        } else { Value::Null };
        json!({ "id": w.id, "code": w.code, "nama": w.name, "lat": w.lat, "lon": w.lon,
                "kasus": a.k, "kematian": a.m, "laporan": a.l, "alert": a.a, "klb": a.b, "unit": units.get(&w.id).copied().unwrap_or(0),
                "cfr": cfr(a.m, a.k), "porsi": pct(a.k, tot_k), "kasus_prev": pv, "chg_periode": chg(a.k, pv),
                "minggu_ini": x1, "minggu_lalu": x0, "chg_minggu": chg(x1, x0), "seri": s,
                "dipilih": if lv_kab { f.kab.contains(&w.id) } else { f.prov.contains(&w.id) } })
    }).collect();
    areas.sort_by(|a, b| b["kasus"].as_i64().cmp(&a["kasus"].as_i64()));

    // ── ringkasan (filter lengkap) ──
    let (mut tc, mut tp, mut t1, mut t0w) = (Agg::default(), Agg::default(), 0i64, 0i64);
    let mut kurva = vec![Agg::default(); weeks.len()];
    for r in &rt {
        let ws: NaiveDate = r.get(0);
        let g = Agg { k: r.get(1), m: r.get(2), l: r.get(3), a: r.get(4), b: r.get(5) };
        if ws >= f.d0 { tc.add(&g); if let Some(i) = widx.get(&ws) { kurva[*i].add(&g); } } else { tp.add(&g); }
        if ws == last { t1 += g.k; }
        if ws == before { t0w += g.k; }
    }

    // ── titik unit pelapor ──
    let mut cen: HashMap<(char, i32), (f64, f64)> = HashMap::new();
    for r in &rc {
        let t: String = r.get(0);
        if let (Some(la), Some(lo)) = (r.get::<_, Option<f64>>(2), r.get::<_, Option<f64>>(3)) { cen.insert((t.chars().next().unwrap_or('k'), r.get(1)), (la, lo)); }
    }
    struct Pt { src: String, unit: Option<String>, kab: Option<i32>, prov: Option<i32>, kec: Option<String>, ju: Option<String>,
                lat: Option<f64>, lon: Option<f64>, sb: Option<String>, t: [i64; 9], w: Vec<[i64; 4]> }
    let mut pts: Vec<Pt> = vec![];
    let mut pidx: HashMap<(String, String), usize> = HashMap::new();
    for r in &rp {
        let k = (r.get::<_, String>(0), r.get::<_, String>(1));
        let i = *pidx.entry(k.clone()).or_insert_with(|| {
            pts.push(Pt { src: k.0.clone(), unit: r.get(2), kab: r.get(3), prov: r.get(4), kec: r.get(5), ju: r.get(6),
                          lat: r.get(7), lon: r.get(8), sb: r.get(9), t: [0; 9], w: vec![] });
            pts.len() - 1
        });
        let ws: NaiveDate = r.get(10);
        let v: [i64; 9] = [r.get(11), r.get(12), r.get(13), r.get(14), r.get(15), r.get(16), r.get(17), r.get(18), r.get(19)];
        for j in 0..9 { pts[i].t[j] += v[j]; }
        if seri { if let Some(wi) = widx.get(&ws) { if v[0] > 0 || v[3] > 0 { pts[i].w.push([*wi as i64, v[0], v[3], v[4]]); } } }
    }
    pts.sort_by(|a, b| b.t[0].cmp(&a.t[0]));
    let (mut n_persis, mut n_kira, mut n_tanpa, mut k_persis, mut k_kira) = (0i64, 0i64, 0i64, 0i64, 0i64);
    let mut titik: Vec<Value> = vec![];
    let mut kab_used: std::collections::BTreeSet<i32> = Default::default();
    for pt in pts.iter() {
        let (lat, lon, ap) = match (pt.lat, pt.lon) {
            (Some(a), Some(b)) => (a, b, false),
            _ => match pt.kab.and_then(|k| cen.get(&('k', k))).or_else(|| pt.prov.and_then(|p| cen.get(&('p', p)))) {
                Some(&(a, b)) => (a, b, true),
                None => { n_tanpa += 1; continue; }
            },
        };
        if ap { n_kira += 1; k_kira += pt.t[0]; } else { n_persis += 1; k_persis += pt.t[0]; }
        if titik.len() >= MAX_TITIK { continue; }
        let [k, m, l, a, b, v, d, r24, rn] = pt.t;
        let st = if b > 0 { "klb" } else if pt.src == "ebs" {
            if v > 0 { "verif" } else if d > 0 && d == l { "discarded" } else { "rumor" }
        } else if a > 0 && v > 0 { "verif" } else if a > 0 { "alert" } else { "lapor" };
        let sb = if ap { "c" } else if pt.sb.as_deref() == Some("Alert SKDR") { "a" } else { "f" };
        if let Some(kb) = pt.kab { kab_used.insert(kb); }
        titik.push(json!([pt.src, pt.unit, pt.kab, pt.kec, pt.ju, lat, lon, sb, k, m, l, a, b, v, r24, rn, st, pt.w]));
    }

    // ── interpretasi ──
    let lvl = if lv_kab { "kab/kota" } else { "provinsi" };
    let m = meta(&f, &nm);
    let per = m["periode_label"].as_str().unwrap_or("").to_string();
    let mut it: Vec<String> = vec![];
    if tc.k == 0 && tc.l == 0 {
        it.push(format!("{per}: tidak ada laporan {} untuk filter ini.", m["sumber_label"].as_str().unwrap_or("")));
    } else {
        let n_area = areas.iter().filter(|a| a["kasus"].as_i64().unwrap_or(0) > 0).count();
        let cfr_s = cfr(tc.m, tc.k).as_f64().map(|x| format!("{}%", x.to_string().replace('.', ","))).unwrap_or_else(|| "–".into());
        let scope = m["breadcrumb"].as_array().and_then(|b| b.last()).and_then(|x| x["label"].as_str()).unwrap_or("Indonesia").to_string();
        if f.kab.is_empty() && f.kec.is_none() {
            it.push(format!("{per}: {} kasus dan {} kematian (CFR {cfr_s}) dari {} laporan; kasus tersebar di {n_area} dari {} {lvl}.", fmt_n(tc.k), fmt_n(tc.m), fmt_n(tc.l), wl.len()));
        } else {
            it.push(format!("{per}, {scope}: {} kasus dan {} kematian (CFR {cfr_s}) dari {} laporan.", fmt_n(tc.k), fmt_n(tc.m), fmt_n(tc.l)));
            if let Some(pos) = areas.iter().position(|a| a["dipilih"].as_bool() == Some(true)) {
                it.push(format!("{} berada di peringkat {} dari {} kab/kota di provinsi menurut jumlah kasus.", areas[pos]["nama"].as_str().unwrap_or(""), pos + 1, areas.len()));
            }
        }
        let top: Vec<String> = areas.iter().take(3).filter(|a| a["kasus"].as_i64().unwrap_or(0) > 0)
            .map(|a| format!("{} ({}; {}%)", a["nama"].as_str().unwrap_or(""), fmt_n(a["kasus"].as_i64().unwrap_or(0)), a["porsi"].as_f64().unwrap_or(0.0).to_string().replace('.', ","))).collect();
        if !top.is_empty() { it.push(format!("{}asus terbanyak: {}.", if f.kab.is_empty() { "K" } else { "Di provinsi, k" }, top.join(", "))); }
        let mut naik: Vec<&Value> = areas.iter().filter(|a| a["minggu_ini"].as_i64().unwrap_or(0) >= 10 && a["chg_minggu"].as_f64().unwrap_or(0.0) >= 50.0).collect();
        naik.sort_by(|a, b| b["chg_minggu"].as_f64().partial_cmp(&a["chg_minggu"].as_f64()).unwrap_or(std::cmp::Ordering::Equal));
        if nw >= 1 && !naik.is_empty() {
            let s: Vec<String> = naik.iter().take(3).map(|a| format!("{} ({} → {})", a["nama"].as_str().unwrap_or(""), fmt_n(a["minggu_lalu"].as_i64().unwrap_or(0)), fmt_n(a["minggu_ini"].as_i64().unwrap_or(0)))).collect();
            it.push(format!("{} {lvl} naik ≥ 50% pada {} dibanding minggu sebelumnya: {}.", naik.len(), wlabel(last), s.join(", ")));
        }
        if tc.a > 0 {
            it.push(if f.src == Src::Ebs { format!("{} sinyal EBS, {} memenuhi kriteria KLB.", fmt_n(tc.a), fmt_n(tc.b)) }
                    else { format!("{} alert/sinyal, {} KLB.", fmt_n(tc.a), fmt_n(tc.b)) });
        }
        let nu = n_persis + n_kira + n_tanpa;
        if nu > 0 {
            it.push(format!("Titik: {} unit pelapor, {} berkoordinat unit ({} kasus) dan {} diletakkan di pusat kab/kota karena koordinat unit tidak tersedia.",
                fmt_n(nu), pct(n_persis, nu).as_f64().map(|x| format!("{}%", x.to_string().replace('.', ","))).unwrap_or_default(),
                pct(k_persis, k_persis + k_kira).as_f64().map(|x| format!("{}%", x.to_string().replace('.', ","))).unwrap_or_default(),
                fmt_n(n_kira)));
        }
    }

    Ok(Json(json!({
        "success": true, "meta": m, "level": if lv_kab { "kabkota" } else { "provinsi" }, "prov": prov1, "kab": f.kab, "kec": f.kec,
        "minggu": weeks.iter().map(|d| json!({ "ws": d.to_string(), "label": wlabel(*d) })).collect::<Vec<_>>(), "seri": seri,
        "minggu_ini": wlabel(last), "minggu_lalu": wlabel(before),
        "ringkasan": {
            "kasus": tc.k, "kematian": tc.m, "laporan": tc.l, "alert": tc.a, "klb": tc.b, "cfr": cfr(tc.m, tc.k), "cfr_ci": wilson(tc.m, tc.k),
            "prev": { "kasus": tp.k, "kematian": tp.m, "laporan": tp.l, "alert": tp.a, "klb": tp.b },
            "chg": { "kasus": chg(tc.k, tp.k), "kematian": chg(tc.m, tp.m), "laporan": chg(tc.l, tp.l), "alert": chg(tc.a, tp.a), "klb": chg(tc.b, tp.b) },
            "minggu_ini": t1, "minggu_lalu": t0w, "chg_minggu": chg(t1, t0w),
            "kurva": kurva.iter().zip(weeks.iter()).map(|(a, d)| json!({ "ws": d.to_string(), "label": wlabel(*d), "kasus": a.k, "kematian": a.m, "alert": a.a, "klb": a.b })).collect::<Vec<_>>(),
            "unit": n_persis + n_kira + n_tanpa, "unit_persis": n_persis, "unit_perkiraan": n_kira, "unit_tanpa_lokasi": n_tanpa,
            "kasus_persis": k_persis, "kasus_perkiraan": k_kira, "tanpa_wilayah": tanpa_wil.k,
        },
        "wilayah": areas, "titik": titik, "titik_terpotong": titik.len() >= MAX_TITIK,
        "titik_kolom": ["src", "unit", "kab_id", "kec", "jenis_unit", "lat", "lon", "lokasi", "kasus", "kematian", "laporan", "alert", "klb", "verif", "respon24", "respon_n", "status", "w"],
        "lokasi_label": { "a": "Koordinat unit (Alert SKDR)", "f": "Koordinat fasyankes (master fasyankes)", "c": "Pusat kab/kota (perkiraan)" },
        "kab_nama": kab_used.iter().map(|k| (k.to_string(), json!(nm.kab.get(k)))).collect::<serde_json::Map<String, Value>>(),
        "interpretasi": it, "ms": t0.elapsed().as_millis(),
    })))
}

// ─── GET /api/v1/analisa/spasial/wilayah?wlv=prov|kab&wid= ───────────────────
/// Detail satu wilayah (panel kanan): penyakit teratas, unit/kecamatan teratas, kurva mingguan.
pub async fn wilayah_detail(State(st): State<AppState>, Query(q): Query<Q>) -> Result<Json<Value>, ApiError> {
    let t0 = std::time::Instant::now();
    let c = st.pool.get().await.map_err(internal)?;
    let mut f = F::from(&q);
    let wid = q.wid.ok_or_else(|| crate::bad_request("wid wajib"))?;
    let kab = opt_str(&q.wlv).as_deref() == Some("kab");
    if kab { f.kab = vec![wid]; } else { f.prov = vec![wid]; f.kab.clear(); }
    f.kec = None;
    let nm = names(&c).await?;
    let agg = "COALESCE(sum(f.kasus), 0)::bigint, COALESCE(sum(f.mati), 0)::bigint, count(DISTINCT f.src || f.id)::bigint, count(*) FILTER (WHERE f.alert)::bigint, count(*) FILTER (WHERE f.klb = 'Ya')::bigint";
    let mk = |p: &mut P| facts(&f, p, f.d0, f.d1, false);
    let (mut p1, mut p2, mut p3, mut p4) = (P::default(), P::default(), P::default(), P::default());
    let q1 = format!("SELECT f.pkey, min(f.pnama), {agg} FROM {} GROUP BY 1 ORDER BY 3 DESC, 2 LIMIT 8", mk(&mut p1));
    let q2 = format!("SELECT f.ukey, min(f.unit), {agg}, min(f.kec) FROM {} GROUP BY 1 ORDER BY 3 DESC, 2 LIMIT 8", mk(&mut p2));
    let q3 = format!("SELECT f.ws, NULL::text, {agg} FROM {} GROUP BY 1 ORDER BY 1", mk(&mut p3));
    let q4 = if kab { format!("SELECT COALESCE(f.kec, '(Belum diisi)'), NULL::text, {agg} FROM {} GROUP BY 1 ORDER BY 3 DESC LIMIT 8", mk(&mut p4)) }
             else { format!("SELECT COALESCE(f.kab::text, ''), NULL::text, {agg} FROM {} GROUP BY 1 ORDER BY 3 DESC LIMIT 8", mk(&mut p4)) };
    let (a1, a2, a3, a4) = (p1.refs(), p2.refs(), p3.refs(), p4.refs());
    let (r1, r2, r3, r4) = tokio::try_join!(c.query(&q1, &a1), c.query(&q2, &a2), c.query(&q3, &a3), c.query(&q4, &a4)).map_err(internal)?;
    let row = |r: &tokio_postgres::Row, nama: String| {
        let (k, m): (i64, i64) = (r.get(2), r.get(3));
        json!({ "nama": nama, "kasus": k, "kematian": m, "laporan": r.get::<_, i64>(4), "alert": r.get::<_, i64>(5), "klb": r.get::<_, i64>(6), "cfr": cfr(m, k) })
    };
    let weeks = weeks_of(f.d0, f.d1);
    let by: HashMap<NaiveDate, &tokio_postgres::Row> = r3.iter().map(|r| (r.get::<_, NaiveDate>(0), r)).collect();
    let kurva: Vec<Value> = weeks.iter().map(|d| match by.get(d) {
        Some(r) => json!({ "label": wlabel(*d), "kasus": r.get::<_, i64>(2), "kematian": r.get::<_, i64>(3), "alert": r.get::<_, i64>(5) }),
        None => json!({ "label": wlabel(*d), "kasus": 0, "kematian": 0, "alert": 0 }),
    }).collect();
    let nama = if kab { nm.kab.get(&wid).cloned() } else { nm.prov.get(&wid).cloned() }.unwrap_or_else(|| wid.to_string());
    Ok(Json(json!({
        "success": true, "nama": nama, "level": if kab { "kabkota" } else { "provinsi" },
        "penyakit": r1.iter().map(|r| row(r, r.get::<_, Option<String>>(1).unwrap_or_default())).collect::<Vec<_>>(),
        "unit": r2.iter().map(|r| { let mut v = row(r, r.get::<_, Option<String>>(1).unwrap_or_else(|| "(Belum diisi)".into())); v["kecamatan"] = json!(r.get::<_, Option<String>>(7)); v }).collect::<Vec<_>>(),
        "sub": r4.iter().map(|r| { let k: String = r.get(0); row(r, if kab { k } else { k.parse::<i32>().ok().and_then(|i| nm.kab.get(&i).cloned()).unwrap_or(k) }) }).collect::<Vec<_>>(),
        "sub_label": if kab { "Kecamatan" } else { "Kab/Kota" }, "kurva": kurva, "ms": t0.elapsed().as_millis(),
    })))
}

// ─── GET /api/v1/analisa/spasial/daftar ──────────────────────────────────────
/// Tabel di bawah peta (pengganti tabel Pemetaan lama): satu baris per laporan × penyakit, dengan koordinat unit.
/// `jenis=alert` (IBS: hanya baris dengan alert; default IBS) | `semua`. Laporan EBS: setiap laporan = satu sinyal.
pub async fn daftar(State(st): State<AppState>, Query(q): Query<Q>) -> Result<Json<Value>, ApiError> {
    let t0 = std::time::Instant::now();
    let c = st.pool.get().await.map_err(internal)?;
    let f = F::from(&q);
    let nm = names(&c).await?;
    let per = q.per.unwrap_or(25).clamp(1, 10000);
    let page = q.page.unwrap_or(1).max(1);
    let off = (page - 1) * per;
    let alert_only = q.jenis.as_deref().unwrap_or(if f.src == Src::Ibs { "alert" } else { "semua" }) == "alert";
    let order = match q.urut.as_deref() { Some("kasus") => "x.kasus DESC, x.tgl DESC, x.no DESC", Some("wilayah") => "x.prov, x.kab, x.kec, x.unit, x.tgl DESC", _ => "x.tgl DESC, x.no DESC, x.pnama" };
    let mut p = P::default();
    let src = facts(&f, &mut p, f.d0, f.d1, false);
    let mut w = vec![];
    if alert_only { w.push("f.alert".to_string()); }
    if let Some(k) = q.kasus_min.filter(|k| *k > 0) { w.push(format!("f.kasus >= {}", p.add(k as i32))); }
    if let Some(s) = opt_str(&q.q) {
        let v = p.add(format!("%{}%", s.replace('%', "").replace('_', "")));
        w.push(format!("(f.no ILIKE {v} OR f.unit ILIKE {v} OR f.pnama ILIKE {v} OR f.kec ILIKE {v})"));
    }
    let extra = if w.is_empty() { String::new() } else { format!(" AND {}", w.join(" AND ")) };
    let sql = format!(
        "SELECT y.*, COALESCE(lk.lat, ln.lat) AS lat, COALESCE(lk.lon, ln.lon) AS lon FROM (
           SELECT x.*, count(*) OVER () AS total FROM (
             SELECT f.src, f.id, f.no, f.tgl, f.ws, f.prov, f.kab, f.kec, f.unit, f.ukey, f.jenis_unit, f.kelompok, f.pnama, f.kasus, f.mati, f.lab,
                    f.alert, f.klb, f.verif, f.respon, f.status_rumor, f.klb_status, f.w1, f.sumber_info, f.spesimen
             FROM {src}{extra}) x
           ORDER BY {order} LIMIT {per} OFFSET {off}) y
         LEFT JOIN analisa_unit_lokasi lk ON y.src <> 'ebs' AND lk.kunci = 'k:' || y.ukey
         LEFT JOIN analisa_unit_lokasi ln ON ln.kunci = 'n:' || skdr_norm_nama(y.unit) || '|' || y.kab
         ORDER BY {}", order.replace("x.", "y."));
    let rows = c.query(&sql, &p.refs()).await.map_err(internal)?;
    let mut total = 0i64;
    let data: Vec<Value> = rows.iter().map(|r| {
        total = r.get("total");
        let ws: NaiveDate = r.get("ws");
        let tgl: Option<NaiveDate> = r.get("tgl");
        let prov: Option<i32> = r.get("prov");
        let kab: Option<i32> = r.get("kab");
        let s: String = r.get("src");
        let (y, mg) = crate::dasbor_ebs_ibs::mmwr_week_of(ws);
        json!({
            "src": s, "id": r.get::<_, i64>("id"), "no": r.get::<_, Option<String>>("no"), "minggu": mg, "tahun": y, "minggu_label": wlabel(ws), "tanggal": tgl.map(|d| d.to_string()),
            "provinsi": prov.and_then(|i| nm.prov.get(&i).cloned()), "kabkota": kab.and_then(|i| nm.kab.get(&i).cloned()), "kab_id": kab,
            "kecamatan": r.get::<_, Option<String>>("kec"), "unit": r.get::<_, Option<String>>("unit"), "jenis_unit": r.get::<_, Option<String>>("jenis_unit"),
            "kelompok": r.get::<_, Option<String>>("kelompok"), "penyakit": r.get::<_, Option<String>>("pnama"),
            "kasus": r.get::<_, i32>("kasus"), "kematian": r.get::<_, i32>("mati"), "lab": r.get::<_, i32>("lab"), "alert": r.get::<_, bool>("alert"),
            "klb": r.get::<_, Option<String>>("klb"), "verif": r.get::<_, Option<String>>("verif"), "respon": r.get::<_, Option<String>>("respon"),
            "status_rumor": r.get::<_, Option<String>>("status_rumor"), "klb_status": r.get::<_, Option<String>>("klb_status"), "w1": r.get::<_, Option<String>>("w1"),
            "sumber_info": r.get::<_, Option<String>>("sumber_info"), "spesimen": r.get::<_, Option<String>>("spesimen"),
            "lat": r.get::<_, Option<f64>>("lat"), "lon": r.get::<_, Option<f64>>("lon"),
        })
    }).collect();
    Ok(Json(json!({ "success": true, "meta": meta(&f, &nm), "jenis": if alert_only { "alert" } else { "semua" }, "page": page, "per": per, "total": total, "data": data, "ms": t0.elapsed().as_millis() })))
}
