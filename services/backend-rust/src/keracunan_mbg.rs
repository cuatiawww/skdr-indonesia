//! PR 034: Keracunan Pangan MBG — laporan kejadian keracunan pangan Program Makan Bergizi Gratis (padanan /form-mbg SKDR Kemkes:
//! 113 isian di 6 tab) sebagai wizard 6 langkah. Semua isian resmi tetap ada (paritas data) di `data` (JSONB), disusun ulang:
//!   s1 Laporan Cepat · s2 Kasus & Gejala · s3 Menu & Penanganan · s4 Kesehatan Lingkungan · s5 Laboratorium · s6 Lampiran & Kirim.
//! * Laporan cepat: KIRIM (status `dilaporkan`) cukup dengan isian wajib resmi (tanggal kejadian, provinsi, jumlah kasus,
//!   jumlah meninggal) dan tanpa isian yang tidak valid; langkah lain boleh dilengkapi sesudahnya (tetap divalidasi).
//! * Dihitung server (`data._hasil`): attack rate (kasus/terpapar), CFR (meninggal/kasus), penyebut terpapar (isian atau total porsi
//!   sekolah), saran masa inkubasi (jam makan → jam mulai gejala), total petugas SPPG, % penjamah tersertifikasi, status lab
//!   (belum/dikirim/hasil). Pemeriksaan silang (jenis kelamin, kelompok umur, status pasien vs jumlah kasus) = peringatan saja.
//! * Update kasus harian (`mbg_keracunan_update`, satu baris per tanggal) — angka tanggal terbaru menjadi total kejadian.
//! * Tutup kejadian (kesimpulan wajib) / buka kembali. Hapus hanya draf (soft delete). Tidak ada pengiriman ke sistem eksternal.
//! Akses (auth::classify): baca = `tatakelola`, tulis = `pe_input` (sama dengan Pengawasan Gizi MBG).
use axum::{
    body::{Body, Bytes},
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::{Datelike, NaiveDate, NaiveDateTime};
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

/// Opsi "Tanda Gejala" SKDR Kemkes (18).
pub const GEJALA: [&str; 18] = [
    "Cynocis/Kebiruan", "Demam", "Diare", "Gangguan Penglihatan", "Gatal", "Kemerahan pada wajah", "Lemah", "Menggigil", "Mual", "Muntah",
    "Nyeri Tenggorok", "Perut Kembung", "Perut Melilit", "Pingsan", "Pusing", "Sakit Kepala", "Sakit Perut", "Sesak Napas",
];
/// Opsi "Keterangan" SOP SKDR Kemkes (26) — semua tampil sebagai baris tetap.
pub const SOP: [&str; 26] = [
    "Pemorsian makanan", "Pendistribusian makanan", "Penerimaan bahan baku", "Pengolahan makanan", "Penyiapan bahan baku", "Penyimpanan bahan baku",
    "Penyimpanan/pendinginan makanan", "SOP Distribusi Makanan Ke Lokasi Sasaran", "SOP Higiene dan Pemeriksaan Kesehatan Personal", "SOP Keselamatan kerja",
    "SOP Pemeliharaan Peralatan dan Bangunan", "SOP Pemorsian makanan sesuai dengan kelompok sasaran", "SOP Penanganan Limbah",
    "SOP Penanggulangan KLB keracunan pangan di puskesmas", "SOP Penerimaan dan pemeriksaan bahan pangan",
    "SOP Pengendalian Serangga, Hewan Pengerat, dan Hewan Peliharaan", "SOP Penggunaan loker", "SOP Pengolahan", "SOP Penyimpanan bahan pangan dan ingredient",
    "SOP penyimpanan kemasan dan bahan kimia", "SOP Penyimpanan makanan dan sampel makanan", "SOP Persiapan Bahan Pangan", "SOP Sanitasi Fasilitas dan Ruangan.",
    "SOP Sanitasi Peralatan", "SOP Standar Gizi", "SOP Tindakan Apabila Terjadi Keracunan Makanan",
];
pub const SUMBER_AIR: [&str; 6] = ["Air Isi Ulang", "Mata Air", "PDAM", "Penampungan Air Hujan", "Sumur Bor", "Sumur gali"];
pub const SAMPEL_KATEGORI: [&str; 5] = ["Air", "Feses", "Muntahan", "Pangan", "Swab/Usap"];
pub const HASIL_LAB: [&str; 3] = ["Positif", "Negatif", "Belum"];
const YA_TIDAK: [&str; 2] = ["Ya", "Tidak"];
/// Petugas SPPG (field 52–60); total (51) = jumlah otomatis.
pub const PETUGAS: [&str; 9] = ["pt_kepala", "pt_ahli_gizi", "pt_akuntan", "pt_asisten", "pt_masak", "pt_porsi", "pt_sopir", "pt_cuci", "pt_security"];
pub const USIA: [(&str, &str); 5] = [("usia_lt5", "Usia <5"), ("usia_5_9", "Usia 5-9"), ("usia_10_14", "Usia 10-14"), ("usia_15_19", "Usia 15-19"), ("usia_gt19", "Usia >19")];

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
fn filled_v(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::String(v)) => !v.trim().is_empty(),
        _ => true,
    }
}
fn filled(d: &Obj, k: &str) -> bool {
    filled_v(d.get(k))
}
/// whole number ≥ 0 when filled with a valid value
fn cnt(d: &Obj, k: &str) -> Option<i64> {
    num(d.get(k)).filter(|x| *x >= 0.0 && x.fract() == 0.0).map(|x| x as i64)
}
fn int(d: &Obj, k: &str) -> Option<i32> {
    num(d.get(k)).map(|f| f as i32)
}
pub fn parse_dt(x: &str) -> Option<NaiveDateTime> {
    let x = x.trim();
    for f in ["%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"] {
        if let Ok(t) = NaiveDateTime::parse_from_str(x, f) {
            return Some(t);
        }
    }
    NaiveDate::parse_from_str(x, "%Y-%m-%d").ok().and_then(|d| d.and_hms_opt(0, 0, 0))
}
fn dt(d: &Obj, k: &str) -> Option<NaiveDateTime> {
    d.get(k).and_then(|v| v.as_str()).and_then(parse_dt)
}
fn rows<'a>(d: &'a Obj, k: &str) -> Vec<&'a Obj> {
    d.get(k).and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_object()).collect()).unwrap_or_default()
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
    /// whole number ≥ 0; Some(value) when valid
    fn count(&mut self, d: &Obj, step: &str, key: &str, label: &str, required: bool) -> Option<i64> {
        if !filled(d, key) {
            if required {
                self.e(step, key, &format!("{label} wajib diisi (isi 0 bila tidak ada)"));
            }
            return None;
        }
        match cnt(d, key) {
            Some(x) => Some(x),
            None => {
                self.e(step, key, &format!("{label} harus bilangan bulat ≥ 0"));
                None
            }
        }
    }
    fn dec(&mut self, d: &Obj, step: &str, key: &str, label: &str, min: f64, max: f64) -> Option<f64> {
        if !filled(d, key) {
            return None;
        }
        match num(d.get(key)) {
            Some(x) if (min..=max).contains(&x) => Some(x),
            _ => {
                self.e(step, key, &format!("{label} harus angka {min}–{max}"));
                None
            }
        }
    }
    fn choice(&mut self, d: &Obj, step: &str, key: &str, label: &str, allowed: &[&str]) {
        if let Some(v) = s(d, key) {
            if !allowed.contains(&v.as_str()) {
                self.e(step, key, &format!("{label}: pilihan tidak valid"));
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
    fn datetime(&mut self, d: &Obj, step: &str, key: &str, label: &str, today: NaiveDate) -> Option<NaiveDateTime> {
        if !filled(d, key) {
            return None;
        }
        match dt(d, key) {
            None => {
                self.e(step, key, &format!("{label}: format tanggal/jam tidak valid"));
                None
            }
            Some(t) if t.date() > today => {
                self.e(step, key, &format!("{label} tidak boleh di masa depan"));
                None
            }
            Some(t) => Some(t),
        }
    }
}

const TEXT_200: [(&str, &str, &str); 14] = [
    ("s1", "pelapor_nama", "Petugas pelapor"), ("s1", "pelapor_email", "Email pelapor"), ("s1", "desa", "Desa"), ("s1", "nama_sppg", "SPPG"),
    ("s1", "yayasan_sppg", "Yayasan SPPG"), ("s1", "kode_sppg", "Kode SPPG"), ("s3", "menu_karbo", "Karbohidrat"), ("s3", "menu_protein1", "Protein 1"),
    ("s3", "menu_protein2", "Protein 2"), ("s3", "menu_sayur", "Sayur"), ("s3", "menu_buah", "Buah"), ("s3", "faskes", "Faskes penanganan kasus"),
    ("s4", "angkut_lain", "Kendaraan lain"), ("s5", "lab_nama", "Laboratorium"),
];
const TEXT_500: [(&str, &str, &str); 25] = [
    ("s3", "diagnosa_banding", "Diagnosa banding"), ("s4", "bangunan_gambar", "Gambar umum"), ("s4", "bangunan_tata_letak", "Tata letak"),
    ("s4", "cuci_tempat", "Tempat pencucian peralatan"), ("s4", "cuci_proses", "Proses pencucian peralatan"), ("s4", "cuci_pengeringan", "Pengeringan peralatan"),
    ("s4", "penjamah_kesehatan", "Kondisi kesehatan penjamah"), ("s4", "penjamah_pemeriksaan", "Pemeriksaan kesehatan rutin penjamah"),
    ("s4", "penjamah_apd", "Kepatuhan penggunaan APD"), ("s4", "bahan_supplier", "Supplier bahan pangan"), ("s4", "bahan_kondisi", "Kondisi bahan pangan"),
    ("s4", "simpan_jenis", "Jenis bahan pangan yang disimpan"), ("s4", "simpan_pemisahan", "Pemisahan penyimpanan"), ("s4", "simpan_keadaan", "Keadaan tempat penyimpanan"),
    ("s4", "simpan_wadah", "Wadah bahan pangan"), ("s4", "angkut_kebersihan", "Kondisi kebersihan alat pengangkutan"),
    ("s4", "angkut_frekuensi", "Frekuensi pembersihan alat pengangkutan"), ("s4", "cara_olah", "Cara pengolahan"), ("s4", "sampah_jarak", "Jarak tempat sampah"),
    ("s4", "saluran_limbah", "Keadaan saluran limbah"), ("s4", "limbah_meningkat", "Limbah sisa makanan pada hari kejadian"),
    ("s4", "aduan_kondisi", "Kondisi pangan yang tidak sesuai"), ("s4", "aduan_alur", "Alur pengaduan"), ("s4", "aduan_kompensasi", "Kompensasi"),
    ("s6", "catatan", "Catatan"),
];
const YA_TIDAK_KEYS: [(&str, &str); 8] = [
    ("slhs", "Sertifikasi SLHS-SPPG"), ("angkut_box_sekat", "Mobil box dengan sekat"), ("angkut_box_tanpa", "Mobil box tanpa sekat"), ("angkut_motor", "Motor"),
    ("angkut_lain_status", "Status kendaraan lain"), ("bank_sampel", "Bank sampel makanan"), ("limbah_pencatatan", "Pencatatan limbah sisa makanan harian"),
    ("aduan_hari_h", "Pengaduan dari sekolah pada hari H"),
];

/// Values computed from the data (also stored in `data._hasil`).
#[derive(Debug, Clone, PartialEq)]
pub struct Hasil {
    pub kasus: Option<i64>,
    pub meninggal: Option<i64>,
    pub terpapar: Option<i64>,
    /// "isian" (Jumlah terpapar) or "porsi" (total porsi sekolah)
    pub terpapar_sumber: Option<&'static str>,
    pub ar: Option<f64>,
    pub cfr: Option<f64>,
    pub inkubasi_saran: Option<f64>,
    pub total_petugas: Option<i64>,
    pub pct_penjamah: Option<f64>,
    pub lab_status: &'static str,
    pub sekolah: usize,
}
impl Hasil {
    pub fn json(&self) -> Value {
        json!({ "kasus": self.kasus, "meninggal": self.meninggal, "terpapar": self.terpapar, "terpapar_sumber": self.terpapar_sumber, "ar": self.ar,
            "cfr": self.cfr, "inkubasi_saran": self.inkubasi_saran, "total_petugas": self.total_petugas, "pct_penjamah": self.pct_penjamah,
            "lab_status": self.lab_status, "sekolah": self.sekolah })
    }
}

pub fn total_porsi(d: &Obj) -> Option<i64> {
    let v: Vec<i64> = rows(d, "sekolah").iter().filter_map(|o| cnt(o, "porsi")).collect();
    if v.is_empty() {
        None
    } else {
        Some(v.iter().sum())
    }
}

/// Lab progress: hasil = tanggal hasil or any result; dikirim = sampel diambil/dikirim or sample rows; belum otherwise.
pub fn lab_status(d: &Obj) -> &'static str {
    let samples = rows(d, "sampel");
    let any_result = samples.iter().any(|o| ["mikro", "kimia"].iter().any(|k| matches!(s(o, k).as_deref(), Some("Positif") | Some("Negatif"))));
    if filled(d, "lab_tgl_hasil") || any_result {
        "hasil"
    } else if filled(d, "lab_tgl_kirim") || filled(d, "lab_tgl_ambil") || !samples.is_empty() {
        "dikirim"
    } else {
        "belum"
    }
}

pub fn hasil(d: &Obj) -> Hasil {
    let kasus = cnt(d, "jumlah_kasus");
    let meninggal = cnt(d, "jumlah_meninggal");
    let (terpapar, sumber) = match cnt(d, "jumlah_terpapar") {
        Some(t) => (Some(t), Some("isian")),
        None => match total_porsi(d) {
            Some(p) => (Some(p), Some("porsi")),
            None => (None, None),
        },
    };
    let ar = match (kasus, terpapar) {
        (Some(k), Some(t)) if t > 0 && k <= t => Some(round1(k as f64 / t as f64 * 100.0)),
        _ => None,
    };
    let cfr = match (kasus, meninggal) {
        (Some(k), Some(m)) if k > 0 && m <= k => Some(round1(m as f64 / k as f64 * 100.0)),
        _ => None,
    };
    let inkubasi_saran = match (dt(d, "jam_makan"), dt(d, "jam_gejala")) {
        (Some(a), Some(b)) if b >= a => Some(round1((b - a).num_minutes() as f64 / 60.0)),
        _ => None,
    };
    let pt: Vec<i64> = PETUGAS.iter().filter_map(|k| cnt(d, k)).collect();
    let total_petugas = if pt.is_empty() { None } else { Some(pt.iter().sum()) };
    let pct_penjamah = match (cnt(d, "penjamah_total"), cnt(d, "penjamah_sertifikasi")) {
        (Some(t), Some(c)) if t > 0 && c <= t => Some(round1(c as f64 / t as f64 * 100.0)),
        _ => None,
    };
    Hasil { kasus, meninggal, terpapar, terpapar_sumber: sumber, ar, cfr, inkubasi_saran, total_petugas, pct_penjamah, lab_status: lab_status(d), sekolah: rows(d, "sekolah").len() }
}

fn validate_s1(i: &mut Issues, d: &Obj, today: NaiveDate) -> (Option<i64>, Option<i64>) {
    // wajib resmi: 7 Tanggal Kejadian, 10 Provinsi, 15 Jumlah Kasus, 16 Jumlah Kematian
    if i.req(d, "s1", "tgl_kejadian", "Tanggal kejadian") {
        i.datetime(d, "s1", "tgl_kejadian", "Tanggal kejadian", today);
    }
    let makan = i.datetime(d, "s1", "jam_makan", "Tanggal & jam makan", today);
    let gejala = i.datetime(d, "s1", "jam_gejala", "Tanggal & jam mulai bergejala", today);
    if let (Some(a), Some(b)) = (makan, gejala) {
        if b < a {
            i.e("s1", "jam_gejala", "Jam mulai bergejala harus sesudah jam makan");
        } else if (b - a).num_hours() > 24 * 14 {
            i.w("s1", "jam_gejala", "Selang makan → gejala lebih dari 14 hari; periksa kembali tanggalnya");
        }
    }
    i.req(d, "s1", "provinsi_id", "Provinsi");
    if filled(d, "provinsi_id") && !filled(d, "kabkota_id") {
        i.w("s1", "kabkota_id", "Kab/Kota belum diisi");
    }
    if let Some(hp) = s(d, "pelapor_hp") {
        let digits: String = hp.chars().filter(|c| !" -.()".contains(*c)).collect();
        let core = digits.trim_start_matches('+');
        if !core.chars().all(|c| c.is_ascii_digit()) || !(8..=15).contains(&core.len()) {
            i.e("s1", "pelapor_hp", "Nomor HP pelapor tidak valid");
        }
    }
    if let Some(m) = s(d, "pelapor_email") {
        if !m.contains('@') || m.starts_with('@') || m.ends_with('@') || m.contains(' ') {
            i.e("s1", "pelapor_email", "Email pelapor tidak valid");
        }
    }
    let mut seen = std::collections::HashSet::new();
    for (n, o) in rows(d, "sekolah").iter().enumerate() {
        let x = n + 1;
        match s(o, "nama") {
            None => i.e("s1", "sekolah", &format!("Sekolah ke-{x}: nama sekolah wajib diisi")),
            Some(nm) => {
                if nm.chars().count() > 200 {
                    i.e("s1", "sekolah", &format!("Sekolah ke-{x}: nama maksimal 200 karakter"));
                }
                if !seen.insert(nm.to_lowercase()) {
                    i.w("s1", "sekolah", &format!("Sekolah \"{nm}\" tercatat lebih dari sekali"));
                }
            }
        }
        for (k, l) in [("siswa", "jumlah siswa"), ("porsi", "jumlah porsi")] {
            if filled(o, k) && cnt(o, k).is_none() {
                i.e("s1", "sekolah", &format!("Sekolah ke-{x}: {l} harus bilangan bulat ≥ 0"));
            }
        }
        if let (Some(a), Some(b)) = (cnt(o, "siswa"), cnt(o, "porsi")) {
            if b > a && a > 0 {
                i.w("s1", "sekolah", &format!("Sekolah ke-{x}: jumlah porsi ({b}) melebihi jumlah siswa ({a})"));
            }
        }
        for k in ["uks", "organoleptik", "ctps"] {
            if s(o, k).is_some_and(|v| !YA_TIDAK.contains(&v.as_str())) {
                i.e("s1", "sekolah", &format!("Sekolah ke-{x}: pilihan {k} tidak valid"));
            }
        }
    }
    let kasus = i.count(d, "s1", "jumlah_kasus", "Jumlah kasus", true);
    let mati = i.count(d, "s1", "jumlah_meninggal", "Jumlah meninggal", true);
    if let (Some(k), Some(m)) = (kasus, mati) {
        if m > k {
            i.e("s1", "jumlah_meninggal", "Jumlah meninggal tidak boleh melebihi jumlah kasus");
        }
    }
    if kasus == Some(0) {
        i.w("s1", "jumlah_kasus", "Jumlah kasus 0 — pastikan kejadian memang dilaporkan tanpa kasus");
    }
    (kasus, mati)
}

fn validate_s2(i: &mut Issues, d: &Obj, kasus: Option<i64>, mati: Option<i64>) {
    let sub = |i: &mut Issues, key: &str, label: &str| -> Option<i64> {
        let v = i.count(d, "s2", key, label, false);
        if let (Some(v), Some(k)) = (v, kasus) {
            if v > k {
                i.e("s2", key, &format!("{label} ({v}) melebihi jumlah kasus ({k})"));
            }
        }
        v
    };
    let inap = sub(i, "rawat_inap", "Rawat inap");
    let jalan = sub(i, "rawat_jalan", "Rawat jalan");
    let sembuh = sub(i, "sembuh", "Sembuh/pulang");
    let pria = sub(i, "pria", "Jumlah pria");
    let wanita = sub(i, "wanita", "Jumlah wanita");
    let usia: Vec<Option<i64>> = USIA.iter().map(|(k, l)| sub(i, k, l)).collect();
    for (k, l) in [("ibu_hamil", "Ibu hamil"), ("ibu_menyusui", "Ibu menyusui"), ("balita", "Balita")] {
        sub(i, k, l);
    }
    for (k, l) in [("kloter", "Kloter pengantaran"), ("jumlah_sekolah", "Jumlah sekolah")] {
        i.count(d, "s2", k, l, false);
    }
    let n_sek = rows(d, "sekolah").len();
    if let Some(js) = cnt(d, "jumlah_sekolah") {
        if n_sek > 0 && js as usize != n_sek {
            i.w("s2", "jumlah_sekolah", &format!("Jumlah sekolah ({js}) berbeda dengan daftar sekolah ({n_sek})"));
        }
    }
    let terpapar = i.count(d, "s2", "jumlah_terpapar", "Jumlah terpapar", false);
    if let Some(k) = kasus {
        match (terpapar, total_porsi(d)) {
            (Some(t), _) if t < k => i.e("s2", "jumlah_terpapar", &format!("Jumlah terpapar ({t}) tidak boleh kurang dari jumlah kasus ({k})")),
            (None, Some(p)) if p < k => {
                i.w("s2", "jumlah_terpapar", &format!("Total porsi sekolah ({p}) lebih kecil dari jumlah kasus ({k}) — isi Jumlah terpapar agar attack rate benar"))
            }
            _ => {}
        }
        if pria.is_some() || wanita.is_some() {
            let t = pria.unwrap_or(0) + wanita.unwrap_or(0);
            if t != k {
                i.w("s2", "pria", &format!("Pria + wanita ({t}) ≠ jumlah kasus ({k})"));
            }
        }
        if usia.iter().any(|x| x.is_some()) {
            let t: i64 = usia.iter().map(|x| x.unwrap_or(0)).sum();
            if t != k {
                i.w("s2", "usia_lt5", &format!("Jumlah per kelompok umur ({t}) ≠ jumlah kasus ({k})"));
            }
        }
        if inap.is_some() || jalan.is_some() || sembuh.is_some() {
            let t = inap.unwrap_or(0) + jalan.unwrap_or(0) + sembuh.unwrap_or(0) + mati.unwrap_or(0);
            if t != k {
                i.w("s2", "rawat_inap", &format!("Rawat inap + rawat jalan + sembuh + meninggal ({t}) ≠ jumlah kasus ({k})"));
            }
        }
    }
    let mut gseen = std::collections::HashSet::new();
    for (n, o) in rows(d, "gejala").iter().enumerate() {
        let nm = s(o, "nama");
        match &nm {
            None => i.e("s2", "gejala", &format!("Gejala ke-{}: nama gejala wajib dipilih", n + 1)),
            Some(x) if x.chars().count() > 100 => i.e("s2", "gejala", &format!("Gejala ke-{}: maksimal 100 karakter", n + 1)),
            Some(x) if !gseen.insert(x.to_lowercase()) => i.e("s2", "gejala", &format!("Gejala \"{x}\" dipilih lebih dari sekali")),
            Some(x) if !GEJALA.contains(&x.as_str()) => i.w("s2", "gejala", &format!("Gejala \"{x}\" di luar daftar SKDR Kemkes (gejala lain)")),
            _ => {}
        }
        let label = nm.clone().unwrap_or_else(|| format!("ke-{}", n + 1));
        if !filled(o, "jumlah") {
            i.e("s2", "gejala", &format!("Gejala {label}: jumlah kasus wajib diisi"));
        } else {
            match (cnt(o, "jumlah"), kasus) {
                (None, _) => i.e("s2", "gejala", &format!("Gejala {label}: jumlah harus bilangan bulat ≥ 0")),
                (Some(v), Some(k)) if v > k => i.e("s2", "gejala", &format!("Gejala {label}: jumlah ({v}) melebihi jumlah kasus ({k})")),
                _ => {}
            }
        }
    }
    let ink: Vec<Option<f64>> = [("inkubasi_min", "Inkubasi terpendek"), ("inkubasi_max", "Inkubasi terpanjang"), ("inkubasi_rata", "Inkubasi rata-rata"), ("inkubasi_median", "Inkubasi median")]
        .iter()
        .map(|(k, l)| i.dec(d, "s2", k, l, 0.0, 720.0))
        .collect();
    if let (Some(mn), Some(mx)) = (ink[0], ink[1]) {
        if mn > mx {
            i.e("s2", "inkubasi_min", "Inkubasi terpendek tidak boleh lebih dari terpanjang");
        }
    }
    for (x, k, l) in [(ink[2], "inkubasi_rata", "rata-rata"), (ink[3], "inkubasi_median", "median")] {
        if let Some(v) = x {
            if ink[0].is_some_and(|mn| v < mn) || ink[1].is_some_and(|mx| v > mx) {
                i.e("s2", k, &format!("Inkubasi {l} harus di antara terpendek dan terpanjang"));
            }
        }
    }
}

fn validate_s4(i: &mut Issues, d: &Obj) {
    i.choice(d, "s4", "ikl", "Hasil IKL", &["Memenuhi Syarat", "Tidak Memenuhi Syarat"]);
    for (k, l) in YA_TIDAK_KEYS {
        i.choice(d, "s4", k, l, &YA_TIDAK);
    }
    i.choice(d, "s4", "sampah_tipe", "Tipe tempat sampah", &["Terbuka", "Tertutup"]);
    i.choice(d, "s4", "sampah_lokasi", "Lokasi tempat penampungan sampah", &["di Dalam Gedung", "di Luar Gedung"]);
    for k in PETUGAS {
        i.count(d, "s4", k, "Jumlah petugas", false);
    }
    for (k, l) in [("cuci_petugas", "Jumlah petugas penjamah (pencucian)"), ("bahan_jumlah", "Jumlah bahan pangan"), ("sampah_kapasitas", "Kapasitas tempat sampah"), ("sampah_frekuensi", "Frekuensi pengambilan sampah")] {
        i.count(d, "s4", k, l, false);
    }
    let pj = i.count(d, "s4", "penjamah_total", "Total penjamah pangan", false);
    let ps = i.count(d, "s4", "penjamah_sertifikasi", "Penjamah tersertifikasi/terlatih", false);
    if let (Some(t), Some(c)) = (pj, ps) {
        if c > t {
            i.e("s4", "penjamah_sertifikasi", "Penjamah tersertifikasi tidak boleh melebihi total penjamah");
        }
    }
    i.dec(d, "s4", "bahan_suhu", "Suhu bahan pangan", -50.0, 150.0);
    i.dec(d, "s4", "simpan_suhu", "Suhu tempat penyimpanan", -50.0, 150.0);
    for (n, o) in rows(d, "sumber_air").iter().enumerate() {
        match s(o, "sumber") {
            None => i.e("s4", "sumber_air", &format!("Sumber air ke-{}: jenis sumber wajib dipilih", n + 1)),
            Some(v) if !SUMBER_AIR.contains(&v.as_str()) => i.e("s4", "sumber_air", &format!("Sumber air ke-{}: pilihan tidak valid", n + 1)),
            _ => {}
        }
        if s(o, "keperluan").is_some_and(|v| v.chars().count() > 200) {
            i.e("s4", "sumber_air", &format!("Sumber air ke-{}: keperluan maksimal 200 karakter", n + 1));
        }
    }
    for o in rows(d, "sop") {
        let nm = s(o, "nama").unwrap_or_default();
        if !SOP.contains(&nm.as_str()) {
            i.e("s4", "sop", &format!("SOP \"{nm}\" tidak dikenal"));
            continue;
        }
        let ada = s(o, "ada");
        let lak = s(o, "dilakukan");
        if ada.as_deref().is_some_and(|v| !["Ada", "Tidak Ada"].contains(&v)) || lak.as_deref().is_some_and(|v| !["Dilakukan", "Tidak Dilakukan"].contains(&v)) {
            i.e("s4", "sop", &format!("SOP \"{nm}\": pilihan tidak valid"));
        }
        if ada.as_deref() == Some("Tidak Ada") && lak.as_deref() == Some("Dilakukan") {
            i.w("s4", "sop", &format!("SOP \"{nm}\": tercatat Tidak Ada tetapi Dilakukan"));
        }
    }
    for (key, label) in [("jadwal_olah", "Jadwal pengolahan"), ("jadwal_porsi", "Pemorsian"), ("jadwal_distribusi", "Pendistribusian"), ("jadwal_saji", "Penyajian")] {
        for (n, o) in rows(d, key).iter().enumerate() {
            if filled(o, "porsi") && cnt(o, "porsi").is_none() {
                i.e("s4", key, &format!("{label} baris {}: jumlah porsi harus bilangan bulat ≥ 0", n + 1));
            }
            for k in ["ket", "rute", "kendaraan", "waktu"] {
                if s(o, k).is_some_and(|v| v.chars().count() > 200) {
                    i.e("s4", key, &format!("{label} baris {}: isian maksimal 200 karakter", n + 1));
                }
            }
            for k in ["organoleptik", "himbauan"] {
                if s(o, k).is_some_and(|v| !YA_TIDAK.contains(&v.as_str())) {
                    i.e("s4", key, &format!("{label} baris {}: pilihan tidak valid", n + 1));
                }
            }
        }
    }
}

fn validate_s5(i: &mut Issues, d: &Obj, today: NaiveDate) {
    let ambil = i.datetime(d, "s5", "lab_tgl_ambil", "Tanggal sampel diambil", today);
    let kirim = i.datetime(d, "s5", "lab_tgl_kirim", "Tanggal sampel dikirim", today);
    let keluar = i.datetime(d, "s5", "lab_tgl_hasil", "Tanggal keluar hasil", today);
    if let (Some(a), Some(b)) = (ambil, kirim) {
        if b < a {
            i.e("s5", "lab_tgl_kirim", "Tanggal dikirim ke lab tidak boleh sebelum tanggal sampel diambil");
        }
    }
    if let (Some(a), Some(b)) = (kirim.or(ambil), keluar) {
        if b < a {
            i.e("s5", "lab_tgl_hasil", "Tanggal keluar hasil tidak boleh sebelum sampel diambil/dikirim");
        }
    }
    let samples = rows(d, "sampel");
    for (n, o) in samples.iter().enumerate() {
        match s(o, "kategori") {
            None => i.e("s5", "sampel", &format!("Sampel ke-{}: kategori wajib dipilih", n + 1)),
            Some(v) if !SAMPEL_KATEGORI.contains(&v.as_str()) => i.e("s5", "sampel", &format!("Sampel ke-{}: kategori tidak valid", n + 1)),
            _ => {}
        }
        for k in ["mikro", "kimia"] {
            if s(o, k).is_some_and(|v| !HASIL_LAB.contains(&v.as_str())) {
                i.e("s5", "sampel", &format!("Sampel ke-{}: hasil {k} tidak valid", n + 1));
            }
        }
        for k in ["sampel", "sumber"] {
            if s(o, k).is_some_and(|v| v.chars().count() > 200) {
                i.e("s5", "sampel", &format!("Sampel ke-{}: isian maksimal 200 karakter", n + 1));
            }
        }
    }
    if keluar.is_some() && samples.is_empty() {
        i.w("s5", "sampel", "Tanggal hasil sudah diisi tetapi belum ada daftar sampel");
    }
}

pub fn validate(d: &Obj, today: NaiveDate) -> Issues {
    let mut i = Issues::new();
    let (kasus, mati) = validate_s1(&mut i, d, today);
    validate_s2(&mut i, d, kasus, mati);
    validate_s4(&mut i, d);
    validate_s5(&mut i, d, today);
    for (st, k, l) in TEXT_200 {
        i.max_len(d, st, k, l, 200);
    }
    for (st, k, l) in TEXT_500 {
        i.max_len(d, st, k, l, 500);
    }
    i
}

/// A validated daily case update.
#[derive(Debug, PartialEq)]
pub struct Harian {
    pub tanggal: NaiveDate,
    pub kasus: i32,
    pub meninggal: i32,
    pub rawat_inap: Option<i32>,
    pub rawat_jalan: Option<i32>,
    pub sembuh: Option<i32>,
    pub catatan: Option<String>,
}

pub fn validate_harian(b: &Obj, today: NaiveDate, kejadian: Option<NaiveDate>) -> Result<Harian, String> {
    let tanggal = b
        .get("tanggal")
        .and_then(|v| v.as_str())
        .and_then(|x| NaiveDate::parse_from_str(x.trim(), "%Y-%m-%d").ok())
        .ok_or("Tanggal update wajib diisi (YYYY-MM-DD)")?;
    if tanggal > today {
        return Err("Tanggal update tidak boleh di masa depan".into());
    }
    if kejadian.is_some_and(|k| tanggal < k) {
        return Err("Tanggal update tidak boleh sebelum tanggal kejadian".into());
    }
    let req = |k: &str, l: &str| -> Result<i32, String> {
        if !filled(b, k) {
            return Err(format!("{l} wajib diisi"));
        }
        cnt(b, k).map(|x| x as i32).ok_or_else(|| format!("{l} harus bilangan bulat ≥ 0"))
    };
    let opt = |k: &str, l: &str| -> Result<Option<i32>, String> {
        if !filled(b, k) {
            return Ok(None);
        }
        cnt(b, k).map(|x| Some(x as i32)).ok_or_else(|| format!("{l} harus bilangan bulat ≥ 0"))
    };
    let kasus = req("kasus", "Jumlah kasus")?;
    let meninggal = req("meninggal", "Jumlah meninggal")?;
    if meninggal > kasus {
        return Err("Jumlah meninggal tidak boleh melebihi jumlah kasus".into());
    }
    let rawat_inap = opt("rawat_inap", "Rawat inap")?;
    let rawat_jalan = opt("rawat_jalan", "Rawat jalan")?;
    let sembuh = opt("sembuh", "Sembuh")?;
    for (v, l) in [(rawat_inap, "Rawat inap"), (rawat_jalan, "Rawat jalan"), (sembuh, "Sembuh")] {
        if v.is_some_and(|x| x > kasus) {
            return Err(format!("{l} tidak boleh melebihi jumlah kasus"));
        }
    }
    let catatan = s(b, "catatan").map(|x| x.chars().take(500).collect());
    Ok(Harian { tanggal, kasus, meninggal, rawat_inap, rawat_jalan, sembuh, catatan })
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async fn next_no(c: &Db) -> Result<String, ApiError> {
    let year = today(OFFSET_HOURS).year();
    let r = c
        .query_one(
            "INSERT INTO laporan_counters (jenis, year, last_no) VALUES ('kpm', $1, 1)
             ON CONFLICT (jenis, year) DO UPDATE SET last_no = laporan_counters.last_no + 1 RETURNING last_no",
            &[&year],
        )
        .await
        .map_err(internal)?;
    Ok(format!("KPM-{year}-{:06}", r.get::<_, i32>(0)))
}

async fn event(c: &Db, id: i64, ev: &str, note: Option<String>, actor: &str) -> Result<(), ApiError> {
    c.execute("INSERT INTO laporan_events (jenis, laporan_id, event, note, actor) VALUES ('kpm', $1, $2, $3, $4)", &[&id, &ev, &note, &actor])
        .await
        .map_err(internal)?;
    Ok(())
}

async fn status_of(c: &Db, id: i64) -> Result<String, ApiError> {
    c.query_opt("SELECT status FROM mbg_keracunan WHERE id = $1 AND deleted_at IS NULL", &[&id])
        .await
        .map_err(internal)?
        .map(|r| r.get(0))
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Laporan kejadian tidak ditemukan"))
}

async fn issues(c: &Db, d: &Obj) -> Result<Issues, ApiError> {
    let mut iss = validate(d, today(OFFSET_HOURS));
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

/// Evaluate + store (computed values in `data._hasil`); logs lab status transitions. Returns the issues.
async fn persist(c: &Db, id: i64, mut d: Obj, actor: &str) -> Result<Issues, ApiError> {
    d.remove("_hasil");
    let iss = issues(c, &d).await?;
    let h = hasil(&d);
    d.insert("_hasil".into(), h.json());
    let pid = match int(&d, "provinsi_id") {
        Some(p) => c.query_opt("SELECT id FROM master_locations WHERE id = $1", &[&p]).await.map_err(internal)?.map(|r| r.get::<_, i32>(0)),
        None => None,
    };
    let kid = match int(&d, "kabkota_id") {
        Some(k) => c.query_opt("SELECT id FROM master_kabkota WHERE id = $1", &[&k]).await.map_err(internal)?.map(|r| r.get::<_, i32>(0)),
        None => None,
    };
    let names: Vec<String> = rows(&d, "sekolah").iter().filter_map(|o| s(o, "nama")).collect();
    let sekolah: Option<String> = if names.is_empty() { None } else { Some(names.join(", ").chars().take(1000).collect()) };
    let old_lab: Option<String> = c.query_opt("SELECT lab_status FROM mbg_keracunan WHERE id = $1", &[&id]).await.map_err(internal)?.map(|r| r.get(0));
    let i32_ = |x: Option<i64>| x.map(|v| v.min(i32::MAX as i64) as i32);
    c.execute(
        "UPDATE mbg_keracunan SET data = $2, errors = $3, warnings = $4, tgl_kejadian = $5, province_id = $6, kabkota_id = $7, kecamatan_nama = $8, desa = $9,
            sekolah = $10, nama_sppg = $11, yayasan_sppg = $12, jumlah_kasus = $13, jumlah_meninggal = $14, jumlah_terpapar = $15, lab_status = $16,
            pelapor_nama = $17, updated_at = now() WHERE id = $1",
        &[&id, &Value::Object(d.clone()), &Value::Array(iss.errors.clone()), &Value::Array(iss.warnings.clone()), &dt(&d, "tgl_kejadian"), &pid, &kid,
          &s(&d, "kecamatan_nama"), &s(&d, "desa"), &sekolah, &s(&d, "nama_sppg"), &s(&d, "yayasan_sppg"), &i32_(h.kasus), &i32_(h.meninggal),
          &i32_(h.terpapar), &h.lab_status, &s(&d, "pelapor_nama")],
    )
    .await
    .map_err(internal)?;
    if let Some(o) = old_lab {
        if o != h.lab_status && h.lab_status != "belum" {
            event(c, id, if h.lab_status == "hasil" { "lab_hasil" } else { "lab_dikirim" }, s(&d, "lab_nama"), actor).await?;
        }
    }
    Ok(iss)
}

/// Last Pengawasan Gizi MBG visit for the same SPPG (read-only summary, PR 033 tables).
async fn pengawasan_json(c: &Db, sppg: &Option<String>) -> Result<Option<Value>, ApiError> {
    let Some(nm) = sppg else { return Ok(None) };
    Ok(c
        .query_opt(
            "SELECT k.id, k.no_kunjungan, k.tanggal::text, k.status,
                    (SELECT kesimpulan FROM mbg_form f WHERE f.kunjungan_id = k.id AND f.form_no = 12 AND f.status = 'dikirim'),
                    (SELECT kesimpulan FROM mbg_form f WHERE f.kunjungan_id = k.id AND f.form_no = 13 AND f.status = 'dikirim'),
                    (SELECT count(*) FROM mbg_form f WHERE f.kunjungan_id = k.id AND f.status = 'dikirim')
             FROM mbg_kunjungan k WHERE k.deleted_at IS NULL AND lower(k.nama_sppg) = lower($1) ORDER BY k.tanggal DESC NULLS LAST, k.id DESC LIMIT 1",
            &[nm],
        )
        .await
        .map_err(internal)?
        .map(|p| {
            json!({ "id": p.get::<_, i64>(0), "no_kunjungan": p.get::<_, String>(1), "tanggal": p.get::<_, Option<String>>(2), "status": p.get::<_, String>(3),
                "rekap_ketaatan": p.get::<_, Option<String>>(4), "rekap_daya_terima": p.get::<_, Option<String>>(5), "form_terkirim": p.get::<_, i64>(6) })
        }))
}

async fn record_json(c: &Db, id: i64) -> Result<Value, ApiError> {
    let r = c
        .query_opt(
            "SELECT k.id, k.no_laporan, k.status, k.lab_status, k.data, k.errors, k.warnings, k.created_by_name,
                    to_char(k.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'),
                    to_char(k.updated_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'),
                    to_char(k.reported_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'),
                    to_char(k.closed_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'), p.name, kb.name, k.nama_sppg
             FROM mbg_keracunan k LEFT JOIN master_locations p ON p.id = k.province_id LEFT JOIN master_kabkota kb ON kb.id = k.kabkota_id
             WHERE k.id = $1 AND k.deleted_at IS NULL",
            &[&id],
        )
        .await
        .map_err(internal)?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Laporan kejadian tidak ditemukan"))?;
    let events = c
        .query(
            "SELECT event, note, actor, to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI') FROM laporan_events
             WHERE jenis = 'kpm' AND laporan_id = $1 ORDER BY id DESC LIMIT 50",
            &[&id],
        )
        .await
        .map_err(internal)?;
    let updates = c
        .query(
            "SELECT id, tanggal::text, kasus, meninggal, rawat_inap, rawat_jalan, sembuh, catatan, created_by_name,
                    to_char(updated_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI')
             FROM mbg_keracunan_update WHERE keracunan_id = $1 ORDER BY tanggal DESC",
            &[&id],
        )
        .await
        .map_err(internal)?;
    let lampiran = c
        .query(
            "SELECT id, kategori, judul, nama_file, tipe, ukuran, to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI')
             FROM mbg_keracunan_lampiran WHERE keracunan_id = $1 ORDER BY id",
            &[&id],
        )
        .await
        .map_err(internal)?;
    let pengawasan = pengawasan_json(c, &r.get::<_, Option<String>>(14)).await?;
    Ok(json!({
        "id": r.get::<_, i64>(0), "no_laporan": r.get::<_, String>(1), "status": r.get::<_, String>(2), "lab_status": r.get::<_, String>(3),
        "data": r.get::<_, Value>(4), "errors": r.get::<_, Value>(5), "warnings": r.get::<_, Value>(6), "created_by_name": r.get::<_, Option<String>>(7),
        "created_at": r.get::<_, Option<String>>(8), "updated_at": r.get::<_, Option<String>>(9), "reported_at": r.get::<_, Option<String>>(10),
        "closed_at": r.get::<_, Option<String>>(11), "provinsi": r.get::<_, Option<String>>(12), "kabkota": r.get::<_, Option<String>>(13),
        "events": events.iter().map(|e| json!({ "event": e.get::<_, String>(0), "note": e.get::<_, Option<String>>(1), "actor": e.get::<_, Option<String>>(2),
            "at": e.get::<_, Option<String>>(3) })).collect::<Vec<_>>(),
        "updates": updates.iter().map(|u| json!({ "id": u.get::<_, i64>(0), "tanggal": u.get::<_, String>(1), "kasus": u.get::<_, i32>(2),
            "meninggal": u.get::<_, i32>(3), "rawat_inap": u.get::<_, Option<i32>>(4), "rawat_jalan": u.get::<_, Option<i32>>(5), "sembuh": u.get::<_, Option<i32>>(6),
            "catatan": u.get::<_, Option<String>>(7), "created_by_name": u.get::<_, Option<String>>(8), "updated_at": u.get::<_, Option<String>>(9) })).collect::<Vec<_>>(),
        "lampiran": lampiran.iter().map(|l| json!({ "id": l.get::<_, i64>(0), "kategori": l.get::<_, String>(1), "judul": l.get::<_, Option<String>>(2),
            "nama_file": l.get::<_, String>(3), "tipe": l.get::<_, String>(4), "ukuran": l.get::<_, i32>(5), "created_at": l.get::<_, Option<String>>(6) })).collect::<Vec<_>>(),
        "pengawasan": pengawasan,
    }))
}

// ─── list / export ────────────────────────────────────────────────────────────

#[derive(Deserialize, Default)]
pub struct ListQuery {
    status: Option<String>,
    search: Option<String>,
    provinsi_id: Option<i32>,
    kabkota_id: Option<i32>,
    dari: Option<String>,
    sampai: Option<String>,
    page: Option<i64>,
    per_page: Option<i64>,
}

/// status filter: draf / dilaporkan (lab belum) / menunggu_lab / hasil_lab / ditutup / aktif (semua yang dilaporkan)
const LIST_WHERE: &str = "k.deleted_at IS NULL
   AND ($1::text IS NULL OR ($1 = 'aktif' AND k.status = 'dilaporkan')
        OR (CASE WHEN k.status = 'dilaporkan' AND k.lab_status = 'dikirim' THEN 'menunggu_lab'
                 WHEN k.status = 'dilaporkan' AND k.lab_status = 'hasil' THEN 'hasil_lab' ELSE k.status END) = $1)
   AND ($2::text IS NULL OR k.no_laporan ILIKE $2 OR k.nama_sppg ILIKE $2 OR k.yayasan_sppg ILIKE $2 OR k.sekolah ILIKE $2 OR k.pelapor_nama ILIKE $2
        OR kb.name ILIKE $2 OR k.kecamatan_nama ILIKE $2 OR k.desa ILIKE $2)
   AND ($3::int IS NULL OR k.province_id = $3) AND ($4::int IS NULL OR k.kabkota_id = $4)
   AND ($5::date IS NULL OR k.tgl_kejadian >= $5::date) AND ($6::date IS NULL OR k.tgl_kejadian < $6::date + 1)";

struct Filters {
    status: Option<String>,
    search: Option<String>,
    pid: Option<i32>,
    kid: Option<i32>,
    dari: Option<NaiveDate>,
    sampai: Option<NaiveDate>,
}
fn filters(q: &ListQuery) -> Filters {
    let pd = |x: &Option<String>| x.as_deref().and_then(|v| NaiveDate::parse_from_str(v.trim(), "%Y-%m-%d").ok());
    Filters {
        status: q.status.clone().filter(|x| !x.is_empty() && x != "all"),
        search: q.search.as_ref().map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).map(|x| format!("%{x}%")),
        pid: q.provinsi_id,
        kid: q.kabkota_id,
        dari: pd(&q.dari),
        sampai: pd(&q.sampai),
    }
}

pub async fn list(State(st): State<AppState>, Query(q): Query<ListQuery>) -> Result<Json<Value>, ApiError> {
    let c = st.pool.get().await.map_err(internal)?;
    let per_page = q.per_page.unwrap_or(20).clamp(1, 100);
    let page = q.page.unwrap_or(1).max(1);
    let off = (page - 1) * per_page;
    let f = filters(&q);
    let sql = format!(
        "SELECT k.id, k.no_laporan, k.status, k.lab_status, to_char(k.tgl_kejadian, 'YYYY-MM-DD HH24:MI'),
                to_char(COALESCE(k.reported_at, k.created_at) AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'), k.pelapor_nama, p.name, kb.name,
                k.kecamatan_nama, k.desa, k.sekolah, k.nama_sppg, k.yayasan_sppg, k.jumlah_kasus, k.jumlah_meninggal, k.jumlah_terpapar,
                (k.data->'_hasil'->>'ar')::float8, jsonb_array_length(k.errors), k.created_by_name, count(*) OVER (),
                (SELECT max(tanggal)::text FROM mbg_keracunan_update u WHERE u.keracunan_id = k.id)
         FROM mbg_keracunan k LEFT JOIN master_locations p ON p.id = k.province_id LEFT JOIN master_kabkota kb ON kb.id = k.kabkota_id
         WHERE {LIST_WHERE}
         ORDER BY k.tgl_kejadian DESC NULLS FIRST, k.id DESC LIMIT $7 OFFSET $8"
    );
    let rows = c.query(&sql, &[&f.status, &f.search, &f.pid, &f.kid, &f.dari, &f.sampai, &per_page, &off]).await.map_err(internal)?;
    let total = rows.first().map(|r| r.get::<_, i64>(20)).unwrap_or(0);
    let data: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "id": r.get::<_, i64>(0), "no_laporan": r.get::<_, String>(1), "status": r.get::<_, String>(2), "lab_status": r.get::<_, String>(3),
                "tgl_kejadian": r.get::<_, Option<String>>(4), "tgl_lapor": r.get::<_, Option<String>>(5), "pelapor_nama": r.get::<_, Option<String>>(6),
                "provinsi": r.get::<_, Option<String>>(7), "kabkota": r.get::<_, Option<String>>(8), "kecamatan": r.get::<_, Option<String>>(9),
                "desa": r.get::<_, Option<String>>(10), "sekolah": r.get::<_, Option<String>>(11), "nama_sppg": r.get::<_, Option<String>>(12),
                "yayasan_sppg": r.get::<_, Option<String>>(13), "kasus": r.get::<_, Option<i32>>(14), "meninggal": r.get::<_, Option<i32>>(15),
                "terpapar": r.get::<_, Option<i32>>(16), "ar": r.get::<_, Option<f64>>(17), "error_count": r.get::<_, i32>(18),
                "created_by_name": r.get::<_, Option<String>>(19), "update_terakhir": r.get::<_, Option<String>>(21),
            })
        })
        .collect();
    // summary cards over the filtered set (status filter ignored so the cards stay comparable); drafts counted separately
    let sum_sql = format!(
        "SELECT count(*) FILTER (WHERE k.status <> 'draf'), COALESCE(sum(k.jumlah_kasus) FILTER (WHERE k.status <> 'draf'), 0)::bigint,
                COALESCE(sum(k.jumlah_meninggal) FILTER (WHERE k.status <> 'draf'), 0)::bigint,
                count(*) FILTER (WHERE k.status = 'dilaporkan' AND k.lab_status = 'dikirim'), count(*) FILTER (WHERE k.status = 'draf'),
                count(*) FILTER (WHERE k.status = 'dilaporkan'), count(*) FILTER (WHERE k.status = 'ditutup'),
                count(*) FILTER (WHERE k.status = 'dilaporkan' AND k.lab_status = 'hasil'), count(*) FILTER (WHERE k.status = 'dilaporkan' AND k.lab_status = 'belum')
         FROM mbg_keracunan k LEFT JOIN master_kabkota kb ON kb.id = k.kabkota_id WHERE {LIST_WHERE}"
    );
    let none: Option<String> = None;
    let sm = c.query_one(&sum_sql, &[&none, &f.search, &f.pid, &f.kid, &f.dari, &f.sampai]).await.map_err(internal)?;
    Ok(Json(json!({ "success": true, "data": data, "total": total, "page": page, "per_page": per_page,
        "total_pages": ((total + per_page - 1) / per_page).max(1),
        "summary": { "kejadian": sm.get::<_, i64>(0), "kasus": sm.get::<_, i64>(1), "meninggal": sm.get::<_, i64>(2), "menunggu_lab": sm.get::<_, i64>(3),
            "draf": sm.get::<_, i64>(4), "aktif": sm.get::<_, i64>(5), "ditutup": sm.get::<_, i64>(6), "hasil_lab": sm.get::<_, i64>(7),
            "dilaporkan": sm.get::<_, i64>(8) } })))
}

pub fn csv_cell(x: &str) -> String {
    let x = x.replace(['\r', '\n'], " ");
    // neutralise spreadsheet formulas (text starting with = + - @ that is not a number)
    let x = if x.starts_with(['=', '+', '-', '@']) && x.parse::<f64>().is_err() { format!("'{x}") } else { x };
    if x.contains([',', '"', ';']) {
        format!("\"{}\"", x.replace('"', "\"\""))
    } else {
        x
    }
}

const STATUS_LABEL: [(&str, &str); 3] = [("draf", "Draf"), ("dilaporkan", "Dilaporkan"), ("ditutup", "Ditutup")];
const LAB_LABEL: [(&str, &str); 3] = [("belum", "Belum"), ("dikirim", "Dikirim"), ("hasil", "Hasil")];
fn label(map: &[(&str, &str)], k: &str) -> String {
    map.iter().find(|x| x.0 == k).map(|x| x.1.to_string()).unwrap_or_else(|| k.to_string())
}
fn hasil_str(d: &Obj, k: &str) -> String {
    match d.get("_hasil").and_then(|x| x.get(k)) {
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::String(x)) => x.clone(),
        _ => String::new(),
    }
}

/// CSV (UTF-8 BOM, langsung terbuka di Excel) dengan filter yang sama seperti daftar.
pub async fn export(State(st): State<AppState>, Query(q): Query<ListQuery>) -> Result<Response, ApiError> {
    let c = st.pool.get().await.map_err(internal)?;
    let f = filters(&q);
    let sql = format!(
        "SELECT k.no_laporan, k.status, k.lab_status, to_char(COALESCE(k.reported_at, k.created_at) AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'),
                to_char(k.tgl_kejadian, 'YYYY-MM-DD HH24:MI'), k.pelapor_nama, p.name, kb.name, k.kecamatan_nama, k.desa, k.sekolah, k.nama_sppg,
                k.yayasan_sppg, k.data
         FROM mbg_keracunan k LEFT JOIN master_locations p ON p.id = k.province_id LEFT JOIN master_kabkota kb ON kb.id = k.kabkota_id
         WHERE {LIST_WHERE} ORDER BY k.tgl_kejadian DESC NULLS FIRST, k.id DESC LIMIT 10000"
    );
    let list = c.query(&sql, &[&f.status, &f.search, &f.pid, &f.kid, &f.dari, &f.sampai]).await.map_err(internal)?;
    let head = [
        "No Laporan", "Status", "Laboratorium", "Tanggal Pelaporan", "Tanggal Kejadian", "Petugas Pelapor", "Provinsi", "Kab/Kota", "Kecamatan", "Desa",
        "Sekolah", "SPPG", "Yayasan SPPG", "Kode SPPG", "Jumlah Kasus", "Jumlah Meninggal", "Jumlah Terpapar", "Attack Rate (%)", "CFR (%)", "Rawat Inap",
        "Rawat Jalan", "Sembuh", "Pria", "Wanita", "Gejala", "Inkubasi Terpendek (jam)", "Inkubasi Terpanjang (jam)", "Menu", "Faskes Penanganan",
        "Nama Laboratorium", "Tanggal Hasil Lab", "Sampel Positif",
    ];
    let mut out = String::from("\u{feff}");
    out.push_str(&head.join(","));
    out.push_str("\r\n");
    let g = |d: &Obj, k: &str| s(d, k).unwrap_or_default();
    for r in &list {
        let d: Value = r.get(13);
        let d = d.as_object().cloned().unwrap_or_default();
        let gejala = rows(&d, "gejala").iter().filter_map(|o| s(o, "nama").map(|n| format!("{n}: {}", s(o, "jumlah").unwrap_or_default()))).collect::<Vec<_>>().join("; ");
        let menu = ["menu_karbo", "menu_protein1", "menu_protein2", "menu_sayur", "menu_buah"].iter().filter_map(|k| s(&d, k)).collect::<Vec<_>>().join("; ");
        let positif = rows(&d, "sampel")
            .iter()
            .filter(|o| s(o, "mikro").as_deref() == Some("Positif") || s(o, "kimia").as_deref() == Some("Positif"))
            .filter_map(|o| s(o, "sampel").or_else(|| s(o, "kategori")))
            .collect::<Vec<_>>()
            .join("; ");
        let opt = |i: usize| r.get::<_, Option<String>>(i).unwrap_or_default();
        let cells: Vec<String> = vec![
            r.get::<_, String>(0), label(&STATUS_LABEL, &r.get::<_, String>(1)), label(&LAB_LABEL, &r.get::<_, String>(2)), opt(3), opt(4), opt(5), opt(6),
            opt(7), opt(8), opt(9), opt(10), opt(11), opt(12), g(&d, "kode_sppg"), g(&d, "jumlah_kasus"), g(&d, "jumlah_meninggal"), hasil_str(&d, "terpapar"),
            hasil_str(&d, "ar"), hasil_str(&d, "cfr"), g(&d, "rawat_inap"), g(&d, "rawat_jalan"), g(&d, "sembuh"), g(&d, "pria"), g(&d, "wanita"), gejala,
            g(&d, "inkubasi_min"), g(&d, "inkubasi_max"), menu, g(&d, "faskes"), g(&d, "lab_nama"), g(&d, "lab_tgl_hasil").replace('T', " "), positif,
        ];
        out.push_str(&cells.iter().map(|x| csv_cell(x)).collect::<Vec<_>>().join(","));
        out.push_str("\r\n");
    }
    let name = format!("keracunan-pangan-mbg-{}.csv", today(OFFSET_HOURS));
    Response::builder()
        .header(header::CONTENT_TYPE, "text/csv; charset=utf-8")
        .header(header::CONTENT_DISPOSITION, format!("attachment; filename=\"{name}\""))
        .body(Body::from(out))
        .map_err(internal)
}

// ─── refs ─────────────────────────────────────────────────────────────────────

/// Auto-fill: pelapor from the logged-in account (+ email), HP & wilayah from the user's latest report; option lists.
pub async fn prefill(State(st): State<AppState>, u: Me) -> Result<Json<Value>, ApiError> {
    let u = me(&u)?;
    let c = st.pool.get().await.map_err(internal)?;
    let email: Option<String> = c.query_opt("SELECT email FROM users WHERE id = $1", &[&u.id]).await.map_err(internal)?.and_then(|r| r.get(0));
    let last = c
        .query_opt("SELECT data, no_laporan FROM mbg_keracunan WHERE created_by = $1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1", &[&u.id])
        .await
        .map_err(internal)?;
    let mut keep = Map::new();
    let mut from: Option<String> = None;
    if let Some(r) = last {
        let d: Value = r.get(0);
        from = Some(r.get(1));
        for k in ["pelapor_hp", "pelapor_email", "provinsi_id", "kabkota_id", "kecamatan", "kecamatan_nama"] {
            if let Some(v) = d.get(k).filter(|v| filled_v(Some(v))) {
                keep.insert(k.into(), v.clone());
            }
        }
    }
    Ok(Json(json!({ "success": true, "data": { "nama": actor_name(&u), "email": email, "last": keep, "last_no": from } })))
}

#[derive(Deserialize)]
pub struct SppgQuery {
    q: Option<String>,
    kabkota_id: Option<i32>,
}

/// SPPG suggestions (SKDR Indonesia has no SPPG master yet): earlier Keracunan reports (nama, yayasan, kode) + Pengawasan Gizi visits.
pub async fn sppg(State(st): State<AppState>, Query(q): Query<SppgQuery>) -> Result<Json<Value>, ApiError> {
    let c = st.pool.get().await.map_err(internal)?;
    let like = q.q.as_ref().map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).map(|x| format!("%{x}%"));
    let list = c
        .query(
            "WITH src AS (
               SELECT nama_sppg nama, yayasan_sppg yayasan, data->>'kode_sppg' kode, province_id, kabkota_id, updated_at, 'keracunan' sumber
                 FROM mbg_keracunan WHERE deleted_at IS NULL AND nama_sppg IS NOT NULL
               UNION ALL
               SELECT nama_sppg, NULL, NULL, province_id, kabkota_id, updated_at, 'pengawasan' FROM mbg_kunjungan WHERE deleted_at IS NULL AND nama_sppg IS NOT NULL
             )
             SELECT (array_agg(nama ORDER BY updated_at DESC))[1], (array_agg(yayasan ORDER BY (yayasan IS NULL), updated_at DESC))[1],
                    (array_agg(kode ORDER BY (kode IS NULL), updated_at DESC))[1], (array_agg(kabkota_id ORDER BY updated_at DESC))[1],
                    (array_agg(province_id ORDER BY updated_at DESC))[1], array_agg(DISTINCT sumber), count(*)
             FROM src WHERE ($1::text IS NULL OR nama ILIKE $1 OR yayasan ILIKE $1 OR kode ILIKE $1)
             GROUP BY lower(nama)
             ORDER BY bool_or($2::int IS NOT NULL AND kabkota_id = $2) DESC, max(updated_at) DESC LIMIT 30",
            &[&like, &q.kabkota_id],
        )
        .await
        .map_err(internal)?;
    let data: Vec<Value> = list
        .iter()
        .map(|r| {
            json!({ "nama": r.get::<_, String>(0), "yayasan": r.get::<_, Option<String>>(1), "kode": r.get::<_, Option<String>>(2),
                "kabkota_id": r.get::<_, Option<i32>>(3), "provinsi_id": r.get::<_, Option<i32>>(4), "sumber": r.get::<_, Vec<String>>(5), "jumlah": r.get::<_, i64>(6) })
        })
        .collect();
    Ok(Json(json!({ "success": true, "data": data })))
}

// ─── handlers: kejadian ───────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct DataBody {
    data: Value,
}

