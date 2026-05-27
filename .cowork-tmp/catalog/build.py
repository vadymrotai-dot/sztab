"""Build CzM B2B Katalog 2026 PDF — simple, не premium style."""
import os, base64, mimetypes
from weasyprint import HTML, CSS

PHOTO_DIR = '/sessions/relaxed-festive-thompson/mnt/sztab/.cowork-tmp/sku-photos'

def img_b64(path):
    if not os.path.exists(path): return None
    mime = mimetypes.guess_type(path)[0] or 'image/jpeg'
    with open(path, 'rb') as f:
        return f'data:{mime};base64,' + base64.b64encode(f.read()).decode()

# ─── DATA ──────────────────────────────────────────────────────
SKU_DATA = [
    # Lp, display, kategoria, gramatura, ean, szt_opak, paleta, termin, sklad
    (1, 'Kapusta kiszona', 'KISZONKI Z KAPUSTY', '3000 g', '4820116702300', 1, 125, '90 dni',
     'Świeża kapusta biała głowiasta, sól, marchew, konserwant sorbinian potasu (E202).'),
    (2, 'Kapusta kiszona z żurawiną', 'KISZONKI Z KAPUSTY', '3000 g', '4820116702836', 1, 125, '90 dni',
     'Świeża kapusta biała głowiasta, żurawina, sól, marchew, konserwant sorbinian potasu (E202).'),
    (3, 'Kapusta kiszona z papryką słodką', 'KISZONKI Z KAPUSTY', '3000 g', '4820116702843', 1, 125, '90 dni',
     'Świeża kapusta biała głowiasta, papryka słodka, sól, marchew, konserwant sorbinian potasu (E202).'),
    (4, 'Kapusta kiszona z ogórkami', 'KISZONKI Z KAPUSTY', '3000 g', '4820116702850', 1, 125, '90 dni',
     'Świeża kapusta biała głowiasta, ogórek kiszony, sól, marchew, konserwant sorbinian potasu (E202).'),
    (5, 'Świeża kapusta w marynacie', 'KAPUSTA W MARYNACIE', '3000 g', '4820116705479', 1, 125, '45 dni',
     'Świeża kapusta biała głowiasta, cukier, marchew, sól, regulator kwasowości – kwas cytrynowy, konserwant benzoesan sodu (E211).'),
    (6, 'Kapusta z burakami w marynacie', 'KAPUSTA W MARYNACIE', '3000 g', '—', 1, 125, '45 dni',
     'Świeża kapusta biała 65%, burak gotowany 13%, olej słonecznikowy, regulator kwasowości – roztwór kwasu octowego 9%, cukier, sól, konserwant benzoesan sodu (E211), pieprz czarny mielony.'),
    (7, 'Pełuska — kapusta w marynacie buraczanej', 'KAPUSTA W MARYNACIE', '3000 g / 2000 g netto bez zalewy', '—', 1, 125, '45 dni',
     'Świeża kapusta biała 67%, woda, cukier, burak ćwikłowy, regulator kwasowości – roztwór kwasu octowego 9%, olej słonecznikowy, sól, czosnek, pieprz czarny, kolendra, ziele angielskie, goździki, konserwant benzoesan sodu (E211), liść laurowy.'),
    (8, 'Tradycyjna — kapusta, marchew, papryka', 'SURÓWKI', '3000 g', '4820116705455', 1, 125, '30 dni',
     'Świeża kapusta biała 68%, papryka słodka 7%, olej słonecznikowy, marchew 4,7%, cukier, sól, regulatory kwasowości: kwas cytrynowy, kwas octowy 9%, konserwant benzoesan sodu (E211), przeciwutleniacz – kwas askorbinowy.'),
    (9, 'Tradycyjna — kapusta, marchew, papryka', 'SURÓWKI', '900 g', '4820116705455', 6, 432, '30 dni',
     'Świeża kapusta biała 68%, papryka słodka 7%, olej słonecznikowy, marchew 4,7%, cukier, sól, regulatory kwasowości: kwas cytrynowy, kwas octowy 9%, konserwant benzoesan sodu (E211), przeciwutleniacz – kwas askorbinowy.'),
    (10, 'Marchewka po koreańsku', 'SURÓWKI', '3000 g', '4820116705462', 1, 125, '30 dni',
     'Świeża marchew 83%, olej słonecznikowy, regulator kwasowości – roztwór kwasu octowego 9%, cukier, czosnek, sól, konserwant benzoesan sodu (E211), kolendra, stabilizator – guma guar (E412), curry, pieprz cayenne mielony, pieprz czarny mielony, przeciwutleniacz – kwas askorbinowy.'),
    (11, 'Marchewka po koreańsku', 'SURÓWKI', '900 g', '4820116705462', 6, 432, '30 dni',
     'Świeża marchew 83%, olej słonecznikowy, regulator kwasowości – roztwór kwasu octowego 9%, cukier, czosnek, sól, konserwant benzoesan sodu (E211), kolendra, stabilizator – guma guar (E412), curry, pieprz cayenne mielony, pieprz czarny mielony, przeciwutleniacz – kwas askorbinowy.'),
    (12, 'Sałatka z buraków czerwonych', 'SAŁATKI · BURAKI · OGÓRKI', '3000 g', '4820116705486', 1, 125, '30 dni',
     'Burak gotowany 93%, olej słonecznikowy, regulator kwasowości – roztwór kwasu octowego 9%, konserwant benzoesan sodu (E211), sól, cukier biały, przeciwutleniacz – kwas askorbinowy (E300), pieprz czarny mielony, stabilizator – guma guar (E412).'),
    (13, 'Buraki gotowane sterylizowane', 'SAŁATKI · BURAKI · OGÓRKI', '1500 g (vacuum) · także 350 g', '4820116704137', 1, 288, '60 dni',
     'Buraki stołowe obrane, gotowane. Bez dodatku konserwantów. Pakowane próżniowo. Czysta etykieta — jeden składnik.'),
    (14, 'Ogórki kiszone — wiadro 5 L', 'SAŁATKI · BURAKI · OGÓRKI', '5000 g / 3000 g netto', '4820116704397', 1, 80, '90 dni',
     'Świeże ogórki, woda, sól, koper, czosnek, korzeń chrzanu, liść porzeczki, liść wiśni, gorczyca, pieprz czarny ziarnisty, liść laurowy.'),
    (15, 'Ogórki kiszone — wiaderko 1 L', 'SAŁATKI · BURAKI · OGÓRKI', '1000 g / 600 g netto bez zalewy', '4820116704397', 6, 432, '90 dni',
     'Świeże ogórki, woda, sól, koper, czosnek, korzeń chrzanu, liść porzeczki, liść wiśni, gorczyca, pieprz czarny ziarnisty, liść laurowy.'),
    (16, 'Pomidory kiszone — wiadro 5 L', 'SAŁATKI · BURAKI · OGÓRKI', '5000 g / 3000 g netto', '4820116703208', 1, 80, '60 dni',
     'Pomidory, sól, cebula, koper, gorczyca, przyprawy, konserwant sorbinian potasu (E202).'),
]

