//! PR 030: Form SKDR-EBS & SKDR-IBS versi wizard (draf + kirim) — input laporan di SKDR Indonesia.
//! * Data form disimpan utuh sebagai JSONB (`data`) + kolom ringkas untuk daftar & cek duplikat.
//! * Validasi server mencerminkan validasi inline di frontend (`lib/laporan/*`): draf boleh belum lengkap (errors
//!   disimpan), Kirim ditolak 422 bila masih ada error, IBS ditolak 409 bila unit+tahun+minggu sudah terkirim.
//! * Pilihan form: laporan_opsi + ebs_diagnosa_alias (penyakit EBS resmi) + ibs_penyakit; wilayah dari master_*,
//!   kecamatan & unit dari master_fasyankes (fallback: nilai tersinkron di ebs_reports).
//! Akses (auth::classify): baca = `tatakelola`, tulis = `pe_input`.
//! PR 031: jenis ketiga `individu` = Form Individu IBS (per pasien, tabel laporan_ibs_individu, nomor IND-YYYY-######);
//! tanpa lampiran, tanpa batas satu-per-minggu (duplikat hanya peringatan: unit + nama pasien + tanggal periksa).
use axum::{
    body::{Body, Bytes},
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::{Datelike, Duration, NaiveDate};
use serde::Deserialize;
use serde_json::{json, Map, Value};

use crate::auth::AuthUser;
use crate::pe_engine::today;
use crate::{bad_request, internal, ApiError, AppState};

type Me = Option<axum::Extension<AuthUser>>;
type Obj = Map<String, Value>;

const OFFSET_HOURS: i64 = 7; // WIB
pub const MAX_LAMPIRAN: usize = 5 * 1024 * 1024;
pub const LAMPIRAN_TIPE: &[&str] = &[
    "application/pdf", "image/jpeg", "image/png", "image/webp", "text/csv", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

fn err(code: StatusCode, msg: &str) -> ApiError {
    (code, Json(json!({ "success": false, "error": msg })))
}

fn me(u: &Me) -> Result<AuthUser, ApiError> {
    u.as_ref().map(|e| e.0.clone()).ok_or_else(|| err(StatusCode::UNAUTHORIZED, "Silakan masuk terlebih dahulu"))
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Jenis {
    Ebs,
    Ibs,
    Individu,
}

impl Jenis {
    fn parse(s: &str) -> Result<Self, ApiError> {
        match s {
            "ebs" => Ok(Jenis::Ebs),
            "ibs" => Ok(Jenis::Ibs),
            "individu" => Ok(Jenis::Individu),
            _ => Err(err(StatusCode::NOT_FOUND, "Jenis laporan tidak dikenal")),
        }
    }
    fn table(self) -> &'static str {
        match self { Jenis::Ebs => "laporan_ebs", Jenis::Ibs => "laporan_ibs", Jenis::Individu => "laporan_ibs_individu" }
    }
    fn key(self) -> &'static str {
        match self { Jenis::Ebs => "ebs", Jenis::Ibs => "ibs", Jenis::Individu => "individu" }
    }
    fn prefix(self) -> &'static str {
        match self { Jenis::Ebs => "EBS", Jenis::Ibs => "IBS", Jenis::Individu => "IND" }
    }
}

// ─── helpers on the JSON data ─────────────────────────────────────────────────

fn s(d: &Obj, k: &str) -> Option<String> {
    match d.get(k) {
        Some(Value::String(v)) if !v.trim().is_empty() => Some(v.trim().to_string()),
        Some(Value::Number(n)) => Some(n.to_string()),
        Some(Value::Array(a)) if !a.is_empty() => Some(a.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join(", ")),
        Some(Value::Bool(true)) => Some("true".into()),
        _ => None,
    }
}
fn num(v: Option<&Value>) -> Option<f64> {
    match v {
        Some(Value::Number(n)) => n.as_f64(),
        Some(Value::String(x)) if !x.trim().is_empty() => x.trim().parse().ok(),
        _ => None,
    }
}
fn n(d: &Obj, k: &str) -> Option<f64> {
    num(d.get(k))
}
fn int(d: &Obj, k: &str) -> Option<i32> {
    n(d, k).map(|f| f as i32)
}
/// decimal measurement typed with comma or dot ("36,5" / "36.5")
fn dec(d: &Obj, k: &str) -> Option<f64> {
    match d.get(k) {
        Some(Value::String(x)) if !x.trim().is_empty() => x.trim().replace(',', ".").parse().ok(),
        v => num(v),
    }
}
fn date(d: &Obj, k: &str) -> Option<NaiveDate> {
    d.get(k).and_then(|v| v.as_str()).and_then(|x| NaiveDate::parse_from_str(x.trim(), "%Y-%m-%d").ok())
}
fn ya(d: &Obj, k: &str) -> bool {
    s(d, k).as_deref() == Some("Ya")
}
fn truthy(d: &Obj, k: &str) -> bool {
    matches!(d.get(k), Some(Value::Bool(true)))
}

pub fn valid_hp(x: &str) -> bool {
    let digits: String = x.chars().filter(|c| !matches!(c, ' ' | '-' | '.' | '(' | ')')).collect();
    let rest = if let Some(r) = digits.strip_prefix("+62") { r } else if let Some(r) = digits.strip_prefix("62") { r } else if let Some(r) = digits.strip_prefix('0') { r } else { return false };
    rest.starts_with('8') && (8..=12).contains(&rest.len()) && rest.chars().all(|c| c.is_ascii_digit())
}

/// MMWR epi week (Sunday–Saturday, week 1 contains 4 January) — same calendar as lib/epi-week.ts.
pub fn mmwr_week_one(year: i32) -> NaiveDate {
    let j4 = NaiveDate::from_ymd_opt(year, 1, 4).unwrap();
    j4 - Duration::days(j4.weekday().num_days_from_sunday() as i64)
}
pub fn weeks_in_year(year: i32) -> i32 {
    ((mmwr_week_one(year + 1) - mmwr_week_one(year)).num_days() / 7) as i32
}

struct Issues {
    errors: Vec<Value>,
    warnings: Vec<Value>,
}
impl Issues {
    fn new() -> Self {
        Issues { errors: vec![], warnings: vec![] }
    }
    fn e(&mut self, step: &str, key: &str, msg: &str) {
        self.errors.push(json!({ "step": step, "key": key, "msg": msg }));
    }
    fn w(&mut self, step: &str, key: &str, msg: &str) {
        self.warnings.push(json!({ "step": step, "key": key, "msg": msg }));
    }
    fn req(&mut self, d: &Obj, step: &str, key: &str, label: &str) -> bool {
        if s(d, key).is_none() {
            self.e(step, key, &format!("{label} wajib diisi"));
            return false;
        }
        true
    }
    fn nonneg(&mut self, d: &Obj, step: &str, key: &str, label: &str) {
        if let Some(v) = d.get(key) {
            if !v.is_null() && !(v.is_string() && v.as_str().unwrap().trim().is_empty()) {
                match num(Some(v)) {
                    Some(x) if x >= 0.0 && x.fract() == 0.0 => {}
                    _ => self.e(step, key, &format!("{label} harus bilangan bulat ≥ 0")),
                }
            }
        }
    }
    fn not_future(&mut self, d: &Obj, step: &str, key: &str, label: &str, max: NaiveDate) {
        if let Some(x) = date(d, key) {
            if x > max {
                self.e(step, key, &format!("{label} tidak boleh setelah Tanggal Laporan"));
            }
        }
    }
}

pub const USIA_BANDS: [&str; 11] = ["0_7hr", "8_28hr", "lt1th", "1_4th", "5_9th", "10_14th", "15_19th", "20_44th", "45_54th", "55_69th", "gt70th"];

