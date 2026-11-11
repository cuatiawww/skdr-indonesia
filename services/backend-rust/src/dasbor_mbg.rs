//! PR 036: Dasbor MBG — analitik langsung dari Transaksi Form Program MBG:
//! * Pengawasan Gizi MBG (`mbg_kunjungan`, `mbg_form`)
//! * Keracunan Pangan MBG (`mbg_keracunan`, `mbg_keracunan_update`)
//! Seluruh angka, tren, heatmap, dan titik peta berasal langsung dari data transaksi + master wilayah/fasyankes.
//! Tidak ada data dummy/hardcoded/fallback, dan tidak ada field PII (nama TPG, pengawas, pelapor, HP, email) yang diekspos.
//! PR 052: revamp — seri harian (agregasi Tahun/Bulan/Minggu Epid/Harian di klien), ranking provinsi/kab/kecamatan,
//! ketepatan waktu lapor, ringkasan lab & pangan dicurigai, temuan per butir F1–F13, skor pengawasan per SPPG (tautan risiko),
//! serta filter kecamatan & sekolah (Keracunan).
use axum::{extract::{Query, State}, Json};
use chrono::{NaiveDate, NaiveDateTime};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
use tokio_postgres::types::ToSql;

use crate::dasbor_ebs_ibs::{
    build_week_axis, csv_ints, json_dec, json_int, mmwr_week_of, n, opt_date, opt_str, pct,
    week_label, week_start_date,
};
use crate::{internal, ApiError, AppState};

// ─── 1. PENGAWASAN GIZI MBG (`mbg_kunjungan` + `mbg_form`) ─────────────────────

#[derive(Deserialize, Default)]
pub struct GiziDashQuery {
    pub status: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub province_id: Option<String>,
    pub kabkota_id: Option<String>,
    pub sppg: Option<String>,
    pub rekap12: Option<String>,
    pub level: Option<String>,
    pub parent: Option<i32>,
}

const GIZI_FORMS_META: &[(i16, &str, &str)] = &[
    (1, "Ketenagaan", "Standar Ketenagaan & Pelatihan"),
    (2, "Ketersediaan SOP", "Ketersediaan & Sosialisasi SOP"),
    (3, "Perencanaan Menu", "SOP Perencanaan Menu"),
    (4, "Pemesanan Bahan", "SOP Pemesanan Bahan Pangan"),
    (5, "Penerimaan Bahan", "SOP Penerimaan Bahan Pangan"),
    (6, "Penyimpanan Bahan", "SOP Penyimpanan Bahan Pangan"),
    (7, "Persiapan Bahan", "SOP Persiapan Bahan Pangan"),
    (8, "Pengolahan Bahan", "SOP Pengolahan Bahan Pangan"),
    (9, "Pemorsian Makanan", "SOP Pemorsian Makanan"),
    (10, "Daya Terima Sekolah", "Daya Terima MBG di Sekolah"),
    (11, "Daya Terima Posyandu", "Daya Terima MBG di Posyandu (3B)"),
    (12, "Rekap Standar Gizi", "Rekapitulasi Ketaatan Standar Gizi"),
    (13, "Rekap Daya Terima", "Rekapitulasi Penilaian Daya Terima"),
];

const F2_SOP_NAMES: &[&str] = &[
    "Perencanaan Menu",
    "Pemesanan Bahan Pangan",
    "Penerimaan Bahan Pangan",
    "Penyimpanan Bahan Pangan",
    "Persiapan Bahan Pangan",
    "Pengolahan Bahan Pangan",
    "Pemorsian Makanan",
    "Distribusi Makanan",
];

const GIZI_WHERE: &str = "k.deleted_at IS NULL
    AND ($1::text IS NULL OR k.status = $1)
    AND ($2::date IS NULL OR k.tanggal >= $2)
    AND ($3::date IS NULL OR k.tanggal <= $3)
    AND (cardinality($4::int[]) = 0 OR k.province_id = ANY($4))
    AND (cardinality($5::int[]) = 0 OR k.kabkota_id = ANY($5))
    AND ($6::text IS NULL OR lower(trim(COALESCE(k.nama_sppg,''))) = lower(trim($6)))";

