"""Builds the Family Board Books static site.

python3 src/build.py  ->  dist/  (the real site, for GitHub Pages)
                          preview/ (same, with index.html in the artifact-preview format)
Book data lives in assets/js/data.js; this script mirrors the parts needed for static HTML.
"""
import json, re, shutil, subprocess
from pathlib import Path
from html import escape as e

ROOT = Path(__file__).resolve().parent.parent
DIST, PREVIEW = ROOT / "dist", ROOT / "preview"
SITE = "https://www.familyboardbooks.com"

# Read the catalogue from data.js with node so there is one source of truth.
data = json.loads(subprocess.check_output(["node", "-e", """
global.window = {}; require(process.argv[1]); console.log(JSON.stringify(window.FBB));
""", str(ROOT / "assets/js/data.js")]))
BOOKS, ORDER, CUR = data["books"], data["order"], data["config"]["currency"]
REGIONS = data["regions"]


def money(eur):
    """A euro price that region.js swaps to pounds for UK visitors."""
    return f'<span class="money" data-eur="{eur}">{CUR}{eur}</span>'

FONTS = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Figtree:wght@400;500;600;700&family=Oswald:wght@600&display=swap"


def head(title, desc, path):
    return f"""<title>{e(title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="{e(desc)}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="{SITE}/{path}">
<link rel="canonical" href="{SITE}/{path}">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<link rel="stylesheet" href="assets/css/site.css">
"""


def header(active=""):
    def a(href, label, key):
        cur = ' aria-current="page"' if key == active else ""
        return f'<a href="{href}"{cur}>{label}</a>'
    return f"""<header class="site-head"><div class="wrap">
<a class="logo" href="index.html" aria-label="Family Board Books home"><span class="logo-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>Family Board Books</a>
<nav class="nav" aria-label="Main">{a("index.html#books", "Books", "books")}{a("index.html#how", "How it works", "how")}{a("index.html#pricing", "Pricing", "pricing")}{a("index.html#faq", "FAQ", "faq")}</nav>
<label class="region"><span class="sr-only">Deliver to</span><select class="region-select" aria-label="Deliver to">{''.join(f'<option value="{k}">{e(r["label"])}</option>' for k, r in REGIONS.items())}</select></label>
<a class="btn btn-sm red" href="create.html">Start your book</a>
</div></header>
<p class="region-bar" id="region-bar" role="status" hidden></p>"""


def footer():
    links = "".join(f'<a href="{BOOKS[k]["slug"]}.html">{e(BOOKS[k]["name"])}</a>' for k in ORDER)
    return f"""<footer class="site-foot"><div class="wrap foot-grid">
<div style="display:grid;gap:10px;max-width:360px"><a class="logo" href="index.html"><span class="logo-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>Family Board Books</a>
<p class="small">Personalised board books starring your family, made from your photos. Printed on thick board with rounded corners for little hands.</p></div>
<div style="display:grid;gap:12px"><div class="foot-links">{links}</div>
<div class="foot-links"><a href="create.html">Start your book</a><a href="index.html#faq">FAQ</a><a href="index.html#faq-privacy">Photo privacy</a></div>
<p class="small">&copy; <span data-year>2026</span> Family Board Books &middot; familyboardbooks.com</p></div>
</div></footer>"""


SCRIPTS = '<script src="assets/js/data.js"></script>\n<script src="assets/js/region.js"></script>\n<script src="assets/js/art.js"></script>\n<script src="assets/js/site.js"></script>'