fn body_obj(b: &DataBody) -> Result<Obj, ApiError> {
    b.data.as_object().cloned().ok_or_else(|| bad_request("Data laporan tidak valid"))
}

pub async fn create(State(st): State<AppState>, u: Me, Json(b): Json<DataBody>) -> Result<(StatusCode, Json<Value>), ApiError> {
    let u = me(&u)?;
    let d = body_obj(&b)?;
    let c = st.pool.get().await.map_err(internal)?;
    let no = next_no(&c).await?;
    let r = c
        .query_one("INSERT INTO mbg_keracunan (no_laporan, created_by, created_by_name) VALUES ($1, $2, $3) RETURNING id", &[&no, &u.id, &actor_name(&u)])
        .await
        .map_err(internal)?;
    let id: i64 = r.get(0);
    persist(&c, id, d, &actor_name(&u)).await?;
    event(&c, id, "dibuat", None, &actor_name(&u)).await?;
    Ok((StatusCode::CREATED, Json(json!({ "success": true, "data": record_json(&c, id).await? }))))
}

/// Simpan isian. Draf: boleh belum lengkap. Sudah dilaporkan: tetap boleh dilengkapi, tetapi hanya bila tidak ada isian yang
/// tidak valid (422, laporan tidak berubah). Ditutup: tidak dapat diubah (buka kembali dulu).
pub async fn update(State(st): State<AppState>, u: Me, Path(id): Path<i64>, Json(b): Json<DataBody>) -> Result<Response, ApiError> {
    let u = me(&u)?;
    let mut d = body_obj(&b)?;
    let c = st.pool.get().await.map_err(internal)?;
    let status = status_of(&c, id).await?;
    if status == "ditutup" {
        return Err(err(StatusCode::CONFLICT, "Kejadian sudah ditutup. Buka kembali dulu untuk mengubah."));
    }
    // the closing note (tutup/buka) and the initial counts (update harian) are server-managed
    let r = c.query_one("SELECT data->'tutup', data->'_awal' FROM mbg_keracunan WHERE id = $1", &[&id]).await.map_err(internal)?;
    for (i, k) in [(0usize, "tutup"), (1, "_awal")] {
        d.remove(k);
        if let Some(v) = r.get::<_, Option<Value>>(i).filter(|v| !v.is_null()) {
            d.insert(k.into(), v);
        }
    }
    if status == "dilaporkan" {
        let iss = issues(&c, &d).await?;
        if !iss.errors.is_empty() {
            let msg = format!("Laporan sudah dilaporkan — perubahan belum disimpan karena {} isian belum valid", iss.errors.len());
            return Ok((StatusCode::UNPROCESSABLE_ENTITY, Json(json!({ "success": false, "error": msg, "errors": iss.errors }))).into_response());
        }
    }
    persist(&c, id, d, &actor_name(&u)).await?;
    Ok(Json(json!({ "success": true, "data": record_json(&c, id).await? })).into_response())
}