/// GET /api/v1/dasbor/mbg/pengawasan-gizi
pub async fn pengawasan_gizi(State(st): State<AppState>, Query(q): Query<GiziDashQuery>) -> Result<Json<Value>, ApiError> {
    let c = st.pool.get().await.map_err(internal)?;
    let status = opt_str(&q.status).filter(|s| s == "dikirim" || s == "draf");
    let from = opt_date(&q.from);
    let to = opt_date(&q.to);
    let prov = csv_ints(&q.province_id);
    let kab = csv_ints(&q.kabkota_id);
    let sppg = opt_str(&q.sppg);
    let rekap12_filt = opt_str(&q.rekap12).filter(|s| s == "BAIK" || s == "BELUM BAIK" || s == "belum");
    let params: Vec<&(dyn ToSql + Sync)> = vec![&status, &from, &to, &prov, &kab, &sppg];

    // Fetch matching visits + aggregated rekap12/rekap13/form counts
    let visit_rows = c
        .query(
            &format!(
                "SELECT k.id, k.no_kunjungan, k.status, k.tanggal, k.tanggal::text,
                        k.province_id, ml.name, ml.code,
                        k.kabkota_id, mk.name, replace(mk.kemendagri_code, '.', ''),
                        COALESCE(NULLIF(trim(k.nama_sppg),''), '(SPPG belum diisi)'),
                        COALESCE(NULLIF(trim(k.puskesmas),''), '(Puskesmas belum diisi)'),
                        NULLIF(trim(k.data->>'unit_kode'),''),
                        MAX(f.kesimpulan) FILTER (WHERE f.form_no = 12 AND f.status = 'dikirim') AS rekap12,
                        MAX(f.kesimpulan) FILTER (WHERE f.form_no = 13 AND f.status = 'dikirim') AS rekap13,
                        COUNT(f.id)::bigint AS forms_saved,
                        COUNT(f.id) FILTER (WHERE f.status = 'dikirim')::bigint AS forms_sent,
                        AVG(f.skor) FILTER (WHERE f.form_no BETWEEN 3 AND 11 AND f.skor IS NOT NULL)::float8 AS avg_skor,
                        COALESCE(BOOL_OR(f.form_no = 1 AND f.data->>'wilayah_3t' = 'Ya'), FALSE) AS is_3t,
                        COALESCE(BOOL_OR(f.form_no = 3 AND f.data->>'alergi' = 'Ya'), FALSE) AS has_alergi
                 FROM mbg_kunjungan k
                 LEFT JOIN master_locations ml ON ml.id = k.province_id
                 LEFT JOIN master_kabkota mk ON mk.id = k.kabkota_id
                 LEFT JOIN mbg_form f ON f.kunjungan_id = k.id
                 WHERE {GIZI_WHERE}
                 GROUP BY k.id, ml.name, ml.code, mk.name, mk.kemendagri_code
                 ORDER BY k.tanggal DESC NULLS LAST, k.id DESC"
            ),
            &params,
        )
        .await
        .map_err(internal)?;

    // Apply optional rekap12 filter in Rust and keep matching kunjungan_ids
    let mut kept_ids: HashSet<i64> = HashSet::new();
    let mut kpis_total = 0i64;
    let mut kpis_dikirim = 0i64;
    let mut kpis_draf = 0i64;
    let mut sppg_set: HashSet<String> = HashSet::new();
    let mut pkm_set: HashSet<String> = HashSet::new();
    let mut prov_set: HashSet<i32> = HashSet::new();
    let mut kab_set: HashSet<i32> = HashSet::new();
    let mut r12_baik = 0i64;
    let mut r12_belum = 0i64;
    let mut r13_baik = 0i64;
    let mut r13_belum = 0i64;
    let mut forms_saved_sum = 0i64;
    let mut forms_sent_sum = 0i64;
    let mut skor_sum = 0.0f64;
    let mut skor_cnt = 0i64;
    let mut cnt_3t = 0i64;
    let mut cnt_alergi = 0i64;
    let mut date_min: Option<NaiveDate> = None;
    let mut date_max: Option<NaiveDate> = None;

    let mut week_map: BTreeMap<(i32, i32), (i64, i64, i64, i64, i64)> = BTreeMap::new(); // (kunj, dik, dr, r12_baik, r12_belum)
    let mut week_skor: BTreeMap<(i32, i32), (f64, i64)> = BTreeMap::new();
    // PR 052: seri harian (kunjungan, F12 baik, F12 belum baik, jumlah skor, n skor) → agregasi Tahun/Bulan/Minggu/Harian di klien
    let mut daily_gizi: BTreeMap<NaiveDate, (i64, i64, i64, f64, i64)> = BTreeMap::new();
    let mut heat_prov: HashMap<String, (Option<i32>, String, HashMap<(i32, i32), (i64, i64)>, i64, i64, i64)> = HashMap::new();
    let mut obs_weeks: Vec<(i32, i32)> = vec![];

    #[derive(Default)]
    struct SppgAcc {
        nama_sppg: String,
        province_name: Option<String>,
        kabkota_name: Option<String>,
        puskesmas: String,
        kunjungan: i64,
        last_tanggal: Option<String>,
        last_rekap12: Option<String>,
        last_rekap13: Option<String>,
        skor_sum: f64,
        skor_cnt: i64,
    }
    let mut sppg_map: HashMap<String, SppgAcc> = HashMap::new();

    #[derive(Default)]
    struct RegAcc {
        name: String,
        geo: String,
        kunjungan: i64,
        dikirim: i64,
        r12_baik: i64,
        r12_belum: i64,
        r13_baik: i64,
        r13_belum: i64,
        skor_sum: f64,
        skor_cnt: i64,
        sppgs: HashSet<String>,
    }
    let mut reg_map: HashMap<String, RegAcc> = HashMap::new();
    let mut recent_kunjungan: Vec<Value> = vec![];

    let map_level = q.level.clone().filter(|x| x == "kab").unwrap_or_else(|| "prov".into());
    let map_parent = q.parent;

    // PR 052b: sebaran skor SOP rata-rata per kunjungan (<60, 60–69, 70–79, 80–89, ≥90) + kunjungan tanpa skor
    let mut skor_bins = [0i64; 5];
    let mut skor_bin_none = 0i64;
    for r in &visit_rows {
        let kid: i64 = r.get(0);
        let no_k: String = r.get(1);
        let st_str: String = r.get(2);
        let tgl: Option<NaiveDate> = r.get(3);
        let tgl_txt: Option<String> = r.get(4);
        let pid: Option<i32> = r.get(5);
        let pname: Option<String> = r.get(6);
        let pcode: Option<String> = r.get(7);
        let kbid: Option<i32> = r.get(8);
        let kname: Option<String> = r.get(9);
        let kcode: Option<String> = r.get(10);
        let nama_sppg: String = r.get(11);
        let puskesmas: String = r.get(12);
        let r12: Option<String> = r.get(14);
        let r13: Option<String> = r.get(15);
        let f_saved: i64 = r.get(16);
        let f_sent: i64 = r.get(17);
        let avg_s: Option<f64> = r.get(18);
        let is_3t: bool = r.get(19);
        let has_alergi: bool = r.get(20);

        if let Some(rf) = &rekap12_filt {
            let ok = match rf.as_str() {
                "BAIK" => r12.as_deref() == Some("BAIK"),
                "BELUM BAIK" => r12.as_deref() == Some("BELUM BAIK"),
                "belum" => r12.is_none(),
                _ => true,
            };
            if !ok {
                continue;
            }
        }

        kept_ids.insert(kid);
        kpis_total += 1;
        if st_str == "dikirim" { kpis_dikirim += 1; } else { kpis_draf += 1; }
        sppg_set.insert(nama_sppg.to_lowercase());
        pkm_set.insert(puskesmas.to_lowercase());
        if let Some(p) = pid { prov_set.insert(p); }
        if let Some(kb) = kbid { kab_set.insert(kb); }
        if r12.as_deref() == Some("BAIK") { r12_baik += 1; } else if r12.as_deref() == Some("BELUM BAIK") { r12_belum += 1; }
        if r13.as_deref() == Some("BAIK") { r13_baik += 1; } else if r13.as_deref() == Some("BELUM BAIK") { r13_belum += 1; }
        forms_saved_sum += f_saved;
        forms_sent_sum += f_sent;
        if let Some(s) = avg_s { skor_sum += s; skor_cnt += 1; skor_bins[skor_bin(s)] += 1; } else { skor_bin_none += 1; }
        if is_3t { cnt_3t += 1; }
        if has_alergi { cnt_alergi += 1; }
        if let Some(d) = tgl {
            date_min = Some(match date_min { Some(m) => m.min(d), None => d });
            date_max = Some(match date_max { Some(m) => m.max(d), None => d });
            let yw = mmwr_week_of(d);
            obs_weeks.push(yw);
            let w = week_map.entry(yw).or_insert((0, 0, 0, 0, 0));
            w.0 += 1;
            if st_str == "dikirim" { w.1 += 1; } else { w.2 += 1; }
            if r12.as_deref() == Some("BAIK") { w.3 += 1; } else if r12.as_deref() == Some("BELUM BAIK") { w.4 += 1; }
            if let Some(s) = avg_s {
                let ws = week_skor.entry(yw).or_insert((0.0, 0));
                ws.0 += s;
                ws.1 += 1;
            }
            let dg = daily_gizi.entry(d).or_insert((0, 0, 0, 0.0, 0));
            dg.0 += 1;
            if r12.as_deref() == Some("BAIK") { dg.1 += 1; } else if r12.as_deref() == Some("BELUM BAIK") { dg.2 += 1; }
            if let Some(s) = avg_s { dg.3 += s; dg.4 += 1; }

            let pk = pid.map(|x| x.to_string()).unwrap_or_else(|| "none".into());
            let pe = heat_prov.entry(pk).or_insert_with(|| (pid, pname.clone().unwrap_or_else(|| "(Belum diisi)".into()), HashMap::new(), 0, 0, 0));
            let pw = pe.2.entry(yw).or_insert((0, 0));
            pw.0 += 1;
            if r12.as_deref() == Some("BELUM BAIK") { pw.1 += 1; }
            pe.3 += 1;
            if r12.as_deref() == Some("BAIK") { pe.4 += 1; } else if r12.as_deref() == Some("BELUM BAIK") { pe.5 += 1; }
        }

        // SPPG accumulator (rows ordered newest first)
        let se = sppg_map.entry(nama_sppg.to_lowercase()).or_insert_with(|| SppgAcc {
            nama_sppg: nama_sppg.clone(),
            province_name: pname.clone(),
            kabkota_name: kname.clone(),
            puskesmas: puskesmas.clone(),
            last_tanggal: tgl_txt.clone(),
            last_rekap12: r12.clone(),
            last_rekap13: r13.clone(),
            ..Default::default()
        });
        se.kunjungan += 1;
        if se.last_rekap12.is_none() && r12.is_some() { se.last_rekap12 = r12.clone(); }
        if se.last_rekap13.is_none() && r13.is_some() { se.last_rekap13 = r13.clone(); }
        if let Some(s) = avg_s { se.skor_sum += s; se.skor_cnt += 1; }

        // Map regions
        let include_reg = if map_level == "kab" {
            kbid.is_some() && map_parent.map_or(true, |p| pid == Some(p))
        } else {
            pid.is_some()
        };
        if include_reg {
            let (rkey, rname, rgeo) = if map_level == "kab" {
                (kbid.unwrap().to_string(), kname.clone().unwrap_or_default(), kcode.clone().unwrap_or_default())
            } else {
                (pid.unwrap().to_string(), pname.clone().unwrap_or_default(), pcode.clone().unwrap_or_default())
            };
            let rg = reg_map.entry(rkey).or_insert_with(|| RegAcc { name: rname, geo: rgeo, ..Default::default() });
            rg.kunjungan += 1;
            if st_str == "dikirim" { rg.dikirim += 1; }
            if r12.as_deref() == Some("BAIK") { rg.r12_baik += 1; } else if r12.as_deref() == Some("BELUM BAIK") { rg.r12_belum += 1; }
            if r13.as_deref() == Some("BAIK") { rg.r13_baik += 1; } else if r13.as_deref() == Some("BELUM BAIK") { rg.r13_belum += 1; }
            if let Some(s) = avg_s { rg.skor_sum += s; rg.skor_cnt += 1; }
            rg.sppgs.insert(nama_sppg.to_lowercase());
        }

        if recent_kunjungan.len() < 50 {
            recent_kunjungan.push(json!({
                "id": kid, "no_kunjungan": no_k, "status": st_str, "tanggal": tgl_txt,
                "nama_sppg": nama_sppg, "puskesmas": puskesmas,
                "province_name": pname, "kabkota_name": kname,
                "forms_saved": f_saved, "forms_sent": f_sent,
                "rekap12": r12, "rekap13": r13,
                "avg_skor": avg_s.map(|x| (x * 10.0).round() / 10.0)
            }));
        }
    }

    // Fetch all mbg_form rows for kept visits to compute Form 1..13 breakdown, F1 ketenagaan, F2 SOP, and Form-week heatmap
    let kept_vec: Vec<i64> = kept_ids.iter().copied().collect();
    #[derive(Default)]
    struct FormStat {
        tersimpan: i64,
        dikirim: i64,
        draf: i64,
        sesuai: i64,
        tidak_sesuai: i64,
        skor_sum: f64,
        skor_cnt: i64,
        by_week_fail: HashMap<(i32, i32), i64>,
        by_week_all: HashMap<(i32, i32), i64>,
    }
    let mut form_stats: HashMap<i16, FormStat> = HashMap::new();
    let mut f1_total = 0i64;
    let mut f1_pengawas_ok = 0i64;
    let mut f1_b1_ok = 0i64;
    let mut f1_b2_ok = 0i64;
    let mut f1_penjamah_sum = 0i64;
    let mut f1_penjamah_cnt = 0i64;
    let mut f2_a_ok = vec![0i64; 7];
    let mut f2_a_tot = vec![0i64; 7];
    let mut f2_b_ok = vec![0i64; 8];
    let mut f2_b_tot = vec![0i64; 8];
    // PR 052: temuan "Tidak Sesuai" per butir (hanya formulir berstatus dikirim) → (form_no, kode) → (label, jumlah)
    let mut temuan: HashMap<(i16, String), (Option<String>, i64)> = HashMap::new();
    let mut form_dikirim: HashMap<i16, i64> = HashMap::new();

    if !kept_vec.is_empty() {
        let f_rows = c
            .query(
                "SELECT f.form_no, f.status, f.skor, f.kesimpulan, f.data, k.tanggal
                 FROM mbg_form f
                 JOIN mbg_kunjungan k ON k.id = f.kunjungan_id
                 WHERE f.kunjungan_id = ANY($1)",
                &[&kept_vec],
            )
            .await
            .map_err(internal)?;

        for r in &f_rows {
            let fno: i16 = r.get(0);
            let fst: String = r.get(1);
            let skor: Option<f64> = r.get(2);
            let kes: Option<String> = r.get(3);
            let dval: Value = r.get(4);
            let tgl: Option<NaiveDate> = r.get(5);

            let fs = form_stats.entry(fno).or_default();
            fs.tersimpan += 1;
            if fst == "dikirim" { fs.dikirim += 1; } else { fs.draf += 1; }
            if let Some(s) = skor { fs.skor_sum += s; fs.skor_cnt += 1; }
            let is_ok = matches!(kes.as_deref(), Some("Sesuai") | Some("BAIK"));
            let is_fail = matches!(kes.as_deref(), Some("Tidak Sesuai") | Some("BELUM BAIK"));
            if is_ok { fs.sesuai += 1; } else if is_fail { fs.tidak_sesuai += 1; }
            if let Some(d) = tgl {
                let yw = mmwr_week_of(d);
                *fs.by_week_all.entry(yw).or_insert(0) += 1;
                if is_fail {
                    *fs.by_week_fail.entry(yw).or_insert(0) += 1;
                }
            }

            if fst == "dikirim" {
                *form_dikirim.entry(fno).or_insert(0) += 1;
                for (kode, label) in temuan_form(fno, &dval) {
                    let t = temuan.entry((fno, kode)).or_insert((label, 0));
                    t.1 += 1;
                }
            }

            if fno == 1 {
                f1_total += 1;
                if let Some(h) = dval.get("_hasil").and_then(|v| v.as_object()) {
                    if h.get("a").and_then(|v| v.as_str()) == Some("Sesuai") { f1_pengawas_ok += 1; }
                    if h.get("b1").and_then(|v| v.as_str()) == Some("Sesuai") { f1_b1_ok += 1; }
                    if h.get("b2").and_then(|v| v.as_str()) == Some("Sesuai") { f1_b2_ok += 1; }
                    if let Some(tp) = h.get("total_penjamah").and_then(|v| v.as_f64()) {
                        f1_penjamah_sum += tp as i64;
                        f1_penjamah_cnt += 1;
                    }
                }
            } else if fno == 2 {
                if let Some(obj) = dval.as_object() {
                    for idx in 0..7 {
                        if let Some(v) = obj.get(&format!("a{}", idx + 1)).and_then(|x| x.as_str()) {
                            f2_a_tot[idx] += 1;
                            if v == "Sesuai" { f2_a_ok[idx] += 1; }
                        }
                    }
                    for idx in 0..8 {
                        if let Some(v) = obj.get(&format!("b{}", idx + 1)).and_then(|x| x.as_str()) {
                            f2_b_tot[idx] += 1;
                            if v == "Sesuai" { f2_b_ok[idx] += 1; }
                        }
                    }
                }
            }
        }
    }

    // Spatial points (using kept_vec)
    let mut points_out: Vec<Value> = vec![];
    if !kept_vec.is_empty() {
        let pts = c
            .query(
                "SELECT
                    COALESCE(NULLIF(trim(MAX(k.puskesmas)),''), MAX(mk.name), MAX(ml.name), 'Puskesmas'),
                    MAX(k.nama_sppg),
                    MAX(ml.name), MAX(mk.name),
                    COALESCE(AVG(CASE WHEN k.data->>'lat' ~ '^-?[0-9]{1,3}(\\.[0-9]+)?$' THEN (k.data->>'lat')::float8 END), MAX(f.latitude), MAX(mk.latitude), MAX(ml.latitude))::float8,
                    COALESCE(AVG(CASE WHEN k.data->>'lng' ~ '^-?[0-9]{1,3}(\\.[0-9]+)?$' THEN (k.data->>'lng')::float8 END), MAX(f.longitude), MAX(mk.longitude), MAX(ml.longitude))::float8,
                    CASE WHEN AVG(CASE WHEN k.data->>'lat' ~ '^-?[0-9]{1,3}(\\.[0-9]+)?$' THEN (k.data->>'lat')::float8 END) IS NOT NULL THEN 'sppg'
                         WHEN MAX(f.latitude) IS NOT NULL THEN 'fasyankes'
                         WHEN MAX(mk.latitude) IS NOT NULL THEN 'kabkota'
                         WHEN MAX(ml.latitude) IS NOT NULL THEN 'provinsi' ELSE NULL END,
                    COUNT(DISTINCT k.id)::bigint,
                    COUNT(DISTINCT k.id) FILTER (WHERE EXISTS (SELECT 1 FROM mbg_form mf WHERE mf.kunjungan_id = k.id AND mf.form_no = 12 AND mf.status = 'dikirim' AND mf.kesimpulan = 'BAIK'))::bigint,
                    COUNT(DISTINCT k.id) FILTER (WHERE EXISTS (SELECT 1 FROM mbg_form mf WHERE mf.kunjungan_id = k.id AND mf.form_no = 12 AND mf.status = 'dikirim' AND mf.kesimpulan = 'BELUM BAIK'))::bigint,
                    MAX(k.tanggal)::text,
                    AVG(sf.skor)::float8
                 FROM mbg_kunjungan k
                 LEFT JOIN mbg_form sf ON sf.kunjungan_id = k.id AND sf.form_no BETWEEN 3 AND 11 AND sf.status = 'dikirim' AND sf.skor IS NOT NULL
                 LEFT JOIN master_fasyankes f ON f.kode_satusehat = NULLIF(trim(k.data->>'unit_kode'),'')
                 LEFT JOIN master_kabkota mk ON mk.id = k.kabkota_id
                 LEFT JOIN master_locations ml ON ml.id = k.province_id
                 WHERE k.id = ANY($1)
                 GROUP BY lower(trim(COALESCE(k.nama_sppg,''))), k.kabkota_id, k.province_id
                 HAVING COALESCE(AVG(CASE WHEN k.data->>'lat' ~ '^-?[0-9]{1,3}(\\.[0-9]+)?$' THEN (k.data->>'lat')::float8 END), MAX(f.latitude), MAX(mk.latitude), MAX(ml.latitude)) IS NOT NULL
                    AND COALESCE(AVG(CASE WHEN k.data->>'lng' ~ '^-?[0-9]{1,3}(\\.[0-9]+)?$' THEN (k.data->>'lng')::float8 END), MAX(f.longitude), MAX(mk.longitude), MAX(ml.longitude)) IS NOT NULL
                 LIMIT 500",
                &[&kept_vec],
            )
            .await
            .map_err(internal)?;
        for r in &pts {
            points_out.push(json!({
                "unit_nama": r.get::<_, String>(0),
                "nama_sppg": r.get::<_, Option<String>>(1),
                "province_name": r.get::<_, Option<String>>(2),
                "kabkota_name": r.get::<_, Option<String>>(3),
                "lat": r.get::<_, f64>(4),
                "lng": r.get::<_, f64>(5),
                "coord_source": r.get::<_, Option<String>>(6),
                "kunjungan": n(r, 7),
                "rekap12_baik": n(r, 8),
                "rekap12_belum_baik": n(r, 9),
                "last_date": r.get::<_, Option<String>>(10),
                "avg_skor": r.get::<_, Option<f64>>(11).map(|x| (x * 10.0).round() / 10.0),
            }));
        }
    }

    let axis = build_week_axis(&obs_weeks);
    let mut hp_rows: Vec<Value> = heat_prov
        .into_values()
        .map(|(pid, name, wm, tk, tb, tbb)| {
            let vk: Vec<i64> = axis.iter().map(|(y, w, _, _)| wm.get(&(*y, *w)).map(|x| x.0).unwrap_or(0)).collect();
            let vf: Vec<i64> = axis.iter().map(|(y, w, _, _)| wm.get(&(*y, *w)).map(|x| x.1).unwrap_or(0)).collect();
            json!({
                "id": pid, "name": name, "values_kunjungan": vk, "values_belum_baik": vf,
                "total_kunjungan": tk, "rekap12_baik": tb, "rekap12_belum_baik": tbb
            })
        })
        .collect();
    hp_rows.sort_by(|a, b| b["total_kunjungan"].as_i64().cmp(&a["total_kunjungan"].as_i64()));

    let hf_rows: Vec<Value> = GIZI_FORMS_META
        .iter()
        .map(|(fno, short, _)| {
            let fs = form_stats.get(fno);
            let va: Vec<i64> = axis.iter().map(|(y, w, _, _)| fs.and_then(|s| s.by_week_all.get(&(*y, *w))).copied().unwrap_or(0)).collect();
            let vf: Vec<i64> = axis.iter().map(|(y, w, _, _)| fs.and_then(|s| s.by_week_fail.get(&(*y, *w))).copied().unwrap_or(0)).collect();
            json!({
                "form_no": fno, "name": format!("F{fno} · {short}"),
                "values_tersimpan": va, "values_tidak_sesuai": vf,
                "total_tersimpan": fs.map(|s| s.tersimpan).unwrap_or(0),
                "total_tidak_sesuai": fs.map(|s| s.tidak_sesuai).unwrap_or(0),
            })
        })
        .collect();

    let mut sppg_out: Vec<Value> = sppg_map
        .into_values()
        .map(|s| json!({
            "nama_sppg": s.nama_sppg, "province_name": s.province_name, "kabkota_name": s.kabkota_name,
            "puskesmas": s.puskesmas, "kunjungan": s.kunjungan, "last_tanggal": s.last_tanggal,
            "last_rekap12": s.last_rekap12, "last_rekap13": s.last_rekap13,
            "avg_skor": if s.skor_cnt > 0 { Some((s.skor_sum / s.skor_cnt as f64 * 10.0).round() / 10.0) } else { None }
        }))
        .collect();
    sppg_out.sort_by(|a, b| b["kunjungan"].as_i64().cmp(&a["kunjungan"].as_i64()));

    let mut reg_out: Vec<Value> = reg_map
        .into_iter()
        .map(|(k, v)| json!({
            "key": k, "name": v.name, "geo": v.geo,
            "kunjungan": v.kunjungan, "dikirim": v.dikirim,
            "rekap12_baik": v.r12_baik, "rekap12_belum_baik": v.r12_belum,
            "rekap13_baik": v.r13_baik, "rekap13_belum_baik": v.r13_belum,
            "avg_skor": if v.skor_cnt > 0 { Some((v.skor_sum / v.skor_cnt as f64 * 10.0).round() / 10.0) } else { None },
            "sppg_unik": v.sppgs.len() as i64
        }))
        .collect();
    reg_out.sort_by(|a, b| b["kunjungan"].as_i64().cmp(&a["kunjungan"].as_i64()));

    let mut temuan_out: Vec<Value> = temuan.into_iter().map(|((fno, kode), (label, cnt))| json!({
        "form_no": fno, "kode": kode, "label": label, "jumlah": cnt,
        "dinilai": form_dikirim.get(&fno).copied().unwrap_or(0),
        "pct": pct(cnt, form_dikirim.get(&fno).copied().unwrap_or(0)),
    })).collect();
    temuan_out.sort_by(|a, b| b["jumlah"].as_i64().cmp(&a["jumlah"].as_i64()).then_with(|| a["form_no"].as_i64().cmp(&b["form_no"].as_i64())).then_with(|| a["kode"].as_str().cmp(&b["kode"].as_str())));

    // PR 052b: matriks SPPG × Formulir (formulir dikirim) untuk heatmap kepatuhan per aspek
    let mut sppg_form_out: Vec<Value> = vec![];
    if !kept_vec.is_empty() {
        let rows = c
            .query(
                "SELECT lower(trim(k.nama_sppg)), MAX(trim(k.nama_sppg)), MAX(mk.name), MAX(ml.name), f.form_no,
                        COUNT(*)::bigint,
                        COUNT(*) FILTER (WHERE f.kesimpulan IN ('Sesuai','BAIK'))::bigint,
                        COUNT(*) FILTER (WHERE f.kesimpulan IN ('Tidak Sesuai','BELUM BAIK'))::bigint,
                        AVG(f.skor)::float8,
                        COUNT(DISTINCT k.id)::bigint
                 FROM mbg_form f
                 JOIN mbg_kunjungan k ON k.id = f.kunjungan_id
                 LEFT JOIN master_kabkota mk ON mk.id = k.kabkota_id
                 LEFT JOIN master_locations ml ON ml.id = k.province_id
                 WHERE f.kunjungan_id = ANY($1) AND f.status = 'dikirim' AND NULLIF(trim(k.nama_sppg),'') IS NOT NULL
                 GROUP BY 1, f.form_no",
                &[&kept_vec],
            )
            .await
            .map_err(internal)?;
        sppg_form_out = sppg_form_matrix(&rows.iter().map(|r| SppgFormCell {
            key: r.get(0), nama: r.get(1), kab: r.get(2), prov: r.get(3), form_no: r.get(4),
            n: r.get(5), ok: r.get(6), fail: r.get(7), skor: r.get(8), kunjungan: r.get(9),
        }).collect::<Vec<_>>());
    }

    // Dynamic filter options
    let opt_prov = c.query("SELECT DISTINCT ml.id, ml.name FROM mbg_kunjungan k JOIN master_locations ml ON ml.id = k.province_id WHERE k.deleted_at IS NULL ORDER BY ml.name", &[]).await.map_err(internal)?;
    let opt_kab = c.query("SELECT DISTINCT mk.id, mk.province_id, mk.name FROM mbg_kunjungan k JOIN master_kabkota mk ON mk.id = k.kabkota_id WHERE k.deleted_at IS NULL ORDER BY mk.name", &[]).await.map_err(internal)?;
    let opt_sppg = c.query("SELECT DISTINCT trim(nama_sppg) FROM mbg_kunjungan WHERE deleted_at IS NULL AND NULLIF(trim(nama_sppg),'') IS NOT NULL ORDER BY 1", &[]).await.map_err(internal)?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "kpis": {
                "total_kunjungan": kpis_total, "dikirim": kpis_dikirim, "draf": kpis_draf,
                "sppg_unik": sppg_set.len() as i64, "puskesmas_unik": pkm_set.len() as i64,
                "provinsi_unik": prov_set.len() as i64, "kabkota_unik": kab_set.len() as i64,
                "total_formulir_tersimpan": forms_saved_sum, "total_formulir_dikirim": forms_sent_sum,
                "rekap12_baik": r12_baik, "rekap12_belum_baik": r12_belum,
                "rekap13_baik": r13_baik, "rekap13_belum_baik": r13_belum,
                "avg_skor_sop": if skor_cnt > 0 { Some((skor_sum / skor_cnt as f64 * 10.0).round() / 10.0) } else { None },
                "wilayah_3t_ya": cnt_3t, "alergi_ya": cnt_alergi,
                "date_min": date_min.map(|d| d.format("%Y-%m-%d").to_string()),
                "date_max": date_max.map(|d| d.format("%Y-%m-%d").to_string()),
            },
            "by_formulir": GIZI_FORMS_META.iter().map(|(fno, short, title)| {
                let fs = form_stats.get(fno);
                let cnt = fs.map(|s| s.skor_cnt).unwrap_or(0);
                let sum = fs.map(|s| s.skor_sum).unwrap_or(0.0);
                json!({
                    "form_no": fno, "short": short, "title": title,
                    "tersimpan": fs.map(|s| s.tersimpan).unwrap_or(0),
                    "dikirim": fs.map(|s| s.dikirim).unwrap_or(0),
                    "draf": fs.map(|s| s.draf).unwrap_or(0),
                    "sesuai": fs.map(|s| s.sesuai).unwrap_or(0),
                    "tidak_sesuai": fs.map(|s| s.tidak_sesuai).unwrap_or(0),
                    "avg_skor": if cnt > 0 { Some((sum / cnt as f64 * 10.0).round() / 10.0) } else { None }
                })
            }).collect::<Vec<_>>(),
            "f1_ketenagaan": {
                "total": f1_total,
                "pengawas_sesuai": f1_pengawas_ok,
                "penjamah_b1_sesuai": f1_b1_ok,
                "pelatihan_b2_sesuai": f1_b2_ok,
                "avg_penjamah": if f1_penjamah_cnt > 0 { Some((f1_penjamah_sum as f64 / f1_penjamah_cnt as f64 * 10.0).round() / 10.0) } else { None },
            },
            "f2_sop": F2_SOP_NAMES.iter().enumerate().map(|(i, name)| json!({
                "nama": name,
                "tersedia_sesuai": if i < 7 { Some(f2_a_ok[i]) } else { None },
                "tersedia_total": if i < 7 { Some(f2_a_tot[i]) } else { None },
                "sosialisasi_sesuai": f2_b_ok[i],
                "sosialisasi_total": f2_b_tot[i],
            })).collect::<Vec<_>>(),
            "weekly_trend": week_map.into_iter().map(|((y, w), (kj, dik, dr, b, bb))| json!({
                "year": y, "week": w, "week_start": week_start_date(y, w).format("%Y-%m-%d").to_string(),
                "label": week_label(y, w), "kunjungan": kj, "dikirim": dik, "draf": dr,
                "rekap12_baik": b, "rekap12_belum_baik": bb,
                "avg_skor": week_skor.get(&(y, w)).filter(|x| x.1 > 0).map(|x| (x.0 / x.1 as f64 * 10.0).round() / 10.0)
            })).collect::<Vec<_>>(),
            "daily_series": daily_gizi.iter().map(|(d, (kj, b, bb, ss, sc))| json!({
                "tanggal": d.format("%Y-%m-%d").to_string(), "kunjungan": kj, "rekap12_baik": b, "rekap12_belum_baik": bb,
                "skor_sum": (ss * 10.0).round() / 10.0, "skor_n": sc
            })).collect::<Vec<_>>(),
            "temuan": temuan_out,
            "skor_distribusi": SKOR_BIN_LABEL.iter().enumerate().map(|(i, l)| json!({ "bin": l, "kunjungan": skor_bins[i] }))
                .chain(std::iter::once(json!({ "bin": "Belum ada skor", "kunjungan": skor_bin_none }))).collect::<Vec<_>>(),
            "sppg_form": sppg_form_out,
            "heatmap": {
                "weeks": axis.iter().map(|(y, w, s, l)| json!({ "year": y, "week": w, "start": s, "label": l })).collect::<Vec<_>>(),
                "by_province": hp_rows,
                "by_form": hf_rows,
            },
            "sppg_summary": sppg_out,
            "map": {
                "level": map_level, "parent": map_parent,
                "regions": reg_out,
                "points": points_out,
            },
            "recent_kunjungan": recent_kunjungan,
            "filter_options": {
                "provinces": opt_prov.iter().map(|r| json!({ "id": r.get::<_, i32>(0), "name": r.get::<_, String>(1) })).collect::<Vec<_>>(),
                "kabkota": opt_kab.iter().map(|r| json!({ "id": r.get::<_, i32>(0), "province_id": r.get::<_, i32>(1), "name": r.get::<_, String>(2) })).collect::<Vec<_>>(),
                "sppg": opt_sppg.iter().map(|r| r.get::<_, String>(0)).collect::<Vec<_>>(),
            }
        }
    })))
}