/// EBS (7 langkah: s1 Pelapor & Wilayah, s2 Informasi Rumor, s3 Kasus & Klinis, s4 Lab & Tata Laksana,
/// s5 Status KLB & Tindakan, s6 Lampiran, s7 Tinjau & Kirim).
fn validate_ebs(d: &Obj, today: NaiveDate) -> Issues {
    let mut i = Issues::new();
    let tgl_lap = date(d, "tgl_laporan").unwrap_or(today);
    // s1
    i.req(d, "s1", "jenis_unit", "Jenis Unit Pelapor");
    i.req(d, "s1", "provinsi_id", "Provinsi");
    i.req(d, "s1", "kabkota_id", "Kab/Kota");
    i.req(d, "s1", "kecamatan", "Kecamatan");
    i.req(d, "s1", "unit_pelapor", "Unit Pelapor");
    i.req(d, "s1", "nama_pelapor", "Nama dan Institusi Pelapor");
    if let Some(hp) = s(d, "hp_pelapor") {
        if !valid_hp(&hp) {
            i.e("s1", "hp_pelapor", "Format No. HP tidak valid (contoh: 0812xxxxxxx atau +62812xxxxxxx)");
        }
    }
    // s2
    i.req(d, "s2", "penyakit_rumor", "Penyakit Rumor");
    if i.req(d, "s2", "tgl_rumor", "Tanggal Rumor Diketahui") {
        i.not_future(d, "s2", "tgl_rumor", "Tanggal Rumor Diketahui", tgl_lap);
    }
    if s(d, "status_kejadian").map(|x| x.starts_with("Terverifikasi")).unwrap_or(false) {
        i.req(d, "s2", "penyakit_terverifikasi", "Penyakit Terverifikasi (status Terverifikasi)");
    }
    if s(d, "sumber_informasi").as_deref() == Some("lainnya") {
        i.req(d, "s2", "sumber_informasi_lain", "Sumber informasi lainnya");
    }
    // s3
    let kasus = n(d, "jml_kasus");
    match kasus {
        None => i.e("s3", "jml_kasus", "Jumlah Kasus tidak boleh 0 atau kosong"),
        Some(x) if x < 1.0 || x.fract() != 0.0 => i.e("s3", "jml_kasus", "Jumlah Kasus tidak boleh 0 atau kosong"),
        _ => {}
    }
    i.nonneg(d, "s3", "jml_kematian", "Jumlah Kematian");
    let mati = n(d, "jml_kematian").unwrap_or(0.0);
    if let Some(k) = kasus {
        if mati > k {
            i.e("s3", "jml_kematian", "Jumlah Kematian tidak boleh melebihi Jumlah Kasus");
        }
    }
    if mati > 0.0 {
        i.req(d, "s3", "tgl_meninggal", "Tanggal Meninggal");
    }
    let mut total_usia = 0.0;
    if let Some(Value::Object(u)) = d.get("usia") {
        for sex in ["pria", "wanita"] {
            if let Some(Value::Object(row)) = u.get(sex) {
                for b in USIA_BANDS {
                    if let Some(v) = row.get(b) {
                        match num(Some(v)) {
                            Some(x) if x >= 0.0 && x.fract() == 0.0 => total_usia += x,
                            None if v.is_null() || v.as_str().map(|t| t.trim().is_empty()).unwrap_or(false) => {}
                            _ => i.e("s3", "usia", "Isian usia & jenis kelamin harus bilangan bulat ≥ 0"),
                        }
                    }
                }
            }
        }
    }
    if let Some(k) = kasus {
        if total_usia > 0.0 && (total_usia - k).abs() > f64::EPSILON {
            i.w("s3", "usia", &format!("Total usia & jenis kelamin ({}) tidak sama dengan Jumlah Kasus ({})", total_usia as i64, k as i64));
        }
    }
    if s(d, "dom_kabkota_id").is_some() && s(d, "dom_provinsi_id").is_none() {
        i.e("s3", "dom_provinsi_id", "Pilih Provinsi Domisili Kasus");
    }
    for (k, l) in [("tgl_onset", "Tanggal Mulai Bergejala"), ("tgl_meninggal", "Tanggal Meninggal"), ("tgl_faskes", "Tanggal Datang ke Faskes")] {
        i.not_future(d, "s3", k, l, tgl_lap);
    }
    if let (Some(on), Some(m)) = (date(d, "tgl_onset"), date(d, "tgl_meninggal")) {
        if m < on {
            i.e("s3", "tgl_meninggal", "Tanggal Meninggal tidak boleh sebelum Tanggal Mulai Bergejala");
        }
    }
    if let (Some(on), Some(f)) = (date(d, "tgl_onset"), date(d, "tgl_faskes")) {
        if f < on {
            i.w("s3", "tgl_faskes", "Tanggal Datang ke Faskes lebih awal dari Tanggal Mulai Bergejala");
        }
    }
    // s4
    if i.req(d, "s4", "spesimen", "Pengambilan Spesimen") && ya(d, "spesimen") {
        i.req(d, "s4", "lab_tgl_ambil", "Tanggal Pengambilan Spesimen");
        i.nonneg(d, "s4", "lab_jml_diperiksa", "Jumlah Orang Diperiksa");
        i.nonneg(d, "s4", "lab_jml_positif", "Jumlah Orang Hasil Lab Positif");
        if let (Some(p), Some(t)) = (n(d, "lab_jml_positif"), n(d, "lab_jml_diperiksa")) {
            if p > t {
                i.e("s4", "lab_jml_positif", "Jumlah positif tidak boleh melebihi Jumlah Orang Diperiksa");
            }
        }
        if let (Some(a), Some(k)) = (date(d, "lab_tgl_ambil"), date(d, "lab_tgl_kirim")) {
            if k < a {
                i.e("s4", "lab_tgl_kirim", "Tanggal Pengiriman tidak boleh sebelum Tanggal Pengambilan");
            }
        }
        let after = date(d, "lab_tgl_kirim").or(date(d, "lab_tgl_ambil"));
        if let (Some(a), Some(h)) = (after, date(d, "lab_tgl_hasil")) {
            if h < a {
                i.e("s4", "lab_tgl_hasil", "Tanggal Hasil Lab tidak boleh sebelum Tanggal Pengiriman/Pengambilan");
            }
        }
        for (k, l) in [("lab_tgl_ambil", "Tanggal Pengambilan Spesimen"), ("lab_tgl_kirim", "Tanggal Pengiriman Spesimen"), ("lab_tgl_hasil", "Tanggal Hasil Lab")] {
            i.not_future(d, "s4", k, l, tgl_lap);
        }
    }
    if i.req(d, "s4", "tatalaksana", "Dilakukan Tata Laksana Kasus?") && ya(d, "tatalaksana") {
        i.req(d, "s4", "tatalaksana_tgl", "Tanggal Tata Laksana Kasus");
        i.req(d, "s4", "tatalaksana_jenis", "Jenis Tata Laksana Kasus");
        if let (Some(on), Some(t)) = (date(d, "tgl_onset"), date(d, "tatalaksana_tgl")) {
            if t < on {
                i.w("s4", "tatalaksana_tgl", "Tanggal Tata Laksana lebih awal dari Tanggal Mulai Bergejala");
            }
        }
    }
    // s5
    if i.req(d, "s5", "klb", "Memenuhi kriteria KLB?") && ya(d, "klb") {
        if i.req(d, "s5", "w1", "Formulir W1") && ya(d, "w1") {
            i.req(d, "s5", "w1_tgl", "Tanggal Formulir W1");
        }
        if i.req(d, "s5", "sk_klb", "SK KLB") && ya(d, "sk_klb") {
            i.req(d, "s5", "klb_tgl_mulai", "Tanggal KLB Dimulai");
        }
        if i.req(d, "s5", "tgc", "Mobilisasi TGC") && ya(d, "tgc") {
            i.req(d, "s5", "tgc_tgl", "Tanggal Mobilisasi TGC");
        }
        if i.req(d, "s5", "klb_status", "Status KLB Saat Ini") && s(d, "klb_status").as_deref() == Some("Berakhir") {
            i.req(d, "s5", "klb_tgl_berakhir", "Tanggal KLB Berakhir");
        }
        if let (Some(m), Some(b)) = (date(d, "klb_tgl_mulai"), date(d, "klb_tgl_berakhir")) {
            if b < m {
                i.e("s5", "klb_tgl_berakhir", "Tanggal KLB Berakhir tidak boleh sebelum Tanggal KLB Dimulai");
            }
        }
        if let (Some(r), Some(p)) = (date(d, "tgl_rumor"), date(d, "tgl_pe")) {
            if p < r {
                i.w("s5", "tgl_pe", "Tanggal PE lebih awal dari Tanggal Rumor Diketahui");
            }
        }
    }
    for (q, t, l) in [("pfr", "pfr_tgl", "Pengendalian Faktor Risiko"), ("komrisk", "komrisk_tgl", "Komunikasi Risiko"), ("koordinasi", "koordinasi_tgl", "Koordinasi Lintas Sektor/LP")] {
        if i.req(d, "s5", q, &format!("{l}?")) && ya(d, q) {
            i.req(d, "s5", t, &format!("Tanggal {l}"));
        }
    }
    i
}

/// IBS (4 langkah: s1 Unit & Wilayah, s2 Periode Laporan, s3 Data Kasus, s4 Tinjau & Kirim).
fn validate_ibs(d: &Obj, today: NaiveDate, rows: &[String]) -> Issues {
    let mut i = Issues::new();
    i.req(d, "s1", "jenis_unit", "Jenis Unit");
    i.req(d, "s1", "provinsi_id", "Provinsi");
    i.req(d, "s1", "kabkota_id", "Kab/Kota");
    i.req(d, "s1", "unit_pelapor", "Puskesmas/Unit");
    i.req(d, "s1", "petugas", "Petugas");
    periode(&mut i, d, "s2", today);
    let mut tk = 0.0;
    let empty = Map::new();
    let data = d.get("rows").and_then(|v| v.as_object()).unwrap_or(&empty);
    for kode in rows {
        let r = data.get(kode).and_then(|v| v.as_object());
        let get = |k: &str| r.and_then(|r| r.get(k));
        for (k, l) in [("kasus", "Jumlah Kasus"), ("kematian", "Jumlah Kematian"), ("lab", "Jumlah Lab")] {
            if let Some(v) = get(k) {
                if !v.is_null() && !v.as_str().map(|t| t.trim().is_empty()).unwrap_or(false) {
                    match num(Some(v)) {
                        Some(x) if x >= 0.0 && x.fract() == 0.0 => {}
                        _ => i.e("s3", &format!("rows.{kode}.{k}"), &format!("{l} ({kode}) harus bilangan bulat ≥ 0")),
                    }
                }
            }
        }
        let ks = num(get("kasus")).unwrap_or(0.0);
        let km = num(get("kematian")).unwrap_or(0.0);
        let lb = num(get("lab")).unwrap_or(0.0);
        if km > ks {
            i.e("s3", &format!("rows.{kode}.kematian"), &format!("Kematian melebihi Kasus ({kode})"));
        }
        if lb > ks {
            i.w("s3", &format!("rows.{kode}.lab"), &format!("Jumlah Lab melebihi Jumlah Kasus ({kode})"));
        }
        tk += ks.max(0.0);
    }
    if i.req(d, "s3", "total_kunjungan", "Total Kunjungan") {
        i.nonneg(d, "s3", "total_kunjungan", "Total Kunjungan");
        if let Some(t) = n(d, "total_kunjungan") {
            if t < tk {
                i.w("s3", "total_kunjungan", "Total Kunjungan lebih kecil dari total kasus semua penyakit");
            }
        }
    }
    if tk == 0.0 && !truthy(d, "konfirmasi_nihil") {
        i.e("s3", "konfirmasi_nihil", "Semua kasus bernilai 0: centang konfirmasi nihil kasus");
    }
    i
}

