# Business & licensing playbook

Use this doc in a **separate Cursor chat** for partnerships, pricing, and legal — keep product/engineering chats focused on build.

**Product (working name):** Shruti — pitch lookup for Indian film songs  
**Core need:** Licensed **search + full-track audio** for server-side Sa analysis, with stable track IDs (ISRC) and permission to **cache audio** for repeat lookups.

---

## 1. Communication plan

### Phase 0 — Before first email (you, 1–2 days)

- [ ] One-pager ready: problem, user flow, India-first catalog need, non-streaming use case (analysis + cached pitch result)
- [ ] List must-have questions (see §4)
- [ ] Decide entity name / domain for signature (can stay personal founder email until incorporated)

### Phase 1 — Parallel outreach (week 1)

| Track | Action | Goal |
|-------|--------|------|
| **A — Tuned Global** | Contact form + `info@tunedglobal.com` | Primary B2B: APIs + licensing facilitation |
| **B — MassiveMusic (7digital)** | [massivemusic.com/contact](https://massivemusic.com/contact) → Platform / Digital Platforms, region **Asia Pacific** | Same capability via Songtradr platform |
| **C — Warm paths** | LinkedIn to BD leads (no cold personal emails guessed) | Faster routing to right desk |

Run **A and B in parallel**. Do not wait on one before starting the other.

### Phase 2 — Discovery call (weeks 2–4)

- Share architecture at high level: search → licensed audio fetch → analysis → cache pitch (not user-facing streaming)
- Ask explicitly about **Bollywood / Indian film catalog** coverage and **analysis / ML rights**
- Request: sandbox API, sample ISRCs, India territory clearances, pricing model (per track analyzed vs MAU vs revenue share)

### Phase 3 — Legal & commercial (weeks 4–12)

- Term sheet: server-side access, cache TTL, derivative use (pitch display; future: note sheet, practice tools)
- Pilot: 500–2,000 tracks, India territory, 90-day eval
- Engineering spike only **after** written permission for analysis + cache

### Phase 4 — If both stall (week 8+)

- Activate **Plan B** (§6) — India-first label route + global infra later

---

## 2. Where to send outreach (verified public channels)

### Tuned Global

| Channel | Details |
|---------|---------|
| **Contact form** | [tunedglobal.com/contact](https://www.tunedglobal.com/contact) — select API / streaming integration |
| **Demo booking** | [tunedglobal.com/book-a-demo-tuned-global](https://www.tunedglobal.com/book-a-demo-tuned-global) |
| **General email** | `info@tunedglobal.com` |
| **HQ** | Melbourne, Australia · also UK, USA, Sweden |
| **India on form** | Contact form lists 🇮🇳 India — use APAC/India in region field |

**Named people (route via form/email first; connect on LinkedIn):**

| Name | Role | Notes |
|------|------|-------|
| Con Raso | MD & Co-founder | Strategic / press; UMG consolidated licensing narrative |
| Andrew Stess | Head of BD, USA | Partnerships, label relationships |
| Mario Forsyth | VP Commercial, EMEA | May help route non-US deals |
| Chris Georgiou | Director of Business Development | BD |
| Spiro Arkoudis | Chief Revenue Officer | Commercial escalation |

Do **not** guess `@tunedglobal.com` personal addresses. Use form + `info@` and ask to be routed to BD/licensing.

### MassiveMusic (formerly 7digital, Songtradr group)

| Channel | Details |
|---------|---------|
| **Contact form** | [massivemusic.com/contact](https://massivemusic.com/contact) — category: **Digital Platforms** · region: **Asia Pacific** |
| **Developer docs** | [docs.massivemusic.com](https://docs.massivemusic.com) — Catalogue Events, `media/transfer`, `stream/catalogue`, usage logging |
| **API base** | `https://api.7digital.com/1.2/` (still valid) |

**Scam warning:** Only trust `@massivemusic.com` / `@songtradr.com`. Never pay upfront “licensing fees” via PayPal/crypto ([MassiveMusic advisory](https://massivemusic.com/soundboard/music-licensing-scams-in-2026)).

---

## 3. Draft email — Tuned Global

**To:** `info@tunedglobal.com`  
**Subject:** Partnership inquiry — licensed catalog + audio API for Indian film pitch discovery app

---

Hi Tuned Global team,

I'm building **Shruti**, a consumer app that helps singers and musicians find the **pitch (Sa)** of Indian film songs — the note you tune to before playing or singing along.

**What users do:** search a song → select the official recording → receive the pitch.  
**What we need from a partner:** not a consumer streaming service, but **licensed access to official recordings** plus **search/catalog metadata** tied to stable track IDs (ISRC preferred).

**Technical use (server-side only):**

- Fetch audio for the selected official track via your API  
- Run automated pitch analysis on our servers  
- **Cache** the audio and computed pitch for repeat lookups (with your reporting/compliance requirements)  
- Display only the pitch result to the user — we are not offering full-track playback as a streaming product

**Why Tuned Global:** your B2B API stack, licensing facilitation, and work with majors/indies fit our need for a **single integration point** rather than negotiating dozens of label deals at day one.

**Questions we'd like to explore on a call:**

1. India / **Bollywood and regional film music** catalog coverage and gaps  
2. Whether our use case (server-side analysis + caching) is licensable under your standard B2B agreements  
3. Rights for **automated analysis** and storing derived results (pitch), including future musician tools  
4. API access to **full tracks** (not 30s previews) for analysis  
5. Pricing model for early-stage startup (pilot → scale)  
6. Typical timeline from NDA to sandbox access

Happy to share a short product demo and architecture summary. I'm based in [your city/country] and targeting **India first**, with web and mobile apps.

Best regards,  
[Your name]  
[Email] · [LinkedIn optional]  
Shruti (Indian film song pitch finder)

---

## 4. Draft email — MassiveMusic / 7digital platform

**Via:** [massivemusic.com/contact](https://massivemusic.com/contact) (paste body into message)  
**Subject:** B2B platform inquiry — catalog + media transfer for music analysis app (India focus)

---

Hello MassiveMusic platform team,

I'm developing **Shruti**, a app for Indian film music that returns the **pitch (Sa)** of a song's official recording. Users search by title, film, or artist; we resolve the correct track and show the home note (e.g. G, A).

We are evaluating B2B music infrastructure partners and your **Catalogue Events + media transfer / streaming API** model appears aligned with our needs.

**Intended integration:**

- Ingest catalog metadata and search/discovery fields  
- Server-side access to **full-track audio** for analysis (not end-user streaming)  
- Usage logging per your reporting spec  
- Cache policy for audio and derived pitch data — seeking clarity on what's permitted under standard digital platform agreements

**India priority:** film soundtracks (Hindi and regional). Please advise catalog strength, territory clearances, and any limitations for **automated audio analysis** and **cached derivatives**.

Could we schedule a discovery call with your platform/commercial team? I can provide a concise product overview and technical diagram.

Thank you,  
[Your name]  
[Email]  
Shruti

---

## 5. Must-ask checklist (both partners)

- [ ] **Full track** vs preview-only for our use case  
- [ ] **Server-side download / transfer** (`media/transfer`) allowed?  
- [ ] **Cache duration** for audio and analysis results  
- [ ] **ML / signal processing** on licensed audio — explicit grant needed  
- [ ] **India territory** — film catalog from Sony Music India, Zee, T-Series, Saregama, etc.  
- [ ] **ISRC** as canonical ID across search + audio  
- [ ] **Reporting** — per-play vs per-analysis event  
- [ ] **Future products** — note hints, practice tools, pitch-shift backing (even if v2)  
- [ ] **Indemnification** and takedown process  
- [ ] **Startup pricing** / pilot tier

---

## 6. Plan B — equally credible if Tuned Global / 7digital don't fit

**Strategy: “India-first licensing + global metadata layer”**

Not a downgrade — many India-focused products start here because **film catalog depth** is often stronger via **local labels** than via global B2B feeds alone.

### B1 — Direct Indian label / aggregator deals (primary for Bollywood)

| Partner type | Examples | Role |
|--------------|----------|------|
| Major Indian catalogs | **Saregama**, **Tips**, **Zee Music**, **Sony Music India**, **T-Series** (harder) | Licensed audio + search metadata for film recordings |
| Indian DSPs (B2B) | **JioSaavn / Gaana** enterprise (if available) | Possible catalog API — requires careful legal read; often consumer-only |
| Rights orgs | **PPL India** (neighbouring rights, not full sync), **IPRS** (publishing) | Supporting, not sufficient alone for master audio |

**Public inbound (Saregama brands/licensing):** `licensingforbrands@rpsg.in` — for multi-platform commercial licensing ([FAQ](https://business.saregama.com/faq)).

**Pitch to labels:** “We send discovery traffic and practice utility; we need masters for **analysis only**, cache with reporting, display pitch not stream.”

### B2 — MassiveMusic / Merlin pass-through (parallel)

- Even under Plan B, keep **MassiveMusic** or **Merlin-member aggregators** for **international catalog** and ISRC infrastructure  
- Use Indian label deals for **film gaps** global B2B misses

### B3 — Phased product (credibility without full catalog day one)

1. **Launch:** verified catalog you already license (iTunes purchases / label pilot) + human labels — proves product  
2. **Scale:** first major Indian label pilot (Saregama-sized)  
3. **Global:** attach Tuned Global or MassiveMusic when unit economics clear

### B4 — Technology fallback (never substitute for masters)

- **Gracenote / Apple Music API / Spotify** — metadata/search only; **not** legal for server-side analysis at scale  
- **YouTube Content ID / audio from video** — not production-grade; avoid

**Plan B is credible because:** Saregama and peers already license to every major Indian streaming app; you're a narrower derivative use case with lower risk than full streaming.

---

## 7. Suggested separate chats in Cursor

| Chat | Scope |
|------|--------|
| **Product / UI** | Shruti app, labels, model training |
| **Business / licensing** | This doc, emails, call notes, term sheets |
| **Legal** | Review partner contracts before signing |

---

## 8. After first reply — log template

```text
Date:
Partner:
Contact name:
Summary:
Catalog India (Y/N/partial):
Full audio for analysis (Y/N):
Cache allowed:
ML/analysis rights:
Next step:
```
