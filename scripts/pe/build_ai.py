"""PR 009: Form PE Avian Influenza (Flu Burung) H5N1 v1 (sheet "Form PE Avian Influenza - Spesi")."""
from pe_core import *

S = Spec('ai')
F = lambda row, key, **kw: field(S, row, key, **kw)
YA = lambda k: eq(k, 'Ya')
PERNAH = lambda k: eq(k, 'Pernah')
def other(key): return {'value': 'Lainnya', 'key': key + '_lainnya', 'label': 'Jika lainnya, sebutkan'}

SUSPEK, PROB, KONF = 'Suspek Flu Burung', 'Probable Flu Burung', 'Konfirmasi Flu Burung (H5N1)'
RESP = ['Batuk', 'Pilek', 'Sakit tenggorok', 'Napas pendek/sesak napas']
DEMAM = 'Demam (≥ 38°C)'
LAB_POS = all_(YA('spesimen'), rows_any('lab', isin('hasil', ['Positif H5N1', 'Positif (serologi)'])))
SICK_DEAD = isin('kondisi', ['Sakit', 'Mati'])
CLINICAL = all_(has('gejala', DEMAM), has_any('gejala', RESP))
EXPOSURE = any_(all_(PERNAH('kontak_hewan'), rows_any('kontak_hewan_list', SICK_DEAD)),
                PERNAH('kunjungi_wabah'), PERNAH('kontak_pneumonia'), YA('kontak_harian'),
                rows_any('kontak_pneumonia_list', isin('status', ['Probable', 'Konfirmasi'])))
PROB_EXTRA = any_(eq('foto_paru', 'Abnormal (infiltrat/pneumonia)'), eq('kondisi_akhir', 'Meninggal'))
WARN_DEF = 'Definisi suspek flu burung: demam ≥ 38°C disertai minimal satu gejala pernapasan. Periksa kembali.'

step1 = step('p1', 'Identitas Laporan, Pelaporan, dan Pasien', [
    section('A', 'A. Status Laporan', [
        F(4, 'status_laporan', col='status_laporan', warn=[
            {'when': all_(eq('status_laporan', KONF), not_(LAB_POS)),
             'msg': 'Status konfirmasi belum didukung hasil lab. Periksa kembali.'}]),
        F(5, 'rumor_terkait'),
        F(6, 'tgl_rumor', visible=YA('rumor_terkait'), rules=[le('tgl_laporan'), le('tgl_pe'), le(TODAY)], col='tgl_rumor'),
        F(7, 'lokasi_rumor', visible=YA('rumor_terkait')),
        F(8, 'cluster_id', type='cluster', col='cluster_id', label=clean(S.rows[8]['Field'])),
    ]),
    section('B', clean(S.rows[9]['Section']), [
        F(9, 'no_pe', derive={'fn': 'no_pe'}),
        F(10, 'tgl_laporan', rules=[ge('tgl_rumor'), ge('tgl_mulai_sakit'), le(TODAY)], col='tgl_laporan',
          hint='Isi sesuai tanggal laporan diterima (tidak terisi otomatis).'),
        F(11, 'tgl_pe', rules=[ge('tgl_mulai_sakit'), ge('tgl_pertama_berobat'), ge('tgl_rumor'), ge('tgl_laporan'), le(TODAY)], col='tgl_pe'),
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
        F(20, 'no_epid', format='digits', minLen=11, maxLen=11),
        F(21, 'nama_pasien', col='patient_name'),
        F(22, 'nama_ortu'),
        F(23, 'nik', col='nik', **NIK),
        F(24, 'jenis_kelamin', col='sex'),
        F(25, 'tgl_lahir', rules=[le(TODAY), le('tgl_mulai_sakit')]),
        F(26, 'umur_tahun', derive={'fn': 'age', 'part': 'years'}, col='age_years',
          hint='Dihitung dari Tanggal Lahir sampai Tanggal Mulai Sakit (atau Tanggal Laporan), disimpan statis.'),
        F(27, 'umur_bulan', derive={'fn': 'age', 'part': 'months'}),
        F(28, 'umur_hari', derive={'fn': 'age', 'part': 'days'}),
        F(29, 'alamat', type='textarea'),
        F(30, 'dom_provinsi', type='province'),
        F(31, 'dom_kabkota', type='kabkota', depends='dom_provinsi'),
        F(32, 'dom_kecamatan', type='text'),
        F(33, 'dom_kelurahan', type='text'),
        F(34, 'telp_pasien', **PHONE_11_13),
        F(35, 'pekerjaan'),
        F(36, 'alamat_kerja'),
        F(37, 'kerabat_nama'),
        F(38, 'kerabat_telp', **PHONE_10_13),
    ]),
])

