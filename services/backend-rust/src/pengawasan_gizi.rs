//! PR 033: Pengawasan Gizi MBG — 13 formulir pengawasan standar gizi Program Makan Bergizi Gratis (naskah tim dokter)
//! sebagai modul input di SKDR Indonesia, gaya wizard yang sama dengan Laporan EBS/IBS.
//! * Satu **kunjungan** (`mbg_kunjungan`, nomor MBG-YYYY-######) = identitas yang dipakai bersama F1–F13
//!   (Nama TPG, Puskesmas, Kab/Kota, Provinsi, Nama SPPG, Nama Pengawas Gizi, Hari/Tanggal).
//! * Tiap formulir (`mbg_form`) disimpan sebagai JSONB (`data`) + `schema_version`; skor & kesimpulan dihitung server
//!   (cermin `services/frontend-next/lib/pengawasan-gizi/forms.ts`). Draf boleh belum lengkap; Kirim formulir ditolak 422
//!   bila masih ada error. F12/F13 = rekap otomatis dari F3–F9 / F10–F11 yang sudah dikirim.
//! * Kirim kunjungan: identitas valid + 13 formulir terkirim. Tidak ada pengiriman ke sistem eksternal.
//! Akses (auth::classify): baca = `tatakelola`, tulis = `pe_input` (sama dengan /api/v1/laporan).
use axum::{
    body::{Body, Bytes},
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::{Datelike, NaiveDate};
use serde::Deserialize;
use serde_json::{json, Map, Value};

use crate::auth::AuthUser;
use crate::laporan::{LAMPIRAN_TIPE, MAX_LAMPIRAN};
use crate::pe_engine::today;
use crate::{bad_request, internal, ApiError, AppState};

type Me = Option<axum::Extension<AuthUser>>;
type Obj = Map<String, Value>;
type Db = deadpool_postgres::Object;

const OFFSET_HOURS: i64 = 7; // WIB
pub const SCHEMA_VERSION: i16 = 1;
const SESUAI: &str = "Sesuai";
const TIDAK: &str = "Tidak Sesuai";
const AMBANG_SKOR: f64 = 80.0;

fn err(code: StatusCode, msg: &str) -> ApiError {
    (code, Json(json!({ "success": false, "error": msg })))
}
fn me(u: &Me) -> Result<AuthUser, ApiError> {
    u.as_ref().map(|e| e.0.clone()).ok_or_else(|| err(StatusCode::UNAUTHORIZED, "Silakan masuk terlebih dahulu"))
}
fn actor_name(u: &AuthUser) -> String {
    u.full_name.clone().filter(|x| !x.trim().is_empty()).unwrap_or_else(|| u.username.clone())
}

// ─── helpers on the JSON data ─────────────────────────────────────────────────

fn s(d: &Obj, k: &str) -> Option<String> {
    match d.get(k) {
        Some(Value::String(v)) if !v.trim().is_empty() => Some(v.trim().to_string()),
        Some(Value::Number(n)) => Some(n.to_string()),
        _ => None,
    }
}
fn num(v: Option<&Value>) -> Option<f64> {
    match v {
        Some(Value::Number(n)) => n.as_f64(),
        Some(Value::String(x)) if !x.trim().is_empty() => x.trim().replace(',', ".").parse().ok(),
        _ => None,
    }
}
fn n(d: &Obj, k: &str) -> Option<f64> {
    num(d.get(k))
}
fn int(d: &Obj, k: &str) -> Option<i32> {
    n(d, k).map(|f| f as i32)
}
fn filled(d: &Obj, k: &str) -> bool {
    match d.get(k) {
        None | Some(Value::Null) => false,
        Some(Value::String(v)) => !v.trim().is_empty(),
        _ => true,
    }
}
fn date(d: &Obj, k: &str) -> Option<NaiveDate> {
    d.get(k).and_then(|v| v.as_str()).and_then(|x| NaiveDate::parse_from_str(x.trim(), "%Y-%m-%d").ok())
}
fn round1(x: f64) -> f64 {
    (x * 10.0).round() / 10.0
}

pub struct Issues {
    pub errors: Vec<Value>,
    pub warnings: Vec<Value>,
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
        if !filled(d, key) {
            self.e(step, key, &format!("{label} wajib diisi"));
            return false;
        }
        true
    }
    /// whole number ≥ 0 (required when `required`)
    fn count(&mut self, d: &Obj, step: &str, key: &str, label: &str, required: bool) -> Option<f64> {
        if !filled(d, key) {
            if required {
                self.e(step, key, &format!("{label} wajib diisi (isi 0 bila tidak ada)"));
            }
            return None;
        }
        match n(d, key) {
            Some(x) if x >= 0.0 && x.fract() == 0.0 => Some(x),
            _ => {
                self.e(step, key, &format!("{label} harus bilangan bulat ≥ 0"));
                None
            }
        }
    }
    fn choice(&mut self, d: &Obj, step: &str, key: &str, label: &str, allowed: &[&str]) -> Option<String> {
        match s(d, key) {
            None => {
                self.e(step, key, &format!("{label} belum dinilai"));
                None
            }
            Some(v) if allowed.contains(&v.as_str()) => Some(v),
            Some(_) => {
                self.e(step, key, &format!("{label}: pilihan tidak valid"));
                None
            }
        }
    }
    fn max_len(&mut self, d: &Obj, step: &str, key: &str, label: &str, max: usize) {
        if let Some(v) = s(d, key) {
            if v.chars().count() > max {
                self.e(step, key, &format!("{label} maksimal {max} karakter"));
            }
        }
    }
}

/// Result of evaluating one formulir.
pub struct Eval {
    pub iss: Issues,
    pub skor: Option<f64>,
    pub kesimpulan: Option<String>,
    pub hasil: Value,
}

// ─── identitas kunjungan ──────────────────────────────────────────────────────

/// Identitas (langkah s1 Puskesmas & Wilayah, s2 SPPG & Kunjungan).
pub fn validate_identitas(d: &Obj, today: NaiveDate) -> Issues {
    let mut i = Issues::new();
    i.req(d, "s1", "nama_tpg", "Nama TPG");
    i.req(d, "s1", "provinsi_id", "Provinsi");
    i.req(d, "s1", "kabkota_id", "Kab/Kota");
    i.req(d, "s1", "unit_pelapor", "Puskesmas");
    i.req(d, "s2", "nama_sppg", "Nama SPPG");
    i.req(d, "s2", "nama_pengawas", "Nama Pengawas Gizi");
    if i.req(d, "s2", "tanggal", "Hari/Tanggal") {
        match date(d, "tanggal") {
            None => i.e("s2", "tanggal", "Format tanggal tidak valid"),
            Some(t) if t > today => i.e("s2", "tanggal", "Hari/Tanggal kunjungan tidak boleh di masa depan"),
            _ => {}
        }
    }
    for (k, l) in [("nama_tpg", "Nama TPG"), ("nama_sppg", "Nama SPPG"), ("nama_pengawas", "Nama Pengawas Gizi")] {
        i.max_len(d, if k == "nama_tpg" { "s1" } else { "s2" }, k, l, 200);
    }
    i
}

// ─── formulir checklist (F3–F8, F10, F11) ─────────────────────────────────────

pub struct CekSpec {
    pub no: i16,
    /// (step id, first item, last item)
    pub groups: &'static [(&'static str, u8, u8)],
    /// F10/F11: items 3–7 are computed from 5 sample leftover percentages
    pub sisa: bool,
    /// extra header fields (key, label) on step `dok`
    pub header: &'static [(&'static str, &'static str)],
    /// F3: catatan alergi (tidak dinilai)
    pub alergi: bool,
}

pub const CEK: &[CekSpec] = &[
    CekSpec { no: 3, groups: &[("kA", 1, 7), ("kB", 8, 10)], sisa: false, header: &[], alergi: true },
    CekSpec { no: 4, groups: &[("kA", 1, 5), ("kB", 6, 9), ("kC", 10, 13)], sisa: false, header: &[], alergi: false },
    CekSpec { no: 5, groups: &[("kA", 1, 3), ("kB", 4, 8)], sisa: false, header: &[], alergi: false },
    CekSpec { no: 6, groups: &[("kA", 1, 6), ("kB", 7, 9)], sisa: false, header: &[], alergi: false },
    CekSpec { no: 7, groups: &[("kA", 1, 5)], sisa: false, header: &[], alergi: false },
    CekSpec { no: 8, groups: &[("kA", 1, 4), ("kB", 5, 7)], sisa: false, header: &[], alergi: false },
    CekSpec {
        no: 10, groups: &[("kA", 1, 2), ("kB", 3, 7)], sisa: true,
        header: &[("nama_sekolah", "Nama Sekolah"), ("nama_guru", "Nama Guru Pendamping")], alergi: false,
    },
    CekSpec {
        no: 11, groups: &[("kA", 1, 2), ("kB", 3, 7)], sisa: true,
        header: &[("nama_posyandu", "Nama Posyandu"), ("nama_kader", "Nama Kader Pendamping")], alergi: false,
    },
];

