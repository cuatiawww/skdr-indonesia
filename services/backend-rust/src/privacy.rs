//! PR 018: server-side masking of personal data in free text (EBS kronologi/tindakan/saran) before it leaves the API.
//! Stored data is never modified. The keyword list (honorifics / "atas nama" / "nama:" …), stop-words, and output
//! style come from app_settings.privacy_masking (migration 031); `Masker::default()` mirrors that row as a fallback
//! only when the row is missing. Also masks 16-digit NIK and Indonesian phone numbers.
use serde_json::Value;

#[derive(Clone, Debug)]
pub struct Masker {
    pub enabled: bool,
    keywords: Vec<Vec<String>>, // each keyword split into normalised words
    stop: Vec<String>,
    initials: bool,
    max_words: usize,
    mask_nik: bool,
    mask_phone: bool,
}

fn norm(w: &str) -> String {
    w.trim_matches(|c: char| matches!(c, '.' | ':' | ',' | ';' | '(' | ')' | '"' | '\'')).to_lowercase()
}

fn strs(v: Option<&Value>) -> Vec<String> {
    v.and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|s| s.as_str().map(str::to_string)).collect()).unwrap_or_default()
}

pub const DEFAULT_JSON: &str = r#"{"enabled":true,"style":"initials","max_name_words":4,"mask_nik":true,"mask_phone":true,
"keywords":["an.","tn.","ny.","nn.","sdr.","sdri.","bpk.","bapak","pak","ibu","bu","by.","alm.","almh.","pasien","penderita","korban","a.n.","atas nama","nama:","nama pasien","bernama"],
"stop_words":["usia","umur","berusia","berumur","thn","th","tahun","bln","bulan","dengan","dan","di","ke","dari","yang","laki","laki-laki","perempuan","lk","pr","alamat","warga","ds","desa","dusun","kel","kec","rt","rw","jl","jalan","dirawat","dirujuk","meninggal","mengalami","digigit","sejak","pada","tgl","tanggal","rs","rsud","puskesmas","pkm","kab","kota","provinsi","umurnya"]}"#;

impl Default for Masker { fn default() -> Self { Masker::from_value(&serde_json::from_str(DEFAULT_JSON).unwrap()) } }

impl Masker {
    pub fn from_value(v: &Value) -> Self {
        let mut keywords: Vec<Vec<String>> = strs(v.get("keywords")).iter()
            .map(|k| k.split_whitespace().map(norm).filter(|w| !w.is_empty()).collect::<Vec<_>>()).filter(|k: &Vec<String>| !k.is_empty()).collect();
        keywords.sort_by(|a, b| b.len().cmp(&a.len())); // longest phrase first ("atas nama" before "nama")
        Masker {
            enabled: v.get("enabled").and_then(|x| x.as_bool()).unwrap_or(true),
            keywords,
            stop: strs(v.get("stop_words")).iter().map(|s| norm(s)).collect(),
            initials: v.get("style").and_then(|x| x.as_str()) != Some("label"),
            max_words: v.get("max_name_words").and_then(|x| x.as_u64()).unwrap_or(4).max(1) as usize,
            mask_nik: v.get("mask_nik").and_then(|x| x.as_bool()).unwrap_or(true),
            mask_phone: v.get("mask_phone").and_then(|x| x.as_bool()).unwrap_or(true),
        }
    }

    pub async fn load(c: &tokio_postgres::Client) -> Self {
        match c.query_opt("SELECT value FROM app_settings WHERE key = 'privacy_masking'", &[]).await {
            Ok(Some(r)) => serde_json::from_str::<Value>(&r.get::<_, String>(0)).map(|v| Masker::from_value(&v)).unwrap_or_default(),
            _ => Masker::default(),
        }
    }

    /// Returns (masked text, number of replacements).
    pub fn mask(&self, text: &str) -> (String, usize) {
        if !self.enabled { return (text.to_string(), 0) }
        let (t, a) = self.mask_names(text);
        let (t, b) = self.mask_numbers(&t);
        (t, a + b)
    }

    fn looks_like_name(&self, w: &str) -> bool {
        let core = w.trim_matches(|c: char| !c.is_alphanumeric());
        let mut ch = core.chars();
        match ch.next() { Some(f) if f.is_alphabetic() && f.is_uppercase() => {}, _ => return false }
        core.chars().all(|c| c.is_alphabetic() || c == '\'' || c == '-' || c == '.') && !self.stop.contains(&norm(core))
    }