CATS = [
    ('KISZONKI Z KAPUSTY', 'Klasyczne kiszonki z białej kapusty głowiastej z konserwantem na bazie sorbinianu potasu. 4 warianty smakowe — od czystej kiszonki po kompozycje z żurawiną, papryką i ogórkiem. Format hurtowy 3000 g.', [1,2,3,4]),
    ('KAPUSTA W MARYNACIE', 'Kapusta marynowana w trzech wariantach: świeża, z burakami i tradycyjna Pełuska w zalewie buraczanej. Format hurtowy 3000 g w wiadrach.', [5,6,7]),
    ('SURÓWKI', 'Gotowe surówki do hurtowni i gastronomii. Tradycyjna kapuściana + marchewka po koreańsku w dwóch formatach: 3000 g hurtowe i 900 g detaliczne.', [8,9,10,11]),
    ('SAŁATKI · BURAKI · OGÓRKI', 'Sałatka z buraków, buraki gotowane sterylizowane (czysta etykieta), klasyczne ogórki i pomidory kiszone w wiadrach 5 L i 1 L oraz vacuum.', [12,13,14,15,16]),
]

# ─── HTML build ────────────────────────────────────────────────
def html_page(content, klasa='page'):
    return f'<section class="{klasa}">{content}</section>'

