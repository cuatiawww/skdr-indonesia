//! PR 042: Matriks Analisa (Dasbor Limited) - satu menu analisa untuk SKDR EBS & IBS.
//! Sumber data: view `analisa_ebs_fakta` (Laporan EBS), `analisa_ibs_fakta` (Laporan Agregat IBS) dan
//! `laporan_ibs_individu` (Laporan Individu IBS) - migrasi 063. Filter sama untuk semua endpoint (lihat [`Q`]).
//! Tidak ada angka buatan: penyebut yang tidak tersedia (kunjungan, populasi) dilaporkan sebagai tidak tersedia,
//! dan field yang tidak terisi tampil sebagai "(Belum diisi)". Nama pasien disamarkan; alamat/kronologi tidak dikirim.
use axum::{extract::{Query, State}, Json};
use chrono::{Datelike, Duration, Local, NaiveDate};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
use tokio_postgres::types::ToSql;

use crate::dasbor_ebs_ibs::{csv_ints, csv_text, mmwr_week_of, opt_str, week_label, week_start_date};
use crate::laporan::weeks_in_year;
use crate::{internal, ApiError, AppState};

pub const KOSONG: &str = "(Belum diisi)";

#[derive(Deserialize, Default, Clone)]
pub struct Q {
    pub sumber: Option<String>,
    pub sy: Option<i32>,
    pub sw: Option<i32>,
    pub ey: Option<i32>,
    pub ew: Option<i32>,
    pub prov: Option<String>,
    pub kab: Option<String>,
    pub kec: Option<String>,
    pub penyakit: Option<String>,
    pub jenis_unit: Option<String>,
    pub kelompok: Option<String>,
    pub status_rumor: Option<String>,
    pub klb: Option<String>,
    pub klb_status: Option<String>,
    pub w1: Option<String>,
    pub sumber_info: Option<String>,
    pub spesimen: Option<String>,
    pub respon: Option<String>,
    pub verif: Option<String>,
    pub basis: Option<String>,
    pub periode: Option<String>,
    pub baris: Option<String>,
    pub kolom: Option<String>,
    pub jenis: Option<String>,
    pub page: Option<i64>,
    pub per: Option<i64>,
    pub q: Option<String>,
    pub urut: Option<String>,
    // PR 044 Spasial
    pub kasus_min: Option<i64>,
    pub wlv: Option<String>,
    pub wid: Option<i32>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Src { Ebs, Ibs, Semua }

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Lv { Prov, Kab, Kec, Unit }

impl Lv {
    fn code(self) -> &'static str { match self { Lv::Prov => "provinsi", Lv::Kab => "kabkota", Lv::Kec => "kecamatan", Lv::Unit => "unit" } }
    fn label(self) -> &'static str { match self { Lv::Prov => "Provinsi", Lv::Kab => "Kab/Kota", Lv::Kec => "Kecamatan", Lv::Unit => "Unit pelapor" } }
    fn key(self) -> &'static str {
        match self { Lv::Prov => "COALESCE(f.prov::text, '')", Lv::Kab => "COALESCE(f.kab::text, '')", Lv::Kec => "COALESCE(f.kec, '')", Lv::Unit => "COALESCE(f.unit, '')" }
    }
}

pub struct F {
    pub src: Src,
    pub d0: NaiveDate,
    pub d1: NaiveDate,
    pub prov: Vec<i32>,
    pub kab: Vec<i32>,
    pub kec: Option<String>,
    pub penyakit: Vec<String>,
    pub jenis_unit: Vec<String>,
    pub kelompok: Vec<String>,
    pub status_rumor: Vec<String>,
    pub klb: Vec<String>,
    pub klb_status: Vec<String>,
    pub w1: Vec<String>,
    pub sumber_info: Vec<String>,
    pub spesimen: Vec<String>,
    pub respon: Vec<String>,
    pub verif: Vec<String>,
    pub basis_rumor: bool,
    pub periode: &'static str,
}

impl F {
    pub fn from(q: &Q) -> F {
        let today = Local::now().date_naive();
        let (cy, cw) = mmwr_week_of(today);
        let sy = q.sy.unwrap_or(cy).clamp(2000, 2100);
        let ey = q.ey.unwrap_or(cy).clamp(2000, 2100);
        let sw = q.sw.unwrap_or(1).clamp(1, weeks_in_year(sy));
        let ew = q.ew.unwrap_or(if ey == cy { cw } else { weeks_in_year(ey) }).clamp(1, weeks_in_year(ey));
        let (mut d0, mut d1) = (week_start_date(sy, sw), week_start_date(ey, ew));
        if d1 < d0 { std::mem::swap(&mut d0, &mut d1); }
        if (d1 - d0).num_days() > 7 * 53 * 5 { d0 = d1 - Duration::weeks(53 * 5); }
        let src = match opt_str(&q.sumber).as_deref() { Some("ebs") => Src::Ebs, Some("ibs") | Some("pe") => Src::Ibs, _ => Src::Semua };
        let pipe = |s: &Option<String>| -> Vec<String> {
            s.as_deref().unwrap_or("").split('|').map(|x| x.trim().to_string()).filter(|x| !x.is_empty() && x != "all").collect()
        };
        F {
            src, d0, d1,
            prov: csv_ints(&q.prov), kab: csv_ints(&q.kab), kec: opt_str(&q.kec),
            penyakit: csv_text(&q.penyakit), jenis_unit: pipe(&q.jenis_unit), kelompok: pipe(&q.kelompok),
            status_rumor: pipe(&q.status_rumor), klb: pipe(&q.klb), klb_status: pipe(&q.klb_status), w1: pipe(&q.w1),
            sumber_info: pipe(&q.sumber_info), spesimen: pipe(&q.spesimen), respon: pipe(&q.respon), verif: pipe(&q.verif),
            basis_rumor: q.basis.as_deref() == Some("rumor"),
            periode: match q.periode.as_deref() { Some("bulan") => "bulan", Some("tahun") => "tahun", _ => "minggu" },
        }
    }
    pub fn level(&self) -> Lv {
        if self.kec.is_some() { Lv::Unit } else if !self.kab.is_empty() { Lv::Kec } else if !self.prov.is_empty() { Lv::Kab } else { Lv::Prov }
    }
    fn ebs(&self) -> bool { self.src != Src::Ibs }
    fn ibs(&self) -> bool { self.src != Src::Ebs }
    fn weeks(&self) -> i64 { (self.d1 - self.d0).num_days() / 7 + 1 }
}

/// Positional parameter builder for dynamic SQL (values never interpolated into the SQL text).
#[derive(Default)]
pub struct P { v: Vec<Box<dyn ToSql + Sync + Send>> }
impl P {
    pub fn add<T: ToSql + Sync + Send + 'static>(&mut self, x: T) -> String {
        self.v.push(Box::new(x));
        format!("${}", self.v.len())
    }
    pub fn refs(&self) -> Vec<&(dyn ToSql + Sync)> { self.v.iter().map(|b| &**b as &(dyn ToSql + Sync)).collect() }
}

const COLS: &str = "src, id, no, ws, tgl, prov, kab, kec, unit, ukey, jenis_unit, kelompok, pkey, pnama, kasus, mati, lab, alert, klb, verif, respon, status_rumor, klb_status, w1, sumber_info, spesimen, kelamin, kel_umur";

fn ebs_pkey(f: &F) -> (&'static str, &'static str) {
    if f.basis_rumor {
        ("'r' || lower(COALESCE(e.penyakit_rumor, '-'))", "initcap(COALESCE(e.penyakit_rumor, '(Tidak diisi)'))")
    } else {
        ("COALESCE('d' || e.disease_id, 'r' || lower(COALESCE(e.penyakit_verif, e.penyakit_rumor, '-')))",
         "COALESCE(md.name, initcap(COALESCE(e.penyakit_verif, e.penyakit_rumor, '(Tidak diisi)')))")
    }
}

const EBS_VERIF: &str = "CASE WHEN e.status_rumor ILIKE 'Terverifikasi%' THEN 'Terverifikasi' WHEN e.status_rumor = 'Discarded' THEN 'Discarded'
      WHEN e.status_rumor ILIKE 'Dalam investigasi%' THEN 'Dalam investigasi' END";
const EBS_RESPON: &str = "CASE WHEN e.respon_pertama IS NULL THEN NULL WHEN e.respon_pertama - e.dibuat <= interval '24 hours' THEN '≤ 24 jam' ELSE '> 24 jam' END";

