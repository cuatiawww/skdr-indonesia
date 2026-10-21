"""PR 011: CRUD API test for PE cases (GET by id, PUT, soft DELETE). Usage: pe_crud_test.py BASE FORM
Creates one synthetic draft "UJI PR011 <form> Hapus" which is soft-deleted (row stays in DB with deleted_at)."""
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


st, c = call('POST', '/api/v1/pe/cases', {'form_key': FORM, 'data': {'nama_pasien': f'UJI PR011 {FORM} Hapus'}})
check('create draft', st == 201, st)
cid, no = c['data']['id'], c['data']['no_pe']
st, g = call('GET', f'/api/v1/pe/cases/{cid}')
check('GET by id', st == 200 and g['data']['id'] == cid, st)
st, u = call('PUT', f'/api/v1/pe/cases/{cid}', {'data': {**g['data']['data'], 'nama_pasien': f'UJI PR011 {FORM} Hapus (diubah)'}})
check('update (PUT) draft', st == 200 and u['data']['data']['nama_pasien'].endswith('(diubah)'), st)
st, d = call('DELETE', f'/api/v1/pe/cases/{cid}')
check('delete draft ok', st == 200 and d['data']['deleted'] is True, (st, d))
st, _ = call('GET', f'/api/v1/pe/cases/{cid}')
check('deleted -> GET 404', st == 404, st)
st, _ = call('PUT', f'/api/v1/pe/cases/{cid}', {'data': {}})
check('deleted -> PUT 404', st == 404, st)
st, _ = call('DELETE', f'/api/v1/pe/cases/{cid}')
check('delete twice -> 404', st == 404, st)
st, lst = call('GET', f'/api/v1/pe/cases?form={FORM}&search={no}')
check('list excludes soft-deleted', st == 200 and all(x['id'] != cid for x in lst['data']), st)
sub = None
for s_ in ('dikirim', 'terverifikasi', 'final', 'dikembalikan'):
    st, l2 = call('GET', f'/api/v1/pe/cases?form={FORM}&status={s_}&per_page=1')
    if l2.get('data'):
        sub = l2['data'][0]; break
check('found a non-draf record', sub is not None)
if sub:
    st, r = call('DELETE', f"/api/v1/pe/cases/{sub['id']}")
    check(f"delete {sub['status']} rejected (409)", st == 409, (st, r))
    st, g2 = call('GET', f"/api/v1/pe/cases/{sub['id']}")
    check('non-draf still present', st == 200 and g2['data']['status'] == sub['status'], st)
print('DELETED_ID', cid)
print('RESULT', 'PASS' if ok_all else 'FAIL')
sys.exit(0 if ok_all else 1)