    fn mask_names(&self, text: &str) -> (String, usize) {
        // split into (is_tag, chunk) so HTML tags pass through untouched
        let mut out = String::with_capacity(text.len());
        let mut n = 0;
        let mut rest = text;
        while !rest.is_empty() {
            if let Some(p) = rest.find('<') {
                let (a, b) = rest.split_at(p);
                let (m, k) = self.mask_plain(a); out.push_str(&m); n += k;
                let end = b.find('>').map(|e| e + 1).unwrap_or(b.len());
                out.push_str(&b[..end]); rest = &b[end..];
            } else { let (m, k) = self.mask_plain(rest); out.push_str(&m); n += k; break }
        }
        (out, n)
    }

    fn mask_plain(&self, text: &str) -> (String, usize) {
        // tokens: alternating whitespace / non-whitespace, keeping separators verbatim
        let mut toks: Vec<String> = Vec::new();
        for (i, part) in text.split_inclusive(char::is_whitespace).enumerate() { let _ = i;
            let trimmed = part.trim_end_matches(char::is_whitespace);
            if !trimmed.is_empty() { toks.push(trimmed.to_string()) }
            let ws = &part[trimmed.len()..]; if !ws.is_empty() { toks.push(ws.to_string()) }
        }
        // glued honorific: "An.Budi" -> "An." + "Budi"
        let mut t2: Vec<String> = Vec::new();
        for t0 in toks {
            // leading list numbering glued to a word: "1.Nama" / "2)Pasien" -> "1." + "Nama"
            let digits = t0.chars().take_while(|c| c.is_ascii_digit()).count();
            let t = if digits > 0 && t0[digits..].starts_with(['.', ')']) && t0[digits + 1..].chars().next().map(|c| c.is_alphabetic()).unwrap_or(false) {
                t2.push(t0[..digits + 1].to_string()); t2.push(String::new()); t0[digits + 1..].to_string()
            } else { t0 };
            let mut split = None;
            if let Some(p) = t.find(|c: char| c == '.' || c == ':') {
                let (a, b) = t.split_at(p + 1);
                if !b.is_empty() && b.chars().next().map(|c| c.is_uppercase()).unwrap_or(false) && self.keywords.iter().any(|k| k.len() == 1 && k[0] == norm(a)) { split = Some((a.to_string(), b.to_string())) }
            }
            match split { Some((a, b)) => { t2.push(a); t2.push(" ".to_string()); t2.push(b) }, None => t2.push(t) }
        }
        let words: Vec<usize> = t2.iter().enumerate().filter(|(_, t)| !t.is_empty() && !t.chars().all(char::is_whitespace)).map(|(i, _)| i).collect();
        let mut n = 0;
        let mut wi = 0;
        while wi < words.len() {
            let mut matched = 0;
            for k in &self.keywords {
                if wi + k.len() <= words.len() && k.iter().enumerate().all(|(j, kw)| norm(&t2[words[wi + j]]) == *kw) { matched = k.len(); break }
            }
            if matched == 0 { wi += 1; continue }
            let mut j = wi + matched;
            if j < words.len() && matches!(t2[words[j]].as_str(), ":" | "-") { j += 1 }
            let start = j;
            while j < words.len() && j - start < self.max_words && self.looks_like_name(&t2[words[j]]) && !self.keywords.iter().any(|k| k.len() == 1 && k[0] == norm(&t2[words[j]])) {
                let ends = t2[words[j]].ends_with(|c: char| matches!(c, ',' | ';' | ')' | ':')) || (t2[words[j]].ends_with('.') && t2[words[j]].trim_end_matches('.').chars().count() > 1);
                j += 1; if ends { break }
            }
            if j > start {
                let name_idx: Vec<usize> = words[start..j].to_vec();
                let tail: String = t2[*name_idx.last().unwrap()].chars().rev().take_while(|c| matches!(c, ',' | ';' | ')' | '.' | ':')).collect::<Vec<_>>().into_iter().rev().collect();
                let rep = if self.initials {
                    name_idx.iter().filter_map(|&i| t2[i].trim_matches(|c: char| !c.is_alphabetic()).chars().next()).map(|c| format!("{}.", c.to_uppercase())).collect::<Vec<_>>().join(" ")
                } else { "[nama disamarkan]".to_string() };
                let tail = if self.initials && tail == "." { String::new() } else { tail };
                t2[name_idx[0]] = format!("{rep}{tail}");
                for &i in &name_idx[1..] { t2[i].clear() }
                // drop whitespace between removed words
                for i in name_idx[0] + 1..=*name_idx.last().unwrap() { if t2[i].chars().all(char::is_whitespace) { t2[i].clear() } }
                n += 1;
            }
            wi = j.max(wi + 1);
        }
        (t2.concat(), n)
    }

