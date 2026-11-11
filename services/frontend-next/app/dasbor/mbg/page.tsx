// PR 036: Dasbor MBG. PR 052b: halaman dipecah menjadi rute /dashboard/mbg/{ringkasan,keracunan,pengawasan};
// alamat lama ini (termasuk ?tab=gizi / ?tab=keracunan) dialihkan ke rute yang sesuai.
import MbgLegacyRedirect from '@/components/dasbor-mbg/MbgLegacyRedirect'

export default function DasborMbgLegacyPage() {
  return <MbgLegacyRedirect />
}