def page(title, desc, path, body, active="", extra_js=""):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{head(title, desc, path)}</head>
<body>
{header(active)}
<main>
{body}
</main>
{footer()}
{SCRIPTS}
{extra_js}
</body>
</html>
"""


# ---------- Home ----------
def home():
    faq = [
        ("How do the cartoon portraits work?", "You upload ordinary family photos. We turn each one into a cartoon in the style you choose, place it on its page, and send you a full preview to approve before anything is printed."),
        ("What happens to my photos?", "Your photos are used only to make your book, and nobody at Family Board Books looks at them unless you ask us for help. Your original photos are deleted once your book is printed. The cartoons and print file are deleted 30 days after delivery, unless you choose to keep them in your account for reorders; you can delete them there at any time. We never use your photos for advertising or to train anything.", "faq-privacy"),
        ("Can I see the book before it is printed?", "Yes. You see every page on screen and can swap photos, names or words. Nothing is printed until you approve it."),
        ("Which languages can I choose?", "English, Spanish, Catalan, French, German, Italian, Portuguese and Dutch. A bilingual edition puts two languages on every page, which is lovely for families who speak more than one at home."),
        ("What age are the books for?", "Babies and toddlers from birth to about four. The pages are thick board with rounded corners, made to be chewed, dropped and read again and again."),
        ("Can we include characters from TV, like Bluey?", "We can't print TV or film characters, because they belong to their creators. You can include your child's own toys and teddies, and they often become the favourite page."),
        ("Where do you deliver?", "We deliver to Spain and the rest of the European Union, with prices in euros. UK delivery is coming soon: choose UK · £ at the top of the page to see prices in pounds and reserve your book. Your UK book will be printed in the UK, so there are no customs charges."),
        ("How long does delivery take?", "We will confirm delivery times when ordering opens. Join the list and founding families will hear first."),
    ]
    faq_html = "".join(
        f'<details{" id=" + chr(34) + q[2] + chr(34) if len(q) > 2 else ""}><summary>{e(q[0])}</summary><p>{e(q[1])}</p></details>' for q in faq)
    options = "".join(f'<option value="{k}">{e(BOOKS[k]["name"])}</option>' for k in ORDER)
    body = f"""
<section class="hero"><div class="wrap hero-grid">
<h1 class="wordmark">Family Board Books</h1>
<div class="hero-sub">
<p class="lede">Personalised board books starring the people your little one loves most, made from your own photos.</p>
<div class="hero-cta"><a class="btn red" href="create.html">Start your book</a><a class="btn ghost" href="#styles">See the styles</a></div>
</div></div></section>

<section id="books" class="shelf-wrap" aria-label="Choose a book"><div class="wrap">
<div class="shelf-bar"><p class="eyebrow">Choose a book</p>
<div class="shelf-arrows"><button class="arrow" id="shelf-prev" type="button" aria-label="Previous books">&larr;</button><button class="arrow" id="shelf-next" type="button" aria-label="More books">&rarr;</button></div></div>
<div class="shelf" id="shelf" tabindex="0" aria-label="Book themes, scroll sideways"></div>
</div></section>

<section id="styles" class="section"><div class="wrap demo">
<div class="demo-stage" id="demo-stage" aria-live="polite"></div>
<div><div class="sec-head" style="margin-bottom:0"><p class="eyebrow">Four art styles</p><h2>Your family, drawn the way you like</h2>
<p class="lede">Every photo becomes a cartoon portrait in one consistent style, so Grandpa, the cousins and the dog all belong on the same page.</p></div>
<div class="style-tabs" id="style-tabs"></div></div>
</div></section>

<section id="how" class="section" style="padding-top:0"><div class="wrap">
<div class="sec-head"><p class="eyebrow">How it works</p><h2>Ready in three steps</h2></div>
<div class="steps">
<div class="step"><h3>Choose a book and a style</h3><p>Pick ABC, numbers, colours, feelings, family or sayings, then choose how the pictures should look.</p></div>
<div class="step"><h3>Add names and photos</h3><p>Fill in each page with the people, places and words that matter to you. Phone photos work well.</p></div>
<div class="step"><h3>Approve, then we print</h3><p>We turn the photos into cartoons and show you every page. Once you approve, we print and post your board book.</p></div>
</div></div></section>

<section class="section" style="padding-top:0"><div class="wrap">
<div class="sec-head"><p class="eyebrow">Why families choose us</p><h2>The book they'll ask for every night</h2></div>
<div class="why">
<div class="why-item"><h3>Made for little hands</h3><p>Thick board pages with rounded corners survive chewing, dropping and a hundred bedtimes.</p></div>
<div class="why-item"><h3>The whole family</h3><p>Not just your child. Grandparents, cousins, friends, pets and favourite places all get a page.</p></div>
<div class="why-item"><h3>Any language, or two</h3><p>Choose from eight languages, or a bilingual edition for families who speak more than one.</p></div>
<div class="why-item"><h3>Copies for grandparents</h3><p>Add extra copies of the same book from {money(25)}, so faraway family can read along.</p></div>
</div></div></section>

