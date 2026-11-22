import io, json, os, sys, urllib.request, datetime
import openpyxl

SHEET = os.environ.get("AMMO_SHEET_URL") or "https://docs.google.com/spreadsheets/d/1mYZNMzwVYPd5Bts4Goy7LZol-SsWZl5navPDvob-PEw/export?format=xlsx"
BASE = "tools/ammo-sheet-base.json"
OUT = "e/ammo-sheet.json"


def norm(v):
    if isinstance(v, float):
        return "%g" % v
    return str(v).strip()


def cells(data):
    wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
    out = {}
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for c in row:
                if c.value is not None and norm(c.value) != "":
                    out[ws.title + "!" + c.coordinate] = norm(c.value)
    return out


def main():
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    prev = {}
    if os.path.exists(OUT):
        try:
            prev = json.load(open(OUT))
        except Exception:
            prev = {}
    if len(sys.argv) > 2 and sys.argv[1] == "--base":
        json.dump(cells(open(sys.argv[2], "rb").read()), open(BASE, "w"), indent=0, sort_keys=True)
        return
    try:
        req = urllib.request.Request(SHEET, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req, timeout=60).read()
        now_cells = cells(data)
    except Exception as e:
        res = {"ok": False, "error": str(e)[:200], "failedSince": prev.get("failedSince") or now, "changed": prev.get("changed", 0), "since": prev.get("since"), "cells": prev.get("cells", [])}
        json.dump(res, open(OUT, "w"), indent=1)
        return
    base = json.load(open(BASE))
    diff = []
    for k in sorted(set(base) | set(now_cells)):
        if base.get(k) != now_cells.get(k):
            s, c = k.split("!", 1)
            r = s + "!A" + "".join(ch for ch in c if ch.isdigit())
            diff.append({"sheet": s, "cell": c, "row": now_cells.get(r) or base.get(r, ""), "old": base.get(k, ""), "new": now_cells.get(k, "")})
    res = {"ok": True, "changed": len(diff), "since": (prev.get("since") or now) if diff else None, "cells": diff[:60]}
    json.dump(res, open(OUT, "w"), indent=1)


main()