pub const SAMPEL: usize = 5;
pub const BATAS_SISA: f64 = 20.0;

/// Daya terima item 3–7: "sesuai apabila 3 sampel atau lebih sisa makanannya < 20%" (5 sampel/ompreng).
/// Returns (value when all 5 samples are filled, invalid sample keys, number of filled samples).
pub fn sisa_item(d: &Obj, item: u8) -> (Option<&'static str>, Vec<String>, usize) {
    let mut bad = vec![];
    let mut filled_n = 0;
    let mut lt = 0;
    for x in 1..=SAMPEL {
        let k = format!("sisa_i{item}_{x}");
        if !filled(d, &k) {
            continue;
        }
        match n(d, &k) {
            Some(v) if (0.0..=100.0).contains(&v) => {
                filled_n += 1;
                if v < BATAS_SISA {
                    lt += 1;
                }
            }
            _ => bad.push(k),
        }
    }
    let val = if filled_n == SAMPEL && bad.is_empty() { Some(if lt >= 3 { SESUAI } else { TIDAK }) } else { None };
    (val, bad, filled_n)
}

/// skor = jumlah "sesuai" / N × 100; kesimpulan Sesuai bila skor ≥ 80 (hanya bila semua item sudah dinilai)
fn skor_kesimpulan(sesuai: usize, dinilai: usize, total: usize) -> (Option<f64>, Option<String>) {
    if total == 0 {
        return (None, None);
    }
    let skor = round1(sesuai as f64 / total as f64 * 100.0);
    if dinilai < total {
        return (Some(skor), None);
    }
    (Some(skor), Some(if skor >= AMBANG_SKOR { SESUAI } else { TIDAK }.to_string()))
}

/// Rekomendasi 1–4 (`{prefix}1..4`): panjang maks. 500; nomor 1 wajib bila `perlu`.
fn rekomendasi(i: &mut Issues, d: &Obj, perlu: bool, prefix: &str, msg: &str) {
    for x in 1..=4 {
        i.max_len(d, "kes", &format!("{prefix}{x}"), &format!("Rekomendasi {x}"), 500);
    }
    if perlu && !filled(d, &format!("{prefix}1")) {
        i.e("kes", &format!("{prefix}1"), msg);
    }
}

pub fn validate_cek(spec: &CekSpec, d: &Obj) -> Eval {
    let mut i = Issues::new();
    for (k, l) in spec.header {
        i.req(d, "dok", k, l);
        i.max_len(d, "dok", k, l, 200);
    }
    let total: usize = spec.groups.iter().map(|(_, a, b)| (b - a + 1) as usize).sum();
    let (mut sesuai, mut dinilai) = (0usize, 0usize);
    let mut tidak: Vec<u8> = vec![];
    let mut nilai = Map::new();
    for (step, a, b) in spec.groups {
        for k in *a..=*b {
            let key = format!("i{k}");
            let v: Option<String> = if spec.sisa && k >= 3 {
                let (v, bad, nf) = sisa_item(d, k);
                if !bad.is_empty() {
                    i.e(step, &key, &format!("Item {k}: persentase sisa makanan harus 0–100"));
                } else if v.is_none() {
                    i.e(step, &key, &format!("Item {k}: isi persentase sisa makanan {SAMPEL} sampel ({nf}/{SAMPEL} terisi)"));
                }
                v.map(|x| x.to_string())
            } else {
                let v = i.choice(d, step, &key, &format!("Item {k}"), &[SESUAI, TIDAK]);
                if v.as_deref() == Some(TIDAK) && !filled(d, &format!("{key}_ket")) {
                    i.e(step, &format!("{key}_ket"), &format!("Item {k}: Keterangan wajib diisi bila Tidak Sesuai"));
                }
                v
            };
            i.max_len(d, step, &format!("{key}_ket"), &format!("Keterangan item {k}"), 500);
            if let Some(v) = v {
                dinilai += 1;
                if v == SESUAI {
                    sesuai += 1;
                } else {
                    tidak.push(k);
                }
                nilai.insert(key, json!(v));
            }
        }
    }
    let (skor, kes) = skor_kesimpulan(sesuai, dinilai, total);
    rekomendasi(&mut i, d, !tidak.is_empty(), "rek", "Rekomendasi 1 wajib diisi bila ada item Tidak Sesuai");
    if spec.alergi && i.choice(d, "kes", "alergi", "Pertanyaan sasaran alergi makanan", &["Ya", "Tidak"]).as_deref() == Some("Ya") {
        i.req(d, "kes", "alergi_detail", "Jenis alergi & penanganannya");
    }
    Eval { iss: i, skor, kesimpulan: kes, hasil: json!({ "total": total, "dinilai": dinilai, "sesuai": sesuai, "tidak_sesuai": tidak, "nilai": nilai }) }
}

// ─── F9 Pemorsian (item × kelompok sasaran) ───────────────────────────────────

pub const F9_ITEMS: u8 = 6;

pub fn validate_f9(d: &Obj) -> Eval {
    let mut i = Issues::new();
    let sas: Vec<(String, String)> = d
        .get("sasaran")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_object())
                .map(|o| (o.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(), o.get("nama").and_then(|v| v.as_str()).unwrap_or("").trim().to_string()))
                .collect()
        })
        .unwrap_or_default();
    if sas.is_empty() {
        i.e("sas", "sasaran", "Tambahkan minimal 1 kelompok sasaran");
    }
    let mut seen = std::collections::HashSet::new();
    for (x, (id, nama)) in sas.iter().enumerate() {
        if id.is_empty() || nama.is_empty() {
            i.e("sas", "sasaran", &format!("Kelompok sasaran ke-{} belum dipilih", x + 1));
        } else if !seen.insert(nama.to_lowercase()) {
            i.w("sas", "sasaran", &format!("Kelompok sasaran \"{nama}\" dipilih lebih dari sekali"));
        }
    }
    let (mut sesuai, mut dinilai, mut sel_sesuai, mut sel_total) = (0usize, 0usize, 0usize, 0usize);
    let mut tidak = vec![];
    let mut nilai = Map::new();
    for k in 1..=F9_ITEMS {
        let step = if k == 1 { "kA" } else { "kB" };
        let key = format!("i{k}");
        i.max_len(d, step, &format!("{key}_ket"), &format!("Keterangan item {k}"), 500);
        let mut all = !sas.is_empty();
        let mut any_tidak = false;
        for (id, _) in &sas {
            sel_total += 1;
            match s(d, &format!("i{k}_{id}")).as_deref() {
                Some(SESUAI) => sel_sesuai += 1,
                Some(TIDAK) => any_tidak = true,
                _ => all = false,
            }
        }
        if !all {
            if !sas.is_empty() {
                i.e(step, &key, &format!("Item {k}: nilai untuk semua kelompok sasaran"));
            }
            continue;
        }
        dinilai += 1;
        // naskah: "sesuai apabila sasaran 1, 2 dan 3 sesuai" → item Sesuai bila semua kelompok sasaran Sesuai
        if any_tidak {
            tidak.push(k);
            nilai.insert(key.clone(), json!(TIDAK));
            if !filled(d, &format!("{key}_ket")) {
                i.e(step, &format!("{key}_ket"), &format!("Item {k}: Keterangan wajib diisi bila Tidak Sesuai"));
            }
        } else {
            sesuai += 1;
            nilai.insert(key.clone(), json!(SESUAI));
        }
    }
    let (skor, kes) = skor_kesimpulan(sesuai, dinilai, F9_ITEMS as usize);
    rekomendasi(&mut i, d, !tidak.is_empty(), "rek", "Rekomendasi 1 wajib diisi bila ada item Tidak Sesuai");
    Eval {
        iss: i, skor, kesimpulan: kes,
        hasil: json!({ "total": F9_ITEMS, "dinilai": dinilai, "sesuai": sesuai, "tidak_sesuai": tidak, "nilai": nilai,
            "sasaran": sas.len(), "sel_sesuai": sel_sesuai, "sel_total": sel_total }),
    }
}

// ─── F1 Ketenagaan ────────────────────────────────────────────────────────────

pub const F1_A1_ROWS: usize = 7; // 1–6 kualifikasi, 7 Lainnya
pub const F1_B1_ROWS: usize = 5;
pub const F1_B2_ROWS: usize = 3;
pub const F1_B2_LAIN: usize = 5;

/// Minimal penjamah makanan: 47 orang; wilayah 3T sesuai jumlah penerima manfaat (naskah).
/// Penerima ≥ 1000 di 3T tidak diatur naskah → tetap 47 (asumsi paling aman).
pub fn ambang_penjamah(tiga_t: bool, penerima: Option<f64>) -> i32 {
    if !tiga_t {
        return 47;
    }
    match penerima {
        Some(p) if p < 250.0 => 15,
        Some(p) if p <= 500.0 => 18,
        Some(p) if p <= 750.0 => 21,
        Some(p) if p <= 999.0 => 25,
        _ => 47,
    }
}

