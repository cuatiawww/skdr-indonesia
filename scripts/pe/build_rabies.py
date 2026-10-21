"""PR 007: Form PE Rabies/GHPR v1 (sheet "Form PE Rabies - Spesifikasi")."""
from pe_core import *

S = Spec('rabies')
F = lambda row, key, **kw: field(S, row, key, **kw)
YA = lambda k: eq(k, 'Ya')
OTHER = {'value': 'Lainnya', 'key': None, 'label': 'Jika lainnya, sebutkan'}
def other(key): return dict(OTHER, key=key + '_lainnya')

GHPR, KLINIS, KONF = 'Gigitan Hewan Penular Rabies', 'Rabies Klinis', 'Rabies Konfirmasi'
BITTEN = YA('digigit')
NOT_GHPR_ONLY = not_(eq('status_laporan', GHPR))
LAB_POS = all_(YA('lab_diperiksa'), eq('lab_hasil', 'Positif'))
NEURO = split_options(S.rows[49]['Variabel/field'])

step1 = step('p1', 'Identitas Laporan, Pelaporan, dan Pasien', [
    section('A', 'A. Status Laporan', [
        F(4, 'status_laporan', col='status_laporan', warn=[
            {'when': all_(eq('status_laporan', GHPR), eq('digigit', 'Tidak')),
             'msg': 'Status GHPR tetapi "Apakah pernah digigit/dijilat/luka akibat HPR?" = Tidak. Periksa kembali.'},
            {'when': all_(eq('status_laporan', KONF), filled('lab_diperiksa'), not_(LAB_POS)),
             'msg': 'Status Rabies Konfirmasi belum didukung hasil lab positif. Periksa kembali.'}]),
        F(5, 'rumor_terkait'),
        F(6, 'tgl_rumor', visible=YA('rumor_terkait'), rules=[le('tgl_laporan'), le('tgl_pe'), le(TODAY)], col='tgl_rumor'),
        F(7, 'lokasi_rumor', visible=YA('rumor_terkait')),
        F(8, 'cluster_id', type='cluster', col='cluster_id', label=clean(S.rows[8]['Field'])),
    ]),
    section('B', clean(S.rows[9]['Section']), [
        F(9, 'no_pe', derive={'fn': 'no_pe'}),
        F(10, 'tgl_laporan', rules=[ge('tgl_rumor'), le(TODAY)], col='tgl_laporan',
          hint='Isi sesuai tanggal laporan diterima (tidak terisi otomatis).'),
        F(11, 'tgl_pe', rules=[ge('tgl_mulai_sakit'), ge('tgl_berobat'), ge('tgl_rumor'), ge('tgl_laporan'), le(TODAY)], col='tgl_pe'),
        F(12, 'ebs_link', type='ebs', col='ebs_link'),
        F(13, 'petugas_nama'),
        F(14, 'petugas_telp', **PHONE_10_13),
        F(15, 'petugas_jabatan'),
    ]),
    section('C', clean(S.rows[16]['Section']), [
        F(16, 'lapor_provinsi', type='province', col='province_id'),
        F(17, 'lapor_kabkota', type='kabkota', depends='lapor_provinsi', col='kabkota_id'),
        F(18, 'lapor_kecamatan', type='text'),
        F(19, 'unit_pelapor', type='text', hint='Master sarana belum tersedia; isi nama faskes.'),
    ]),
    section('D', clean(S.rows[20]['Section']), [
        F(20, 'nama_pasien', col='patient_name'),
        F(21, 'nama_ortu'),
        F(22, 'nik', col='nik', **NIK),
        F(23, 'jenis_kelamin', col='sex'),
        F(24, 'tgl_lahir', rules=[le(TODAY), le('tgl_mulai_sakit'), le('tgl_digigit')]),
        F(25, 'umur_tahun', derive={'fn': 'age', 'part': 'years'}, col='age_years',
          hint='Dihitung dari Tanggal Lahir sampai Tanggal Mulai Sakit (atau Tanggal Terima Laporan), disimpan statis.'),
        F(26, 'umur_bulan', derive={'fn': 'age', 'part': 'months'}),
        F(27, 'umur_hari', derive={'fn': 'age', 'part': 'days'}),
        F(28, 'alamat', type='textarea'),
        F(29, 'dom_provinsi', type='province'),
        F(30, 'dom_kabkota', type='kabkota', depends='dom_provinsi'),
        F(31, 'dom_kecamatan', type='text'),
        F(32, 'dom_kelurahan', type='text'),
        F(33, 'telp_pasien', **PHONE_11_13),
        F(34, 'pekerjaan', other=other('pekerjaan')),
        F(35, 'alamat_kerja'),
        F(36, 'kerabat_nama'),
        F(37, 'kerabat_telp', **PHONE_10_13),
    ]),
])

