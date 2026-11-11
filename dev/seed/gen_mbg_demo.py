# Generator dev/seed/mbg_demo.sql (PR 052b). Deterministik (seed 5252). Semua baris bertanda DEMO-MBG-*.
import json, random, datetime as dt
random.seed(5252)
# (prov_id, kab_id, nama kab, lat, lng, [kecamatan])
K = [
  (12,161,'Bogor',-6.55,106.80,['Cibinong','Citeureup','Ciawi']),
  (12,164,'Bandung',-7.02,107.53,['Cileunyi','Rancaekek','Baleendah']),
  (12,165,'Garut',-7.22,107.90,['Tarogong Kidul','Cibatu']),
  (12,179,'Kota Bogor',-6.595,106.80,['Bogor Tengah','Tanah Sareal']),
  (12,181,'Kota Bandung',-6.91,107.61,['Coblong','Antapani']),
  (13,209,'Semarang',-7.25,110.40,['Ungaran Barat','Ambarawa']),
  (13,214,'Pemalang',-6.90,109.38,['Pemalang','Comal']),
  (13,216,'Brebes',-6.87,109.04,['Bulakamba','Brebes']),
  (13,220,'Kota Semarang',-6.99,110.42,['Tembalang','Pedurungan']),
  (15,234,'Malang',-8.16,112.62,['Kepanjen','Singosari']),
  (15,259,'Kota Malang',-7.98,112.63,['Lowokwaru','Klojen']),
  (15,264,'Kota Surabaya',-7.27,112.75,['Rungkut','Wonokromo']),
  (18,285,'Lombok Timur',-8.63,116.53,['Selong','Aikmel']),
  (27,406,'Bone',-4.54,120.33,['Tanete Riattang','Palakka']),
  (27,420,'Kota Makassar',-5.15,119.43,['Panakkukang','Tamalate']),
]
# SPPG: 3 per kab/kota, koordinat tetap per SPPG
SPPG = []
for pv, kb, kn, la, lo, kecs in K:
    for i in range(1, 4):
        SPPG.append(dict(nama=f"[DEMO] SPPG {kn} {i}", pv=pv, kb=kb, kn=kn, kec=random.choice(kecs),
                         lat=round(la + random.uniform(-0.09, 0.09), 5), lng=round(lo + random.uniform(-0.09, 0.09), 5),
                         mutu=random.choice([0.55, 0.65, 0.78, 0.86, 0.92, 0.95])))
GEJ = ['Mual','Muntah','Diare','Sakit perut','Pusing','Demam','Lemas']
MENU = {'menu_karbo':['Nasi putih','Nasi kuning','Nasi uduk'],'menu_protein1':['Ayam goreng','Telur balado','Ikan tongkol','Ayam suwir','Rendang'],'menu_protein2':['Tahu bacem','Tempe goreng','Perkedel'],'menu_sayur':['Sayur sop','Tumis kangkung','Capcay','Sayur asem'],'menu_buah':['Pisang','Semangka','Jeruk','Melon']}
q = lambda s: "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"
START = dt.date(2026, 5, 15); END = dt.date(2026, 11, 9)
SPAN = (END - START).days
def rdate(lo=0.0, hi=1.0):
    return START + dt.timedelta(days=int(random.uniform(lo, hi) * SPAN))
sql = ["-- DATA DEMO LOKAL Dasbor MBG (PR 052b) — HANYA untuk pengembangan lokal, JANGAN dijalankan di produksi.",
       "-- Semua baris bertanda no_laporan/no_kunjungan 'DEMO-MBG-…' dan nama '[DEMO] …'. Hapus: dev/seed/mbg_demo_hapus.sql",
       "-- Dibuat ulang dengan generator deterministik; menjalankan ulang aman (baris DEMO lama dihapus dulu).",
       "BEGIN;",
       "DELETE FROM mbg_keracunan WHERE no_laporan LIKE 'DEMO-MBG-%';",
       "DELETE FROM mbg_kunjungan WHERE no_kunjungan LIKE 'DEMO-MBG-%';"]
