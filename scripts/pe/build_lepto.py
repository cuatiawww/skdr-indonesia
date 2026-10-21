"""PR 006: Form PE Leptospirosis v1 (sheet "Form PE Leptospirosis - Spesifi")."""
from pe_core import *

S = Spec('lepto')
F = lambda row, key, **kw: field(S, row, key, **kw)
YA = lambda k: eq(k, 'Ya')

PEKERJAAN = split_options(S.rows[35]['Variabel/field'])

step1 = step('p1', 'Identitas Laporan, Pelaporan, dan Pasien', [
    section('A', 'A. Status Laporan', [
        F(4, 'status_laporan', col='status_laporan', warn=[{
            'when': all_(eq('status_laporan', 'Konfirmasi Leptospirosis'), not_(rows_any('lab', any_(
                all_(eq('jenis_pemeriksaan', 'MAT (Microscopic Agglutination Test)'), eq('hasil', 'Positif')),
                all_(eq('jenis_pemeriksaan', 'PCR'), eq('hasil', 'Terdeteksi')),
                all_(eq('jenis_pemeriksaan', 'Kultur'), eq('hasil', 'Tumbuh Leptospira')))))),
            'msg': 'Status konfirmasi belum didukung hasil lab. Periksa kembali.'}]),
        F(5, 'rumor_terkait'),
        F(6, 'tgl_rumor', visible=YA('rumor_terkait'), rules=[le('tgl_laporan'), le(TODAY)], col='tgl_rumor'),
        F(7, 'lokasi_rumor', visible=YA('rumor_terkait')),
        F(8, 'cluster_id', type='cluster', col='cluster_id'),
    ]),
    section('B', 'B. Identitas Pelapor & Laporan', [
        F(9, 'no_pe', derive={'fn': 'no_pe'}),
        F(10, 'tgl_laporan', rules=[ge('tgl_rumor'), le(TODAY)], col='tgl_laporan',
          hint='Isi sesuai tanggal laporan diterima (tidak terisi otomatis).'),
        F(11, 'tgl_pe', rules=[ge('tgl_mulai_sakit'), ge('tgl_pertama_berobat'), ge('tgl_rumor'), ge('tgl_laporan'), le(TODAY)], col='tgl_pe'),
        F(12, 'ebs_link', type='ebs', col='ebs_link'),
        F(13, 'petugas_nama'),
        F(14, 'petugas_telp', **PHONE_10_13),
        F(15, 'petugas_jabatan'),
    ]),
    section('C', 'C. Wilayah Unit Pelapor', [
        F(16, 'lapor_provinsi', type='province', col='province_id'),
        F(17, 'lapor_kabkota', type='kabkota', depends='lapor_provinsi', col='kabkota_id'),
        F(18, 'lapor_kecamatan', type='text'),
        F(19, 'unit_pelapor', type='text', hint='Master sarana belum tersedia; isi nama faskes.'),
    ]),
    section('D', 'D. Identitas Pasien', [
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

step2 = step('p2', 'Klinis Pasien dan Pemeriksaan Laboratorium', [
    section('E', 'E. Informasi Klinis Pasien', [
        F(41, 'tgl_mulai_sakit', rules=[ge('tgl_lahir'), le('tgl_laporan'), le(TODAY)], col='onset_date'),
        F(42, 'gejala_umum', minSelect=1, warn=[{'when': all_(filled('gejala_umum'), not_(has('gejala_umum', 'Demam akut'))),
                                                'msg': 'Leptospirosis umumnya diawali demam akut. Periksa kembali.'}]),
        F(43, 'tanda_berat', minSelect=1, exclusive='Tidak ada tanda berat'),
        F(44, 'penunjang'),
        F(45, 'penunjang_tgl', visible=YA('penunjang'), rules=[ge('tgl_mulai_sakit'), le(TODAY)]),
        F(46, 'leukosit', visible=YA('penunjang'), min=0, max=200000, decimals=0),
        F(47, 'trombosit', visible=YA('penunjang'), min=0, max=2000000, decimals=0),
        F(48, 'bilirubin', visible=YA('penunjang'), min=0, max=60, decimals=1),
        F(49, 'sgot', visible=YA('penunjang'), min=0, max=20000, decimals=0),
        F(50, 'sgpt', visible=YA('penunjang'), min=0, max=20000, decimals=0),
        F(51, 'kreatinin', visible=YA('penunjang'), min=0, max=30, decimals=1),
        F(52, 'urinalisis', visible=YA('penunjang')),
        F(53, 'foto_paru', visible=YA('penunjang')),
        F(54, 'berobat'),
        {'key': 'riwayat_berobat', 'type': 'table', 'label': 'Riwayat Berobat', 'visible': YA('berobat'), 'required': True, 'minRows': 1,
         'columns': [
             F(55, 'fasyankes', type='text', other=False, hint='Master fasilitas belum tersedia; isi nama fasyankes.'),
             F(56, 'jenis_perawatan'),
             F(57, 'tgl_masuk', rules=[ge('tgl_mulai_sakit'), le(TODAY)]),
             F(58, 'tgl_keluar', visible=eq('jenis_perawatan', 'Rawat inap'), rules=[ge('tgl_masuk'), le(TODAY)]),
         ]},
        F(59, 'tgl_pertama_berobat', visible=YA('berobat'), derive={'fn': 'min_date', 'table': 'riwayat_berobat', 'col': 'tgl_masuk'}, col='first_visit_date'),
        F(60, 'antibiotik'),
        F(61, 'antibiotik_jenis', visible=YA('antibiotik'), minSelect=1),
        F(62, 'antibiotik_tgl', visible=YA('antibiotik'), rules=[ge('tgl_mulai_sakit'), le(TODAY)]),
        F(63, 'ket_klinis', type='textarea'),
    ]),
    section('F', 'F. Pemeriksaan Laboratorium', [
        F(64, 'spesimen'),
        {'key': 'lab', 'type': 'table', 'label': 'Pemeriksaan Laboratorium', 'visible': YA('spesimen'), 'required': True, 'minRows': 1,
         'columns': [
             F(65, 'jenis_spesimen'),
             F(66, 'nomor_spesimen'),
             F(67, 'lab_nama', type='text'),
             F(68, 'tgl_ambil', rules=[ge('tgl_mulai_sakit'), le('tgl_kirim'), le(TODAY)]),
             F(69, 'tgl_kirim', rules=[ge('tgl_ambil'), le(TODAY)]),
             F(70, 'jenis_pemeriksaan', optionsIf=[
                 {'when': eq('jenis_spesimen', 'Serum darah'), 'options': ['RDT IgM', 'ELISA IgM', 'MAT (Microscopic Agglutination Test)', 'PCR', 'Lainnya']},
                 {'when': isin('jenis_spesimen', ['Darah utuh (whole blood)', 'Urine']), 'options': ['PCR', 'Kultur', 'Lainnya']}]),
             F(71, 'tgl_hasil', rules=[ge('tgl_kirim'), ge('tgl_ambil'), le(TODAY)],
               requiredIf=all_(filled('hasil'), not_(eq('hasil', 'Belum keluar (pending)')))),
             F(72, 'hasil', optionsIf=[
                 {'when': isin('jenis_pemeriksaan', ['RDT IgM', 'ELISA IgM']), 'options': ['Positif', 'Negatif', 'Indeterminate', 'Belum keluar (pending)']},
                 {'when': eq('jenis_pemeriksaan', 'MAT (Microscopic Agglutination Test)'), 'options': ['Positif', 'Negatif', 'Belum keluar (pending)']},
                 {'when': eq('jenis_pemeriksaan', 'PCR'), 'options': ['Terdeteksi', 'Tidak terdeteksi', 'Belum keluar (pending)']},
                 {'when': eq('jenis_pemeriksaan', 'Kultur'), 'options': ['Tumbuh Leptospira', 'Tidak tumbuh', 'Belum keluar (pending)']}]),
             F(73, 'titer_mat', visible=all_(eq('jenis_pemeriksaan', 'MAT (Microscopic Agglutination Test)'), eq('hasil', 'Positif'))),
             F(74, 'serovar', visible=all_(eq('jenis_pemeriksaan', 'MAT (Microscopic Agglutination Test)'), eq('hasil', 'Positif'))),
         ]},
    ]),
])

step3 = step('p3', 'Kondisi Lingkungan dan Riwayat Kontak', [
    section('G', clean(S.rows[77]['Section']), [
        F(77, 'kasus_serupa'),
        F(78, 'kasus_serupa_tgl', visible=YA('kasus_serupa'), rules=[le(TODAY)]),
        {'key': 'kasus_serupa_list', 'type': 'table', 'label': 'Penderita dengan gejala sama', 'visible': YA('kasus_serupa'), 'minRows': 1, 'required': True,
         'columns': [
             F(79, 'nama'),
             F(80, 'umur', min=0, max=120, decimals=0),
             F(81, 'jenis_kelamin'),
             F(82, 'pekerjaan', options=PEKERJAAN),
             F(83, 'alamat'),
             F(84, 'tgl_spesimen', rules=[le(TODAY)]),
             F(85, 'status'),
         ]},
        F(86, 'banjir'),
        F(87, 'banjir_lama', visible=YA('banjir'), min=1, max=60, decimals=0),
        F(88, 'saluran_air'),
        F(89, 'tikus_rumah'),
        F(90, 'hewan_rumah'),
        F(91, 'hewan_jenis', visible=YA('hewan_rumah'), minSelect=1),
    ]),
    section('H', clean(S.rows[92]['Section']), [
        F(92, 'kunjungan'),
        F(93, 'kerja_genangan'),
        F(94, 'kerja_tikus'),
        F(95, 'kerja_hewan', minSelect=1, exclusive='Tidak ada'),
    ]),
])

APD_LABEL = clean(S.rows[109]['Field'])
step4 = step('p4', 'Kebiasaan Responden', [
    section('I', clean(S.rows[98]['Section']), [
        F(98, 'got'), F(99, 'got_apd', visible=YA('got')),
        F(100, 'sawah'), F(101, 'sawah_apd', visible=YA('sawah')),
        F(102, 'genangan'), F(103, 'genangan_apd', visible=YA('genangan')),
        F(104, 'cuci_sungai'), F(105, 'mandi_sungai'), F(106, 'cari_sungai'),
        F(107, 'kontak_tikus'),
        F(109, 'kontak_tikus_apd', visible=YA('kontak_tikus'), hint='APD untuk: ' + clean(S.rows[107]['Field'])),
        F(108, 'kontak_hewan'),
        dict(F(109, 'kontak_hewan_apd', visible=YA('kontak_hewan')), hint='APD untuk: ' + clean(S.rows[108]['Field'])),
        F(110, 'cuci_badan'),
        F(111, 'cuci_sabun', visible=isin('cuci_badan', ['Selalu', 'Kadang-kadang'])),
        F(112, 'luka'), F(113, 'luka_rawat', visible=YA('luka')),
        F(114, 'simpan_mentah'), F(115, 'simpan_mentah_tempat', visible=YA('simpan_mentah')),
        F(116, 'simpan_saji'),
        F(117, 'kendali_tikus'), F(118, 'kendali_tikus_jenis', visible=YA('kendali_tikus'), minSelect=1),
    ]),
])

# Page 5: the KLB monitoring counts N1-N9 are aggregate population data -> stored once per cluster (pe_clusters.monitoring),
# edited from the linked cluster; the case only answers the screening question.
NV = YA('pe_klb')
cluster_fields = [
    F(122, 'periode_mulai', label='Tanggal mulai pemantauan', rules=[le(TODAY)]),
    dict(F(122, 'periode_akhir', label='Tanggal akhir pemantauan', rules=[ge('periode_mulai'), le(TODAY)])),
    F(123, 'n1', min=1, decimals=0),
    F(124, 'n2', min=0, decimals=0, rules=[le('n1')]),
    F(125, 'n3', min=0, decimals=0, rules=[le('n1')]),
    F(126, 'n4', min=0, decimals=0, rules=[le('n3')]),
    F(127, 'n5', min=0, decimals=0, rules=[le('n3')]),
    F(128, 'n6', min=0, decimals=0, rules=[le('n5')]),
    F(129, 'n7', min=0, decimals=0, rules=[le('n4')]),
    F(130, 'n8', min=0, decimals=0, sumLe={'fields': ['n8', 'n9'], 'ref': 'n7'}),
    F(131, 'n9', min=0, decimals=0, sumLe={'fields': ['n8', 'n9'], 'ref': 'n7'}),
]
for f in cluster_fields:
    f['label'] = (f['key'].upper() + '. ' + clean(S.rows[f['row']]['Field'])) if f['key'].startswith('n') else f['label']
    f['required'] = f['key'] in ('periode_mulai', 'periode_akhir', 'n1')
    f.pop('visible', None)

step5 = step('p5', clean(S.rows[120]['Section']).split(':', 1)[-1].strip(), [
    section('J', clean(S.rows[121]['Section']), [
        F(121, 'pe_klb'),
        info('pe_klb_info', 'Bagian ini tidak perlu diisi', visible=eq('pe_klb', 'Tidak')),
        {'key': 'klb_cluster', 'type': 'cluster_monitoring', 'label': 'Pemantauan KLB/bencana (diisi sekali per klaster)', 'visible': NV,
         'hint': 'Angka N1–N9 adalah data agregat populasi; disimpan pada klaster yang ditautkan di bagian A agar tidak terhitung ganda.',
         'required': True},
    ]),
])

step6 = step('p6', 'Kondisi akhir pasien dan Keterangan Lainnya', [
    section('K', clean(S.rows[134]['Section']), [
        F(134, 'kondisi_akhir', col='outcome'),
        F(135, 'tgl_meninggal', visible=eq('kondisi_akhir', 'Meninggal'), rules=[ge('tgl_mulai_sakit'), ge('tgl_lahir'), le(TODAY)], col='death_date'),
        F(136, 'keterangan_lain', type='textarea'),
    ]),
])

step7 = step('p7', 'Tim Penyelidikan Epidemiologi', [
    section('L', clean(S.rows[139]['Section']), [
        {'key': 'tim_pe', 'type': 'table', 'label': clean(S.rows[139]['Subsection']), 'required': True, 'minRows': 1,
         'columns': [F(139, 'nama'), F(140, 'instansi'), F(141, 'jabatan'), F(142, 'hp', **PHONE_10_13)]},
    ]),
])

# Case classification (Buku Saku Leptospirosis 2022 hlm. 16-17 as cited in the sheet review). Evaluated top-down.
GEJALA = 'gejala_umum'
suspek = all_(
    has_any(GEJALA, ['Demam akut', 'Nyeri kepala']),
    has_any(GEJALA, ['Mialgia (nyeri otot)', 'Malaise/lemah', 'Conjunctival suffusion (mata merah tanpa kotoran)']),
    any_(*[YA(k) for k in ('banjir', 'got', 'sawah', 'genangan', 'cuci_sungai', 'mandi_sungai', 'cari_sungai', 'kontak_tikus',
                           'kontak_hewan', 'kerja_genangan', 'kerja_tikus', 'tikus_rumah', 'kunjungan')]))
probable_a = count_gte(2, has(GEJALA, 'Nyeri betis'), has('tanda_berat', 'Jaundice/ikterik (kuning)'), has('tanda_berat', 'Manifestasi perdarahan'),
                       has('tanda_berat', 'Batuk dengan darah'), has('tanda_berat', 'Anuria/oliguria (tidak/sedikit kencing)'),
                       has('tanda_berat', 'Aritmia jantung'))
probable_b = rows_any('lab', all_(isin('jenis_pemeriksaan', ['RDT IgM', 'ELISA IgM']), eq('hasil', 'Positif')))
konfirmasi = rows_any('lab', any_(
    all_(eq('jenis_pemeriksaan', 'MAT (Microscopic Agglutination Test)'), eq('hasil', 'Positif')),
    all_(eq('jenis_pemeriksaan', 'PCR'), eq('hasil', 'Terdeteksi')),
    all_(eq('jenis_pemeriksaan', 'Kultur'), eq('hasil', 'Tumbuh Leptospira'))))

schema = {
    'form_key': 'lepto', 'disease_code': 'LEPTOSPIROSIS', 'version': 1, 'no_pe_prefix': 'PE-LEP',
    'title': 'Formulir Penyelidikan Epidemiologi (PE) Leptospirosis',
    'source': 'Tracker review SKDR, sheet "Form PE Leptospirosis - Spesifi" (docs/pe-spec/lepto.json)',
    'age_reference': ['tgl_mulai_sakit', 'tgl_laporan'],
    'steps': [step1, step2, step3, step4, step5, step6, step7],
    'cluster_fields': cluster_fields,
    'classification': {
        'needs': [filled(GEJALA)],
        'rules': [
            {'code': 'konfirmasi', 'label': 'Konfirmasi Leptospirosis', 'when': konfirmasi,
             'basis': 'Hasil lab konfirmasi positif: MAT positif, PCR terdeteksi, atau kultur tumbuh Leptospira.'},
            {'code': 'probable', 'label': 'Probable Leptospirosis', 'when': all_(suspek, any_(probable_a, probable_b)),
             'basis': 'Suspek + ≥2 gejala/tanda (nyeri betis, ikterik, perdarahan, batuk darah, anuria/oliguria, aritmia) atau RDT/ELISA IgM positif.'},
            {'code': 'suspek', 'label': 'Suspek Leptospirosis', 'when': suspek,
             'basis': 'Demam akut dan/atau nyeri kepala + mialgia/malaise/conjunctival suffusion + riwayat pajanan 2 minggu sebelum sakit.'},
        ],
        'fallback': {'code': 'tidak_memenuhi', 'label': 'Tidak memenuhi definisi kasus'},
        'manual_field': 'status_laporan',
        'manual_map': {'Suspek Leptospirosis': 'suspek', 'Probable Leptospirosis': 'probable', 'Konfirmasi Leptospirosis': 'konfirmasi'},
    },
    'finish_message': 'Terima kasih, laporan PE anda telah tersimpan di SKDR',
}
write('lepto', schema, S)
