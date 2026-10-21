"""PE form engine — schema builder core (PR 006).

Labels, field types, options and required status are read verbatim from the spec rows extracted from the
tracker sheet (docs/pe-spec/<form>.json). Each disease module only adds keys, visibility, validation rules
and the case-classification rules. Output: database/pe/<form>.v<N>.json (loaded into pe_form_definitions
by a migration).
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TODAY = 'today'


class Spec:
    def __init__(self, form):
        self.rows = {r['row']: r for r in json.load(open(os.path.join(ROOT, 'docs', 'pe-spec', f'{form}.json')))['rows']}
        self.used = set()

    def get(self, row):
        r = self.rows[row]
        self.used.add(row)
        return r


def clean(s):
    return re.sub(r'[ \t]+', ' ', str(s or '')).strip()


def split_options(v):
    v = str(v or '').strip()
    if '\n' in v:
        parts = [clean(p) for p in v.split('\n')]
    else:
        parts = [clean(p) for p in v.split(',')]
    return [p for p in parts if p]


TYPE_MAP = {'Dropdown': 'select', 'Multiple selection/Checklist': 'multiselect', 'Multiple selection/cheklist': 'multiselect',
            'Date': 'date', 'Free text': 'text', 'Number': 'number', 'Auto-generated': 'auto'}


def field(spec, row, key, label=None, type=None, options=None, **kw):
    """Build one field from a spec row. label rule: the sheet's 'Field' column; when it is empty, or repeats the
    question of the controlling row above (sub-field), the 'Variabel/field' column (or Subsection) is used."""
    r = spec.get(row)
    ftype = TYPE_MAP.get(clean(r.get('Field type')), 'text')
    fld, var, sub = clean(r.get('Field')), clean(r.get('Variabel/field')), clean(r.get('Subsection'))
    if label is None:
        prev = clean(spec.rows.get(row - 1, {}).get('Field'))
        if fld and fld != prev:
            label = fld
        elif ftype in ('select', 'multiselect') and not fld:
            label = sub
        else:
            label = var if var and var != 'Date' else (fld or sub)
    f = {'key': key, 'label': label, 'type': type or ftype, 'row': row}
    if f['type'] in ('select', 'multiselect') and options is None:
        options = split_options(var)
    if options is not None:
        f['options'] = options
    req = clean(r.get('Field requirement status'))
    f['required'] = req.startswith('Required')
    text = ' '.join(clean(r.get(c)) for c in ('Conditional visibility', 'Validation Logic'))
    if re.search(r'If "Lainnya", then add new field', text) and 'other' not in kw:
        kw['other'] = {'value': 'Lainnya', 'key': key + '_lainnya', 'label': 'Jika lainnya, sebutkan'}
    if kw.get('other') is False:
        kw.pop('other')
    f.update({k: v for k, v in kw.items() if v is not None})
    return f


def eq(k, v): return {'f': k, 'eq': v}
def isin(k, vs): return {'f': k, 'in': vs}
def has(k, v): return {'f': k, 'has': v}
def has_any(k, vs): return {'f': k, 'hasAny': vs}
def filled(k): return {'f': k, 'filled': True}
def all_(*c): return {'all': list(c)}
def any_(*c): return {'any': list(c)}
def not_(c): return {'not': c}
def rows_any(table, c): return {'rows': table, 'any': c}
def count_gte(n, *c): return {'count': list(c), 'gte': n}


def le(ref): return {'op': '<=', 'ref': ref}
def ge(ref): return {'op': '>=', 'ref': ref}


PHONE_10_13 = {'format': 'digits', 'minLen': 10, 'maxLen': 13}
PHONE_11_13 = {'format': 'digits', 'minLen': 11, 'maxLen': 13}
NIK = {'format': 'digits', 'minLen': 16, 'maxLen': 16}


def info(key, text, visible=None):
    f = {'key': key, 'type': 'info', 'label': text}
    if visible: f['visible'] = visible
    return f


def section(sid, title, fields, visible=None):
    s = {'id': sid, 'title': title, 'fields': fields}
    if visible: s['visible'] = visible
    return s


def step(sid, title, sections):
    return {'id': sid, 'title': title, 'sections': sections}


def write(form, schema, spec):
    # every spec row that defines a field must be used (fields must match the sheet)
    field_rows = {n for n, r in spec.rows.items() if clean(r.get('Field type'))}
    missing = sorted(field_rows - spec.used)
    if missing:
        raise SystemExit(f'{form}: spec rows not mapped to a field: {missing}')
    def check(fs, where):
        keys = []
        for f in fs:
            keys.append(f['key'])
            if 'other' in f: keys.append(f['other']['key'])
            if f['type'] == 'table': check(f['columns'], f['key'])
        dup = {k for k in keys if keys.count(k) > 1}
        if dup:
            raise SystemExit(f'{form}: duplicate keys in {where}: {dup}')
        return keys
    keys = check([f for st in schema['steps'] for se in st['sections'] for f in se['fields']], 'form')
    check(schema.get('cluster_fields', []), 'cluster')
    out = os.path.join(ROOT, 'database', 'pe', f"{form}.v{schema['version']}.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(schema, open(out, 'w'), ensure_ascii=False, indent=1)
    print(f'{out}: {len(keys)} keys, {len(spec.used)} spec rows mapped')
