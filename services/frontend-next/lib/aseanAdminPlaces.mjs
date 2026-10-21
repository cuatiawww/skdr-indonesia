const ASEAN_COUNTRIES = new Set([
  'brunei', 'cambodia', 'indonesia', 'laos', 'lao pdr', 'malaysia',
  'myanmar', 'philippines', 'singapore', 'thailand', 'timor-leste',
  'vietnam', 'viet nam',
])

const ADMIN_TO_COUNTRY = new Map([
  // Vietnam
  ['an giang', 'Vietnam'], ['ba ria-vung tau', 'Vietnam'], ['ba ria vung tau', 'Vietnam'],
  ['bac giang', 'Vietnam'], ['bac kan', 'Vietnam'], ['bac lieu', 'Vietnam'],
  ['bac ninh', 'Vietnam'], ['ben tre', 'Vietnam'], ['binh dinh', 'Vietnam'],
  ['binh duong', 'Vietnam'], ['binh phuoc', 'Vietnam'], ['binh thuan', 'Vietnam'],
  ['ca mau', 'Vietnam'], ['can tho', 'Vietnam'], ['cao bang', 'Vietnam'],
  ['da nang', 'Vietnam'], ['dak lak', 'Vietnam'], ['dak nong', 'Vietnam'],
  ['dien bien', 'Vietnam'], ['dong nai', 'Vietnam'], ['dong thap', 'Vietnam'],
  ['gia lai', 'Vietnam'], ['ha giang', 'Vietnam'], ['ha nam', 'Vietnam'],
  ['ha tinh', 'Vietnam'], ['hai duong', 'Vietnam'], ['hai phong', 'Vietnam'],
  ['hanoi', 'Vietnam'], ['ha noi', 'Vietnam'], ['hau giang', 'Vietnam'],
  ['hoa binh', 'Vietnam'], ['ho chi minh city', 'Vietnam'], ['hung yen', 'Vietnam'],
  ['khanh hoa', 'Vietnam'], ['kien giang', 'Vietnam'], ['kon tum', 'Vietnam'],
  ['lai chau', 'Vietnam'], ['lam dong', 'Vietnam'], ['lang son', 'Vietnam'],
  ['lao cai', 'Vietnam'], ['long an', 'Vietnam'], ['nam dinh', 'Vietnam'],
  ['nghe an', 'Vietnam'], ['ninh binh', 'Vietnam'], ['ninh thuan', 'Vietnam'],
  ['phu tho', 'Vietnam'], ['phu yen', 'Vietnam'], ['quang binh', 'Vietnam'],
  ['quang nam', 'Vietnam'], ['quang ngai', 'Vietnam'], ['quang ninh', 'Vietnam'],
  ['quang tri', 'Vietnam'], ['soc trang', 'Vietnam'], ['son la', 'Vietnam'],
  ['tay ninh', 'Vietnam'], ['thai binh', 'Vietnam'], ['thai nguyen', 'Vietnam'],
  ['thanh hoa', 'Vietnam'], ['thua thien hue', 'Vietnam'], ['tien giang', 'Vietnam'],
  ['tra vinh', 'Vietnam'], ['tuyen quang', 'Vietnam'], ['vinh long', 'Vietnam'],
  ['vinh phuc', 'Vietnam'], ['yen bai', 'Vietnam'],
  // Malaysia
  ['johor', 'Malaysia'], ['kedah', 'Malaysia'], ['kelantan', 'Malaysia'],
  ['malacca', 'Malaysia'], ['melaka', 'Malaysia'], ['negeri sembilan', 'Malaysia'],
  ['pahang', 'Malaysia'], ['penang', 'Malaysia'], ['pulau pinang', 'Malaysia'],
  ['perak', 'Malaysia'], ['perlis', 'Malaysia'], ['sabah', 'Malaysia'],
  ['sarawak', 'Malaysia'], ['selangor', 'Malaysia'], ['terengganu', 'Malaysia'],
  ['kuala lumpur', 'Malaysia'], ['labuan', 'Malaysia'], ['putrajaya', 'Malaysia'],
  // Thailand (high-frequency sitrep changwat)
  ['bangkok', 'Thailand'], ['chiang mai', 'Thailand'], ['chiang rai', 'Thailand'],
  ['chon buri', 'Thailand'], ['khon kaen', 'Thailand'], ['nakhon ratchasima', 'Thailand'],
  ['nonthaburi', 'Thailand'], ['phuket', 'Thailand'], ['songkhla', 'Thailand'],
  ['surat thani', 'Thailand'], ['udon thani', 'Thailand'], ['ubon ratchathani', 'Thailand'],
  // Cambodia / Laos / Myanmar / Timor / Brunei
  ['phnom penh', 'Cambodia'], ['siem reap', 'Cambodia'], ['battambang', 'Cambodia'],
  ['vientiane', 'Laos'], ['champasak', 'Laos'], ['savannakhet', 'Laos'],
  ['yangon', 'Myanmar'], ['mandalay', 'Myanmar'], ['naypyidaw', 'Myanmar'],
  ['dili', 'Timor-Leste'], ['baucau', 'Timor-Leste'], ['bobonaro', 'Timor-Leste'],
  ['brunei-muara', 'Brunei'], ['bandar seri begawan', 'Brunei'],
])

export function foldAdminPlace(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/đ/gi, 'd')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}

export function resolveAseanCountry(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const folded = foldAdminPlace(raw)
  if (ASEAN_COUNTRIES.has(folded)) {
    if (folded === 'viet nam') return 'Vietnam'
    if (folded === 'lao pdr') return 'Laos'
    return raw
  }
  return ADMIN_TO_COUNTRY.get(folded) || ''
}

export function isAseanCountryName(value) {
  const resolved = resolveAseanCountry(value)
  return ASEAN_COUNTRIES.has(foldAdminPlace(resolved || value))
}