pub async fn get_one(State(st): State<AppState>, Path(id): Path<i64>) -> Result<Json<Value>, ApiError> {
    let c = st.pool.get().await.map_err(internal)?;
    Ok(Json(json!({ "success": true, "data": record_json(&c, id).await? })))
}

/// Kirim laporan cepat: draf → dilaporkan (isian wajib langkah 1 terisi + tidak ada isian tidak valid).
pub async fn kirim(State(st): State<AppState>, u: Me, Path(id): Path<i64>) -> Result<Response, ApiError> {
    let u = me(&u)?;
    let c = st.pool.get().await.map_err(internal)?;
    if status_of(&c, id).await? != "draf" {
        return Err(err(StatusCode::CONFLICT, "Laporan sudah dikirim."));
    }
    let d: Value = c.query_one("SELECT data FROM mbg_keracunan WHERE id = $1", &[&id]).await.map_err(internal)?.get(0);
    let iss = persist(&c, id, d.as_object().cloned().unwrap_or_default(), &actor_name(&u)).await?;
    if !iss.errors.is_empty() {
        let msg = format!("Masih ada {} isian yang belum valid", iss.errors.len());
        return Ok((StatusCode::UNPROCESSABLE_ENTITY, Json(json!({ "success": false, "error": msg, "data": record_json(&c, id).await? }))).into_response());
    }
    let n = c
        .execute("UPDATE mbg_keracunan SET status = 'dilaporkan', reported_at = now(), updated_at = now() WHERE id = $1 AND status = 'draf'", &[&id])
        .await
        .map_err(internal)?;
    if n == 0 {
        return Err(err(StatusCode::CONFLICT, "Laporan sudah dikirim."));
    }
    event(&c, id, "dilaporkan", None, &actor_name(&u)).await?;
    Ok(Json(json!({ "success": true, "data": record_json(&c, id).await? })).into_response())
}