pub fn validate_f1(d: &Obj) -> Eval {
    let mut i = Issues::new();
    // A.1 — naskah: sesuai bila minimal ada 1 pengawas gizi dengan kualifikasi pendidikan 1/2/3/4/5/6
    let mut kual = 0.0;
    let mut a1_ok = true;
    for r in 1..=F1_A1_ROWS {
        match i.count(d, "a1", &format!("a1_r{r}"), &format!("A.1 baris {r}"), true) {
            Some(x) if r <= 6 => kual += x,
            Some(x) if x > 0.0 => {
                i.req(d, "a1", "a1_r7_jenis", "Jenis pendidikan Lainnya");
            }
            None => a1_ok = false,
            _ => {}
        }
    }
    i.max_len(d, "a1", "a1_r7_jenis", "Jenis pendidikan Lainnya", 200);
    let a1 = if a1_ok { Some(kual >= 1.0) } else { None };
    // A.2 — sesuai bila pengawas gizi sudah mendapatkan pelatihan 1 dan 2
    let p1 = i.choice(d, "a2", "a2_p1", "A.2 Pelatihan standar gizi MBG", &["Belum", "Sudah"]);
    let p2 = i.choice(d, "a2", "a2_p2", "A.2 Pelatihan penyelenggaraan makanan/keamanan pangan", &["Belum", "Sudah"]);
    for p in 1..=2 {
        i.max_len(d, "a2", &format!("a2_p{p}_sertifikat"), "Nomor sertifikat/surat tugas", 200);
    }
    let a2 = match (p1.as_deref(), p2.as_deref()) {
        (Some(a), Some(b)) => Some(a == "Sudah" && b == "Sudah"),
        _ => None,
    };
    let a = match (a1, a2) {
        (Some(x), Some(y)) => Some(x && y),
        _ => None,
    };
    // B.1 — minimal 47 penjamah makanan (pengecualian wilayah 3T)
    let mut total = 0.0;
    let mut b1_ok = true;
    for r in 1..=F1_B1_ROWS {
        match i.count(d, "b1", &format!("b1_r{r}"), &format!("B.1 baris {r}"), true) {
            Some(x) => total += x,
            None => b1_ok = false,
        }
    }
    let tiga_t = i.choice(d, "b1", "wilayah_3t", "SPPG di wilayah 3T", &["Ya", "Tidak"]);
    let is_3t = tiga_t.as_deref() == Some("Ya");
    let penerima = if is_3t { i.count(d, "b1", "penerima", "Jumlah penerima manfaat", true) } else { None };
    let ambang = ambang_penjamah(is_3t, penerima);
    let b1 = if b1_ok && tiga_t.is_some() && (!is_3t || penerima.is_some()) { Some(total >= ambang as f64) } else { None };
    // B.2
    let mut b2_rows = vec![];
    for r in 1..=F1_B2_ROWS {
        let be = i.count(d, "b2", &format!("b2_p{r}_belum"), &format!("B.2 baris {r} — belum mengikuti"), true);
        let su = i.count(d, "b2", &format!("b2_p{r}_sudah"), &format!("B.2 baris {r} — sudah mengikuti"), true);
        b2_rows.push((be, su));
    }
    for r in 1..=F1_B2_LAIN {
        if filled(d, &format!("b2_l{r}_nama")) {
            i.count(d, "b2", &format!("b2_l{r}_belum"), &format!("Pelatihan lain {r} — belum mengikuti"), true);
            i.count(d, "b2", &format!("b2_l{r}_sudah"), &format!("Pelatihan lain {r} — sudah mengikuti"), true);
            i.max_len(d, "b2", &format!("b2_l{r}_nama"), &format!("Nama pelatihan lain {r}"), 200);
        }
    }
    // naskah: sesuai bila minimal 50% penjamah makanan sudah mendapatkan pelatihan standar gizi dan keamanan pangan
    // (baris a kolom 4). Penyebut = total penjamah B.1; bila B.1 belum lengkap/0 → belum + sudah baris 1.
    let (be1, su1) = b2_rows[0];
    let denom = if b1_ok && total > 0.0 {
        Some(total)
    } else {
        match (be1, su1) {
            (Some(a), Some(b)) => Some(a + b),
            _ => None,
        }
    };
    let b2 = match (su1, denom) {
        (Some(su), Some(dn)) if dn > 0.0 => Some(su * 2.0 >= dn),
        (Some(_), Some(_)) => Some(false),
        _ => None,
    };
    if let (Some(su), true) = (su1, b1_ok) {
        if su > total {
            i.e("b2", "b2_p1_sudah", "Jumlah yang sudah mengikuti melebihi total penjamah makanan (B.1)");
        }
    }
    for (r, (be, su)) in b2_rows.iter().enumerate() {
        if let (Some(be), Some(su), true) = (be, su, b1_ok && total > 0.0) {
            if (be + su - total).abs() > f64::EPSILON {
                i.w("b2", &format!("b2_p{}_sudah", r + 1), &format!("B.2 baris {}: belum + sudah ({}) ≠ total penjamah B.1 ({})", r + 1, (be + su) as i64, total as i64));
            }
        }
    }
    rekomendasi(&mut i, d, a == Some(false), "rekA", "Rekomendasi A wajib diisi bila Kesimpulan Pengawas Gizi Tidak Sesuai");
    rekomendasi(&mut i, d, b1 == Some(false) || b2 == Some(false), "rekB", "Rekomendasi B wajib diisi bila B.1/B.2 Tidak Sesuai");
    let sv = |x: Option<bool>| x.map(|b| if b { SESUAI } else { TIDAK });
    let kes = match (a, b1, b2) {
        (Some(x), Some(y), Some(z)) => Some(if x && y && z { SESUAI } else { TIDAK }.to_string()),
        _ => None,
    };
    Eval {
        iss: i, skor: None, kesimpulan: kes,
        hasil: json!({ "a1": sv(a1), "a2": sv(a2), "a": sv(a), "b1": sv(b1), "b2": sv(b2), "total_penjamah": if b1_ok { Some(total) } else { None },
            "ambang": ambang, "kualifikasi": kual }),
    }
}

// ─── F2 Ketersediaan & sosialisasi SOP ────────────────────────────────────────

pub const F2_A: usize = 7;
pub const F2_B: usize = 8;
pub const F2_BUKTI: [&str; 3] = ["undangan", "notulen", "hadir"];

/// saran nilai B: Sesuai bila sudah sosialisasi + 3 bukti dokumen lengkap (naskah)
pub fn f2_saran(d: &Obj, r: usize) -> Option<&'static str> {
    match s(d, &format!("b{r}_sos")).as_deref() {
        Some("Sudah") => Some(if F2_BUKTI.iter().all(|b| matches!(d.get(&format!("b{r}_{b}")), Some(Value::Bool(true)))) { SESUAI } else { TIDAK }),
        Some("Belum") => Some(TIDAK),
        _ => None,
    }
}

pub fn validate_f2(d: &Obj) -> Eval {
    let mut i = Issues::new();
    let (mut ok, mut done) = (0usize, 0usize);
    let (mut tidak_a, mut tidak_b) = (vec![], vec![]);
    for r in 1..=F2_A {
        let v = i.choice(d, "a", &format!("a{r}"), &format!("A.{r} Ketersediaan SOP"), &[SESUAI, TIDAK]);
        if v.as_deref() == Some(TIDAK) && !filled(d, &format!("a{r}_ket")) {
            i.e("a", &format!("a{r}_ket"), &format!("A.{r}: Keterangan wajib diisi bila Tidak Sesuai"));
        }
        i.max_len(d, "a", &format!("a{r}_ket"), &format!("Keterangan A.{r}"), 500);
        if let Some(v) = v {
            done += 1;
            if v == SESUAI { ok += 1 } else { tidak_a.push(r) }
        }
    }
    for r in 1..=F2_B {
        i.choice(d, "b", &format!("b{r}_sos"), &format!("B.{r} Sosialisasi"), &["Sudah", "Belum"]);
        let v = i.choice(d, "b", &format!("b{r}"), &format!("B.{r} Kesesuaian"), &[SESUAI, TIDAK]);
        i.max_len(d, "b", &format!("b{r}_ket"), &format!("Keterangan B.{r}"), 500);
        if let (Some(v), Some(saran)) = (v.as_deref(), f2_saran(d, r)) {
            if v == SESUAI && saran == TIDAK {
                i.w("b", &format!("b{r}"), &format!("B.{r} dinilai Sesuai padahal belum sosialisasi / bukti dokumen belum lengkap"));
            }
        }
        if let Some(v) = v {
            done += 1;
            if v == SESUAI { ok += 1 } else { tidak_b.push(r) }
        }
    }
    let total = F2_A + F2_B;
    // naskah: sesuai apabila seluruh jawaban di komponen A dan B adalah "sesuai"
    let kes = if done == total { Some(if ok == total { SESUAI } else { TIDAK }.to_string()) } else { None };
    rekomendasi(&mut i, d, !tidak_a.is_empty() || !tidak_b.is_empty(), "rek", "Rekomendasi wajib diisi: tuliskan SOP yang belum ada/belum disosialisasikan");
    Eval { iss: i, skor: None, kesimpulan: kes, hasil: json!({ "total": total, "dinilai": done, "sesuai": ok, "tidak_a": tidak_a, "tidak_b": tidak_b }) }
}