<section id="pricing" class="section" style="padding-top:0"><div class="wrap">
<div class="sec-head"><p class="eyebrow">Pricing</p><h2>Launch prices</h2><p class="lede">Every book includes the cartoon portraits, a dedication page and a cover with your child's name.</p></div>
<div class="table-wrap"><table><thead><tr><th>Book</th><th>Pages</th><th>From</th><th>Extra copy</th><th>Ages</th></tr></thead><tbody id="price-rows"></tbody></table></div>
<p class="note">Bilingual edition +{money(6)}. Gift box +{money(5)}. Shipping is shown at checkout.</p>
</div></section>

<section id="faq" class="section" style="padding-top:0"><div class="wrap">
<div class="sec-head"><p class="eyebrow">Questions</p><h2>Good to know</h2></div>
<div class="faq">{faq_html}</div></div></section>

<section class="section" style="padding-top:0"><div class="wrap">
<div class="band" id="join">
<div style="display:grid;gap:14px"><p class="eyebrow" style="color:#CFCADE">Founding families</p><h2>Be first to order, and get 15% off</h2><p>Ordering opens soon. Join the list and we'll send you a 15% founding-family discount for your first book.</p></div>
<form class="form" data-signup="waitlist" novalidate>
<div class="field"><label for="w-email" style="color:#fff">Email</label><div class="form-row"><input id="w-email" name="email" type="email" autocomplete="email" placeholder="name@example.com" required><button class="btn red" type="submit">Join the list</button></div></div>
<div class="field"><label for="w-book" style="color:#fff">Which book are you most excited about?</label><select id="w-book" name="book">{options}</select></div>
<p class="form-msg" role="status" style="color:#fff"></p>
</form></div></div></section>
"""
    return page("Family Board Books", "Personalised board books starring your family. Upload photos, choose a style, and we turn them into a cartoon ABC, numbers, colours or feelings book.", "", body, "books")


# ---------- Book pages ----------
def book(k):
    b = BOOKS[k]
    inside = "".join(f"<li>{e(x)}</li>" for x in b["inside"])
    eds = ""
    for ed in b["editions"]:
        feat = " featured" if ed.get("badge") else ""
        badge = f'<span class="badge">{e(ed["badge"])}</span>' if ed.get("badge") else ""
        if ed.get("isCopy"):
            cta = f'<a class="btn ghost" href="create.html?book={k}">Add when you order</a>'
        else:
            cta = f'<a class="btn{" red" if feat else ""}" href="create.html?book={k}&amp;edition={ed["id"]}">Choose {e(ed["name"])}</a>'
        eds += f"""<div class="edition{feat}">{badge}<h3>{e(ed["name"])}</h3><p class="muted">{e(ed["pages"])} &middot; {e(ed["detail"])}</p><p class="amt">{money(ed["price"])}{" <small>each</small>" if ed.get("isCopy") else ""}</p>{cta}</div>"""
    others = "".join(
        f'<a class="tcard t-{BOOKS[o]["color"]}" href="{BOOKS[o]["slug"]}.html"><div class="glyph" data-glyph="{BOOKS[o]["glyph"]}"></div><h3>{e(BOOKS[o]["short"])}</h3><p>{e(BOOKS[o]["tagline"])}</p></a>'
        for o in ORDER if o != k)
    body = f"""
<div class="wrap crumbs"><a href="index.html#books">All books</a> / {e(b["name"])}</div>
<section class="wrap bhero" style="--bc:var(--{b["color"]})">
<div class="bhero-copy">
<h1>{e(b["name"])}</h1>
<p class="lede">{e(b["blurb"])}</p>
<div class="bhero-meta"><span class="chip">Ages {e(b["ages"])}</span><span class="chip">From {money(min(x["price"] for x in b["editions"] if not x.get("isCopy")))}</span><span class="chip">Thick board pages</span></div>
<div class="hero-cta"><a class="btn red" href="create.html?book={k}">Start your {e(b["short"]) if k != "family" else "family"} book</a><a class="btn ghost" href="#editions">See prices</a></div>
</div>
<div class="stack" data-samples="{k}" data-max="2" data-style="splash"></div>
</section>