PENUNJANG = YA('penunjang')
step2 = step('p2', 'Klinis Pasien dan Pemeriksaan Laboratorium', [
    section('E', clean(S.rows[41]['Section']), [
        F(41, 'tgl_mulai_sakit', rules=[ge('tgl_lahir'), le('tgl_laporan'), le(TODAY)], col='onset_date'),
        F(42, 'gejala', minSelect=1, warn=[{'when': all_(filled('gejala'), not_(CLINICAL)), 'msg': WARN_DEF}]),
        F(43, 'penunjang'),
        F(44, 'penunjang_tgl', visible=PENUNJANG, rules=[ge('tgl_mulai_sakit'), le(TODAY)]),
        F(45, 'leukosit', visible=PENUNJANG, min=0, max=200000, decimals=0),
        F(46, 'trombosit', visible=PENUNJANG, min=0, max=2000000, decimals=0),
        F(47, 'limfosit', visible=PENUNJANG, min=0, max=100000, decimals=0),
        F(48, 'sgot', visible=PENUNJANG, min=0, max=20000, decimals=0),
        F(49, 'sgpt', visible=PENUNJANG, min=0, max=20000, decimals=0),
        F(50, 'foto_paru', visible=PENUNJANG),
        F(51, 'berobat'),
        {'key': 'riwayat_berobat', 'type': 'table', 'label': 'Riwayat Berobat', 'visible': YA('berobat'), 'required': True, 'minRows': 1,
         'columns': [
             F(52, 'faskes', type='text', other=False, hint='Master fasilitas belum tersedia; isi nama klinik/RS.'),
             F(53, 'jenis_perawatan'),
             F(54, 'tgl_masuk', rules=[ge('tgl_mulai_sakit'), le(TODAY)]),
             F(55, 'tgl_keluar', visible=eq('jenis_perawatan', 'Rawat inap'), rules=[ge('tgl_masuk'), le(TODAY)]),
         ]},
        F(56, 'tgl_pertama_berobat', visible=YA('berobat'), derive={'fn': 'min_date', 'table': 'riwayat_berobat', 'col': 'tgl_masuk'},
          col='first_visit_date'),
        F(57, 'antiviral'),
        F(58, 'antiviral_tgl', visible=YA('antiviral'), rules=[ge('tgl_mulai_sakit'), le(TODAY)]),
        F(59, 'ket_klinis', type='textarea'),
    ]),
    section('F', clean(S.rows[60]['Section']), [
        F(60, 'spesimen'),
        {'key': 'lab', 'type': 'table', 'label': clean(S.rows[60]['Subsection']), 'visible': YA('spesimen'), 'required': True, 'minRows': 1,
         'columns': [
             F(61, 'jenis_spesimen'),
             F(62, 'nomor_spesimen'),
             F(63, 'lab_pengambil', type='text'),
             F(64, 'tgl_ambil', rules=[ge('tgl_mulai_sakit'), le('tgl_periksa'), le(TODAY)]),
             F(65, 'lab_pemeriksa', type='text'),
             F(66, 'tgl_periksa', rules=[ge('tgl_ambil'), le(TODAY)],
               requiredIf=all_(filled('hasil'), not_(eq('hasil', 'Belum keluar (pending)')))),
             F(67, 'jenis_pemeriksaan', optionsIf=[
                 {'when': isin('jenis_spesimen', ['Usap nasofaring', 'Usap tenggorok', 'Aspirat/bilasan bronkus']), 'options': ['RT-PCR influenza A/H5', 'Lainnya']},
                 {'when': eq('jenis_spesimen', 'Serum darah'), 'options': ['Serologi (HI/mikronetralisasi)', 'Lainnya']}]),
             F(68, 'hasil', options=split_options(S.rows[68]['Variabel/field']) + ['Positif'], optionsIf=[
                 {'when': eq('jenis_pemeriksaan', 'RT-PCR influenza A/H5'), 'options': ['Positif H5N1', 'Positif influenza A (bukan H5)', 'Negatif', 'Belum keluar (pending)']},
                 {'when': eq('jenis_pemeriksaan', 'Serologi (HI/mikronetralisasi)'), 'options': ['Positif (serologi)', 'Negatif', 'Belum keluar (pending)']},
                 {'when': eq('jenis_pemeriksaan', 'Lainnya'), 'options': ['Positif', 'Negatif', 'Belum keluar (pending)']}]),
         ]},
    ]),
])

