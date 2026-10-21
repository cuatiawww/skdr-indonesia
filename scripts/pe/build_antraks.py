"""PR 008: Form PE Antraks v1 (sheet "Form PE Antraks - Spesifikasi")."""
from pe_core import *

S = Spec('antraks')
F = lambda row, key, **kw: field(S, row, key, **kw)
YA = lambda k: eq(k, 'Ya')
def other(key): return {'value': 'Lainnya', 'key': key + '_lainnya', 'label': 'Jika lainnya, sebutkan'}

SUSPEK, PROB, KONF = 'Suspek Antraks', 'Probabel Antraks', 'Konfirmasi Antraks'
LAB_POS_VALUES = ['Terdeteksi', 'Ditemukan Bakteri', 'Reaktif']
LAB_POS = all_(YA('lab_diperiksa'), rows_any('lab', isin('hasil', LAB_POS_VALUES)))
CLINICAL = any_(YA('kulit'), YA('cerna'), YA('napas'))
EPI = any_(YA('kontak_hewan'), YA('kontak_produk'),
           rows_any('kontak_orang_list', isin('status', [PROB, KONF])))

step1 = step('p1', 'Identitas', [
    section('A', 'A. Status Laporan', [
        F(4, 'status_laporan', col='status_laporan', warn=[
            {'when': all_(eq('status_laporan', KONF), not_(LAB_POS)),
             'msg': 'Status Konfirmasi Antraks belum didukung hasil lab positif. Periksa kembali.'}]),
        F(5, 'rumor_terkait'),
        F(6, 'tgl_rumor', visible=YA('rumor_terkait'), rules=[le('tgl_laporan'), le('tgl_pe'), le(TODAY)], col='tgl_rumor'),
        F(7, 'lokasi_rumor', visible=YA('rumor_terkait')),
        F(8, 'cluster_id', type='cluster', col='cluster_id', label=clean(S.rows[8]['Field']), requiredIf=YA('rumor_terkait')),
    ]),
    section('B', clean(S.rows[10]['Section']), [
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
    section('D', clean(S.rows[21]['Section']), [
        F(20, 'no_epid', format='digits', minLen=11, maxLen=11),
        F(21, 'nama_pasien', col='patient_name'),
        F(22, 'nama_ortu'),
        F(23, 'nik', col='nik', **NIK),
        F(24, 'jenis_kelamin', col='sex'),
        F(25, 'tgl_lahir', rules=[le(TODAY), le('tgl_mulai_sakit')]),
        F(26, 'umur_tahun', derive={'fn': 'age', 'part': 'years'}, col='age_years',
          hint='Dihitung dari Tanggal Lahir sampai Tanggal Mulai Sakit (atau Tanggal Terima Laporan), disimpan statis.'),
        F(27, 'umur_bulan', derive={'fn': 'age', 'part': 'months'}),
        F(28, 'umur_hari', derive={'fn': 'age', 'part': 'days'}),
        F(29, 'alamat', type='textarea'),
        F(30, 'dom_provinsi', type='province'),
        F(31, 'dom_kabkota', type='kabkota', depends='dom_provinsi'),
        F(32, 'dom_kecamatan', type='text'),
        F(33, 'dom_kelurahan', type='text'),
        F(34, 'telp_pasien', **PHONE_11_13),
        F(35, 'pekerjaan', other=other('pekerjaan')),
        F(36, 'alamat_kerja'),
        F(37, 'kerabat_nama'),
        F(38, 'kerabat_telp', **PHONE_10_13),
    ]),
])

PCR, KULTUR, ELISA = 'PCR', 'Kultur', 'Elisa'
step2 = step('p2', 'Klinis Pasien', [
    section('E', clean(S.rows[41]['Section']), [
        F(41, 'tgl_mulai_sakit', rules=[ge('tgl_lahir'), ge('tgl_kontak'), le('tgl_laporan'), le(TODAY)], col='onset_date'),
        F(42, 'keluhan_umum', minSelect=1, other=other('keluhan_umum')),
        F(43, 'kulit'),
        F(44, 'kulit_gejala', label='Gejala Kelainan Kulit', visible=YA('kulit'), other=other('kulit_gejala')),
        F(45, 'kulit_lokasi', visible=YA('kulit'), other=other('kulit_lokasi')),
        F(46, 'cerna'),
        F(47, 'cerna_gejala', visible=YA('cerna'), other=other('cerna_gejala')),
        F(48, 'napas'),
        F(49, 'napas_gejala', visible=YA('napas'), other=other('napas_gejala')),
        F(50, 'tgl_berobat', rules=[ge('tgl_mulai_sakit'), le(TODAY)], col='first_visit_date'),
        F(51, 'rawat_inap'),
        F(52, 'ri_faskes', type='text', visible=YA('rawat_inap'), hint='Master fasilitas belum tersedia; isi nama RS/Puskesmas/Klinik.'),
        F(53, 'ri_masuk', visible=YA('rawat_inap'), rules=[ge('tgl_mulai_sakit'), le(TODAY)]),
        F(54, 'ri_keluar', label='Tanggal keluar rawat inap', visible=YA('rawat_inap'), rules=[ge('ri_masuk'), le(TODAY)]),
        F(55, 'diagnosis_awal'),
        F(56, 'lab_diperiksa'),
        {'key': 'lab', 'type': 'table', 'label': 'Pemeriksaan Laboratorium', 'visible': YA('lab_diperiksa'), 'required': True, 'minRows': 1,
         'columns': [
             F(57, 'lab_nama', type='text'),
             F(58, 'jenis_pemeriksaan'),
             F(59, 'jenis_spesimen'),
             F(60, 'tgl_ambil', rules=[ge('tgl_mulai_sakit'), le('tgl_kirim'), le(TODAY)]),
             F(61, 'tgl_kirim', rules=[ge('tgl_ambil'), le(TODAY)]),
             F(62, 'hasil', optionsIf=[
                 {'when': eq('jenis_pemeriksaan', PCR), 'options': ['Terdeteksi', 'Tidak Terdeteksi']},
                 {'when': eq('jenis_pemeriksaan', KULTUR), 'options': ['Ditemukan Bakteri', 'Tidak Ditemukan Bakteri']},
                 {'when': eq('jenis_pemeriksaan', ELISA), 'options': ['Reaktif', 'Non-Reaktif']}]),
         ]},
        F(63, 'diagnosis_akhir', options=split_options(S.rows[63]['Variabel/field']) + ['Belum dapat ditentukan']),
        F(64, 'antibiotik'),
        F(65, 'antibiotik_jenis', visible=YA('antibiotik'), options=split_options(S.rows[65]['Variabel/field']) + ['Lainnya'],
          other=other('antibiotik_jenis')),
        F(66, 'ket_klinis', type='textarea'),
    ]),
])

KONTAK = YA('kontak_hewan')
LINGK = YA('periksa_lingkungan')
step3 = step('p3', 'Riwayat Pajanan dan Faktor Risiko', [
    section('F', clean(S.rows[69]['Section']), [
        F(69, 'hewan_sakit_sekitar'),
        F(70, 'kontak_hewan', options=['Ya', 'Tidak']),
        F(71, 'tgl_kontak', visible=KONTAK, required=True, rules=[le('tgl_mulai_sakit'), le(TODAY)]),
        F(72, 'lokasi_kejadian', visible=KONTAK, required=True, other=other('lokasi_kejadian')),
        F(73, 'aktivitas_kontak', visible=KONTAK, required=True, minSelect=1, other=other('aktivitas_kontak')),
        F(74, 'kontak_orang'),
        {'key': 'kontak_orang_list', 'type': 'table', 'label': clean(S.rows[74]['Subsection']), 'visible': YA('kontak_orang'),
         'required': True, 'minRows': 1,
         'columns': [F(75, 'nama'), F(76, 'hubungan'), F(77, 'tgl_kontak', rules=[le(TODAY)]), F(78, 'status')]},
        F(79, 'kontak_produk'),
        F(80, 'pupuk_kandang'),
        F(81, 'olah_tanah'),
        F(82, 'kunjungi_daerah'),
        F(83, 'periksa_lingkungan'),
        F(84, 'ling_hewan_piaraan', visible=LINGK),
        F(85, 'ling_peternakan', visible=LINGK),
        F(86, 'ling_pasar_hewan', visible=LINGK),
    ]),
])

step4 = step('p4', 'Kondisi akhir dan Keterangan Lainnya', [
    section('H', clean(S.rows[89]['Section']), [
        F(89, 'kondisi_akhir', col='outcome'),
        F(90, 'tgl_meninggal', visible=eq('kondisi_akhir', 'Meninggal'), required=True,
          rules=[ge('tgl_mulai_sakit'), ge('tgl_lahir'), le(TODAY)], col='death_date'),
        F(91, 'keterangan_lain', type='textarea', label=clean(S.rows[91]['Field'])),
    ]),
])

step5 = step('p5', 'Tim Penyelidikan Epidemiologi', [
    section('G', clean(S.rows[94]['Section']), [
        {'key': 'tim_pe', 'type': 'table', 'label': clean(S.rows[94]['Subsection']), 'required': True, 'minRows': 1,
         'columns': [F(94, 'nama'), F(95, 'instansi'), F(96, 'jabatan'), F(97, 'hp', **PHONE_10_13)]},
    ]),
])

schema = {
    'form_key': 'antraks', 'disease_code': 'ANTHRAX', 'version': 1, 'no_pe_prefix': 'PE-ANT',
    'title': 'Formulir Penyelidikan Epidemiologi (PE) Antraks',
    'source': 'Tracker review SKDR, sheet "Form PE Antraks - Spesifikasi" (docs/pe-spec/antraks.json)',
    'age_reference': ['tgl_mulai_sakit', 'tgl_laporan'],
    'steps': [step1, step2, step3, step4, step5],
    'classification': {
        'needs': [filled('kulit'), filled('cerna'), filled('napas')],
        'rules': [
            {'code': 'konfirmasi', 'label': KONF, 'when': LAB_POS,
             'basis': 'Hasil lab positif (PCR terdeteksi / kultur ditemukan bakteri / ELISA reaktif).'},
            {'code': 'probabel', 'label': PROB, 'when': all_(CLINICAL, EPI),
             'basis': 'Gejala klinis antraks (kulit/saluran cerna/saluran napas) + kaitan epidemiologis (kontak hewan sakit/mati mendadak, produk hewan, atau kasus probabel/konfirmasi).'},
            {'code': 'suspek', 'label': SUSPEK, 'when': CLINICAL,
             'basis': 'Gejala klinis antraks (kulit/saluran cerna/saluran napas) tanpa kaitan epidemiologis.'},
        ],
        'fallback': {'code': 'tidak_memenuhi', 'label': 'Tidak memenuhi definisi kasus'},
        'manual_field': 'status_laporan',
        'manual_map': {SUSPEK: 'suspek', PROB: 'probabel', KONF: 'konfirmasi'},
    },
    'finish_message': 'Terima kasih, laporan PE anda telah tersimpan di SKDR',
}
write('antraks', schema, S)