#[derive(Deserialize)]
pub struct TutupBody {
    kesimpulan: Option<String>,
    penyebab: Option<String>,
}

/// Tutup kejadian (dilaporkan → ditutup) dengan kesimpulan akhir (wajib) + dugaan penyebab/agen (opsional).
pub async fn tutup(State(st): State<AppState>, u: Me, Path(id): Path<i64>, Json(b): Json<TutupBody>) -> Result<Json<Value>, ApiError> {
    let u = me(&u)?;
    let kes = b.kesimpulan.map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).ok_or_else(|| bad_request("Kesimpulan akhir wajib diisi"))?;
    if kes.chars().count() > 1000 {
        return Err(bad_request("Kesimpulan maksimal 1000 karakter"));
    }
    let pen = b.penyebab.map(|x| x.trim().chars().take(300).collect::<String>()).filter(|x| !x.is_empty());
    let c = st.pool.get().await.map_err(internal)?;
    let status = status_of(&c, id).await?;
    if status != "dilaporkan" {
        return Err(err(StatusCode::CONFLICT, if status == "draf" { "Kirim laporan cepat dulu sebelum menutup kejadian." } else { "Kejadian sudah ditutup." }));
    }
    let tutup = json!({ "kesimpulan": kes, "penyebab": pen, "oleh": actor_name(&u), "tanggal": today(OFFSET_HOURS).to_string() });
    c.execute(
        "UPDATE mbg_keracunan SET status = 'ditutup', closed_at = now(), updated_at = now(), data = jsonb_set(data, '{tutup}', $2) WHERE id = $1 AND status = 'dilaporkan'",
        &[&id, &tutup],
    )
    .await
    .map_err(internal)?;
    event(&c, id, "ditutup", Some(kes.chars().take(200).collect()), &actor_name(&u)).await?;
    Ok(Json(json!({ "success": true, "data": record_json(&c, id).await? })))
}