# Cover
cover_html = """
<div class="cover-inner">
  <div class="cover-mark">CZUDOWA MARKA</div>
  <h1 class="cover-title">Katalog Produktów<br><span class="year">2026</span></h1>
  <div class="cover-tagline">Tradycyjne kiszonki polskie<br>dla hurtowni i gastronomii</div>
  <div class="cover-foot">
    <div>Importer · Dystrybutor</div>
    <div class="cover-brand">Ziomek Fish Sp. z o.o.</div>
    <div>ul. Szczęsna 26 · 02-454 Warszawa</div>
    <div>NIP 5223239864 · KRS 0001000146</div>
  </div>
</div>
"""

# About
about_html = """
<h2>Dlaczego Czudowa Marka</h2>
<ul class="manifest">
  <li><b>Polski importer</b> · cła i VAT opłacone w PL, towar gotowy do dostawy z magazynu Warszawa.</li>
  <li><b>Czyste etykiety</b> · klasyczne receptury bez sztucznych barwników. Buraki gotowane sterylizowane — jeden składnik.</li>
  <li><b>Hurtowe formaty</b> · 3000 g wiadra dla gastronomii, 900 g i 1000 g do dystrybucji detalicznej.</li>
  <li><b>Paletowa logistyka</b> · 125–432 szt./paleta zależnie od formatu. Mix SKU w obrębie palety dozwolony.</li>
  <li><b>Stabilna dostępność</b> · cold-storage Warszawa, dostawa w 24–72 h, cała Polska.</li>
  <li><b>Termin przydatności do 90 dni</b> dla kiszonek z kapusty. Dokumentacja HACCP i protokoły badań na życzenie.</li>
  <li><b>VAT 5%</b> PKWiU 10.39.17.0 · faktura wystawiana w dniu wysyłki.</li>
</ul>

<div class="stats">
  <div class="stat"><span class="num">16</span><span class="lbl">SKU</span></div>
  <div class="stat"><span class="num">4</span><span class="lbl">kategorie</span></div>
  <div class="stat"><span class="num">90</span><span class="lbl">dni · kiszonki</span></div>
  <div class="stat"><span class="num">125–432</span><span class="lbl">szt./paleta</span></div>
  <div class="stat"><span class="num">5%</span><span class="lbl">VAT</span></div>
</div>
"""

# Category page
def cat_page(name, desc, items):
    sku_list = ''.join(f'<li><span class="lp">{lp:02d}</span> {next(s[1] for s in SKU_DATA if s[0]==lp)} <span class="gram">· {next(s[3] for s in SKU_DATA if s[0]==lp)}</span></li>' for lp in items)
    return f"""
<div class="cat-page">
  <div class="cat-mark">Kategoria</div>
  <h2 class="cat-title">{name}</h2>
  <p class="cat-desc">{desc}</p>
  <div class="cat-count">{len(items)} SKU</div>
  <ul class="cat-list">{sku_list}</ul>
</div>
"""

