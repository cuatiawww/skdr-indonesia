// Telusur provinsi di peta Ringkasan SKDR: arsiran kab/kota dari data API Spasial SKDR (agregat per kab/kota).
// Tidak ada angka buatan: kab/kota yang tidak ada di respons API tampil netral (hanya batas wilayah).
import type { CatChoro } from '@/components/spasial/SpasialMap'
import type { ChoroConfig } from '@/lib/choropleth-classes'
import { nf } from '@/lib/analisa-api'
import { areaVal, classesFor, classOf, fmtPct, METRICS, NA_COLOR, type Metric, type SpasialResp } from '@/lib/spasial-api'

const SUMBER_LABEL: Record<string, string> = { ibs: 'IBS', ebs: 'EBS', semua: 'IBS + EBS' }

/** Arsiran angka per kab/kota (metrik aktif) untuk provinsi `prov` (kode 2 digit Kemendagri). */
export function buildKabMetricCat(resp: SpasialResp | null, metric: Metric, cfg: ChoroConfig | null, prov: string, sumber: string, metricLabel?: string): CatChoro | null {
  if (!resp || resp.level !== 'kabkota' || !Array.isArray(resp.wilayah)) return null
  const areas = resp.wilayah.filter((a) => String(a.code || '').slice(0, 2) === prov)
  const mt = METRICS.find((m) => m.key === metric)
  const label = metricLabel || mt?.label || metric
  const vals = areas.map((a) => areaVal(a, metric, -1))
  const cls = classesFor(metric, vals, cfg)
  const fmt = (v: number | null) => (v === null ? '–' : metric === 'cfr' ? fmtPct(v) : nf(v))
  const items: CatChoro['items'] = {}
  const count: Record<string, number> = {}
  let na = 0
  areas.forEach((a, i) => {
    const v = vals[i]
    const k = classOf(v, cls, metric)
    if (k.na) na++
    else count[k.label] = (count[k.label] || 0) + 1
    items[String(a.code)] = {
      color: k.na ? NA_COLOR : k.color,
      title: `${label} ${fmt(v)}`,
      details: [
        { label: 'Kasus', value: nf(a.kasus) },
        { label: 'Kematian', value: nf(a.kematian) },
        { label: 'CFR', value: a.kasus > 0 && a.cfr !== null ? fmtPct(a.cfr) : '–' },
        { label: sumber === 'ebs' ? 'Sinyal EBS' : 'Alert / Sinyal', value: nf(a.alert) },
        { label: 'KLB', value: nf(a.klb) },
        { label: 'Laporan', value: nf(a.laporan) },
        { label: 'Unit pelapor', value: nf(a.unit) },
      ],
    }
  })
  const legend = cls.map((c) => ({ label: c.label, color: c.color, n: count[c.label] || 0 }))
  if (na) legend.push({ label: metric === 'cfr' ? 'Tidak ada kasus' : 'Tidak ada data', color: NA_COLOR, n: na })
  const m = resp.meta || {}
  const rentang = typeof m.mulai === 'string' && typeof m.akhir === 'string' ? ` · ${m.mulai} – ${m.akhir}` : ''
  return {
    id: `skdr-kab-${prov}-${metric}`,
    level: 'kabkota',
    prov,
    judul: `${label} per kab/kota`,
    sumber: `API Spasial SKDR (${SUMBER_LABEL[sumber] || sumber})${rentang}`,
    items,
    legend,
    catatan: `${areas.length} kab/kota dalam respons API. Kab/kota tanpa data tampil netral (hanya batas wilayah).`,
    kosong: 'tidak ada data dari API untuk kab/kota ini',
  }
}

/** Lapisan netral: hanya batas kab/kota (saat data belum ada / gagal dimuat). */
export function kabNetral(prov: string, judul: string, catatan: string): CatChoro {
  return { id: `skdr-kab-netral-${prov}-${judul}`, level: 'kabkota', prov, judul, sumber: 'Batas wilayah kab/kota', items: {}, legend: [], catatan, kosong: catatan }
}
