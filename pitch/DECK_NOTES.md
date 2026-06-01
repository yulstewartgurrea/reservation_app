# BookMe — Investor Deck Notes

Companion doc to [BookMe_Pitch_Deck.pptx](BookMe_Pitch_Deck.pptx) and [build_deck.py](build_deck.py).

For each slide: the narrative, the copy already in the deck, and **where to drop photos / screenshots / charts**.

Image guidance:
- 16:9 deck, slide size **13.333" × 7.5"** (1280 × 720 px works; 1920 × 1080 px is sharper).
- Save screenshots from a real device frame (iPhone mockup or Mac browser frame) — naked screenshots look amateur.
- Prefer 1–2 strong images per slide over a collage.
- Suggested folder: `pitch/assets/` — keep originals so you can re-export.

---

## Slide 1 — Cover

**One-liner:** BookMe — Reservations for every local service in the Philippines.

**Talk track (15 sec):** "BookMe is the booking layer for every local service in the Philippines — haircuts, spas, car wash, repair. One app to discover, book, pay, and review."

**Already in the deck:**
- Product name, tagline, "Investor deck · Seed round · May 2026", domain.

**📷 Photos to add:**
- **Hero image (right ~35% of slide, the coral block area):** a beautiful lifestyle photo — e.g. a barber finishing a haircut, a spa massage, or a phone showing the BookMe app. Replace the solid coral block with this image (overlay coral at 30% opacity on top to keep the brand color).
- **Optional logo:** if you have a BookMe logo, place it top-left at ~1.5" wide. Suggested file: `pitch/assets/logo.png`.

---

## Slide 2 — Problem

**Headline:** Booking a local service in PH is still a DM and a prayer.

**Talk track (45 sec):** "Today, if you want a haircut in Manila, you DM a shop on Messenger, wait for a reply, and hope they don't double-book you. Shop owners juggle DMs, calls, and a notebook. Global tools like Booksy don't speak GCash. Local tools are single-vertical."

**Already in the deck:** Three pain columns — For customers / For shop owners / For the market.

**📷 Photos to add:**
- **Top-right corner (above the three cards, ~3" × 1.8"):** a screenshot collage of cluttered Messenger booking DMs (blur names) — instantly conveys the pain. Or a photo of a shop owner with a paper appointment book.
- **Alternative:** a stylized "DM thread" mockup showing the back-and-forth ("Hi po, available for 2pm?" — "Sorry po booked na", etc.). Effective and shareable.

---

## Slide 3 — Solution

**Headline:** One platform. Every service. Discover → book → pay → review.

**Talk track (45 sec):** "BookMe is OpenTable meets Booksy, tuned for the Philippines. Customers discover shops by location, book a slot in under a minute, pay on arrival or via GCash, get reminders, and leave a review. Shop owners get a real-time dashboard instead of a notebook."

**Already in the deck:** Five horizontal step cards (Discover, Book, Pay, Show up, Review).