// ─── 2. KERACUNAN PANGAN MBG (`mbg_keracunan` + `mbg_keracunan_update`) ────────

#[derive(Deserialize, Default)]
pub struct KeracunanDashQuery {
    pub status: Option<String>,
    pub lab_status: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub province_id: Option<String>,
    pub kabkota_id: Option<String>,
    pub sppg: Option<String>,
    pub ikl: Option<String>,
    pub slhs: Option<String>,
    pub level: Option<String>,
    pub parent: Option<i32>,
    /// PR 052: daftar nama kecamatan (dipisah koma) & potongan nama sekolah
    pub kecamatan: Option<String>,
    pub sekolah: Option<String>,
}

const KERACUNAN_USIA: &[(&str, &str)] = &[
    ("usia_lt5", "< 5 th"),
    ("usia_5_9", "5–9 th"),
    ("usia_10_14", "10–14 th"),
    ("usia_15_19", "15–19 th"),
    ("usia_gt19", "> 19 th"),
];

const KERACUNAN_WHERE: &str = "k.deleted_at IS NULL
    AND ($1::text IS NULL OR k.status = $1)
    AND ($2::text IS NULL OR k.lab_status = $2)
    AND ($3::date IS NULL OR k.tgl_kejadian::date >= $3)
    AND ($4::date IS NULL OR k.tgl_kejadian::date <= $4)
    AND (cardinality($5::int[]) = 0 OR k.province_id = ANY($5))
    AND (cardinality($6::int[]) = 0 OR k.kabkota_id = ANY($6))
    AND ($7::text IS NULL OR lower(trim(COALESCE(k.nama_sppg,''))) = lower(trim($7)))
    AND ($8::text IS NULL OR COALESCE(k.data->>'ikl','') = $8)
    AND ($9::text IS NULL OR COALESCE(k.data->>'slhs','') = $9)
    AND (cardinality($10::text[]) = 0 OR lower(trim(COALESCE(k.kecamatan_nama,''))) = ANY($10))
    AND ($11::text IS NULL OR (COALESCE(k.sekolah,'') || ' ' || COALESCE(k.data->>'sekolah','')) ILIKE '%' || $11 || '%')";