/// Buka kembali kejadian yang sudah ditutup (→ dilaporkan); kesimpulan lama tetap tersimpan sebagai riwayat.
pub async fn buka(State(st): State<AppState>, u: Me, Path(id): Path<i64>) -> Result<Json<Value>, ApiError> {
    let u = me(&u)?;
    let c = st.pool.get().await.map_err(internal)?;
    let n = c
        .execute("UPDATE mbg_keracunan SET status = 'dilaporkan', closed_at = NULL, updated_at = now() WHERE id = $1 AND status = 'ditutup' AND deleted_at IS NULL", &[&id])
        .await
        .map_err(internal)?;
    if n == 0 {
        return Err(err(StatusCode::CONFLICT, "Kejadian belum ditutup."));
    }
    event(&c, id, "dibuka", None, &actor_name(&u)).await?;
    Ok(Json(json!({ "success": true, "data": record_json(&c, id).await? })))
}

/// Soft delete, drafts only.
pub async fn remove(State(st): State<AppState>, u: Me, Path(id): Path<i64>) -> Result<Json<Value>, ApiError> {
    let u = me(&u)?;
    let c = st.pool.get().await.map_err(internal)?;
    let n = c
        .execute("UPDATE mbg_keracunan SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL AND status = 'draf'", &[&id])
        .await
        .map_err(internal)?;
    if n == 0 {
        return Err(err(StatusCode::CONFLICT, "Hanya laporan berstatus Draf yang dapat dihapus."));
    }
    event(&c, id, "dihapus", None, &actor_name(&u)).await?;
    Ok(Json(json!({ "success": true, "data": { "id": id, "deleted": true } })))
}

