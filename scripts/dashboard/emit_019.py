"""PR 010: emit migration 019 (app_settings.dashboard_executive) from this definition. Indicator numbers = sheet
"Spesifikasi Dashboard Executive" column No."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
I = lambda no, name, status, note='': {'no': no, 'name': name, 'status': status, 'note': note}
cfg = {
  'fraction_below': 10, 'z': 1.96,
  'ebs': {'verified_prefix': 'Terverifikasi', 'discarded': ['Discarded']},
  'outcome': {'dead': 'Meninggal', 'known': ['Sembuh', 'Meninggal']},
  'pe_count_statuses': ['dikirim', 'terverifikasi', 'final'],
  'pe_status_labels': {'draf': 'Draf', 'dikirim': 'Dikirim', 'dikembalikan': 'Dikembalikan', 'terverifikasi': 'Terverifikasi', 'final': 'Final'},
  'texts': {
    'footnote': '* Satu alert EBS bisa berisi lebih dari satu kasus, jadi jumlah alert tidak sama dengan jumlah kasus. Laporan individu baru mulai dikumpulkan, sehingga angkanya wajar lebih kecil dan berbeda dari angka EBS selama masa transisi.',
    'cfr_note': '* Tercatat sebagai suspek atau probabel (GHPR untuk rabies) namun meninggal. Cek ketepatan laporan di formulir: status kasus, hasil lab konfirmasi, dan diagnosis. Baris ini tidak dihitung CFR karena CFR hanya dihitung dari kasus konfirmasi (rabies: klinis + konfirmasi).',
    'individual_def': 'Laporan individu = Form PE dengan status Dikirim, Terverifikasi, atau Final.',
    'alert_def': 'Definisi alert belum disepakati (sheet No. 36); sementara 1 laporan EBS = 1 alert.',
  },
  'groups': [
    {'code': 'rabies', 'label': 'GHPR/Rabies', 'disease_codes': ['RABIES'], 'color': '#00594F', 'pe_form': 'rabies', 'link': '/pe/rabies',
     'ebs_sub': [{'code': 'ghpr', 'label': 'GHPR', 'match': ['Gigitan Hewan Penyebab Rabies (GHPR)'], 'count_deaths': False},
                 {'code': 'rabies', 'label': 'Rabies', 'match': ['Rabies']}],
     'pe_status': [{'code': 'ghpr', 'label': 'GHPR'}, {'code': 'klinis', 'label': 'Rabies klinis'}, {'code': 'konfirmasi', 'label': 'Rabies konfirmasi'}],
     'individual_split': [{'label': 'Laporan GHPR', 'codes': ['ghpr']}, {'label': 'Kasus rabies', 'codes': ['klinis', 'konfirmasi']}],
     'death_codes': ['klinis', 'konfirmasi'], 'nik_exclude': ['ghpr'],
     'cfr': {'confirmed': ['klinis', 'konfirmasi'], 'confirmed_label': 'Rabies klinis + konfirmasi', 'star': [{'code': 'ghpr', 'label': 'GHPR*'}]}},
    {'code': 'ai', 'label': 'Avian Influenza', 'disease_codes': ['AVIAN_INFLUENZA'], 'color': '#00A3AD', 'pe_form': 'ai', 'link': '/pe/ai',
     'ebs_sub': [{'code': 'ai', 'label': 'Avian Influenza', 'match': ['Suspek Flu Burung Pada Manusia', 'Flu Burung Pada Manusia']}],
     'pe_status': [{'code': 'suspek', 'label': 'Suspek'}, {'code': 'probable', 'label': 'Probabel'}, {'code': 'konfirmasi', 'label': 'Konfirmasi'}],
     'death_codes': [],
     'cfr': {'confirmed': ['konfirmasi'], 'confirmed_label': 'AI konfirmasi', 'star': [{'code': 'suspek', 'label': 'AI suspek*'}, {'code': 'probable', 'label': 'AI probabel*'}]}},
    {'code': 'antraks', 'label': 'Antraks', 'disease_codes': ['ANTHRAX'], 'color': '#6B6766', 'pe_form': 'antraks', 'link': '/pe/antraks',
     'ebs_sub': [{'code': 'antraks', 'label': 'Antraks', 'match': ['Anthraks', 'Antraks', 'Anthrax']}],
     'pe_status': [{'code': 'suspek', 'label': 'Suspek'}, {'code': 'probabel', 'label': 'Probabel'}, {'code': 'konfirmasi', 'label': 'Konfirmasi'}],
     'death_codes': [],
     'cfr': {'confirmed': ['konfirmasi'], 'confirmed_label': 'Antraks konfirmasi', 'star': [{'code': 'suspek', 'label': 'Antraks suspek*'}, {'code': 'probabel', 'label': 'Antraks probabel*'}]}},
    {'code': 'lepto', 'label': 'Leptospirosis', 'disease_codes': ['LEPTOSPIROSIS'], 'color': '#8A9A00', 'pe_form': 'lepto', 'link': '/pe/lepto',
     'ebs_sub': [{'code': 'lepto', 'label': 'Leptospirosis', 'match': ['Leptospirosis', 'Suspek Leptospirosis']}],
     'pe_status': [{'code': 'suspek', 'label': 'Suspek'}, {'code': 'probable', 'label': 'Probabel'}, {'code': 'konfirmasi', 'label': 'Konfirmasi'}],
     'death_codes': [],
     'cfr': {'confirmed': ['konfirmasi'], 'confirmed_label': 'Leptospirosis konfirmasi', 'star': [{'code': 'suspek', 'label': 'Leptospirosis suspek*'}, {'code': 'probable', 'label': 'Leptospirosis probabel*'}]}},
  ],
  'indicators': [
    I('1–2', 'Filter periode', 'sebagian', 'Memakai filter minggu epid yang sudah ada (tanggal awal/akhir = awal/akhir minggu); kotak tanggal harian belum.'),
    I('3', 'Lihat sebagai (tingkat akun)', 'tertunda', 'Belum ada login/akun (aturan proyek: tanpa login).'),
    I('4–5', 'Filter provinsi, kab/kota', 'tersedia', 'Acuan wilayah = wilayah unit pelapor (PE) dan wilayah EBS.'),
    I('6', 'Filter unit pelapor', 'tertunda', 'Master sarana (puskesmas/RS) belum tersedia.'),
    I('7', 'Filter penyakit', 'sebagian', 'Penyakit dari master; pilihan "GHPR saja"/"Rabies saja" belum.'),
    I('8', 'Reset filter', 'tersedia', 'Dari bar filter yang sudah ada.'),
    I('9', 'Keterangan cakupan', 'tersedia', ''),
    I('10', 'Menu bagian', 'tertunda', 'Menunggu bagian 3–9.'),
    I('11', 'Palet Kemenkes', 'sebagian', 'Warna per penyakit di garis atas card; tema penuh & font Plus Jakarta Sans belum.'),
    I('12–15', 'Card alert EBS (jumlah, terverifikasi, kasus, kematian)', 'tersedia', 'Definisi alert belum disepakati (No. 36): 1 laporan EBS = 1 alert.'),
    I('16–18', 'Card laporan individu (jumlah, status kasus, kematian)', 'tersedia', 'Sumber: Form PE (status Dikirim/Terverifikasi/Final).'),
    I('19', 'Tautan dashboard penyakit', 'sebagian', 'Dashboard penyakit belum ada; card menautkan ke daftar Form PE.'),
    I('20', 'Catatan bintang', 'tersedia', ''),
    I('21–35', 'Tabel CFR + 95% CI Wilson + akhir belum diketahui', 'tersedia', 'Pop-up daftar laporan "Lihat →" (No. 35) belum.'),
    I('36', 'Definisi alert', 'tertunda', 'Perlu konfirmasi Timker/SKD.'),
    I('37–40', 'Batang status tindak lanjut alert, % terverifikasi/direspons', 'sebagian', '% terverifikasi ada di card; "direspons" belum terdefinisi dan API EBS tidak mengirim tindakan respons B.19–B.39.'),
    I('41–42, 44–45', '7-1-7: deteksi, respons, ketiganya', 'tertunda', 'API EBS tidak mengirim Tanggal Rumor Diketahui (A.11) maupun tanggal tindakan respons (B.20–B.39).'),
    I('43', '7-1-7: notifikasi ≤1 hari', 'tersedia', 'Tanggal dibuat (create_date) − Tanggal (tgl_laporan); alert discarded tidak dihitung.'),
    I('46–49', 'Pemeriksaan laboratorium (alert EBS)', 'tertunda', 'API EBS tidak mengirim Sts Lab No, jumlah diperiksa/positif (B.12–B.18).'),
    I('50–58', 'Sebaran wilayah (peta per penyakit, kuartil, drill-down)', 'tertunda', 'Data tersedia; dikerjakan pada PR berikutnya (peta lama dipertahankan).'),
    I('59–64', 'Tren mingguan', 'tertunda', 'Data tersedia; PR berikutnya.'),
    I('65–69, 72–75', 'Klaster dan epi curve', 'tertunda', 'Data klaster PE tersedia (pe_clusters); PR berikutnya. Status aktif/selesai perlu definisi (No. 68).'),
    I('70–71', 'Populasi berisiko, attack rate', 'tertunda', 'Variabel belum tersedia di sheet.'),
    I('76', '% kasus dengan NIK', 'tersedia', 'Dari Form PE, tanpa GHPR.'),
    I('77–81', 'Integrasi NAR-SKDR', 'tertunda', 'Butuh API NAR (Pusdatin).'),
    I('Tambahan', 'Status alur PE (draf/dikirim/terverifikasi/final)', 'tersedia', 'Permintaan Yosua.'),
    I('Tambahan', 'Cakupan provinsi dan kab/kota pelapor', 'tersedia', 'Permintaan Yosua; wilayah dengan ≥ 1 laporan dari sumber mana pun.'),
  ],
}
body = json.dumps(cfg, ensure_ascii=False, separators=(',', ':'))
assert '$dx$' not in body
open(os.path.join(ROOT, 'database/init/019_dashboard_executive.sql'), 'w').write(f"""-- 019: executive dashboard summary config (PR 010; generated by scripts/dashboard/emit_019.py).
-- Indicator definitions from sheet "Spesifikasi Dashboard Executive". Rollback: database/rollback/019_rollback.sql
INSERT INTO app_settings (key, value) VALUES ('dashboard_executive', $dx${body}$dx$)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
""")
open(os.path.join(ROOT, 'database/rollback/019_rollback.sql'), 'w').write("""-- Rollback 019: remove the executive dashboard config (the dashboard falls back to empty cards).
DELETE FROM app_settings WHERE key = 'dashboard_executive';
DELETE FROM schema_migrations WHERE filename = '019_dashboard_executive.sql';
""")
print(len(body))