**📷 Photos to add:**
- **Right of each step (small, ~0.6" tall):** a tiny icon for each step — magnifying glass, calendar, GCash logo + card, bell, star. Use Lucide / Heroicons SVGs.
- **Or replace the whole slide right half** with a 3-screen phone mockup showing: (1) the discover map, (2) the slot picker, (3) the confirmation screen. Most impactful single image on the slide.

---

## Slide 4 — Product

**Headline:** Three apps, one platform.

**Talk track (60 sec):** "We've built three coordinated experiences — customer, shop owner, and admin — on a single Django + Next.js codebase with real-time WebSockets. Customers get a PWA that feels native. Shop owners get live booking pings and revenue analytics. Admin approves shops and tracks commission."

**Already in the deck:** Three feature cards (Customer / Shop owner / Admin).

**📷 Photos to add (this is the most visual slide — do it justice):**
- **Above each card, ~3.9" × 2.0":** a real screenshot from the running app.
  - **Customer card:** the shop discovery / map screen on a phone frame.
  - **Shop owner card:** the bookings inbox on a tablet/laptop frame.
  - **Admin card:** the admin dashboard with the commission ledger.
- Files to save in `pitch/assets/`: `customer-discovery.png`, `shop-inbox.png`, `admin-dashboard.png`.
- If you don't have all three yet, lead with the customer one — that's what investors emotionally connect with.

---

## Slide 5 — Market

**Headline:** The Philippines spends on services every weekend.

**⚠️ Numbers are placeholders.** Replace with sourced figures before sending:
- TAM ₱380B — source: PSA Household Final Consumption Expenditure on services
- SAM ₱95B — your own urban-services calculation
- SOM ₱3.2B GMV — bottom-up: shops × avg annual bookings × take rate

**Talk track (60 sec):** "PH households spend over ₱380B a year on personal and local services. Smartphone-first urban customers represent a ₱95B addressable slice today. We've modeled a path to ₱3.2B GMV — 10,000 shops at modest annual volume — yielding ₱256M ARR at our 8% take rate."

**Already in the deck:** TAM / SAM / SOM cards + tailwinds strip.

**📷 Photos / charts to add:**
- **Below the three cards** (around y=5.8", full width): a simple horizontal bar chart showing TAM > SAM > SOM nested. Or a PH map highlighting Metro Manila → Cebu → Davao as your rollout corridor.
- **Optional source citations** at the bottom-left in tiny 8pt text: "Sources: PSA 2024, BSP Digital Payments Report, …" — investors check this.

---

## Slide 6 — Business model

**Headline:** Commission-first. Shop pays only when BookMe drives revenue.

**Talk track (45 sec):** "We charge 8–12% commission on completed online reservations. Walk-ins are free — we never tax bookings we didn't drive. The platform collects via PayMongo, settles to shops monthly. Future revenue: SMS credits, featured placement, premium tier, deposit fees."

**Already in the deck:** Two columns — "How we earn" and "Future revenue lines".

**📷 Photos / diagrams to add:**
- **Right half (or below), ~5" × 2.5":** a money-flow diagram. Customer → PayMongo → BookMe → (monthly settlement) → Shop. Use simple boxes + arrows; this is the single most-asked question from investors.
- Tools: draw it in Figma/Excalidraw, export as PNG, save to `pitch/assets/money-flow.png`.

---

## Slide 7 — Traction

**Headline:** The product is built, deployed, and ready to onboard shops.

**Talk track (45 sec):** "We're not pitching an idea. Phase 1 and 2 are shipped — full booking lifecycle, online payments through PayMongo, real-time chat, and analytics. Phase 3 is well underway. The whole stack runs on AWS staging today. What we need is distribution."

**Already in the deck:** Four stat cards + "Built and live" bullet list.

**📷 Photos to add:**
- **Right column or below stat cards, ~5" × 2.5":** a clean architecture diagram — CloudFront → S3 + ALB → ECS · Celery + Redis + Postgres. Investors love seeing the system is real.
- **Alternative / additional:** a screenshot of the AWS staging URL bar showing `https://dx1epgde94eqq.cloudfront.net` (or your custom domain once wired). Proof of "it's live."
- **Optional:** a small grid of 4 device mockups (phone, tablet, laptop, admin) showing the product working — bottom strip of the slide.

---

## Slide 8 — Competition

**Headline:** Global incumbents are not PH-tuned. Local tools are single-vertical.

**Talk track (45 sec):** "Booksy and Fresha are hair-and-beauty only, and neither speaks GCash. Setmore is generic, no PH polish. The real competition is Messenger DMs. We win on three axes: payments, breadth, and policy fit — cancellation rules tuned to PH culture."

**Already in the deck:** Comparison matrix (BookMe vs Booksy, Fresha, Setmore, DMs).

**📷 Photos / logos to add:**
- **Replace the text labels** in the left column with each competitor's actual logo (BookMe, Booksy, Fresha, Setmore, FB Messenger logo for DMs). Logos at ~0.6" tall.
- Save in `pitch/assets/logos/`: `booksy.png`, `fresha.png`, `setmore.png`, `messenger.png`.

---

## Slide 9 — Go-to-market

**Headline:** Owner-led, city by city, vertical by vertical.

**Talk track (45 sec):** "We land barbershops and salons in Metro Manila first — high density, weekly repeat behavior. Hand-onboard the first hundred shops so the product hardens against real feedback. Then expand verticals in the same neighborhoods, then replicate to Cebu and Davao. By month 24 we're self-serve with a premium tier."

**Already in the deck:** Three phase cards (0–6 mo, 6–12 mo, 12–24 mo).

**📷 Photos to add:**
- **Bottom strip, full width, ~12" × 1.5":** a Metro Manila map with pins clustering in target barangays (Makati, BGC, QC). Reinforces the "beachhead" story visually.
- **Or:** a photo of you (the founder) sitting with a shop owner doing onboarding — humanizes the GTM story. Authentic > polished.

---

## Slide 10 — The ask

**Headline:** Raising a seed round to acquire the first 1,000 shops.

**⚠️ Numbers are placeholders.** Replace $750K and the 45/30/15/10 split with your actual plan before sending.

**Talk track (45 sec):** "We're raising $750K. 45% goes to shop acquisition and field ops — the bottleneck. 30% to engineering, mostly the native mobile app and analytics depth. 15% to customer growth marketing. 10% to ops, legal, and compliance. That's 18 months of runway to commission-positive in Metro Manila."

**Already in the deck:** Big ask number + use-of-funds breakdown + contact strip footer.

**📷 Photos to add:**
- **Optional headshot** of you (the founder), top-right corner, ~1.5" × 1.5" round crop. Signals "this is who's running it."
- **Optional milestone timeline** below the use-of-funds: small horizontal line showing "100 shops (mo 3) → 500 shops (mo 9) → 1k shops (mo 18) → Series A ready (mo 18+)".

---

## Suggested slide 11 (not in deck yet) — Team

Skipped because I don't have your bios. To add it, tell me:
- Your name + 1-line background (years of experience, prior companies/products)
- Any co-founders or first hires
- Any advisors worth naming

Typical layout: 2–4 circular headshots with name, role, and a one-liner. Optional: logos of past companies you worked at.

**📷 Photos to add when ready:**
- Square headshots, plain background, friendly but professional. ~2" × 2" rounded crop.
- Save as `pitch/assets/team/{firstname}.jpg`.

---

## Quick checklist before sending

- [ ] Replace TAM / SAM / SOM with sourced numbers (slide 5)
- [ ] Replace round size & use-of-funds % (slide 10)
- [ ] Update domain if not `bookme.ph` (slides 1 & 10)
- [ ] Add hero image (slide 1)
- [ ] Add 3 product screenshots (slide 4)
- [ ] Add money-flow diagram (slide 6)
- [ ] Add architecture diagram (slide 7)
- [ ] Add competitor logos (slide 8)
- [ ] Add team slide if pitching live
- [ ] Export a PDF copy for email-sending (PPTX for live decks, PDF for cold outreach)