/// Update kasus harian (satu baris per tanggal; tanggal sama = koreksi). Bila tanggalnya yang terbaru, angka kejadian ikut diperbarui.
pub async fn harian(State(st): State<AppState>, u: Me, Path(id): Path<i64>, Json(b): Json<Value>) -> Result<Json<Value>, ApiError> {
    let u = me(&u)?;
    let b = b.as_object().cloned().ok_or_else(|| bad_request("Data update tidak valid"))?;
    let c = st.pool.get().await.map_err(internal)?;
    let status = status_of(&c, id).await?;
    if status != "dilaporkan" {
        return Err(err(StatusCode::CONFLICT, if status == "draf" { "Kirim laporan cepat dulu, lalu tambahkan update harian." } else { "Kejadian sudah ditutup." }));
    }
    let d: Value = c.query_one("SELECT data FROM mbg_keracunan WHERE id = $1", &[&id]).await.map_err(internal)?.get(0);
    let mut d = d.as_object().cloned().unwrap_or_default();
    let h = validate_harian(&b, today(OFFSET_HOURS), dt(&d, "tgl_kejadian").map(|x| x.date())).map_err(|m| bad_request(&m))?;
    let mut warnings: Vec<String> = vec![];
    let prev = c
        .query_opt("SELECT kasus FROM mbg_keracunan_update WHERE keracunan_id = $1 AND tanggal < $2 ORDER BY tanggal DESC LIMIT 1", &[&id, &h.tanggal])
        .await
        .map_err(internal)?
        .map(|r| r.get::<_, i32>(0));
    if let Some(p) = prev.filter(|p| h.kasus < *p) {
        warnings.push(format!("Jumlah kasus turun dari update sebelumnya ({p} → {}); jumlah kasus biasanya kumulatif", h.kasus));
    }
    c.execute(
        "INSERT INTO mbg_keracunan_update (keracunan_id, tanggal, kasus, meninggal, rawat_inap, rawat_jalan, sembuh, catatan, created_by, created_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (keracunan_id, tanggal) DO UPDATE SET kasus = EXCLUDED.kasus, meninggal = EXCLUDED.meninggal, rawat_inap = EXCLUDED.rawat_inap,
           rawat_jalan = EXCLUDED.rawat_jalan, sembuh = EXCLUDED.sembuh, catatan = EXCLUDED.catatan, created_by_name = EXCLUDED.created_by_name, updated_at = now()",
        &[&id, &h.tanggal, &h.kasus, &h.meninggal, &h.rawat_inap, &h.rawat_jalan, &h.sembuh, &h.catatan, &u.id, &actor_name(&u)],
    )
    .await
    .map_err(internal)?;
    let latest: NaiveDate = c.query_one("SELECT max(tanggal) FROM mbg_keracunan_update WHERE keracunan_id = $1", &[&id]).await.map_err(internal)?.get(0);
    if latest == h.tanggal {
        // angka laporan awal disimpan sekali, agar bisa dipulihkan bila semua update dihapus
        if !d.contains_key("_awal") {
            let awal: Obj = ["jumlah_kasus", "jumlah_meninggal", "rawat_inap", "rawat_jalan", "sembuh"]
                .iter()
                .map(|k| (k.to_string(), d.get(*k).cloned().unwrap_or(Value::Null)))
                .collect();
            d.insert("_awal".into(), Value::Object(awal));
        }
        d.insert("jumlah_kasus".into(), json!(h.kasus));
        d.insert("jumlah_meninggal".into(), json!(h.meninggal));
        for (k, v) in [("rawat_inap", h.rawat_inap), ("rawat_jalan", h.rawat_jalan), ("sembuh", h.sembuh)] {
            if let Some(v) = v {
                d.insert(k.into(), json!(v));
            }
        }
        let iss = persist(&c, id, d, &actor_name(&u)).await?;
        if !iss.errors.is_empty() {
            warnings.push(format!("Setelah update, {} isian lain perlu disesuaikan (mis. rincian kasus melebihi total)", iss.errors.len()));
        }
    } else {
        warnings.push(format!("Update tanggal {} lebih lama dari update terbaru ({latest}); total kejadian tidak berubah", h.tanggal));
    }
    event(&c, id, "update_harian", Some(format!("{}: {} kasus, {} meninggal", h.tanggal, h.kasus, h.meninggal)), &actor_name(&u)).await?;
    Ok(Json(json!({ "success": true, "warnings": warnings, "data": record_json(&c, id).await? })))
}

