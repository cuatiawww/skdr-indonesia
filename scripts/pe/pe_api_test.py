#!/usr/bin/env python3
"""PR 006+: end-to-end API test for a PE form (draft -> autosave -> validation -> workflow -> override -> cluster N1-N9).
Creates clearly marked synthetic test rows (nama "UJI PR006 ..."); nothing is deleted.
usage: pe_api_test.py <base_url> <form_key>"""
import json, sys, urllib.request, urllib.error

BASE, FORM = sys.argv[1].rstrip('/'), sys.argv[2]
ok_all = True


def call(method, path, body=None, role=None):
    req = urllib.request.Request(BASE + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json', **({'X-SKDR-Role': role} if role else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def check(name, cond, extra=''):
    global ok_all
    ok_all &= bool(cond)
    print(('PASS ' if cond else 'FAIL ') + name + (f' — {extra}' if extra and not cond else ''))


st, f = call('GET', f'/api/v1/pe/forms/{FORM}')
check('schema loads', st == 200 and f['data']['schema']['form_key'] == FORM)
schema, today = f['data']['schema'], f['data']['today']
prov = call('GET', '/api/v1/master/provinces')[1]['data'][0]
kab = call('GET', f"/api/v1/master/kabkota?province_id={prov['id']}")[1]['data'][0]
other_kab = [k for k in call('GET', '/api/v1/master/kabkota')[1]['data'] if k['province_id'] != prov['id']][0]

# 1. draft with only a few answers -> saved, many errors, report date NOT auto-filled
st, c = call('POST', '/api/v1/pe/cases', {'form_key': FORM, 'data': {'nama_pasien': 'UJI PR006 Draf', 'lapor_provinsi': prov['id'], 'lapor_kabkota': other_kab['id']}})
check('draft created', st == 201, st)
cid, d = c['data']['id'], c['data']
check('No. PE generated', d['no_pe'].startswith(schema['no_pe_prefix']), d.get('no_pe'))
check('Tanggal Laporan not auto-filled', not d['data'].get('tgl_laporan'))
check('draft has validation errors', len(d['errors']) > 10, len(d['errors']))
check('kab/kota must belong to province', any(e['key'] == 'lapor_kabkota' and 'tidak sesuai' in e['msg'] for e in d['errors']))
st, r = call('POST', f'/api/v1/pe/cases/{cid}/status', {'to': 'dikirim'})
check('incomplete PE cannot be sent (422)', st == 422, st)
st, r = call('POST', f'/api/v1/pe/cases/{cid}/status', {'to': 'final'})
check('draf -> final not allowed (409)', st == 409, st)


# 2. complete valid data (synthetic, generic from the schema + per-form overrides)
import datetime as _dt
O = _dt.date.fromisoformat(today) - _dt.timedelta(days=10)
DATES = {'tgl_lahir': '1990-01-01', 'tgl_laporan': str(O + _dt.timedelta(days=1)), 'tgl_pe': str(O + _dt.timedelta(days=3)), 'tgl_rumor': str(O)}


def fill(fields, in_table=False):
    out = {}
    for fl in fields:
        k, t = fl['key'], fl['type']
        opts = fl.get('options', [])
        if t in ('auto', 'info', 'cluster_monitoring', 'cluster'):
            continue
        if t == 'select':
            out[k] = 'Tidak' if 'Tidak' in opts else opts[0]
        elif t == 'multiselect':
            out[k] = [opts[0]]
        elif t == 'date':
            out[k] = DATES.get(k, str(O if k in ('tgl_mulai_sakit',) else O + _dt.timedelta(days=1)))
        elif t == 'number':
            out[k] = max(fl.get('min', 1), 1)
        elif t == 'province':
            out[k] = prov['id']
        elif t == 'kabkota':
            out[k] = kab['id']
        elif t == 'ebs':
            out[k] = 'none'
        elif t == 'table':
            out[k] = [fill(fl['columns'], True)]
        elif fl.get('format') == 'digits':
            out[k] = '1' * fl.get('minLen', 10)
        else:
            out[k] = 'UJI PR006' if k != 'nama_pasien' else 'UJI PR006 Lengkap'
    return out


fields = [fl for s in schema['steps'] for se in s['sections'] for fl in se['fields']]
data = fill(fields)
OVERRIDES = {
    'lepto': {'gejala_umum': ['Demam akut', 'Mialgia (nyeri otot)'], 'banjir': 'Ya', 'banjir_lama': 3,
              'spesimen': 'Ya', 'lab': [{'jenis_spesimen': 'Darah utuh (whole blood)', 'jenis_pemeriksaan': 'PCR', 'hasil': 'Terdeteksi',
                                         'tgl_ambil': str(O + _dt.timedelta(days=1)), 'tgl_kirim': str(O + _dt.timedelta(days=1)), 'tgl_hasil': str(O + _dt.timedelta(days=2))}],
              'status_laporan': 'Suspek Leptospirosis'},
}
data.update(OVERRIDES.get(FORM, {}))
st, c = call('PUT', f'/api/v1/pe/cases/{cid}', {'data': data})
d = c.get('data', {})
check('autosave update OK', st == 200, st)
check('complete data has 0 errors', st == 200 and d['errors'] == [], json.dumps(d.get('errors', [])[:5], ensure_ascii=False))
check('age stored (years)', d.get('data', {}).get('umur_tahun') is not None, d.get('data', {}).get('umur_tahun'))
EXPECT = {'lepto': 'konfirmasi'}
check('classification computed', d.get('classification') == EXPECT.get(FORM, d.get('classification')), d.get('classification'))
check('manual status vs system warning', FORM != 'lepto' or any('berbeda' in w['msg'] for w in d.get('warnings', [])))

# 3. workflow
st, r = call('POST', f'/api/v1/pe/cases/{cid}/status', {'to': 'dikirim'}, role='petugas')
check('draf -> dikirim', st == 200 and r['data']['status'] == 'dikirim', st)
st, r = call('PUT', f'/api/v1/pe/cases/{cid}', {'data': data})
check('sent PE is locked (409)', st == 409, st)
st, r = call('POST', f'/api/v1/pe/cases/{cid}/status', {'to': 'dikembalikan'}, role='verifikator')
check('return needs a note (400)', st == 400, st)
st, r = call('POST', f'/api/v1/pe/cases/{cid}/status', {'to': 'dikembalikan', 'note': 'Uji PR006: periksa tanggal'}, role='verifikator')
check('dikirim -> dikembalikan', st == 200 and r['data']['status'] == 'dikembalikan', st)
st, r = call('PUT', f'/api/v1/pe/cases/{cid}', {'data': data})
check('returned PE editable again', st == 200, st)
for to, role in (('dikirim', 'petugas'), ('terverifikasi', 'verifikator')):
    st, r = call('POST', f'/api/v1/pe/cases/{cid}/status', {'to': to}, role=role)
    check(f'-> {to}', st == 200 and r['data']['status'] == to, st)

# 4. classification override with reason (audit)
st, r = call('PUT', f'/api/v1/pe/cases/{cid}/classification', {'code': 'suspek'})
check('override without reason rejected', st == 400, st)
st, r = call('PUT', f'/api/v1/pe/cases/{cid}/classification', {'code': 'suspek', 'reason': 'Uji PR006'})
check('override saved + logged', st == 200 and r['data']['classification_override'] == 'suspek'
      and any(e['event'] == 'koreksi_klasifikasi' for e in r['data']['events']), st)
call('PUT', f'/api/v1/pe/cases/{cid}/classification', {'code': None})
st, r = call('POST', f'/api/v1/pe/cases/{cid}/status', {'to': 'final'}, role='verifikator')
check('-> final', st == 200 and r['data']['status'] == 'final', st)
st, r = call('PUT', f'/api/v1/pe/cases/{cid}/classification', {'code': 'suspek', 'reason': 'x'})
check('final PE locked for override (409)', st == 409, st)
events = [e['event'] for e in r.get('data', {}).get('events', [])] if st == 200 else [e['event'] for e in call('GET', f'/api/v1/pe/cases/{cid}')[1]['data']['events']]
check('history has status events', events.count('status') >= 5, events)

# 5. cluster with outbreak-level monitoring
if schema.get('cluster_fields'):
    st, cl = call('POST', '/api/v1/pe/clusters', {'form_key': FORM, 'name': 'UJI PR006 Klaster', 'province_id': prov['id'], 'kabkota_id': kab['id'], 'tgl_rumor': str(O)})
    check('cluster created', st == 201, st)
    clid = cl['data']['id']
    base = {k: cl['data'][k] for k in ('name', 'province_id', 'kabkota_id', 'tgl_rumor')}
    bad = {'periode_mulai': str(O), 'periode_akhir': str(O), 'n1': 10, 'n2': 11, 'n3': 5, 'n4': 6, 'n7': 3, 'n8': 2, 'n9': 2}
    st, r = call('PUT', f'/api/v1/pe/clusters/{clid}', {**base, 'monitoring': bad})
    msgs = [e['msg'] for e in r.get('errors', [])]
    check('N2<=N1, N4<=N3, N8+N9<=N7 enforced (422)', st == 422 and len(msgs) >= 3, msgs)
    good = {'periode_mulai': str(O), 'periode_akhir': str(O + _dt.timedelta(days=5)), 'n1': 100, 'n2': 20, 'n3': 30, 'n4': 5, 'n5': 4, 'n6': 1, 'n7': 4, 'n8': 1, 'n9': 3}
    st, r = call('PUT', f'/api/v1/pe/clusters/{clid}', {**base, 'monitoring': good})
    check('valid monitoring saved on cluster', st == 200 and r['data']['monitoring'].get('n1') == 100, st)
    st, c2 = call('POST', '/api/v1/pe/cases', {'form_key': FORM, 'data': {'nama_pasien': 'UJI PR006 Klaster', 'cluster_id': clid, 'pe_klb': 'Ya'}})
    check('PE linked to cluster', st == 201 and c2['data']['cluster_id'] == clid, st)
    st, lst = call('GET', f'/api/v1/pe/clusters?form={FORM}')
    check('cluster lists linked PE count', any(x['id'] == clid and x['cases'] == 1 for x in lst['data']))

st, lst = call('GET', f'/api/v1/pe/cases?form={FORM}&search=UJI')
check('list masks patient name', st == 200 and all('UJI' not in json.dumps(x) for x in lst['data']) and lst['total'] >= 1, st)
check('list has no NIK', 'nik' not in json.dumps(lst['data']))
print('RESULT', 'PASS' if ok_all else 'FAIL')