// ─── F12 / F13 rekap ──────────────────────────────────────────────────────────

pub type Source = (i16, Option<String>, Option<String>);

/// sources: (form_no, status, kesimpulan) of the saved forms of the visit
pub fn validate_rekap(no: i16, d: &Obj, sources: &[Source]) -> Eval {
    let mut i = Issues::new();
    let range: Vec<i16> = if no == 12 { (3..=9).collect() } else { vec![10, 11] };
    let mut ok = 0;
    let mut ready = true;
    let mut rows = vec![];
    for f in &range {
        let src = sources.iter().find(|x| x.0 == *f);
        let status = src.and_then(|x| x.1.clone());
        let kes = src.and_then(|x| x.2.clone());
        if status.as_deref() != Some("dikirim") || kes.is_none() {
            ready = false;
            let st = if status.as_deref() == Some("draf") { "masih draf" } else { "belum diisi" };
            i.e("rekap", &format!("f{f}"), &format!("Formulir {f} belum dikirim ({st})"));
        } else if kes.as_deref() == Some(SESUAI) {
            ok += 1;
        }
        rows.push(json!({ "form_no": f, "status": status, "kesimpulan": kes }));
    }
    for f in &range {
        i.max_len(d, "rekap", &format!("ket{f}"), &format!("Keterangan Formulir {f}"), 500);
    }
    i.max_len(d, "rekap", "catatan", "Catatan", 1000);
    // F12: "baik" apabila nomor 1 sd 7 ternilai "sesuai"; F13: nomor 1 sd 2 (naskah menulis "sudah" → dibaca "baik")
    let kes = if ready { Some(if ok == range.len() { "BAIK" } else { "BELUM BAIK" }.to_string()) } else { None };
    Eval { iss: i, skor: None, kesimpulan: kes, hasil: json!({ "total": range.len(), "sesuai": ok, "sumber": rows }) }
}

pub fn evaluate_form(no: i16, d: &Obj, sources: &[Source]) -> Eval {
    match no {
        1 => validate_f1(d),
        2 => validate_f2(d),
        9 => validate_f9(d),
        12 | 13 => validate_rekap(no, d, sources),
        _ => match CEK.iter().find(|c| c.no == no) {
            Some(spec) => validate_cek(spec, d),
            None => Eval { iss: Issues::new(), skor: None, kesimpulan: None, hasil: json!({}) },
        },
    }
}