/// GET /api/v1/dasbor/mbg/keracunan
pub async fn keracunan(State(st): State<AppState>, Query(q): Query<KeracunanDashQuery>) -> Result<Json<Value>, ApiError> {
    let c = st.pool.get().await.map_err(internal)?;
    let status = opt_str(&q.status).filter(|s| matches!(s.as_str(), "draf" | "dilaporkan" | "ditutup"));
    let lab_status = opt_str(&q.lab_status).filter(|s| matches!(s.as_str(), "belum" | "dikirim" | "hasil"));
    let from = opt_date(&q.from);
    let to = opt_date(&q.to);
    let prov = csv_ints(&q.province_id);
    let kab = csv_ints(&q.kabkota_id);
    let sppg = opt_str(&q.sppg);
    let ikl = opt_str(&q.ikl).filter(|s| s == "Memenuhi Syarat" || s == "Tidak Memenuhi Syarat");
    let slhs = opt_str(&q.slhs).filter(|s| s == "Ya" || s == "Tidak");
    let kec: Vec<String> = q.kecamatan.as_deref().unwrap_or("").split(',').map(|x| x.trim().to_lowercase()).filter(|x| !x.is_empty()).collect();
    let sekolah = opt_str(&q.sekolah).map(|x| x.replace(['%', '_'], ""));
    let params: Vec<&(dyn ToSql + Sync)> = vec![&status, &lab_status, &from, &to, &prov, &kab, &sppg, &ikl, &slhs, &kec, &sekolah];

    let rows = c
        .query(
            &format!(
                "SELECT k.id, k.no_laporan, k.status, k.lab_status,
                        k.tgl_kejadian::date, to_char(k.tgl_kejadian, 'YYYY-MM-DD HH24:MI'),
                        k.province_id, ml.name, ml.code,
                        k.kabkota_id, mk.name, replace(mk.kemendagri_code, '.', ''),
                        k.nama_sppg, k.yayasan_sppg,
                        COALESCE(k.jumlah_kasus, 0)::bigint,
                        COALESCE(k.jumlah_meninggal, 0)::bigint,
                        k.jumlah_terpapar::bigint,
                        k.data,
                        NULLIF(trim(k.kecamatan_nama), ''), NULLIF(trim(k.sekolah), ''),
                        (k.reported_at AT TIME ZONE 'Asia/Jakarta'), k.tgl_kejadian
                 FROM mbg_keracunan k
                 LEFT JOIN master_locations ml ON ml.id = k.province_id
                 LEFT JOIN master_kabkota mk ON mk.id = k.kabkota_id
                 WHERE {KERACUNAN_WHERE}
                 ORDER BY k.tgl_kejadian DESC NULLS LAST, k.id DESC"
            ),
            &params,
        )
        .await
        .map_err(internal)?;

    // Cross-reference latest Pengawasan Gizi status per SPPG (non-PII)
    let gizi_sppg_rows = c
        .query(
            "SELECT lower(trim(k.nama_sppg)),
                    COUNT(DISTINCT k.id)::bigint,
                    (ARRAY_AGG(f12.kesimpulan ORDER BY k.tanggal DESC NULLS LAST, k.id DESC) FILTER (WHERE f12.kesimpulan IS NOT NULL))[1],
                    (ARRAY_AGG(f13.kesimpulan ORDER BY k.tanggal DESC NULLS LAST, k.id DESC) FILTER (WHERE f13.kesimpulan IS NOT NULL))[1],
                    AVG(sk.avg_skor)::float8,
                    MAX(k.tanggal)::text
             FROM mbg_kunjungan k
             LEFT JOIN mbg_form f12 ON f12.kunjungan_id = k.id AND f12.form_no = 12 AND f12.status = 'dikirim'
             LEFT JOIN mbg_form f13 ON f13.kunjungan_id = k.id AND f13.form_no = 13 AND f13.status = 'dikirim'
             LEFT JOIN LATERAL (SELECT AVG(f.skor) AS avg_skor FROM mbg_form f
                                WHERE f.kunjungan_id = k.id AND f.form_no BETWEEN 3 AND 11 AND f.skor IS NOT NULL) sk ON TRUE
             WHERE k.deleted_at IS NULL AND NULLIF(trim(k.nama_sppg),'') IS NOT NULL
             GROUP BY 1",
            &[],
        )
        .await
        .map_err(internal)?;
    let gizi_by_sppg: HashMap<String, (i64, Option<String>, Option<String>, Option<f64>, Option<String>)> = gizi_sppg_rows
        .into_iter()
        .map(|r| (r.get(0), (r.get(1), r.get(2), r.get(3), r.get(4), r.get(5))))
        .collect();

    let mut kept_ids: Vec<i64> = vec![];
    let mut kpis_total = 0i64;
    let mut kpis_draf = 0i64;
    let mut kpis_dilaporkan = 0i64;
    let mut kpis_ditutup = 0i64;
    let mut kpis_kasus = 0i64;
    let mut kpis_meninggal = 0i64;
    let mut kpis_terpapar = 0i64;
    let mut kpis_ar_kasus = 0i64;
    let mut kpis_ar_terpapar = 0i64;
    let mut kpis_inap = 0i64;
    let mut kpis_jalan = 0i64;
    let mut kpis_sembuh = 0i64;
    let mut kpis_sekolah = 0i64;
    let mut ink_sum = 0.0f64;
    let mut ink_cnt = 0i64;
    let mut lab_belum = 0i64;
    let mut lab_dikirim = 0i64;
    let mut lab_hasil = 0i64;
    let mut slhs_map: HashMap<String, i64> = HashMap::new();
    let mut ikl_map: HashMap<String, i64> = HashMap::new();
    let mut sppg_set: HashSet<String> = HashSet::new();
    let mut prov_set: HashSet<i32> = HashSet::new();
    let mut kab_set: HashSet<i32> = HashSet::new();
    let mut date_min: Option<NaiveDate> = None;
    let mut date_max: Option<NaiveDate> = None;

    let mut pria_sum = 0i64;
    let mut wanita_sum = 0i64;
    let mut usia_sums = vec![0i64; KERACUNAN_USIA.len()];
    let mut balita_sum = 0i64;
    let mut bumil_sum = 0i64;
    let mut busui_sum = 0i64;
    let mut penjamah_tot = 0i64;
    let mut penjamah_sert = 0i64;

    let mut gejala_map: HashMap<String, (i64, i64)> = HashMap::new(); // (kejadian, total_kasus_gejala)
    let mut air_map: HashMap<String, i64> = HashMap::new();
    let mut sop_map: HashMap<String, (i64, i64, i64, i64)> = HashMap::new(); // (ada, tidak_ada, dilakukan, tidak_dilakukan)
    let mut samp_map: HashMap<String, (i64, i64, i64, i64, i64, i64)> = HashMap::new(); // (total, mikro+, mikro-, kimia+, kimia-, belum)
    let mut checklist_counts: [HashMap<String, i64>; 6] = Default::default();

    let mut week_map: BTreeMap<(i32, i32), (i64, i64, i64, i64)> = BTreeMap::new(); // (kej, ks, men, terp)
    let mut heat_prov: HashMap<String, (Option<i32>, String, HashMap<(i32, i32), (i64, i64)>, i64, i64, i64)> = HashMap::new();
    let mut obs_weeks: Vec<(i32, i32)> = vec![];

    #[derive(Default)]
    struct SppgIncAcc {
        nama_sppg: String,
        yayasan_sppg: Option<String>,
        province_name: Option<String>,
        kabkota_name: Option<String>,
        kejadian: i64,
        kasus: i64,
        meninggal: i64,
        terpapar: i64,
        last_kejadian: Option<String>,
    }
    let mut sppg_inc: HashMap<String, SppgIncAcc> = HashMap::new();

    #[derive(Default)]
    struct RegAcc {
        name: String,
        geo: String,
        kejadian: i64,
        kasus: i64,
        meninggal: i64,
        terpapar: i64,
        lab_hasil: i64,
        ditutup: i64,
        sppgs: HashSet<String>,
    }
    let mut reg_map: HashMap<String, RegAcc> = HashMap::new();
    let map_level = q.level.clone().filter(|x| x == "kab").unwrap_or_else(|| "prov".into());
    let map_parent = q.parent;
    let mut recent_incidents: Vec<Value> = vec![];
    // PR 052
    let mut daily_ker: BTreeMap<NaiveDate, (i64, i64, i64, i64, i64)> = BTreeMap::new(); // (kej, kasus, meninggal, terpapar, rawat inap)
    let mut rank_prov: HashMap<String, RankAcc> = HashMap::new();
    let mut rank_kab: HashMap<String, RankAcc> = HashMap::new();
    let mut rank_kec: HashMap<String, RankAcc> = HashMap::new();
    let mut lapor_jam: Vec<f64> = vec![];
    let mut gejala_lapor_jam: Vec<f64> = vec![];
    let mut belum_lapor = 0i64;
    let mut lab_tat_jam: Vec<f64> = vec![];
    let mut lab_positif_kejadian = 0i64;
    let mut menu_map: HashMap<(String, String), (String, i64, i64)> = HashMap::new(); // (komponen, nama lc) → (nama, kejadian, kasus)
    let mut pangan_pos: HashMap<String, (String, String, i64, i64)> = HashMap::new(); // nama lc → (nama, kategori, positif, diuji)

    for r in &rows {
        let id: i64 = r.get(0);
        let no_lap: String = r.get(1);
        let st_str: String = r.get(2);
        let lst: String = r.get(3);
        let tgl_d: Option<NaiveDate> = r.get(4);
        let tgl_txt: Option<String> = r.get(5);
        let pid: Option<i32> = r.get(6);
        let pname: Option<String> = r.get(7);
        let pcode: Option<String> = r.get(8);
        let kbid: Option<i32> = r.get(9);
        let kname: Option<String> = r.get(10);
        let kcode: Option<String> = r.get(11);
        let nama_sppg: Option<String> = r.get(12);
        let yayasan: Option<String> = r.get(13);
        let kasus: i64 = r.get(14);
        let meninggal: i64 = r.get(15);
        let terpapar_col: Option<i64> = r.get(16);
        let data_val: Value = r.get(17);
        let kec_nama: Option<String> = r.get(18);
        let sekolah_col: Option<String> = r.get(19);
        let reported_local: Option<NaiveDateTime> = r.get(20);
        let tgl_dt: Option<NaiveDateTime> = r.get(21);
        let empty = serde_json::Map::new();
        let d = data_val.as_object().unwrap_or(&empty);
        let inap_i = json_int(d.get("rawat_inap"));

        kept_ids.push(id);
        kpis_total += 1;
        match st_str.as_str() {
            "draf" => kpis_draf += 1,
            "dilaporkan" => kpis_dilaporkan += 1,
            "ditutup" => kpis_ditutup += 1,
            _ => {}
        }
        match lst.as_str() {
            "belum" => lab_belum += 1,
            "dikirim" => lab_dikirim += 1,
            "hasil" => lab_hasil += 1,
            _ => {}
        }

        // Terpapar: column or fallback to _hasil.terpapar (total porsi sekolah entered in form)
        let terp_eff = terpapar_col.or_else(|| d.get("_hasil").and_then(|h| h.get("terpapar")).and_then(|v| v.as_i64()));
        kpis_kasus += kasus;
        kpis_meninggal += meninggal;
        if let Some(t) = terp_eff {
            kpis_terpapar += t;
            if t > 0 && kasus <= t {
                kpis_ar_kasus += kasus;
                kpis_ar_terpapar += t;
            }
        }

        kpis_inap += json_int(d.get("rawat_inap"));
        kpis_jalan += json_int(d.get("rawat_jalan"));
        kpis_sembuh += json_int(d.get("sembuh"));

        let sekolah_cnt = d.get("sekolah").and_then(|v| v.as_array()).map(|a| a.len() as i64).unwrap_or(0);
        let js_field = json_int(d.get("jumlah_sekolah"));
        kpis_sekolah += sekolah_cnt.max(js_field);

        let ink_v = json_dec(d.get("inkubasi_rata"))
            .or_else(|| d.get("_hasil").and_then(|h| json_dec(h.get("inkubasi_saran"))));
        if let Some(iv) = ink_v {
            ink_sum += iv;
            ink_cnt += 1;
        }

        let slhs_v = d.get("slhs").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()).unwrap_or("(Belum diisi)").to_string();
        *slhs_map.entry(slhs_v.clone()).or_insert(0) += 1;
        let ikl_v = d.get("ikl").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()).unwrap_or("(Belum diisi)").to_string();
        *ikl_map.entry(ikl_v.clone()).or_insert(0) += 1;

        if let Some(sp) = nama_sppg.as_ref().map(|x| x.trim()).filter(|x| !x.is_empty()) {
            sppg_set.insert(sp.to_lowercase());
            let se = sppg_inc.entry(sp.to_lowercase()).or_insert_with(|| SppgIncAcc {
                nama_sppg: sp.to_string(),
                yayasan_sppg: yayasan.clone(),
                province_name: pname.clone(),
                kabkota_name: kname.clone(),
                last_kejadian: tgl_txt.clone(),
                ..Default::default()
            });
            se.kejadian += 1;
            se.kasus += kasus;
            se.meninggal += meninggal;
            se.terpapar += terp_eff.unwrap_or(0);
        }
        if let Some(p) = pid { prov_set.insert(p); }
        if let Some(kb) = kbid { kab_set.insert(kb); }

        pria_sum += json_int(d.get("pria"));
        wanita_sum += json_int(d.get("wanita"));
        for (idx, (uk, _)) in KERACUNAN_USIA.iter().enumerate() {
            usia_sums[idx] += json_int(d.get(*uk));
        }
        balita_sum += json_int(d.get("balita"));
        bumil_sum += json_int(d.get("ibu_hamil"));
        busui_sum += json_int(d.get("ibu_menyusui"));
        penjamah_tot += json_int(d.get("penjamah_total"));
        penjamah_sert += json_int(d.get("penjamah_sertifikasi"));

        if let Some(arr) = d.get("gejala").and_then(|v| v.as_array()) {
            for item in arr {
                if let Some(o) = item.as_object() {
                    if let Some(nm) = o.get("nama").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()) {
                        let jml = json_int(o.get("jumlah"));
                        let ge = gejala_map.entry(nm.to_string()).or_insert((0, 0));
                        ge.0 += 1;
                        ge.1 += jml;
                    }
                }
            }
        }
        if let Some(arr) = d.get("sumber_air").and_then(|v| v.as_array()) {
            for item in arr {
                if let Some(o) = item.as_object() {
                    if let Some(sr) = o.get("sumber").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()) {
                        *air_map.entry(sr.to_string()).or_insert(0) += 1;
                    }
                }
            }
        }
        if let Some(arr) = d.get("sop").and_then(|v| v.as_array()) {
            for item in arr {
                if let Some(o) = item.as_object() {
                    if let Some(nm) = o.get("nama").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()) {
                        let se = sop_map.entry(nm.to_string()).or_insert((0, 0, 0, 0));
                        match o.get("ada").and_then(|v| v.as_str()) {
                            Some("Ada") => se.0 += 1,
                            Some("Tidak Ada") => se.1 += 1,
                            _ => {}
                        }
                        match o.get("dilakukan").and_then(|v| v.as_str()) {
                            Some("Dilakukan") => se.2 += 1,
                            Some("Tidak Dilakukan") => se.3 += 1,
                            _ => {}
                        }
                    }
                }
            }
        }
        if let Some(arr) = d.get("sampel").and_then(|v| v.as_array()) {
            for item in arr {
                if let Some(o) = item.as_object() {
                    let kat = o.get("kategori").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()).unwrap_or("Lainnya").to_string();
                    let se = samp_map.entry(kat).or_insert((0, 0, 0, 0, 0, 0));
                    se.0 += 1;
                    let m = o.get("mikro").and_then(|v| v.as_str());
                    let k = o.get("kimia").and_then(|v| v.as_str());
                    match m { Some("Positif") => se.1 += 1, Some("Negatif") => se.2 += 1, _ => {} }
                    match k { Some("Positif") => se.3 += 1, Some("Negatif") => se.4 += 1, _ => {} }
                    if !matches!(m, Some("Positif") | Some("Negatif")) && !matches!(k, Some("Positif") | Some("Negatif")) {
                        se.5 += 1;
                    }
                }
            }
        }
        for (idx, key) in ["bank_sampel", "limbah_pencatatan", "aduan_hari_h", "angkut_box_sekat", "angkut_box_tanpa", "angkut_motor"].iter().enumerate() {
            let val = d.get(*key).and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()).unwrap_or("(Belum diisi)").to_string();
            *checklist_counts[idx].entry(val).or_insert(0) += 1;
        }

        // PR 052: seri harian, ranking wilayah, ketepatan lapor, lab, pangan
        let terp_ar = terp_eff.filter(|t| *t > 0 && kasus <= *t);
        if let Some(dt) = tgl_d {
            let e = daily_ker.entry(dt).or_insert((0, 0, 0, 0, 0));
            e.0 += 1; e.1 += kasus; e.2 += meninggal; e.3 += terp_eff.unwrap_or(0); e.4 += inap_i;
        }
        rank_add(&mut rank_prov, pid.map(|x| x.to_string()).unwrap_or_else(|| "none".into()), pid, pname.clone(), None, kasus, meninggal, terp_eff, terp_ar, inap_i);
        rank_add(&mut rank_kab, kbid.map(|x| x.to_string()).unwrap_or_else(|| "none".into()), kbid, kname.clone(), pname.clone(), kasus, meninggal, terp_eff, terp_ar, inap_i);
        rank_add(&mut rank_kec, format!("{}|{}", kbid.unwrap_or(0), kec_nama.as_deref().unwrap_or("").to_lowercase()), None, kec_nama.clone(), kname.clone(), kasus, meninggal, terp_eff, terp_ar, inap_i);
        let lapor_h = match (reported_local, tgl_dt) {
            (Some(rp), Some(tk)) => Some(((rp - tk).num_minutes() as f64 / 60.0).max(0.0)),
            _ => None,
        };
        match lapor_h {
            Some(h) => lapor_jam.push(h),
            None => belum_lapor += 1,
        }
        if let (Some(rp), Some(g)) = (reported_local, d.get("jam_gejala").and_then(|v| v.as_str()).and_then(parse_dt)) {
            gejala_lapor_jam.push(((rp - g).num_minutes() as f64 / 60.0).max(0.0));
        }
        if let (Some(a), Some(b)) = (
            d.get("lab_tgl_ambil").and_then(|v| v.as_str()).and_then(parse_dt),
            d.get("lab_tgl_hasil").and_then(|v| v.as_str()).and_then(parse_dt),
        ) {
            if b >= a { lab_tat_jam.push((b - a).num_minutes() as f64 / 60.0); }
        }
        for (key, komp) in [("menu_karbo", "Karbohidrat"), ("menu_protein1", "Protein"), ("menu_protein2", "Protein"), ("menu_sayur", "Sayur"), ("menu_buah", "Buah")] {
            if let Some(nm) = d.get(key).and_then(|v| v.as_str()).map(str::trim).filter(|x| !x.is_empty()) {
                let m = menu_map.entry((komp.to_string(), nm.to_lowercase())).or_insert((nm.to_string(), 0, 0));
                m.1 += 1;
                m.2 += kasus;
            }
        }
        let mut any_pos = false;
        if let Some(arr) = d.get("sampel").and_then(|v| v.as_array()) {
            for o in arr.iter().filter_map(|x| x.as_object()) {
                let pos = o.get("mikro").and_then(|v| v.as_str()) == Some("Positif") || o.get("kimia").and_then(|v| v.as_str()) == Some("Positif");
                let tested = pos || o.get("mikro").and_then(|v| v.as_str()) == Some("Negatif") || o.get("kimia").and_then(|v| v.as_str()) == Some("Negatif");
                any_pos |= pos;
                let kat = o.get("kategori").and_then(|v| v.as_str()).map(str::trim).filter(|x| !x.is_empty()).unwrap_or("Lainnya").to_string();
                let nm = o.get("sampel").and_then(|v| v.as_str()).map(str::trim).filter(|x| !x.is_empty()).map(String::from).unwrap_or_else(|| kat.clone());
                if tested {
                    let pe = pangan_pos.entry(nm.to_lowercase()).or_insert((nm.clone(), kat.clone(), 0, 0));
                    pe.3 += 1;
                    if pos { pe.2 += 1; }
                }
            }
        }
        if any_pos { lab_positif_kejadian += 1; }

        if let Some(dt) = tgl_d {
            date_min = Some(match date_min { Some(m) => m.min(dt), None => dt });
            date_max = Some(match date_max { Some(m) => m.max(dt), None => dt });
            let yw = mmwr_week_of(dt);
            obs_weeks.push(yw);
            let w = week_map.entry(yw).or_insert((0, 0, 0, 0));
            w.0 += 1; w.1 += kasus; w.2 += meninggal; w.3 += terp_eff.unwrap_or(0);

            let pk = pid.map(|x| x.to_string()).unwrap_or_else(|| "none".into());
            let pe = heat_prov.entry(pk).or_insert_with(|| (pid, pname.clone().unwrap_or_else(|| "(Belum diisi)".into()), HashMap::new(), 0, 0, 0));
            let pw = pe.2.entry(yw).or_insert((0, 0));
            pw.0 += 1; pw.1 += kasus;
            pe.3 += 1; pe.4 += kasus; pe.5 += meninggal;
        }

        let include_reg = if map_level == "kab" {
            kbid.is_some() && map_parent.map_or(true, |p| pid == Some(p))
        } else {
            pid.is_some()
        };
        if include_reg {
            let (rkey, rname, rgeo) = if map_level == "kab" {
                (kbid.unwrap().to_string(), kname.clone().unwrap_or_default(), kcode.clone().unwrap_or_default())
            } else {
                (pid.unwrap().to_string(), pname.clone().unwrap_or_default(), pcode.clone().unwrap_or_default())
            };
            let rg = reg_map.entry(rkey).or_insert_with(|| RegAcc { name: rname, geo: rgeo, ..Default::default() });
            rg.kejadian += 1;
            rg.kasus += kasus;
            rg.meninggal += meninggal;
            rg.terpapar += terp_eff.unwrap_or(0);
            if lst == "hasil" { rg.lab_hasil += 1; }
            if st_str == "ditutup" { rg.ditutup += 1; }
            if let Some(sp) = nama_sppg.as_ref().map(|x| x.trim()).filter(|x| !x.is_empty()) {
                rg.sppgs.insert(sp.to_lowercase());
            }
        }

        if recent_incidents.len() < 1000 {
            let ar_i = terp_eff.filter(|t| *t > 0 && kasus <= *t).and_then(|t| pct(kasus, t));
            let cfr_i = pct(meninggal, kasus);
            recent_incidents.push(json!({
                "id": id, "no_laporan": no_lap, "status": st_str, "lab_status": lst,
                "tgl_kejadian": tgl_txt, "nama_sppg": nama_sppg, "yayasan_sppg": yayasan,
                "province_name": pname, "kabkota_name": kname,
                "jumlah_kasus": kasus, "jumlah_meninggal": meninggal, "jumlah_terpapar": terp_eff,
                "ar_pct": ar_i, "cfr_pct": cfr_i, "sekolah_count": sekolah_cnt.max(js_field),
                "ikl": if ikl_v == "(Belum diisi)" { None } else { Some(ikl_v) },
                "slhs": if slhs_v == "(Belum diisi)" { None } else { Some(slhs_v) },
                "kecamatan": kec_nama, "sekolah": sekolah_col, "rawat_inap": inap_i,
                "tgl_lapor": reported_local.map(|x| x.format("%Y-%m-%d %H:%M").to_string()),
                "lapor_jam": lapor_h.map(|h| (h * 10.0).round() / 10.0),
            }));
        }
    }

    // Daily updates evolution (`mbg_keracunan_update`) for kept incidents
    let mut daily_updates: Vec<Value> = vec![];
    let mut points_out: Vec<Value> = vec![];
    if !kept_ids.is_empty() {
        let upd_rows = c
            .query(
                "SELECT u.tanggal::text,
                        COUNT(DISTINCT u.keracunan_id)::bigint,
                        COALESCE(SUM(u.kasus), 0)::bigint,
                        COALESCE(SUM(u.meninggal), 0)::bigint,
                        COALESCE(SUM(COALESCE(u.rawat_inap, 0)), 0)::bigint,
                        COALESCE(SUM(COALESCE(u.rawat_jalan, 0)), 0)::bigint,
                        COALESCE(SUM(COALESCE(u.sembuh, 0)), 0)::bigint
                 FROM mbg_keracunan_update u
                 WHERE u.keracunan_id = ANY($1)
                 GROUP BY u.tanggal
                 ORDER BY u.tanggal",
                &[&kept_ids],
            )
            .await
            .map_err(internal)?;
        for r in &upd_rows {
            daily_updates.push(json!({
                "tanggal": r.get::<_, String>(0),
                "kejadian": n(r, 1), "kasus": n(r, 2), "meninggal": n(r, 3),
                "rawat_inap": n(r, 4), "rawat_jalan": n(r, 5), "sembuh": n(r, 6)
            }));
        }

        let pts = c
            .query(
                "SELECT
                    COALESCE(NULLIF(trim(MAX(k.nama_sppg)),''), MAX(mk.name), MAX(ml.name), 'Kejadian MBG'),
                    MAX(k.nama_sppg),
                    MAX(ml.name), MAX(mk.name),
                    COALESCE(AVG(CASE WHEN k.data->>'lat' ~ '^-?[0-9]{1,3}(\\.[0-9]+)?$' THEN (k.data->>'lat')::float8 END), MAX(mk.latitude), MAX(ml.latitude))::float8,
                    COALESCE(AVG(CASE WHEN k.data->>'lng' ~ '^-?[0-9]{1,3}(\\.[0-9]+)?$' THEN (k.data->>'lng')::float8 END), MAX(mk.longitude), MAX(ml.longitude))::float8,
                    CASE WHEN AVG(CASE WHEN k.data->>'lat' ~ '^-?[0-9]{1,3}(\\.[0-9]+)?$' THEN (k.data->>'lat')::float8 END) IS NOT NULL THEN 'sppg'
                         WHEN MAX(mk.latitude) IS NOT NULL THEN 'kabkota'
                         WHEN MAX(ml.latitude) IS NOT NULL THEN 'provinsi' ELSE NULL END,
                    COUNT(*)::bigint,
                    COALESCE(SUM(COALESCE(k.jumlah_kasus,0)),0)::bigint,
                    COALESCE(SUM(COALESCE(k.jumlah_meninggal,0)),0)::bigint,
                    COUNT(*) FILTER (WHERE k.lab_status = 'hasil')::bigint,
                    MAX(k.tgl_kejadian::date)::text
                 FROM mbg_keracunan k
                 LEFT JOIN master_kabkota mk ON mk.id = k.kabkota_id
                 LEFT JOIN master_locations ml ON ml.id = k.province_id
                 WHERE k.id = ANY($1)
                 GROUP BY lower(trim(COALESCE(k.nama_sppg,''))), k.kabkota_id, k.province_id
                 HAVING COALESCE(AVG(CASE WHEN k.data->>'lat' ~ '^-?[0-9]{1,3}(\\.[0-9]+)?$' THEN (k.data->>'lat')::float8 END), MAX(mk.latitude), MAX(ml.latitude)) IS NOT NULL
                    AND COALESCE(AVG(CASE WHEN k.data->>'lng' ~ '^-?[0-9]{1,3}(\\.[0-9]+)?$' THEN (k.data->>'lng')::float8 END), MAX(mk.longitude), MAX(ml.longitude)) IS NOT NULL
                 LIMIT 500",
                &[&kept_ids],
            )
            .await
            .map_err(internal)?;
        for r in &pts {
            points_out.push(json!({
                "label": r.get::<_, String>(0),
                "nama_sppg": r.get::<_, Option<String>>(1),
                "province_name": r.get::<_, Option<String>>(2),
                "kabkota_name": r.get::<_, Option<String>>(3),
                "lat": r.get::<_, f64>(4),
                "lng": r.get::<_, f64>(5),
                "coord_source": r.get::<_, Option<String>>(6),
                "kejadian": n(r, 7), "kasus": n(r, 8), "meninggal": n(r, 9),
                "lab_hasil": n(r, 10), "last_date": r.get::<_, Option<String>>(11),
            }));
        }
    }

    let axis = build_week_axis(&obs_weeks);
    let mut hp_rows: Vec<Value> = heat_prov
        .into_values()
        .map(|(pid, name, wm, tkj, tks, tmn)| {
            let vkj: Vec<i64> = axis.iter().map(|(y, w, _, _)| wm.get(&(*y, *w)).map(|x| x.0).unwrap_or(0)).collect();
            let vks: Vec<i64> = axis.iter().map(|(y, w, _, _)| wm.get(&(*y, *w)).map(|x| x.1).unwrap_or(0)).collect();
            json!({
                "id": pid, "name": name, "values_kejadian": vkj, "values_kasus": vks,
                "total_kejadian": tkj, "total_kasus": tks, "total_meninggal": tmn
            })
        })
        .collect();
    hp_rows.sort_by(|a, b| b["total_kasus"].as_i64().cmp(&a["total_kasus"].as_i64()));

    let mut gejala_out: Vec<Value> = gejala_map
        .into_iter()
        .map(|(nama, (kej, jml))| json!({
            "nama": nama, "kejadian": kej, "jumlah_kasus": jml, "pct_kasus": pct(jml, kpis_kasus)
        }))
        .collect();
    gejala_out.sort_by(|a, b| b["jumlah_kasus"].as_i64().cmp(&a["jumlah_kasus"].as_i64()));

    let mut sop_gap: Vec<Value> = sop_map
        .into_iter()
        .map(|(nama, (ada, t_ada, dil, t_dil))| json!({
            "nama": nama, "ada": ada, "tidak_ada": t_ada, "dilakukan": dil, "tidak_dilakukan": t_dil,
            "gap_total": t_ada + t_dil
        }))
        .collect();
    sop_gap.sort_by(|a, b| b["gap_total"].as_i64().cmp(&a["gap_total"].as_i64()).then_with(|| a["nama"].as_str().cmp(&b["nama"].as_str())));

    let mut air_out: Vec<Value> = air_map.into_iter().map(|(s, c)| json!({ "sumber": s, "count": c })).collect();
    air_out.sort_by(|a, b| b["count"].as_i64().cmp(&a["count"].as_i64()));

    let mut samp_out: Vec<Value> = samp_map
        .into_iter()
        .map(|(kat, (tot, mp, mn, kp, kn, blm))| json!({
            "kategori": kat, "total": tot, "mikro_positif": mp, "mikro_negatif": mn,
            "kimia_positif": kp, "kimia_negatif": kn, "belum": blm
        }))
        .collect();
    samp_out.sort_by(|a, b| b["total"].as_i64().cmp(&a["total"].as_i64()));

    let mut sppg_out: Vec<Value> = sppg_inc
        .into_iter()
        .map(|(key, s)| {
            let g = gizi_by_sppg.get(&key);
            json!({
                "nama_sppg": s.nama_sppg, "yayasan_sppg": s.yayasan_sppg,
                "province_name": s.province_name, "kabkota_name": s.kabkota_name,
                "kejadian": s.kejadian, "kasus": s.kasus, "meninggal": s.meninggal, "terpapar": s.terpapar,
                "last_kejadian": s.last_kejadian,
                "pengawasan_kunjungan": g.map(|x| x.0).unwrap_or(0),
                "pengawasan_rekap12": g.and_then(|x| x.1.clone()),
                "pengawasan_rekap13": g.and_then(|x| x.2.clone()),
                "pengawasan_avg_skor": g.and_then(|x| x.3).map(|v| (v * 10.0).round() / 10.0),
                "pengawasan_terakhir": g.and_then(|x| x.4.clone()),
            })
        })
        .collect();
    sppg_out.sort_by(|a, b| b["kasus"].as_i64().cmp(&a["kasus"].as_i64()));

    let mut reg_out: Vec<Value> = reg_map
        .into_iter()
        .map(|(k, v)| json!({
            "key": k, "name": v.name, "geo": v.geo,
            "kejadian": v.kejadian, "kasus": v.kasus, "meninggal": v.meninggal, "terpapar": v.terpapar,
            "lab_hasil": v.lab_hasil, "ditutup": v.ditutup, "sppg_unik": v.sppgs.len() as i64
        }))
        .collect();
    reg_out.sort_by(|a, b| b["kasus"].as_i64().cmp(&a["kasus"].as_i64()));

    let checklist_labels = [
        ("bank_sampel", "Bank Sampel Makanan"),
        ("limbah_pencatatan", "Pencatatan Limbah Harian"),
        ("aduan_hari_h", "Pengaduan Sekolah Hari H"),
        ("angkut_box_sekat", "Mobil Box dengan Sekat"),
        ("angkut_box_tanpa", "Mobil Box Tanpa Sekat"),
        ("angkut_motor", "Angkutan Motor"),
    ];
    let faktor_risiko: Vec<Value> = checklist_labels
        .iter()
        .enumerate()
        .map(|(i, (k, lbl))| json!({
            "key": k, "label": lbl,
            "ya": checklist_counts[i].get("Ya").copied().unwrap_or(0),
            "tidak": checklist_counts[i].get("Tidak").copied().unwrap_or(0),
            "kosong": checklist_counts[i].get("(Belum diisi)").copied().unwrap_or(0),
        }))
        .collect();

    let dem_usia: Vec<Value> = KERACUNAN_USIA
        .iter()
        .enumerate()
        .map(|(i, (k, lbl))| json!({ "key": k, "label": lbl, "count": usia_sums[i] }))
        .collect();

    let opt_prov = c.query("SELECT DISTINCT ml.id, ml.name FROM mbg_keracunan k JOIN master_locations ml ON ml.id = k.province_id WHERE k.deleted_at IS NULL ORDER BY ml.name", &[]).await.map_err(internal)?;
    let opt_kab = c.query("SELECT DISTINCT mk.id, mk.province_id, mk.name FROM mbg_keracunan k JOIN master_kabkota mk ON mk.id = k.kabkota_id WHERE k.deleted_at IS NULL ORDER BY mk.name", &[]).await.map_err(internal)?;
    let opt_sppg = c.query("SELECT DISTINCT trim(nama_sppg) FROM mbg_keracunan WHERE deleted_at IS NULL AND NULLIF(trim(nama_sppg),'') IS NOT NULL ORDER BY 1", &[]).await.map_err(internal)?;
    let opt_kec = c
        .query(
            "SELECT DISTINCT trim(k.kecamatan_nama), k.kabkota_id FROM mbg_keracunan k
             WHERE k.deleted_at IS NULL AND NULLIF(trim(k.kecamatan_nama),'') IS NOT NULL
               AND (cardinality($1::int[]) = 0 OR k.province_id = ANY($1))
               AND (cardinality($2::int[]) = 0 OR k.kabkota_id = ANY($2))
             ORDER BY 1 LIMIT 2000",
            &[&prov, &kab],
        )
        .await
        .map_err(internal)?;

    let ranking = |m: HashMap<String, RankAcc>| -> Vec<Value> {
        let mut v: Vec<Value> = m.into_values().map(|a| a.json()).collect();
        v.sort_by(|a, b| b["kejadian"].as_i64().cmp(&a["kejadian"].as_i64()).then_with(|| b["kasus"].as_i64().cmp(&a["kasus"].as_i64())));
        v
    };
    let ketepatan = {
        let mut b = [0i64; 4];
        for h in &lapor_jam {
            let i = if *h <= 24.0 { 0 } else if *h <= 48.0 { 1 } else if *h <= 72.0 { 2 } else { 3 };
            b[i] += 1;
        }
        json!({
            "dilaporkan": lapor_jam.len() as i64, "belum_dilaporkan": belum_lapor,
            "le24": b[0], "h24_48": b[1], "h48_72": b[2], "gt72": b[3],
            "pct_le24": pct(b[0], lapor_jam.len() as i64),
            "median_jam": median(&lapor_jam), "median_gejala_lapor_jam": median(&gejala_lapor_jam),
            "n_gejala_lapor": gejala_lapor_jam.len() as i64,
        })
    };
    let mut menu_out: Vec<Value> = menu_map.into_iter().map(|((komp, _), (nm, kej, ks))| json!({ "komponen": komp, "nama": nm, "kejadian": kej, "kasus": ks })).collect();
    menu_out.sort_by(|a, b| b["kejadian"].as_i64().cmp(&a["kejadian"].as_i64()).then_with(|| b["kasus"].as_i64().cmp(&a["kasus"].as_i64())));
    menu_out.truncate(20);
    let mut pos_out: Vec<Value> = pangan_pos.into_values().map(|(nm, kat, p, t)| json!({ "nama": nm, "kategori": kat, "positif": p, "diuji": t, "pct_positif": pct(p, t) })).collect();
    pos_out.sort_by(|a, b| b["positif"].as_i64().cmp(&a["positif"].as_i64()).then_with(|| b["diuji"].as_i64().cmp(&a["diuji"].as_i64())));
    pos_out.truncate(20);

    Ok(Json(json!({
        "success": true,
        "data": {
            "kpis": {
                "total_kejadian": kpis_total, "draf": kpis_draf, "dilaporkan": kpis_dilaporkan, "ditutup": kpis_ditutup,
                "total_kasus": kpis_kasus, "total_meninggal": kpis_meninggal, "total_terpapar": kpis_terpapar,
                "attack_rate_pct": pct(kpis_ar_kasus, kpis_ar_terpapar),
                "cfr_pct": pct(kpis_meninggal, kpis_kasus),
                "avg_inkubasi_jam": if ink_cnt > 0 { Some((ink_sum / ink_cnt as f64 * 10.0).round() / 10.0) } else { None },
                "rawat_inap": kpis_inap, "rawat_jalan": kpis_jalan, "sembuh": kpis_sembuh,
                "total_sekolah_terdampak": kpis_sekolah,
                "sppg_unik": sppg_set.len() as i64, "provinsi_unik": prov_set.len() as i64, "kabkota_unik": kab_set.len() as i64,
                "lab_belum": lab_belum, "lab_dikirim": lab_dikirim, "lab_hasil": lab_hasil,
                "slhs_ya": slhs_map.get("Ya").copied().unwrap_or(0),
                "slhs_tidak": slhs_map.get("Tidak").copied().unwrap_or(0),
                "ikl_memenuhi": ikl_map.get("Memenuhi Syarat").copied().unwrap_or(0),
                "ikl_tidak_memenuhi": ikl_map.get("Tidak Memenuhi Syarat").copied().unwrap_or(0),
                "date_min": date_min.map(|d| d.format("%Y-%m-%d").to_string()),
                "date_max": date_max.map(|d| d.format("%Y-%m-%d").to_string()),
            },
            "weekly_trend": week_map.into_iter().map(|((y, w), (kj, ks, mn, tp))| json!({
                "year": y, "week": w, "week_start": week_start_date(y, w).format("%Y-%m-%d").to_string(),
                "label": week_label(y, w), "kejadian": kj, "kasus": ks, "meninggal": mn, "terpapar": tp
            })).collect::<Vec<_>>(),
            "daily_updates": daily_updates,
            "daily_series": daily_ker.iter().map(|(d, (kj, ks, mn, tp, inap))| json!({
                "tanggal": d.format("%Y-%m-%d").to_string(), "kejadian": kj, "kasus": ks, "meninggal": mn, "terpapar": tp, "rawat_inap": inap
            })).collect::<Vec<_>>(),
            "ranking": { "provinsi": ranking(rank_prov), "kabkota": ranking(rank_kab), "kecamatan": ranking(rank_kec) },
            "ketepatan_lapor": ketepatan,
            "lab_ringkas": {
                "belum": lab_belum, "dikirim": lab_dikirim, "hasil": lab_hasil,
                "kejadian_positif": lab_positif_kejadian,
                "median_tat_jam": median(&lab_tat_jam), "n_tat": lab_tat_jam.len() as i64,
            },
            "pangan": { "menu": menu_out, "sampel_positif": pos_out },
            "by_gejala": gejala_out,
            "demografi": {
                "pria": pria_sum, "wanita": wanita_sum,
                "usia": dem_usia,
                "balita": balita_sum, "ibu_hamil": bumil_sum, "ibu_menyusui": busui_sum,
            },
            "lingkungan_sop": {
                "slhs": {
                    "ya": slhs_map.get("Ya").copied().unwrap_or(0),
                    "tidak": slhs_map.get("Tidak").copied().unwrap_or(0),
                    "kosong": slhs_map.get("(Belum diisi)").copied().unwrap_or(0),
                },
                "ikl": {
                    "memenuhi": ikl_map.get("Memenuhi Syarat").copied().unwrap_or(0),
                    "tidak_memenuhi": ikl_map.get("Tidak Memenuhi Syarat").copied().unwrap_or(0),
                    "kosong": ikl_map.get("(Belum diisi)").copied().unwrap_or(0),
                },
                "sumber_air": air_out,
                "sop_gap": sop_gap,
                "faktor_risiko": faktor_risiko,
                "penjamah": {
                    "total": penjamah_tot,
                    "tersertifikasi": penjamah_sert,
                    "pct_tersertifikasi": pct(penjamah_sert, penjamah_tot),
                }
            },
            "lab_sampel": samp_out,
            "sppg_incidents": sppg_out,
            "heatmap": {
                "weeks": axis.iter().map(|(y, w, s, l)| json!({ "year": y, "week": w, "start": s, "label": l })).collect::<Vec<_>>(),
                "by_province": hp_rows,
            },
            "map": {
                "level": map_level, "parent": map_parent,
                "regions": reg_out,
                "points": points_out,
            },
            "recent_incidents": recent_incidents,
            "filter_options": {
                "provinces": opt_prov.iter().map(|r| json!({ "id": r.get::<_, i32>(0), "name": r.get::<_, String>(1) })).collect::<Vec<_>>(),
                "kabkota": opt_kab.iter().map(|r| json!({ "id": r.get::<_, i32>(0), "province_id": r.get::<_, i32>(1), "name": r.get::<_, String>(2) })).collect::<Vec<_>>(),
                "sppg": opt_sppg.iter().map(|r| r.get::<_, String>(0)).collect::<Vec<_>>(),
                "kecamatan": opt_kec.iter().map(|r| json!({ "name": r.get::<_, String>(0), "kabkota_id": r.get::<_, Option<i32>>(1) })).collect::<Vec<_>>(),
            }
        }
    })))
}

