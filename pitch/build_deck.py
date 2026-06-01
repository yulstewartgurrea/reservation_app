"""
Generate the BookMe investor pitch deck (.pptx).

Run:  python3 pitch/build_deck.py
Out:  pitch/BookMe_Pitch_Deck.pptx
"""
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Inches, Pt, Emu


# -- design tokens ------------------------------------------------------------
INK         = RGBColor(0x0F, 0x17, 0x2A)   # near-black
INK_SOFT    = RGBColor(0x47, 0x55, 0x69)   # slate
MUTED       = RGBColor(0x94, 0xA3, 0xB8)   # gray
BG          = RGBColor(0xFB, 0xFA, 0xF7)   # off-white
ACCENT      = RGBColor(0xE0, 0x47, 0x3C)   # warm coral (booking-app feel)
ACCENT_SOFT = RGBColor(0xFC, 0xE7, 0xE3)
LINE        = RGBColor(0xE2, 0xE8, 0xF0)

SLIDE_W, SLIDE_H = Inches(13.333), Inches(7.5)   # 16:9


def new_deck() -> Presentation:
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H
    return prs


def blank(prs):
    return prs.slides.add_slide(prs.slide_layouts[6])


def fill(shape, rgb):
    shape.fill.solid()
    shape.fill.fore_color.rgb = rgb
    shape.line.fill.background()


def add_rect(slide, x, y, w, h, rgb):
    s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, h)
    fill(s, rgb)
    return s


def add_text(slide, x, y, w, h, text, *, size=18, bold=False, color=INK,
             align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, font="Calibri"):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = 0
    tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    lines = text.split("\n") if isinstance(text, str) else text
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        run = p.add_run()
        run.text = line
        run.font.name = font
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = color
    return tb


def add_bullets(slide, x, y, w, h, items, *, size=18, color=INK, gap=6):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = 0
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(gap)
        run = p.add_run()
        run.text = f"•   {item}"
        run.font.name = "Calibri"
        run.font.size = Pt(size)
        run.font.color.rgb = color
    return tb


def page_chrome(slide, num, total, kicker=""):
    # left accent stripe
    add_rect(slide, Emu(0), Emu(0), Inches(0.18), SLIDE_H, ACCENT)
    # footer
    add_text(slide, Inches(0.6), Inches(7.05), Inches(8), Inches(0.3),
             f"BookMe · Investor deck · May 2026",
             size=10, color=MUTED)
    add_text(slide, Inches(12.0), Inches(7.05), Inches(1.0), Inches(0.3),
             f"{num} / {total}", size=10, color=MUTED, align=PP_ALIGN.RIGHT)
    if kicker:
        add_text(slide, Inches(0.6), Inches(0.45), Inches(6), Inches(0.3),
                 kicker.upper(), size=11, bold=True, color=ACCENT)


def section_title(slide, title, subtitle=None):
    add_text(slide, Inches(0.6), Inches(0.85), Inches(12), Inches(0.9),
             title, size=36, bold=True, color=INK)
    if subtitle:
        add_text(slide, Inches(0.6), Inches(1.6), Inches(12), Inches(0.6),
                 subtitle, size=16, color=INK_SOFT)


def divider(slide, y=Inches(2.25)):
    add_rect(slide, Inches(0.6), y, Inches(1.0), Emu(28000), ACCENT)


# -- slides -------------------------------------------------------------------
def slide_cover(prs, num, total):
    s = blank(prs)
    add_rect(s, Emu(0), Emu(0), SLIDE_W, SLIDE_H, BG)
    # big accent block on the right
    add_rect(s, Inches(8.6), Emu(0), SLIDE_W - Inches(8.6), SLIDE_H, ACCENT)
    add_text(s, Inches(9.0), Inches(0.5), Inches(4), Inches(0.4),
             "BOOKME", size=12, bold=True, color=BG)

    add_text(s, Inches(0.9), Inches(2.6), Inches(8), Inches(1.0),
             "BookMe", size=72, bold=True, color=INK)
    add_text(s, Inches(0.9), Inches(3.7), Inches(8), Inches(0.6),
             "Reservations for every local service in the Philippines.",
             size=22, color=INK_SOFT)
    add_rect(s, Inches(0.9), Inches(4.55), Inches(0.8), Emu(38000), ACCENT)
    add_text(s, Inches(0.9), Inches(4.75), Inches(8), Inches(0.6),
             "Investor deck · Seed round · May 2026",
             size=14, color=INK_SOFT)

    add_text(s, Inches(9.0), Inches(6.6), Inches(4), Inches(0.4),
             "bookme.ph", size=12, color=BG, align=PP_ALIGN.RIGHT)