/// Shared by IBS agregat & Individu: Tahun + Minggu Epid (valid for the year, already started).
fn periode(i: &mut Issues, d: &Obj, step: &str, today: NaiveDate) {
    let th = int(d, "tahun");
    let mg = int(d, "minggu");
    i.req(d, step, "tahun", "Tahun");
    if i.req(d, step, "minggu", "Minggu Epid") {
        if let (Some(t), Some(m)) = (th, mg) {
            if m < 1 || m > weeks_in_year(t) {
                i.e(step, "minggu", "Minggu Epid tidak valid untuk tahun ini");
            } else if mmwr_week_one(t) + Duration::days(((m - 1) * 7) as i64) > today {
                i.e(step, "minggu", "Minggu Epid belum dimulai");
            }
        }
    }
}

fn max_len(i: &mut Issues, d: &Obj, step: &str, key: &str, label: &str, max: usize) {
    if let Some(Value::String(v)) = d.get(key) {
        if v.chars().count() > max {
            i.e(step, key, &format!("{label} maksimal {max} karakter"));
        }
    }
}

/// Age parts (tahun 0–150, bulan 0–11, hari 0–30). Empty = not filled (official form defaulted to 0).
pub const UMUR_PARTS: [(&str, &str, f64); 3] = [("umur_tahun", "Umur (tahun)", 150.0), ("umur_bulan", "Umur (bulan)", 11.0), ("umur_hari", "Umur (hari)", 30.0)];

pub fn umur_text(d: &Obj) -> Option<String> {
    let parts: Vec<String> = UMUR_PARTS
        .iter()
        .zip(["th", "bl", "hr"])
        .filter_map(|((k, _, _), u)| n(d, k).filter(|x| *x > 0.0).map(|x| format!("{} {u}", x as i64)))
        .collect();
    if !parts.is_empty() {
        return Some(parts.join(" "));
    }
    // all filled parts are 0 → "0 hr" style is meaningless; keep None
    None
}

/// Measurement fields on step s4: (key, label, warn_min, warn_max).
pub const PERIKSA: [(&str, &str, f64, f64); 6] = [
    ("tinggi", "Tinggi badan (cm)", 30.0, 250.0),
    ("berat", "Berat badan (kg)", 0.5, 300.0),
    ("imt", "IMT", 5.0, 80.0),
    ("sistole", "Sistole (mmHg)", 50.0, 250.0),
    ("diastole", "Diastole (mmHg)", 30.0, 150.0),
    ("suhu", "Suhu (°C)", 30.0, 45.0),
];

/// Individu (5 langkah: s1 Unit & Periode, s2 Info Pasien, s3 Penyakit, s4 Pemeriksaan, s5 Tinjau & Kirim).
fn validate_individu(d: &Obj, today: NaiveDate, rows: &[String]) -> Issues {
    let mut i = Issues::new();
    // s1
    i.req(d, "s1", "jenis_unit", "Jenis Unit");
    i.req(d, "s1", "provinsi_id", "Provinsi");
    i.req(d, "s1", "kabkota_id", "Kab/Kota");
    i.req(d, "s1", "unit_pelapor", "Puskesmas/Unit");
    i.req(d, "s1", "petugas", "Nama Petugas");
    if let Some(hp) = s(d, "hp_petugas") {
        if !valid_hp(&hp) {
            i.e("s1", "hp_petugas", "Format No. Telp tidak valid (contoh: 0812xxxxxxx atau +62812xxxxxxx)");
        }
    }
    periode(&mut i, d, "s1", today);
    // s2
    i.req(d, "s2", "nama_pasien", "Nama Pasien");
    i.req(d, "s2", "kelamin", "Jenis Kelamin");
    let mut any = false;
    let mut nonzero = false;
    for (k, l, max) in UMUR_PARTS {
        if let Some(v) = d.get(k) {
            if v.is_null() || v.as_str().map(|t| t.trim().is_empty()).unwrap_or(false) {
                continue;
            }
            match num(Some(v)) {
                Some(x) if x >= 0.0 && x.fract() == 0.0 && x <= max => {
                    any = true;
                    nonzero |= x > 0.0;
                }
                _ => i.e("s2", k, &format!("{l} harus bilangan bulat 0–{}", max as i64)),
            }
        }
    }
    if !any {
        i.e("s2", "umur_tahun", "Umur wajib diisi (tahun, bulan, atau hari)");
    } else if !nonzero {
        i.e("s2", "umur_tahun", "Umur tidak boleh 0 semua — isi bulan/hari untuk bayi");
    }
    max_len(&mut i, d, "s2", "alamat", "Alamat", 500);
    // s3
    if i.req(d, "s3", "penyakit", "Penyakit Agregat") {
        if !rows.is_empty() && !rows.iter().any(|r| Some(r.as_str()) == s(d, "penyakit").as_deref()) {
            i.e("s3", "penyakit", "Penyakit Agregat tidak ada di daftar penyakit IBS");
        }
    }
    if i.req(d, "s3", "tgl_periksa", "Tanggal Pemeriksaan") {
        if let Some(t) = date(d, "tgl_periksa") {
            if t > today {
                i.e("s3", "tgl_periksa", "Tanggal Pemeriksaan tidak boleh di masa depan");
            } else if let (Some(th), Some(m)) = (int(d, "tahun"), int(d, "minggu")) {
                if m >= 1 && m <= weeks_in_year(th) {
                    let a = mmwr_week_one(th) + Duration::days(((m - 1) * 7) as i64);
                    if t < a || t > a + Duration::days(6) {
                        i.w("s3", "tgl_periksa", "Tanggal Pemeriksaan di luar Minggu Epid yang dipilih");
                    }
                }
            }
        }
    }
    if s(d, "status_akhir").as_deref() == Some("Meninggal") && i.req(d, "s3", "tgl_meninggal", "Tanggal Meninggal") {
        if let Some(m) = date(d, "tgl_meninggal") {
            if m > today {
                i.e("s3", "tgl_meninggal", "Tanggal Meninggal tidak boleh di masa depan");
            }
            if let Some(p) = date(d, "tgl_periksa") {
                if m < p {
                    i.w("s3", "tgl_meninggal", "Tanggal Meninggal lebih awal dari Tanggal Pemeriksaan");
                }
            }
        }
    }
    for (k, l, m) in [("keluhan", "Keluhan Utama", 500), ("lama_sakit", "Lama Sakit", 100), ("icdx", "ICD-X", 20), ("diagnosa", "Diagnosa", 500)] {
        max_len(&mut i, d, "s3", k, l, m);
    }
    // s4
    for (k, l, lo, hi) in PERIKSA {
        if let Some(v) = d.get(k) {
            if v.is_null() || v.as_str().map(|t| t.trim().is_empty()).unwrap_or(false) {
                continue;
            }
            match dec(d, k) {
                Some(x) if x > 0.0 => {
                    if x < lo || x > hi {
                        i.w("s4", k, &format!("{l} {x} di luar rentang wajar ({lo}–{hi}) — periksa kembali"));
                    }
                }
                _ => i.e("s4", k, &format!("{l} harus angka lebih dari 0")),
            }
        }
    }
    if let (Some(sy), Some(di)) = (dec(d, "sistole"), dec(d, "diastole")) {
        if di >= sy {
            i.w("s4", "diastole", "Diastole sama atau lebih tinggi dari Sistole — periksa kembali");
        }
    }
    for (k, l) in [("soap_s", "SOAP Subjective"), ("soap_o", "SOAP Objective"), ("soap_a", "SOAP Assessment"), ("soap_p", "SOAP Planning")] {
        max_len(&mut i, d, "s4", k, l, 500);
    }
    i
}

fn ibs_totals(d: &Obj, rows: &[String]) -> (i32, i32) {
    let empty = Map::new();
    let data = d.get("rows").and_then(|v| v.as_object()).unwrap_or(&empty);
    let (mut k, mut m) = (0.0, 0.0);
    for kode in rows {
        if let Some(r) = data.get(kode).and_then(|v| v.as_object()) {
            k += num(r.get("kasus")).unwrap_or(0.0).max(0.0);
            m += num(r.get("kematian")).unwrap_or(0.0).max(0.0);
        }
    }
    (k as i32, m as i32)
}

async fn ibs_rows(c: &deadpool_postgres::Object) -> Result<Vec<String>, ApiError> {
    let rows = c.query("SELECT kode FROM ibs_penyakit WHERE is_active AND NOT is_total ORDER BY urutan", &[]).await.map_err(internal)?;
    Ok(rows.iter().map(|r| r.get(0)).collect())
}

/// DB checks: kab/kota belongs to the province (reporter + domicile).
async fn db_checks(c: &deadpool_postgres::Object, d: &Obj, iss: &mut Issues) -> Result<(), ApiError> {
    for (pk, kk, step, label) in [("provinsi_id", "kabkota_id", "s1", "Kab/Kota"), ("dom_provinsi_id", "dom_kabkota_id", "s3", "Kab/Kota Domisili Kasus")] {
        if let Some(k) = int(d, kk) {
            let p = int(d, pk);
            let ok = c.query_opt("SELECT 1 FROM master_kabkota WHERE id = $1 AND ($2::int IS NULL OR province_id = $2)", &[&k, &p]).await.map_err(internal)?.is_some();
            if !ok {
                iss.e(step, kk, &format!("{label} tidak sesuai dengan provinsi yang dipilih"));
            }
        }
    }
    Ok(())
}

