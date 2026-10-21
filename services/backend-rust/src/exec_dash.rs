//! PR 010: executive dashboard summary (sheet "Spesifikasi Dashboard Executive", sections 1-2 + coverage).
//! Indicator definitions (disease groups, EBS diagnosa matching, PE status codes, CFR rows, thresholds and the
//! implemented/pending list) live in app_settings.dashboard_executive (migration 019), not in code.
//! Rules from the sheet: EBS alerts and individual reports are labelled by source and never summed;
//! CFR only from confirmed cases (rabies: klinis + konfirmasi) with known outcome; 95% CI = Wilson.
use axum::{extract::{Query, State}, Json};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

use crate::dashboard::{resolve, DashQuery};
use crate::{internal, ApiError, AppState};

/// Wilson score interval (percent) for k events out of n.
pub fn wilson(k: i64, n: i64, z: f64) -> Option<(f64, f64)> {
    if n <= 0 {
        return None;
    }
    let (k, n) = (k as f64, n as f64);
    let p = k / n;
    let z2 = z * z;
    let den = 1.0 + z2 / n;
    let centre = (p + z2 / (2.0 * n)) / den;
    let half = z * ((p * (1.0 - p) / n + z2 / (4.0 * n * n)).sqrt()) / den;
    Some((((centre - half).max(0.0)) * 100.0, ((centre + half).min(1.0)) * 100.0))
}

fn strs(v: Option<&Value>) -> Vec<String> {
    v.and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|s| s.as_str().map(|s| s.to_string())).collect()).unwrap_or_default()
}

fn rate(k: i64, n: i64, cfg: &Value) -> Value {
    let below = cfg.get("fraction_below").and_then(|v| v.as_i64()).unwrap_or(10);
    let z = cfg.get("z").and_then(|v| v.as_f64()).unwrap_or(1.96);
    let ci = wilson(k, n, z);
    json!({
        "num": k, "den": n,
        "pct": if n > 0 { Some(k as f64 * 100.0 / n as f64) } else { None },
        "as_fraction": n > 0 && n < below,
        "ci_low": ci.map(|c| c.0), "ci_high": ci.map(|c| c.1),
    })
}

#[derive(Default, Clone)]
struct EbsAgg { alerts: i64, verified: i64, discarded: i64, cases: i64, deaths: i64, notif_on_time: i64, notif_den: i64, notif_missing: i64 }