<section class="section" style="--bc:var(--{b["color"]});padding-top:24px"><div class="wrap">
<div class="sec-head"><p class="eyebrow">Example pages</p><h2>{e(b["tagline"])}</h2><p class="lede">These pages use our illustrations. Yours will show your own family, drawn from your photos.</p></div>
<div class="samples" data-samples="{k}" data-style="splash"></div>
</div></section>

<section class="section" style="--bc:var(--{b["color"]});padding-top:0"><div class="wrap">
<div class="sec-head"><p class="eyebrow">What's inside</p><h2>Every {e(b["name"])} book has</h2></div>
<ul class="inside">{inside}</ul></div></section>

<section id="editions" class="section" style="--bc:var(--{b["color"]});padding-top:0"><div class="wrap">
<div class="sec-head"><p class="eyebrow">Editions and prices</p><h2>Choose your edition</h2></div>
<div class="editions">{eds}</div>
<div class="opts">
<div class="opt"><h3>Four art styles</h3><p>Paint Splash, Watercolour, Comic Pop or Storybook. You choose when you start.</p></div>
<div class="opt"><h3>Bilingual edition +{money(6)}</h3><p>Two languages on every page, from English, Spanish, Catalan, French, German, Italian, Portuguese and Dutch.</p></div>
<div class="opt"><h3>Gift box +{money(5)}</h3><p>A keepsake box with a ribbon, ready to give to grandparents.</p></div>
</div></div></section>

<section class="section" style="padding-top:0"><div class="wrap">
<div class="sec-head"><p class="eyebrow">More books</p><h2>Make a set</h2></div>
<div class="shelf">{others}</div></div></section>
"""
    js = """<script>document.querySelectorAll('[data-glyph]').forEach(function(el){el.innerHTML=FBB.glyph(el.dataset.glyph);});</script>"""
    title = f"{b['name']} Board Book"
    return page(title, f"{b['name']}: {b['tagline']} A personalised board book made from your family photos. From {CUR}{min(x['price'] for x in b['editions'] if not x.get('isCopy'))}.", f"{b['slug']}.html", body, "books", js)


# ---------- Creator ----------
def creator():
    body = """
<div class="wrap creator">
<div>
<p class="eyebrow" style="padding-top:20px">Make your book</p>
<ol class="stepper" id="stepper"></ol>
<div id="panels"></div>
</div>
<aside class="summary" id="summary" aria-label="Your book"></aside>
</div>
"""
    js = '<script src="assets/js/shop.js"></script>\n<script src="assets/js/create.js"></script>'
    return page("Make Your Book", "Create a personalised family board book: choose a book, an art style, then add names and photos for every page.", "create.html", body, "", js)


FAVICON = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="1" y="1" width="14" height="14" rx="4" fill="#EE4B2B"/><rect x="17" y="1" width="14" height="14" rx="4" fill="#FFC21A"/><rect x="1" y="17" width="14" height="14" rx="4" fill="#16A6E3"/><rect x="17" y="17" width="14" height="14" rx="4" fill="#1FB45A"/></svg>"""


def to_preview(html):
    """Artifact previews wrap the page in their own skeleton: keep only head contents + body."""
    head_inner = re.search(r"<head>(.*)</head>", html, re.S).group(1)
    head_inner = re.sub(r'<meta charset[^>]*>\n|<meta name="viewport"[^>]*>\n', "", head_inner)
    body_inner = re.search(r"<body>(.*)</body>", html, re.S).group(1)
    return head_inner + body_inner


def main():
    for d in (DIST, PREVIEW):
        if d.exists():
            shutil.rmtree(d)
        shutil.copytree(ROOT / "assets", d / "assets")
        (d / "assets/favicon.svg").write_text(FAVICON)
    pages = {"index.html": home(), "create.html": creator()}
    for k in ORDER:
        pages[f"{BOOKS[k]['slug']}.html"] = book(k)
    for name, html in pages.items():
        (DIST / name).write_text(html)
        (PREVIEW / name).write_text(to_preview(html) if name == "index.html" else html)
    (DIST / "CNAME").write_text("www.familyboardbooks.com\n")
    (DIST / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n")
    urls = "".join(f"<url><loc>{SITE}/{'' if n == 'index.html' else n}</loc></url>" for n in pages)
    (DIST / "sitemap.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>\n')
    print("built", len(pages), "pages")


if __name__ == "__main__":
    main()
