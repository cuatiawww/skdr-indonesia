'use client'

import { tr } from "@/lib/i18n/LanguageContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  MapPin,
  RefreshCw,
} from "lucide-react";
import { fetchPublicDashboard, fetchKpiSnapshot } from "@/lib/api";
import ExecutiveSummary from "@/components/dashboard/ExecutiveSummary";
import SectionNav from "@/components/dashboard/SectionNav";
import SkdrFilterBar, { type SkdrFilterState as EpiFilterState, filterParams } from "@/components/SkdrFilterBar";
import { loadGeo, saveGeo } from "@/lib/use-geo-filter";
import { UkuranFilter } from "@/components/analytics/SourceBadge";
import { useSumber } from "@/lib/use-sumber";
import { getCurrentEpiWeek } from "@/lib/epi-week";
import type { PublicDashboard } from "@/types";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { ErrorState, SkeletonMap } from "@/components/ui/Skeleton";
import { useParams } from "next/navigation";
import LabSection from "@/components/dashboard/LabSection";
import KlasterSection from "@/components/dashboard/KlasterSection";
import EpiCurve from "@/components/dashboard/EpiCurve";
import { SectionHeader } from "@/components/analytics/SourceBadge";
import { kategoriCode, useCategories } from "@/lib/kategori";

const EbsIbsLayerMap = dynamic(
  () => import("@/components/dasbor-ebs-ibs/EbsIbsLayerMap"),
  { ssr: false, loading: () => <SkeletonMap height={640} /> }
);

export interface ZoonosisGeneralViewProps {
  categoryCode?: string;
  pageTitle?: string;
  pageSubtitle?: string;
}