async fn evaluate(c: &deadpool_postgres::Object, j: Jenis, d: &Obj) -> Result<Issues, ApiError> {
    let t = today(OFFSET_HOURS);
    let mut iss = match j {
        Jenis::Ebs => validate_ebs(d, t),
        Jenis::Ibs => validate_ibs(d, t, &ibs_rows(c).await?),
        Jenis::Individu => validate_individu(d, t, &ibs_rows(c).await?),
    };
    db_checks(c, d, &mut iss).await?;
    Ok(iss)
}

async fn next_no(c: &deadpool_postgres::Object, j: Jenis) -> Result<String, ApiError> {
    let year = today(OFFSET_HOURS).year();
    let r = c
        .query_one(
            "INSERT INTO laporan_counters (jenis, year, last_no) VALUES ($1, $2, 1)
             ON CONFLICT (jenis, year) DO UPDATE SET last_no = laporan_counters.last_no + 1 RETURNING last_no",
            &[&j.key(), &year],
        )
        .await
        .map_err(internal)?;
    Ok(format!("{}-{year}-{:06}", j.prefix(), r.get::<_, i32>(0)))
}

/// Unit key for the IBS duplicate rule: master code when picked from master_fasyankes, else name + kab/kota.
fn unit_key(d: &Obj) -> Option<String> {
    if let Some(k) = s(d, "unit_kode") {
        return Some(k);
    }
    s(d, "unit_pelapor").map(|u| format!("{}|{}", u.to_lowercase(), s(d, "kabkota_id").unwrap_or_default()))
}

async fn persist(c: &deadpool_postgres::Object, j: Jenis, id: i64, d: &Obj, iss: &Issues) -> Result<(), ApiError> {
    let errors = Value::Array(iss.errors.clone());
    let warnings = Value::Array(iss.warnings.clone());
    let data = Value::Object(d.clone());
    match j {
        Jenis::Ebs => {
            c.execute(
                "UPDATE laporan_ebs SET data = $2, errors = $3, warnings = $4, tgl_laporan = COALESCE($5, tgl_laporan), tgl_rumor = $6, penyakit_rumor = $7,
                    province_id = $8, kabkota_id = $9, dom_kabkota_id = $10, unit_nama = $11, jml_kasus = $12, jml_kematian = $13, updated_at = now()
                 WHERE id = $1",
                &[&id, &data, &errors, &warnings, &date(d, "tgl_laporan"), &date(d, "tgl_rumor"), &s(d, "penyakit_rumor"),
                  &int(d, "provinsi_id"), &int(d, "kabkota_id"), &int(d, "dom_kabkota_id"), &s(d, "unit_pelapor"), &int(d, "jml_kasus"), &int(d, "jml_kematian")],
            )
            .await
            .map_err(internal)?;
        }
        Jenis::Ibs => {
            let (tk, tm) = ibs_totals(d, &ibs_rows(c).await?);
            c.execute(
                "UPDATE laporan_ibs SET data = $2, errors = $3, warnings = $4, tahun = $5, minggu = $6, unit_key = $7, unit_nama = $8,
                    province_id = $9, kabkota_id = $10, total_kasus = $11, total_kematian = $12, total_kunjungan = $13, updated_at = now()
                 WHERE id = $1",
                &[&id, &data, &errors, &warnings, &int(d, "tahun"), &int(d, "minggu").filter(|m| (1..=53).contains(m)), &unit_key(d), &s(d, "unit_pelapor"),
                  &int(d, "provinsi_id"), &int(d, "kabkota_id"), &tk, &tm, &int(d, "total_kunjungan")],
            )
            .await
            .map_err(internal)?;
        }
        Jenis::Individu => {
            c.execute(
                "UPDATE laporan_ibs_individu SET data = $2, errors = $3, warnings = $4, tahun = $5, minggu = $6, unit_key = $7, unit_nama = $8,
                    province_id = $9, kabkota_id = $10, nama_pasien = $11, kelamin = $12, umur = $13, penyakit = $14, tgl_periksa = $15,
                    keluhan = $16, diagnosa = $17, status_akhir = $18, updated_at = now()
                 WHERE id = $1",
                &[&id, &data, &errors, &warnings, &int(d, "tahun"), &int(d, "minggu").filter(|m| (1..=53).contains(m)), &unit_key(d), &s(d, "unit_pelapor"),
                  &int(d, "provinsi_id"), &int(d, "kabkota_id"), &s(d, "nama_pasien"), &s(d, "kelamin"), &umur_text(d), &s(d, "penyakit"),
                  &date(d, "tgl_periksa"), &s(d, "keluhan"), &s(d, "diagnosa"), &s(d, "status_akhir")],
            )
            .await
            .map_err(internal)?;
        }
    }
    Ok(())
}

async fn event(c: &deadpool_postgres::Object, j: Jenis, id: i64, ev: &str, note: Option<String>, actor: &str) -> Result<(), ApiError> {
    c.execute("INSERT INTO laporan_events (jenis, laporan_id, event, note, actor) VALUES ($1, $2, $3, $4, $5)", &[&j.key(), &id, &ev, &note, &actor])
        .await
        .map_err(internal)?;
    Ok(())
}

fn actor_name(u: &AuthUser) -> String {
    u.full_name.clone().filter(|x| !x.trim().is_empty()).unwrap_or_else(|| u.username.clone())
}