// ─── PR 052 helpers ───────────────────────────────────────────────────────────

/// Akumulator ranking wilayah (provinsi / kab-kota / kecamatan).
#[derive(Default)]
struct RankAcc {
    id: Option<i32>,
    name: String,
    parent: Option<String>,
    kejadian: i64,
    kasus: i64,
    meninggal: i64,
    terpapar: i64,
    ar_kasus: i64,
    ar_terpapar: i64,
    rawat_inap: i64,
}
impl RankAcc {
    fn json(&self) -> Value {
        json!({
            "id": self.id, "name": self.name, "parent": self.parent,
            "kejadian": self.kejadian, "kasus": self.kasus, "meninggal": self.meninggal, "terpapar": self.terpapar,
            "rawat_inap": self.rawat_inap, "cfr_pct": pct(self.meninggal, self.kasus), "ar_pct": pct(self.ar_kasus, self.ar_terpapar),
        })
    }
}

#[allow(clippy::too_many_arguments)]
fn rank_add(m: &mut HashMap<String, RankAcc>, key: String, id: Option<i32>, name: Option<String>, parent: Option<String>,
            kasus: i64, meninggal: i64, terpapar: Option<i64>, terp_ar: Option<i64>, inap: i64) {
    let a = m.entry(key).or_insert_with(|| RankAcc {
        id,
        name: name.filter(|x| !x.trim().is_empty()).unwrap_or_else(|| "(Belum diisi)".into()),
        parent,
        ..Default::default()
    });
    a.kejadian += 1;
    a.kasus += kasus;
    a.meninggal += meninggal;
    a.terpapar += terpapar.unwrap_or(0);
    a.rawat_inap += inap;
    if let Some(t) = terp_ar {
        a.ar_kasus += kasus;
        a.ar_terpapar += t;
    }
}