# ── Keracunan: 52 kejadian di ±22 SPPG (lebih sering di SPPG mutu rendah), puncak Agu–Okt
kerSppg = sorted(SPPG, key=lambda s: s['mutu'] + random.uniform(-0.15, 0.15))[:22]
inc_sppg = set()
N_INC = 52
for i in range(1, N_INC + 1):
    s = random.choice(kerSppg[:12]) if random.random() < 0.6 else random.choice(kerSppg)
    inc_sppg.add(s['nama'])
    d0 = rdate(0.0, 1.0) if random.random() < 0.4 else rdate(0.45, 0.85)
    day = dt.datetime(d0.year, d0.month, d0.day, random.randint(8, 14), random.choice([0, 15, 30, 45]))
    terp = random.randint(60, 1200)
    kasus = max(3, int(terp * random.uniform(0.03, 0.3)))
    men = 1 if i in (9, 31) else 0
    inap = int(kasus * random.uniform(0.03, 0.3))
    lapor_h = random.choice([2, 4, 6, 10, 18, 22, 30, 40, 55, 80])
    status = 'ditutup' if day.date() < dt.date(2026, 9, 15) and random.random() < 0.7 else ('draf' if i % 17 == 0 else 'dilaporkan')
    lab = random.choice(['hasil', 'hasil', 'hasil', 'dikirim', 'belum']) if day.date() < dt.date(2026, 10, 25) else random.choice(['dikirim', 'belum'])
    pos = random.random() < 0.45
    agent = random.choice(['E. coli', 'Staphylococcus aureus', 'Bacillus cereus', 'Salmonella sp.'])
    sampel = [] if lab == 'belum' else [
        {'kategori': 'Pangan', 'sampel': random.choice(MENU['menu_protein1']), 'mikro': ('Positif' if pos else 'Negatif') if lab == 'hasil' else '', 'kimia': 'Negatif' if lab == 'hasil' else '', 'keterangan': agent if pos and lab == 'hasil' else ''},
        {'kategori': 'Pangan', 'sampel': random.choice(MENU['menu_sayur']), 'mikro': ('Positif' if pos and random.random() < 0.3 else 'Negatif') if lab == 'hasil' else '', 'kimia': ''},
        {'kategori': 'Air', 'sampel': 'Air bersih dapur', 'mikro': ('Positif' if random.random() < 0.2 else 'Negatif') if lab == 'hasil' else '', 'kimia': ''}]
    sek = f"[DEMO] SDN {random.randint(1, 12)} {s['kec']}"
    lat = round(s['lat'] + random.uniform(-0.01, 0.01), 5); lng = round(s['lng'] + random.uniform(-0.01, 0.01), 5)
    pria = int(kasus * random.uniform(0.4, 0.6))
    u59 = int(kasus * random.uniform(0.2, 0.5)); u1014 = int(kasus * random.uniform(0.2, 0.4)); u1519 = max(0, kasus - u59 - u1014 - 2)
    d = {
        'tgl_kejadian': day.strftime('%Y-%m-%dT%H:%M'),
        'jam_makan': (day - dt.timedelta(hours=random.randint(2, 8))).strftime('%Y-%m-%dT%H:%M'),
        'jam_gejala': (day - dt.timedelta(minutes=random.randint(10, 90))).strftime('%Y-%m-%dT%H:%M'),
        'jumlah_kasus': kasus, 'jumlah_meninggal': men, 'jumlah_terpapar': terp,
        'rawat_inap': inap, 'rawat_jalan': kasus - inap, 'sembuh': int(kasus * random.uniform(0.6, 0.98)),
        'pria': pria, 'wanita': kasus - pria, 'usia_5_9': u59, 'usia_10_14': u1014, 'usia_15_19': u1519, 'usia_dewasa': kasus - u59 - u1014 - u1519,
        'gejala': [{'nama': g, 'jumlah': int(kasus * random.uniform(0.2, 0.9))} for g in random.sample(GEJ, random.randint(3, 5))],
        'slhs': random.choice(['Ya', 'Tidak', 'Tidak', '']), 'ikl': random.choice(['Memenuhi Syarat', 'Tidak Memenuhi Syarat', 'Tidak Memenuhi Syarat', '']),
        'sampel': sampel,
        'lab_tgl_ambil': (day + dt.timedelta(hours=random.randint(3, 20))).strftime('%Y-%m-%dT%H:%M') if lab != 'belum' else '',
        'lab_tgl_hasil': (day + dt.timedelta(hours=random.randint(48, 200))).strftime('%Y-%m-%dT%H:%M') if lab == 'hasil' else '',
        'sop': [{'nama': n, 'ada': random.choice(['Ada', 'Ada', 'Tidak Ada']), 'dilakukan': random.choice(['Dilakukan', 'Tidak Dilakukan'])} for n in ['SOP Penanganan Limbah', 'SOP Persiapan Bahan Pangan', 'Pengolahan makanan', 'SOP Distribusi']],
        'sumber_air': [{'sumber': random.choice(['PDAM', 'Sumur gali', 'Sumur bor'])}],
        'bank_sampel': random.choice(['Ya', 'Tidak']), 'limbah_pencatatan': random.choice(['Ya', 'Tidak']), 'aduan_hari_h': random.choice(['Ya', 'Tidak']),
        'angkut_box_sekat': random.choice(['Ya', 'Tidak']), 'angkut_box_tanpa': random.choice(['Ya', 'Tidak']), 'angkut_motor': random.choice(['Ya', 'Tidak']),
        'penjamah_total': random.randint(25, 50), 'penjamah_sertifikasi': random.randint(3, 30),
        'sekolah': [{'nama': sek, 'porsi': terp}],
        'lat': lat, 'lng': lng,
        '_hasil': {'terpapar': terp, 'inkubasi_saran': random.randint(2, 7)},
        'catatan': 'DATA DEMO LOKAL (PR 052b) — hapus dengan dev/seed/mbg_demo_hapus.sql',
    }
    for k, v in MENU.items(): d[k] = random.choice(v)
    no = f'DEMO-MBG-K{i:03d}'
    rep = "NULL" if status == 'draf' else q((day + dt.timedelta(hours=lapor_h)).strftime('%Y-%m-%d %H:%M:00+07'))
    sql.append(f"INSERT INTO mbg_keracunan (no_laporan,status,data,tgl_kejadian,province_id,kabkota_id,kecamatan_nama,sekolah,nama_sppg,yayasan_sppg,jumlah_kasus,jumlah_meninggal,jumlah_terpapar,lab_status,created_by_name,reported_at) VALUES ({q(no)},{q(status)},{q(json.dumps(d, ensure_ascii=False))}::jsonb,{q(day.strftime('%Y-%m-%d %H:%M'))},{s['pv']},{s['kb']},{q(s['kec'])},{q(sek)},{q(s['nama'])},{q('[DEMO] Yayasan ' + s['kn'])},{kasus},{men},{terp},{q(lab)},'DEMO seed',{rep});")
    for dd in range(random.randint(2, 4)):
        sql.append(f"INSERT INTO mbg_keracunan_update (keracunan_id,tanggal,kasus,meninggal,rawat_inap,rawat_jalan,sembuh,created_by_name) SELECT id,{q((day + dt.timedelta(days=dd)).strftime('%Y-%m-%d'))},{max(0, kasus // (dd + 2))},0,{inap // (dd + 1)},{kasus // (dd + 3)},{kasus * dd // 4},'DEMO seed' FROM mbg_keracunan WHERE no_laporan={q(no)};")