pub async fn executive(State(s): State<AppState>, Query(q): Query<DashQuery>) -> Result<Json<Value>, ApiError> {
    let c = s.pool.get().await.map_err(internal)?;
    let f = resolve(&c, &q).await?;
    let cfg: Value = c
        .query_opt("SELECT value FROM app_settings WHERE key = 'dashboard_executive'", &[])
        .await
        .map_err(internal)?
        .and_then(|r| serde_json::from_str(&r.get::<_, String>(0)).ok())
        .unwrap_or(Value::Null);
    let groups_cfg: Vec<Value> = cfg.get("groups").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let show_ebs = !matches!(f.source.as_deref(), Some("form") | Some("pe"));
    let show_ind = f.source.as_deref() != Some("ebs");

    // disease filter -> groups (by master code or name); a non-zoonosis disease leaves no group
    let mut groups: Vec<Value> = vec![];
    for g in &groups_cfg {
        let codes = strs(g.get("disease_codes"));
        let ok = match &f.disease {
            None => true,
            Some(d) => c
                .query_opt("SELECT 1 FROM master_diseases WHERE code = ANY($1) AND (code = $2 OR name = $2)", &[&codes, d])
                .await
                .map_err(internal)?
                .is_some(),
        };
        if ok {
            groups.push(g.clone());
        }
    }

    // ---- EBS alerts: text = verifikasi when filled (sheet No. 7), else diagnosa
    let verified_prefix = cfg.pointer("/ebs/verified_prefix").and_then(|v| v.as_str()).unwrap_or("Terverifikasi").to_string();
    let discarded = strs(cfg.pointer("/ebs/discarded"));
    let mut ebs_by_text: HashMap<String, EbsAgg> = HashMap::new();
    let mut ebs_total: i64 = 0;
    if show_ebs {
        let rows = c
            .query(
                "SELECT lower(COALESCE(NULLIF(trim(e.verifikasi), ''), trim(e.diagnosa))) t,
                        COUNT(*)::bigint,
                        COUNT(*) FILTER (WHERE e.sts_rumor ILIKE $7 || '%')::bigint,
                        COUNT(*) FILTER (WHERE e.sts_rumor = ANY($8))::bigint,
                        COALESCE(SUM(e.jml_kasus) FILTER (WHERE e.sts_rumor ILIKE $7 || '%'), 0)::bigint,
                        COALESCE(SUM(e.jml_kematian) FILTER (WHERE e.sts_rumor ILIKE $7 || '%'), 0)::bigint,
                        COUNT(*) FILTER (WHERE NOT (e.sts_rumor = ANY($8)) AND e.create_date IS NOT NULL AND e.tgl_laporan IS NOT NULL
                                         AND e.create_date::date - e.tgl_laporan <= 1)::bigint,
                        COUNT(*) FILTER (WHERE e.sts_rumor IS NULL OR NOT (e.sts_rumor = ANY($8)))::bigint,
                        COUNT(*) FILTER (WHERE (e.sts_rumor IS NULL OR NOT (e.sts_rumor = ANY($8))) AND (e.create_date IS NULL OR e.tgl_laporan IS NULL))::bigint
                 FROM ebs_reports e
                 WHERE ($1::date IS NULL OR COALESCE(e.tgl_laporan, e.create_date::date) >= $1)
                   AND ($2::date IS NULL OR COALESCE(e.tgl_laporan, e.create_date::date) <= $2)
                   AND ($3::int IS NULL OR e.province_id = $3) AND ($4::int IS NULL OR e.kabkota_id = $4)
                   AND ($5::text IS NULL OR true) AND ($6::text IS NULL OR true)
                 GROUP BY 1",
                &[&f.start, &f.end, &f.province, &f.kabkota, &f.disease, &f.source, &verified_prefix, &discarded],
            )
            .await
            .map_err(internal)?;
        for r in rows {
            let t: Option<String> = r.get(0);
            let a = EbsAgg {
                alerts: r.get(1), verified: r.get(2), discarded: r.get(3), cases: r.get(4), deaths: r.get(5),
                notif_on_time: r.get(6), notif_den: r.get(7), notif_missing: r.get(8),
            };
            ebs_total += a.alerts;
            ebs_by_text.insert(t.unwrap_or_default(), a);
        }
    }

    // ---- individual reports (Form PE): per form, effective class (override > computed), workflow status, outcome
    let counted = strs(cfg.get("pe_count_statuses"));
    let mut pe: HashMap<String, Vec<(String, String, Option<String>, bool, i64)>> = HashMap::new();
    let mut pe_status: HashMap<String, HashMap<String, i64>> = HashMap::new();
    if show_ind {
        let rows = c
            .query(
                "SELECT form_key, COALESCE(classification_override, classification, 'belum') cls, status, outcome,
                        (nik IS NOT NULL AND nik <> '') has_nik, COUNT(*)::bigint
                 FROM pe_cases
                 WHERE deleted_at IS NULL AND ($1::date IS NULL OR COALESCE(tgl_laporan, created_at::date) >= $1)
                   AND ($2::date IS NULL OR COALESCE(tgl_laporan, created_at::date) <= $2)
                   AND ($3::int IS NULL OR province_id = $3) AND ($4::int IS NULL OR kabkota_id = $4)
                 GROUP BY 1, 2, 3, 4, 5",
                &[&f.start, &f.end, &f.province, &f.kabkota],
            )
            .await
            .map_err(internal)?;
        for r in rows {
            let (form, cls, st, out, nik, n): (String, String, String, Option<String>, bool, i64) =
                (r.get(0), r.get(1), r.get(2), r.get(3), r.get(4), r.get(5));
            *pe_status.entry(form.clone()).or_default().entry(st.clone()).or_default() += n;
            if counted.is_empty() || counted.contains(&st) {
                pe.entry(form).or_default().push((cls, st, out, nik, n));
            }
        }
    }
    let dead_v = cfg.pointer("/outcome/dead").and_then(|v| v.as_str()).unwrap_or("Meninggal").to_string();
    let known = strs(cfg.pointer("/outcome/known"));

    let mut cards = vec![];
    let mut cfr_groups = vec![];
    let mut status_cards = vec![];
    let mut star_deaths: Vec<Value> = vec![];
    let (mut nik_num, mut nik_den) = (0i64, 0i64);
    let mut ind_total: i64 = 0;
    for g in &groups {
        let form = g.get("pe_form").and_then(|v| v.as_str()).unwrap_or("").to_string();
        // EBS sub-groups (GHPR and rabies separate)
        let mut ebs_subs = vec![];
        for sub in g.get("ebs_sub").and_then(|v| v.as_array()).into_iter().flatten() {
            let mut a = EbsAgg::default();
            for m in strs(sub.get("match")) {
                if let Some(x) = ebs_by_text.get(&m.to_lowercase()) {
                    a.alerts += x.alerts; a.verified += x.verified; a.discarded += x.discarded; a.cases += x.cases; a.deaths += x.deaths;
                    a.notif_on_time += x.notif_on_time; a.notif_den += x.notif_den; a.notif_missing += x.notif_missing;
                }
            }
            let count_deaths = sub.get("count_deaths").and_then(|v| v.as_bool()).unwrap_or(true);
            ebs_subs.push(json!({
                "code": sub.get("code"), "label": sub.get("label"),
                "alerts": a.alerts, "verified": a.verified, "discarded": a.discarded,
                "verified_rate": rate(a.verified, a.alerts, &cfg),
                "cases": a.cases, "deaths": if count_deaths { Some(a.deaths) } else { None },
                "notification": rate(a.notif_on_time, a.notif_den, &cfg), "notification_missing": a.notif_missing,
            }));
        }
        // individual reports
        let rows = pe.get(&form).cloned().unwrap_or_default();
        let total: i64 = rows.iter().map(|r| r.4).sum();
        ind_total += total;
        let mut by_cls: Map<String, Value> = Map::new();
        for st in g.get("pe_status").and_then(|v| v.as_array()).into_iter().flatten() {
            let code = st.get("code").and_then(|v| v.as_str()).unwrap_or("");
            let n: i64 = rows.iter().filter(|r| r.0 == code).map(|r| r.4).sum();
            by_cls.insert(code.into(), json!(n));
        }
        let other_cls: i64 = rows.iter().filter(|r| !by_cls.contains_key(&r.0)).map(|r| r.4).sum();
        let death_codes = strs(g.get("death_codes"));
        let deaths: i64 = rows.iter().filter(|r| r.2.as_deref() == Some(&dead_v) && (death_codes.is_empty() || death_codes.contains(&r.0))).map(|r| r.4).sum();
        let nik_ex = strs(g.get("nik_exclude"));
        nik_den += rows.iter().filter(|r| !nik_ex.contains(&r.0)).map(|r| r.4).sum::<i64>();
        nik_num += rows.iter().filter(|r| !nik_ex.contains(&r.0) && r.3).map(|r| r.4).sum::<i64>();
        cards.push(json!({
            "code": g.get("code"), "label": g.get("label"), "color": g.get("color"), "pe_form": form, "link": g.get("link"), "disease_code": strs(g.get("disease_codes")).first().cloned(),
            "ebs": ebs_subs, "individual": { "total": total, "by_status": by_cls, "unclassified": other_cls, "deaths": deaths,
                                               "split": g.get("individual_split"), "status_defs": g.get("pe_status") },
        }));
        // CFR (confirmed rows with CFR, starred rows without)
        let cfr = g.get("cfr").cloned().unwrap_or(Value::Null);
        let agg = |codes: &[String]| {
            let sel: Vec<_> = rows.iter().filter(|r| codes.contains(&r.0)).collect();
            let dead: i64 = sel.iter().filter(|r| r.2.as_deref() == Some(&dead_v)).map(|r| r.4).sum();
            let kn: i64 = sel.iter().filter(|r| r.2.as_ref().map(|o| known.contains(o)).unwrap_or(false)).map(|r| r.4).sum();
            let all: i64 = sel.iter().map(|r| r.4).sum();
            (dead, kn, all - kn)
        };
        let conf = strs(cfr.get("confirmed"));
        let (d, k, u) = agg(&conf);
        let mut crow = vec![json!({"label": cfr.get("confirmed_label"), "star": false, "known": k, "deaths": d, "unknown": u, "cfr": rate(d, k, &cfg)})];
        for st in cfr.get("star").and_then(|v| v.as_array()).into_iter().flatten() {
            let code = strs(Some(&json!([st.get("code")])));
            let (d, k, u) = agg(&code);
            if d > 0 {
                star_deaths.push(json!({"label": st.get("label"), "deaths": d}));
            }
            crow.push(json!({"label": st.get("label"), "star": true, "known": k, "deaths": d, "unknown": u}));
        }
        cfr_groups.push(json!({"code": g.get("code"), "label": g.get("label"), "color": g.get("color"), "rows": crow}));
        status_cards.push(json!({"code": g.get("code"), "label": g.get("label"), "pe_form": form, "by_status": pe_status.get(&form).cloned().unwrap_or_default()}));
    }

    // ---- case reports (Formulir Laporan Kasus) — shown separately, never summed with EBS/PE
    let form_reports: i64 = if show_ind {
        c.query_one(
            "SELECT COUNT(*)::bigint FROM case_reports r LEFT JOIN master_diseases d ON d.id = r.disease_id
             WHERE ($1::date IS NULL OR r.report_date >= $1) AND ($2::date IS NULL OR r.report_date <= $2)
               AND ($3::int IS NULL OR r.location_id = $3) AND ($4::int IS NULL OR r.kabkota_id = $4)
               AND ($5::text IS NULL OR d.name = $5 OR d.code = $5)",
            &[&f.start, &f.end, &f.province, &f.kabkota, &f.disease],
        ).await.map_err(internal)?.get(0)
    } else { 0 };

    // ---- coverage: provinces / kab-kota with at least one report from any source (filters applied)
    let cov = c
        .query_one(
            "WITH u AS (
               SELECT e.province_id p, e.kabkota_id k FROM ebs_reports e
                WHERE $5 AND ($1::date IS NULL OR COALESCE(e.tgl_laporan, e.create_date::date) >= $1) AND ($2::date IS NULL OR COALESCE(e.tgl_laporan, e.create_date::date) <= $2)
                  AND ($3::int IS NULL OR e.province_id = $3) AND ($4::int IS NULL OR e.kabkota_id = $4)
               UNION ALL
               SELECT province_id, kabkota_id FROM pe_cases
                WHERE $6 AND deleted_at IS NULL AND ($1::date IS NULL OR COALESCE(tgl_laporan, created_at::date) >= $1) AND ($2::date IS NULL OR COALESCE(tgl_laporan, created_at::date) <= $2)
                  AND ($3::int IS NULL OR province_id = $3) AND ($4::int IS NULL OR kabkota_id = $4)
               UNION ALL
               SELECT location_id, kabkota_id FROM case_reports
                WHERE $6 AND ($1::date IS NULL OR report_date >= $1) AND ($2::date IS NULL OR report_date <= $2)
                  AND ($3::int IS NULL OR location_id = $3) AND ($4::int IS NULL OR kabkota_id = $4))
             SELECT (SELECT COUNT(DISTINCT p) FROM u WHERE p IS NOT NULL)::bigint, (SELECT COUNT(DISTINCT k) FROM u WHERE k IS NOT NULL)::bigint,
                    (SELECT COUNT(*) FROM master_locations WHERE is_active AND ($3::int IS NULL OR id = $3))::bigint,
                    (SELECT COUNT(*) FROM master_kabkota WHERE is_active AND ($3::int IS NULL OR province_id = $3) AND ($4::int IS NULL OR id = $4))::bigint,
                    -- PR 013: names of active provinces without any report (shown on the coverage card)
                    ARRAY(SELECT l.name FROM master_locations l WHERE l.is_active AND ($3::int IS NULL OR l.id = $3)
                           AND NOT EXISTS (SELECT 1 FROM u WHERE u.p = l.id) ORDER BY l.name),
                    -- PR 013: 5 provinces with the lowest kab/kota reporting coverage
                    (SELECT COALESCE(json_agg(x ORDER BY x.ratio, x.name), '[]'::json)::text FROM (
                       SELECT l.name, COUNT(DISTINCT u.k) FILTER (WHERE u.k IS NOT NULL)::int AS num, kt.n::int AS den,
                              COUNT(DISTINCT u.k) FILTER (WHERE u.k IS NOT NULL)::float / kt.n AS ratio
                         FROM master_locations l
                         JOIN LATERAL (SELECT COUNT(*) n FROM master_kabkota mk WHERE mk.is_active AND mk.province_id = l.id) kt ON kt.n > 0
                         LEFT JOIN u ON u.p = l.id AND u.k IN (SELECT id FROM master_kabkota WHERE province_id = l.id)
                        WHERE l.is_active AND ($3::int IS NULL OR l.id = $3)
                        GROUP BY l.name, kt.n ORDER BY ratio, l.name LIMIT 5) x)",
            &[&f.start, &f.end, &f.province, &f.kabkota, &show_ebs, &show_ind],
        )
        .await
        .map_err(internal)?;
    let (cp, ck, tp, tk): (i64, i64, i64, i64) = (cov.get(0), cov.get(1), cov.get(2), cov.get(3));
    let missing_prov: Vec<String> = cov.get(4);
    let kab_low: Value = serde_json::from_str(&cov.get::<_, String>(5)).unwrap_or(json!([]));
    let zoonosis_ebs: i64 = cards.iter().flat_map(|c| c["ebs"].as_array().cloned().unwrap_or_default()).map(|s| s["alerts"].as_i64().unwrap_or(0)).sum();

    Ok(Json(json!({
        "success": true,
        "data": {
            "filters": {"scope": f.scope, "disease": f.disease, "source": f.source,
                        "start_date": f.start.map(|d| d.to_string()), "end_date": f.end.map(|d| d.to_string())},
            "header": {"individual_reports": if show_ind { Some(ind_total) } else { None }, "ebs_alerts_zoonosis": if show_ebs { Some(zoonosis_ebs) } else { None },
                       "ebs_alerts_all": if show_ebs && f.disease.is_none() { Some(ebs_total) } else { None }, "form_reports": if show_ind { Some(form_reports) } else { None }},
            "no_group_for_disease": f.disease.is_some() && groups.is_empty(),
            "cards": cards,
            "cfr": {"groups": cfr_groups, "star_deaths": star_deaths},
            "pe_status": status_cards,
            "nik": rate(nik_num, nik_den, &cfg),
            "coverage": {"provinces": rate(cp, tp, &cfg), "kabkota": rate(ck, tk, &cfg), "provinces_missing": missing_prov, "kab_by_province": kab_low},
            "config": {"indicators": cfg.get("indicators"), "status_labels": cfg.get("pe_status_labels"), "texts": cfg.get("texts"),
                       "pe_count_statuses": cfg.get("pe_count_statuses"), "fraction_below": cfg.get("fraction_below")},
            "updated_at": chrono::Utc::now().to_rfc3339(),
        }
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wilson_interval() {
        let (lo, hi) = wilson(5, 50, 1.96).unwrap();
        assert!((lo - 4.35).abs() < 0.05 && (hi - 21.36).abs() < 0.05, "{lo} {hi}");
        let (lo, hi) = wilson(0, 10, 1.96).unwrap();
        assert!(lo == 0.0 && (hi - 27.75).abs() < 0.05, "{hi}");
        assert!(wilson(0, 0, 1.96).is_none());
    }
}