# Wound category is derived (WHO / Buku Saku GHPR): III = transdermal bite/scratch or bat contact; II = bite/scratch without
# breaking the skin; I = lick (on intact skin).
WOUND = {'fn': 'first_match', 'cases': [
    {'when': all_(BITTEN, eq('jenis_hpr', 'Kelelawar')), 'value': 'Kategori 3'},
    {'when': all_(BITTEN, isin('tipe_luka', ['Gigitan tembus kulit', 'Cakaran tembus kulit'])), 'value': 'Kategori 3'},
    {'when': all_(BITTEN, isin('tipe_luka', ['Gigitan tidak tembus kulit', 'Cakaran tidak tembus kulit'])), 'value': 'Kategori 2'},
    {'when': all_(BITTEN, eq('tipe_luka', 'Jilatan')), 'value': 'Kategori 1'},
]}
step2 = step('p2', 'Skrining Gigitan', [
    section('E', clean(S.rows[40]['Section']), [
        F(40, 'digigit'),
        F(41, 'tgl_digigit', visible=BITTEN, required=True, rules=[le('tgl_pe'), le(TODAY)]),
        F(42, 'lokasi_gigitan', visible=BITTEN, required=True),
        F(43, 'tipe_luka', visible=BITTEN, required=True),
        F(44, 'kategori_luka', type='auto', visible=BITTEN, derive=WOUND, options=['Kategori 1', 'Kategori 2', 'Kategori 3'],
          hint='Diturunkan otomatis dari Tipe luka gigitan (kontak kelelawar = Kategori 3).'),
    ]),
])

