"""PR 012: API test for /api/v1/analytics/* (overview, diseases grid, disease detail). Usage: analytics_api_test.py BASE
Read-only. Checks: 404 for unknown disease, EBS and Kasus PE reported as separate values, Sumber filter (ebs/pe) hides the other source."""
import json, sys, urllib.request, urllib.error

BASE = sys.argv[1].rstrip('/')
ok_all = True


def get(path):
    try:
        with urllib.request.urlopen(BASE + path, timeout=60) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def check(name, cond, extra=''):
    global ok_all
    ok_all &= bool(cond)
    print(('PASS ' if cond else 'FAIL ') + name + (f' — {extra}' if extra and not cond else ''))


st, g = get('/api/v1/analytics/diseases')
rows = g.get('data') or []
check('diseases grid 200 and >= 31 rows', st == 200 and len(rows) >= 31, (st, len(rows)))
check('grid rows carry separate ebs_alerts and pe_cases', all('ebs_alerts' in r and 'pe_cases' in r and 'total' not in r for r in rows))
check('grid rows carry icd10/symptoms/transmission', all(k in rows[0] for k in ('icd10', 'symptoms', 'transmission')))
pe_dis = max(rows, key=lambda r: r['pe_cases'])
ebs_dis = max(rows, key=lambda r: r['ebs_alerts'])
print(f'  info: most PE = {pe_dis["code"]} ({pe_dis["pe_cases"]}), most EBS = {ebs_dis["code"]} ({ebs_dis["ebs_alerts"]})')

st, e = get('/api/v1/analytics/diseases/TIDAK-ADA-XYZ')
check('unknown disease -> 404 with error', st == 404 and e.get('success') is False and e.get('error'), (st, e))

W = 'start_date=2000-01-01&end_date=2100-12-31'
st, d = get(f'/api/v1/analytics/diseases/{pe_dis["code"]}?{W}')
dd = d.get('data') or {}
t = dd.get('totals', {})
check('detail 200 with separate totals', st == 200 and {'ebs_alerts', 'pe_cases'} <= set(t), (st, t))
check('detail PE total == grid pe_cases (all time)', t.get('pe_cases') == pe_dis['pe_cases'], (t.get('pe_cases'), pe_dis['pe_cases']))
check('detail sections present', all(k in dd for k in ('epi', 'regions', 'top', 'age', 'sex', 'cfr', 'latest')))
lp = dd.get('latest', {}).get('pe', [])
check('latest PE shows initials only', all(all(len(w) == 2 and w.endswith('.') for w in (x.get('patient_initials') or '').split()) and 'nama_pasien' not in x for x in lp),
      [x.get('patient_initials') for x in lp][:3])

st, de = get(f'/api/v1/analytics/diseases/{ebs_dis["code"]}?{W}')
check('detail EBS total == grid ebs_alerts (all time)', de['data']['totals']['ebs_alerts'] == ebs_dis['ebs_alerts'],
      (de['data']['totals']['ebs_alerts'], ebs_dis['ebs_alerts']))

st, de = get(f'/api/v1/analytics/diseases/{pe_dis["code"]}?{W}&source=ebs')
check('source=ebs hides PE', st == 200 and de['data']['sources'] == {'ebs': True, 'pe': False} and not de['data']['totals'].get('pe_cases'), de.get('data', {}).get('totals'))
st, dp = get(f'/api/v1/analytics/diseases/{pe_dis["code"]}?{W}&source=pe')
check('source=pe hides EBS', st == 200 and dp['data']['sources'] == {'ebs': False, 'pe': True} and not dp['data']['totals'].get('ebs_alerts'), dp.get('data', {}).get('totals'))

for src, want in (('', {'ebs': True, 'pe': True}), ('&source=ebs', {'ebs': True, 'pe': False}), ('&source=pe', {'ebs': False, 'pe': True})):
    st, o = get(f'/api/v1/analytics/overview?{W}{src}')
    od = o.get('data') or {}
    check(f'overview{src or " (semua)"} 200 sources={want}', st == 200 and od.get('sources') == want, (st, od.get('sources')))
    if st == 200 and src == '':
        heat = od.get('heatmap')
        check('overview has weeks, trend.ebs/trend.pe, heatmap', od.get('weeks') and isinstance(od.get('trend'), dict) and {'ebs', 'pe'} <= set(od['trend']) and heat is not None)

st, x = get('/api/v1/dashboard/executive?source=pe')
check('executive source=pe accepted (no EBS cards)', st == 200, st)
print('ALL PASS' if ok_all else 'SOME FAILED')
sys.exit(0 if ok_all else 1)