export default function ZoonosisGeneralView({
  categoryCode = "ZOONOSIS",
  pageTitle,
  pageSubtitle,
}: ZoonosisGeneralViewProps) {
  const [, setMounted] = useState(false);
  const { t, locale } = useTranslation();
  const currentYear = new Date().getFullYear();
  const currentEpi = getCurrentEpiWeek();
  const routeParams = useParams<{ kode?: string }>();
  const lockedKategori = routeParams?.kode ? kategoriCode(String(routeParams.kode)) : (categoryCode || "ZOONOSIS");
  const categories = useCategories();
  const kategoriInfo = categories.find((c) => c.code === lockedKategori);

  const [filters, setFilters] = useState<EpiFilterState>({
    diseases: [],
    source: "all",
    provinceIds: [],
    kabkotaIds: [],
    startYear: currentEpi.year || currentYear,
    startWeek: 1,
    endYear: currentEpi.year || currentYear,
    endWeek: currentEpi.week || 1,
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const sY = sp.get("startYear");
      const sW = sp.get("startWeek");
      const eY = sp.get("endYear");
      const eW = sp.get("endWeek");
      const mf = loadGeo();
      const src = sp.get("source");
      const any = mf.diseases.length || mf.provinceIds.length || mf.kabkotaIds.length || mf.units?.length;
      if (sY || sW || eY || eW || any || src) {
        setFilters((prev) => {
          const next: EpiFilterState = {
            ...prev,
            startYear: sY ? Number(sY) : prev.startYear,
            startWeek: sW ? Number(sW) : prev.startWeek,
            endYear: eY ? Number(eY) : prev.endYear,
            endWeek: eW ? Number(eW) : prev.endWeek,
            ...mf,
            source: src === "pe" || src === "ebs" ? src : src === "form" ? "pe" : prev.source,
          };
          queueMicrotask(() => setApplied(next));
          return next;
        });
      }
    }
  }, []);

  const [applied, setApplied] = useState<EpiFilterState>(filters);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const set = (k: string, v: string | number | null | undefined) =>
      v === null || v === undefined || v === "" || v === "all" ? url.searchParams.delete(k) : url.searchParams.set(k, String(v));
    set("startYear", applied.startYear);
    set("startWeek", applied.startWeek);
    set("endYear", applied.endYear);
    set("endWeek", applied.endWeek);
    window.history.replaceState(window.history.state, "", url.toString());
    saveGeo({ diseases: applied.diseases, provinceIds: applied.provinceIds, kabkotaIds: applied.kabkotaIds, units: applied.units || [] });
  }, [applied]);

  const { sumber, setSumber, ukuran, setUkuran, ready: sumberReady } = useSumber();
  const [data, setData] = useState<PublicDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const dashboardApiFilters = useCallback(
    (active: EpiFilterState) => ({
      ...filterParams(active),
      kategori: lockedKategori || active.kategori || undefined,
      source: sumber === "all" ? undefined : sumber,
      start_year: active.startYear,
      start_week: active.startWeek,
      end_year: active.endYear,
      end_week: active.endWeek,
      year: active.endYear,
    }),
    [sumber, lockedKategori]
  );

  const refreshKpis = useCallback(async () => {
    const kpiData = await fetchKpiSnapshot(dashboardApiFilters(applied)).catch(() => null);
    if (!kpiData?.kpis) return;
    setData((prev) => (prev ? { ...prev, kpis: { ...prev.kpis, ...kpiData.kpis } } : prev));
  }, [dashboardApiFilters, applied]);

  const load = useCallback(
    async (customFilters?: EpiFilterState) => {
      const active = customFilters || applied;
      try {
        setError("");
        setLoading(true);
        const dashboardFilters = dashboardApiFilters(active);
        const dashData = await fetchPublicDashboard(dashboardFilters);
        setData(dashData);
      } catch {
        setError(t("common.error"));
      } finally {
        setLoading(false);
      }
    },
    [dashboardApiFilters, applied, t]
  );

  useEffect(() => {
    if (!sumberReady) return;
    load();
    const id = window.setInterval(() => void refreshKpis(), 120_000);
    return () => window.clearInterval(id);
  }, [load, refreshKpis, sumberReady]);

  useEffect(() => {
    const available = data?.available_years;
    if (available?.length && !available.includes(filters.endYear)) {
      setFilters((prev) => ({ ...prev, endYear: available[0], startYear: available[0] }));
      setApplied((prev) => ({ ...prev, endYear: available[0], startYear: available[0] }));
    }
  }, [data?.available_years, filters.endYear]);

  const mapLocations = useMemo(() => data?.locations ?? [], [data?.locations]);
  const countryData = useMemo(
    () => [{ name: "Indonesia", cases: data?.kpis.cases ?? 0, deaths: data?.kpis.deaths ?? 0 }],
    [data?.kpis.cases, data?.kpis.deaths]
  );

  const zoonosisRegions = useMemo(() => {
    return (data?.by_province || []).map((p, idx) => {
      const cases = p.cases || 0;
      const deaths = p.deaths || 0;
      const cfr = cases > 0 ? Number(((deaths / cases) * 100).toFixed(1)) : 0;
      return {
        id: (p as any).id || idx + 1,
        key: p.name,
        name: p.name,
        geo: p.name,
        lat: null,
        lng: null,
        kasus: cases,
        kematian: deaths,
        cfr,
        alert: p.events || 0,
        sppg_unik: 0,
      } as any;
    });
  }, [data?.by_province]);

  const zoonosisPoints = useMemo(() => {
    return (data?.locations || [])
      .filter((l) => l.latitude != null && l.longitude != null && (Number(l.latitude) !== 0 || Number(l.longitude) !== 0))
      .map((l) => ({
        unit_nama: l.location_name || "Fasyankes Terkait",
        nama_sppg: null,
        province_name: l.province || null,
        kabkota_name: l.city || null,
        lat: Number(l.latitude),
        lng: Number(l.longitude),
        coord_source: "faskes",
        last_date: l.published_date || l.latest_date || null,
        kasus: l.cases || 1,
        kematian: l.deaths || 0,
        cfr:
          (l.cases || 1) > 0 && (l.deaths || 0) > 0
            ? Number((((l.deaths || 0) / (l.cases || 1)) * 100).toFixed(1))
            : 0,
        alert: l.has_alert || (l.event_count || 0) > 0 ? 1 : 0,
        label: l.disease ? `${l.disease}: ${l.location_name}` : l.location_name,
      } as any));
  }, [data?.locations]);

  const fitTo = useMemo<[number, number, number, number] | null>(() => {
    if (!applied.provinceIds.length && !applied.kabkotaIds.length) return null;
    const pts = mapLocations
      .map((l) => [Number((l as { longitude?: number }).longitude), Number((l as { latitude?: number }).latitude)])
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && (x !== 0 || y !== 0));
    if (!pts.length) return null;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const pad = 0.3;
    return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
  }, [mapLocations, applied.provinceIds, applied.kabkotaIds]);

  const dashRootRef = useRef<HTMLDivElement>(null);
  const navSentinelRef = useRef<HTMLDivElement>(null);

  const displayTitle =
    pageTitle ||
    (lockedKategori === "ZOONOSIS"
      ? "Dasbor Zoonosis General"
      : lockedKategori
      ? `Dasbor ${kategoriInfo?.short_name || lockedKategori}`
      : t("dashboard.pageTitle"));

  const displaySubtitle =
    pageSubtitle ||
    (lockedKategori === "ZOONOSIS"
      ? "Sintesis komprehensif epidemiologi zoonosis: beban kasus, CFR, kurva tren mingguan, alert respon SKDR, dan peta sebaran faskes."
      : lockedKategori
      ? kategoriInfo
        ? `${kategoriInfo.name}: ${kategoriInfo.description || ""} Mencakup ${kategoriInfo.diseases.map((d) => d.name).join(", ") || "-"}.`
        : ""
      : t("dashboard.pageSubtitle"));

  return (
    <div ref={dashRootRef} className="w-full space-y-6 bg-page px-4 py-6 sm:px-6 lg:px-8" data-testid="zoonosis-general-root">
      <section className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900">
            {displayTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {displaySubtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sumber !== "pe" ? <UkuranFilter value={ukuran} onChange={setUkuran} /> : null}
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-primary transition hover:bg-blue-100"
          >
            <RefreshCw className="h-4 w-4" />
            {t("dashboard.refresh")}
          </button>
        </div>
      </section>

      <SkdrFilterBar
        availableDiseases={data?.available_diseases}
        availableYears={data?.available_years}
        currentEpiWeek={data?.current_epi_week}
        currentEpiYear={data?.current_epi_year}
        value={filters}
        onChange={(newFilters) => setFilters(newFilters)}
        onApply={(newFilters) => {
          setFilters(newFilters);
          setApplied(newFilters);
        }}
        isLoading={loading}
        sumber={sumber}
        onSumberChange={setSumber}
        showKategori
        lockedKategori={lockedKategori || undefined}
      />

      <div ref={navSentinelRef} aria-hidden className="!mt-0 h-0" />
      <SectionNav rootRef={dashRootRef} sentinelRef={navSentinelRef} />

      {error ? <ErrorState onRetry={() => void load()} /> : null}

      <ExecutiveSummary
        query={dashboardApiFilters(applied)}
        sumber={sumber}
        ukuran={ukuran}
        slots={{
          laboratorium: <LabSection query={dashboardApiFilters(applied)} />,
          klaster: (
            <section className="skdr-section w-full space-y-4">
              <SectionHeader title="Klaster dan epi curve" description="Kurva epidemi mingguan dan klaster KLB." />
              <EpiCurve query={dashboardApiFilters(applied)} />
              <KlasterSection query={dashboardApiFilters(applied)} showHeader={false} />
            </section>
          ),
        }}
        afterCards={
          <section className="skdr-section w-full" data-testid="zoonosis-map-section">
            {!data ? (
              <SkeletonMap height={640} />
            ) : (
              <EbsIbsLayerMap
                mode="zoonosis"
                title={`Peta Sebaran ${displayTitle}`}
                eyebrow="PETA SPASIAL ZOONOSIS ONE HEALTH"
                level={applied.provinceIds.length === 1 ? "kab" : "prov"}
                parentName={
                  applied.provinceIds.length === 1
                    ? data.by_province?.find((p) => applied.provinceIds.includes((p as any).id))?.name || "Provinsi Terpilih"
                    : null
                }
                regions={zoonosisRegions}
                points={zoonosisPoints}
                onDrillDown={(id, name) => {
                  setFilters((prev) => ({ ...prev, provinceIds: [id] }));
                  setApplied((prev) => ({ ...prev, provinceIds: [id] }));
                }}
                onResetLevel={() => {
                  setFilters((prev) => ({ ...prev, provinceIds: [] }));
                  setApplied((prev) => ({ ...prev, provinceIds: [] }));
                }}
              />
            )}
          </section>
        }
      />
    </div>
  );
}

