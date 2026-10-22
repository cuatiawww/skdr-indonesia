'use client'
// PR 023 (22:14): satu peta serbaguna. Panel pengaturan kiri (bisa dilipat): mode Sinyal surveilans / Laporan EBS rinci,
// ukuran, chip Jenis unit / Status laporan (dikelompokkan) / Status KLB, tombol Tampilkan matriks, chip KPI.
import { ReactNode, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { ChevronDown, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react'
import type { EbsMetric, EbsOptions } from '@/components/dashboard/PetaEbs'
import { nf, pf } from '@/lib/alert-skdr'
const PetaEbs = dynamic(() => import('@/components/dashboard/PetaEbs'), { ssr: false })

const GROUPS: { id: string; label: string; test: (v: string) => boolean }[] = [
  { id: 'verif', label: 'Terverifikasi', test: (v) => /terverifikasi/i.test(v) },
  { id: 'inv', label: 'Dalam investigasi', test: (v) => /investigasi/i.test(v) },
  { id: 'disc', label: 'Discarded', test: (v) => /discard/i.test(v) },
]
const groupOf = (v: string) => GROUPS.find((g) => g.test(v))?.id || 'lain'

function Chip({ on, children, onClick, testid }: { on: boolean; children: ReactNode; onClick: () => void; testid?: string }) {
  return <button type="button" data-testid={testid} onClick={onClick} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${on ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-primary/50'}`}>{children}</button>
}
const tog = (a: string[], v: string) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v])
function Group({ title, children }: { title: string; children: ReactNode }) {
  return <div className="space-y-1.5"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</div><div className="flex flex-wrap gap-1.5">{children}</div></div>
}

export default function PetaMultiMode({ query, sinyal }: { query: Record<string, unknown>; sinyal: ReactNode }) {
  const [mode, setMode] = useState<'sinyal' | 'ebs'>(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('peta') === 'ebs' ? 'ebs' : 'sinyal'))
  const [open, setOpen] = useState(true)
  const [metric, setMetric] = useState<EbsMetric>('reports')
  const [ku, setKu] = useState<string[]>([]); const [grp, setGrp] = useState<string[]>([]); const [raw, setRaw] = useState<string[]>([]); const [klb, setKlb] = useState<string[]>([])
  const [detail, setDetail] = useState(false); const [matrix, setMatrix] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('matriks') === '1')
  const [opt, setOpt] = useState<EbsOptions | null>(null)
  const [tot, setTot] = useState<{ rep: number; pv: number | null; coords: number | null } | null>(null)
  const sts = opt?.sts_rumor || []
  const grpCount = useMemo(() => { const m: Record<string, number> = {}; for (const s of sts) m[groupOf(s.value)] = (m[groupOf(s.value)] || 0) + s.count; return m }, [sts])
  // nilai sts_rumor yang dikirim: rincian bila dipilih, kalau tidak semua nilai dalam kelompok terpilih
  const sr = raw.length ? raw : grp.length ? sts.filter((s) => grp.includes(groupOf(s.value))).map((s) => s.value) : []
  const active = ku.length + grp.length + raw.length + klb.length
  return (
    <div className="flex h-full min-h-[460px] w-full" data-testid="peta-multi">
      <aside className={`shrink-0 border-r border-slate-200 bg-slate-50/70 transition-all ${open ? 'w-[270px]' : 'w-10'}`} data-testid="peta-panel">
        <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 px-2.5 py-2 text-xs font-bold text-slate-700" title="Pengaturan peta" data-testid="peta-panel-toggle">
          <SlidersHorizontal className="h-4 w-4 shrink-0" />{open ? <><span>Pengaturan peta</span>{active ? <span className="rounded-full bg-primary px-1.5 text-[10px] text-white">{active}</span> : null}<ChevronLeft className="ml-auto h-4 w-4" /></> : <ChevronRight className="h-3 w-3" />}
        </button>
        {open ? <div className="max-h-[680px] space-y-4 overflow-y-auto px-3 pb-4">
          <div className="grid grid-cols-2 rounded-lg border border-slate-200 bg-white p-0.5 text-[11px] font-bold">
            {([['sinyal', 'Sinyal surveilans'], ['ebs', 'Laporan EBS rinci']] as const).map(([v, l]) => (
              <button key={v} type="button" data-testid={`mode-${v}`} onClick={() => setMode(v)} className={`rounded-md px-2 py-1.5 ${mode === v ? 'bg-primary text-white' : 'text-slate-600'}`}>{l}</button>))}
          </div>
          {mode === 'sinyal' ? <p className="text-[11px] text-slate-500">Sinyal Alert SKDR dan EBS per lokasi, mengikuti filter dasbor. Pilih “Laporan EBS rinci” untuk peta wilayah sampai kecamatan dengan filter unit, status laporan, dan status KLB.</p> : <>
            {tot ? <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] text-slate-500" data-testid="peta-kpi">
              <div className="rounded-lg bg-white p-1.5 shadow-sm"><b className="block text-sm text-slate-800">{nf(tot.rep)}</b>laporan</div>
              <div className="rounded-lg bg-white p-1.5 shadow-sm"><b className="block text-sm text-slate-800">{tot.pv === null ? '—' : nf(tot.pv)}</b>tahun lalu</div>
              <div className="rounded-lg bg-white p-1.5 shadow-sm"><b className="block text-sm text-slate-800">{pf(tot.coords)}</b>bertitik</div>
            </div> : null}
            <Group title="Ukuran">{([['reports', 'Laporan'], ['cases', 'Kasus'], ['deaths', 'Kematian'], ['klb', 'Laporan KLB'], ['change', 'vs tahun lalu'], ['coords_pct', '% koordinat']] as const).map(([v, l]) => (
              v === 'change' && !opt?.prev_available ? null : <Chip key={v} on={metric === v} onClick={() => setMetric(v)}>{l}</Chip>))}</Group>
            <Group title="Jenis unit">{(opt?.kel_unit || []).map((o) => <Chip key={o.value} on={ku.includes(o.value)} onClick={() => setKu(tog(ku, o.value))}>{o.value} <span className="opacity-70">{nf(o.count)}</span></Chip>)}</Group>
            <div className="space-y-1.5">
              <Group title="Status laporan">{[...GROUPS, { id: 'lain', label: 'Lainnya' }].filter((g) => grpCount[g.id]).map((g) => (
                <Chip key={g.id} testid={`sts-${g.id}`} on={grp.includes(g.id)} onClick={() => { setRaw([]); setGrp(tog(grp, g.id)) }}>{g.label} <span className="opacity-70">{nf(grpCount[g.id])}</span></Chip>))}</Group>
              <button type="button" onClick={() => setDetail(!detail)} className="flex items-center gap-1 text-[11px] font-semibold text-primary"><ChevronDown className={`h-3 w-3 transition ${detail ? 'rotate-180' : ''}`} />Rincian status</button>
              {detail ? <div className="flex flex-wrap gap-1.5">{sts.map((s) => <Chip key={s.value} on={raw.includes(s.value)} onClick={() => { setGrp([]); setRaw(tog(raw, s.value)) }}>{s.value || '(kosong)'} <span className="opacity-70">{nf(s.count)}</span></Chip>)}</div> : null}
            </div>
            <Group title="Status KLB">{(opt?.klb || []).map((o) => <Chip key={o.value} on={klb.includes(o.value)} onClick={() => setKlb(tog(klb, o.value))}>{o.label}</Chip>)}</Group>
            <button type="button" data-testid="toggle-matriks" onClick={() => setMatrix(!matrix)} className={`w-full rounded-lg border px-2 py-1.5 text-xs font-bold ${matrix ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 bg-white text-slate-700'}`}>{matrix ? 'Sembunyikan matriks' : 'Tampilkan matriks'}</button>
            {active ? <button type="button" onClick={() => { setKu([]); setGrp([]); setRaw([]); setKlb([]) }} className="text-[11px] font-semibold text-slate-500 underline">Hapus filter</button> : null}
          </>}
        </div> : null}
      </aside>
      <div className="min-w-0 flex-1">
        {mode === 'sinyal' ? sinyal : <PetaEbs embedded query={query} ku={ku} sr={sr} klb={klb} metric={metric} showMatrix={matrix} onOptions={setOpt} onTotals={setTot} />}
      </div>
    </div>
  )
}