fn form_no(x: i16) -> Result<i16, ApiError> {
    if (1..=13).contains(&x) {
        Ok(x)
    } else {
        Err(err(StatusCode::NOT_FOUND, "Formulir tidak dikenal (1–13)"))
    }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async fn next_no(c: &Db) -> Result<String, ApiError> {
    let year = today(OFFSET_HOURS).year();
    let r = c
        .query_one(
            "INSERT INTO laporan_counters (jenis, year, last_no) VALUES ('mbg', $1, 1)
             ON CONFLICT (jenis, year) DO UPDATE SET last_no = laporan_counters.last_no + 1 RETURNING last_no",
            &[&year],
        )
        .await
        .map_err(internal)?;
    Ok(format!("MBG-{year}-{:06}", r.get::<_, i32>(0)))
}

async fn event(c: &Db, id: i64, ev: &str, note: Option<String>, actor: &str) -> Result<(), ApiError> {
    c.execute("INSERT INTO laporan_events (jenis, laporan_id, event, note, actor) VALUES ('mbg', $1, $2, $3, $4)", &[&id, &ev, &note, &actor])
        .await
        .map_err(internal)?;
    Ok(())
}

async fn kunjungan_status(c: &Db, id: i64) -> Result<String, ApiError> {
    c.query_opt("SELECT status FROM mbg_kunjungan WHERE id = $1 AND deleted_at IS NULL", &[&id])
        .await
        .map_err(internal)?
        .map(|r| r.get(0))
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Kunjungan tidak ditemukan"))
}

async fn editable(c: &Db, id: i64) -> Result<(), ApiError> {
    if kunjungan_status(c, id).await? != "draf" {
        return Err(err(StatusCode::CONFLICT, "Kunjungan yang sudah dikirim tidak dapat diubah."));
    }
    Ok(())
}

async fn identitas_issues(c: &Db, d: &Obj) -> Result<Issues, ApiError> {
    let mut iss = validate_identitas(d, today(OFFSET_HOURS));
    if let Some(k) = int(d, "kabkota_id") {
        let p = int(d, "provinsi_id");
        let ok = c
            .query_opt("SELECT 1 FROM master_kabkota WHERE id = $1 AND ($2::int IS NULL OR province_id = $2)", &[&k, &p])
            .await
            .map_err(internal)?
            .is_some();
        if !ok {
            iss.e("s1", "kabkota_id", "Kab/Kota tidak sesuai dengan provinsi yang dipilih");
        }
    }
    Ok(iss)
}

async fn persist_kunjungan(c: &Db, id: i64, d: &Obj, iss: &Issues) -> Result<(), ApiError> {
    let errors = Value::Array(iss.errors.clone());
    let data = Value::Object(d.clone());
    // ids that do not exist stay in `data` only (FK columns NULL)
    let pid = match int(d, "provinsi_id") {
        Some(p) => c.query_opt("SELECT id FROM master_locations WHERE id = $1", &[&p]).await.map_err(internal)?.map(|r| r.get::<_, i32>(0)),
        None => None,
    };
    let kid = match int(d, "kabkota_id") {
        Some(k) => c.query_opt("SELECT id FROM master_kabkota WHERE id = $1", &[&k]).await.map_err(internal)?.map(|r| r.get::<_, i32>(0)),
        None => None,
    };
    c.execute(
        "UPDATE mbg_kunjungan SET data = $2, errors = $3, nama_tpg = $4, puskesmas = $5, province_id = $6, kabkota_id = $7, nama_sppg = $8,
            nama_pengawas = $9, tanggal = $10, updated_at = now() WHERE id = $1",
        &[&id, &data, &errors, &s(d, "nama_tpg"), &s(d, "unit_pelapor"), &pid, &kid, &s(d, "nama_sppg"), &s(d, "nama_pengawas"), &date(d, "tanggal")],
    )
    .await
    .map_err(internal)?;
    Ok(())
}

/// (form_no, status, kesimpulan) of every saved formulir of the visit
async fn sources(c: &Db, id: i64) -> Result<Vec<Source>, ApiError> {
    Ok(c.query("SELECT form_no, status, kesimpulan FROM mbg_form WHERE kunjungan_id = $1", &[&id])
        .await
        .map_err(internal)?
        .iter()
        .map(|r| (r.get::<_, i16>(0), Some(r.get::<_, String>(1)), r.get::<_, Option<String>>(2)))
        .collect())
}

async fn forms_json(c: &Db, id: i64) -> Result<Vec<Value>, ApiError> {
    let rows = c
        .query(
            "SELECT form_no, status, jsonb_array_length(errors), skor, kesimpulan, data->'_hasil',
                    to_char(updated_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'), to_char(submitted_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI')
             FROM mbg_form WHERE kunjungan_id = $1 ORDER BY form_no",
            &[&id],
        )
        .await
        .map_err(internal)?;
    Ok(rows
        .iter()
        .map(|r| {
            json!({ "form_no": r.get::<_, i16>(0), "status": r.get::<_, String>(1), "error_count": r.get::<_, i32>(2), "skor": r.get::<_, Option<f64>>(3),
                "kesimpulan": r.get::<_, Option<String>>(4), "hasil": r.get::<_, Option<Value>>(5), "updated_at": r.get::<_, Option<String>>(6),
                "submitted_at": r.get::<_, Option<String>>(7) })
        })
        .collect())
}

async fn kunjungan_json(c: &Db, id: i64) -> Result<Value, ApiError> {
    let r = c
        .query_opt(
            "SELECT k.id, k.no_kunjungan, k.status, k.data, k.errors, k.created_by_name,
                    to_char(k.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'),
                    to_char(k.updated_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'),
                    to_char(k.submitted_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'), p.name, kb.name
             FROM mbg_kunjungan k LEFT JOIN master_locations p ON p.id = k.province_id LEFT JOIN master_kabkota kb ON kb.id = k.kabkota_id
             WHERE k.id = $1 AND k.deleted_at IS NULL",
            &[&id],
        )
        .await
        .map_err(internal)?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Kunjungan tidak ditemukan"))?;
    let events = c
        .query(
            "SELECT event, note, actor, to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI') FROM laporan_events
             WHERE jenis = 'mbg' AND laporan_id = $1 ORDER BY id DESC LIMIT 50",
            &[&id],
        )
        .await
        .map_err(internal)?;
    Ok(json!({
        "id": r.get::<_, i64>(0), "no_kunjungan": r.get::<_, String>(1), "status": r.get::<_, String>(2), "data": r.get::<_, Value>(3),
        "errors": r.get::<_, Value>(4), "created_by_name": r.get::<_, Option<String>>(5), "created_at": r.get::<_, Option<String>>(6),
        "updated_at": r.get::<_, Option<String>>(7), "submitted_at": r.get::<_, Option<String>>(8),
        "provinsi": r.get::<_, Option<String>>(9), "kabkota": r.get::<_, Option<String>>(10),
        "events": events.iter().map(|e| json!({ "event": e.get::<_, String>(0), "note": e.get::<_, Option<String>>(1), "actor": e.get::<_, Option<String>>(2), "at": e.get::<_, Option<String>>(3) })).collect::<Vec<_>>(),
        "forms": forms_json(c, id).await?,
    }))
}

async fn lampiran_json(c: &Db, id: i64, no: i16) -> Result<Vec<Value>, ApiError> {
    Ok(c.query(
        "SELECT id, item_key, judul, nama_file, tipe, ukuran, to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI') FROM mbg_lampiran
         WHERE kunjungan_id = $1 AND form_no = $2 ORDER BY id",
        &[&id, &no],
    )
    .await
    .map_err(internal)?
    .iter()
    .map(|l| {
        json!({ "id": l.get::<_, i64>(0), "item_key": l.get::<_, String>(1), "judul": l.get::<_, Option<String>>(2), "nama_file": l.get::<_, String>(3),
            "tipe": l.get::<_, String>(4), "ukuran": l.get::<_, i32>(5), "created_at": l.get::<_, Option<String>>(6) })
    })
    .collect())
}

async fn form_json(c: &Db, id: i64, no: i16) -> Result<Value, ApiError> {
    let r = c
        .query_opt(
            "SELECT id, status, data, errors, warnings, skor, kesimpulan, schema_version, created_by_name,
                    to_char(updated_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'), to_char(submitted_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI')
             FROM mbg_form WHERE kunjungan_id = $1 AND form_no = $2",
            &[&id, &no],
        )
        .await
        .map_err(internal)?;
    let form = match r {
        Some(r) => json!({ "id": r.get::<_, i64>(0), "form_no": no, "status": r.get::<_, String>(1), "data": r.get::<_, Value>(2), "errors": r.get::<_, Value>(3),
            "warnings": r.get::<_, Value>(4), "skor": r.get::<_, Option<f64>>(5), "kesimpulan": r.get::<_, Option<String>>(6), "schema_version": r.get::<_, i16>(7),
            "created_by_name": r.get::<_, Option<String>>(8), "updated_at": r.get::<_, Option<String>>(9), "submitted_at": r.get::<_, Option<String>>(10) }),
        None => {
            // not saved yet: evaluate an empty form so the wizard can show the issues (no row is created)
            let ev = evaluate_form(no, &Map::new(), &sources(c, id).await?);
            json!({ "id": null, "form_no": no, "status": "baru", "data": {}, "errors": ev.iss.errors, "warnings": ev.iss.warnings, "skor": null,
                "kesimpulan": null, "schema_version": SCHEMA_VERSION, "created_by_name": null, "updated_at": null, "submitted_at": null })
        }
    };
    Ok(json!({ "kunjungan": kunjungan_json(c, id).await?, "form": form, "lampiran": lampiran_json(c, id, no).await? }))
}

/// Evaluate + store one formulir (creates the row on first save). Server result goes into `data._hasil`.
async fn save_form(c: &Db, u: &AuthUser, id: i64, no: i16, mut d: Obj) -> Result<Eval, ApiError> {
    d.remove("_hasil");
    let ev = evaluate_form(no, &d, &sources(c, id).await?);
    d.insert("_hasil".into(), ev.hasil.clone());
    let data = Value::Object(d);
    let errors = Value::Array(ev.iss.errors.clone());
    let warnings = Value::Array(ev.iss.warnings.clone());
    c.execute(
        "INSERT INTO mbg_form (kunjungan_id, form_no, schema_version, data, errors, warnings, skor, kesimpulan, created_by, created_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (kunjungan_id, form_no) DO UPDATE SET schema_version = EXCLUDED.schema_version, data = EXCLUDED.data, errors = EXCLUDED.errors,
           warnings = EXCLUDED.warnings, skor = EXCLUDED.skor, kesimpulan = EXCLUDED.kesimpulan, updated_at = now()",
        &[&id, &no, &SCHEMA_VERSION, &data, &errors, &warnings, &ev.skor, &ev.kesimpulan, &u.id, &actor_name(u)],
    )
    .await
    .map_err(internal)?;
    c.execute("UPDATE mbg_kunjungan SET updated_at = now() WHERE id = $1", &[&id]).await.map_err(internal)?;
    Ok(ev)
}

/// F12/F13 follow their source forms: recompute the stored rekap after a source changed.
async fn refresh_rekap(c: &Db, id: i64, changed: i16) -> Result<(), ApiError> {
    let rekap: i16 = match changed {
        3..=9 => 12,
        10 | 11 => 13,
        _ => return Ok(()),
    };
    let row = c.query_opt("SELECT data FROM mbg_form WHERE kunjungan_id = $1 AND form_no = $2 AND status = 'draf'", &[&id, &rekap]).await.map_err(internal)?;
    if let Some(r) = row {
        let mut d = r.get::<_, Value>(0).as_object().cloned().unwrap_or_default();
        d.remove("_hasil");
        let ev = evaluate_form(rekap, &d, &sources(c, id).await?);
        d.insert("_hasil".into(), ev.hasil);
        c.execute(
            "UPDATE mbg_form SET data = $3, errors = $4, warnings = $5, kesimpulan = $6, updated_at = now() WHERE kunjungan_id = $1 AND form_no = $2 AND status = 'draf'",
            &[&id, &rekap, &Value::Object(d), &Value::Array(ev.iss.errors), &Value::Array(ev.iss.warnings), &ev.kesimpulan],
        )
        .await
        .map_err(internal)?;
    }
    Ok(())
}

// ─── handlers: kunjungan ──────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ListQuery {
    status: Option<String>,
    search: Option<String>,
    page: Option<i64>,
    per_page: Option<i64>,
}

pub async fn list(State(st): State<AppState>, Query(q): Query<ListQuery>) -> Result<Json<Value>, ApiError> {
    let c = st.pool.get().await.map_err(internal)?;
    let per_page = q.per_page.unwrap_or(20).clamp(1, 100);
    let page = q.page.unwrap_or(1).max(1);
    let off = (page - 1) * per_page;
    let status = q.status.clone().filter(|x| !x.is_empty() && x != "all");
    let search = q.search.as_ref().map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).map(|x| format!("%{x}%"));
    let rows = c
        .query(
            "SELECT k.id, k.no_kunjungan, k.status, k.nama_sppg, k.nama_pengawas, k.nama_tpg, k.puskesmas, kb.name, k.tanggal::text,
                    jsonb_array_length(k.errors), k.created_by_name, to_char(k.updated_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'), count(*) OVER (),
                    COALESCE(f.terkirim, 0), COALESCE(f.draf, 0), f.rekap12, f.rekap13, COALESCE(f.aspek_sesuai, 0), COALESCE(f.aspek_dinilai, 0)
             FROM mbg_kunjungan k
             LEFT JOIN master_kabkota kb ON kb.id = k.kabkota_id
             LEFT JOIN LATERAL (
               SELECT count(*) FILTER (WHERE status = 'dikirim') terkirim, count(*) FILTER (WHERE status = 'draf') draf,
                      max(kesimpulan) FILTER (WHERE form_no = 12 AND status = 'dikirim') rekap12,
                      max(kesimpulan) FILTER (WHERE form_no = 13 AND status = 'dikirim') rekap13,
                      count(*) FILTER (WHERE form_no BETWEEN 3 AND 11 AND status = 'dikirim' AND kesimpulan = 'Sesuai') aspek_sesuai,
                      count(*) FILTER (WHERE form_no BETWEEN 3 AND 11 AND status = 'dikirim' AND kesimpulan IS NOT NULL) aspek_dinilai
               FROM mbg_form WHERE kunjungan_id = k.id) f ON TRUE
             WHERE k.deleted_at IS NULL AND ($1::text IS NULL OR k.status = $1)
               AND ($2::text IS NULL OR k.no_kunjungan ILIKE $2 OR k.nama_sppg ILIKE $2 OR k.nama_pengawas ILIKE $2 OR k.nama_tpg ILIKE $2
                    OR k.puskesmas ILIKE $2 OR kb.name ILIKE $2)
             ORDER BY k.updated_at DESC LIMIT $3 OFFSET $4",
            &[&status, &search, &per_page, &off],
        )
        .await
        .map_err(internal)?;
    let total = rows.first().map(|r| r.get::<_, i64>(12)).unwrap_or(0);
    let data: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "id": r.get::<_, i64>(0), "no_kunjungan": r.get::<_, String>(1), "status": r.get::<_, String>(2), "nama_sppg": r.get::<_, Option<String>>(3),
                "nama_pengawas": r.get::<_, Option<String>>(4), "nama_tpg": r.get::<_, Option<String>>(5), "puskesmas": r.get::<_, Option<String>>(6),
                "kabkota": r.get::<_, Option<String>>(7), "tanggal": r.get::<_, Option<String>>(8), "error_count": r.get::<_, i32>(9),
                "created_by_name": r.get::<_, Option<String>>(10), "updated_at": r.get::<_, Option<String>>(11),
                "form_terkirim": r.get::<_, i64>(13), "form_draf": r.get::<_, i64>(14), "rekap_ketaatan": r.get::<_, Option<String>>(15),
                "rekap_daya_terima": r.get::<_, Option<String>>(16), "aspek_sesuai": r.get::<_, i64>(17), "aspek_dinilai": r.get::<_, i64>(18),
            })
        })
        .collect();
    let counts = c.query("SELECT status, count(*) FROM mbg_kunjungan WHERE deleted_at IS NULL GROUP BY 1", &[]).await.map_err(internal)?;
    let mut by = Map::new();
    for r in &counts {
        by.insert(r.get::<_, String>(0), json!(r.get::<_, i64>(1)));
    }
    Ok(Json(json!({ "success": true, "data": data, "total": total, "page": page, "per_page": per_page,
        "total_pages": ((total + per_page - 1) / per_page).max(1), "by_status": by })))
}