ANIMAL_COLS = lambda rows: rows
step3 = step('p3', 'Kontak dengan Unggas/Hewan dan Lingkungan Rumah', [
    section('G', clean(S.rows[71]['Section']), [
        F(71, 'kontak_hewan'),
        {'key': 'kontak_hewan_list', 'type': 'table', 'label': clean(S.rows[71]['Subsection']), 'visible': PERNAH('kontak_hewan'),
         'required': True, 'minRows': 1,
         'columns': [
             F(72, 'jenis_hewan'),
             F(73, 'kondisi'),
             F(74, 'tingkat_kontak'),
             F(75, 'tgl_kontak', rules=[le('tgl_mulai_sakit'), le(TODAY)], warn=[
                 {'when': {'f': 'tgl_kontak', 'daysBeforeGt': {'ref': 'tgl_mulai_sakit', 'days': 7}},
                  'msg': 'Kontak lebih dari 7 hari sebelum sakit, di luar masa inkubasi yang ditanyakan.'}]),
         ]},
        F(76, 'masa_inkubasi', visible=PERNAH('kontak_hewan'),
          derive={'fn': 'days_since_latest', 'table': 'kontak_hewan_list', 'col': 'tgl_kontak', 'where': SICK_DEAD, 'to': 'tgl_mulai_sakit'},
          hint='Otomatis = Tanggal Mulai Sakit − tanggal kontak terakhir dengan hewan sakit/mati.'),
        F(77, 'kontak_harian'),
        {'key': 'kontak_harian_list', 'type': 'table', 'label': clean(S.rows[77]['Subsection']), 'visible': YA('kontak_harian'),
         'required': True, 'minRows': 1,
         'columns': [F(78, 'tempat', other=other('tempat')), F(79, 'jenis_hewan')]},
        F(80, 'kunjungi_wabah'),
        F(81, 'wabah_lokasi', visible=PERNAH('kunjungi_wabah')),
        F(82, 'wabah_tgl', visible=PERNAH('kunjungi_wabah'), rules=[le('tgl_mulai_sakit'), le(TODAY)]),
        F(83, 'wabah_lama', visible=PERNAH('kunjungi_wabah'), min=1, max=14, decimals=0),
        F(84, 'wabah_sifat', visible=PERNAH('kunjungi_wabah')),
    ]),
    section('H', clean(S.rows[85]['Section']), [
        F(85, 'hewan_rumah', minSelect=1, exclusive='Tidak ada'),
        F(86, 'peternakan_sekitar', minSelect=1, exclusive='Tidak ada'),
        F(87, 'pasar_sekitar', minSelect=1, exclusive='Tidak ada'),
        F(88, 'ket_lingkungan', type='textarea'),
    ]),
])

def contact_cols():
    return [F(93, 'umur', min=0, max=120, decimals=0), F(94, 'alamat'), F(95, 'wilayah'), F(96, 'hubungan'),
            F(97, 'tgl_awal', rules=[le('tgl_akhir'), le(TODAY)]), F(98, 'tgl_akhir', rules=[ge('tgl_awal'), le(TODAY)]), F(99, 'status')]