def slide_problem(prs, num, total):
    s = blank(prs); page_chrome(s, num, total, "Problem")
    section_title(
        s,
        "Booking a local service in PH is still a DM and a prayer.",
        "Customers chase shops on Messenger and Instagram. Shops drown in DMs, no-shows, and a notebook for a schedule."
    )
    divider(s)

    pains = [
        ("For customers",
         ["Hours wasted DM'ing to find an open slot",
          "No upfront pricing, no reviews, no reminders",
          "No way to discover new shops outside your feed"]),
        ("For shop owners",
         ["Bookings scattered across Messenger, IG, calls, walk-ins",
          "10–20% no-show rates with zero accountability",
          "No analytics — every owner re-invents a spreadsheet"]),
        ("For the market",
         ["Global tools (Booksy, Fresha) ignore PH payment + culture",
          "Local tools are single-vertical (salon-only, clinic-only)",
          "GCash/Maya checkout is now expected — not optional"]),
    ]
    col_w = Inches(4.0); gap = Inches(0.25); x0 = Inches(0.6); y = Inches(2.55)
    for i, (h, items) in enumerate(pains):
        x = x0 + (col_w + gap) * i
        card = add_rect(s, x, y, col_w, Inches(4.1), BG)
        card.line.color.rgb = LINE
        card.line.width = Pt(0.75)
        add_text(s, x + Inches(0.3), y + Inches(0.25), col_w - Inches(0.6),
                 Inches(0.4), h, size=16, bold=True, color=ACCENT)
        add_bullets(s, x + Inches(0.3), y + Inches(0.85),
                    col_w - Inches(0.6), Inches(3.0), items, size=14)


def slide_solution(prs, num, total):
    s = blank(prs); page_chrome(s, num, total, "Solution")
    section_title(
        s,
        "One platform. Every service. Discover → book → pay → review.",
        "BookMe is the OpenTable-meets-Booksy of the Philippines — multi-vertical, mobile-first, PayMongo-native."
    )
    divider(s)

    steps = [
        ("1  Discover",
         "Find a haircut, spa, car wash or repair near you. Geolocation + filters + ratings."),
        ("2  Book",
         "Real-time availability with double-booking prevention. Pick service, staff, slot."),
        ("3  Pay",
         "Pay on arrival by default. Online via GCash / GrabPay / Maya / cards through PayMongo."),
        ("4  Show up",
         "Email + in-app reminders. Strike system keeps no-shows accountable without fees."),
        ("5  Review",
         "Verified reviews tied to completed bookings. Shops reply. Customers re-book favorites."),
    ]
    y = Inches(2.55); h = Inches(0.78); w = Inches(12.1); x = Inches(0.6)
    for i, (title, body) in enumerate(steps):
        row_y = y + h * i + Emu(60000) * i
        card = add_rect(s, x, row_y, w, h, BG)
        card.line.color.rgb = LINE; card.line.width = Pt(0.5)
        add_rect(s, x, row_y, Inches(0.18), h, ACCENT)
        add_text(s, x + Inches(0.5), row_y + Inches(0.12), Inches(2.4),
                 Inches(0.55), title, size=17, bold=True, color=INK,
                 anchor=MSO_ANCHOR.MIDDLE)
        add_text(s, x + Inches(3.0), row_y + Inches(0.12), w - Inches(3.2),
                 Inches(0.55), body, size=15, color=INK_SOFT,
                 anchor=MSO_ANCHOR.MIDDLE)