step3 = step('p3', 'Klinis Pasien', [
    section('F', clean(S.rows[47]['Section']), [
        F(47, 'tgl_mulai_sakit', required=False, requiredIf=NOT_GHPR_ONLY, rules=[ge('tgl_lahir'), ge('tgl_digigit'), le('tgl_laporan'), le(TODAY)], col='onset_date',
          hint='Wajib kecuali Status Laporan = GHPR tanpa gejala.'),
        F(48, 'gejala_prodromal', required=False, requiredIf=NOT_GHPR_ONLY, minSelect=1),
        F(49, 'gejala_neurologis', required=False, requiredIf=NOT_GHPR_ONLY, minSelect=1),
        F(50, 'tgl_berobat', rules=[ge('tgl_mulai_sakit'), ge('tgl_digigit'), le(TODAY)], col='first_visit_date'),
        F(51, 'rawat_inap'),
        F(52, 'ri_faskes', type='text', visible=YA('rawat_inap'), hint='Master fasilitas belum tersedia; isi nama RS/Puskesmas/Klinik.'),
        F(53, 'ri_masuk', visible=YA('rawat_inap'), rules=[ge('tgl_mulai_sakit'), le(TODAY)]),
        F(54, 'ri_keluar', visible=YA('rawat_inap'), rules=[ge('ri_masuk'), le(TODAY)]),
        F(55, 'diagnosis_awal'),
        F(56, 'lab_diperiksa'),
        F(57, 'lab_nama', type='text', visible=YA('lab_diperiksa')),
        F(58, 'lab_jenis', visible=YA('lab_diperiksa')),
        F(59, 'lab_spesimen', visible=YA('lab_diperiksa'), other=other('lab_spesimen'), optionsIf=[
            {'when': eq('lab_jenis', 'Fluorescent Antibody Technique (FAT)'), 'options': ['Folikel rambut', 'Hapusan/preparat sentuh kornea mata', 'Lainnya']},
            {'when': eq('lab_jenis', 'Polymerase Chain Reaction (PCR)'), 'options': ['Air liur (saliva)', 'Swab bawah lidah', 'Biopsi kulit', 'Lainnya']}]),
        F(60, 'lab_tgl_ambil', visible=YA('lab_diperiksa'), rules=[le('lab_tgl_kirim'), le(TODAY)]),
        F(61, 'lab_tgl_kirim', visible=YA('lab_diperiksa'), rules=[ge('lab_tgl_ambil'), le(TODAY)]),
        F(62, 'lab_hasil', visible=YA('lab_diperiksa')),
        F(63, 'diagnosis_akhir'),
        F(64, 'rawat_luka', other=other('rawat_luka')),
        F(65, 'cuci_kapan', visible=eq('rawat_luka', 'Dicuci dengan air mengalir dan sabun')),
        F(66, 'cuci_lama', visible=eq('rawat_luka', 'Dicuci dengan air mengalir dan sabun')),
        F(67, 'antiseptik'),
        F(68, 'antiseptik_kapan', visible=YA('antiseptik'), other=other('antiseptik_kapan')),
        F(69, 'var', visible=BITTEN),
        F(70, 'var_kali', visible=all_(BITTEN, YA('var'))),
        F(71, 'var_tgl', visible=all_(BITTEN, YA('var')), rules=[ge('tgl_digigit'), le(TODAY)]),
        F(72, 'var_alasan', type='text', visible=all_(BITTEN, eq('var', 'Tidak'))),
        F(73, 'sar', visible=BITTEN, warn=[{'when': all_(YA('sar'), eq('var', 'Tidak')),
                                            'msg': 'SAR diberikan tetapi VAR tidak diberikan (SAR selalu diberikan bersama VAR). Periksa kembali.'}]),
        F(74, 'sar_tgl', visible=all_(BITTEN, YA('sar')), rules=[ge('tgl_digigit'), le(TODAY)]),
        F(75, 'sar_alasan', visible=all_(BITTEN, eq('sar', 'Tidak')), other=other('sar_alasan')),
        F(76, 'ket_klinis', type='textarea'),
    ]),
])