async fn record_json(c: &deadpool_postgres::Object, j: Jenis, id: i64) -> Result<Value, ApiError> {
    let r = c
        .query_opt(
            &format!(
                "SELECT id, no_laporan, status, data, errors, warnings, created_by_name,
                        to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'),
                        to_char(updated_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'),
                        to_char(submitted_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI')
                 FROM {} WHERE id = $1 AND deleted_at IS NULL",
                j.table()
            ),
            &[&id],
        )
        .await
        .map_err(internal)?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Laporan tidak ditemukan"))?;
    let events = c
        .query(
            "SELECT event, note, actor, to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI') FROM laporan_events
             WHERE jenis = $1 AND laporan_id = $2 ORDER BY id DESC LIMIT 50",
            &[&j.key(), &id],
        )
        .await
        .map_err(internal)?;
    let lampiran: Vec<Value> = if j == Jenis::Ebs {
        c.query("SELECT id, judul, nama_file, tipe, ukuran, to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI') FROM laporan_lampiran WHERE laporan_id = $1 ORDER BY id", &[&id])
            .await
            .map_err(internal)?
            .iter()
            .map(|l| json!({ "id": l.get::<_, i64>(0), "judul": l.get::<_, Option<String>>(1), "nama_file": l.get::<_, String>(2), "tipe": l.get::<_, String>(3),
                              "ukuran": l.get::<_, i32>(4), "created_at": l.get::<_, Option<String>>(5) }))
            .collect()
    } else {
        vec![]
    };
    Ok(json!({
        "id": r.get::<_, i64>(0), "no_laporan": r.get::<_, String>(1), "status": r.get::<_, String>(2), "data": r.get::<_, Value>(3),
        "errors": r.get::<_, Value>(4), "warnings": r.get::<_, Value>(5), "created_by_name": r.get::<_, Option<String>>(6),
        "created_at": r.get::<_, Option<String>>(7), "updated_at": r.get::<_, Option<String>>(8), "submitted_at": r.get::<_, Option<String>>(9),
        "events": events.iter().map(|e| json!({ "event": e.get::<_, String>(0), "note": e.get::<_, Option<String>>(1), "actor": e.get::<_, Option<String>>(2), "at": e.get::<_, Option<String>>(3) })).collect::<Vec<_>>(),
        "lampiran": lampiran,
    }))
}

// ─── reference data ───────────────────────────────────────────────────────────

pub async fn opsi(State(st): State<AppState>) -> Result<Json<Value>, ApiError> {
    let c = st.pool.get().await.map_err(internal)?;
    let rows = c.query("SELECT kelompok, nilai, COALESCE(label, nilai) FROM laporan_opsi WHERE is_active ORDER BY kelompok, urutan, nilai", &[]).await.map_err(internal)?;
    let mut opsi = Map::new();
    for r in &rows {
        let k: String = r.get(0);
        let e = opsi.entry(k).or_insert_with(|| Value::Array(vec![]));
        e.as_array_mut().unwrap().push(json!({ "value": r.get::<_, String>(1), "label": r.get::<_, String>(2) }));
    }
    let pen = c
        .query(
            "SELECT a.diagnosa, a.disease_id, d.name, d.symptoms, d.transmission FROM ebs_diagnosa_alias a
             LEFT JOIN master_diseases d ON d.id = a.disease_id ORDER BY a.diagnosa",
            &[],
        )
        .await
        .map_err(internal)?;
    let ibs = c.query("SELECT kode, urutan, kode_sms, nama, nama_asli, is_total FROM ibs_penyakit WHERE is_active ORDER BY urutan", &[]).await.map_err(internal)?;
    let t = today(OFFSET_HOURS);
    Ok(Json(json!({ "success": true, "data": {
        "opsi": opsi,
        "penyakit": pen.iter().map(|r| json!({ "value": r.get::<_, String>(0), "label": r.get::<_, String>(0), "disease_id": r.get::<_, Option<i32>>(1),
            "disease_name": r.get::<_, Option<String>>(2), "symptoms": r.get::<_, Option<String>>(3), "transmission": r.get::<_, Option<String>>(4) })).collect::<Vec<_>>(),
        "ibs_penyakit": ibs.iter().map(|r| json!({ "kode": r.get::<_, String>(0), "urutan": r.get::<_, i32>(1), "kode_sms": r.get::<_, String>(2),
            "nama": r.get::<_, String>(3), "nama_asli": r.get::<_, String>(4), "is_total": r.get::<_, bool>(5) })).collect::<Vec<_>>(),
        "today": t.format("%Y-%m-%d").to_string(),
        "lampiran": { "max_bytes": MAX_LAMPIRAN, "tipe": LAMPIRAN_TIPE },
    } })))
}

#[derive(Deserialize)]
pub struct KecQuery {
    kabkota_id: Option<i32>,
}

pub async fn kecamatan(State(st): State<AppState>, Query(q): Query<KecQuery>) -> Result<Json<Value>, ApiError> {
    let kab = q.kabkota_id.ok_or_else(|| bad_request("kabkota_id wajib diisi"))?;
    let c = st.pool.get().await.map_err(internal)?;
    let rows = c
        .query(
            "WITH f AS (SELECT trim(kode_kecamatan) code, MIN(trim(nama_kecamatan)) nm FROM master_fasyankes
                        WHERE kabkota_id = $1 AND NULLIF(trim(kode_kecamatan), '') IS NOT NULL AND NULLIF(trim(nama_kecamatan), '') IS NOT NULL GROUP BY 1),
                  e AS (SELECT trim(kode_depdagri_distrik) code, MIN(initcap(regexp_replace(trim(distrik), '^kec\\.?\\s*', '', 'i'))) nm FROM ebs_reports
                        WHERE kabkota_id = $1 AND NULLIF(trim(kode_depdagri_distrik), '') IS NOT NULL AND NULLIF(trim(distrik), '') IS NOT NULL GROUP BY 1)
             SELECT code, nm, 'master' FROM f
             UNION ALL SELECT code, nm, 'ebs' FROM e WHERE code NOT IN (SELECT code FROM f)
             ORDER BY 2",
            &[&kab],
        )
        .await
        .map_err(internal)?;
    Ok(Json(json!({ "success": true, "data": rows.iter().map(|r| json!({ "value": r.get::<_, String>(0), "label": r.get::<_, String>(1), "source": r.get::<_, &str>(2) })).collect::<Vec<_>>() })))
}

#[derive(Deserialize)]
pub struct UnitQuery {
    kabkota_id: Option<i32>,
    province_id: Option<i32>,
    kecamatan: Option<String>,
    jenis: Option<String>,
}

pub async fn unit(State(st): State<AppState>, Query(q): Query<UnitQuery>) -> Result<Json<Value>, ApiError> {
    let c = st.pool.get().await.map_err(internal)?;
    let jenis = q.jenis.clone().unwrap_or_default();
    let kec = q.kecamatan.clone().map(|x| x.trim().to_string()).filter(|x| !x.is_empty());
    let master = match jenis.as_str() {
        "Puskesmas" => Some(("Puskesmas", true)),
        "Rumah Sakit" => Some(("RS", false)),
        _ => None,
    };
    let mut out: Vec<Value> = vec![];
    if let (Some((jn, by_kec)), Some(kab)) = (master, q.kabkota_id) {
        let kf: Option<String> = if by_kec { kec.clone() } else { None };
        let rows = c
            .query(
                "SELECT kode_satusehat, nama, nama_kecamatan, alamat FROM master_fasyankes
                 WHERE kabkota_id = $1 AND jenis_nama = $2 AND COALESCE(status_aktif, TRUE) AND ($3::text IS NULL OR trim(kode_kecamatan) = $3)
                 ORDER BY nama LIMIT 2000",
                &[&kab, &jn, &kf],
            )
            .await
            .map_err(internal)?;
        out = rows
            .iter()
            .map(|r| {
                let kecn: Option<String> = r.get(2);
                let al: Option<String> = r.get(3);
                let hint = [kecn.map(|k| format!("Kec. {k}")), al.filter(|a| !a.trim().is_empty())].into_iter().flatten().collect::<Vec<_>>().join(" · ");
                json!({ "value": r.get::<_, String>(0), "label": r.get::<_, String>(1), "hint": hint, "source": "master" })
            })
            .collect();
    }
    if out.is_empty() && !jenis.is_empty() {
        // other unit types (BKK, Dinkes, Klinik, Lab, PHEOC) or no master match: unit names seen in synced EBS reports
        let rows = c
            .query(
                "SELECT MIN(trim(unit)) nm, COUNT(*) FROM ebs_reports
                 WHERE trim(kel_unit) = $1 AND NULLIF(trim(unit), '') IS NOT NULL
                   AND (($2::int IS NOT NULL AND kabkota_id = $2) OR ($2::int IS NULL AND $3::int IS NOT NULL AND province_id = $3))
                 GROUP BY lower(trim(unit)) ORDER BY 1 LIMIT 1000",
                &[&jenis, &q.kabkota_id, &q.province_id],
            )
            .await
            .map_err(internal)?;
        out = rows
            .iter()
            .map(|r| json!({ "value": "", "label": r.get::<_, String>(0), "hint": format!("Dari data EBS tersinkron · {} laporan", r.get::<_, i64>(1)), "source": "ebs" }))
            .collect();
    }
    Ok(Json(json!({ "success": true, "data": out })))
}

#[derive(Deserialize)]
pub struct PrefillQuery {
    jenis: Option<String>,
}

/// Auto-fill: reporter name from the logged-in account + region/unit from the user's latest report of this type.
pub async fn prefill(State(st): State<AppState>, u: Me, Query(q): Query<PrefillQuery>) -> Result<Json<Value>, ApiError> {
    let u = me(&u)?;
    let j = Jenis::parse(q.jenis.as_deref().unwrap_or("ebs"))?;
    let c = st.pool.get().await.map_err(internal)?;
    let last = c
        .query_opt(&format!("SELECT data, no_laporan FROM {} WHERE created_by = $1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1", j.table()), &[&u.id])
        .await
        .map_err(internal)?;
    let mut keep = Map::new();
    let mut from: Option<String> = None;
    if let Some(r) = last {
        let d: Value = r.get(0);
        from = Some(r.get(1));
        for k in ["jenis_unit", "kelompok", "provinsi_id", "kabkota_id", "kecamatan", "kecamatan_nama", "unit_pelapor", "unit_kode", "nama_pelapor", "hp_pelapor", "petugas", "hp_petugas"] {
            if let Some(v) = d.get(k).filter(|v| !v.is_null()) {
                keep.insert(k.into(), v.clone());
            }
        }
    }
    Ok(Json(json!({ "success": true, "data": { "nama": actor_name(&u), "username": u.username, "last": keep, "last_no": from } })))
}

#[derive(Deserialize)]
pub struct DupQuery {
    penyakit: Option<String>,
    kabkota_id: Option<i32>,
    tgl: Option<String>,
    unit_key: Option<String>,
    tahun: Option<i32>,
    minggu: Option<i32>,
    nama: Option<String>,
    exclude: Option<i64>,
}

/// EBS: same Penyakit Rumor + kab/kota (domisili, else pelapor) within ±7 days (local drafts/reports + synced EBS Kemkes).
/// IBS: all reports of the unit in the year (frontend marks reported weeks; same week = duplicate).
/// Individu: `sama` = same unit + nama pasien + tanggal periksa (soft warning); `periode` = number of individu records for
/// unit + tahun + minggu (info line on the IBS agregat Data Kasus step — no auto-fill, sync rules unknown).
pub async fn duplikat(State(st): State<AppState>, Path(jenis): Path<String>, Query(q): Query<DupQuery>) -> Result<Json<Value>, ApiError> {
    let j = Jenis::parse(&jenis)?;
    let c = st.pool.get().await.map_err(internal)?;
    let ex = q.exclude.unwrap_or(0);
    match j {
        Jenis::Ebs => {
            let (Some(p), Some(k), Some(t)) = (q.penyakit.clone().filter(|x| !x.trim().is_empty()), q.kabkota_id,
                q.tgl.as_deref().and_then(|x| NaiveDate::parse_from_str(x, "%Y-%m-%d").ok())) else {
                return Ok(Json(json!({ "success": true, "data": { "lokal": [], "ebs": [] } })));
            };
            let (a, b) = (t - Duration::days(7), t + Duration::days(7));
            let lok = c
                .query(
                    "SELECT id, no_laporan, status, tgl_rumor::text, unit_nama, jml_kasus FROM laporan_ebs
                     WHERE deleted_at IS NULL AND id <> $1 AND lower(penyakit_rumor) = lower($2) AND COALESCE(dom_kabkota_id, kabkota_id) = $3
                       AND tgl_rumor BETWEEN $4 AND $5 ORDER BY tgl_rumor DESC LIMIT 10",
                    &[&ex, &p, &k, &a, &b],
                )
                .await
                .map_err(internal)?;
            let ebs = c
                .query(
                    "SELECT no_ebs, tgl_laporan::text, unit, jml_kasus, sts_rumor FROM ebs_reports
                     WHERE lower(trim(diagnosa)) = lower(trim($1)) AND kabkota_id = $2 AND tgl_laporan BETWEEN $3 AND $4
                     ORDER BY tgl_laporan DESC LIMIT 10",
                    &[&p, &k, &a, &b],
                )
                .await
                .map_err(internal)?;
            Ok(Json(json!({ "success": true, "data": {
                "lokal": lok.iter().map(|r| json!({ "id": r.get::<_, i64>(0), "no": r.get::<_, String>(1), "status": r.get::<_, String>(2), "tgl": r.get::<_, Option<String>>(3),
                    "unit": r.get::<_, Option<String>>(4), "kasus": r.get::<_, Option<i32>>(5) })).collect::<Vec<_>>(),
                "ebs": ebs.iter().map(|r| json!({ "no": r.get::<_, Option<String>>(0), "tgl": r.get::<_, Option<String>>(1), "unit": r.get::<_, Option<String>>(2),
                    "kasus": r.get::<_, i32>(3), "status": r.get::<_, Option<String>>(4) })).collect::<Vec<_>>(),
            } })))
        }
        Jenis::Ibs => {
            let (Some(uk), Some(th)) = (q.unit_key.clone().filter(|x| !x.trim().is_empty()), q.tahun) else {
                return Ok(Json(json!({ "success": true, "data": [] })));
            };
            let rows = c
                .query(
                    "SELECT id, no_laporan, status, minggu FROM laporan_ibs WHERE deleted_at IS NULL AND id <> $1 AND unit_key = $2 AND tahun = $3 AND minggu IS NOT NULL ORDER BY minggu",
                    &[&ex, &uk, &th],
                )
                .await
                .map_err(internal)?;
            Ok(Json(json!({ "success": true, "data": rows.iter().map(|r| json!({ "id": r.get::<_, i64>(0), "no": r.get::<_, String>(1), "status": r.get::<_, String>(2), "minggu": r.get::<_, i32>(3) })).collect::<Vec<_>>() })))
        }
        Jenis::Individu => {
            let uk = q.unit_key.clone().filter(|x| !x.trim().is_empty());
            let mut sama: Vec<Value> = vec![];
            let tgl = q.tgl.as_deref().and_then(|x| NaiveDate::parse_from_str(x, "%Y-%m-%d").ok());
            if let (Some(uk), Some(nm), Some(t)) = (uk.clone(), q.nama.clone().map(|x| x.trim().to_string()).filter(|x| !x.is_empty()), tgl) {
                let rows = c
                    .query(
                        "SELECT id, no_laporan, status, tgl_periksa::text FROM laporan_ibs_individu
                         WHERE deleted_at IS NULL AND id <> $1 AND unit_key = $2 AND lower(trim(nama_pasien)) = lower($3) AND tgl_periksa = $4 ORDER BY id DESC LIMIT 10",
                        &[&ex, &uk, &nm, &t],
                    )
                    .await
                    .map_err(internal)?;
                sama = rows.iter().map(|r| json!({ "id": r.get::<_, i64>(0), "no": r.get::<_, String>(1), "status": r.get::<_, String>(2), "tgl": r.get::<_, Option<String>>(3) })).collect();
            }
            let mut periode = 0i64;
            if let (Some(uk), Some(th), Some(mg)) = (uk, q.tahun, q.minggu) {
                periode = c
                    .query_one("SELECT count(*) FROM laporan_ibs_individu WHERE deleted_at IS NULL AND unit_key = $1 AND tahun = $2 AND minggu = $3", &[&uk, &th, &mg])
                    .await
                    .map_err(internal)?
                    .get(0);
            }
            Ok(Json(json!({ "success": true, "data": { "sama": sama, "periode": periode } })))
        }
    }
}

// ─── records ──────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ListQuery {
    status: Option<String>,
    search: Option<String>,
    page: Option<i64>,
    per_page: Option<i64>,
}