/// Tanggal-jam isian form ("YYYY-MM-DDTHH:MM", opsional detik; atau dipisah spasi).
fn parse_dt(s: &str) -> Option<NaiveDateTime> {
    let s = s.trim();
    ["%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"]
        .iter()
        .find_map(|f| NaiveDateTime::parse_from_str(s, f).ok())
}

fn median(v: &[f64]) -> Option<f64> {
    if v.is_empty() {
        return None;
    }
    let mut x = v.to_vec();
    x.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let m = x.len() / 2;
    let r = if x.len() % 2 == 0 { (x[m - 1] + x[m]) / 2.0 } else { x[m] };
    Some((r * 10.0).round() / 10.0)
}

/// Butir "Tidak Sesuai" satu formulir dari `data._hasil` (kode butir, label bila diketahui backend).
/// F1: A/B.1/B.2 · F2: A.n ketersediaan & B.n kesesuaian SOP · F3–F11: nomor butir (label di klien dari naskah formulir).
const SKOR_BIN_LABEL: [&str; 5] = ["< 60", "60–69", "70–79", "80–89", "≥ 90"];
fn skor_bin(s: f64) -> usize {
    if s < 60.0 { 0 } else if s < 70.0 { 1 } else if s < 80.0 { 2 } else if s < 90.0 { 3 } else { 4 }
}

