'use client'
// PR 057 (Revised): Dynamic Sidebar Filter Panel for Dasbor SKDR Terpadu
// - Auto layout, no horizontal scroll, no overflowing inputs
// - Clean labels: Semua, IBS, EBS (no Rutin/Sinyal terms)
// - Explicit "Terapkan Filter" button (draft state, applies on click)
// - Centralized filtering: all tab options managed here so cards stay clean
import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Check,
  Filter,
  Layers,
  RotateCcw,
  SlidersHorizontal,
  Stethoscope,
  X,
} from 'lucide-react'
import SearchSelect from '@/components/ui/SearchSelect'
import { fetchKabkota, fetchProvinces, type MasterKabkota, type MasterProvince } from '@/lib/skdr-api'
import {
  activeFilterCount,
  defaultSkdrFilter,
  presetRange,
  type EarsAlgoritma,
  type ModeTren,
  type SkdrFilter,
  type SkdrTab,
  type SumberFilter,
} from '@/lib/dasbor-skdr-filter'
import { MASTER_36_DISEASES } from '@/lib/dasbor-skdr-api'

const box =
  'h-9 w-full max-w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 outline-none transition hover:border-brand-300 focus:border-primary focus:ring-1 focus:ring-primary/30 truncate box-border'
const lbl =
  'mb-1 flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-600'