pub async fn list(State(st): State<AppState>, Path(jenis): Path<String>, Query(q): Query<ListQuery>) -> Result<Json<Value>, ApiError> {
    let j = Jenis::parse(&jenis)?;
    let c = st.pool.get().await.map_err(internal)?;
    let per_page = q.per_page.unwrap_or(20).clamp(1, 100);
    let page = q.page.unwrap_or(1).max(1);
    let off = (page - 1) * per_page;
    let status = q.status.clone().filter(|x| !x.is_empty() && x != "all");
    let search = q.search.as_ref().map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).map(|x| format!("%{x}%"));
    // per-jenis list columns as one JSON object (merged into each row)
    let (extra, srch) = match j {
        Jenis::Ebs => (
            "jsonb_build_object('tgl_laporan', l.tgl_laporan::text, 'tgl_rumor', l.tgl_rumor::text, 'penyakit', l.penyakit_rumor, 'kasus', l.jml_kasus,
               'kematian', l.jml_kematian, 'penyakit_terverifikasi', l.data->>'penyakit_terverifikasi', 'status_kejadian', l.data->>'status_kejadian',
               'klb', l.data->>'klb', 'klb_status', l.data->>'klb_status', 'jenis_unit', l.data->>'jenis_unit')",
            "(l.no_laporan ILIKE $2 OR l.penyakit_rumor ILIKE $2 OR l.data->>'penyakit_terverifikasi' ILIKE $2 OR l.unit_nama ILIKE $2 OR k.name ILIKE $2)",
        ),
        Jenis::Ibs => (
            "jsonb_build_object('kasus', l.total_kasus, 'kematian', l.total_kematian, 'tahun', l.tahun, 'minggu', l.minggu, 'kunjungan', l.total_kunjungan,
               'petugas', l.data->>'petugas')",
            "(l.no_laporan ILIKE $2 OR l.unit_nama ILIKE $2 OR k.name ILIKE $2 OR l.data->>'petugas' ILIKE $2)",
        ),
        Jenis::Individu => (
            "jsonb_build_object('tahun', l.tahun, 'minggu', l.minggu, 'nama_pasien', l.nama_pasien, 'kelamin', l.kelamin, 'umur', l.umur,
               'penyakit', l.penyakit, 'penyakit_label', (SELECT p.kode_sms || ' — ' || p.nama FROM ibs_penyakit p WHERE p.kode = l.penyakit),
               'tgl_periksa', l.tgl_periksa::text, 'status_akhir', l.status_akhir, 'diagnosa', l.diagnosa, 'petugas', l.data->>'petugas')",
            "(l.no_laporan ILIKE $2 OR l.unit_nama ILIKE $2 OR k.name ILIKE $2 OR l.nama_pasien ILIKE $2 OR l.diagnosa ILIKE $2 OR l.data->>'no_epid' ILIKE $2)",
        ),
    };
    let rows = c
        .query(
            &format!(
                "SELECT l.id, l.no_laporan, l.status, l.unit_nama, k.name, jsonb_array_length(l.errors), l.created_by_name,
                        to_char(l.updated_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'), count(*) OVER (), {extra}
                 FROM {} l LEFT JOIN master_kabkota k ON k.id = l.kabkota_id
                 WHERE l.deleted_at IS NULL AND ($1::text IS NULL OR l.status = $1) AND ($2::text IS NULL OR {srch})
                 ORDER BY l.updated_at DESC LIMIT $3 OFFSET $4",
                j.table()
            ),
            &[&status, &search, &per_page, &off],
        )
        .await
        .map_err(internal)?;
    let total = rows.first().map(|r| r.get::<_, i64>(8)).unwrap_or(0);
    let data: Vec<Value> = rows
        .iter()
        .map(|r| {
            let mut o = json!({
                "id": r.get::<_, i64>(0), "no_laporan": r.get::<_, String>(1), "status": r.get::<_, String>(2), "unit": r.get::<_, Option<String>>(3),
                "kabkota": r.get::<_, Option<String>>(4), "error_count": r.get::<_, i32>(5), "created_by_name": r.get::<_, Option<String>>(6),
                "updated_at": r.get::<_, Option<String>>(7),
            });
            if let (Some(m), Value::Object(x)) = (o.as_object_mut(), r.get::<_, Value>(9)) {
                m.extend(x);
            }
            o
        })
        .collect();
    let counts = c
        .query(&format!("SELECT status, count(*) FROM {} WHERE deleted_at IS NULL GROUP BY 1", j.table()), &[])
        .await
        .map_err(internal)?;
    let mut by = Map::new();
    for r in &counts {
        by.insert(r.get::<_, String>(0), json!(r.get::<_, i64>(1)));
    }
    Ok(Json(json!({ "success": true, "data": data, "total": total, "page": page, "per_page": per_page,
        "total_pages": ((total + per_page - 1) / per_page).max(1), "by_status": by })))
}

#[derive(Deserialize)]
pub struct DataBody {
    data: Value,
}

pub async fn create(State(st): State<AppState>, u: Me, Path(jenis): Path<String>, Json(b): Json<DataBody>) -> Result<(StatusCode, Json<Value>), ApiError> {
    let j = Jenis::parse(&jenis)?;
    let u = me(&u)?;
    let c = st.pool.get().await.map_err(internal)?;
    let mut d = b.data.as_object().cloned().ok_or_else(|| bad_request("Data form tidak valid"))?;
    let t = today(OFFSET_HOURS).format("%Y-%m-%d").to_string();
    // server-assigned dates (read-only in the form)
    match j {
        Jenis::Ebs => { d.insert("tgl_laporan".into(), json!(t)); }
        Jenis::Ibs => { d.insert("tgl_entri".into(), json!(t)); d.entry("tgl_formulir").or_insert(json!(t)); }
        Jenis::Individu => { d.insert("tgl_entri".into(), json!(t)); }
    }
    let no = next_no(&c, j).await?;
    let r = c
        .query_one(&format!("INSERT INTO {} (no_laporan, created_by, created_by_name) VALUES ($1, $2, $3) RETURNING id", j.table()), &[&no, &u.id, &actor_name(&u)])
        .await
        .map_err(internal)?;
    let id: i64 = r.get(0);
    let iss = evaluate(&c, j, &d).await?;
    persist(&c, j, id, &d, &iss).await?;
    event(&c, j, id, "dibuat", None, &actor_name(&u)).await?;
    Ok((StatusCode::CREATED, Json(json!({ "success": true, "data": record_json(&c, j, id).await? }))))
}