struct SppgFormCell {
    key: String,
    nama: String,
    kab: Option<String>,
    prov: Option<String>,
    form_no: i16,
    n: i64,
    ok: i64,
    fail: i64,
    skor: Option<f64>,
    kunjungan: i64,
}

/// PR 052b: kelompokkan sel (SPPG, formulir) → baris SPPG; `pct` = Sesuai/BAIK ÷ (Sesuai + Tidak Sesuai) per formulir,
/// `skor` = rata-rata skor F3–F11; urut dari kepatuhan keseluruhan terendah (maks. 60 SPPG).
fn sppg_form_matrix(cells: &[SppgFormCell]) -> Vec<Value> {
    let mut by: BTreeMap<String, (String, Option<String>, Option<String>, i64, Vec<Value>, i64, i64, f64, i64)> = BTreeMap::new();
    for c in cells {
        let e = by.entry(c.key.clone()).or_insert_with(|| (c.nama.clone(), c.kab.clone(), c.prov.clone(), 0, vec![], 0, 0, 0.0, 0));
        e.3 = e.3.max(c.kunjungan);
        e.4.push(json!({ "form_no": c.form_no, "n": c.n, "ok": c.ok, "fail": c.fail, "pct": pct(c.ok, c.ok + c.fail), "skor": c.skor.map(|x| (x * 10.0).round() / 10.0) }));
        e.5 += c.ok;
        e.6 += c.ok + c.fail;
        if (3..=11).contains(&c.form_no) { if let Some(s) = c.skor { e.7 += s; e.8 += 1; } }
    }
    let mut out: Vec<Value> = by.into_values().map(|(nama, kab, prov, kj, mut forms, ok, tot, ss, sn)| {
        forms.sort_by_key(|f| f["form_no"].as_i64());
        json!({ "nama_sppg": nama, "kabkota_name": kab, "province_name": prov, "kunjungan": kj, "forms": forms,
                "pct": pct(ok, tot), "avg_skor": if sn > 0 { Some((ss / sn as f64 * 10.0).round() / 10.0) } else { None } })
    }).collect();
    out.sort_by(|a, b| a["pct"].as_f64().unwrap_or(101.0).partial_cmp(&b["pct"].as_f64().unwrap_or(101.0)).unwrap_or(std::cmp::Ordering::Equal)
        .then_with(|| a["nama_sppg"].as_str().cmp(&b["nama_sppg"].as_str())));
    out.truncate(60);
    out
}