pn_cols = [F(92, 'nama')] + contact_cols()
S.get(102)  # row 102: "Kolom lain ... sama dengan tabel kontak pneumonia" -> same columns reused below
step4 = step('p4', 'Kontak dengan Manusia dan Anggota Serumah', [
    section('I', clean(S.rows[91]['Section']), [
        F(91, 'kontak_pneumonia'),
        {'key': 'kontak_pneumonia_list', 'type': 'table', 'label': clean(S.rows[91]['Subsection']), 'visible': PERNAH('kontak_pneumonia'),
         'required': True, 'minRows': 1, 'columns': pn_cols},
        F(100, 'gejala_sama'),
        {'key': 'gejala_sama_list', 'type': 'table', 'label': clean(S.rows[100]['Subsection']), 'visible': eq('gejala_sama', 'Ada'),
         'required': True, 'minRows': 1, 'columns': [F(101, 'nama')] + contact_cols()},
    ]),
    section('J', clean(S.rows[103]['Section']), [
        F(103, 'jumlah_serumah', min=1, max=50, decimals=0),
        F(104, 'keluarga_berisiko'),
        {'key': 'keluarga_berisiko_list', 'type': 'table', 'label': 'Anggota keluarga dengan pekerjaan berisiko', 'visible': YA('keluarga_berisiko'),
         'required': True, 'minRows': 1, 'maxRowsRef': {'ref': 'jumlah_serumah', 'minus': 1},
         'columns': [F(105, 'nama'), F(106, 'tempat_kerja')]},
    ]),
])

step5 = step('p5', 'Kontak Penyelidikan (Sumber Informasi)', [
    section('K', clean(S.rows[109]['Section']), [
        {'key': 'sumber_info', 'type': 'table', 'label': clean(S.rows[109]['Subsection']), 'required': False, 'minRows': 0,
         'columns': [F(109, 'nama'), F(110, 'jabatan'), F(111, 'telp', **PHONE_10_13)]},
    ]),
])

step6 = step('p6', 'Kondisi akhir pasien dan Keterangan Lainnya', [
    section('L', clean(S.rows[114]['Section']), [
        F(114, 'kondisi_akhir', col='outcome'),
        F(115, 'tgl_meninggal', visible=eq('kondisi_akhir', 'Meninggal'), rules=[ge('tgl_mulai_sakit'), ge('tgl_lahir'), le(TODAY)], col='death_date'),
        F(116, 'keterangan_lain', type='textarea', label=clean(S.rows[116]['Field'])),
    ]),
])

step7 = step('p7', 'Tim Penyelidikan Epidemiologi', [
    section('M', clean(S.rows[119]['Section']), [
        {'key': 'tim_pe', 'type': 'table', 'label': clean(S.rows[119]['Subsection']), 'required': True, 'minRows': 1,
         'columns': [F(119, 'nama'), F(120, 'instansi'), F(121, 'jabatan'), F(122, 'hp', **PHONE_10_13)]},
    ]),
])

schema = {
    'form_key': 'ai', 'disease_code': 'AVIAN_INFLUENZA', 'version': 1, 'no_pe_prefix': 'PE-AI',
    'title': 'Formulir Penyelidikan Epidemiologi (PE) Avian Influenza (Flu Burung) H5N1',
    'source': 'Tracker review SKDR, sheet "Form PE Avian Influenza - Spesi" (docs/pe-spec/ai.json)',
    'age_reference': ['tgl_mulai_sakit', 'tgl_laporan'],
    'steps': [step1, step2, step3, step4, step5, step6, step7],
    'classification': {
        'needs': [filled('gejala')],
        'rules': [
            {'code': 'konfirmasi', 'label': KONF, 'when': LAB_POS,
             'basis': 'Hasil lab positif H5N1 (RT-PCR) atau serologi positif.'},
            {'code': 'probable', 'label': PROB, 'when': all_(CLINICAL, EXPOSURE, PROB_EXTRA),
             'basis': 'Kriteria suspek + foto paru abnormal (infiltrat/pneumonia) atau meninggal.'},
            {'code': 'suspek', 'label': SUSPEK, 'when': all_(CLINICAL, EXPOSURE),
             'basis': 'Demam ≥ 38°C + ≥ 1 gejala pernapasan + pajanan (unggas/babi sakit/mati, kunjungan daerah wabah, kontak pneumonia, atau kontak sehari-hari dengan unggas/babi).'},
        ],
        'fallback': {'code': 'tidak_memenuhi', 'label': 'Tidak memenuhi definisi kasus'},
        'manual_field': 'status_laporan',
        'manual_map': {SUSPEK: 'suspek', PROB: 'probable', KONF: 'konfirmasi'},
    },
    'finish_message': 'Terima kasih, laporan PE anda telah tersimpan di SKDR',
}
write('ai', schema, S)
