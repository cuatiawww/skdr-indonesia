//! PR 006: PE form engine (pure logic, no DB). Interprets the versioned form schema stored in
//! pe_form_definitions.schema: visibility conditions, required/format/range/date-order validation,
//! repeatable tables, derived fields (No. PE, age, earliest date, first-match) and case classification.
//! The same condition language is mirrored in the frontend (lib/pe-engine.ts) for inline feedback;
//! the server result is authoritative.
use chrono::{Datelike, NaiveDate};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

pub type Obj = Map<String, Value>;

pub struct Ctx<'a> {
    pub root: &'a Obj,
    pub row: Option<&'a Obj>,
}

impl<'a> Ctx<'a> {
    pub fn get(&self, k: &str) -> Option<&'a Value> {
        if let Some(r) = self.row {
            if let Some(v) = r.get(k) {
                return Some(v);
            }
        }
        self.root.get(k)
    }
}

pub fn filled(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::String(s)) => !s.trim().is_empty(),
        Some(Value::Array(a)) => !a.is_empty(),
        _ => true,
    }
}

fn as_text(v: &Value) -> String {
    match v {
        Value::String(s) => s.trim().to_string(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn arr_has(v: Option<&Value>, x: &str) -> bool {
    v.and_then(|v| v.as_array()).map(|a| a.iter().any(|e| as_text(e) == x)).unwrap_or(false)
}

/// Condition language: {f,eq} {f,ne} {f,in:[]} {f,has} {f,hasAny:[]} {f,filled} {all:[]} {any:[]} {not:c}
/// {rows:table, any:c} {count:[c..], gte:n}
pub fn cond(c: &Value, ctx: &Ctx) -> bool {
    let o = match c.as_object() {
        Some(o) => o,
        None => return true,
    };
    if let Some(a) = o.get("all").and_then(|v| v.as_array()) {
        return a.iter().all(|x| cond(x, ctx));
    }
    if let Some(a) = o.get("any").and_then(|v| v.as_array()) {
        if o.get("rows").is_none() {
            return a.iter().any(|x| cond(x, ctx));
        }
    }
    if let Some(n) = o.get("not") {
        return !cond(n, ctx);
    }
    if let Some(t) = o.get("rows").and_then(|v| v.as_str()) {
        let inner = o.get("any").cloned().unwrap_or(Value::Null);
        return ctx
            .root
            .get(t)
            .and_then(|v| v.as_array())
            .map(|rows| rows.iter().filter_map(|r| r.as_object()).any(|r| cond(&inner, &Ctx { root: ctx.root, row: Some(r) })))
            .unwrap_or(false);
    }
    if let Some(list) = o.get("count").and_then(|v| v.as_array()) {
        let n = list.iter().filter(|x| cond(x, ctx)).count() as i64;
        return n >= o.get("gte").and_then(|v| v.as_i64()).unwrap_or(1);
    }
    let k = match o.get("f").and_then(|v| v.as_str()) {
        Some(k) => k,
        None => return true,
    };
    let v = ctx.get(k);
    if let Some(e) = o.get("eq") {
        return v.map(|v| as_text(v) == as_text(e)).unwrap_or(false);
    }
    if let Some(e) = o.get("ne") {
        return v.map(|v| as_text(v) != as_text(e)).unwrap_or(true);
    }
    if let Some(list) = o.get("in").and_then(|x| x.as_array()) {
        return v.map(|v| list.iter().any(|e| as_text(e) == as_text(v))).unwrap_or(false);
    }
    if let Some(e) = o.get("has") {
        return arr_has(v, &as_text(e));
    }
    if let Some(list) = o.get("hasAny").and_then(|x| x.as_array()) {
        return list.iter().any(|e| arr_has(v, &as_text(e)));
    }
    if o.get("filled").is_some() {
        return filled(v);
    }
    true
}

pub fn today(offset_hours: i64) -> NaiveDate {
    (chrono::Utc::now() + chrono::Duration::hours(offset_hours)).date_naive()
}

pub fn parse_date(v: Option<&Value>) -> Option<NaiveDate> {
    v.and_then(|v| v.as_str()).and_then(|s| NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d").ok())
}

fn parse_num(v: Option<&Value>) -> Option<f64> {
    match v {
        Some(Value::Number(n)) => n.as_f64(),
        Some(Value::String(s)) if !s.trim().is_empty() => s.trim().replace(',', ".").parse().ok(),
        _ => None,
    }
}

/// Years / months / days between birth and reference date (calendar difference).
pub fn age_parts(birth: NaiveDate, at: NaiveDate) -> Option<(i64, i64, i64)> {
    if at < birth {
        return None;
    }
    let mut y = at.year() - birth.year();
    let mut m = at.month() as i32 - birth.month() as i32;
    let mut d = at.day() as i32 - birth.day() as i32;
    if d < 0 {
        m -= 1;
        let (py, pm) = if at.month() == 1 { (at.year() - 1, 12) } else { (at.year(), at.month() - 1) };
        let days_prev = NaiveDate::from_ymd_opt(py, pm, 1)
            .and_then(|f| f.checked_add_months(chrono::Months::new(1)))
            .map(|n| (n - NaiveDate::from_ymd_opt(py, pm, 1).unwrap()).num_days())
            .unwrap_or(30) as i32;
        d += days_prev;
    }
    if m < 0 {
        y -= 1;
        m += 12;
    }
    Some((y as i64, m as i64, d as i64))
}

pub struct Issue {
    pub key: String,
    pub step: String,
    pub label: String,
    pub msg: String,
}

impl Issue {
    pub fn json(&self) -> Value {
        json!({ "key": self.key, "step": self.step, "label": self.label, "msg": self.msg })
    }
}

pub struct Engine<'a> {
    pub schema: &'a Value,
    pub labels: HashMap<String, String>,
    pub today: NaiveDate,
}

fn fields_of(v: &Value) -> Vec<&Value> {
    v.get("fields").or_else(|| v.get("columns")).and_then(|x| x.as_array()).map(|a| a.iter().collect()).unwrap_or_default()
}

pub fn all_root_fields(schema: &Value) -> Vec<(String, &Value, Option<&Value>)> {
    // (step id, field, section)
    let mut out = vec![];
    for st in schema.get("steps").and_then(|v| v.as_array()).into_iter().flatten() {
        let sid = st.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        for se in st.get("sections").and_then(|v| v.as_array()).into_iter().flatten() {
            for f in fields_of(se) {
                out.push((sid.clone(), f, Some(se)));
            }
        }
    }
    out
}

fn s<'b>(f: &'b Value, k: &str) -> &'b str {
    f.get(k).and_then(|v| v.as_str()).unwrap_or("")
}

impl<'a> Engine<'a> {
    pub fn new(schema: &'a Value, today: NaiveDate) -> Self {
        let mut labels = HashMap::new();
        for (_, f, _) in all_root_fields(schema) {
            labels.insert(s(f, "key").to_string(), s(f, "label").to_string());
            for c in fields_of(f) {
                labels.entry(s(c, "key").to_string()).or_insert_with(|| s(c, "label").to_string());
            }
        }
        for c in schema.get("cluster_fields").and_then(|v| v.as_array()).into_iter().flatten() {
            labels.entry(s(c, "key").to_string()).or_insert_with(|| s(c, "label").to_string());
        }
        Engine { schema, labels, today }
    }

    fn ref_label(&self, r: &str) -> String {
        if r == "today" {
            "hari ini".into()
        } else {
            self.labels.get(r).cloned().unwrap_or_else(|| r.to_string())
        }
    }

    /// Fills derived ("auto") fields in place.
    pub fn derive(&self, data: &mut Obj, no_pe: &str) {
        let refs: Vec<String> = self.schema.get("age_reference").and_then(|v| v.as_array()).into_iter().flatten()
            .filter_map(|v| v.as_str().map(String::from)).collect();
        let mut updates: Vec<(String, Value)> = vec![];
        for (_, f, _) in all_root_fields(self.schema) {
            let d = match f.get("derive") {
                Some(d) => d,
                None => continue,
            };
            let key = s(f, "key").to_string();
            let val = match s(d, "fn") {
                "no_pe" => json!(no_pe),
                "age" => {
                    let birth = parse_date(data.get("tgl_lahir"));
                    let at = refs.iter().find_map(|r| parse_date(data.get(r)));
                    match (birth, at) {
                        (Some(b), Some(a)) => match age_parts(b, a) {
                            Some((y, m, dd)) => json!(match s(d, "part") { "years" => y, "months" => m, _ => dd }),
                            None => Value::Null,
                        },
                        _ => Value::Null,
                    }
                }
                "min_date" => data
                    .get(s(d, "table"))
                    .and_then(|v| v.as_array())
                    .map(|rows| rows.iter().filter_map(|r| parse_date(r.get(s(d, "col")))).min())
                    .flatten()
                    .map(|x| json!(x.format("%Y-%m-%d").to_string()))
                    .unwrap_or(Value::Null),
                "first_match" => {
                    let ctx = Ctx { root: data, row: None };
                    d.get("cases").and_then(|v| v.as_array()).into_iter().flatten()
                        .find(|c| c.get("when").map(|w| cond(w, &ctx)).unwrap_or(false))
                        .and_then(|c| c.get("value").cloned())
                        .unwrap_or(Value::Null)
                }
                _ => Value::Null,
            };
            updates.push((key, val));
        }
        for (k, v) in updates {
            data.insert(k, v);
        }
    }

    pub fn validate(&self, data: &Obj) -> (Vec<Issue>, Vec<Issue>) {
        let mut errs = vec![];
        let mut warns = vec![];
        let ctx = Ctx { root: data, row: None };
        for (step, f, se) in all_root_fields(self.schema) {
            let sec_vis = se.and_then(|x| x.get("visible")).map(|c| cond(c, &ctx)).unwrap_or(true);
            if !sec_vis {
                continue;
            }
            self.check_field(f, &ctx, &step, "", &mut errs, &mut warns);
        }
        // cross-field rules declared at form level
        for r in self.schema.get("rules").and_then(|v| v.as_array()).into_iter().flatten() {
            if r.get("when").map(|w| cond(w, &ctx)).unwrap_or(false) {
                let issue = Issue { key: s(r, "key").into(), step: s(r, "step").into(), label: String::new(), msg: s(r, "msg").into() };
                if s(r, "level") == "warning" { warns.push(issue) } else { errs.push(issue) }
            }
        }
        (errs, warns)
    }

    pub fn validate_fields(&self, fields: &[Value], data: &Obj) -> Vec<Issue> {
        let mut errs = vec![];
        let mut warns = vec![];
        let ctx = Ctx { root: data, row: None };
        for f in fields {
            self.check_field(f, &ctx, "", "", &mut errs, &mut warns);
        }
        errs
    }

    fn options(&self, f: &Value, ctx: &Ctx) -> Vec<String> {
        if let Some(list) = f.get("optionsIf").and_then(|v| v.as_array()) {
            for o in list {
                if o.get("when").map(|w| cond(w, ctx)).unwrap_or(false) {
                    return o.get("options").and_then(|v| v.as_array()).into_iter().flatten().map(as_text).collect();
                }
            }
        }
        f.get("options").and_then(|v| v.as_array()).into_iter().flatten().map(as_text).collect()
    }

    fn check_field(&self, f: &Value, ctx: &Ctx, step: &str, prefix: &str, errs: &mut Vec<Issue>, warns: &mut Vec<Issue>) {
        let key = s(f, "key");
        let label = s(f, "label").to_string();
        let ty = s(f, "type");
        if let Some(c) = f.get("visible") {
            if !cond(c, ctx) {
                return;
            }
        }
        let path = format!("{prefix}{key}");
        let mut msgs: Vec<String> = vec![];
        let v = ctx.get(key);
        let required = f.get("required").and_then(|v| v.as_bool()).unwrap_or(false)
            || f.get("requiredIf").map(|c| cond(c, ctx)).unwrap_or(false);
        for w in f.get("warn").and_then(|v| v.as_array()).into_iter().flatten() {
            if w.get("when").map(|c| cond(c, ctx)).unwrap_or(false) {
                warns.push(Issue { key: path.clone(), step: step.into(), label: label.clone(), msg: s(w, "msg").into() });
            }
        }
        match ty {
            "info" | "auto" => return,
            "cluster_monitoring" => {
                if required && !filled(ctx.root.get("cluster_id")) {
                    msgs.push("Tautkan klaster KLB/wabah di bagian A agar pemantauan KLB/bencana (N1–N9) dapat diisi pada klaster".into());
                }
                flush(errs, &path, step, &label, msgs);
                return;
            }
            _ => {}
        }
        if !filled(v) {
            if required {
                msgs.push(format!("{label} wajib diisi"));
            }
            flush(errs, &path, step, &label, msgs);
            return;
        }
        let v = v.unwrap();
        match ty {
            "select" => {
                let opts = self.options(f, ctx);
                let t = as_text(v);
                if !opts.is_empty() && !opts.contains(&t) {
                    msgs.push(format!("Pilihan {label} tidak valid"));
                }
                self.check_other(f, ctx, &[t], &mut msgs);
            }
            "multiselect" => {
                let opts = self.options(f, ctx);
                let vals: Vec<String> = v.as_array().map(|a| a.iter().map(as_text).collect()).unwrap_or_default();
                if vals.iter().any(|x| !opts.is_empty() && !opts.contains(x)) {
                    msgs.push(format!("Pilihan {label} tidak valid"));
                }
                if let Some(n) = f.get("minSelect").and_then(|v| v.as_i64()) {
                    if (vals.len() as i64) < n {
                        msgs.push(format!("{label}: pilih minimal {n}"));
                    }
                }
                if let Some(x) = f.get("exclusive").and_then(|v| v.as_str()) {
                    if vals.iter().any(|v| v == x) && vals.len() > 1 {
                        msgs.push(format!("\"{x}\" tidak boleh dipilih bersama pilihan lain"));
                    }
                }
                self.check_other(f, ctx, &vals, &mut msgs);
            }
            "number" => match parse_num(Some(v)) {
                None => msgs.push(format!("{label} harus berupa angka")),
                Some(n) => {
                    let dec = f.get("decimals").and_then(|v| v.as_i64());
                    if dec == Some(0) && n.fract() != 0.0 {
                        msgs.push(format!("{label} harus bilangan bulat"));
                    } else if let Some(dp) = dec {
                        let scaled = n * 10f64.powi(dp as i32);
                        if (scaled - scaled.round()).abs() > 1e-6 {
                            msgs.push(format!("{label} maksimal {dp} desimal"));
                        }
                    }
                    if let Some(m) = f.get("min").and_then(|v| v.as_f64()) {
                        if n < m {
                            msgs.push(format!("{label} minimal {}", fmt_num(m)));
                        }
                    }
                    if let Some(m) = f.get("max").and_then(|v| v.as_f64()) {
                        if n > m {
                            msgs.push(format!("{label} maksimal {}", fmt_num(m)));
                        }
                    }
                    for r in f.get("rules").and_then(|v| v.as_array()).into_iter().flatten() {
                        let rk = s(r, "ref");
                        if let Some(o) = parse_num(ctx.get(rk)) {
                            let bad = match s(r, "op") { "<=" => n > o, ">=" => n < o, _ => false };
                            if bad {
                                msgs.push(format!("{label} tidak boleh {} {}", if s(r, "op") == "<=" { "lebih dari" } else { "kurang dari" }, self.ref_label(rk)));
                            }
                        }
                    }
                    if let Some(sl) = f.get("sumLe") {
                        let total: f64 = sl.get("fields").and_then(|v| v.as_array()).into_iter().flatten()
                            .filter_map(|k| parse_num(ctx.get(&as_text(k)))).sum();
                        if let Some(o) = parse_num(ctx.get(s(sl, "ref"))) {
                            if total > o {
                                let names: Vec<String> = sl.get("fields").and_then(|v| v.as_array()).into_iter().flatten().map(|k| as_text(k).to_uppercase()).collect();
                                msgs.push(format!("{} tidak boleh lebih dari {}", names.join(" + "), s(sl, "ref").to_uppercase()));
                            }
                        }
                    }
                }
            },
            "date" => match parse_date(Some(v)) {
                None => msgs.push(format!("{label}: format tanggal tidak valid")),
                Some(d) => {
                    for r in f.get("rules").and_then(|v| v.as_array()).into_iter().flatten() {
                        let rk = s(r, "ref");
                        let other = if rk == "today" { Some(self.today) } else { parse_date(ctx.get(rk)) };
                        if let Some(o) = other {
                            let bad = match s(r, "op") { "<=" => d > o, ">=" => d < o, _ => false };
                            if bad {
                                msgs.push(format!("{label} tidak boleh {} {}", if s(r, "op") == "<=" { "setelah" } else { "sebelum" }, self.ref_label(rk)));
                            }
                        }
                    }
                }
            },
            "table" => {
                let rows: Vec<&Obj> = v.as_array().map(|a| a.iter().filter_map(|r| r.as_object()).collect()).unwrap_or_default();
                if let Some(n) = f.get("minRows").and_then(|v| v.as_i64()) {
                    if required && (rows.len() as i64) < n {
                        msgs.push(format!("{label}: isi minimal {n} baris"));
                    }
                }
                for (i, r) in rows.iter().enumerate() {
                    let rc = Ctx { root: ctx.root, row: Some(r) };
                    for c in fields_of(f) {
                        self.check_field(c, &rc, step, &format!("{path}.{i}."), errs, warns);
                    }
                }
            }
            "province" | "kabkota" => {
                if parse_num(Some(v)).is_none() {
                    msgs.push(format!("Pilihan {label} tidak valid"));
                }
            }
            _ => {
                let t = as_text(v);
                if s(f, "format") == "digits" {
                    let min = f.get("minLen").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                    let max = f.get("maxLen").and_then(|v| v.as_u64()).unwrap_or(99) as usize;
                    if !t.chars().all(|c| c.is_ascii_digit()) || t.len() < min || t.len() > max {
                        msgs.push(if min == max { format!("{label} harus {min} digit angka") } else { format!("{label} harus angka {min}–{max} digit") });
                    }
                }
                if t.chars().count() > 2000 {
                    msgs.push(format!("{label} terlalu panjang (maks. 2000 karakter)"));
                }
            }
        }
        flush(errs, &path, step, &label, msgs);
    }

    fn check_other(&self, f: &Value, ctx: &Ctx, vals: &[String], msgs: &mut Vec<String>) {
        if let Some(o) = f.get("other") {
            if vals.iter().any(|v| v == s(o, "value")) && !filled(ctx.get(s(o, "key"))) {
                msgs.push(format!("{}: {} wajib diisi", s(f, "label"), s(o, "label")));
            }
        }
    }

    /// Returns (code, label, basis) or None when the data needed for classification is not filled yet.
    pub fn classify(&self, data: &Obj) -> Option<(String, String, String)> {
        let c = self.schema.get("classification")?;
        let ctx = Ctx { root: data, row: None };
        if !c.get("needs").and_then(|v| v.as_array()).map(|a| a.iter().all(|x| cond(x, &ctx))).unwrap_or(true) {
            return None;
        }
        for r in c.get("rules").and_then(|v| v.as_array()).into_iter().flatten() {
            if r.get("when").map(|w| cond(w, &ctx)).unwrap_or(false) {
                return Some((s(r, "code").into(), s(r, "label").into(), s(r, "basis").into()));
            }
        }
        let fb = c.get("fallback")?;
        Some((s(fb, "code").into(), s(fb, "label").into(), "Tidak ada kriteria definisi kasus yang terpenuhi.".into()))
    }

    pub fn class_label(&self, code: &str) -> Option<String> {
        let c = self.schema.get("classification")?;
        c.get("rules").and_then(|v| v.as_array()).into_iter().flatten().chain(c.get("fallback").into_iter())
            .find(|r| s(r, "code") == code).map(|r| s(r, "label").to_string())
    }
}

fn flush(errs: &mut Vec<Issue>, path: &str, step: &str, label: &str, msgs: Vec<String>) {
    for m in msgs {
        errs.push(Issue { key: path.to_string(), step: step.to_string(), label: label.to_string(), msg: m });
    }
}

fn fmt_num(n: f64) -> String {
    if n.fract() == 0.0 { format!("{}", n as i64) } else { format!("{n}") }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn schema() -> Value {
        let p = concat!(env!("CARGO_MANIFEST_DIR"), "/../../database/pe/lepto.v1.json");
        serde_json::from_str(&std::fs::read_to_string(p).expect("lepto schema")).unwrap()
    }
    fn obj(v: Value) -> Obj { v.as_object().unwrap().clone() }

    #[test]
    fn age_is_calendar_difference() {
        let b = NaiveDate::from_ymd_opt(2000, 3, 31).unwrap();
        assert_eq!(age_parts(b, NaiveDate::from_ymd_opt(2026, 4, 30).unwrap()), Some((26, 0, 30)));
        assert_eq!(age_parts(b, NaiveDate::from_ymd_opt(2026, 3, 31).unwrap()), Some((26, 0, 0)));
        assert_eq!(age_parts(b, NaiveDate::from_ymd_opt(1999, 1, 1).unwrap()), None);
    }

    #[test]
    fn lepto_classification() {
        let s = schema();
        let e = Engine::new(&s, NaiveDate::from_ymd_opt(2026, 10, 21).unwrap());
        let base = json!({"gejala_umum": ["Demam akut", "Mialgia (nyeri otot)"], "banjir": "Ya", "tanda_berat": ["Tidak ada tanda berat"]});
        assert_eq!(e.classify(&obj(json!({}))), None);
        assert_eq!(e.classify(&obj(base.clone())).unwrap().0, "suspek");
        let mut no_exposure = base.clone(); no_exposure["banjir"] = json!("Tidak");
        assert_eq!(e.classify(&obj(no_exposure)).unwrap().0, "tidak_memenuhi");
        let mut pa = base.clone();
        pa["gejala_umum"] = json!(["Demam akut", "Mialgia (nyeri otot)", "Nyeri betis"]);
        pa["tanda_berat"] = json!(["Jaundice/ikterik (kuning)"]);
        assert_eq!(e.classify(&obj(pa)).unwrap().0, "probable");
        let mut pb = base.clone(); pb["lab"] = json!([{"jenis_pemeriksaan": "RDT IgM", "hasil": "Positif"}]);
        assert_eq!(e.classify(&obj(pb)).unwrap().0, "probable");
        let mut k = base.clone(); k["lab"] = json!([{"jenis_pemeriksaan": "PCR", "hasil": "Terdeteksi"}]);
        assert_eq!(e.classify(&obj(k)).unwrap().0, "konfirmasi");
    }

    #[test]
    fn lepto_validation_rules() {
        let s = schema();
        let e = Engine::new(&s, NaiveDate::from_ymd_opt(2026, 10, 21).unwrap());
        let d = obj(json!({
            "nik": "12345", "petugas_telp": "08123", "tgl_laporan": "2026-10-25", "tgl_pe": "2026-10-01", "tgl_mulai_sakit": "2026-10-05",
            "tanda_berat": ["Tidak ada tanda berat", "Gagal ginjal"], "rumor_terkait": "Tidak",
            "spesimen": "Ya", "lab": [{"jenis_spesimen": "Urine", "jenis_pemeriksaan": "RDT IgM", "hasil": "Positif"}],
        }));
        let (errs, _) = e.validate(&d);
        let has = |k: &str, frag: &str| errs.iter().any(|i| i.key == k && i.msg.contains(frag));
        assert!(has("nik", "16 digit"));
        assert!(has("petugas_telp", "10–13"));
        assert!(has("tgl_laporan", "hari ini"));
        assert!(has("tgl_pe", "Tanggal mulai sakit"));
        assert!(has("tanda_berat", "bersama"));
        assert!(has("lab.0.jenis_pemeriksaan", "tidak valid"));   // RDT not allowed for urine
        assert!(has("lab.0.tgl_hasil", "wajib"));
        assert!(!errs.iter().any(|i| i.key == "tgl_rumor"));       // hidden when rumor = Tidak
    }
}