/// Hapus satu update harian (koreksi salah input); total kejadian mengikuti update terbaru yang tersisa.
pub async fn harian_delete(State(st): State<AppState>, u: Me, Path((id, uid)): Path<(i64, i64)>) -> Result<Json<Value>, ApiError> {
    let u = me(&u)?;
    let c = st.pool.get().await.map_err(internal)?;
    if status_of(&c, id).await? != "dilaporkan" {
        return Err(err(StatusCode::CONFLICT, "Update harian hanya dapat diubah selama kejadian berstatus Dilaporkan."));
    }
    let gone = c
        .query_opt("DELETE FROM mbg_keracunan_update WHERE id = $1 AND keracunan_id = $2 RETURNING tanggal::text", &[&uid, &id])
        .await
        .map_err(internal)?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "Update harian tidak ditemukan"))?;
    let last = c
        .query_opt("SELECT kasus, meninggal, rawat_inap, rawat_jalan, sembuh FROM mbg_keracunan_update WHERE keracunan_id = $1 ORDER BY tanggal DESC LIMIT 1", &[&id])
        .await
        .map_err(internal)?;
    if let Some(r) = last {
        let d: Value = c.query_one("SELECT data FROM mbg_keracunan WHERE id = $1", &[&id]).await.map_err(internal)?.get(0);
        let mut d = d.as_object().cloned().unwrap_or_default();
        d.insert("jumlah_kasus".into(), json!(r.get::<_, i32>(0)));
        d.insert("jumlah_meninggal".into(), json!(r.get::<_, i32>(1)));
        for (i, k) in [(2, "rawat_inap"), (3, "rawat_jalan"), (4, "sembuh")] {
            if let Some(v) = r.get::<_, Option<i32>>(i) {
                d.insert(k.into(), json!(v));
            }
        }
        persist(&c, id, d, &actor_name(&u)).await?;
    } else {
        let d: Value = c.query_one("SELECT data FROM mbg_keracunan WHERE id = $1", &[&id]).await.map_err(internal)?.get(0);
        let mut d = d.as_object().cloned().unwrap_or_default();
        if let Some(Value::Object(awal)) = d.remove("_awal") {
            for (k, v) in awal {
                if v.is_null() {
                    d.remove(&k);
                } else {
                    d.insert(k, v);
                }
            }
            persist(&c, id, d, &actor_name(&u)).await?;
        }
    }
    event(&c, id, "update_dihapus", Some(gone.get::<_, String>(0)), &actor_name(&u)).await?;
    Ok(Json(json!({ "success": true, "data": record_json(&c, id).await? })))
}

