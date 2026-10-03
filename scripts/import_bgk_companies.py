#!/usr/bin/env python3
"""
scripts/import_bgk_companies.py — jednorazowy import BGK_TESTOWA_PACZKA_100.csv
do public.bgk_companies (migracje 110/111). NIE jest częścią reużywalnego UI —
to skrypt do uruchomienia ręcznie, raz, dla paczki testowej 100 firm.

Użycie:
  SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_URL=... python3 scripts/import_bgk_companies.py "Claude outputs/BGK_TESTOWA_PACZKA_100.csv"

Wymaga: pip install requests (albo urllib — patrz niżej, zero zależności).
"""
import csv
import json
import os
import re
import sys
import urllib.request
import urllib.error

def clean(v):
    v = (v or "").strip()
    if v in ("", "nieustalone (poza zakresem tej tury)", "brak", "—", "-"):
        return None
    return v

def parse_amount(v):
    v = clean(v)
    if not v:
        return None
    v = v.replace("\xa0", " ").replace(" ", "").replace(",", ".")
    try:
        return float(v)
    except ValueError:
        return None

def parse_date_ddmmyyyy(v):
    v = clean(v)
    if not v:
        return None
    m = re.match(r"^(\d{2})\.(\d{2})\.(\d{4})$", v)
    if m:
        d, mo, y = m.groups()
        return f"{y}-{mo}-{d}"
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", v)
    if m:
        return v
    return None

def parse_int(v):
    v = clean(v)
    if not v:
        return None
    try:
        return int(re.sub(r"[^\d]", "", v))
    except ValueError:
        return None

def main():
    if len(sys.argv) < 2:
        print("Usage: import_bgk_companies.py <csv_path> [source_batch]", file=sys.stderr)
        sys.exit(1)
    csv_path = sys.argv[1]
    source_batch = sys.argv[2] if len(sys.argv) > 2 else "BGK_TESTOWA_PACZKA_100"

    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        print("Brak SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY w env.", file=sys.stderr)
        sys.exit(1)

    rows_out = []
    with open(csv_path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            nip = clean(row.get("NIP"))
            name = clean(row.get("Nazwa"))
            if not nip or not name:
                continue
            nip_digits = re.sub(r"\D", "", nip)

            amount = parse_amount(row.get("Kwota brutto PLN"))
            guarantee_date = parse_date_ddmmyyyy(row.get("Data poręczenia BGK"))
            registered_at = clean(row.get("Data rejestracji"))  # już YYYY-MM-DD
            tenure = parse_int(row.get("Staż (miesiące)"))

            zarzad_raw = clean(row.get("Zarząd (wyszukiwarka-krs)"))
            beneficjent_raw = clean(row.get("Beneficjent rzeczywisty (CRBR)"))
            ekrs_count = parse_int(row.get("Liczba dokumentów finansowych (eKRS)"))

            rows_out.append({
                "nip": nip_digits,
                "name": name,
                "legal_form": clean(row.get("Forma prawna")),
                "pkd_main": clean(row.get("PKD")),
                "size_category": clean(row.get("Wielkość")),
                "region_teryt": clean(row.get("Region (TERYT)")),
                "registered_at": registered_at,
                "tenure_months": tenure,
                "tenure_source": clean(row.get("Źródło stażu")),
                "bgk_guarantee_date": guarantee_date,
                "amount_gross_pln": amount,
                "tier": clean(row.get("Tier")),
                "vat_status": clean(row.get("Status VAT")),
                "decision_person": clean(row.get("Osoba decyzyjna")),
                "decision_function": clean(row.get("Funkcja")),
                "phone": clean(row.get("Telefon")),
                "email": clean(row.get("E-mail")),
                "website": clean(row.get("Strona WWW")),
                "contact_source": clean(row.get("Źródło kontaktu")),
                "completeness": clean(row.get("Kompletność")),
                "zarzad": {"raw": zarzad_raw} if zarzad_raw else None,
                "krs_search_email": clean(row.get("E-mail (wyszukiwarka-krs)")),
                "beneficjent_crbr": {"raw": beneficjent_raw} if beneficjent_raw else None,
                "ekrs_doc_count": ekrs_count,
                "zgodnosc_zarzad_beneficjent": clean(row.get("Zgodność zarząd/beneficjent")),
                "source_batch": source_batch,
                "raw_data": row,
            })

    print(f"Parsed {len(rows_out)} rows from {csv_path}")

    body = json.dumps(rows_out).encode("utf-8")
    req = urllib.request.Request(
        f"{url}/rest/v1/bgk_companies?on_conflict=nip",
        data=body,
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            print("Upsert OK, status", resp.status)
    except urllib.error.HTTPError as e:
        print("HTTPError", e.code, e.read().decode("utf-8", "replace"), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