def slide_product(prs, num, total):
    s = blank(prs); page_chrome(s, num, total, "Product")
    section_title(
        s,
        "Three apps, one platform.",
        "Built end-to-end: Django + DRF + Channels backend, Next.js 15 PWA frontend, real-time WebSockets, PayMongo payments."
    )
    divider(s)

    cards = [
        ("Customer",
         ["Geolocation “near me” + filters",
          "Real-time slot picker",
          "Pay on arrival or online (PayMongo)",
          "Reviews, favorites, calendar export",
          "Chat with shop in real time"]),
        ("Shop owner",
         ["Multi-shop dashboard",
          "Services, staff, hours, holiday overrides",
          "Walk-in & manual bookings",
          "Live booking pings (WebSocket)",
          "Revenue + no-show analytics"]),
        ("Admin",
         ["Shop approval queue",
          "Commission ledger + monthly settlement",
          "Strike & restriction oversight",
          "Category management",
          "Platform-wide health view"]),
    ]
    col_w = Inches(4.0); gap = Inches(0.25); x0 = Inches(0.6); y = Inches(2.55)
    for i, (h, items) in enumerate(cards):
        x = x0 + (col_w + gap) * i
        card = add_rect(s, x, y, col_w, Inches(4.1), BG)
        card.line.color.rgb = LINE; card.line.width = Pt(0.75)
        add_rect(s, x, y, col_w, Inches(0.55), ACCENT_SOFT)
        add_text(s, x + Inches(0.3), y + Inches(0.1), col_w - Inches(0.6),
                 Inches(0.4), h, size=17, bold=True, color=ACCENT)
        add_bullets(s, x + Inches(0.3), y + Inches(0.8),
                    col_w - Inches(0.6), Inches(3.2), items, size=14)


def slide_market(prs, num, total):
    s = blank(prs); page_chrome(s, num, total, "Market")
    section_title(
        s,
        "The Philippines spends on services every weekend.",
        "Seven verticals. One booking layer. Bottom-up rollout by city."
    )
    divider(s)

    # TAM / SAM / SOM cards
    boxes = [
        ("TAM", "₱ 380 B+",
         "Annual PH spend on personal & local services (hair, spa, auto, repair, pet, fitness, home)."),
        ("SAM", "₱ 95 B",
         "Bookable services in urban PH (Metro Manila, Cebu, Davao) within smartphone-first segments."),
        ("SOM (3 yr)", "₱ 3.2 B GMV",
         "10k active shops × ~₱320k annual bookings each at 8% take rate → ₱ 256M ARR."),
    ]
    col_w = Inches(4.0); gap = Inches(0.25); x0 = Inches(0.6); y = Inches(2.55)
    for i, (label, value, body) in enumerate(boxes):
        x = x0 + (col_w + gap) * i
        card = add_rect(s, x, y, col_w, Inches(3.2), BG)
        card.line.color.rgb = LINE; card.line.width = Pt(0.75)
        add_text(s, x + Inches(0.3), y + Inches(0.25), col_w, Inches(0.4),
                 label, size=12, bold=True, color=ACCENT)
        add_text(s, x + Inches(0.3), y + Inches(0.7), col_w, Inches(0.9),
                 value, size=36, bold=True, color=INK)
        add_text(s, x + Inches(0.3), y + Inches(1.85), col_w - Inches(0.6),
                 Inches(1.2), body, size=13, color=INK_SOFT)

    add_text(
        s, Inches(0.6), Inches(6.05), Inches(12.1), Inches(0.5),
        "Tailwinds:  GCash/Maya are now universal  ·  53M Filipinos on social commerce  ·  Post-COVID services rebound  ·  No PH-native multi-vertical incumbent.",
        size=13, color=INK_SOFT,
    )


def slide_business_model(prs, num, total):
    s = blank(prs); page_chrome(s, num, total, "Business model")
    section_title(
        s,
        "Commission-first. Shop pays only when BookMe drives revenue.",
        "Aligned incentives: walk-ins are free, completed online bookings pay a take rate."
    )
    divider(s)

    add_text(s, Inches(0.6), Inches(2.55), Inches(7.5), Inches(0.5),
             "How we earn", size=18, bold=True, color=INK)
    add_bullets(s, Inches(0.6), Inches(3.05), Inches(7.5), Inches(3.5), [
        "8–12% take rate on completed online reservations.",
        "Free for shops to list and to take walk-ins (CommissionLedger excludes walk-ins).",
        "Platform collects via PayMongo, settles to shops monthly off-platform.",
        "Per-shop commission override unlocks promotional partnerships.",
    ], size=15, color=INK_SOFT)

    add_text(s, Inches(8.2), Inches(2.55), Inches(4.5), Inches(0.5),
             "Future revenue lines", size=18, bold=True, color=INK)
    add_bullets(s, Inches(8.2), Inches(3.05), Inches(4.5), Inches(3.5), [
        "SMS / WhatsApp reminder credits (pass-through + markup).",
        "Featured placement & category sponsorships.",
        "Premium shop tier: analytics, staff payroll, marketing tools.",
        "Deposits + customer-initiated refund fees (Phase 3).",
    ], size=15, color=INK_SOFT)