    fn mask_numbers(&self, text: &str) -> (String, usize) {
        let ch: Vec<char> = text.chars().collect();
        let mut out = String::with_capacity(text.len());
        let mut n = 0;
        let mut i = 0;
        while i < ch.len() {
            let plus = ch[i] == '+' && i + 1 < ch.len() && ch[i + 1].is_ascii_digit();
            if (ch[i].is_ascii_digit() || plus) && (i == 0 || !ch[i - 1].is_alphanumeric()) {
                let s = i; let mut j = if plus { i + 1 } else { i };
                let mut digits = String::new(); let mut seps = 0;
                while j < ch.len() {
                    if ch[j].is_ascii_digit() { digits.push(ch[j]); j += 1 }
                    else if matches!(ch[j], ' ' | '-' | '.') && j + 1 < ch.len() && ch[j + 1].is_ascii_digit() && !digits.is_empty() { seps += 1; j += 1 }
                    else { break }
                }
                if j < ch.len() && ch[j].is_alphanumeric() { out.extend(&ch[s..j]); i = j; continue }
                let phone = (digits.starts_with("08") || digits.starts_with("628")) && (10..=14).contains(&digits.len());
                if self.mask_nik && seps == 0 && !plus && digits.len() == 16 { out.push_str("[NIK disamarkan]"); n += 1 }
                else if self.mask_phone && phone { out.push_str("[telepon disamarkan]"); n += 1 }
                else { out.extend(&ch[s..j]) }
                i = j;
            } else { out.push(ch[i]); i += 1 }
        }
        (out, n)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn m(s: &str) -> String { Masker::default().mask(s).0 }

    #[test] fn honorific_an() { assert_eq!(m("Pasien An. Rudi Hartono usia 7 thn digigit anjing."), "Pasien An. R. H. usia 7 thn digigit anjing."); }
    #[test] fn tn_ny_comma() { assert_eq!(m("Tn. Agus Salim, 45 th dan Ny. Sri Wahyuni, 40 th"), "Tn. A. S., 45 th dan Ny. S. W., 40 th"); }
    #[test] fn glued() { assert_eq!(m("An.Budi Santoso dirujuk ke RSUD"), "An. B. S. dirujuk ke RSUD"); }
    #[test] fn atas_nama() { assert_eq!(m("Laporan atas nama Dewi Lestari dari Puskesmas Contoh"), "Laporan atas nama D. L. dari Puskesmas Contoh"); }
    #[test] fn nama_colon() { assert_eq!(m("Nama: Joko Prasetyo; umur 30"), "Nama: J. P.; umur 30"); }
    #[test] fn pasien_caps() { assert_eq!(m("PASIEN BAMBANG SUPRIADI LAKI-LAKI 50 TAHUN"), "PASIEN B. S. LAKI-LAKI 50 TAHUN"); }
    #[test] fn lowercase_not_name() { assert_eq!(m("pasien mengalami demam tinggi"), "pasien mengalami demam tinggi"); }
    #[test] fn numbered_list() { assert_eq!(m("<p>1.Nama : Rina Marlina</p><p>2.Umur : 9 th</p>"), "<p>1.Nama : R. M.</p><p>2.Umur : 9 th</p>"); }
    #[test] fn nik() { assert_eq!(m("NIK 3201012345678901 terdaftar"), "NIK [NIK disamarkan] terdaftar"); }
    #[test] fn phones() {
        assert_eq!(m("hubungi 0812-3456-7890 atau +62 812 3456 7890"), "hubungi [telepon disamarkan] atau [telepon disamarkan]");
        assert_eq!(m("kasus 12 orang, 2024 tahun"), "kasus 12 orang, 2024 tahun");
    }
    #[test] fn html_kept() { assert_eq!(m("<p>Ny.Siti Aminah</p><br>"), "<p>Ny. S. A.</p><br>"); }
    #[test] fn label_style() {
        let v: Value = serde_json::from_str(&DEFAULT_JSON.replace("\"initials\"", "\"label\"")).unwrap();
        assert_eq!(Masker::from_value(&v).mask("Bpk. Hendra Wijaya, 52 th").0, "Bpk. [nama disamarkan], 52 th");
    }
    #[test] fn disabled() {
        let v: Value = serde_json::from_str(&DEFAULT_JSON.replace("\"enabled\":true", "\"enabled\":false")).unwrap();
        assert_eq!(Masker::from_value(&v).mask("An. Rudi").0, "An. Rudi");
    }
}