async fn status_of(c: &deadpool_postgres::Object, j: Jenis, id: i64) -> Result<(String, Value), ApiError> {
    let r = c
        .query_opt(&format!("SELECT status, data FROM {} WHERE id = $1 AND deleted_at IS NULL", j.table()), &[&id])
        .await
        .map_err(internal)?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Laporan tidak ditemukan"))?;
    Ok((r.get(0), r.get(1)))
}

/// Keep server-assigned keys from the stored record (client cannot change them).
fn keep_server_keys(j: Jenis, stored: &Value, d: &mut Obj) {
    let keys: &[&str] = match j { Jenis::Ebs => &["tgl_laporan"], Jenis::Ibs | Jenis::Individu => &["tgl_entri"] };
    for k in keys {
        if let Some(v) = stored.get(*k) {
            d.insert((*k).into(), v.clone());
        }
    }
}

pub async fn update(State(st): State<AppState>, Path((jenis, id)): Path<(String, i64)>, Json(b): Json<DataBody>) -> Result<Json<Value>, ApiError> {
    let j = Jenis::parse(&jenis)?;
    let c = st.pool.get().await.map_err(internal)?;
    let (status, stored) = status_of(&c, j, id).await?;
    if status != "draf" {
        return Err(err(StatusCode::CONFLICT, "Laporan yang sudah dikirim tidak dapat diubah."));
    }
    let mut d = b.data.as_object().cloned().ok_or_else(|| bad_request("Data form tidak valid"))?;
    keep_server_keys(j, &stored, &mut d);
    let iss = evaluate(&c, j, &d).await?;
    persist(&c, j, id, &d, &iss).await?;
    Ok(Json(json!({ "success": true, "data": record_json(&c, j, id).await? })))
}

pub async fn get_one(State(st): State<AppState>, Path((jenis, id)): Path<(String, i64)>) -> Result<Json<Value>, ApiError> {
    let j = Jenis::parse(&jenis)?;
    let c = st.pool.get().await.map_err(internal)?;
    Ok(Json(json!({ "success": true, "data": record_json(&c, j, id).await? })))
}

/// Kirim: server re-validates; 422 with the record when errors remain; IBS 409 when unit+tahun+minggu already sent.
pub async fn kirim(State(st): State<AppState>, u: Me, Path((jenis, id)): Path<(String, i64)>) -> Result<Response, ApiError> {
    let j = Jenis::parse(&jenis)?;
    let u = me(&u)?;
    let c = st.pool.get().await.map_err(internal)?;
    let (status, stored) = status_of(&c, j, id).await?;
    if status != "draf" {
        return Err(err(StatusCode::CONFLICT, "Laporan sudah dikirim."));
    }
    let d = stored.as_object().cloned().unwrap_or_default();
    let iss = evaluate(&c, j, &d).await?;
    persist(&c, j, id, &d, &iss).await?;
    if !iss.errors.is_empty() {
        let rec = record_json(&c, j, id).await?;
        return Ok((StatusCode::UNPROCESSABLE_ENTITY, Json(json!({ "success": false, "error": format!("Masih ada {} isian yang belum valid", iss.errors.len()), "data": rec }))).into_response());
    }
    if j == Jenis::Ibs {
        let dup = c
            .query_opt(
                "SELECT no_laporan FROM laporan_ibs WHERE deleted_at IS NULL AND status = 'dikirim' AND id <> $1
                   AND unit_key = (SELECT unit_key FROM laporan_ibs WHERE id = $1) AND tahun = $2 AND minggu = $3",
                &[&id, &int(&d, "tahun"), &int(&d, "minggu")],
            )
            .await
            .map_err(internal)?;
        if let Some(r) = dup {
            return Err(err(StatusCode::CONFLICT, &format!("Laporan IBS unit ini untuk minggu tersebut sudah dikirim ({}). Buka laporan lama untuk melihatnya.", r.get::<_, String>(0))));
        }
    }
    let n = c
        .execute(&format!("UPDATE {} SET status = 'dikirim', submitted_at = now(), updated_at = now() WHERE id = $1 AND status = 'draf'", j.table()), &[&id])
        .await
        .map_err(|e| if e.code() == Some(&tokio_postgres::error::SqlState::UNIQUE_VIOLATION) { err(StatusCode::CONFLICT, "Laporan IBS unit ini untuk minggu tersebut sudah dikirim.") } else { internal(e) })?;
    if n == 0 {
        return Err(err(StatusCode::CONFLICT, "Laporan sudah dikirim."));
    }
    event(&c, j, id, "dikirim", None, &actor_name(&u)).await?;
    Ok(Json(json!({ "success": true, "data": record_json(&c, j, id).await? })).into_response())
}

/// Soft delete, drafts only.
pub async fn remove(State(st): State<AppState>, u: Me, Path((jenis, id)): Path<(String, i64)>) -> Result<Json<Value>, ApiError> {
    let j = Jenis::parse(&jenis)?;
    let u = me(&u)?;
    let c = st.pool.get().await.map_err(internal)?;
    let n = c
        .execute(&format!("UPDATE {} SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL AND status = 'draf'", j.table()), &[&id])
        .await
        .map_err(internal)?;
    if n == 0 {
        return Err(err(StatusCode::CONFLICT, "Hanya laporan berstatus Draf yang dapat dihapus."));
    }
    event(&c, j, id, "dihapus", None, &actor_name(&u)).await?;
    Ok(Json(json!({ "success": true, "data": { "id": id, "deleted": true } })))
}

// ─── lampiran (EBS) ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct LampQuery {
    nama: Option<String>,
    judul: Option<String>,
}

fn clean_name(x: &str) -> String {
    let base = x.rsplit(['/', '\\']).next().unwrap_or(x);
    base.chars().filter(|c| !c.is_control() && *c != '"').take(160).collect::<String>().trim().to_string()
}

pub async fn lampiran_upload(
    State(st): State<AppState>, u: Me, Path((jenis, id)): Path<(String, i64)>, Query(q): Query<LampQuery>, headers: HeaderMap, body: Bytes,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    if Jenis::parse(&jenis)? != Jenis::Ebs {
        return Err(err(StatusCode::NOT_FOUND, "Lampiran hanya untuk laporan EBS"));
    }
    let u = me(&u)?;
    let tipe = headers.get(header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).unwrap_or("").split(';').next().unwrap_or("").trim().to_lowercase();
    if !LAMPIRAN_TIPE.contains(&tipe.as_str()) {
        return Err(bad_request("Tipe file tidak didukung (PDF, gambar JPG/PNG/WEBP, Word, Excel, CSV)"));
    }
    if body.is_empty() {
        return Err(bad_request("File kosong"));
    }
    if body.len() > MAX_LAMPIRAN {
        return Err(bad_request("Ukuran file maksimal 5 MB"));
    }
    let nama = clean_name(q.nama.as_deref().unwrap_or("lampiran"));
    let judul = q.judul.as_deref().map(|x| x.trim().chars().take(200).collect::<String>()).filter(|x| !x.is_empty()).unwrap_or_else(|| nama.clone());
    let c = st.pool.get().await.map_err(internal)?;
    let (status, _) = status_of(&c, Jenis::Ebs, id).await?;
    if status != "draf" {
        return Err(err(StatusCode::CONFLICT, "Laporan yang sudah dikirim tidak dapat diubah."));
    }
    let size = body.len() as i32;
    let r = c
        .query_one(
            "INSERT INTO laporan_lampiran (laporan_id, judul, nama_file, tipe, ukuran, isi, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
            &[&id, &judul, &nama, &tipe, &size, &body.to_vec(), &u.id],
        )
        .await
        .map_err(internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "success": true, "data": { "id": r.get::<_, i64>(0), "judul": judul, "nama_file": nama, "tipe": tipe, "ukuran": size } }))))
}

pub async fn lampiran_get(State(st): State<AppState>, Path((jenis, id, lid)): Path<(String, i64, i64)>) -> Result<Response, ApiError> {
    Jenis::parse(&jenis)?;
    let c = st.pool.get().await.map_err(internal)?;
    let r = c
        .query_opt("SELECT nama_file, tipe, isi FROM laporan_lampiran l JOIN laporan_ebs e ON e.id = l.laporan_id WHERE l.id = $1 AND l.laporan_id = $2 AND e.deleted_at IS NULL", &[&lid, &id])
        .await
        .map_err(internal)?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Lampiran tidak ditemukan"))?;
    let nama: String = r.get(0);
    let tipe: String = r.get(1);
    let isi: Vec<u8> = r.get(2);
    let ascii: String = nama.chars().map(|c| if c.is_ascii_alphanumeric() || ".-_ ".contains(c) { c } else { '_' }).collect();
    Response::builder()
        .header(header::CONTENT_TYPE, tipe)
        .header(header::CONTENT_DISPOSITION, format!("inline; filename=\"{ascii}\""))
        .header("x-content-type-options", "nosniff")
        .body(Body::from(isi))
        .map_err(internal)
}