/// Union of the fact rows for the selected source(s), restricted to `[a, b]` (week starts) and every filter.
/// `usia = true`: one row per (laporan, jenis kelamin, kelompok umur) from Laporan EBS (usia) + Laporan Individu IBS.
pub fn facts(f: &F, p: &mut P, a: NaiveDate, b: NaiveDate, usia: bool) -> String {
    let ibs_pn = if f.src == Src::Semua { "COALESCE(md.name, i.nama)" } else { "i.nama" };
    let (ek, en) = ebs_pkey(f);
    let mut br: Vec<String> = vec![];
    if f.ebs() {
        if usia {
            br.push(format!(
                "SELECT 'ebs'::text, e.id, e.no_laporan, e.ws, e.tgl, e.province_id, e.kabkota_id, e.kecamatan, e.unit,
                        lower(COALESCE(e.unit, '')) || '|' || COALESCE(e.kabkota_id::text, ''), e.jenis_unit, e.kelompok, {ek}, {en},
                        skdr_jint(y.value #>> '{{}}'), 0, 0, true, e.klb, {EBS_VERIF}, {EBS_RESPON}, e.status_rumor, e.klb_status, e.w1,
                        e.sumber_informasi, e.spesimen, initcap(x.key), y.key
                 FROM analisa_ebs_fakta e LEFT JOIN master_diseases md ON md.id = e.disease_id
                 CROSS JOIN LATERAL jsonb_each(e.usia) x
                 CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(x.value) = 'object' THEN x.value ELSE '{{}}'::jsonb END) y
                 WHERE e.usia IS NOT NULL AND skdr_jint(y.value #>> '{{}}') > 0"
            ));
        } else {
            br.push(format!(
                "SELECT 'ebs'::text, e.id, e.no_laporan, e.ws, e.tgl, e.province_id, e.kabkota_id, e.kecamatan, e.unit,
                        lower(COALESCE(e.unit, '')) || '|' || COALESCE(e.kabkota_id::text, ''), e.jenis_unit, e.kelompok, {ek}, {en},
                        e.kasus, e.kematian, e.lab_diperiksa, true, e.klb, {EBS_VERIF}, {EBS_RESPON}, e.status_rumor, e.klb_status, e.w1,
                        e.sumber_informasi, e.spesimen, NULL::text, NULL::text
                 FROM analisa_ebs_fakta e LEFT JOIN master_diseases md ON md.id = e.disease_id"
            ));
        }
    }
    if f.ibs() {
        if usia {
            let pn = if f.src == Src::Semua { "COALESCE(md.name, ip.nama, i.penyakit)" } else { "COALESCE(ip.nama, i.penyakit)" };
            br.push(format!(
                "SELECT 'ind'::text, i.id, i.no_laporan, skdr_mmwr_week_start(i.tahun, i.minggu), COALESCE(i.tgl_periksa, skdr_mmwr_week_start(i.tahun, i.minggu) + 3),
                        i.province_id, i.kabkota_id, NULLIF(initcap(trim(i.data->>'kecamatan_nama')), ''), NULLIF(trim(i.unit_nama), ''), i.unit_key,
                        NULLIF(trim(i.data->>'jenis_unit'), ''), NULLIF(trim(i.data->>'kelompok'), ''),
                        COALESCE('d' || m.disease_id, 'k' || i.penyakit), {pn}, 1, CASE WHEN i.status_akhir = 'Meninggal' THEN 1 ELSE 0 END, 0, false,
                        NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
                        COALESCE(NULLIF(trim(i.kelamin), ''), '{KOSONG}'),
                        CASE WHEN ad.d IS NULL THEN '{KOSONG}' WHEN ad.d <= 7 THEN '0_7hr' WHEN ad.d <= 28 THEN '8_28hr' WHEN ad.d < 365 THEN 'lt1th'
                             WHEN ad.d < 1825 THEN '1_4th' WHEN ad.d < 3650 THEN '5_9th' WHEN ad.d < 5475 THEN '10_14th' WHEN ad.d < 7300 THEN '15_19th'
                             WHEN ad.d < 16425 THEN '20_44th' WHEN ad.d < 20075 THEN '45_54th' WHEN ad.d < 25550 THEN '55_69th' ELSE 'gt70th' END
                 FROM laporan_ibs_individu i
                 LEFT JOIN ibs_penyakit ip ON ip.kode = i.penyakit
                 LEFT JOIN skdr_penyakit_map m ON m.kode_penyakit = i.penyakit
                 LEFT JOIN master_diseases md ON md.id = m.disease_id
                 CROSS JOIN LATERAL (SELECT CASE WHEN COALESCE(i.data->>'umur_tahun', i.data->>'umur_bulan', i.data->>'umur_hari') IS NOT NULL
                        THEN skdr_jint(i.data->>'umur_tahun') * 365 + skdr_jint(i.data->>'umur_bulan') * 30 + skdr_jint(i.data->>'umur_hari') END AS d) ad
                 WHERE i.status = 'dikirim' AND i.deleted_at IS NULL AND i.tahun IS NOT NULL AND i.minggu IS NOT NULL"
            ));
        } else {
            br.push(format!(
                "SELECT 'ibs'::text, i.laporan_id, i.no_laporan, i.ws, i.ws + 3, i.province_id, i.kabkota_id, i.kecamatan, i.unit, i.unit_key,
                        i.jenis_unit, i.kelompok, COALESCE('d' || i.disease_id, 'k' || i.kode), {ibs_pn}, i.kasus, i.kematian, i.lab,
                        i.alert_id IS NOT NULL,
                        CASE WHEN i.alert_id IS NOT NULL THEN CASE WHEN i.is_klb THEN 'Ya' ELSE 'Tidak' END END,
                        CASE WHEN i.alert_id IS NOT NULL THEN CASE WHEN i.sts_verif THEN 'Terverifikasi' ELSE 'Belum diverifikasi' END END,
                        CASE WHEN i.alert_id IS NOT NULL THEN CASE WHEN i.respon24_ok THEN '≤ 24 jam' ELSE '> 24 jam' END END,
                        NULL::text, NULL::text, NULL::text, NULL::text,
                        CASE WHEN i.alert_id IS NOT NULL THEN CASE WHEN i.ada_spesimen THEN 'Ya' ELSE 'Tidak' END END,
                        NULL::text, NULL::text
                 FROM analisa_ibs_fakta i LEFT JOIN master_diseases md ON md.id = i.disease_id"
            ));
        }
    }
    let mut w: Vec<String> = vec![];
    let pa = p.add(a);
    let pb = p.add(b);
    w.push(format!("f.ws BETWEEN {pa} AND {pb}"));
    if !f.prov.is_empty() { w.push(format!("f.prov = ANY({})", p.add(f.prov.clone()))); }
    if !f.kab.is_empty() { w.push(format!("f.kab = ANY({})", p.add(f.kab.clone()))); }
    if let Some(k) = &f.kec { w.push(format!("f.kec = {}", p.add(k.clone()))); }
    if !f.penyakit.is_empty() { w.push(format!("f.pkey = ANY({})", p.add(f.penyakit.clone()))); }
    for (col, vals) in [("jenis_unit", &f.jenis_unit), ("kelompok", &f.kelompok), ("status_rumor", &f.status_rumor), ("klb", &f.klb),
                        ("klb_status", &f.klb_status), ("w1", &f.w1), ("sumber_info", &f.sumber_info), ("spesimen", &f.spesimen),
                        ("respon", &f.respon), ("verif", &f.verif)] {
        if vals.is_empty() { continue; }
        let kosong = vals.iter().any(|v| v == KOSONG);
        let rest: Vec<String> = vals.iter().filter(|v| *v != KOSONG).cloned().collect();
        let mut alt = vec![];
        if kosong { alt.push(format!("f.{col} IS NULL")); }
        if !rest.is_empty() { alt.push(format!("f.{col} = ANY({})", p.add(rest))); }
        w.push(format!("({})", alt.join(" OR ")));
    }
    let union = br.into_iter().map(|s| format!("({s})")).collect::<Vec<_>>().join(" UNION ALL ");
    format!("(SELECT * FROM ({union}) AS u({COLS})) f WHERE {}", w.join(" AND "))
}

// ─── helpers ──────────────────────────────────────────────────────────────────

pub struct Names { pub prov: HashMap<i32, String>, pub kab: HashMap<i32, String> }

pub async fn names(c: &deadpool_postgres::Object) -> Result<Names, ApiError> {
    let rows = c.query("SELECT 'p', id, name FROM master_locations UNION ALL SELECT 'k', id, name FROM master_kabkota", &[]).await.map_err(internal)?;
    let mut n = Names { prov: HashMap::new(), kab: HashMap::new() };
    for r in rows {
        let t: String = r.get(0);
        if t == "p" { n.prov.insert(r.get(1), r.get(2)); } else { n.kab.insert(r.get(1), r.get(2)); }
    }
    Ok(n)
}

impl Names {
    pub fn wil(&self, lv: Lv, key: &str) -> String {
        if key.is_empty() { return "(Tidak diketahui)".into(); }
        match lv {
            Lv::Prov => key.parse::<i32>().ok().and_then(|i| self.prov.get(&i).cloned()).unwrap_or_else(|| key.to_string()),
            Lv::Kab => key.parse::<i32>().ok().and_then(|i| self.kab.get(&i).cloned()).unwrap_or_else(|| key.to_string()),
            _ => key.to_string(),
        }
    }
    /// Breadcrumb of the current drilldown (Indonesia > provinsi > kab/kota > kecamatan).
    pub fn crumbs(&self, f: &F) -> Value {
        let mut v = vec![json!({ "level": "nasional", "label": "Indonesia" })];
        if f.prov.len() == 1 { v.push(json!({ "level": "provinsi", "key": f.prov[0].to_string(), "label": self.wil(Lv::Prov, &f.prov[0].to_string()) })); }
        if f.kab.len() == 1 { v.push(json!({ "level": "kabkota", "key": f.kab[0].to_string(), "label": self.wil(Lv::Kab, &f.kab[0].to_string()) })); }
        if let Some(k) = &f.kec { v.push(json!({ "level": "kecamatan", "key": k, "label": k })); }
        Value::Array(v)
    }
}

pub const USIA: &[(&str, &str)] = &[
    ("0_7hr", "0–7 hari"), ("8_28hr", "8–28 hari"), ("lt1th", "1–11 bulan"), ("1_4th", "1–4 th"), ("5_9th", "5–9 th"), ("10_14th", "10–14 th"),
    ("15_19th", "15–19 th"), ("20_44th", "20–44 th"), ("45_54th", "45–54 th"), ("55_69th", "55–69 th"), ("gt70th", "≥ 70 th"),
];
fn usia_label(k: &str) -> String { USIA.iter().find(|(a, _)| *a == k).map(|(_, b)| b.to_string()).unwrap_or_else(|| k.to_string()) }
const BULAN: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

pub(crate) fn wlabel(d: NaiveDate) -> String { let (y, w) = mmwr_week_of(d); week_label(y, w) }

fn periode_expr(per: &str) -> &'static str {
    match per { "bulan" => "to_char(f.tgl, 'YYYY-MM')", "tahun" => "EXTRACT(YEAR FROM f.ws + 3)::int::text", _ => "f.ws::text" }
}
fn periode_label(per: &str, k: &str) -> String {
    match per {
        "bulan" => {
            let mut it = k.split('-');
            match (it.next(), it.next().and_then(|m| m.parse::<usize>().ok())) { (Some(y), Some(m)) if (1..=12).contains(&m) => format!("{} {y}", BULAN[m - 1]), _ => k.into() }
        }
        "tahun" => k.into(),
        _ => NaiveDate::parse_from_str(k, "%Y-%m-%d").map(wlabel).unwrap_or_else(|_| k.into()),
    }
}

pub fn pct(n: i64, d: i64) -> Value { if d > 0 { json!((n as f64 * 1000.0 / d as f64).round() / 10.0) } else { Value::Null } }
fn pct_cap(n: i64, d: i64) -> Value { if d > 0 { json!(((n.min(d)) as f64 * 1000.0 / d as f64).round() / 10.0) } else { Value::Null } }
pub(crate) fn chg(cur: i64, prev: i64) -> Value { if prev > 0 { json!(((cur - prev) as f64 * 1000.0 / prev as f64).round() / 10.0) } else { Value::Null } }

/// Wilson 95% CI for a proportion (CFR), in percent.
pub(crate) fn wilson(k: i64, n: i64) -> Value {
    if n <= 0 { return Value::Null; }
    let (z, nf, p) = (1.96f64, n as f64, k as f64 / n as f64);
    let den = 1.0 + z * z / nf;
    let c = (p + z * z / (2.0 * nf)) / den;
    let h = z * ((p * (1.0 - p) / nf) + z * z / (4.0 * nf * nf)).sqrt() / den;
    json!([((c - h).max(0.0) * 1000.0).round() / 10.0, ((c + h).min(1.0) * 1000.0).round() / 10.0])
}

pub fn mask_name(s: &str) -> String {
    s.split_whitespace().map(|w| { let mut ch = w.chars(); match ch.next() { Some(c) => format!("{}{}", c.to_uppercase(), "*".repeat(ch.count().clamp(2, 6))), None => String::new() } })
        .collect::<Vec<_>>().join(" ")
}

async fn settings(c: &deadpool_postgres::Object) -> Value {
    c.query_opt("SELECT value FROM app_settings WHERE key = 'matriks_analisa'", &[]).await.ok().flatten()
        .and_then(|r| serde_json::from_str::<Value>(&r.get::<_, String>(0)).ok()).unwrap_or_else(|| json!({}))
}
fn cfg_i(v: &Value, path: &[&str], d: i64) -> i64 { let mut x = v; for k in path { x = &x[*k]; } x.as_i64().unwrap_or(d) }