# SKU page
def sku_page(lp, name, kat, gram, ean, szt, pal, term, sklad):
    photo_path = os.path.join(PHOTO_DIR, f'sku-{lp:02d}.jpg')
    photo_data = img_b64(photo_path)
    photo_html = (
        f'<img src="{photo_data}" alt="{name}" />'
        if photo_data
        else '<div class="no-photo"><span>Foto w przygotowaniu</span></div>'
    )
    anchor = ' anchor' if lp == 13 else ''
    badges = []
    if lp == 13: badges.append(('ANCHOR', 'priority-badge'))
    badges.append(('POLSKI<br>IMPORTER', 'badge'))
    badges.append(('CLEAN<br>LABEL', 'badge') if lp in (1,13) else ('VAT 5%', 'badge'))
    badges.append((term.replace(' dni','<br>DNI'), 'badge'))
    badge_html = ''.join(f'<div class="{c}">{b}</div>' for b, c in badges)
    
    return f"""
<div class="sku-page{anchor}">
  <div class="sku-head">
    <div class="sku-kat">{kat}</div>
    <div class="sku-lp">Lp. {lp:02d}</div>
  </div>
  <div class="sku-body">
    <div class="sku-photo">{photo_html}</div>
    <div class="sku-info">
      <h2 class="sku-name">{name}</h2>
      <div class="sku-gram">{gram}</div>
      <div class="sku-badges">{badge_html}</div>
    </div>
  </div>
  <table class="sku-spec">
    <tr><th>Gramatura</th><td>{gram}</td></tr>
    <tr><th>EAN opak. jednostkowego</th><td>{ean}</td></tr>
    <tr><th>Sztuk w opak. zbiorczym</th><td>{szt}</td></tr>
    <tr><th>Paletyzacja</th><td>{pal} szt./paleta</td></tr>
    <tr><th>Okres przydatności</th><td>{term} · 0 °C do +8 °C</td></tr>
    <tr><th>VAT</th><td>5% (PKWiU 10.39.17.0)</td></tr>
    <tr><th class="span2">Skład</th></tr>
    <tr><td class="span2 sklad">{sklad}</td></tr>
  </table>
</div>
"""

# Back cover
back_html = """
<div class="back">
  <div class="back-mark">CZUDOWA MARKA · 2026</div>
  <h2>Kontakt handlowy</h2>
  <div class="contact-card">
    <div class="contact-name">Vadym Rotai</div>
    <div class="contact-role">Sprzedaż B2B · Czudowa Marka PL</div>
    <div class="contact-line"><b>Telefon</b> +48 733 050 568</div>
    <div class="contact-line"><b>E-mail</b> ziomekhurt@gmail.com</div>
    <div class="contact-line"><b>Godziny</b> Pon. — Pt. · 9:00 — 17:00</div>
  </div>
  <div class="firm-card">
    <b>Ziomek Fish Spółka z o.o.</b><br>
    <b>Siedziba</b> ul. Szczęsna 26 · 02-454 Warszawa<br>
    <b>Magazyn · odbiór własny</b> ul. Marywilska 26 · 03-228 Warszawa<br>
    <b>NIP</b> 5223239864 · <b>KRS</b> 0001000146<br>
    <b>VAT</b> 5% PKWiU 10.39.17.0
  </div>
  <div class="cennik-note">
    <b>Aktualne ceny</b> · Cennik B2B 01/2026 — wysyłany na żądanie<br>
    <b>Próbki · degustacja</b> · Dostępne dla nowych klientów po telefonicznym potwierdzeniu<br>
    <b>Dokumentacja</b> · HACCP · protokoły badań · świadectwa pochodzenia
  </div>
  <div class="back-foot">
    Wersja katalogu: 22.05.2026 · Niniejszy katalog nie zawiera cen — patrz osobny cennik.
  </div>
</div>
"""

# Assemble pages
pages = []
pages.append(html_page(cover_html, 'page cover'))
pages.append(html_page(about_html, 'page about'))
for cat_name, cat_desc, item_lps in CATS:
    pages.append(html_page(cat_page(cat_name, cat_desc, item_lps), 'page cat'))
    for lp in item_lps:
        sku = next(s for s in SKU_DATA if s[0] == lp)
        pages.append(html_page(sku_page(*sku), 'page sku'))
pages.append(html_page(back_html, 'page back'))

body = '\n'.join(pages)