/// Auto-fill: Nama TPG from the logged-in account + puskesmas/wilayah from the user's latest visit.
pub async fn prefill(State(st): State<AppState>, u: Me) -> Result<Json<Value>, ApiError> {
    let u = me(&u)?;
    let c = st.pool.get().await.map_err(internal)?;
    let last = c
        .query_opt("SELECT data, no_kunjungan FROM mbg_kunjungan WHERE created_by = $1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1", &[&u.id])
        .await
        .map_err(internal)?;
    let mut keep = Map::new();
    let mut from: Option<String> = None;
    if let Some(r) = last {
        let d: Value = r.get(0);
        from = Some(r.get(1));
        for k in ["nama_tpg", "provinsi_id", "kabkota_id", "kecamatan", "kecamatan_nama", "unit_pelapor", "unit_kode"] {
            if let Some(v) = d.get(k).filter(|v| !v.is_null()) {
                keep.insert(k.into(), v.clone());
            }
        }
    }
    Ok(Json(json!({ "success": true, "data": { "nama": actor_name(&u), "last": keep, "last_no": from } })))
}

#[derive(Deserialize)]
pub struct DataBody {
    data: Value,
}

fn identitas_body(b: &DataBody) -> Result<Obj, ApiError> {
    let mut d = b.data.as_object().cloned().ok_or_else(|| bad_request("Data identitas tidak valid"))?;
    d.insert("jenis_unit".into(), json!("Puskesmas"));
    Ok(d)
}

pub async fn create(State(st): State<AppState>, u: Me, Json(b): Json<DataBody>) -> Result<(StatusCode, Json<Value>), ApiError> {
    let u = me(&u)?;
    let d = identitas_body(&b)?;
    let c = st.pool.get().await.map_err(internal)?;
    let no = next_no(&c).await?;
    let r = c
        .query_one("INSERT INTO mbg_kunjungan (no_kunjungan, created_by, created_by_name) VALUES ($1, $2, $3) RETURNING id", &[&no, &u.id, &actor_name(&u)])
        .await
        .map_err(internal)?;
    let id: i64 = r.get(0);
    let iss = identitas_issues(&c, &d).await?;
    persist_kunjungan(&c, id, &d, &iss).await?;
    event(&c, id, "dibuat", None, &actor_name(&u)).await?;
    Ok((StatusCode::CREATED, Json(json!({ "success": true, "data": kunjungan_json(&c, id).await? }))))
}

pub async fn update(State(st): State<AppState>, Path(id): Path<i64>, Json(b): Json<DataBody>) -> Result<Json<Value>, ApiError> {
    let d = identitas_body(&b)?;
    let c = st.pool.get().await.map_err(internal)?;
    editable(&c, id).await?;
    let iss = identitas_issues(&c, &d).await?;
    persist_kunjungan(&c, id, &d, &iss).await?;
    Ok(Json(json!({ "success": true, "data": kunjungan_json(&c, id).await? })))
}

pub async fn get_one(State(st): State<AppState>, Path(id): Path<i64>) -> Result<Json<Value>, ApiError> {
    let c = st.pool.get().await.map_err(internal)?;
    Ok(Json(json!({ "success": true, "data": kunjungan_json(&c, id).await? })))
}

/// Kirim kunjungan: identitas valid + 13 formulir terkirim (422 with the record otherwise).
pub async fn kirim(State(st): State<AppState>, u: Me, Path(id): Path<i64>) -> Result<Response, ApiError> {
    let u = me(&u)?;
    let c = st.pool.get().await.map_err(internal)?;
    editable(&c, id).await?;
    let d: Value = c.query_one("SELECT data FROM mbg_kunjungan WHERE id = $1", &[&id]).await.map_err(internal)?.get(0);
    let d = d.as_object().cloned().unwrap_or_default();
    let iss = identitas_issues(&c, &d).await?;
    persist_kunjungan(&c, id, &d, &iss).await?;
    let src = sources(&c, id).await?;
    let belum: Vec<String> =
        (1..=13i16).filter(|f| !src.iter().any(|x| x.0 == *f && x.1.as_deref() == Some("dikirim"))).map(|f| f.to_string()).collect();
    if !iss.errors.is_empty() || !belum.is_empty() {
        let msg = if !iss.errors.is_empty() {
            format!("Identitas kunjungan masih ada {} isian yang belum valid", iss.errors.len())
        } else {
            format!("Formulir belum dikirim: {}", belum.join(", "))
        };
        return Ok((StatusCode::UNPROCESSABLE_ENTITY, Json(json!({ "success": false, "error": msg, "data": kunjungan_json(&c, id).await? }))).into_response());
    }
    let n = c
        .execute("UPDATE mbg_kunjungan SET status = 'dikirim', submitted_at = now(), updated_at = now() WHERE id = $1 AND status = 'draf'", &[&id])
        .await
        .map_err(internal)?;
    if n == 0 {
        return Err(err(StatusCode::CONFLICT, "Kunjungan sudah dikirim."));
    }
    event(&c, id, "dikirim", None, &actor_name(&u)).await?;
    Ok(Json(json!({ "success": true, "data": kunjungan_json(&c, id).await? })).into_response())
}

/// Soft delete, drafts only (formulir & lampiran ikut tersembunyi bersama kunjungan).
pub async fn remove(State(st): State<AppState>, u: Me, Path(id): Path<i64>) -> Result<Json<Value>, ApiError> {
    let u = me(&u)?;
    let c = st.pool.get().await.map_err(internal)?;
    let n = c
        .execute("UPDATE mbg_kunjungan SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL AND status = 'draf'", &[&id])
        .await
        .map_err(internal)?;
    if n == 0 {
        return Err(err(StatusCode::CONFLICT, "Hanya kunjungan berstatus Draf yang dapat dihapus."));
    }
    event(&c, id, "dihapus", None, &actor_name(&u)).await?;
    Ok(Json(json!({ "success": true, "data": { "id": id, "deleted": true } })))
}

// ─── handlers: formulir ───────────────────────────────────────────────────────

pub async fn form_get(State(st): State<AppState>, Path((id, no)): Path<(i64, i16)>) -> Result<Json<Value>, ApiError> {
    let no = form_no(no)?;
    let c = st.pool.get().await.map_err(internal)?;
    Ok(Json(json!({ "success": true, "data": form_json(&c, id, no).await? })))
}

async fn form_status(c: &Db, id: i64, no: i16) -> Result<Option<String>, ApiError> {
    Ok(c.query_opt("SELECT status FROM mbg_form WHERE kunjungan_id = $1 AND form_no = $2", &[&id, &no]).await.map_err(internal)?.map(|r| r.get(0)))
}

pub async fn form_save(State(st): State<AppState>, u: Me, Path((id, no)): Path<(i64, i16)>, Json(b): Json<DataBody>) -> Result<Json<Value>, ApiError> {
    let no = form_no(no)?;
    let u = me(&u)?;
    let d = b.data.as_object().cloned().ok_or_else(|| bad_request("Data formulir tidak valid"))?;
    let c = st.pool.get().await.map_err(internal)?;
    editable(&c, id).await?;
    if form_status(&c, id, no).await?.as_deref() == Some("dikirim") {
        return Err(err(StatusCode::CONFLICT, "Formulir yang sudah dikirim tidak dapat diubah. Buka kembali dulu dari halaman kunjungan."));
    }
    save_form(&c, &u, id, no, d).await?;
    refresh_rekap(&c, id, no).await?;
    Ok(Json(json!({ "success": true, "data": form_json(&c, id, no).await? })))
}