pub async fn lampiran_delete(State(st): State<AppState>, Path((jenis, id, lid)): Path<(String, i64, i64)>) -> Result<Json<Value>, ApiError> {
    Jenis::parse(&jenis)?;
    let c = st.pool.get().await.map_err(internal)?;
    let (status, _) = status_of(&c, Jenis::Ebs, id).await?;
    if status != "draf" {
        return Err(err(StatusCode::CONFLICT, "Laporan yang sudah dikirim tidak dapat diubah."));
    }
    let n = c.execute("DELETE FROM laporan_lampiran WHERE id = $1 AND laporan_id = $2", &[&lid, &id]).await.map_err(internal)?;
    if n == 0 {
        return Err(err(StatusCode::NOT_FOUND, "Lampiran tidak ditemukan"));
    }
    Ok(Json(json!({ "success": true, "data": { "id": lid, "deleted": true } })))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn obj(v: Value) -> Obj {
        v.as_object().unwrap().clone()
    }
    fn keys(i: &[Value]) -> Vec<String> {
        i.iter().map(|x| x["key"].as_str().unwrap().to_string()).collect()
    }
    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn hp_format() {
        assert!(valid_hp("081234567890"));
        assert!(valid_hp("+62 812-3456-789"));
        assert!(valid_hp("6281234567"));
        assert!(!valid_hp("12345"));
        assert!(!valid_hp("0712345678"));
        assert!(!valid_hp("08abc"));
    }

    #[test]
    fn epi_weeks() {
        assert_eq!(mmwr_week_one(2026), d("2026-01-04"));
        assert_eq!(weeks_in_year(2026), 52);
        assert_eq!(weeks_in_year(2020), 53);
    }

    #[test]
    fn ebs_minimal_errors() {
        let i = validate_ebs(&obj(json!({ "tgl_laporan": "2026-11-09" })), d("2026-11-09"));
        let k = keys(&i.errors);
        for want in ["jenis_unit", "unit_pelapor", "penyakit_rumor", "tgl_rumor", "jml_kasus", "spesimen", "klb", "koordinasi"] {
            assert!(k.contains(&want.to_string()), "missing {want}");
        }
        // conditional fields are not required when the parent is not "Ya"
        assert!(!k.contains(&"lab_tgl_ambil".to_string()));
        assert!(!k.contains(&"w1".to_string()));
        assert!(!k.contains(&"tgl_meninggal".to_string()));
    }

    #[test]
    fn ebs_rules() {
        let base = json!({ "tgl_laporan": "2026-11-09", "jenis_unit": "Puskesmas", "provinsi_id": 1, "kabkota_id": 2, "kecamatan": "1101010",
            "unit_pelapor": "PKM A", "nama_pelapor": "Budi", "penyakit_rumor": "Dengue", "tgl_rumor": "2026-11-08", "jml_kasus": 3, "jml_kematian": 1,
            "tgl_meninggal": "2026-11-07", "spesimen": "Tidak", "tatalaksana": "Tidak", "klb": "Tidak", "pfr": "Tidak", "komrisk": "Tidak", "koordinasi": "Tidak" });
        let i = validate_ebs(&obj(base.clone()), d("2026-11-09"));
        assert!(i.errors.is_empty(), "{:?}", i.errors);
        let mut b = obj(base.clone());
        b.insert("jml_kematian".into(), json!(5));
        b.insert("jml_kasus".into(), json!(0));
        b.insert("tgl_rumor".into(), json!("2026-11-10"));
        b.insert("klb".into(), json!("Ya"));
        b.insert("usia".into(), json!({ "pria": { "20_44th": 2 } }));
        let i = validate_ebs(&b, d("2026-11-09"));
        let k = keys(&i.errors);
        assert!(k.contains(&"jml_kasus".to_string()));
        assert!(k.contains(&"jml_kematian".to_string()));
        assert!(k.contains(&"tgl_rumor".to_string()));
        assert!(k.contains(&"w1".to_string()) && k.contains(&"klb_status".to_string()));
        let mut c = obj(base);
        c.insert("usia".into(), json!({ "pria": { "20_44th": 1 }, "wanita": { "5_9th": 1 } }));
        let i = validate_ebs(&c, d("2026-11-09"));
        assert!(i.errors.is_empty());
        assert_eq!(keys(&i.warnings), vec!["usia".to_string()]);
    }

    #[test]
    fn ibs_rules() {
        let rows = vec!["01AWD".to_string(), "12MAL".to_string()];
        let base = json!({ "jenis_unit": "Puskesmas", "provinsi_id": 1, "kabkota_id": 2, "unit_pelapor": "PKM A", "petugas": "Budi", "tahun": 2026, "minggu": 44,
            "total_kunjungan": 100, "rows": { "01AWD": { "kasus": 5, "kematian": 0, "lab": 1 } } });
        let i = validate_ibs(&obj(base.clone()), d("2026-11-09"), &rows);
        assert!(i.errors.is_empty(), "{:?}", i.errors);
        let mut b = obj(base.clone());
        b.insert("rows".into(), json!({ "01AWD": { "kasus": 1, "kematian": 2, "lab": 3 } }));
        b.insert("minggu".into(), json!(50));
        b.insert("total_kunjungan".into(), json!(0));
        let i = validate_ibs(&b, d("2026-11-09"), &rows);
        let k = keys(&i.errors);
        assert!(k.contains(&"rows.01AWD.kematian".to_string()));
        assert!(k.contains(&"minggu".to_string()));
        assert!(keys(&i.warnings).contains(&"rows.01AWD.lab".to_string()));
        assert!(keys(&i.warnings).contains(&"total_kunjungan".to_string()));
        let mut z = obj(base);
        z.insert("rows".into(), json!({}));
        let i = validate_ibs(&z, d("2026-11-09"), &rows);
        assert!(keys(&i.errors).contains(&"konfirmasi_nihil".to_string()));
        z.insert("konfirmasi_nihil".into(), json!(true));
        assert!(validate_ibs(&z, d("2026-11-09"), &rows).errors.is_empty());
        assert_eq!(ibs_totals(&obj(json!({ "rows": { "01AWD": { "kasus": 2, "kematian": 1 }, "12MAL": { "kasus": "3" } } })), &rows), (5, 1));
    }

    #[test]
    fn individu_rules() {
        let rows = vec!["01AWD".to_string(), "12MAL".to_string()];
        let base = json!({ "jenis_unit": "Puskesmas", "provinsi_id": 1, "kabkota_id": 2, "unit_pelapor": "PKM A", "petugas": "Budi", "tahun": 2026, "minggu": 44,
            "nama_pasien": "Siti", "kelamin": "Wanita", "umur_tahun": 34, "penyakit": "01AWD", "tgl_periksa": "2026-11-02" });
        let i = validate_individu(&obj(base.clone()), d("2026-11-09"), &rows);
        assert!(i.errors.is_empty(), "{:?}", i.errors);
        assert!(i.warnings.is_empty(), "{:?}", i.warnings);
        // empty form: required keys
        let k = keys(&validate_individu(&obj(json!({})), d("2026-11-09"), &rows).errors);
        for want in ["jenis_unit", "unit_pelapor", "petugas", "tahun", "minggu", "nama_pasien", "kelamin", "umur_tahun", "penyakit", "tgl_periksa"] {
            assert!(k.contains(&want.to_string()), "missing {want}");
        }
        assert!(!k.contains(&"tgl_meninggal".to_string()));
        // bad values
        let mut b = obj(base.clone());
        b.insert("umur_tahun".into(), json!(0));
        b.insert("umur_bulan".into(), json!(12));
        b.insert("penyakit".into(), json!("TOTA"));
        b.insert("tgl_periksa".into(), json!("2026-11-10"));
        b.insert("status_akhir".into(), json!("Meninggal"));
        b.insert("hp_petugas".into(), json!("123"));
        b.insert("suhu".into(), json!("abc"));
        b.insert("alamat".into(), json!("x".repeat(501)));
        let k = keys(&validate_individu(&b, d("2026-11-09"), &rows).errors);
        for want in ["umur_bulan", "penyakit", "tgl_periksa", "tgl_meninggal", "hp_petugas", "suhu", "alamat"] {
            assert!(k.contains(&want.to_string()), "missing {want}: {k:?}");
        }
        // age: 0 tahun alone is not enough, 0 tahun + 3 bulan is fine
        let mut z = obj(base.clone());
        z.insert("umur_tahun".into(), json!(0));
        assert!(keys(&validate_individu(&z, d("2026-11-09"), &rows).errors).contains(&"umur_tahun".to_string()));
        z.insert("umur_bulan".into(), json!(3));
        assert!(validate_individu(&z, d("2026-11-09"), &rows).errors.is_empty());
        assert_eq!(umur_text(&z), Some("3 bl".into()));
        assert_eq!(umur_text(&obj(json!({ "umur_tahun": 2, "umur_hari": "5" }))), Some("2 th 5 hr".into()));
        // warnings: date outside the week, out-of-range measurements (decimal comma accepted)
        let mut w = obj(base);
        w.insert("tgl_periksa".into(), json!("2026-10-20"));
        w.insert("suhu".into(), json!("46,5"));
        w.insert("tinggi".into(), json!("165"));
        w.insert("sistole".into(), json!(80));
        w.insert("diastole".into(), json!(90));
        let i = validate_individu(&w, d("2026-11-09"), &rows);
        assert!(i.errors.is_empty(), "{:?}", i.errors);
        let wk = keys(&i.warnings);
        for want in ["tgl_periksa", "suhu", "diastole"] {
            assert!(wk.contains(&want.to_string()), "missing warning {want}: {wk:?}");
        }
        assert!(!wk.contains(&"tinggi".to_string()));
        assert!(matches!(Jenis::parse("individu"), Ok(Jenis::Individu)));
        assert_eq!(Jenis::Individu.table(), "laporan_ibs_individu");
    }

    #[test]
    fn unit_keys() {
        assert_eq!(unit_key(&obj(json!({ "unit_kode": "P123", "unit_pelapor": "PKM A" }))), Some("P123".into()));
        assert_eq!(unit_key(&obj(json!({ "unit_pelapor": "PKM A", "kabkota_id": 7 }))), Some("pkm a|7".into()));
        assert_eq!(clean_name("C:\\x\\y\\laporan \"1\".pdf"), "laporan 1.pdf");
    }
}