// ─── lampiran (umum / file lab / dokumentasi gejala) ──────────────────────────

#[derive(Deserialize)]
pub struct LampQuery {
    kategori: Option<String>,
    nama: Option<String>,
    judul: Option<String>,
}

fn clean_name(x: &str) -> String {
    let base = x.rsplit(['/', '\\']).next().unwrap_or(x);
    base.chars().filter(|c| !c.is_control() && *c != '"').take(160).collect::<String>().trim().to_string()
}

pub async fn lampiran_upload(
    State(st): State<AppState>, u: Me, Path(id): Path<i64>, Query(q): Query<LampQuery>, headers: HeaderMap, body: Bytes,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let u = me(&u)?;
    let kategori = q.kategori.unwrap_or_else(|| "umum".into());
    if !["umum", "lab", "gejala"].contains(&kategori.as_str()) {
        return Err(bad_request("Kategori lampiran tidak dikenal (umum, lab, gejala)"));
    }
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
    if status_of(&c, id).await? == "ditutup" {
        return Err(err(StatusCode::CONFLICT, "Kejadian sudah ditutup."));
    }
    let size = body.len() as i32;
    let r = c
        .query_one(
            "INSERT INTO mbg_keracunan_lampiran (keracunan_id, kategori, judul, nama_file, tipe, ukuran, isi, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
            &[&id, &kategori, &judul, &nama, &tipe, &size, &body.to_vec(), &u.id],
        )
        .await
        .map_err(internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "success": true, "data": { "id": r.get::<_, i64>(0), "kategori": kategori, "judul": judul, "nama_file": nama, "tipe": tipe, "ukuran": size } }))))
}

pub async fn lampiran_get(State(st): State<AppState>, Path((id, lid)): Path<(i64, i64)>) -> Result<Response, ApiError> {
    let c = st.pool.get().await.map_err(internal)?;
    let r = c
        .query_opt(
            "SELECT l.nama_file, l.tipe, l.isi FROM mbg_keracunan_lampiran l JOIN mbg_keracunan k ON k.id = l.keracunan_id
             WHERE l.id = $1 AND l.keracunan_id = $2 AND k.deleted_at IS NULL",
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
    if status_of(&c, id).await? == "ditutup" {
        return Err(err(StatusCode::CONFLICT, "Kejadian sudah ditutup."));
    }
    let n = c.execute("DELETE FROM mbg_keracunan_lampiran WHERE id = $1 AND keracunan_id = $2", &[&lid, &id]).await.map_err(internal)?;
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
    const TODAY: &str = "2026-11-10";
    fn quick() -> Obj {
        obj(json!({ "tgl_kejadian": "2026-11-09T17:00", "provinsi_id": 12, "jumlah_kasus": 24, "jumlah_meninggal": 0 }))
    }

    #[test]
    fn laporan_cepat_required_fields() {
        let k = keys(&validate(&Map::new(), d(TODAY)).errors);
        for want in ["tgl_kejadian", "provinsi_id", "jumlah_kasus", "jumlah_meninggal"] {
            assert!(k.contains(&want.to_string()), "missing {want}: {k:?}");
        }
        assert_eq!(k.len(), 4, "only the 4 official required fields: {k:?}");
        let ok = validate(&quick(), d(TODAY));
        assert!(ok.errors.is_empty(), "{:?}", ok.errors);
        assert_eq!(keys(&ok.warnings), vec!["kabkota_id".to_string()]);
        let mut f = quick();
        f.insert("tgl_kejadian".into(), json!("2026-11-11T08:00"));
        f.insert("jumlah_meninggal".into(), json!(30));
        f.insert("pelapor_hp".into(), json!("08ab"));
        let k = keys(&validate(&f, d(TODAY)).errors);
        assert_eq!(k, vec!["tgl_kejadian".to_string(), "pelapor_hp".to_string(), "jumlah_meninggal".to_string()]);
    }

    #[test]
    fn makan_gejala_and_incubation() {
        let mut f = quick();
        f.insert("jam_makan".into(), json!("2026-11-09T11:30"));
        f.insert("jam_gejala".into(), json!("2026-11-09T15:00"));
        assert!(validate(&f, d(TODAY)).errors.is_empty());
        assert_eq!(hasil(&f).inkubasi_saran, Some(3.5));
        f.insert("jam_gejala".into(), json!("2026-11-09T10:00"));
        assert_eq!(keys(&validate(&f, d(TODAY)).errors), vec!["jam_gejala".to_string()]);
        assert_eq!(hasil(&f).inkubasi_saran, None);
        let mut g = quick();
        g.insert("inkubasi_min".into(), json!("4"));
        g.insert("inkubasi_max".into(), json!("2,5"));
        g.insert("inkubasi_median".into(), json!(5));
        let k = keys(&validate(&g, d(TODAY)).errors);
        assert!(k.contains(&"inkubasi_min".to_string()) && k.contains(&"inkubasi_median".to_string()), "{k:?}");
    }

    #[test]
    fn attack_rate_cfr_and_cross_checks() {
        let mut f = quick();
        f.insert("sekolah".into(), json!([{ "nama": "SDN 1", "siswa": 300, "porsi": 280 }, { "nama": "SDN 2", "porsi": 120 }]));
        let h = hasil(&f);
        assert_eq!((h.terpapar, h.terpapar_sumber, h.ar), (Some(400), Some("porsi"), Some(6.0)));
        assert_eq!(h.cfr, Some(0.0));
        f.insert("jumlah_terpapar".into(), json!(480));
        assert_eq!(hasil(&f).ar, Some(5.0));
        assert_eq!(hasil(&f).terpapar_sumber, Some("isian"));
        f.insert("jumlah_terpapar".into(), json!(10));
        assert!(keys(&validate(&f, d(TODAY)).errors).contains(&"jumlah_terpapar".to_string()));
        f.remove("jumlah_terpapar");
        // warnings only (non-blocking): sex and age sums ≠ 24; 18 inap + 6 sembuh = 24 is consistent
        for (k, v) in [("pria", 6), ("wanita", 15), ("usia_5_9", 10), ("rawat_inap", 18), ("sembuh", 6)] {
            f.insert(k.into(), json!(v));
        }
        let v = validate(&f, d(TODAY));
        assert!(v.errors.is_empty(), "{:?}", v.errors);
        let w = keys(&v.warnings);
        assert!(w.contains(&"pria".to_string()) && w.contains(&"usia_lt5".to_string()) && !w.contains(&"rawat_inap".to_string()), "{w:?}");
        // a sub-count above the total is an error
        f.insert("rawat_jalan".into(), json!(25));
        assert!(keys(&validate(&f, d(TODAY)).errors).contains(&"rawat_jalan".to_string()));
    }

    #[test]
    fn gejala_sop_lab() {
        let mut f = quick();
        f.insert("gejala".into(), json!([{ "nama": "Diare", "jumlah": 21 }, { "nama": "Mual", "jumlah": 30 }, { "nama": "Diare", "jumlah": 1 }, { "nama": "Pusing" }]));
        assert_eq!(validate(&f, d(TODAY)).errors.len(), 3);
        let mut g = quick();
        g.insert("sop".into(), json!([{ "nama": SOP[0], "ada": "Tidak Ada", "dilakukan": "Dilakukan" }, { "nama": "SOP X", "ada": "Ada" }]));
        let v = validate(&g, d(TODAY));
        assert_eq!(keys(&v.errors), vec!["sop".to_string()]);
        assert!(keys(&v.warnings).contains(&"sop".to_string()));
        assert_eq!(lab_status(&quick()), "belum");
        let mut l = quick();
        l.insert("sampel".into(), json!([{ "kategori": "Pangan", "sampel": "Nasi", "mikro": "Belum" }]));
        assert_eq!(lab_status(&l), "dikirim");
        l.insert("sampel".into(), json!([{ "kategori": "Pangan", "sampel": "Nasi", "mikro": "Positif" }]));
        assert_eq!(lab_status(&l), "hasil");
        let mut t = quick();
        t.insert("lab_tgl_ambil".into(), json!("2026-10-29T09:00"));
        t.insert("lab_tgl_kirim".into(), json!("2026-10-28T09:00"));
        assert_eq!(lab_status(&t), "dikirim");
        assert_eq!(keys(&validate(&t, d(TODAY)).errors), vec!["lab_tgl_kirim".to_string()]);
    }

    #[test]
    fn environment_and_daily_update() {
        let mut f = quick();
        for (k, v) in PETUGAS.iter().zip([1, 2, 1, 3, 10, 8, 4, 6, 2]) {
            f.insert((*k).into(), json!(v));
        }
        f.insert("penjamah_total".into(), json!(40));
        f.insert("penjamah_sertifikasi".into(), json!(30));
        f.insert("slhs".into(), json!("Mungkin"));
        let h = hasil(&f);
        assert_eq!((h.total_petugas, h.pct_penjamah), (Some(37), Some(75.0)));
        assert_eq!(keys(&validate(&f, d(TODAY)).errors), vec!["slhs".to_string()]);
        let ok = validate_harian(&obj(json!({ "tanggal": "2026-11-10", "kasus": 30, "meninggal": 0, "rawat_inap": 12 })), d(TODAY), Some(d("2026-11-09"))).unwrap();
        assert_eq!((ok.kasus, ok.rawat_inap, ok.sembuh), (30, Some(12), None));
        assert!(validate_harian(&obj(json!({ "tanggal": "2026-11-08", "kasus": 3, "meninggal": 0 })), d(TODAY), Some(d("2026-11-09"))).is_err());
        assert!(validate_harian(&obj(json!({ "tanggal": "2026-11-10", "kasus": 3, "meninggal": 4 })), d(TODAY), None).is_err());
        assert!(validate_harian(&obj(json!({ "tanggal": "2026-11-11", "kasus": 3, "meninggal": 0 })), d(TODAY), None).is_err());
        assert_eq!(csv_cell("=SUM(A1)"), "'=SUM(A1)");
        assert_eq!(csv_cell("a, b"), "\"a, b\"");
        assert_eq!(csv_cell("-5"), "-5");
        assert_eq!(parse_dt("2026-11-09 17:00"), parse_dt("2026-11-09T17:00"));
    }
}