pub async fn form_kirim(State(st): State<AppState>, u: Me, Path((id, no)): Path<(i64, i16)>) -> Result<Response, ApiError> {
    let no = form_no(no)?;
    let u = me(&u)?;
    let c = st.pool.get().await.map_err(internal)?;
    editable(&c, id).await?;
    let row = c.query_opt("SELECT status, data FROM mbg_form WHERE kunjungan_id = $1 AND form_no = $2", &[&id, &no]).await.map_err(internal)?;
    let d = match &row {
        Some(r) if r.get::<_, String>(0) == "dikirim" => return Err(err(StatusCode::CONFLICT, "Formulir sudah dikirim.")),
        Some(r) => r.get::<_, Value>(1).as_object().cloned().unwrap_or_default(),
        None => Map::new(),
    };
    let ev = save_form(&c, &u, id, no, d).await?;
    if !ev.iss.errors.is_empty() || ev.kesimpulan.is_none() {
        let msg = format!("Masih ada {} isian yang belum valid", ev.iss.errors.len().max(1));
        return Ok((StatusCode::UNPROCESSABLE_ENTITY, Json(json!({ "success": false, "error": msg, "data": form_json(&c, id, no).await? }))).into_response());
    }
    c.execute("UPDATE mbg_form SET status = 'dikirim', submitted_at = now(), updated_at = now() WHERE kunjungan_id = $1 AND form_no = $2", &[&id, &no])
        .await
        .map_err(internal)?;
    refresh_rekap(&c, id, no).await?;
    event(&c, id, "form_dikirim", Some(format!("Formulir {no}")), &actor_name(&u)).await?;
    Ok(Json(json!({ "success": true, "data": form_json(&c, id, no).await? })).into_response())
}

/// Buka kembali formulir terkirim (selama kunjungan masih draf). Rekap F12/F13 yang bergantung ikut kembali ke draf.
pub async fn form_buka(State(st): State<AppState>, u: Me, Path((id, no)): Path<(i64, i16)>) -> Result<Json<Value>, ApiError> {
    let no = form_no(no)?;
    let u = me(&u)?;
    let c = st.pool.get().await.map_err(internal)?;
    editable(&c, id).await?;
    let reopen = "UPDATE mbg_form SET status = 'draf', submitted_at = NULL, updated_at = now() WHERE kunjungan_id = $1 AND form_no = $2 AND status = 'dikirim'";
    if c.execute(reopen, &[&id, &no]).await.map_err(internal)? == 0 {
        return Err(err(StatusCode::CONFLICT, "Formulir belum dikirim."));
    }
    event(&c, id, "form_dibuka", Some(format!("Formulir {no}")), &actor_name(&u)).await?;
    let rekap: Option<i16> = match no {
        3..=9 => Some(12),
        10 | 11 => Some(13),
        _ => None,
    };
    if let Some(r) = rekap {
        if c.execute(reopen, &[&id, &r]).await.map_err(internal)? > 0 {
            event(&c, id, "form_dibuka", Some(format!("Formulir {r} (ikut Formulir {no})")), &actor_name(&u)).await?;
        }
        refresh_rekap(&c, id, no).await?;
    }
    Ok(Json(json!({ "success": true, "data": form_json(&c, id, no).await? })))
}

// ─── lampiran (bukti dokumen/foto per formulir & item) ────────────────────────

#[derive(Deserialize)]
pub struct LampQuery {
    form: Option<i16>,
    item: Option<String>,
    nama: Option<String>,
    judul: Option<String>,
}

fn clean_name(x: &str) -> String {
    let base = x.rsplit(['/', '\\']).next().unwrap_or(x);
    base.chars().filter(|c| !c.is_control() && *c != '"').take(160).collect::<String>().trim().to_string()
}
fn clean_item(x: &str) -> String {
    x.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_').take(40).collect()
}

pub async fn lampiran_upload(
    State(st): State<AppState>, u: Me, Path(id): Path<i64>, Query(q): Query<LampQuery>, headers: HeaderMap, body: Bytes,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let u = me(&u)?;
    let no = form_no(q.form.unwrap_or(0))?;
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
    let item = clean_item(q.item.as_deref().unwrap_or(""));
    let nama = clean_name(q.nama.as_deref().unwrap_or("lampiran"));
    let judul = q.judul.as_deref().map(|x| x.trim().chars().take(200).collect::<String>()).filter(|x| !x.is_empty()).unwrap_or_else(|| nama.clone());
    let c = st.pool.get().await.map_err(internal)?;
    editable(&c, id).await?;
    if form_status(&c, id, no).await?.as_deref() == Some("dikirim") {
        return Err(err(StatusCode::CONFLICT, "Formulir yang sudah dikirim tidak dapat diubah."));
    }
    let size = body.len() as i32;
    let r = c
        .query_one(
            "INSERT INTO mbg_lampiran (kunjungan_id, form_no, item_key, judul, nama_file, tipe, ukuran, isi, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id",
            &[&id, &no, &item, &judul, &nama, &tipe, &size, &body.to_vec(), &u.id],
        )
        .await
        .map_err(internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "success": true, "data": { "id": r.get::<_, i64>(0), "item_key": item, "judul": judul, "nama_file": nama, "tipe": tipe, "ukuran": size } }))))
}