# ─── CSS ───────────────────────────────────────────────────────
css = """
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { font-family: 'Helvetica', 'Arial', sans-serif; color: #1a2438; font-size: 11pt; line-height: 1.45; }
.page { width: 210mm; height: 297mm; padding: 18mm; page-break-after: always; position: relative; }
.page:last-of-type { page-break-after: avoid; }

/* ─── COVER ─── */
.cover { background: #1a2438; color: white; padding: 22mm; }
.cover-inner { height: 100%; display: flex; flex-direction: column; }
.cover-mark { font-size: 10pt; letter-spacing: 0.3em; color: #c5cdd9; }
.cover-title { font-size: 38pt; line-height: 1.1; font-weight: 800; margin-top: 30mm; color: white; }
.cover-title .year { color: #d4a437; font-weight: 300; font-size: 56pt; display: inline-block; margin-top: 4mm; }
.cover-tagline { font-size: 14pt; color: #c5cdd9; margin-top: 12mm; line-height: 1.35; font-weight: 300; }
.cover-foot { margin-top: auto; font-size: 9pt; color: #c5cdd9; border-top: 1px solid #3a4458; padding-top: 6mm; }
.cover-brand { font-size: 11pt; color: white; font-weight: 600; margin-top: 2mm; }

/* ─── ABOUT ─── */
.about h2 { font-size: 22pt; color: #1a2438; margin-bottom: 8mm; font-weight: 700; }
.manifest { list-style: none; }
.manifest li { padding: 4mm 0; border-bottom: 1px solid #e3e7ec; font-size: 11pt; line-height: 1.5; }
.manifest li b { color: #1a2438; font-weight: 600; }
.stats { display: flex; flex-wrap: wrap; gap: 6mm; margin-top: 12mm; padding-top: 8mm; border-top: 2px solid #1a2438; }
.stat { flex: 1; min-width: 32mm; text-align: center; padding: 5mm 2mm; background: #f5f7fa; border-radius: 2mm; }
.stat .num { display: block; font-size: 24pt; font-weight: 700; color: #1a2438; }
.stat .lbl { display: block; font-size: 9pt; color: #6e7888; margin-top: 1mm; letter-spacing: 0.05em; text-transform: uppercase; }

/* ─── CATEGORY PAGE ─── */
.cat { background: #f5f7fa; }
.cat-page { height: 100%; display: flex; flex-direction: column; }
.cat-mark { font-size: 9pt; letter-spacing: 0.3em; color: #6e7888; text-transform: uppercase; }
.cat-title { font-size: 28pt; color: #1a2438; margin-top: 4mm; font-weight: 800; }
.cat-desc { font-size: 12pt; color: #3a4458; margin-top: 8mm; max-width: 130mm; line-height: 1.5; }
.cat-count { font-size: 18pt; color: #d4a437; margin-top: 10mm; font-weight: 700; }
.cat-list { list-style: none; margin-top: 8mm; }
.cat-list li { padding: 3mm 0; border-bottom: 1px solid #d6dde6; font-size: 11pt; color: #1a2438; }
.cat-list .lp { display: inline-block; width: 10mm; font-weight: 700; color: #d4a437; }
.cat-list .gram { color: #6e7888; font-size: 10pt; }

/* ─── SKU PAGE ─── */
.sku-page { display: flex; flex-direction: column; height: 100%; }
.sku-head { display: flex; justify-content: space-between; padding-bottom: 4mm; border-bottom: 2px solid #1a2438; }
.sku-kat { font-size: 9pt; letter-spacing: 0.2em; color: #6e7888; text-transform: uppercase; font-weight: 600; }
.sku-lp { font-size: 9pt; color: #6e7888; font-weight: 600; }
.sku-body { display: flex; gap: 6mm; margin-top: 6mm; flex: 0 0 auto; }
.sku-photo { flex: 0 0 95mm; height: 95mm; background: #f5f7fa; border: 1px solid #e3e7ec; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.sku-photo img { max-width: 100%; max-height: 100%; object-fit: contain; }
.no-photo { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #a0a8b8; font-size: 11pt; font-style: italic; }
.sku-info { flex: 1; display: flex; flex-direction: column; }
.sku-name { font-size: 20pt; line-height: 1.2; color: #1a2438; font-weight: 700; }
.sku-gram { font-size: 13pt; color: #d4a437; margin-top: 2mm; font-weight: 600; }
.sku-badges { margin-top: auto; display: flex; gap: 2mm; padding-top: 4mm; flex-wrap: wrap; }
.badge, .priority-badge { font-size: 8pt; line-height: 1.1; padding: 2mm; min-width: 18mm; text-align: center; border: 1px solid #1a2438; color: #1a2438; font-weight: 700; letter-spacing: 0.05em; }
.priority-badge { background: #d4a437; color: white; border-color: #d4a437; }
.sku-spec { width: 100%; margin-top: 6mm; border-collapse: collapse; font-size: 10pt; }
.sku-spec th, .sku-spec td { padding: 2.5mm 3mm; border-bottom: 1px solid #e3e7ec; text-align: left; vertical-align: top; }
.sku-spec th { width: 55mm; background: #f5f7fa; color: #1a2438; font-weight: 600; font-size: 9.5pt; }
.sku-spec td { color: #3a4458; }
.sku-spec th.span2 { padding-top: 4mm; border-top: 1px solid #1a2438; background: white; }
.sku-spec td.span2 { background: #f5f7fa; }
.sku-spec td.sklad { padding: 3mm; font-size: 9pt; line-height: 1.45; color: #3a4458; }
.sku-page.anchor::before { content: 'PRIORYTET HANDLOWY'; position: absolute; top: 12mm; right: 18mm; background: #d4a437; color: white; font-size: 8pt; padding: 1.5mm 3mm; letter-spacing: 0.15em; font-weight: 700; }

/* ─── BACK COVER ─── */
.back { background: #1a2438; color: white; padding: 22mm; }
.back-mark { font-size: 9pt; letter-spacing: 0.3em; color: #c5cdd9; }
.back h2 { font-size: 26pt; font-weight: 700; color: white; margin-top: 8mm; }
.contact-card { margin-top: 12mm; padding: 8mm; background: rgba(255,255,255,0.06); border-left: 3px solid #d4a437; }
.contact-name { font-size: 18pt; font-weight: 700; color: white; }
.contact-role { font-size: 10pt; color: #c5cdd9; margin-top: 1mm; }
.contact-line { font-size: 11pt; color: #e3e7ec; margin-top: 3mm; }
.contact-line b { color: #d4a437; font-weight: 600; display: inline-block; width: 22mm; font-size: 9pt; letter-spacing: 0.05em; text-transform: uppercase; }
.firm-card { margin-top: 6mm; padding: 6mm; font-size: 10pt; color: #c5cdd9; line-height: 1.7; border: 1px solid #3a4458; }
.firm-card b { color: white; }
.cennik-note { margin-top: 6mm; padding: 6mm; font-size: 10pt; color: #c5cdd9; background: rgba(212,164,55,0.08); border-left: 3px solid #d4a437; line-height: 1.7; }
.cennik-note b { color: white; }
.back-foot { margin-top: auto; padding-top: 8mm; font-size: 8pt; color: #6e7888; text-align: center; position: absolute; bottom: 18mm; left: 22mm; right: 22mm; border-top: 1px solid #3a4458; padding-top: 4mm; }
"""

html_doc = f'<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8"><style>{css}</style></head><body>{body}</body></html>'

out_path = '/sessions/relaxed-festive-thompson/mnt/outputs/CzM_Katalog_2026_DRAFT.pdf'
HTML(string=html_doc).write_pdf(out_path)
print(f'\n✓ Catalog PDF generated: {out_path}')
print(f'Pages estimate: cover + about + 4 categories + 16 SKU + back = ~23 pages')

# Also save HTML for inspection
html_out = '/sessions/relaxed-festive-thompson/mnt/sztab/.cowork-tmp/catalog/draft.html'
with open(html_out, 'w', encoding='utf-8') as f:
    f.write(html_doc)
print(f'HTML source: {html_out}')

# Size
size_mb = os.path.getsize(out_path) / 1024 / 1024
print(f'Size: {size_mb:.2f} MB')