export default function SkdrFilterPanel({
  f,
  onApply,
  tab,
  onClose,
}: {
  f: SkdrFilter
  onApply: (applied: SkdrFilter) => void
  tab: SkdrTab
  onClose?: () => void
}) {
  // Local draft state for explicit "Terapkan Filter" action
  const [draft, setDraft] = useState<SkdrFilter>(f)
  const [provs, setProvs] = useState<MasterProvince[]>([])
  const [kabs, setKabs] = useState<MasterKabkota[]>([])

  // Keep draft in sync if external applied filters change (e.g. from URL load)
  useEffect(() => {
    setDraft(f)
  }, [f])

  useEffect(() => {
    fetchProvinces()
      .then(setProvs)
      .catch(() => setProvs([]))
  }, [])

  const provKey = draft.prov.join(',')
  useEffect(() => {
    if (!draft.prov.length) {
      setKabs([])
      return
    }
    Promise.all(draft.prov.map((p) => fetchKabkota(Number(p)).catch(() => [] as MasterKabkota[])))
      .then((l) => setKabs(l.flat()))
      .catch(() => setKabs([]))
  }, [provKey])

  const setPatch = (patch: Partial<SkdrFilter>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  const handleApply = () => {
    onApply(draft)
  }

  const handleReset = () => {
    const def = defaultSkdrFilter()
    setDraft(def)
    onApply(def)
  }

  const count = activeFilterCount(draft, tab)
  const isDirty = JSON.stringify(draft) !== JSON.stringify(f)

  return (
    <aside
      className="flex w-full max-w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs box-border"
      data-testid="skdr-filter-panel"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-800">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <span>Filter Dasbor SKDR</span>
          {count > 0 && (
            <span
              className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white"
              data-testid="filter-badge"
            >
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {count > 0 && (
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Atur Ulang Filter"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
              aria-label="Sembunyikan filter"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Body with Clean Auto Layout */}
      <div className="w-full space-y-4 overflow-x-hidden p-4 text-xs box-border">
        {/* Pilar Surveilans: Clean labels (Semua, IBS, EBS) */}
        <div>
          <div className={lbl}>
            <Layers className="h-3.5 w-3.5 text-primary" />
            <span>Pilar Surveilans</span>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {(
              [
                ['semua', 'Semua'],
                ['ibs', 'IBS'],
                ['ebs', 'EBS'],
              ] as [SumberFilter, string][]
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setPatch({ sumber: val })}
                className={`rounded-lg py-1.5 text-center text-[11px] font-bold transition ${
                  draft.sumber === val
                    ? 'bg-white text-primary shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Periode Waktu */}
        <div>
          <div className={lbl}>
            <CalendarDays className="h-3.5 w-3.5 text-primary" />
            <span>Periode Waktu</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[11px] font-semibold text-slate-500">Tahun</span>
              <select
                className={box}
                value={draft.ey}
                onChange={(e) => {
                  const y = Number(e.target.value)
                  setPatch({ sy: y, ey: y })
                }}
              >
                <option value={2026}>2026</option>
                <option value={2025}>2025</option>
                <option value={2024}>2024</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[11px] font-semibold text-slate-500">Minggu</span>
              <div className="flex flex-1 items-center gap-1.5 min-w-0">
                <input
                  type="number"
                  min={1}
                  max={52}
                  className="h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none text-center"
                  value={draft.sw}
                  onChange={(e) =>
                    setPatch({ sw: Math.max(1, Math.min(52, Number(e.target.value))) })
                  }
                  placeholder="1"
                />
                <span className="text-slate-400 font-bold shrink-0">s/d</span>
                <input
                  type="number"
                  min={1}
                  max={52}
                  className="h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none text-center"
                  value={draft.ew}
                  onChange={(e) =>
                    setPatch({ ew: Math.max(1, Math.min(52, Number(e.target.value))) })
                  }
                  placeholder="52"
                />
              </div>
            </div>
          </div>
          {/* Presets */}
          <div className="mt-2 flex flex-wrap gap-1">
            {(
              [
                ['4m', '4 Minggu'],
                ['12m', '12 Minggu'],
                ['tahun', 'Tahun Berjalan'],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => setPatch(presetRange(kind))}
                className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:border-primary hover:text-primary transition"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Pilihan Penyakit (Centralized across dashboard) */}
        <div>
          <div className={lbl}>
            <Stethoscope className="h-3.5 w-3.5 text-primary" />
            <span>Penyakit Indikator</span>
          </div>
          <SearchSelect
            multiple
            options={MASTER_36_DISEASES.map((d) => ({
              value: d.code,
              label: `${d.kode_sms ? `[${d.kode_sms}] ` : ''}${d.name}`,
              hint: d.category,
            }))}
            value={draft.penyakit}
            placeholder="Pilih Penyakit..."
            onChange={(penyakit) => setPatch({ penyakit })}
            testId="filter-penyakit"
          />
        </div>

        {/* Hierarki Wilayah */}
        <div>
          <div className={lbl}>Provinsi</div>
          <SearchSelect
            multiple
            options={provs.map((p) => ({ value: String(p.id), label: p.name }))}
            value={draft.prov}
            placeholder="Semua Provinsi (Nasional)"
            onChange={(prov) => setPatch({ prov, kab: [] })}
            testId="filter-provinsi"
          />
        </div>

        <div>
          <div className={lbl}>Kabupaten / Kota</div>
          <SearchSelect
            multiple
            options={kabs.map((k) => ({
              value: String(k.id),
              label: k.name,
              hint: draft.prov.length > 1 ? k.province_name : undefined,
            }))}
            value={draft.kab}
            disabled={!draft.prov.length}
            disabledHint="Pilih provinsi terlebih dahulu"
            placeholder="Semua Kab/Kota"
            onChange={(kab) => setPatch({ kab })}
            testId="filter-kabkota"
          />
        </div>

        {/* Parameter Khusus Tab Tren (Moved here from card) */}
        {tab === 'tren' && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-3">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-600">
              Konfigurasi Tren Penyakit
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-600 block mb-1">
                Tipe Komparasi
              </span>
              <select
                className={box}
                value={draft.modeTren}
                onChange={(e) => setPatch({ modeTren: e.target.value as ModeTren })}
              >
                <option value="tahunan">Tahun Berjalan vs Tahun Lalu</option>
                <option value="multiTahun">Multi-Tahun (2024–2026)</option>
                <option value="komparasiWilayah">Komparasi Antar-Wilayah</option>
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={draft.iklimOverlay}
                onChange={(e) => setPatch({ iklimOverlay: e.target.checked })}
                className="rounded border-slate-300 text-primary focus:ring-primary/30"
              />
              <span className="font-semibold text-[11px] leading-tight">
                Lapisan Iklim Copernicus ERA5
              </span>
            </label>
          </div>
        )}

        {/* Parameter Khusus Tab Deteksi (Moved here from card, no overflow!) */}
        {tab === 'deteksi' && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-3 max-w-full overflow-hidden">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-600">
              Model Deteksi Outbreak
            </div>
            <div className="w-full max-w-full overflow-hidden">
              <span className="text-[11px] font-semibold text-slate-600 block mb-1">
                Model Statistik
              </span>
              <select
                className={box}
                value={draft.earsAlgoritma}
                onChange={(e) => setPatch({ earsAlgoritma: e.target.value as EarsAlgoritma })}
              >
                <option value="c1">EARS C1 (Baseline 7 Hari)</option>
                <option value="c2">EARS C2 (CDC / WHO, Lag 2 Hari)</option>
                <option value="c3">EARS C3 (Deviasi 3 Hari)</option>
                <option value="farrington">Farrington (Musiman)</option>
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={draft.earsHanyaAlert}
                onChange={(e) => setPatch({ earsHanyaAlert: e.target.checked })}
                className="rounded border-slate-300 text-primary focus:ring-primary/30"
              />
              <span className="font-semibold text-[11px]">Hanya Tampilkan ALERT</span>
            </label>
            <div className="w-full max-w-full overflow-hidden">
              <span className="text-[11px] font-semibold text-slate-600 block mb-1">
                Time-Lag Karhutla vs ISPA
              </span>
              <select
                className={box}
                value={draft.hotspotLag}
                onChange={(e) => setPatch({ hotspotLag: Number(e.target.value) })}
              >
                <option value={0}>Minggu Sama (+0 Minggu)</option>
                <option value={1}>Dampak +1 Minggu</option>
                <option value={2}>Dampak +2 Minggu</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Prominent Action Button: "Terapkan Filter" */}
      <div className="border-t border-slate-100 p-4 bg-slate-50/70 space-y-2">
        <button
          type="button"
          onClick={handleApply}
          className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-sm transition ${
            isDirty
              ? 'bg-primary hover:bg-primary-dark ring-2 ring-primary/30 animate-pulse'
              : 'bg-primary hover:bg-primary-dark'
          }`}
          data-testid="filter-apply-btn"
        >
          <Check className="h-4 w-4" />
          <span>Terapkan Filter</span>
          {isDirty && (
            <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
              Belum disimpan
            </span>
          )}
        </button>

        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
          <span>{draft.prov.length ? `${draft.prov.length} Provinsi` : 'Skala Nasional'}</span>
          <button
            type="button"
            onClick={handleReset}
            className="font-bold text-slate-500 hover:text-primary transition"
          >
            Reset Default
          </button>
        </div>
      </div>
    </aside>
  )
}