fn temuan_form(fno: i16, d: &Value) -> Vec<(String, Option<String>)> {
    let h = d.get("_hasil");
    let mut out = vec![];
    match fno {
        1 => {
            for (k, l) in [("a", "A. Pengawas gizi/TPG belum memenuhi kualifikasi & pelatihan"), ("b1", "B.1 Jumlah penjamah makanan belum mencukupi"), ("b2", "B.2 Penjamah makanan belum terlatih (< 50%)")] {
                if h.and_then(|x| x.get(k)).and_then(|v| v.as_str()) == Some("Tidak Sesuai") {
                    out.push((k.to_uppercase(), Some(l.to_string())));
                }
            }
        }
        2 => {
            for (arr, pre, what) in [("tidak_a", "A", "Ketersediaan SOP"), ("tidak_b", "B", "Kesesuaian/sosialisasi SOP")] {
                for v in h.and_then(|x| x.get(arr)).and_then(|v| v.as_array()).into_iter().flatten() {
                    if let Some(r) = v.as_i64() {
                        let nm = F2_SOP_NAMES.get((r - 1).max(0) as usize).copied().unwrap_or("SOP");
                        out.push((format!("{pre}{r}"), Some(format!("{pre}.{r} {what}: {nm}"))));
                    }
                }
            }
        }
        3..=11 => {
            for v in h.and_then(|x| x.get("tidak_sesuai")).and_then(|v| v.as_array()).into_iter().flatten() {
                if let Some(r) = v.as_i64() {
                    out.push((format!("i{r}"), None));
                }
            }
        }
        _ => {}
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn route_access_is_dashboard_login() {
        use axum::http::Method;
        assert_eq!(crate::auth::classify(&Method::GET, "/api/v1/dasbor/mbg/pengawasan-gizi"), crate::auth::Need::Login);
        assert_eq!(crate::auth::classify(&Method::GET, "/api/v1/dasbor/mbg/keracunan"), crate::auth::Need::Login);
    }

    #[test]
    fn forms_and_sop_metadata_complete() {
        assert_eq!(GIZI_FORMS_META.len(), 13);
        assert_eq!(F2_SOP_NAMES.len(), 8);
        assert_eq!(KERACUNAN_USIA.len(), 5);
    }

    #[test]
    fn pr052b_skor_bin_and_matrix() {
        assert_eq!(skor_bin(59.9), 0);
        assert_eq!(skor_bin(80.0), 3);
        assert_eq!(skor_bin(100.0), 4);
        let cell = |key: &str, f: i16, ok: i64, fail: i64| SppgFormCell { key: key.into(), nama: key.to_uppercase(), kab: None, prov: None, form_no: f, n: ok + fail, ok, fail, skor: Some(70.0), kunjungan: 1 };
        let m = sppg_form_matrix(&[cell("b", 3, 1, 0), cell("a", 3, 0, 1), cell("a", 12, 1, 0)]);
        assert_eq!(m[0]["nama_sppg"], "A");
        assert_eq!(m[0]["pct"], json!(50.0));
        assert_eq!(m[0]["forms"][1]["form_no"], 12);
        assert_eq!(m[1]["pct"], json!(100.0));
    }

    #[test]
    fn pr052_helpers() {
        assert_eq!(median(&[]), None);
        assert_eq!(median(&[5.0, 1.0, 3.0]), Some(3.0));
        assert_eq!(median(&[1.0, 2.0, 3.0, 10.0]), Some(2.5));
        assert!(parse_dt("2026-11-09T11:30").is_some());
        assert!(parse_dt("2026-11-09 11:30:15").is_some());
        assert!(parse_dt("kemarin").is_none());
        let f1 = json!({ "_hasil": { "a": "Tidak Sesuai", "b1": "Sesuai", "b2": "Tidak Sesuai" } });
        let t: Vec<String> = temuan_form(1, &f1).into_iter().map(|x| x.0).collect();
        assert_eq!(t, vec!["A".to_string(), "B2".to_string()]);
        let f2 = json!({ "_hasil": { "tidak_a": [2], "tidak_b": [8] } });
        let t2 = temuan_form(2, &f2);
        assert_eq!(t2[0].0, "A2");
        assert!(t2[1].1.as_deref().unwrap().contains("Distribusi"));
        let f5 = json!({ "_hasil": { "tidak_sesuai": [1, 4] } });
        assert_eq!(temuan_form(5, &f5).len(), 2);
        assert!(temuan_form(12, &f5).is_empty());
        let mut m = HashMap::new();
        rank_add(&mut m, "1".into(), Some(1), Some("Jawa Barat".into()), None, 30, 1, Some(100), Some(100), 5);
        rank_add(&mut m, "1".into(), Some(1), Some("Jawa Barat".into()), None, 10, 0, None, None, 0);
        let j = m.get("1").unwrap().json();
        assert_eq!(j["kejadian"], 2);
        assert_eq!(j["kasus"], 40);
        assert_eq!(j["ar_pct"], 30.0);
        assert_eq!(j["cfr_pct"], 2.5);
    }
}