def slide_traction(prs, num, total):
    s = blank(prs); page_chrome(s, num, total, "Traction")
    section_title(
        s,
        "The product is built, deployed, and ready to onboard shops.",
        "Phase 1 + Phase 2 complete. Phase 3 well underway. Live on AWS today."
    )
    divider(s)

    stats = [
        ("Endpoints shipped", "60+"),
        ("Test coverage areas", "Booking, payments, commission, chat, strikes"),
        ("Verticals supported", "7"),
        ("Time-to-book", "< 60 sec"),
    ]
    x = Inches(0.6); y = Inches(2.55); w = Inches(2.95); gap = Inches(0.15)
    for i, (label, value) in enumerate(stats):
        cx = x + (w + gap) * i
        card = add_rect(s, cx, y, w, Inches(1.6), ACCENT_SOFT)
        card.line.fill.background()
        add_text(s, cx + Inches(0.25), y + Inches(0.2), w, Inches(0.4),
                 label, size=11, bold=True, color=ACCENT)
        add_text(s, cx + Inches(0.25), y + Inches(0.55), w - Inches(0.5),
                 Inches(1.0), value, size=22, bold=True, color=INK)

    add_text(s, Inches(0.6), Inches(4.45), Inches(12), Inches(0.5),
             "Built and live", size=18, bold=True, color=INK)
    add_bullets(s, Inches(0.6), Inches(4.95), Inches(12), Inches(2.0), [
        "End-to-end booking lifecycle: discovery → booking → confirmation → reminders → review.",
        "Online payments via PayMongo (GCash / GrabPay / Maya / cards) with signed webhooks and shop-owner refunds.",
        "Real-time chat with typing indicators and online presence, customer↔shop, on the existing Channels stack.",
        "AWS staging running on CloudFront → S3 + VPC origin → ALB → ECS · Celery + Redis + Postgres.",
        "Admin dashboard with shop approval queue and commission ledger summary.",
    ], size=14, color=INK_SOFT)


def slide_competition(prs, num, total):
    s = blank(prs); page_chrome(s, num, total, "Competition")
    section_title(
        s,
        "Global incumbents are not PH-tuned. Local tools are single-vertical.",
        "BookMe wins on three axes: payments, breadth, and policy fit."
    )
    divider(s)

    headers = ["", "Multi-vertical", "PayMongo / GCash", "PH cancellation policy", "Walk-in support"]
    rows = [
        ("BookMe",   "✅", "✅", "✅", "✅"),
        ("Booksy",   "Hair/beauty only", "Card only", "Global default", "Limited"),
        ("Fresha",   "Hair/beauty only", "Card only", "Global default", "Limited"),
        ("Setmore",  "Generic, no PH UX", "Card only", "❌", "❌"),
        ("Messenger / IG DM", "✅ by accident", "❌", "❌", "Manual"),
    ]
    x0 = Inches(0.6); y0 = Inches(2.55)
    col_widths = [Inches(2.6), Inches(2.4), Inches(2.4), Inches(2.4), Inches(2.3)]
    # header
    cx = x0
    for i, h in enumerate(headers):
        if i == 0:
            cx += col_widths[i]; continue
        add_text(s, cx, y0, col_widths[i], Inches(0.4),
                 h, size=12, bold=True, color=ACCENT, align=PP_ALIGN.CENTER)
        cx += col_widths[i]
    # rows
    for r, row in enumerate(rows):
        ry = y0 + Inches(0.55) + Inches(0.6) * r
        if r % 2 == 0:
            add_rect(s, x0, ry, sum(col_widths, Emu(0)), Inches(0.55), BG)
        cx = x0
        for i, cell in enumerate(row):
            bold = (i == 0) or (row[0] == "BookMe")
            color = ACCENT if (row[0] == "BookMe" and i == 0) else INK
            align = PP_ALIGN.LEFT if i == 0 else PP_ALIGN.CENTER
            add_text(s, cx + Inches(0.15), ry + Inches(0.1),
                     col_widths[i] - Inches(0.3), Inches(0.4),
                     cell, size=13, bold=bold, color=color, align=align)
            cx += col_widths[i]

    add_text(
        s, Inches(0.6), Inches(6.2), Inches(12), Inches(0.5),
        "Moat compounds with shops: availability, reviews, repeat customers, and walk-in history are sticky.",
        size=13, color=INK_SOFT,
    )