# ── Pengawasan: 72 kunjungan ke ±38 SPPG; 14 SPPG beririsan dengan SPPG berkejadian (sisanya kejadian "belum diawasi")
overlap = [s for s in SPPG if s['nama'] in inc_sppg][:14]
others = [s for s in SPPG if s['nama'] not in inc_sppg]
random.shuffle(others)
targets = overlap + others[:24]
CEK_N = {3: 10, 4: 13, 5: 8, 6: 9, 7: 5, 8: 7, 9: 6, 10: 7, 11: 7}
plan = []
for s in targets: plan.append(s)
while len(plan) < 72: plan.append(random.choice(targets))
random.shuffle(plan)
vis = 0
for s in plan:
    vis += 1
    tgl = rdate(0.0, 1.0)
    t = (tgl - START).days / SPAN
    p_ok = min(0.98, s['mutu'] + 0.06 * t)  # sedikit membaik dari waktu ke waktu
    draf = vis % 13 == 0
    no = f"DEMO-MBG-P{vis:03d}"
    kd = {'lat': round(s['lat'] + random.uniform(-0.002, 0.002), 5), 'lng': round(s['lng'] + random.uniform(-0.002, 0.002), 5), 'catatan': 'DATA DEMO LOKAL (PR 052b)'}
    st = 'draf' if draf else 'dikirim'
    sub = 'NULL' if draf else q(f"{tgl} 15:00:00+07")
    sql.append(f"INSERT INTO mbg_kunjungan (no_kunjungan,status,data,nama_tpg,puskesmas,province_id,kabkota_id,nama_sppg,nama_pengawas,tanggal,created_by_name,submitted_at) VALUES ({q(no)},{q(st)},{q(json.dumps(kd))}::jsonb,'[DEMO] TPG',{q('[DEMO] Puskesmas ' + s['kec'])},{s['pv']},{s['kb']},{q(s['nama'])},'[DEMO] Pengawas',{q(str(tgl))},'DEMO seed',{sub});")
    forms_to_do = list(range(1, 14)) if not draf else random.sample(range(1, 12), 4)
    skors = []
    for f in forms_to_do:
        fst = 'draf' if draf else 'dikirim'
        if f in CEK_N:
            tot = CEK_N[f]
            pf = p_ok - (0.08 if f in (4, 6) else 0) + (0.05 if f in (10, 11) else 0)  # higiene sanitasi (F4/F6) cenderung lemah
            ok = sum(1 for _ in range(tot) if random.random() < pf)
            tidak = sorted(random.sample(range(1, tot + 1), tot - ok))
            skor = round(ok / tot * 100, 1)
            if f <= 9: skors.append(skor)
            kes = 'Sesuai' if skor >= 80 else 'Tidak Sesuai'
            data = {'_hasil': {'total': tot, 'dinilai': tot, 'sesuai': ok, 'tidak_sesuai': tidak}}
            if f == 3: data['alergi'] = 'Ya' if random.random() < 0.12 else 'Tidak'
            sql.append(f"INSERT INTO mbg_form (kunjungan_id,form_no,status,data,skor,kesimpulan,created_by_name,submitted_at) SELECT id,{f},{q(fst)},{q(json.dumps(data))}::jsonb,{skor},{q(kes)},'DEMO seed',{sub} FROM mbg_kunjungan WHERE no_kunjungan={q(no)};")
        elif f == 1:
            f1 = {'a': 'Sesuai' if random.random() < p_ok + 0.05 else 'Tidak Sesuai', 'b1': 'Sesuai' if random.random() < p_ok else 'Tidak Sesuai',
                  'b2': 'Sesuai' if random.random() < p_ok - 0.1 else 'Tidak Sesuai', 'total_penjamah': random.randint(15, 47)}
            data = {'_hasil': f1, 'wilayah_3t': 'Ya' if s['pv'] in (18, 27) and random.random() < 0.6 else 'Tidak'}
            sql.append(f"INSERT INTO mbg_form (kunjungan_id,form_no,status,data,kesimpulan,created_by_name,submitted_at) SELECT id,1,{q(fst)},{q(json.dumps(data))}::jsonb,{q('Sesuai' if 'Tidak Sesuai' not in f1.values() else 'Tidak Sesuai')},'DEMO seed',{sub} FROM mbg_kunjungan WHERE no_kunjungan={q(no)};")
        elif f == 2:
            ta = [r for r in range(1, 8) if random.random() > p_ok + 0.05]; tb = [r for r in range(1, 9) if random.random() > p_ok]
            f2d = {f'a{r}': ('Tidak Sesuai' if r in ta else 'Sesuai') for r in range(1, 8)}
            f2d.update({f'b{r}': ('Tidak Sesuai' if r in tb else 'Sesuai') for r in range(1, 9)})
            f2d['_hasil'] = {'tidak_a': ta, 'tidak_b': tb}
            sql.append(f"INSERT INTO mbg_form (kunjungan_id,form_no,status,data,kesimpulan,created_by_name,submitted_at) SELECT id,2,{q(fst)},{q(json.dumps(f2d))}::jsonb,{q('Sesuai' if not ta and not tb else 'Tidak Sesuai')},'DEMO seed',{sub} FROM mbg_kunjungan WHERE no_kunjungan={q(no)};")
        elif f == 12:
            r12 = 'BAIK' if skors and sum(skors) / len(skors) >= 80 else 'BELUM BAIK'
            sql.append(f"INSERT INTO mbg_form (kunjungan_id,form_no,status,data,kesimpulan,created_by_name,submitted_at) SELECT id,12,{q(fst)},'{{}}'::jsonb,{q(r12)},'DEMO seed',{sub} FROM mbg_kunjungan WHERE no_kunjungan={q(no)};")
        elif f == 13:
            r13 = 'BAIK' if random.random() < p_ok + 0.05 else 'BELUM BAIK'
            sql.append(f"INSERT INTO mbg_form (kunjungan_id,form_no,status,data,kesimpulan,created_by_name,submitted_at) SELECT id,13,{q(fst)},'{{}}'::jsonb,{q(r13)},'DEMO seed',{sub} FROM mbg_kunjungan WHERE no_kunjungan={q(no)};")
sql.append("COMMIT;")
open('dev/seed/mbg_demo.sql', 'w').write("\n".join(sql) + "\n")
open('dev/seed/mbg_demo_hapus.sql', 'w').write("""-- Hapus DATA DEMO LOKAL Dasbor MBG (PR 052b): semua baris bertanda DEMO-MBG-*.
-- mbg_keracunan_update & mbg_form ikut terhapus (ON DELETE CASCADE).
BEGIN;
DELETE FROM mbg_keracunan WHERE no_laporan LIKE 'DEMO-MBG-%';
DELETE FROM mbg_kunjungan WHERE no_kunjungan LIKE 'DEMO-MBG-%';
COMMIT;
""")
print('incidents', N_INC, 'sppg_inc', len(inc_sppg), 'visits', vis, 'overlap', len(overlap), 'lines', len(sql))