pub async fn lampiran_get(State(st): State<AppState>, Path((id, lid)): Path<(i64, i64)>) -> Result<Response, ApiError> {
    let c = st.pool.get().await.map_err(internal)?;
    let r = c
        .query_opt(
            "SELECT l.nama_file, l.tipe, l.isi FROM mbg_lampiran l JOIN mbg_kunjungan k ON k.id = l.kunjungan_id
             WHERE l.id = $1 AND l.kunjungan_id = $2 AND k.deleted_at IS NULL",
            &[&lid, &id],
        )
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

pub async fn lampiran_delete(State(st): State<AppState>, Path((id, lid)): Path<(i64, i64)>) -> Result<Json<Value>, ApiError> {
    let c = st.pool.get().await.map_err(internal)?;
    editable(&c, id).await?;
    let n = c
        .execute(
            "DELETE FROM mbg_lampiran l WHERE l.id = $1 AND l.kunjungan_id = $2
               AND NOT EXISTS (SELECT 1 FROM mbg_form f WHERE f.kunjungan_id = l.kunjungan_id AND f.form_no = l.form_no AND f.status = 'dikirim')",
            &[&lid, &id],
        )
        .await
        .map_err(internal)?;
    if n == 0 {
        return Err(err(StatusCode::CONFLICT, "Lampiran tidak ditemukan atau formulirnya sudah dikirim"));
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
    fn spec(no: i16) -> &'static CekSpec {
        CEK.iter().find(|c| c.no == no).unwrap()
    }

    #[test]
    fn identitas_rules() {
        let k = keys(&validate_identitas(&obj(json!({})), d("2026-11-10")).errors);
        for want in ["nama_tpg", "provinsi_id", "kabkota_id", "unit_pelapor", "nama_sppg", "nama_pengawas", "tanggal"] {
            assert!(k.contains(&want.to_string()), "missing {want}");
        }
        let ok = obj(json!({ "nama_tpg": "TPG A", "provinsi_id": 1, "kabkota_id": 2, "unit_pelapor": "PKM A", "nama_sppg": "SPPG 1",
            "nama_pengawas": "Ani", "tanggal": "2026-11-10" }));
        assert!(validate_identitas(&ok, d("2026-11-10")).errors.is_empty());
        let mut f = ok.clone();
        f.insert("tanggal".into(), json!("2026-11-11"));
        assert_eq!(keys(&validate_identitas(&f, d("2026-11-10")).errors), vec!["tanggal".to_string()]);
    }

    #[test]
    fn checklist_score_and_kesimpulan() {
        // F4: 13 unique items (duplicate rows 1.2/1.1/1.2 are not part of the form) → 11/13 = 84.6 → Sesuai
        let mut m = Map::new();
        for k in 1..=13 {
            m.insert(format!("i{k}"), json!(if k <= 11 { SESUAI } else { TIDAK }));
        }
        let e = validate_cek(spec(4), &m);
        let k = keys(&e.iss.errors);
        assert!(k.contains(&"i12_ket".to_string()) && k.contains(&"rek1".to_string()), "{k:?}");
        assert_eq!(e.skor, Some(84.6));
        assert_eq!(e.kesimpulan.as_deref(), Some(SESUAI));
        m.insert("i12_ket".into(), json!("x"));
        m.insert("i13_ket".into(), json!("y"));
        m.insert("rek1".into(), json!("Perbaiki z"));
        assert!(validate_cek(spec(4), &m).iss.errors.is_empty());
        // F7: 5 items divided by 5 (naskah wrote /4) — 4/5 = 80 → Sesuai
        let mut f7 = Map::new();
        for k in 1..=5 {
            f7.insert(format!("i{k}"), json!(if k < 5 { SESUAI } else { TIDAK }));
        }
        let e = validate_cek(spec(7), &f7);
        assert_eq!(e.skor, Some(80.0));
        assert_eq!(e.kesimpulan.as_deref(), Some(SESUAI));
        // incomplete: score shown, kesimpulan not decided yet
        let e = validate_cek(spec(5), &obj(json!({ "i1": SESUAI })));
        assert_eq!(e.kesimpulan, None);
        assert_eq!(keys(&e.iss.errors).len(), 7);
        // F3 allergy note (not scored) + follow-up
        let mut f3 = Map::new();
        for k in 1..=10 {
            f3.insert(format!("i{k}"), json!(SESUAI));
        }
        f3.insert("alergi".into(), json!("Ya"));
        assert_eq!(keys(&validate_cek(spec(3), &f3).iss.errors), vec!["alergi_detail".to_string()]);
        // F6 3/9 sesuai → 33.3 → Tidak Sesuai
        let mut f6 = Map::new();
        for k in 1..=9 {
            f6.insert(format!("i{k}"), json!(if k <= 3 { SESUAI } else { TIDAK }));
            f6.insert(format!("i{k}_ket"), json!("cek"));
        }
        f6.insert("rek1".into(), json!("x"));
        let e = validate_cek(spec(6), &f6);
        assert_eq!((e.skor, e.kesimpulan.as_deref()), (Some(33.3), Some(TIDAK)));
    }

    #[test]
    fn daya_terima_samples() {
        let mut m = obj(json!({ "nama_sekolah": "SDN 1", "nama_guru": "Bu A", "i1": SESUAI, "i2": SESUAI }));
        for k in 3..=7u8 {
            // item 7: only 2 of 5 samples < 20% → Tidak Sesuai
            let vals = if k == 7 { [10, 50, 30, 15, 40] } else { [5, 10, 25, 0, 30] };
            for (x, v) in vals.iter().enumerate() {
                m.insert(format!("sisa_i{k}_{}", x + 1), json!(v));
            }
        }
        assert_eq!(sisa_item(&m, 3).0, Some(SESUAI));
        assert_eq!(sisa_item(&m, 7).0, Some(TIDAK));
        let e = validate_cek(spec(10), &m);
        assert_eq!(e.skor, Some(85.7));
        assert_eq!(keys(&e.iss.errors), vec!["rek1".to_string()]); // computed items need no keterangan
        m.insert("sisa_i4_2".into(), json!(120));
        m.remove("sisa_i5_5");
        let k = keys(&validate_cek(spec(10), &m).iss.errors);
        assert!(k.contains(&"i4".to_string()) && k.contains(&"i5".to_string()));
        // F11 needs the posyandu header (not sekolah/guru)
        let k = keys(&validate_cek(spec(11), &Map::new()).iss.errors);
        assert!(k.contains(&"nama_posyandu".to_string()) && k.contains(&"nama_kader".to_string()));
        assert!(!k.contains(&"nama_sekolah".to_string()));
    }

    #[test]
    fn pemorsian_dynamic_sasaran() {
        let mut m = obj(json!({ "sasaran": [{ "id": "a", "nama": "Balita" }, { "id": "b", "nama": "Anak Usia SMP" }, { "id": "c", "nama": "Ibu Hamil" },
            { "id": "d", "nama": "Anak Usia SMA" }] }));
        for k in 1..=6 {
            for id in ["a", "b", "c", "d"] {
                m.insert(format!("i{k}_{id}"), json!(if k == 6 && id == "d" { TIDAK } else { SESUAI }));
            }
        }
        let e = validate_f9(&m);
        // item 6 Tidak Sesuai (one sasaran) → 5/6 = 83.3 → Sesuai; keterangan + rekomendasi required
        assert_eq!(e.skor, Some(83.3));
        assert_eq!(e.kesimpulan.as_deref(), Some(SESUAI));
        assert_eq!(keys(&e.iss.errors), vec!["i6_ket".to_string(), "rek1".to_string()]);
        assert_eq!(e.hasil["sel_total"], json!(24));
        assert_eq!(e.hasil["sel_sesuai"], json!(23));
        m.remove("i2_c");
        assert!(keys(&validate_f9(&m).iss.errors).contains(&"i2".to_string()));
        let k = keys(&validate_f9(&obj(json!({ "sasaran": [] }))).iss.errors);
        assert_eq!(k, vec!["sasaran".to_string()]);
    }

    #[test]
    fn ketenagaan_rules() {
        assert_eq!(ambang_penjamah(false, Some(100.0)), 47);
        assert_eq!(ambang_penjamah(true, Some(100.0)), 15);
        assert_eq!(ambang_penjamah(true, Some(250.0)), 18);
        assert_eq!(ambang_penjamah(true, Some(600.0)), 21);
        assert_eq!(ambang_penjamah(true, Some(999.0)), 25);
        assert_eq!(ambang_penjamah(true, Some(1500.0)), 47);
        let base = json!({ "a1_r1": 0, "a1_r2": 0, "a1_r3": 1, "a1_r4": 0, "a1_r5": 0, "a1_r6": 0, "a1_r7": 0, "a2_p1": "Sudah", "a2_p2": "Sudah",
            "b1_r1": 2, "b1_r2": 3, "b1_r3": 5, "b1_r4": 0, "b1_r5": 10, "wilayah_3t": "Ya", "penerima": 300,
            "b2_p1_belum": 10, "b2_p1_sudah": 10, "b2_p2_belum": 20, "b2_p2_sudah": 0, "b2_p3_belum": 20, "b2_p3_sudah": 0 });
        let e = validate_f1(&obj(base.clone()));
        assert!(e.iss.errors.is_empty(), "{:?}", e.iss.errors);
        assert_eq!(e.kesimpulan.as_deref(), Some(SESUAI)); // 20 ≥ 18 (3T, 250–500), 10/20 = 50%
        let mut b = obj(base);
        b.insert("wilayah_3t".into(), json!("Tidak"));
        b.insert("a1_r3".into(), json!(0));
        b.insert("a1_r7".into(), json!(1));
        b.insert("b2_p1_sudah".into(), json!(9));
        let e = validate_f1(&b);
        assert_eq!(e.hasil["a1"], json!(TIDAK)); // Lainnya is not a qualifying education (rows 1–6)
        assert_eq!(e.hasil["b1"], json!(TIDAK)); // 20 < 47
        assert_eq!(e.hasil["b2"], json!(TIDAK)); // 9 < 50% of 20
        assert_eq!(e.kesimpulan.as_deref(), Some(TIDAK));
        let k = keys(&e.iss.errors);
        for want in ["a1_r7_jenis", "rekA1", "rekB1"] {
            assert!(k.contains(&want.to_string()), "missing {want}: {k:?}");
        }
        let k = keys(&validate_f1(&Map::new()).iss.errors);
        for want in ["a1_r1", "a2_p1", "b1_r5", "wilayah_3t", "b2_p3_sudah"] {
            assert!(k.contains(&want.to_string()), "missing {want}");
        }
        assert!(!k.contains(&"penerima".to_string()));
    }

    #[test]
    fn sop_rules() {
        let mut m = Map::new();
        for r in 1..=F2_A {
            m.insert(format!("a{r}"), json!(SESUAI));
        }
        for r in 1..=F2_B {
            m.insert(format!("b{r}_sos"), json!("Sudah"));
            for b in F2_BUKTI {
                m.insert(format!("b{r}_{b}"), json!(true));
            }
            m.insert(format!("b{r}"), json!(SESUAI));
        }
        let e = validate_f2(&m);
        assert!(e.iss.errors.is_empty() && e.iss.warnings.is_empty());
        assert_eq!(e.kesimpulan.as_deref(), Some(SESUAI));
        m.insert("b8_hadir".into(), json!(false));
        assert_eq!(f2_saran(&m, 8), Some(TIDAK));
        assert_eq!(keys(&validate_f2(&m).iss.warnings), vec!["b8".to_string()]);
        m.insert("b8".into(), json!(TIDAK));
        let e = validate_f2(&m);
        assert_eq!(e.kesimpulan.as_deref(), Some(TIDAK));
        assert_eq!(keys(&e.iss.errors), vec!["rek1".to_string()]);
        m.insert("a3".into(), json!(TIDAK));
        assert!(keys(&validate_f2(&m).iss.errors).contains(&"a3_ket".to_string()));
    }

    #[test]
    fn rekap_rules() {
        let all: Vec<Source> = (3..=9).map(|f| (f, Some("dikirim".to_string()), Some(SESUAI.to_string()))).collect();
        let e = validate_rekap(12, &Map::new(), &all);
        assert!(e.iss.errors.is_empty());
        assert_eq!(e.kesimpulan.as_deref(), Some("BAIK"));
        let mut some = all.clone();
        some[2].2 = Some(TIDAK.into());
        assert_eq!(validate_rekap(12, &Map::new(), &some).kesimpulan.as_deref(), Some("BELUM BAIK"));
        some[0].1 = Some("draf".into());
        let e = validate_rekap(12, &Map::new(), &some);
        assert_eq!(e.kesimpulan, None);
        assert_eq!(keys(&e.iss.errors), vec!["f3".to_string()]);
        let e = validate_rekap(13, &Map::new(), &[(10, Some("dikirim".into()), Some(SESUAI.into()))]);
        assert_eq!(keys(&e.iss.errors), vec!["f11".to_string()]);
        assert!(form_no(14).is_err() && form_no(0).is_err() && form_no(13).is_ok());
        assert_eq!(clean_item("i3; DROP"), "i3DROP");
    }
}
