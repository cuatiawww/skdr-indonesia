'use client'
// PR 057: Dynamic Sidebar Filter Panel for Dasbor SKDR Terpadu
import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  ChevronDown,
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
  type SkdrFilter,
  type SkdrTab,
  type SumberFilter,
} from '@/lib/dasbor-skdr-filter'
import { MASTER_36_DISEASES } from '@/lib/dasbor-skdr-api'

const box =
  'h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 outline-none transition hover:border-brand-300 focus:border-primary focus:ring-1 focus:ring-primary/30'
const lbl = 'mb-1.5 flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-600'

export default function SkdrFilterPanel({
  f,
  set,
  tab,
  onClose,
}: {
  f: SkdrFilter
  set: (p: Partial<SkdrFilter>) => void
  tab: SkdrTab
  onClose?: () => void
}) {
  const [provs, setProvs] = useState<MasterProvince[]>([])
  const [kabs, setKabs] = useState<MasterKabkota[]>([])
  const [advOpen, setAdvOpen] = useState(false)

  useEffect(() => {
    fetchProvinces()
      .then(setProvs)
      .catch(() => setProvs([]))
  }, [])

  const provKey = f.prov.join(',')
  useEffect(() => {
    if (!f.prov.length) {
      setKabs([])
      return
    }
    Promise.all(f.prov.map((p) => fetchKabkota(Number(p)).catch(() => [] as MasterKabkota[])))
      .then((l) => setKabs(l.flat()))
      .catch(() => setKabs([]))
  }, [provKey])

  const count = activeFilterCount(f, tab)

  return (
    <aside
      className="flex max-h-full flex-col rounded-2xl border border-slate-200 bg-white shadow-2xs"
      data-testid="skdr-filter-panel"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
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
              onClick={() => set(defaultSkdrFilter())}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Reset Filter"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Sembunyikan filter"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Body */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-xs">
        {/* Pilar Surveilans */}
        <div>
          <div className={lbl}>
            <Layers className="h-3.5 w-3.5 text-primary" />
            <span>Pilar Surveilans</span>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {(
              [
                ['semua', 'Semua'],
                ['ibs', 'IBS (Rutin)'],
                ['ebs', 'EBS (Sinyal)'],
              ] as [SumberFilter, string][]
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => set({ sumber: val })}
                className={`rounded-lg py-1.5 text-center text-[11px] font-bold transition ${
                  f.sumber === val
                    ? 'bg-white text-primary shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Periode Epidemiologi */}
        <div>
          <div className={lbl}>
            <CalendarDays className="h-3.5 w-3.5 text-primary" />
            <span>Periode Epidemiologi</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-12 text-[11px] font-semibold text-slate-500">Tahun</span>
              <select
                className={box}
                value={f.ey}
                onChange={(e) => {
                  const y = Number(e.target.value)
                  set({ sy: y, ey: y })
                }}
              >
                <option value={2026}>2026 (Tahun Berjalan)</option>
                <option value={2025}>2025</option>
                <option value={2024}>2024</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-12 text-[11px] font-semibold text-slate-500">Minggu</span>
              <div className="flex flex-1 items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={52}
                  className={box}
                  value={f.sw}
                  onChange={(e) => set({ sw: Math.max(1, Math.min(52, Number(e.target.value))) })}
                  placeholder="Mulai (1)"
                />
                <span className="text-slate-400">s/d</span>
                <input
                  type="number"
                  min={1}
                  max={52}
                  className={box}
                  value={f.ew}
                  onChange={(e) => set({ ew: Math.max(1, Math.min(52, Number(e.target.value))) })}
                  placeholder="Sampai (52)"
                />
              </div>
            </div>
          </div>
          {/* Quick Presets */}
          <div className="mt-2 flex flex-wrap gap-1.5">
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
                onClick={() => set(presetRange(kind))}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 transition hover:border-primary hover:text-primary"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Pilihan Penyakit */}
        <div>
          <div className={lbl}>
            <Stethoscope className="h-3.5 w-3.5 text-primary" />
            <span>Penyakit Indikator (36 Penyakit)</span>
          </div>
          <SearchSelect
            multiple
            options={MASTER_36_DISEASES.map((d) => ({
              value: d.code,
              label: `${d.kode_sms ? `[${d.kode_sms}] ` : ''}${d.name}`,
              hint: d.category,
            }))}
            value={f.penyakit}
            placeholder="Pilih Penyakit Indikator..."
            onChange={(penyakit) => set({ penyakit })}
            testId="filter-penyakit"
          />
        </div>

        {/* Hierarki Wilayah */}
        <div>
          <div className={lbl}>Provinsi</div>
          <SearchSelect
            multiple
            options={provs.map((p) => ({ value: String(p.id), label: p.name }))}
            value={f.prov}
            placeholder="Semua Provinsi (Nasional)"
            onChange={(prov) => set({ prov, kab: [] })}
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
              hint: f.prov.length > 1 ? k.province_name : undefined,
            }))}
            value={f.kab}
            disabled={!f.prov.length}
            disabledHint="Pilih provinsi terlebih dahulu"
            placeholder="Semua Kab/Kota"
            onChange={(kab) => set({ kab })}
            testId="filter-kabkota"
          />
        </div>

        {/* Filter Kontekstual Per Tab */}
        {tab === 'tren' && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Opsi Tren Penyakit
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={f.iklimOverlay}
                onChange={(e) => set({ iklimOverlay: e.target.checked })}
                className="rounded border-slate-300 text-primary focus:ring-primary/30"
              />
              <span className="font-semibold text-[11px]">
                Lapisan Iklim Copernicus ERA5 (Suhu/Hujan)
              </span>
            </label>
          </div>
        )}

        {tab === 'deteksi' && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Parameter Algoritma Deteksi Outbreak
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-600">Model Statistik</span>
              <select
                className={`mt-1 ${box}`}
                value={f.earsAlgoritma}
                onChange={(e) => set({ earsAlgoritma: e.target.value as any })}
              >
                <option value="c1">EARS C1 (Sensitivitas Ringan, Baseline 7 Hari)</option>
                <option value="c2">EARS C2 (Standar CDC / WHO, Lag 2 Hari)</option>
                <option value="c3">EARS C3 (Konservatif, Deviasi 3 Hari)</option>
                <option value="farrington">Farrington Quasi-Poisson (Musiman)</option>
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={f.earsHanyaAlert}
                onChange={(e) => set({ earsHanyaAlert: e.target.checked })}
                className="rounded border-slate-300 text-primary focus:ring-primary/30"
              />
              <span className="font-semibold text-[11px]">Hanya Tampilkan ALERT</span>
            </label>
            <div>
              <span className="text-[11px] font-semibold text-slate-600">Time-Lag Karhutla vs ISPA</span>
              <select
                className={`mt-1 ${box}`}
                value={f.hotspotLag}
                onChange={(e) => set({ hotspotLag: Number(e.target.value) })}
              >
                <option value={0}>Minggu Sama (+0 Minggu)</option>
                <option value={1}>Dampak +1 Minggu Kemudian</option>
                <option value={2}>Dampak +2 Minggu Kemudian</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Panel Footer */}
      <div className="border-t border-slate-100 p-3 bg-slate-50/50 flex items-center justify-between">
        <span className="text-[11px] text-slate-500 font-medium">
          {f.prov.length ? `${f.prov.length} Provinsi dipilih` : 'Skala Nasional'}
        </span>
        <button
          type="button"
          onClick={() => set(defaultSkdrFilter())}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
        >
          <RotateCcw className="h-3 w-3" />
          Atur Ulang
        </button>
      </div>
    </aside>
  )
}
