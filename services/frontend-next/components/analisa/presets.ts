// PR 042: "Jenis Laporan" catalog. Every report/graph/diagram from the old IBS Analisa (Laporan 16 jenis, Grafik 5 jenis)
// and EBS Analisa (Diagram 20 jenis, Laporan) maps to one preset of the generic pivot / line list / kinerja views.
import type { AFilter, SumberA } from '@/lib/analisa-api'

export type Dim = 'wilayah' | 'penyakit' | 'periode' | 'jenis_unit' | 'kelompok' | 'status_rumor' | 'klb' | 'klb_status' | 'w1' | 'sumber_info' | 'spesimen' | 'verif' | 'respon' | 'sumber' | 'kelamin' | 'kel_umur' | 'none'
export type Ukuran = 'laporan' | 'kasus' | 'kematian' | 'lab' | 'alert' | 'klb' | 'unit'
export const UKURAN_IDX: Record<Ukuran, number> = { laporan: 4, kasus: 5, kematian: 6, lab: 7, alert: 8, klb: 9, unit: 10 }
export const UKURAN_LABEL: Record<Ukuran, string> = { laporan: 'Jumlah laporan', kasus: 'Kasus', kematian: 'Kematian', lab: 'Spesimen/lab', alert: 'Alert/sinyal', klb: 'KLB', unit: 'Unit pelapor' }
export const UKURAN_DEF: Record<Ukuran, string> = {
  laporan: 'Jumlah laporan berbeda (Laporan EBS / Laporan Agregat IBS / Laporan Individu IBS).',
  kasus: 'Jumlah kasus.', kematian: 'Jumlah kematian.',
  lab: 'IBS: jumlah diperiksa lab pada matriks; EBS: jumlah spesimen diperiksa (jika diisi).',
  alert: 'IBS: baris yang berasal dari alert SKDR; EBS: setiap laporan = satu sinyal.', klb: 'Laporan/alert berstatus KLB.', unit: 'Jumlah unit pelapor berbeda.',
}
export const DIM_LABEL: Record<Dim, string> = {
  wilayah: 'Wilayah (sesuai level)', penyakit: 'Penyakit', periode: 'Periode', jenis_unit: 'Jenis unit', kelompok: 'Kelompok unit', status_rumor: 'Status rumor',
  klb: 'Status KLB', klb_status: 'Situasi KLB', w1: 'Formulir W1', sumber_info: 'Sumber informasi', spesimen: 'Spesimen/lab', verif: 'Verifikasi',
  respon: 'Respons', sumber: 'Sumber data', kelamin: 'Jenis kelamin', kel_umur: 'Kelompok umur', none: '(tanpa kolom)',
}
export type Chart = 'bar' | 'stack' | 'line' | 'pie' | 'none'
export interface Preset {
  id: string; group: string; label: string; src: SumberA | 'any'
  kind: 'pivot' | 'daftar' | 'kinerja' | 'rumorverif'
  baris?: Dim; kolom?: Dim; ukuran?: Ukuran[]; chart?: Chart
  fx?: Partial<AFilter>; daftar?: 'ebs' | 'alert' | 'agregat' | 'individu' | 'klb'; kinerja?: 'kelengkapan' | 'ketepatan'
  potensial?: boolean; desc?: string; lama?: string
}
const p = (x: Preset) => x
export const PRESETS: Preset[] = [
  // Umum
  p({ id: 'matriks', group: 'Umum', label: 'Matriks penyakit × wilayah', src: 'any', kind: 'pivot', baris: 'wilayah', kolom: 'penyakit', ukuran: ['kasus'], chart: 'stack', desc: 'Kasus per wilayah (baris) dan penyakit (kolom). Klik wilayah untuk turun ke level berikutnya.', lama: 'IBS Laporan: Penyakit menurut tempat / nasional' }),
  p({ id: 'kustom', group: 'Umum', label: 'Kustom (pilih baris, kolom, ukuran)', src: 'any', kind: 'pivot', baris: 'wilayah', kolom: 'penyakit', ukuran: ['kasus'], chart: 'bar' }),
  p({ id: 'per-sumber', group: 'Umum', label: 'Perbandingan sumber IBS vs EBS per penyakit', src: 'semua', kind: 'pivot', baris: 'penyakit', kolom: 'sumber', ukuran: ['kasus'], chart: 'stack' }),
  // IBS Laporan (16 jenis)
  p({ id: 'ibs-kasus-tempat', group: 'IBS - Laporan', label: 'Jumlah kasus menurut tempat', src: 'ibs', kind: 'pivot', baris: 'wilayah', kolom: 'periode', ukuran: ['kasus'], chart: 'bar', lama: 'Laporan: Jumlah kasus menurut tempat' }),
  p({ id: 'ibs-mati-tempat', group: 'IBS - Laporan', label: 'Jumlah kematian menurut tempat', src: 'ibs', kind: 'pivot', baris: 'wilayah', kolom: 'periode', ukuran: ['kematian'], chart: 'bar', lama: 'Laporan: Jumlah kematian menurut tempat' }),
  p({ id: 'ibs-lab-tempat', group: 'IBS - Laporan', label: 'Jumlah diperiksa lab menurut tempat', src: 'ibs', kind: 'pivot', baris: 'wilayah', kolom: 'periode', ukuran: ['lab'], chart: 'bar', lama: 'Laporan: Jumlah lab menurut tempat' }),
  p({ id: 'ibs-kasus-penyakit', group: 'IBS - Laporan', label: 'Jumlah kasus menurut penyakit', src: 'ibs', kind: 'pivot', baris: 'penyakit', kolom: 'periode', ukuran: ['kasus'], chart: 'bar', lama: 'Laporan: Jumlah kasus menurut penyakit' }),
  p({ id: 'ibs-mati-penyakit', group: 'IBS - Laporan', label: 'Jumlah kematian menurut penyakit', src: 'ibs', kind: 'pivot', baris: 'penyakit', kolom: 'periode', ukuran: ['kematian'], chart: 'bar', lama: 'Laporan: Jumlah kematian menurut penyakit' }),
  p({ id: 'ibs-lab-penyakit', group: 'IBS - Laporan', label: 'Jumlah diperiksa lab menurut penyakit', src: 'ibs', kind: 'pivot', baris: 'penyakit', kolom: 'periode', ukuran: ['lab'], chart: 'bar', lama: 'Laporan: Jumlah lab menurut penyakit' }),
  p({ id: 'ibs-penyakit-tempat', group: 'IBS - Laporan', label: 'Penyakit menurut tempat', src: 'ibs', kind: 'pivot', baris: 'wilayah', kolom: 'penyakit', ukuran: ['kasus'], chart: 'stack', lama: 'Laporan: Penyakit menurut tempat (termasuk nasional: kosongkan provinsi)' }),
  p({ id: 'ibs-kml-tempat', group: 'IBS - Laporan', label: 'Kasus, kematian & lab menurut tempat', src: 'ibs', kind: 'pivot', baris: 'wilayah', kolom: 'none', ukuran: ['kasus', 'kematian', 'lab'], chart: 'bar', lama: 'Laporan: Total kasus, lab & kematian menurut tempat' }),
  p({ id: 'ibs-indikator-alert', group: 'IBS - Laporan', label: 'Indikator alert menurut tempat', src: 'ibs', kind: 'pivot', baris: 'wilayah', kolom: 'verif', ukuran: ['alert'], chart: 'stack', fx: {}, lama: 'Laporan: Indikator alert' }),
  p({ id: 'ibs-respon-tempat', group: 'IBS - Laporan', label: 'Respons alert ≤ 24 jam menurut tempat', src: 'ibs', kind: 'pivot', baris: 'wilayah', kolom: 'respon', ukuran: ['alert'], chart: 'stack', lama: 'Alert: respon < 24 jam' }),
  p({ id: 'ibs-kelengkapan', group: 'IBS - Laporan', label: 'Kelengkapan laporan', src: 'ibs', kind: 'kinerja', kinerja: 'kelengkapan', lama: 'Laporan / Kelengkapan & Ketepatan: kelengkapan' }),
  p({ id: 'ibs-ketepatan', group: 'IBS - Laporan', label: 'Ketepatan laporan', src: 'ibs', kind: 'kinerja', kinerja: 'ketepatan', lama: 'Laporan / Kelengkapan & Ketepatan: ketepatan' }),
  p({ id: 'ibs-ll-alert', group: 'IBS - Laporan', label: 'Line list alert', src: 'ibs', kind: 'daftar', daftar: 'alert', lama: 'Laporan: Line list alert / menu Alert' }),
  p({ id: 'ibs-ll-agregat', group: 'IBS - Laporan', label: 'Line list laporan agregat', src: 'ibs', kind: 'daftar', daftar: 'agregat', lama: 'Laporan: Line list agregat' }),
  p({ id: 'ibs-ll-individu', group: 'IBS - Laporan', label: 'Line list Laporan Individu IBS', src: 'ibs', kind: 'daftar', daftar: 'individu' }),
  p({ id: 'ibs-jenis-unit', group: 'IBS - Laporan', label: 'Kasus menurut jenis unit pelapor', src: 'ibs', kind: 'pivot', baris: 'jenis_unit', kolom: 'penyakit', ukuran: ['kasus'], chart: 'stack', lama: 'Filter unit pelapor' }),
  p({ id: 'ibs-kelompok', group: 'IBS - Laporan', label: 'Kasus menurut kelompok unit (Pemerintah/TNI/Polri/Swasta)', src: 'ibs', kind: 'pivot', baris: 'kelompok', kolom: 'penyakit', ukuran: ['kasus'], chart: 'stack', lama: 'Filter kelompok' }),
  // IBS Grafik (5 jenis)
  p({ id: 'ibs-g-penyakit-tempat', group: 'IBS - Grafik', label: 'Grafik penyakit menurut tempat', src: 'ibs', kind: 'pivot', baris: 'wilayah', kolom: 'penyakit', ukuran: ['kasus'], chart: 'stack', lama: 'Grafik: Penyakit menurut tempat' }),
  p({ id: 'ibs-g-kml-tempat', group: 'IBS - Grafik', label: 'Grafik total kasus, lab & kematian menurut tempat', src: 'ibs', kind: 'pivot', baris: 'wilayah', kolom: 'none', ukuran: ['kasus', 'lab', 'kematian'], chart: 'bar', lama: 'Grafik: Total kasus, lab dan kematian menurut tempat' }),
  p({ id: 'ibs-g-tren', group: 'IBS - Grafik', label: 'Grafik tren total kasus', src: 'ibs', kind: 'pivot', baris: 'periode', kolom: 'none', ukuran: ['kasus', 'kematian'], chart: 'line', lama: 'Grafik: Total kasus (trend line)' }),
  p({ id: 'ibs-g-alert-tempat', group: 'IBS - Grafik', label: 'Grafik alert menurut tempat', src: 'ibs', kind: 'pivot', baris: 'wilayah', kolom: 'none', ukuran: ['alert', 'klb'], chart: 'bar', lama: 'Grafik: Alert menurut tempat' }),
  p({ id: 'ibs-g-potensial', group: 'IBS - Grafik', label: 'Grafik penyakit potensial wabah', src: 'ibs', kind: 'pivot', baris: 'periode', kolom: 'penyakit', ukuran: ['kasus'], chart: 'line', potensial: true, lama: 'Grafik: Penyakit potensial wabah' }),
  // EBS Diagram (20 jenis)
  p({ id: 'ebs-d-klb-rumor', group: 'EBS - Diagram', label: 'KLB dari rumor', src: 'ebs', kind: 'pivot', baris: 'periode', kolom: 'klb', ukuran: ['laporan'], chart: 'stack', lama: 'Diagram: KLB dari rumor' }),
  p({ id: 'ebs-d-status-rumor', group: 'EBS - Diagram', label: 'Status rumor', src: 'ebs', kind: 'pivot', baris: 'status_rumor', kolom: 'none', ukuran: ['laporan'], chart: 'pie', lama: 'Diagram: Status rumor' }),
  p({ id: 'ebs-d-w1', group: 'EBS - Diagram', label: 'Laporan dengan W1', src: 'ebs', kind: 'pivot', baris: 'w1', kolom: 'none', ukuran: ['laporan'], chart: 'pie', lama: 'Diagram: Laporan dengan W1' }),
  p({ id: 'ebs-d-bulan', group: 'EBS - Diagram', label: 'Laporan diterima per bulan', src: 'ebs', kind: 'pivot', baris: 'periode', kolom: 'none', ukuran: ['laporan'], chart: 'bar', fx: { periode: 'bulan' }, lama: 'Diagram: Laporan diterima per bulan' }),
  p({ id: 'ebs-d-tempat', group: 'EBS - Diagram', label: 'Laporan diterima per tempat', src: 'ebs', kind: 'pivot', baris: 'wilayah', kolom: 'none', ukuran: ['laporan'], chart: 'bar', lama: 'Diagram: Laporan diterima per tempat' }),
  p({ id: 'ebs-d-terverif', group: 'EBS - Diagram', label: 'Penyakit terverifikasi', src: 'ebs', kind: 'pivot', baris: 'penyakit', kolom: 'none', ukuran: ['laporan', 'kasus'], chart: 'bar', fx: { basis: 'verif', verif: ['Terverifikasi'] }, lama: 'Diagram: Penyakit terverifikasi' }),
  p({ id: 'ebs-d-sumber', group: 'EBS - Diagram', label: 'Sumber laporan (sumber informasi)', src: 'ebs', kind: 'pivot', baris: 'sumber_info', kolom: 'none', ukuran: ['laporan'], chart: 'pie', lama: 'Diagram: Sumber laporan' }),
  p({ id: 'ebs-d-rumor-verif', group: 'EBS - Diagram', label: 'Penyakit rumor vs terverifikasi', src: 'ebs', kind: 'rumorverif', chart: 'bar', lama: 'Diagram: Rumor vs terverifikasi' }),
  p({ id: 'ebs-d-klb-tempat', group: 'EBS - Diagram', label: 'Status KLB per tempat', src: 'ebs', kind: 'pivot', baris: 'wilayah', kolom: 'klb', ukuran: ['laporan'], chart: 'stack', lama: 'Diagram: Status KLB per tempat' }),
  p({ id: 'ebs-d-klb-penyakit', group: 'EBS - Diagram', label: 'Status KLB per penyakit', src: 'ebs', kind: 'pivot', baris: 'penyakit', kolom: 'klb', ukuran: ['laporan'], chart: 'stack', lama: 'Diagram: Status KLB per penyakit' }),
  p({ id: 'ebs-d-situasi-tempat', group: 'EBS - Diagram', label: 'Situasi KLB per tempat', src: 'ebs', kind: 'pivot', baris: 'wilayah', kolom: 'klb_status', ukuran: ['laporan'], chart: 'stack', fx: { klb: ['Ya'] }, lama: 'Diagram: Situasi KLB per tempat' }),
  p({ id: 'ebs-d-situasi-penyakit', group: 'EBS - Diagram', label: 'Situasi KLB per penyakit', src: 'ebs', kind: 'pivot', baris: 'penyakit', kolom: 'klb_status', ukuran: ['laporan'], chart: 'stack', fx: { klb: ['Ya'] }, lama: 'Diagram: Situasi KLB per penyakit' }),
  p({ id: 'ebs-d-umur', group: 'EBS - Diagram', label: 'Kasus per kelompok umur', src: 'ebs', kind: 'pivot', baris: 'kel_umur', kolom: 'kelamin', ukuran: ['kasus'], chart: 'stack', lama: 'Diagram: Kasus per kelompok umur' }),
  p({ id: 'ebs-d-kelamin', group: 'EBS - Diagram', label: 'Kasus per jenis kelamin', src: 'ebs', kind: 'pivot', baris: 'kelamin', kolom: 'none', ukuran: ['kasus'], chart: 'pie', lama: 'Diagram: Jenis kelamin' }),
  p({ id: 'ebs-d-kasus-mati', group: 'EBS - Diagram', label: 'Kasus vs kematian', src: 'ebs', kind: 'pivot', baris: 'periode', kolom: 'none', ukuran: ['kasus', 'kematian'], chart: 'line', lama: 'Diagram: Kasus vs kematian' }),
  p({ id: 'ebs-d-respon-penyakit', group: 'EBS - Diagram', label: 'Respons ≤ 24 jam per penyakit', src: 'ebs', kind: 'pivot', baris: 'penyakit', kolom: 'respon', ukuran: ['laporan'], chart: 'stack', lama: 'Diagram: Respon < 24 jam per penyakit' }),
  p({ id: 'ebs-d-respon-tempat', group: 'EBS - Diagram', label: 'Respons ≤ 24 jam per tempat', src: 'ebs', kind: 'pivot', baris: 'wilayah', kolom: 'respon', ukuran: ['laporan'], chart: 'stack', lama: 'Diagram: Respon < 24 jam per tempat' }),
  p({ id: 'ebs-d-w1-penyakit', group: 'EBS - Diagram', label: 'W1 per penyakit', src: 'ebs', kind: 'pivot', baris: 'penyakit', kolom: 'w1', ukuran: ['laporan'], chart: 'stack', lama: 'Diagram: W1 per penyakit' }),
  p({ id: 'ebs-d-w1-tempat', group: 'EBS - Diagram', label: 'W1 per tempat', src: 'ebs', kind: 'pivot', baris: 'wilayah', kolom: 'w1', ukuran: ['laporan'], chart: 'stack', lama: 'Diagram: W1 per tempat' }),
  p({ id: 'ebs-d-klb-tanpa-w1', group: 'EBS - Diagram', label: 'KLB "Ya" tetapi W1 belum dibuat', src: 'ebs', kind: 'pivot', baris: 'wilayah', kolom: 'penyakit', ukuran: ['laporan'], chart: 'stack', fx: { klb: ['Ya'], w1: ['Tidak', '(Belum diisi)'] }, lama: 'Diagram: Status KLB Ya dengan W1 belum' }),
  p({ id: 'ebs-d-lab', group: 'EBS - Diagram', label: 'Pengambilan spesimen per penyakit', src: 'ebs', kind: 'pivot', baris: 'penyakit', kolom: 'spesimen', ukuran: ['laporan'], chart: 'stack', lama: 'Filter: diperiksa lab' }),
  // EBS Laporan
  p({ id: 'ebs-l-daftar', group: 'EBS - Laporan', label: 'Daftar Laporan EBS', src: 'ebs', kind: 'daftar', daftar: 'ebs', lama: 'Laporan: daftar laporan EBS' }),
  p({ id: 'ebs-l-klb', group: 'EBS - Laporan', label: 'Surveilans Terpadu Penyakit Berbasis KLB', src: 'ebs', kind: 'daftar', daftar: 'klb', lama: 'Laporan: Surveilans Terpadu Penyakit Berbasis KLB' }),
]
export const GROUPS = ['Umum', 'IBS - Laporan', 'IBS - Grafik', 'EBS - Diagram', 'EBS - Laporan']