/// First week with data for the selected source(s) (Semua: the later of the two, so baselines are not biased).
async fn data_start(c: &deadpool_postgres::Object, f: &F) -> Result<(Option<NaiveDate>, Value), ApiError> {
    let r = c.query_one(
        "SELECT (SELECT skdr_epi_ws(min(tgl_laporan)) FROM laporan_ebs WHERE status = 'dikirim' AND deleted_at IS NULL),
                (SELECT skdr_epi_ws(max(tgl_laporan)) FROM laporan_ebs WHERE status = 'dikirim' AND deleted_at IS NULL),
                (SELECT min(week_start) FROM laporan_ibs_baris WHERE aktif), (SELECT max(week_start) FROM laporan_ibs_baris WHERE aktif)", &[]).await.map_err(internal)?;
    let (e0, e1, i0, i1): (Option<NaiveDate>, Option<NaiveDate>, Option<NaiveDate>, Option<NaiveDate>) = (r.get(0), r.get(1), r.get(2), r.get(3));
    let start = match f.src { Src::Ebs => e0, Src::Ibs => i0, Src::Semua => match (e0, i0) { (Some(a), Some(b)) => Some(a.max(b)), (a, b) => a.or(b) } };
    let lab = |d: Option<NaiveDate>| d.map(wlabel);
    Ok((start, json!({
        "ebs": { "mulai": e0.map(|d| d.to_string()), "akhir": e1.map(|d| d.to_string()), "mulai_label": lab(e0), "akhir_label": lab(e1) },
        "ibs": { "mulai": i0.map(|d| d.to_string()), "akhir": i1.map(|d| d.to_string()), "mulai_label": lab(i0), "akhir_label": lab(i1) },
    })))
}

pub(crate) fn fmt_n(n: i64) -> String {
    let s = n.abs().to_string();
    let mut out = String::new();
    for (i, ch) in s.chars().enumerate() { if i > 0 && (s.len() - i) % 3 == 0 { out.push('.'); } out.push(ch); }
    if n < 0 { format!("-{out}") } else { out }
}
fn src_label(s: Src) -> &'static str { match s { Src::Ebs => "Laporan EBS", Src::Ibs => "Laporan Agregat IBS", Src::Semua => "Laporan EBS + Laporan Agregat IBS" } }

pub(crate) fn meta(f: &F, names: &Names) -> Value {
    let (y0, w0) = mmwr_week_of(f.d0);
    let (y1, w1) = mmwr_week_of(f.d1);
    json!({
        "sumber": match f.src { Src::Ebs => "ebs", Src::Ibs => "ibs", Src::Semua => "semua" }, "sumber_label": src_label(f.src),
        "mulai": f.d0.to_string(), "akhir": (f.d1 + Duration::days(6)).to_string(), "minggu": f.weeks(),
        "periode_label": if y0 == y1 { format!("M{w0}–M{w1} {y0}") } else { format!("M{w0}/{y0} – M{w1}/{y1}") },
        "level": f.level().code(), "level_label": f.level().label(), "breadcrumb": names.crumbs(f),
    })
}

// ─── GET /api/v1/analisa/opsi ────────────────────────────────────────────────
/// Filter options for the current source/period/wilayah + data coverage notes.
pub async fn opsi(State(st): State<AppState>, Query(q): Query<Q>) -> Result<Json<Value>, ApiError> {
    let c = st.pool.get().await.map_err(internal)?;
    let f = F::from(&q);
    let (_, rentang) = data_start(&c, &f).await?;
    // Penyakit (ranked by kasus in the selected period, all wilayah filters kept, penyakit filter dropped)
    let mut fp = F::from(&q);
    fp.penyakit.clear();
    let mut p = P::default();
    let src = facts(&fp, &mut p, f.d0, f.d1, false);
    let pen = c.query(&format!("SELECT f.pkey, min(f.pnama), sum(f.kasus)::bigint, count(*)::bigint FROM {src} GROUP BY 1 ORDER BY 3 DESC, 2"), &p.refs()).await.map_err(internal)?;
    let penyakit: Vec<Value> = pen.iter().map(|r| json!({ "value": r.get::<_, String>(0), "label": r.get::<_, Option<String>>(1), "kasus": r.get::<_, i64>(2), "baris": r.get::<_, i64>(3) })).collect();
    // Kecamatan for the selected kab/kota (from both sources)
    let mut kecamatan: Vec<Value> = vec![];
    if f.kab.len() == 1 {
        let rows = c.query(
            "SELECT k, sum(n)::bigint FROM (
               SELECT kecamatan AS k, count(*) AS n FROM laporan_ibs_baris WHERE aktif AND kabkota_id = $1 AND kecamatan IS NOT NULL GROUP BY 1
               UNION ALL SELECT initcap(dsb_kecamatan_nama), count(*) FROM laporan_ebs WHERE status = 'dikirim' AND deleted_at IS NULL AND kabkota_id = $1 AND dsb_kecamatan_nama IS NOT NULL GROUP BY 1) x
             GROUP BY 1 ORDER BY 1", &[&f.kab[0]]).await.map_err(internal)?;
        kecamatan = rows.iter().map(|r| json!({ "value": r.get::<_, String>(0), "label": r.get::<_, String>(0), "n": r.get::<_, i64>(1) })).collect();
    }
    let opsi_rows = c.query("SELECT kelompok, nilai, COALESCE(label, nilai) FROM laporan_opsi WHERE is_active ORDER BY kelompok, urutan, nilai", &[]).await.map_err(internal)?;
    let mut lo: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    for r in &opsi_rows { lo.entry(r.get(0)).or_default().push(json!({ "value": r.get::<_, String>(1), "label": r.get::<_, String>(2) })); }
    let ebs_cov = c.query_one(
        "SELECT count(*)::bigint, count(sumber_informasi)::bigint, count(w1)::bigint, count(usia)::bigint, count(spesimen)::bigint, count(klb)::bigint,
                count(klb_status)::bigint, count(tgl_onset)::bigint, count(kecamatan)::bigint, count(penyakit_verif)::bigint, count(respon_pertama)::bigint,
                count(kelompok)::bigint, count(*) FILTER (WHERE impor)::bigint
         FROM analisa_ebs_fakta WHERE tgl BETWEEN $1 AND $2", &[&f.d0, &(f.d1 + Duration::days(6))]).await.map_err(internal)?;
    let ibs_cov = c.query_one(
        "SELECT count(*)::bigint, count(total_kunjungan) FILTER (WHERE total_kunjungan > 0)::bigint, count(data->>'kelompok')::bigint,
                (SELECT count(*) FROM laporan_ibs_individu WHERE status = 'dikirim' AND deleted_at IS NULL)::bigint
         FROM laporan_ibs WHERE status = 'dikirim' AND deleted_at IS NULL AND tahun * 100 + minggu BETWEEN $1 AND $2",
        &[&{ let (y, w) = mmwr_week_of(f.d0); y * 100 + w }, &{ let (y, w) = mmwr_week_of(f.d1); y * 100 + w }]).await.map_err(internal)?;
    let g = |i: usize| ebs_cov.get::<_, i64>(i);
    let names = names(&c).await?;
    // Penyakit potensial wabah (app_settings.matriks_analisa.potensial_wabah: kode IBS) as pkeys
    let cfg = settings(&c).await;
    let kode: Vec<String> = cfg["potensial_wabah"].as_array().map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default();
    let pw = c.query("SELECT DISTINCT COALESCE('d' || m.disease_id, 'k' || k) FROM unnest($1::text[]) k LEFT JOIN skdr_penyakit_map m ON m.kode_penyakit = k", &[&kode]).await.map_err(internal)?;
    let potensial: Vec<String> = pw.iter().map(|r| r.get::<_, String>(0)).collect();
    Ok(Json(json!({
        "potensial_wabah": potensial,
        "success": true, "meta": meta(&f, &names), "rentang_data": rentang,
        "penyakit": penyakit, "kecamatan": kecamatan,
        "opsi": {
            "jenis_unit": lo.get("jenis_unit"), "kelompok": lo.get("kelompok_unit"), "status_rumor": lo.get("status_kejadian"),
            "status_klb": lo.get("status_klb"), "sumber_informasi": lo.get("sumber_informasi"),
            "ya_tidak": [{"value": "Ya", "label": "Ya"}, {"value": "Tidak", "label": "Tidak"}, {"value": KOSONG, "label": KOSONG}],
            "respon": [{"value": "≤ 24 jam", "label": "≤ 24 jam"}, {"value": "> 24 jam", "label": "> 24 jam"}, {"value": KOSONG, "label": "Belum ada respons tercatat"}],
            "verif_ibs": [{"value": "Terverifikasi", "label": "Terverifikasi"}, {"value": "Belum diverifikasi", "label": "Belum diverifikasi"}],
        },
        "cakupan": {
            "ebs": { "laporan": g(0), "sumber_informasi": g(1), "w1": g(2), "usia": g(3), "spesimen": g(4), "klb": g(5), "klb_status": g(6),
                     "tgl_onset": g(7), "kecamatan": g(8), "penyakit_terverifikasi": g(9), "respon": g(10), "kelompok": g(11), "impor": g(12) },
            "ibs": { "laporan": ibs_cov.get::<_, i64>(0), "kunjungan": ibs_cov.get::<_, i64>(1), "kelompok": ibs_cov.get::<_, i64>(2), "individu": ibs_cov.get::<_, i64>(3) },
        },
    })))
}

// ─── GET /api/v1/analisa/pivot ───────────────────────────────────────────────
/// Generic cross-tab: `baris` x `kolom`, every measure per cell (long format; the UI pivots, totals and charts it).
/// Dimensions: wilayah | penyakit | periode | jenis_unit | kelompok | status_rumor | klb | klb_status | w1 | sumber_info |
/// spesimen | verif | respon | sumber | kelamin | kel_umur | none.
pub async fn pivot(State(st): State<AppState>, Query(q): Query<Q>) -> Result<Json<Value>, ApiError> {
    let c = st.pool.get().await.map_err(internal)?;
    let f = F::from(&q);
    let lv = f.level();
    let dims = ["wilayah", "penyakit", "periode", "jenis_unit", "kelompok", "status_rumor", "klb", "klb_status", "w1", "sumber_info", "spesimen", "verif", "respon", "sumber", "kelamin", "kel_umur", "none"];
    let baris = q.baris.as_deref().filter(|d| dims.contains(d)).unwrap_or("wilayah");
    let kolom = q.kolom.as_deref().filter(|d| dims.contains(d)).unwrap_or("penyakit");
    let usia = [baris, kolom].iter().any(|d| *d == "kelamin" || *d == "kel_umur");
    let per = f.periode;
    let dim = |d: &str| -> (String, String) {
        match d {
            "wilayah" => (lv.key().to_string(), "NULL::text".into()),
            "penyakit" => ("f.pkey".into(), "min(f.pnama)".into()),
            "periode" => (periode_expr(per).into(), "NULL::text".into()),
            "sumber" => ("f.src".into(), "NULL::text".into()),
            "none" => ("''".into(), "NULL::text".into()),
            other => (format!("COALESCE(f.{other}, '{KOSONG}')"), "NULL::text".into()),
        }
    };
    let (rk, rl) = dim(baris);
    let (ck, cl) = dim(kolom);
    let mut p = P::default();
    let src = facts(&f, &mut p, f.d0, f.d1, usia);
    let sql = format!(
        "SELECT {rk} AS rk, {rl} AS rl, {ck} AS ck, {cl} AS cl, count(DISTINCT f.src || f.id)::bigint, COALESCE(sum(f.kasus), 0)::bigint,
                COALESCE(sum(f.mati), 0)::bigint, COALESCE(sum(f.lab), 0)::bigint, count(*) FILTER (WHERE f.alert)::bigint,
                count(*) FILTER (WHERE f.klb = 'Ya')::bigint, count(DISTINCT f.ukey)::bigint
         FROM {src} GROUP BY 1, 3 LIMIT 60001");
    let t = std::time::Instant::now();
    let rows = c.query(&sql, &p.refs()).await.map_err(internal)?;
    let ms = t.elapsed().as_millis();
    let names = names(&c).await?;
    let label = |d: &str, k: &str, l: Option<String>| -> String {
        if let Some(l) = l { return l; }
        match d {
            "wilayah" => names.wil(lv, k),
            "periode" => periode_label(per, k),
            "kel_umur" => usia_label(k),
            "sumber" => match k { "ebs" => "Laporan EBS".into(), "ibs" => "Laporan Agregat IBS".into(), "ind" => "Laporan Individu IBS".into(), _ => k.into() },
            "none" => "Jumlah".into(),
            _ => k.to_string(),
        }
    };
    let truncated = rows.len() > 60000;
    let data: Vec<Value> = rows.iter().take(60000).map(|r| {
        let rkv: String = r.get(0);
        let ckv: String = r.get(2);
        json!([label(baris, &rkv, r.get(1)), rkv, label(kolom, &ckv, r.get(3)), ckv,
               r.get::<_, i64>(4), r.get::<_, i64>(5), r.get::<_, i64>(6), r.get::<_, i64>(7), r.get::<_, i64>(8), r.get::<_, i64>(9), r.get::<_, i64>(10)])
    }).collect();
    Ok(Json(json!({
        "success": true, "meta": meta(&f, &names), "baris": baris, "kolom": kolom, "usia": usia, "periode": per, "truncated": truncated,
        "kolom_data": ["baris_label", "baris_key", "kolom_label", "kolom_key", "laporan", "kasus", "kematian", "lab", "alert", "klb", "unit"],
        "data": data, "ms": ms,
    })))
}

// ─── GET /api/v1/analisa/ringkasan ───────────────────────────────────────────
/// KPIs (vs previous period of equal length and vs the same epi weeks last year), weekly trend with last-year line and
/// threshold, ranked diseases and wilayah, threshold flags, and an auto-generated interpretation.
pub async fn ringkasan(State(st): State<AppState>, Query(q): Query<Q>) -> Result<Json<Value>, ApiError> {
    let t0 = std::time::Instant::now();
    let c = st.pool.get().await.map_err(internal)?;
    let f = F::from(&q);
    let cfg = settings(&c).await;
    let (start, rentang) = data_start(&c, &f).await?;
    let names = names(&c).await?;
    let lv = f.level();
    let n_weeks = f.weeks();
    let (pd0, pd1) = (f.d0 - Duration::weeks(n_weeks), f.d0 - Duration::weeks(1));
    let (y0, w0) = mmwr_week_of(f.d0);
    let (y1, w1) = mmwr_week_of(f.d1);
    let ly0 = week_start_date(y0 - 1, w0.min(weeks_in_year(y0 - 1)));
    let ly1 = week_start_date(y1 - 1, w1.min(weeks_in_year(y1 - 1)));

    // KPIs per bucket (c = periode ini, p = periode sebelumnya, y = periode sama tahun lalu)
    let mut p = P::default();
    let lo = ly0.min(pd0);
    let src = facts(&f, &mut p, lo, f.d1, false);
    let (a, b, pa, pb, la, lb) = (p.add(f.d0), p.add(f.d1), p.add(pd0), p.add(pd1), p.add(ly0), p.add(ly1));
    let kq = format!(
        "SELECT b, count(DISTINCT src || id)::bigint, COALESCE(sum(kasus), 0)::bigint, COALESCE(sum(mati), 0)::bigint, count(DISTINCT ukey)::bigint,
                count(DISTINCT kab)::bigint, count(DISTINCT prov)::bigint, count(*) FILTER (WHERE alert)::bigint, count(*) FILTER (WHERE klb = 'Ya')::bigint,
                count(*) FILTER (WHERE alert AND verif = 'Terverifikasi')::bigint, count(DISTINCT pkey)::bigint
         FROM (SELECT CASE WHEN f.ws BETWEEN {a} AND {b} THEN 'c' WHEN f.ws BETWEEN {pa} AND {pb} THEN 'p' WHEN f.ws BETWEEN {la} AND {lb} THEN 'y' END AS b, f.*
               FROM {src}) x WHERE b IS NOT NULL GROUP BY b");
    let krows = c.query(&kq, &p.refs()).await.map_err(internal)?;
    let mut k: HashMap<String, Vec<i64>> = HashMap::new();
    for r in &krows { k.insert(r.get(0), (1..=10).map(|i| r.get::<_, i64>(i)).collect()); }
    let z = vec![0i64; 10];
    let kc = k.get("c").unwrap_or(&z).clone();
    let kp = k.get("p").unwrap_or(&z).clone();
    let ky = k.get("y").unwrap_or(&z).clone();
    let ly_has = start.map(|s| ly0 >= s).unwrap_or(false);
    let prev_has = start.map(|s| pd0 >= s).unwrap_or(false);
    let kpi = |i: usize, key: &str, label: &str, def: &str| json!({
        "key": key, "label": label, "nilai": kc[i], "sebelumnya": if prev_has { json!(kp[i]) } else { Value::Null },
        "tahun_lalu": if ly_has { json!(ky[i]) } else { Value::Null },
        "ubah_pct": if prev_has { chg(kc[i], kp[i]) } else { Value::Null }, "ubah_tahun_lalu_pct": if ly_has { chg(kc[i], ky[i]) } else { Value::Null }, "definisi": def,
    });
    let lap_label = match f.src { Src::Ebs => "Laporan EBS (sinyal)", Src::Ibs => "Laporan Agregat IBS (unit x minggu)", Src::Semua => "Laporan (EBS + Agregat IBS)" };
    let kpis = vec![
        kpi(1, "kasus", "Kasus", "Jumlah kasus yang dilaporkan pada periode terpilih (Laporan EBS: jumlah kasus per laporan; IBS: kasus di matriks Laporan Agregat IBS)."),
        kpi(2, "kematian", "Kematian", "Jumlah kematian yang dilaporkan."),
        kpi(0, "laporan", lap_label, "Jumlah laporan terkirim. Satu Laporan Agregat IBS = rekap satu unit untuk satu minggu epid; satu Laporan EBS = satu sinyal/rumor."),
        kpi(6, "alert", if f.src == Src::Ebs { "Sinyal EBS" } else { "Alert" }, "IBS: baris matriks yang berasal dari alert SKDR (melewati ambang). EBS: setiap Laporan EBS adalah satu sinyal."),
        kpi(7, "klb", "KLB", "Alert/laporan yang dinyatakan memenuhi kriteria KLB."),
        kpi(3, "unit", "Unit pelapor", "Jumlah unit pelapor berbeda yang mengirim laporan."),
        kpi(4, "kabkota", "Kab/Kota terdampak", "Jumlah kab/kota dengan minimal satu laporan."),
    ];
    let cfr = pct(kc[2], kc[1]);

    // Weekly series per penyakit from the start of the baseline window to the end of the range
    let tahun_bl = cfg_i(&cfg, &["baseline", "tahun"], 3);
    let sd_k = cfg["baseline"]["sd"].as_f64().unwrap_or(2.0);
    let mov = cfg_i(&cfg, &["baseline", "minggu_bergerak"], 8);
    let jendela = cfg_i(&cfg, &["baseline", "jendela"], 1);
    let hist0 = { let h = f.d0 - Duration::weeks(53 * tahun_bl + 4); match start { Some(s) if s > h => s, _ => h } };
    let mut p2 = P::default();
    let src2 = facts(&f, &mut p2, hist0.min(f.d0), f.d1, false);
    let wrows = c.query(&format!("SELECT f.ws, f.pkey, min(f.pnama), COALESCE(sum(f.kasus), 0)::bigint, COALESCE(sum(f.mati), 0)::bigint, count(DISTINCT f.src || f.id)::bigint FROM {src2} GROUP BY 1, 2"), &p2.refs()).await.map_err(internal)?;
    let mut tot: BTreeMap<NaiveDate, (i64, i64, i64)> = BTreeMap::new();
    let mut by_p: HashMap<String, (String, BTreeMap<NaiveDate, i64>)> = HashMap::new();
    for r in &wrows {
        let ws: NaiveDate = r.get(0);
        let (ks, mt, lp): (i64, i64, i64) = (r.get(3), r.get(4), r.get(5));
        let e = tot.entry(ws).or_insert((0, 0, 0));
        e.0 += ks; e.1 += mt; e.2 += lp;
        let pe = by_p.entry(r.get(1)).or_insert_with(|| (r.get::<_, Option<String>>(2).unwrap_or_default(), BTreeMap::new()));
        *pe.1.entry(ws).or_insert(0) += ks;
    }
    // threshold: mean + k*SD of the same epi week (+/- jendela) in the previous `tahun` years; fallback moving baseline
    let baseline = |series: &BTreeMap<NaiveDate, i64>, ws: NaiveDate| -> Option<(f64, f64, &'static str)> {
        let s0 = start?;
        let (y, w) = mmwr_week_of(ws);
        let mut vals = vec![];
        for yy in 1..=tahun_bl as i32 {
            let base = week_start_date(y - yy, w.min(weeks_in_year(y - yy)));
            for j in -jendela..=jendela {
                let d = base + Duration::weeks(j);
                if d >= s0 { vals.push(*series.get(&d).unwrap_or(&0) as f64); }
            }
        }
        let mut metode = "historis";
        if vals.len() < 3 * (2 * jendela as usize + 1).min(3) {
            vals.clear();
            for j in 1..=mov { let d = ws - Duration::weeks(j); if d >= s0 { vals.push(*series.get(&d).unwrap_or(&0) as f64); } }
            metode = "bergerak";
            if vals.len() < 4 { return None; }
        }
        let n = vals.len() as f64;
        let mean = vals.iter().sum::<f64>() / n;
        let sd = (vals.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / (n - 1.0).max(1.0)).sqrt();
        Some((mean, mean + sd_k * sd, metode))
    };
    let tot_k: BTreeMap<NaiveDate, i64> = tot.iter().map(|(d, v)| (*d, v.0)).collect();
    let mut tren = vec![];
    let mut d = f.d0;
    let mut metode_tren: HashSet<&str> = HashSet::new();
    while d <= f.d1 {
        let (y, w) = mmwr_week_of(d);
        let lyd = week_start_date(y - 1, w.min(weeks_in_year(y - 1)));
        let cur = tot.get(&d).cloned().unwrap_or((0, 0, 0));
        let bl = baseline(&tot_k, d);
        if let Some((_, _, m)) = bl { metode_tren.insert(m); }
        let ly_ok = start.map(|s| lyd >= s).unwrap_or(false);
        tren.push(json!({
            "ws": d.to_string(), "label": week_label(y, w), "tahun": y, "minggu": w, "bulan": (d + Duration::days(3)).format("%Y-%m").to_string(),
            "kasus": cur.0, "kematian": cur.1, "laporan": cur.2,
            "kasus_tahun_lalu": if ly_ok { json!(tot.get(&lyd).map(|x| x.0).unwrap_or(0)) } else { Value::Null },
            "rerata": bl.map(|x| (x.0 * 10.0).round() / 10.0), "ambang": bl.map(|x| (x.1 * 10.0).round() / 10.0),
            "di_atas_ambang": bl.map(|x| cur.0 as f64 > x.1 && cur.0 > 0).unwrap_or(false),
        }));
        d += Duration::weeks(1);
    }

    // Ranked diseases: periode ini vs sebelumnya, minggu terakhir vs minggu sebelumnya, flag ambang minggu terakhir
    let last = f.d1;
    let prev_w = f.d1 - Duration::weeks(1);
    let mut pen: Vec<(String, String, i64, i64, i64, i64, Option<(f64, f64, &str)>)> = by_p.iter().map(|(key, (nm, s))| {
        let cur: i64 = s.range(f.d0..=f.d1).map(|(_, v)| *v).sum();
        let prv: i64 = s.range(pd0..=pd1).map(|(_, v)| *v).sum();
        let lw = *s.get(&last).unwrap_or(&0);
        let pw = *s.get(&prev_w).unwrap_or(&0);
        (key.clone(), nm.clone(), cur, prv, lw, pw, baseline(s, last))
    }).filter(|x| x.2 > 0 || x.4 > 0).collect();
    pen.sort_by(|a, b| b.2.cmp(&a.2).then(a.1.cmp(&b.1)));
    let min_flag = 5;
    let flags: Vec<Value> = pen.iter().filter(|x| x.6.map(|b| x.4 as f64 > b.1 && x.4 >= min_flag).unwrap_or(false)).map(|x| {
        let b = x.6.unwrap();
        json!({ "penyakit": x.0, "label": x.1, "kasus": x.4, "rerata": (b.0 * 10.0).round() / 10.0, "ambang": (b.1 * 10.0).round() / 10.0, "metode": b.2 })
    }).collect();
    let top_penyakit: Vec<Value> = pen.iter().take(15).map(|x| json!({
        "penyakit": x.0, "label": x.1, "kasus": x.2, "sebelumnya": if prev_has { json!(x.3) } else { Value::Null }, "ubah_pct": if prev_has { chg(x.2, x.3) } else { Value::Null },
        "minggu_terakhir": x.4, "minggu_sebelumnya": x.5, "ubah_mingguan_pct": chg(x.4, x.5),
        "ambang": x.6.map(|b| (b.1 * 10.0).round() / 10.0), "di_atas_ambang": x.6.map(|b| x.4 as f64 > b.1 && x.4 >= min_flag).unwrap_or(false),
        "porsi_pct": pct(x.2, kc[1]),
    })).collect();

    // Ranked wilayah at the current level
    let mut p3 = P::default();
    let src3 = facts(&f, &mut p3, pd0, f.d1, false);
    let (a3, b3) = (p3.add(f.d0), p3.add(pd1));
    let wq = format!(
        "SELECT {k} AS w, COALESCE(sum(f.kasus) FILTER (WHERE f.ws >= {a3}), 0)::bigint, COALESCE(sum(f.kasus) FILTER (WHERE f.ws <= {b3}), 0)::bigint,
                COALESCE(sum(f.mati) FILTER (WHERE f.ws >= {a3}), 0)::bigint, count(DISTINCT f.src || f.id) FILTER (WHERE f.ws >= {a3})::bigint
         FROM {src3} GROUP BY 1 ORDER BY 2 DESC LIMIT 15", k = lv.key());
    let wrows2 = c.query(&wq, &p3.refs()).await.map_err(internal)?;
    let top_wilayah: Vec<Value> = wrows2.iter().filter(|r| r.get::<_, i64>(1) > 0).map(|r| {
        let key: String = r.get(0);
        let (cur, prv): (i64, i64) = (r.get(1), r.get(2));
        json!({ "key": key, "label": names.wil(lv, &key), "kasus": cur, "sebelumnya": if prev_has { json!(prv) } else { Value::Null },
                "ubah_pct": if prev_has { chg(cur, prv) } else { Value::Null }, "kematian": r.get::<_, i64>(3), "laporan": r.get::<_, i64>(4), "porsi_pct": pct(cur, kc[1]) })
    }).collect();

    // Interpretasi
    let mut kal: Vec<String> = vec![];
    let m = meta(&f, &names);
    kal.push(format!("{}: {} kasus dan {} kematian dari {} ({}).", m["periode_label"].as_str().unwrap_or(""), fmt_n(kc[1]), fmt_n(kc[2]), src_label(f.src).to_lowercase(), fmt_n(kc[0])));
    if prev_has && kp[1] > 0 {
        let ch = (kc[1] - kp[1]) as f64 * 100.0 / kp[1] as f64;
        kal.push(format!("Kasus {} {:.0}% dibanding {} minggu sebelumnya ({}).", if ch >= 0.0 { "naik" } else { "turun" }, ch.abs(), n_weeks, fmt_n(kp[1])));
    }
    if ly_has && ky[1] > 0 {
        let ch = (kc[1] - ky[1]) as f64 * 100.0 / ky[1] as f64;
        kal.push(format!("Dibanding minggu yang sama tahun lalu {} {:.0}%.", if ch >= 0.0 { "naik" } else { "turun" }, ch.abs()));
    }
    if let Some(tp) = pen.first() { kal.push(format!("Penyakit terbanyak: {} ({} kasus, {}).", tp.1, fmt_n(tp.2), pct(tp.2, kc[1]).as_f64().map(|v| format!("{v}%")).unwrap_or_default())); }
    // biggest week-over-week increase (>= 10 cases in the last week)
    if let Some(up) = pen.iter().filter(|x| x.4 >= 10 && x.5 > 0 && x.4 > x.5).max_by(|a, b| ((a.4 - a.5) as f64 / a.5 as f64).partial_cmp(&((b.4 - b.5) as f64 / b.5 as f64)).unwrap()) {
        let mut p4 = P::default();
        let src4 = facts(&f, &mut p4, last, last, false);
        let pk = p4.add(up.0.clone());
        let tw = c.query_opt(&format!("SELECT {k}, sum(f.kasus)::bigint FROM {src4} AND f.pkey = {pk} GROUP BY 1 ORDER BY 2 DESC LIMIT 1", k = lv.key()), &p4.refs()).await.map_err(internal)?;
        let lokasi = tw.map(|r| format!(", tertinggi di {}", names.wil(lv, &r.get::<_, String>(0)))).unwrap_or_default();
        kal.push(format!("{} naik {:.0}% dibanding minggu lalu ({} → {} kasus, {} → {}){lokasi}.", up.1, (up.4 - up.5) as f64 * 100.0 / up.5 as f64,
            fmt_n(up.5), fmt_n(up.4), wlabel(prev_w), wlabel(last)));
    }
    if let Some(tw) = top_wilayah.first() { kal.push(format!("{} dengan kasus terbanyak: {} ({} kasus).", lv.label(), tw["label"].as_str().unwrap_or(""), fmt_n(tw["kasus"].as_i64().unwrap_or(0)))); }
    if !flags.is_empty() {
        let l: Vec<String> = flags.iter().take(5).map(|x| x["label"].as_str().unwrap_or("").to_string()).collect();
        kal.push(format!("{} penyakit melewati ambang pada {}: {}.", flags.len(), wlabel(last), l.join(", ")));
    }
    let metode_txt = if metode_tren.contains("historis") {
        format!("Ambang = rerata + {sd_k} SD kasus pada minggu epid yang sama (±{jendela} minggu) dalam {tahun_bl} tahun sebelumnya (hanya tahun yang sudah ada datanya).")
    } else {
        format!("Data historis belum cukup, jadi ambang = rerata + {sd_k} SD dari {mov} minggu sebelumnya (baseline bergerak).")
    };
    Ok(Json(json!({
        "success": true, "meta": m, "rentang_data": rentang, "kpi": kpis, "cfr_pct": cfr, "cfr_ci": wilson(kc[2], kc[1]),
        "pembanding": { "sebelumnya": { "mulai": pd0.to_string(), "akhir": (pd1 + Duration::days(6)).to_string(), "label": format!("{} – {}", wlabel(pd0), wlabel(pd1)), "tersedia": prev_has },
                        "tahun_lalu": { "mulai": ly0.to_string(), "akhir": (ly1 + Duration::days(6)).to_string(), "label": format!("{} – {}", wlabel(ly0), wlabel(ly1)), "tersedia": ly_has } },
        "tren": tren, "ambang_metode": metode_txt, "top_penyakit": top_penyakit, "top_wilayah": top_wilayah, "flags": flags,
        "interpretasi": kal, "ms": t0.elapsed().as_millis(),
    })))
}

/// Filters for `laporan_ibs l` (Laporan Agregat IBS header rows): sent, wilayah, jenis unit, kelompok.
fn lap_where(f: &F, p: &mut P) -> String {
    let mut w = vec!["l.status = 'dikirim'".to_string(), "l.deleted_at IS NULL".to_string(), "l.tahun IS NOT NULL".into(), "l.minggu IS NOT NULL".into()];
    if !f.prov.is_empty() { w.push(format!("l.province_id = ANY({})", p.add(f.prov.clone()))); }
    if !f.kab.is_empty() { w.push(format!("l.kabkota_id = ANY({})", p.add(f.kab.clone()))); }
    if let Some(k) = &f.kec { w.push(format!("NULLIF(initcap(trim(l.data->>'kecamatan_nama')), '') = {}", p.add(k.clone()))); }
    if !f.jenis_unit.is_empty() { w.push(format!("NULLIF(trim(l.data->>'jenis_unit'), '') = ANY({})", p.add(f.jenis_unit.clone()))); }
    if !f.kelompok.is_empty() { w.push(format!("NULLIF(trim(l.data->>'kelompok'), '') = ANY({})", p.add(f.kelompok.clone()))); }
    w.join(" AND ")
}
fn lap_wil(lv: Lv) -> &'static str {
    match lv {
        Lv::Prov => "COALESCE(l.province_id::text, '')", Lv::Kab => "COALESCE(l.kabkota_id::text, '')",
        Lv::Kec => "COALESCE(NULLIF(initcap(trim(l.data->>'kecamatan_nama')), ''), '')", Lv::Unit => "COALESCE(NULLIF(trim(l.unit_nama), ''), '')",
    }
}
fn yw(d: NaiveDate) -> i32 { let (y, w) = mmwr_week_of(d); y * 100 + w }

// ─── GET /api/v1/analisa/morbiditas ──────────────────────────────────────────
pub async fn morbiditas(State(st): State<AppState>, Query(q): Query<Q>) -> Result<Json<Value>, ApiError> {
    let t0 = std::time::Instant::now();
    let c = st.pool.get().await.map_err(internal)?;
    let f = F::from(&q);
    let lv = f.level();
    let names = names(&c).await?;
    // denominator: Laporan Agregat IBS with Total Kunjungan filled (> 0)
    let mut p = P::default();
    let lw = lap_where(&f, &mut p);
    let (a, b) = (p.add(yw(f.d0)), p.add(yw(f.d1)));
    let kk = format!("SELECT l.id, l.total_kunjungan, {wk} AS w FROM laporan_ibs l WHERE {lw} AND l.tahun * 100 + l.minggu BETWEEN {a} AND {b} AND l.total_kunjungan > 0", wk = lap_wil(lv));
    let src = facts(&f, &mut p, f.d0, f.d1, false);
    let pq = format!(
        "WITH kk AS ({kk})
         SELECT f.pkey, min(f.pnama), COALESCE(sum(f.kasus), 0)::bigint, COALESCE(sum(f.mati), 0)::bigint, count(DISTINCT f.src || f.id)::bigint,
                COALESCE(sum(f.kasus) FILTER (WHERE kk.id IS NOT NULL), 0)::bigint, COALESCE(sum(f.mati) FILTER (WHERE kk.id IS NOT NULL), 0)::bigint
         FROM {src} LEFT JOIN kk ON f.src = 'ibs' AND kk.id = f.id GROUP BY 1 ORDER BY 3 DESC");
    // `facts` ends with a WHERE clause, so the join must come before it: rebuild as subquery
    let pq = pq.replacen(&format!("FROM {src} LEFT JOIN kk ON f.src = 'ibs' AND kk.id = f.id"), &format!("FROM (SELECT f.* FROM {src}) f LEFT JOIN kk ON f.src = 'ibs' AND kk.id = f.id"), 1);
    let rows = c.query(&pq, &p.refs()).await.map_err(internal)?;
    let mut p2 = P::default();
    let lw2 = lap_where(&f, &mut p2);
    let (a2, b2) = (p2.add(yw(f.d0)), p2.add(yw(f.d1)));
    let den = c.query_one(&format!("SELECT COALESCE(sum(l.total_kunjungan) FILTER (WHERE l.total_kunjungan > 0), 0)::bigint, count(*) FILTER (WHERE l.total_kunjungan > 0)::bigint, count(*)::bigint
                                    FROM laporan_ibs l WHERE {lw2} AND l.tahun * 100 + l.minggu BETWEEN {a2} AND {b2}"), &p2.refs()).await.map_err(internal)?;
    let (kunj, lap_k, lap_all): (i64, i64, i64) = (den.get(0), den.get(1), den.get(2));
    let total_kasus: i64 = rows.iter().map(|r| r.get::<_, i64>(2)).sum();
    let penyakit: Vec<Value> = rows.iter().map(|r| {
        let (ks, mt, kk_, mk): (i64, i64, i64, i64) = (r.get(2), r.get(3), r.get(5), r.get(6));
        json!({ "penyakit": r.get::<_, String>(0), "label": r.get::<_, Option<String>>(1), "kasus": ks, "kematian": mt, "laporan": r.get::<_, i64>(4),
                "cfr_pct": pct(mt, ks), "porsi_pct": pct(ks, total_kasus), "kasus_berpenyebut": kk_, "kematian_berpenyebut": mk,
                "proporsi_kunjungan_pct": if kunj > 0 { json!((kk_ as f64 * 10000.0 / kunj as f64).round() / 100.0) } else { Value::Null } })
    }).collect();
    // per wilayah
    let mut p3 = P::default();
    let lw3 = lap_where(&f, &mut p3);
    let (a3, b3) = (p3.add(yw(f.d0)), p3.add(yw(f.d1)));
    let src3 = facts(&f, &mut p3, f.d0, f.d1, false);
    let wq = format!(
        "WITH d AS (SELECT {wk} AS w, sum(l.total_kunjungan) FILTER (WHERE l.total_kunjungan > 0) AS kunj, count(*) FILTER (WHERE l.total_kunjungan > 0) AS lk
                    FROM laporan_ibs l WHERE {lw3} AND l.tahun * 100 + l.minggu BETWEEN {a3} AND {b3} GROUP BY 1),
              kk AS (SELECT l.id FROM laporan_ibs l WHERE {lw3} AND l.tahun * 100 + l.minggu BETWEEN {a3} AND {b3} AND l.total_kunjungan > 0),
              n AS (SELECT {fk} AS w, sum(f.kasus) AS kasus, sum(f.mati) AS mati, sum(f.kasus) FILTER (WHERE kk.id IS NOT NULL) AS kk
                    FROM (SELECT f.* FROM {src3}) f LEFT JOIN kk ON f.src = 'ibs' AND kk.id = f.id GROUP BY 1)
         SELECT COALESCE(n.w, d.w), COALESCE(n.kasus, 0)::bigint, COALESCE(n.mati, 0)::bigint, COALESCE(n.kk, 0)::bigint, COALESCE(d.kunj, 0)::bigint, COALESCE(d.lk, 0)::bigint
         FROM n FULL JOIN d ON d.w = n.w ORDER BY 2 DESC", wk = lap_wil(lv), fk = lv.key());
    let wrows = c.query(&wq, &p3.refs()).await.map_err(internal)?;
    let wilayah: Vec<Value> = wrows.iter().map(|r| {
        let key: String = r.get(0);
        let (ks, mt, kk_, kj, lk): (i64, i64, i64, i64, i64) = (r.get(1), r.get(2), r.get(3), r.get(4), r.get(5));
        json!({ "key": key, "label": names.wil(lv, &key), "kasus": ks, "kematian": mt, "cfr_pct": pct(mt, ks), "porsi_pct": pct(ks, total_kasus),
                "kasus_berpenyebut": kk_, "kunjungan": kj, "laporan_berpenyebut": lk,
                "proporsi_kunjungan_pct": if kj > 0 { json!((kk_ as f64 * 10000.0 / kj as f64).round() / 100.0) } else { Value::Null } })
    }).collect();
    let mut kal = vec![];
    if let Some(t) = penyakit.first() { kal.push(format!("{} menyumbang {}% dari seluruh kasus ({} dari {}).", t["label"].as_str().unwrap_or(""), t["porsi_pct"], fmt_n(t["kasus"].as_i64().unwrap_or(0)), fmt_n(total_kasus))); }
    if f.src == Src::Ebs {
        kal.push("Laporan EBS tidak memuat jumlah kunjungan, jadi proporsi terhadap kunjungan tidak dihitung; yang tampil adalah porsi terhadap total kasus EBS.".into());
    } else if kunj == 0 {
        kal.push(format!("Belum ada Laporan Agregat IBS dengan Total Kunjungan terisi (0 dari {} laporan) - proporsi kasus terhadap kunjungan belum bisa dihitung.", fmt_n(lap_all)));
    } else {
        kal.push(format!("Penyebut: {} kunjungan dari {} Laporan Agregat IBS yang mengisi Total Kunjungan ({} dari {} laporan).", fmt_n(kunj), fmt_n(lap_k), pct(lap_k, lap_all), fmt_n(lap_all)));
    }
    Ok(Json(json!({
        "success": true, "meta": meta(&f, &names), "penyakit": penyakit, "wilayah": wilayah,
        "penyebut": { "kunjungan": kunj, "laporan_berpenyebut": lap_k, "laporan_total": lap_all, "cakupan_pct": pct(lap_k, lap_all), "total_kasus": total_kasus },
        "insiden": { "tersedia": false, "catatan": "Data jumlah penduduk per wilayah belum tersedia di sistem, sehingga insiden per 100.000 penduduk tidak dihitung (tidak memakai penyebut tetap 100.000)." },
        "interpretasi": kal, "ms": t0.elapsed().as_millis(),
    })))
}

// ─── GET /api/v1/analisa/kinerja ─────────────────────────────────────────────
pub async fn kinerja(State(st): State<AppState>, Query(q): Query<Q>) -> Result<Json<Value>, ApiError> {
    let t0 = std::time::Instant::now();
    let c = st.pool.get().await.map_err(internal)?;
    let f = F::from(&q);
    let lv = f.level();
    let names = names(&c).await?;
    let cfg = settings(&c).await;
    let batas = cfg_i(&cfg, &["ketepatan_batas_hari"], 10) as i32;
    let today_ws = { let t = Local::now().date_naive(); t - Duration::days(t.weekday().num_days_from_sunday() as i64) };
    // only weeks that have already ended count as "expected"
    let d1e = f.d1.min(today_ws - Duration::weeks(1));
    let w_exp = if d1e >= f.d0 { (d1e - f.d0).num_days() / 7 + 1 } else { 0 };
    let mut out = json!({ "success": true, "meta": meta(&f, &names), "minggu_diharapkan": w_exp, "batas_hari": batas,
        "target_pct": cfg_i(&cfg, &["target_pct"], 80), "ambang": cfg["ambang"].clone(),
        "definisi": { "ketepatan": cfg["ketepatan_def"].clone(), "kelengkapan": cfg["kelengkapan_def"].clone() } });
    let mut kal: Vec<String> = vec![];
    if f.ibs() {
        let (yy0, yy1) = (mmwr_week_of(f.d0).0, mmwr_week_of(f.d1).0);
        let mut p = P::default();
        let lw = lap_where(&f, &mut p);
        let (y0, y1, a, b, bt) = (p.add(yy0), p.add(yy1), p.add(f.d0), p.add(d1e), p.add(batas));
        let base = format!(
            "r AS (SELECT l.unit_key, l.tahun * 100 + l.minggu AS yw, skdr_mmwr_week_start(l.tahun, l.minggu) AS ws, l.submitted_at, {wk} AS w,
                          NULLIF(trim(l.unit_nama), '') AS nm, NULLIF(trim(l.data->>'jenis_unit'), '') AS ju
                   FROM laporan_ibs l WHERE {lw} AND l.tahun BETWEEN {y0} AND {y1}),
             u AS (SELECT unit_key, (array_agg(w ORDER BY yw DESC))[1] AS w, (array_agg(nm ORDER BY yw DESC))[1] AS nm, (array_agg(ju ORDER BY yw DESC))[1] AS ju FROM r GROUP BY 1),
             x AS (SELECT unit_key, ws, bool_or(submitted_at < ((ws + {bt}::int)::timestamp AT TIME ZONE 'Asia/Jakarta')) AS tepat FROM r WHERE ws BETWEEN {a} AND {b} GROUP BY 1, 2)",
            wk = lap_wil(lv));
        let q1 = format!("WITH {base} SELECT u.w, count(DISTINCT u.unit_key)::bigint, count(x.ws)::bigint, count(x.ws) FILTER (WHERE x.tepat)::bigint
                          FROM u LEFT JOIN x USING (unit_key) GROUP BY 1");
        let q2 = format!("WITH {base} SELECT x.ws, count(*)::bigint, count(*) FILTER (WHERE x.tepat)::bigint, (SELECT count(*) FROM u)::bigint FROM x GROUP BY 1 ORDER BY 1");
        let q3 = format!("WITH {base} SELECT u.nm, u.w, u.ju, count(x.ws)::bigint, count(x.ws) FILTER (WHERE x.tepat)::bigint
                          FROM u LEFT JOIN x USING (unit_key) GROUP BY u.unit_key, u.nm, u.w, u.ju ORDER BY 4, 5, 1 LIMIT 20");
        let refs = p.refs();
        let (r1, r2, r3) = tokio::try_join!(c.query(&q1, &refs), c.query(&q2, &refs), c.query(&q3, &refs)).map_err(internal)?;
        let mut rows: Vec<Value> = r1.iter().map(|r| {
            let key: String = r.get(0);
            let (units, diterima, tepat): (i64, i64, i64) = (r.get(1), r.get(2), r.get(3));
            let exp = units * w_exp;
            json!({ "key": key, "label": names.wil(lv, &key), "unit": units, "diharapkan": exp, "diterima": diterima, "tepat": tepat,
                    "kelengkapan_pct": pct_cap(diterima, exp), "ketepatan_pct": pct_cap(tepat, exp), "ketepatan_diterima_pct": pct_cap(tepat, diterima) })
        }).collect();
        rows.sort_by(|a, b| a["kelengkapan_pct"].as_f64().unwrap_or(0.0).partial_cmp(&b["kelengkapan_pct"].as_f64().unwrap_or(0.0)).unwrap());
        let (tu, td, tt) = rows.iter().fold((0, 0, 0), |a, r| (a.0 + r["unit"].as_i64().unwrap(), a.1 + r["diterima"].as_i64().unwrap(), a.2 + r["tepat"].as_i64().unwrap()));
        let texp = tu * w_exp;
        let mingguan: Vec<Value> = r2.iter().map(|r| {
            let ws: NaiveDate = r.get(0);
            let (n, t, u): (i64, i64, i64) = (r.get(1), r.get(2), r.get(3));
            json!({ "ws": ws.to_string(), "label": wlabel(ws), "diharapkan": u, "diterima": n, "tepat": t, "kelengkapan_pct": pct_cap(n, u), "ketepatan_pct": pct_cap(t, u) })
        }).collect();
        let unit_rendah: Vec<Value> = r3.iter().map(|r| {
            let key: String = r.get(1);
            let (n, t): (i64, i64) = (r.get(3), r.get(4));
            json!({ "unit": r.get::<_, Option<String>>(0), "wilayah": names.wil(lv, &key), "jenis_unit": r.get::<_, Option<String>>(2), "diharapkan": w_exp, "diterima": n, "tepat": t,
                    "kelengkapan_pct": pct_cap(n, w_exp), "ketepatan_pct": pct_cap(t, w_exp) })
        }).collect();
        let target = cfg_i(&cfg, &["target_pct"], 80) as f64;
        let below = rows.iter().filter(|r| r["kelengkapan_pct"].as_f64().map(|v| v < target).unwrap_or(false)).count();
        kal.push(format!("Kelengkapan Laporan Agregat IBS {}% ({} dari {} unit x minggu diharapkan), ketepatan {}%.", pct_cap(td, texp), fmt_n(td), fmt_n(texp), pct_cap(tt, texp)));
        if !rows.is_empty() { kal.push(format!("{} dari {} {} di bawah target {}%; terendah: {} ({}%).", below, rows.len(), lv.label().to_lowercase(), target, rows[0]["label"].as_str().unwrap_or(""), rows[0]["kelengkapan_pct"])); }
        out["ibs"] = json!({ "wilayah": rows, "total": { "unit": tu, "diharapkan": texp, "diterima": td, "tepat": tt, "kelengkapan_pct": pct_cap(td, texp), "ketepatan_pct": pct_cap(tt, texp) },
                              "mingguan": mingguan, "unit_rendah": unit_rendah,
                              "catatan": "Data hasil impor API SKDR lama hanya memuat unit x minggu yang memiliki alert, sehingga kelengkapan dari data impor lebih rendah dari kelengkapan pelaporan sebenarnya." });
    }
    if f.ebs() {
        // cakupan unit pelapor EBS vs fasyankes terdaftar (master_fasyankes: Puskesmas + RS aktif)
        let mut p = P::default();
        let src = facts(&F { src: Src::Ebs, ..F::from(&q) }, &mut p, f.d0, f.d1, false);
        let mut fw = vec!["COALESCE(m.status_aktif, true)".to_string()];
        if !f.prov.is_empty() { fw.push(format!("m.province_id = ANY({})", p.add(f.prov.clone()))); }
        if !f.kab.is_empty() { fw.push(format!("m.kabkota_id = ANY({})", p.add(f.kab.clone()))); }
        if let Some(k) = &f.kec { fw.push(format!("initcap(trim(m.nama_kecamatan)) = {}", p.add(k.clone()))); }
        let mk = match lv { Lv::Prov => "COALESCE(m.province_id::text, '')", Lv::Kab => "COALESCE(m.kabkota_id::text, '')", Lv::Kec => "COALESCE(initcap(trim(m.nama_kecamatan)), '')", Lv::Unit => "m.nama" };
        let q1 = format!(
            "WITH n AS (SELECT {fk} AS w, count(DISTINCT lower(f.unit)) FILTER (WHERE f.jenis_unit IN ('Puskesmas', 'Rumah Sakit')) AS u_fks, count(DISTINCT lower(f.unit)) AS u_all,
                               count(*) AS lap, sum(f.kasus) AS kasus FROM {src} GROUP BY 1),
                  d AS (SELECT {mk} AS w, count(*) AS fks FROM master_fasyankes m WHERE {fw} GROUP BY 1)
             SELECT COALESCE(n.w, d.w), COALESCE(n.u_fks, 0)::bigint, COALESCE(n.u_all, 0)::bigint, COALESCE(d.fks, 0)::bigint, COALESCE(n.lap, 0)::bigint, COALESCE(n.kasus, 0)::bigint
             FROM n FULL JOIN d ON d.w = n.w", fk = lv.key(), fw = fw.join(" AND "));
        let r1 = c.query(&q1, &p.refs()).await.map_err(internal)?;
        let mut rows: Vec<Value> = r1.iter().map(|r| {
            let key: String = r.get(0);
            let (uf, ua, fks, lap, ks): (i64, i64, i64, i64, i64) = (r.get(1), r.get(2), r.get(3), r.get(4), r.get(5));
            json!({ "key": key, "label": names.wil(lv, &key), "unit_fasyankes_melapor": uf, "unit_melapor": ua, "fasyankes_terdaftar": fks, "laporan": lap, "kasus": ks,
                    "cakupan_pct": pct_cap(uf, fks), "lebih_dari_terdaftar": uf > fks && fks > 0 })
        }).collect();
        rows.sort_by(|a, b| b["laporan"].as_i64().cmp(&a["laporan"].as_i64()));
        let (tuf, tfk) = rows.iter().fold((0, 0), |a, r| (a.0 + r["unit_fasyankes_melapor"].as_i64().unwrap(), a.1 + r["fasyankes_terdaftar"].as_i64().unwrap()));
        // 7-1-7 + kelengkapan isian (Laporan EBS)
        let mut p2 = P::default();
        let src2 = facts(&F { src: Src::Ebs, ..F::from(&q) }, &mut p2, f.d0, f.d1, false);
        let q2 = format!(
            "SELECT count(*)::bigint,
                    count(*) FILTER (WHERE e.tgl_onset IS NOT NULL AND e.tgl_rumor IS NOT NULL)::bigint,
                    count(*) FILTER (WHERE e.tgl_onset IS NOT NULL AND e.tgl_rumor IS NOT NULL AND e.tgl_rumor - e.tgl_onset <= 7)::bigint,
                    count(*) FILTER (WHERE COALESCE(e.status_rumor, '') <> 'Discarded')::bigint,
                    count(*) FILTER (WHERE COALESCE(e.status_rumor, '') <> 'Discarded' AND e.dibuat::date - COALESCE(e.tgl_rumor, e.tgl) <= 1)::bigint,
                    count(*) FILTER (WHERE e.respon_pertama IS NOT NULL)::bigint,
                    count(*) FILTER (WHERE e.respon_pertama IS NOT NULL AND e.respon_pertama - e.dibuat <= interval '7 days')::bigint,
                    percentile_cont(0.5) WITHIN GROUP (ORDER BY e.dibuat::date - COALESCE(e.tgl_rumor, e.tgl))::float8,
                    percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM e.respon_pertama - e.dibuat) / 86400.0)::float8,
                    count(e.kecamatan)::bigint, count(e.penyakit_verif)::bigint, count(e.status_rumor)::bigint, count(e.klb)::bigint,
                    count(e.sumber_informasi)::bigint, count(e.w1)::bigint, count(e.usia)::bigint, count(e.spesimen)::bigint, count(e.tgl_onset)::bigint,
                    count(e.unit)::bigint, count(e.jenis_unit)::bigint
             FROM analisa_ebs_fakta e WHERE e.id IN (SELECT f.id FROM {src2})");
        let r = c.query_one(&q2, &p2.refs()).await.map_err(internal)?;
        let g = |i: usize| r.get::<_, i64>(i);
        let n = g(0);
        let fields = [("Kecamatan", 9), ("Penyakit terverifikasi", 10), ("Status rumor", 11), ("Status KLB", 12), ("Sumber informasi", 13), ("Formulir W1", 14),
                      ("Kelompok umur & jenis kelamin", 15), ("Pengambilan spesimen", 16), ("Tanggal mulai gejala", 17), ("Unit pelapor", 18), ("Jenis unit", 19)];
        let isian: Vec<Value> = fields.iter().map(|(l, i)| json!({ "field": l, "terisi": g(*i), "total": n, "pct": pct(g(*i), n) })).collect();
        let t717 = json!([
            { "key": "deteksi", "label": "Deteksi ≤ 7 hari", "definisi": "Tanggal rumor diketahui − tanggal mulai gejala ≤ 7 hari (laporan yang mengisi kedua tanggal).", "memenuhi": g(2), "penyebut": g(1), "pct": pct(g(2), g(1)) },
            { "key": "notifikasi", "label": "Notifikasi ≤ 1 hari", "definisi": "Tanggal laporan dibuat di sistem − tanggal rumor diketahui (atau tanggal laporan) ≤ 1 hari; laporan Discarded tidak dihitung.", "memenuhi": g(4), "penyebut": g(3), "pct": pct(g(4), g(3)), "median_hari": r.get::<_, Option<f64>>(7) },
            { "key": "respons", "label": "Respons awal ≤ 7 hari", "definisi": "Pembaruan/tindakan pertama setelah laporan dibuat ≤ 7 hari (laporan yang sudah memiliki pembaruan).", "memenuhi": g(6), "penyebut": g(5), "pct": pct(g(6), g(5)), "median_hari": r.get::<_, Option<f64>>(8).map(|v| (v * 10.0).round() / 10.0) },
        ]);
        kal.push(format!("Cakupan Laporan EBS: {} dari {} fasyankes terdaftar (Puskesmas + RS) mengirim ≥ 1 Laporan EBS ({}%).", fmt_n(tuf), fmt_n(tfk), pct_cap(tuf, tfk)));
        if g(3) > 0 { kal.push(format!("Notifikasi ≤ 1 hari tercapai pada {}% Laporan EBS; respons awal ≤ 7 hari {}% (dari {} laporan yang sudah diperbarui).", pct(g(4), g(3)), pct(g(6), g(5)), fmt_n(g(5)))); }
        if g(1) == 0 && n > 0 { kal.push("Deteksi (7) belum bisa dihitung: tanggal mulai gejala belum terisi pada Laporan EBS periode ini (data impor API lama tidak memuat field ini).".into()); }
        out["ebs"] = json!({ "wilayah": rows, "total": { "unit_fasyankes_melapor": tuf, "fasyankes_terdaftar": tfk, "cakupan_pct": pct_cap(tuf, tfk), "laporan": n },
                              "t717": t717, "isian": isian,
                              "definisi_cakupan": "Cakupan = unit Puskesmas/RS berbeda (nama unit) yang mengirim ≥ 1 Laporan EBS pada periode ÷ jumlah Puskesmas + RS aktif di master fasyankes wilayah tersebut (dibatasi maks. 100%)." });
    }
    out["interpretasi"] = json!(kal);
    out["ms"] = json!(t0.elapsed().as_millis());
    Ok(Json(out))
}

// ─── GET /api/v1/analisa/sinyal ──────────────────────────────────────────────
/// Alert IBS / sinyal Laporan EBS: per penyakit & wilayah, kualitas sinyal + konversi KLB (EBS), sumber informasi,
/// 20 kecamatan hotspot, tren mingguan alert.
pub async fn sinyal(State(st): State<AppState>, Query(q): Query<Q>) -> Result<Json<Value>, ApiError> {
    let t0 = std::time::Instant::now();
    let c = st.pool.get().await.map_err(internal)?;
    let f = F::from(&q);
    let lv = f.level();
    let names = names(&c).await?;
    let mut p = P::default();
    let src = facts(&f, &mut p, f.d0, f.d1, false);
    let agg = "count(*)::bigint, count(*) FILTER (WHERE f.verif = 'Terverifikasi')::bigint, count(*) FILTER (WHERE f.klb = 'Ya')::bigint,
               count(*) FILTER (WHERE f.respon = '≤ 24 jam')::bigint, count(f.respon)::bigint, COALESCE(sum(f.kasus), 0)::bigint, COALESCE(sum(f.mati), 0)::bigint,
               count(*) FILTER (WHERE f.verif = 'Discarded')::bigint, count(*) FILTER (WHERE f.verif = 'Dalam investigasi')::bigint, count(*) FILTER (WHERE f.verif IS NULL)::bigint,
               count(*) FILTER (WHERE f.klb = 'Ya' AND f.verif = 'Terverifikasi')::bigint";
    let qp = format!("SELECT f.pkey, min(f.pnama), {agg} FROM {src} AND f.alert GROUP BY 1 ORDER BY 3 DESC");
    let qw = format!("SELECT {k}, NULL::text, {agg} FROM {src} AND f.alert GROUP BY 1 ORDER BY 3 DESC", k = lv.key());
    let qs = format!("SELECT COALESCE(f.sumber_info, '{KOSONG}'), NULL::text, {agg} FROM {src} AND f.src = 'ebs' GROUP BY 1 ORDER BY 3 DESC");
    let qk = format!("SELECT COALESCE(f.kab::text, '') || '|' || COALESCE(f.kec, ''), NULL::text, {agg} FROM {src} AND f.alert AND f.kec IS NOT NULL GROUP BY 1 ORDER BY 3 DESC, 8 DESC LIMIT 20");
    let qt = format!("SELECT f.ws::text, NULL::text, {agg} FROM {src} AND f.alert GROUP BY 1 ORDER BY 1");
    let qq = format!("SELECT f.src, NULL::text, {agg} FROM {src} AND f.alert GROUP BY 1");
    let refs = p.refs();
    let (rp, rw, rs, rk, rt, rq) = tokio::try_join!(c.query(&qp, &refs), c.query(&qw, &refs), c.query(&qs, &refs), c.query(&qk, &refs), c.query(&qt, &refs), c.query(&qq, &refs)).map_err(internal)?;
    let row = |r: &tokio_postgres::Row, key: String, label: String| {
        let g = |i: usize| r.get::<_, i64>(i);
        json!({ "key": key, "label": label, "alert": g(2), "terverifikasi": g(3), "klb": g(4), "respon24": g(5), "respon_tercatat": g(6), "kasus": g(7), "kematian": g(8),
                "discarded": g(9), "investigasi": g(10), "belum_diisi": g(11),
                "klb_terverifikasi": g(12), "verif_pct": pct(g(3), g(2)), "klb_pct": pct(g(4), g(2)), "konversi_klb_pct": pct(g(12), g(3)), "respon24_pct": pct(g(5), g(6)), "cfr_pct": pct(g(8), g(7)) })
    };
    let penyakit: Vec<Value> = rp.iter().map(|r| row(r, r.get(0), r.get::<_, Option<String>>(1).unwrap_or_default())).collect();
    let wilayah: Vec<Value> = rw.iter().map(|r| { let k: String = r.get(0); row(r, k.clone(), names.wil(lv, &k)) }).collect();
    let sumber_info: Vec<Value> = rs.iter().map(|r| { let k: String = r.get(0); row(r, k.clone(), k) }).collect();
    let hotspot: Vec<Value> = rk.iter().map(|r| {
        let k: String = r.get(0);
        let (kab, kec) = k.split_once('|').unwrap_or(("", ""));
        row(r, k.clone(), format!("Kec. {kec}, {}", names.wil(Lv::Kab, kab)))
    }).collect();
    let tren: Vec<Value> = rt.iter().map(|r| { let k: String = r.get(0); let lbl = periode_label("minggu", &k); row(r, k, lbl) }).collect();
    let per_src: Vec<Value> = rq.iter().map(|r| { let k: String = r.get(0); row(r, k.clone(), if k == "ebs" { "Laporan EBS".into() } else { "Alert IBS".to_string() }) }).collect();
    let tot = |key: &str| per_src.iter().find(|x| x["key"] == key).cloned();
    let mut kal = vec![];
    if let Some(e) = tot("ebs") {
        kal.push(format!("{} sinyal EBS: {}% terverifikasi, {}% discarded, {}% masih investigasi; {} menjadi KLB (konversi {}% dari yang terverifikasi).",
            fmt_n(e["alert"].as_i64().unwrap_or(0)), e["verif_pct"], pct(e["discarded"].as_i64().unwrap_or(0), e["alert"].as_i64().unwrap_or(0)),
            pct(e["investigasi"].as_i64().unwrap_or(0), e["alert"].as_i64().unwrap_or(0)), fmt_n(e["klb"].as_i64().unwrap_or(0)), e["konversi_klb_pct"]));
    }
    if let Some(i) = tot("ibs") {
        kal.push(format!("{} alert IBS: {}% terverifikasi, {}% direspons ≤ 24 jam, {} KLB.", fmt_n(i["alert"].as_i64().unwrap_or(0)), i["verif_pct"], i["respon24_pct"], fmt_n(i["klb"].as_i64().unwrap_or(0))));
    }
    if let Some(t) = penyakit.first() { kal.push(format!("Alert/sinyal terbanyak: {} ({}).", t["label"].as_str().unwrap_or(""), fmt_n(t["alert"].as_i64().unwrap_or(0)))); }
    if let Some(h) = hotspot.first() { kal.push(format!("Kecamatan hotspot teratas: {} ({} alert/sinyal, {} kasus).", h["label"].as_str().unwrap_or(""), fmt_n(h["alert"].as_i64().unwrap_or(0)), fmt_n(h["kasus"].as_i64().unwrap_or(0)))); }
    Ok(Json(json!({
        "success": true, "meta": meta(&f, &names), "per_sumber": per_src, "penyakit": penyakit, "wilayah": wilayah, "sumber_informasi": sumber_info,
        "hotspot": hotspot, "tren": tren, "interpretasi": kal, "ms": t0.elapsed().as_millis(),
        "definisi": {
            "alert_ibs": "Alert IBS = baris Laporan Agregat IBS yang berasal dari alert SKDR (kasus melewati ambang); status verifikasi, KLB, respons dan spesimen dari Alert SKDR.",
            "sinyal_ebs": "Setiap Laporan EBS = satu sinyal. Terverifikasi = status Terverifikasi*, Discarded = bukan kejadian, Dalam investigasi = belum disimpulkan.",
            "konversi_klb": "Konversi KLB = sinyal/alert terverifikasi yang berstatus KLB ÷ seluruh sinyal/alert terverifikasi (maks. 100%). Kolom KLB menghitung semua status KLB = Ya.",
            "respon24": "Respons ≤ 24 jam: IBS dari Alert SKDR (respon24); EBS = pembaruan/tindakan pertama ≤ 24 jam setelah laporan dibuat (hanya laporan yang sudah diperbarui).",
        },
    })))
}

// ─── GET /api/v1/analisa/daftar ──────────────────────────────────────────────
/// Paginated, searchable line lists: jenis = ebs | alert | agregat | individu | klb (Surveilans Terpadu Penyakit Berbasis KLB).
/// Nama pasien disamarkan; alamat, NIK, kronologi, dan kontak pelapor tidak pernah dikirim.
pub async fn daftar(State(st): State<AppState>, Query(q): Query<Q>) -> Result<Json<Value>, ApiError> {
    let t0 = std::time::Instant::now();
    let c = st.pool.get().await.map_err(internal)?;
    let f = F::from(&q);
    let names = names(&c).await?;
    let jenis = q.jenis.clone().unwrap_or_else(|| if f.src == Src::Ibs { "alert".into() } else { "ebs".into() });
    let per = q.per.unwrap_or(25).clamp(1, 10000);
    let page = q.page.unwrap_or(1).max(1);
    let off = (page - 1) * per;
    let order = if q.urut.as_deref() == Some("kasus") { "kasus DESC, tgl DESC" } else { "tgl DESC, no DESC" };
    let mut p = P::default();
    let search = opt_str(&q.q).map(|s| format!("%{}%", s.replace('%', "").replace('_', "")));
    let (sql, kind) = match jenis.as_str() {
        "individu" => {
            let mut fi = F::from(&q);
            fi.src = Src::Ibs;
            let src = facts(&fi, &mut p, f.d0, f.d1, true);
            let s = search.clone().map(|s| { let v = p.add(s); format!("AND (x.no ILIKE {v} OR x.unit ILIKE {v} OR x.pnama ILIKE {v} OR x.kec ILIKE {v})") }).unwrap_or_default();
            (format!("SELECT x.*, count(*) OVER () AS total FROM (
                        SELECT f.id, f.no, f.tgl, f.ws, f.prov, f.kab, f.kec, f.unit, f.jenis_unit, f.pnama, f.kasus, f.mati, f.kelamin, f.kel_umur,
                               i.nama_pasien, i.umur, i.status_akhir, i.diagnosa
                        FROM (SELECT f.* FROM {src} AND f.src = 'ind') f JOIN laporan_ibs_individu i ON i.id = f.id) x WHERE true {s}
                      ORDER BY {order} LIMIT {per} OFFSET {off}"), "individu")
        }
        "klb" => {
            let mut fe = F::from(&q);
            fe.src = Src::Ebs;
            let src = facts(&fe, &mut p, f.d0, f.d1, false);
            let s = search.clone().map(|s| { let v = p.add(s); format!("AND (x.no ILIKE {v} OR x.unit ILIKE {v} OR x.pnama ILIKE {v} OR x.kec ILIKE {v})") }).unwrap_or_default();
            (format!("SELECT x.*, count(*) OVER () AS total FROM (
                        SELECT f.id, f.no, f.tgl, f.ws, f.prov, f.kab, f.kec, f.unit, f.jenis_unit, f.pnama, f.kasus, f.mati, f.klb_status,
                               e.usia, COALESCE(e.klb_tgl_mulai, e.tgl_onset) AS tgl_mulai, e.klb_tgl_berakhir, COALESCE(e.tgl_rumor, e.tgl) AS tgl_diketahui, e.tgl_tanggulang
                        FROM (SELECT f.* FROM {src} AND f.klb = 'Ya') f JOIN analisa_ebs_fakta e ON e.id = f.id) x WHERE true {s}
                      ORDER BY {order} LIMIT {per} OFFSET {off}"), "klb")
        }
        other => {
            let mut fx = F::from(&q);
            fx.src = if other == "ebs" { Src::Ebs } else { Src::Ibs };
            let src = facts(&fx, &mut p, f.d0, f.d1, false);
            let extra = if other == "alert" { "AND f.alert" } else { "" };
            let s = search.clone().map(|s| { let v = p.add(s); format!("AND (x.no ILIKE {v} OR x.unit ILIKE {v} OR x.pnama ILIKE {v} OR x.kec ILIKE {v})") }).unwrap_or_default();
            (format!("SELECT x.*, count(*) OVER () AS total FROM (
                        SELECT f.id, f.no, f.tgl, f.ws, f.prov, f.kab, f.kec, f.unit, f.jenis_unit, f.pnama, f.kasus, f.mati, f.lab, f.klb, f.verif, f.respon,
                               f.status_rumor, f.klb_status, f.w1, f.sumber_info, f.spesimen, f.kelompok
                        FROM {src} {extra}) x WHERE true {s}
                      ORDER BY {order} LIMIT {per} OFFSET {off}"), if other == "ebs" { "ebs" } else if other == "alert" { "alert" } else { "agregat" })
        }
    };
    let rows = c.query(&sql, &p.refs()).await.map_err(internal)?;
    let mut total = 0i64;
    let data: Vec<Value> = rows.iter().map(|r| {
        total = r.get::<_, i64>("total");
        let ws: NaiveDate = r.get("ws");
        let tgl: Option<NaiveDate> = r.get("tgl");
        let prov: Option<i32> = r.get("prov");
        let kab: Option<i32> = r.get("kab");
        let mut o = json!({
            "no": r.get::<_, Option<String>>("no"), "minggu": wlabel(ws), "tanggal": tgl.map(|d| d.to_string()),
            "provinsi": prov.and_then(|i| names.prov.get(&i).cloned()), "kabkota": kab.and_then(|i| names.kab.get(&i).cloned()),
            "kecamatan": r.get::<_, Option<String>>("kec"), "unit": r.get::<_, Option<String>>("unit"), "jenis_unit": r.get::<_, Option<String>>("jenis_unit"),
            "penyakit": r.get::<_, Option<String>>("pnama"), "kasus": r.get::<_, i32>("kasus"), "kematian": r.get::<_, i32>("mati"),
        });
        match kind {
            "individu" => {
                let nm: Option<String> = r.get("nama_pasien");
                o["nama_pasien"] = json!(nm.map(|n| mask_name(&n)));
                o["jenis_kelamin"] = json!(r.get::<_, Option<String>>("kelamin"));
                o["umur"] = json!(r.get::<_, Option<String>>("umur"));
                o["status_akhir"] = json!(r.get::<_, Option<String>>("status_akhir"));
                o["diagnosa"] = json!(r.get::<_, Option<String>>("diagnosa"));
            }
            "klb" => {
                let usia: Option<Value> = r.get("usia");
                let mut u = serde_json::Map::new();
                for sex in ["pria", "wanita"] {
                    for (k, _) in USIA {
                        let v = usia.as_ref().and_then(|x| x.get(sex)).and_then(|x| x.get(*k)).map(|v| crate::dasbor_ebs_ibs::json_int(Some(v)));
                        u.insert(format!("{sex}_{k}"), json!(v));
                    }
                }
                o["usia"] = Value::Object(u);
                o["usia_terisi"] = json!(usia.is_some());
                o["status_klb"] = json!(r.get::<_, Option<String>>("klb_status"));
                for k in ["tgl_mulai", "klb_tgl_berakhir", "tgl_diketahui", "tgl_tanggulang"] { o[k] = json!(r.get::<_, Option<NaiveDate>>(k).map(|d| d.to_string())); }
            }
            _ => {
                for k in ["klb", "verif", "respon", "status_rumor", "klb_status", "w1", "sumber_info", "spesimen", "kelompok"] { o[k] = json!(r.get::<_, Option<String>>(k)); }
                o["lab"] = json!(r.get::<_, i32>("lab"));
            }
        }
        o
    }).collect();
    Ok(Json(json!({ "success": true, "meta": meta(&f, &names), "jenis": kind, "page": page, "per": per, "total": total, "data": data,
                    "usia_kolom": USIA.iter().map(|(k, l)| json!({ "key": k, "label": l })).collect::<Vec<_>>(), "ms": t0.elapsed().as_millis() })))
}

// ─── GET /api/v1/analisa/profil ──────────────────────────────────────────────
pub async fn profil(State(st): State<AppState>, Query(q): Query<Q>) -> Result<Json<Value>, ApiError> {
    let t0 = std::time::Instant::now();
    let c = st.pool.get().await.map_err(internal)?;
    let f = F::from(&q);
    let lv = f.level();
    let names = names(&c).await?;
    let mut p = P::default();
    let su = facts(&f, &mut p, f.d0, f.d1, true);
    let mut p2 = P::default();
    let sf = facts(&f, &mut p2, f.d0, f.d1, false);
    let q_usia = format!("SELECT f.kel_umur, f.kelamin, f.src, COALESCE(sum(f.kasus), 0)::bigint, COALESCE(sum(f.mati), 0)::bigint, count(DISTINCT f.id)::bigint FROM {su} GROUP BY 1, 2, 3");
    let q_cfr = format!("SELECT f.pkey, min(f.pnama), COALESCE(sum(f.kasus), 0)::bigint, COALESCE(sum(f.mati), 0)::bigint FROM {sf} GROUP BY 1 HAVING sum(f.kasus) > 0 ORDER BY 4 DESC, 3 DESC");
    let q_wil = format!("SELECT {k}, COALESCE(sum(f.kasus), 0)::bigint, COALESCE(sum(f.mati), 0)::bigint FROM {sf} GROUP BY 1 HAVING sum(f.mati) > 0 ORDER BY 3 DESC LIMIT 15", k = lv.key());
    let q_ebs = format!("SELECT count(*)::bigint FROM {sf} AND f.src = 'ebs'");
    let (r_u, r_c, r_w, r_e) = {
        let (a, b) = (p.refs(), p2.refs());
        tokio::try_join!(c.query(&q_usia, &a), c.query(&q_cfr, &b), c.query(&q_wil, &b), c.query_one(&q_ebs, &b)).map_err(internal)?
    };
    let mut grid: BTreeMap<String, (i64, i64, i64, i64)> = BTreeMap::new(); // band -> pria, wanita, lain, mati
    let mut lap_usia: HashSet<(String, i64)> = HashSet::new();
    let (mut ebs_n, mut ind_n) = (0i64, 0i64);
    for r in &r_u {
        let band: String = r.get(0);
        let sex: String = r.get(1);
        let src: String = r.get(2);
        let (n, m, l): (i64, i64, i64) = (r.get(3), r.get(4), r.get(5));
        let e = grid.entry(band).or_insert((0, 0, 0, 0));
        match sex.as_str() { "Pria" | "Laki-laki" => e.0 += n, "Wanita" | "Perempuan" => e.1 += n, _ => e.2 += n }
        e.3 += m;
        if src == "ebs" { ebs_n += n } else { ind_n += n }
        lap_usia.insert((src, l));
    }
    let mut usia: Vec<Value> = USIA.iter().map(|(k, l)| { let g = grid.get(*k).cloned().unwrap_or_default(); json!({ "key": k, "label": l, "pria": g.0, "wanita": g.1, "lain": g.2, "total": g.0 + g.1 + g.2, "kematian": g.3 }) }).collect();
    if let Some(g) = grid.get(KOSONG) { usia.push(json!({ "key": KOSONG, "label": "Umur belum diisi", "pria": g.0, "wanita": g.1, "lain": g.2, "total": g.0 + g.1 + g.2, "kematian": g.3 })); }
    let (tp, tw) = usia.iter().fold((0, 0), |a, x| (a.0 + x["pria"].as_i64().unwrap(), a.1 + x["wanita"].as_i64().unwrap()));
    let tot_kasus: i64 = r_c.iter().map(|r| r.get::<_, i64>(2)).sum();
    let tot_mati: i64 = r_c.iter().map(|r| r.get::<_, i64>(3)).sum();
    let cfr: Vec<Value> = r_c.iter().map(|r| { let (k, m): (i64, i64) = (r.get(2), r.get(3)); json!({ "penyakit": r.get::<_, String>(0), "label": r.get::<_, Option<String>>(1), "kasus": k, "kematian": m, "cfr_pct": pct(m, k), "ci95": wilson(m, k) }) }).collect();
    let wil: Vec<Value> = r_w.iter().map(|r| { let key: String = r.get(0); let (k, m): (i64, i64) = (r.get(1), r.get(2)); json!({ "key": key, "label": names.wil(lv, &key), "kasus": k, "kematian": m, "cfr_pct": pct(m, k) }) }).collect();
    let ebs_lap: i64 = r_e.get(0);
    let ebs_lap_usia = lap_usia.iter().filter(|(s, _)| s == "ebs").map(|(_, l)| *l).max().unwrap_or(0);
    let mut kal = vec![];
    kal.push(format!("{} kematian dari {} kasus (CFR {}%).", fmt_n(tot_mati), fmt_n(tot_kasus), pct(tot_mati, tot_kasus).as_f64().map(|v| v.to_string()).unwrap_or("-".into())));
    if let Some(t) = cfr.first() { if t["kematian"].as_i64().unwrap_or(0) > 0 { kal.push(format!("Kematian terbanyak: {} ({} kematian, CFR {}%).", t["label"].as_str().unwrap_or(""), fmt_n(t["kematian"].as_i64().unwrap_or(0)), t["cfr_pct"])); } }
    if tp + tw > 0 {
        let top = usia.iter().max_by_key(|x| x["total"].as_i64().unwrap_or(0)).unwrap();
        kal.push(format!("Kelompok umur terbanyak: {} ({} kasus); pria {}%, wanita {}%.", top["label"].as_str().unwrap_or(""), fmt_n(top["total"].as_i64().unwrap_or(0)), pct(tp, tp + tw), pct(tw, tp + tw)));
    } else {
        kal.push("Distribusi umur & jenis kelamin belum tersedia untuk filter ini: Laporan EBS hasil impor API lama dan Laporan Agregat IBS tidak memuat umur/jenis kelamin; data ini hanya ada di Laporan EBS dari form (isian usia) dan Laporan Individu IBS.".into());
    }
    Ok(Json(json!({
        "success": true, "meta": meta(&f, &names), "usia": usia, "jenis_kelamin": { "pria": tp, "wanita": tw },
        "cakupan": { "ebs_kasus_berumur": ebs_n, "individu_pasien": ind_n, "ebs_laporan": ebs_lap, "ebs_laporan_berumur": ebs_lap_usia },
        "cfr": cfr, "kematian_wilayah": wil, "total": { "kasus": tot_kasus, "kematian": tot_mati, "cfr_pct": pct(tot_mati, tot_kasus), "ci95": wilson(tot_mati, tot_kasus) },
        "interpretasi": kal, "ms": t0.elapsed().as_millis(),
        "definisi": { "cfr": "CFR = kematian ÷ kasus × 100% pada periode dan filter terpilih; selang kepercayaan 95% metode Wilson. Untuk IBS, kasus bersifat suspek/agregat sehingga CFR adalah CFR kasus terlapor, bukan CFR terkonfirmasi.",
                      "usia": "Kelompok umur mengikuti isian usia & jenis kelamin Laporan EBS (form) dan umur Laporan Individu IBS." },
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn masks_names() {
        assert_eq!(mask_name("Siti Aminah"), "S*** A*****");
        assert_eq!(mask_name("budi"), "B***");
        assert!(!mask_name("Andi Wijaya").contains("ndi"));
    }
    #[test]
    fn wilson_ci() {
        assert_eq!(wilson(0, 0), Value::Null);
        let v = wilson(5, 100);
        assert!(v[0].as_f64().unwrap() < 5.0 && v[1].as_f64().unwrap() > 5.0);
    }
    #[test]
    fn caps_and_labels() {
        assert_eq!(pct_cap(12, 10), json!(100.0));
        assert_eq!(periode_label("bulan", "2026-10"), "Okt 2026");
        assert_eq!(fmt_n(1234567), "1.234.567");
    }
    #[test]
    fn route_needs_login() {
        use axum::http::Method;
        assert_eq!(crate::auth::classify(&Method::GET, "/api/v1/analisa/pivot"), crate::auth::Need::Login);
    }
}

/// Live smoke test against a real database (DB_* env vars), e.g. inside the docker network:
/// `cargo test --release live_smoke -- --ignored --nocapture`. Prints timings and headline numbers per endpoint.
#[cfg(test)]
mod live {
    use super::*;
    fn qs(s: &str) -> Q { let u: axum::http::Uri = format!("/x?{s}").parse().unwrap(); Query::<Q>::try_from_uri(&u).expect("query").0 }
    #[tokio::test]
    #[ignore]
    async fn live_smoke() {
        let pool = crate::db::build_pool().expect("pool");
        let st = AppState { pool, ebs_running: Default::default(), alert_running: Default::default() };
        let jabar = { let c = st.pool.get().await.unwrap(); c.query_one("SELECT id FROM master_locations WHERE name ILIKE 'Jawa Barat'", &[]).await.unwrap().get::<_, i32>(0) };
        let bdg = { let c = st.pool.get().await.unwrap(); c.query_one("SELECT id FROM master_kabkota WHERE province_id = $1 AND name ILIKE '%Bandung' ORDER BY name LIMIT 1", &[&jabar]).await.unwrap().get::<_, i32>(0) };
        let cases = vec![
            ("ibs nasional M40-44 2026", "sumber=ibs&sy=2026&sw=40&ey=2026&ew=44".to_string()),
            ("ibs jabar M40-44 2026", format!("sumber=ibs&sy=2026&sw=40&ey=2026&ew=44&prov={jabar}")),
            ("ibs jabar>kab M40-44", format!("sumber=ibs&sy=2026&sw=40&ey=2026&ew=44&prov={jabar}&kab={bdg}")),
            ("ebs nasional 2026 M1-14", "sumber=ebs&sy=2026&sw=1&ey=2026&ew=14".to_string()),
            ("ebs jabar 2025 M40-44", format!("sumber=ebs&sy=2025&sw=40&ey=2025&ew=44&prov={jabar}")),
            ("semua jabar 2026 M1-44", format!("sumber=semua&sy=2026&sw=1&ey=2026&ew=44&prov={jabar}")),
            ("ibs tahun berjalan", "sumber=ibs&sy=2026&sw=1&ey=2026&ew=45".to_string()),
        ];
        for (name, base) in cases {
            println!("=== {name}: {base}");
            for ep in ["opsi", "ringkasan", "pivot", "pivot_periode", "pivot_usia", "morbiditas", "kinerja", "sinyal", "daftar", "daftar_klb", "profil"] {
                let t = std::time::Instant::now();
                let r = match ep {
                    "opsi" => opsi(State(st.clone()), Query(qs(&base))).await,
                    "ringkasan" => ringkasan(State(st.clone()), Query(qs(&base))).await,
                    "pivot" => pivot(State(st.clone()), Query(qs(&format!("{base}&baris=wilayah&kolom=penyakit")))).await,
                    "pivot_periode" => pivot(State(st.clone()), Query(qs(&format!("{base}&baris=periode&kolom=none&periode=bulan")))).await,
                    "pivot_usia" => pivot(State(st.clone()), Query(qs(&format!("{base}&baris=kel_umur&kolom=kelamin")))).await,
                    "morbiditas" => morbiditas(State(st.clone()), Query(qs(&base))).await,
                    "kinerja" => kinerja(State(st.clone()), Query(qs(&base))).await,
                    "sinyal" => sinyal(State(st.clone()), Query(qs(&base))).await,
                    "daftar" => daftar(State(st.clone()), Query(qs(&format!("{base}&per=25")))).await,
                    "daftar_klb" => daftar(State(st.clone()), Query(qs(&format!("{base}&jenis=klb&per=25")))).await,
                    _ => profil(State(st.clone()), Query(qs(&base))).await,
                };
                let ms = t.elapsed().as_millis();
                match r {
                    Ok(Json(v)) => {
                        let s = v.to_string();
                        let head = match ep {
                            "ringkasan" => format!("kpi={} flags={} interp={}", v["kpi"].as_array().map(|a| a.iter().map(|k| format!("{}:{}", k["key"].as_str().unwrap_or(""), k["nilai"])).collect::<Vec<_>>().join(",")).unwrap_or_default(), v["flags"].as_array().map(|a| a.len()).unwrap_or(0), v["interpretasi"]),
                            "pivot" | "pivot_periode" | "pivot_usia" => format!("cells={} first={}", v["data"].as_array().map(|a| a.len()).unwrap_or(0), v["data"][0]),
                            "kinerja" => format!("ibs={} ebs={} interp={}", v["ibs"]["total"], v["ebs"]["total"], v["interpretasi"]),
                            "sinyal" => format!("per_sumber={} interp={}", v["per_sumber"], v["interpretasi"]),
                            "daftar" | "daftar_klb" => format!("total={} first={}", v["total"], v["data"][0]),
                            "morbiditas" => format!("penyebut={} top={}", v["penyebut"], v["penyakit"][0]),
                            "profil" => format!("total={} cakupan={} interp={}", v["total"], v["cakupan"], v["interpretasi"]),
                            _ => format!("penyakit={} kec={}", v["penyakit"].as_array().map(|a| a.len()).unwrap_or(0), v["kecamatan"].as_array().map(|a| a.len()).unwrap_or(0)),
                        };
                        let head: String = head.chars().take(700).collect();
                        println!("  {ep:<14} {ms:>6} ms  {:>8} B  {head}", s.len());
                    }
                    Err((code, Json(e))) => println!("  {ep:<14} {ms:>6} ms  ERROR {code} {e}"),
                }
            }
        }
    }
}
