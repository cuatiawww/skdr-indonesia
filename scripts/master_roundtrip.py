#!/usr/bin/env python3
"""PR 004 Master Data round trip: create -> edit -> deactivate -> activate (+ validation 400 / duplicate 409) for
provinsi, kabupaten/kota and penyakit. Soft delete only: the test rows ("UJI PR004 ...") are left INACTIVE at the end.
Re-runnable: an existing test row is reused. Usage: python3 scripts/master_roundtrip.py [API_BASE]"""
import json, sys, urllib.request, urllib.error

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8091").rstrip("/") + "/api/v1/admin/master"
ok = True

def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

def check(label, cond, extra=""):
    global ok
    ok &= bool(cond)
    print(f"  [{'OK' if cond else 'FAIL'}] {label} {extra}")

def find(path, search, key, val):
    _, j = call("GET", f"{path}?status=all&per_page=50&search={urllib.parse.quote(search)}")
    return next((r for r in j.get("data", []) if r[key] == val), None)

import urllib.parse

def roundtrip(name, path, create, edit, key, invalid, search):
    print(f"== {name}")
    st, j = call("POST", path, create)
    if st == 409:
        row = find(path, search, key, create[key]); rid = row["id"]
        check("create (already existed, reused)", True, f"id={rid}")
    else:
        rid = j.get("id"); check("create 201", st == 201, f"id={rid}")
    st, j = call("POST", path, create); check("duplicate -> 409", st == 409, j.get("error", ""))
    st, j = call("POST", path, invalid); check("invalid -> 400", st == 400, j.get("error", ""))
    st, _ = call("PUT", f"{path}/{rid}", edit); row = find(path, search, key, create[key])
    check("edit 200", st == 200 and row and row["name"] == edit["name"], f"name={row and row['name']}")
    st, _ = call("PATCH", f"{path}/{rid}/status", {"is_active": False}); row = find(path, search, key, create[key])
    check("deactivate", st == 200 and row and row["is_active"] is False)
    st, _ = call("PATCH", f"{path}/{rid}/status", {"is_active": True}); row = find(path, search, key, create[key])
    check("activate", st == 200 and row and row["is_active"] is True)
    st, _ = call("PATCH", f"{path}/999999/status", {"is_active": True}); check("unknown id -> 404", st == 404)
    return rid

prov = roundtrip("Provinsi", "/provinces",
    {"code": "99", "name": "UJI PR004 Provinsi", "latitude": -2.5, "longitude": 118.0},
    {"code": "99", "name": "UJI PR004 Provinsi (diubah)", "latitude": -2.6, "longitude": 118.1},
    "code", {"code": "9", "name": "", "latitude": 50, "longitude": 10}, "UJI PR004")
kab = roundtrip("Kabupaten/Kota", "/kabkota",
    {"province_id": prov, "kemendagri_code": "99.01", "code": "9901", "name": "UJI PR004 Kabupaten", "kind": "kabupaten", "latitude": -2.5, "longitude": 118.0},
    {"province_id": prov, "kemendagri_code": "99.01", "code": "9901", "name": "UJI PR004 Kabupaten (diubah)", "kind": "kota", "latitude": -2.55, "longitude": 118.05},
    "kemendagri_code", {"province_id": prov, "kemendagri_code": "31.99", "code": "3199", "name": "X", "kind": "kabupaten", "latitude": -2.5, "longitude": 118.0}, "UJI PR004")
dis = roundtrip("Penyakit", "/diseases",
    {"code": "UJI_PR004", "name": "UJI PR004 Penyakit", "category": "Uji", "aliases_id": ["uji"]},
    {"code": "UJI_PR004", "name": "UJI PR004 Penyakit (diubah)", "category": "Uji", "aliases_id": ["uji", "tes"]},
    "code", {"code": "bad code!", "name": "X"}, "UJI_PR004")
_, j = call("GET", f"/kabkota?province_id={prov}&status=all"); check("kab/kota filter by provinsi", j.get("total") == 1, f"total={j.get('total')}")
# leave test rows inactive (soft delete, no hard delete)
for p, i in (("/kabkota", kab), ("/provinces", prov), ("/diseases", dis)):
    call("PATCH", f"{p}/{i}/status", {"is_active": False})
print("ROUNDTRIP PASS (test rows left inactive)" if ok else "ROUNDTRIP FAIL")
sys.exit(0 if ok else 1)