def slide_gtm(prs, num, total):
    s = blank(prs); page_chrome(s, num, total, "Go-to-market")
    section_title(
        s,
        "Owner-led, city by city, vertical by vertical.",
        "Land one barangay of shops, then let customer gravity pull the next."
    )
    divider(s)

    phases = [
        ("0–6 mo  ·  Beachhead",
         ["Metro Manila barbershops + salons (highest density, repeat behavior).",
          "Hand-onboard 100 shops; weekly product feedback loop.",
          "Free for first 90 days, then 8% commission."]),
        ("6–12 mo  ·  Expand verticals",
         ["Add spa / car wash / pet grooming in same neighborhoods.",
          "Referral bounty for shops bringing other shops.",
          "Launch PWA install campaign on completed bookings."]),
        ("12–24 mo  ·  Scale cities",
         ["Replicate playbook in Cebu, Davao, Iloilo.",
          "Self-serve owner onboarding fully automated.",
          "Premium tier + SMS credits live."]),
    ]
    col_w = Inches(4.0); gap = Inches(0.25); x0 = Inches(0.6); y = Inches(2.55)
    for i, (h, items) in enumerate(phases):
        x = x0 + (col_w + gap) * i
        card = add_rect(s, x, y, col_w, Inches(4.1), BG)
        card.line.color.rgb = LINE; card.line.width = Pt(0.75)
        add_rect(s, x, y, col_w, Inches(0.55), ACCENT)
        add_text(s, x + Inches(0.3), y + Inches(0.1), col_w - Inches(0.6),
                 Inches(0.4), h, size=14, bold=True, color=BG)
        add_bullets(s, x + Inches(0.3), y + Inches(0.85),
                    col_w - Inches(0.6), Inches(3.0), items, size=14)


def slide_ask(prs, num, total):
    s = blank(prs); page_chrome(s, num, total, "The ask")
    section_title(
        s,
        "Raising a seed round to acquire the first 1,000 shops.",
        "Product is built. The unlock is distribution."
    )
    divider(s)

    # left: ask number
    add_text(s, Inches(0.6), Inches(2.6), Inches(6), Inches(0.5),
             "Seed round", size=14, bold=True, color=ACCENT)
    add_text(s, Inches(0.6), Inches(3.05), Inches(6), Inches(1.2),
             "$ 750 K", size=72, bold=True, color=INK)
    add_text(s, Inches(0.6), Inches(4.5), Inches(6), Inches(0.6),
             "18-month runway to commission-positive in Metro Manila.",
             size=15, color=INK_SOFT)

    # right: use of funds
    add_text(s, Inches(7.2), Inches(2.6), Inches(5.5), Inches(0.5),
             "Use of funds", size=14, bold=True, color=ACCENT)
    items = [
        ("45%", "Shop acquisition & field ops"),
        ("30%", "Engineering (mobile app, payments, analytics)"),
        ("15%", "Marketing & customer growth"),
        ("10%", "Operations, legal, compliance"),
    ]
    y = Inches(3.1)
    for pct, label in items:
        add_text(s, Inches(7.2), y, Inches(1.2), Inches(0.5),
                 pct, size=22, bold=True, color=ACCENT)
        add_text(s, Inches(8.5), y + Inches(0.1), Inches(4.5), Inches(0.5),
                 label, size=15, color=INK)
        y += Inches(0.7)

    # contact strip
    add_rect(s, Emu(0), Inches(6.5), SLIDE_W, Inches(0.6), INK)
    add_text(s, Inches(0.6), Inches(6.55), Inches(12), Inches(0.5),
             "Let's talk.   yulgurz@gmail.com   ·   bookme.ph",
             size=14, bold=True, color=BG, anchor=MSO_ANCHOR.MIDDLE)


# -- build --------------------------------------------------------------------
def main():
    prs = new_deck()
    builders = [
        slide_cover,
        slide_problem,
        slide_solution,
        slide_product,
        slide_market,
        slide_business_model,
        slide_traction,
        slide_competition,
        slide_gtm,
        slide_ask,
    ]
    total = len(builders)
    for i, build in enumerate(builders, start=1):
        build(prs, i, total)

    out = Path(__file__).parent / "BookMe_Pitch_Deck.pptx"
    prs.save(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