HPR_DEAD = isin('hpr_kondisi', ['Mati dibunuh', 'Mati sakit'])
step4 = step('p4', 'Informasi HPR dan Riwayat Kontak', [
    section('G', clean(S.rows[79]['Section']), [
        F(79, 'jenis_hpr', other=other('jenis_hpr')),
        F(80, 'kategori_hpr'),
        F(81, 'pemilik_nama', visible=eq('kategori_hpr', 'Peliharaan')),
        F(82, 'pemilik_alamat', visible=eq('kategori_hpr', 'Peliharaan')),
        F(83, 'pemilik_hp', visible=eq('kategori_hpr', 'Peliharaan'), **PHONE_10_13),
        F(84, 'hpr_vaksin'),
        F(85, 'hpr_vaksin_tgl', visible=isin('hpr_vaksin', ['Pernah vaksin (minimal 1x)', 'Rutin vaksin setiap tahun']), rules=[le(TODAY)]),
        F(86, 'hpr_kondisi'),
        F(87, 'hpr_tgl_mati', visible=HPR_DEAD, rules=[ge('tgl_digigit'), le('hpr_tgl_sampel'), le(TODAY)]),
        F(88, 'hpr_lab', visible=HPR_DEAD),
        F(89, 'hpr_sediaan', visible=all_(HPR_DEAD, YA('hpr_lab')), other=other('hpr_sediaan')),
        F(90, 'hpr_tgl_sampel', visible=all_(HPR_DEAD, YA('hpr_lab')), rules=[ge('hpr_tgl_mati'), le(TODAY)]),
        F(91, 'hpr_hasil', visible=all_(HPR_DEAD, YA('hpr_lab')), other=other('hpr_hasil')),
    ]),
    section('F2', clean(S.rows[92]['Section']), [
        F(92, 'banyak_digigit'),
        {'key': 'orang_digigit', 'type': 'table', 'label': clean(S.rows[93]['Subsection']), 'visible': YA('banyak_digigit'), 'minRows': 1,
         'required': False, 'columns': [F(93, 'nama'), F(94, 'tgl_digigit', rules=[le(TODAY)])]},
        F(95, 'satu_hewan'),
        F(96, 'jumlah_hewan', visible=eq('satu_hewan', 'Tidak'), other=other('jumlah_hewan')),
        F(97, 'hpr_lain_sebulan'),
    ]),
])

step5 = step('p5', 'Kondisi akhir pasien dan Keterangan Lainnya', [
    section('H', clean(S.rows[101]['Section']), [
        F(101, 'kondisi_akhir', col='outcome'),
        F(102, 'tgl_meninggal', visible=eq('kondisi_akhir', 'Meninggal'), required=True, rules=[ge('tgl_mulai_sakit'), ge('tgl_lahir'), le(TODAY)], col='death_date'),
        F(103, 'keterangan_lain', type='textarea'),
    ]),
])

step6 = step('p6', 'Tim Penyelidikan Epidemiologi', [
    section('L', clean(S.rows[106]['Section']), [
        {'key': 'tim_pe', 'type': 'table', 'label': clean(S.rows[106]['Subsection']), 'required': True, 'minRows': 1,
         'columns': [F(106, 'nama'), F(107, 'instansi'), F(108, 'jabatan'), F(109, 'hp', **PHONE_10_13)]},
    ]),
])

schema = {
    'form_key': 'rabies', 'disease_code': 'RABIES', 'version': 1, 'no_pe_prefix': 'PE-RAB',
    'title': 'Formulir Penyelidikan Epidemiologi (PE) Rabies/GHPR',
    'source': 'Tracker review SKDR, sheet "Form PE Rabies - Spesifikasi" (docs/pe-spec/rabies.json)',
    'age_reference': ['tgl_mulai_sakit', 'tgl_laporan'],
    'steps': [step1, step2, step3, step4, step5, step6],
    'classification': {
        'needs': [filled('digigit')],
        'rules': [
            {'code': 'konfirmasi', 'label': 'Rabies Konfirmasi', 'when': LAB_POS,
             'basis': 'Hasil pemeriksaan lab pasien (FAT/PCR) positif.'},
            {'code': 'klinis', 'label': 'Rabies Klinis', 'when': all_(BITTEN, has_any('gejala_neurologis', NEURO)),
             'basis': 'Riwayat gigitan/jilatan/luka HPR + gejala neurologis akut rabies.'},
            {'code': 'ghpr', 'label': 'Gigitan Hewan Penular Rabies', 'when': BITTEN,
             'basis': 'Riwayat digigit/dijilat/luka akibat HPR tanpa gejala neurologis rabies.'},
        ],
        'fallback': {'code': 'tidak_memenuhi', 'label': 'Tidak memenuhi definisi kasus'},
        'manual_field': 'status_laporan',
        'manual_map': {GHPR: 'ghpr', KLINIS: 'klinis', KONF: 'konfirmasi'},
    },
    'finish_message': 'Terima kasih, laporan PE anda telah tersimpan di SKDR',
}
write('rabies', schema, S)
