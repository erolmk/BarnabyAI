# 01 — Market research and what to build

Date: 2026-09-26. Scope: a Windows helper for people aged 70 to 90. It has three parts: a big-tile home screen, a floating voice helper that can see and operate the PC while teaching each step, and a scam guardian. Numbers in [brackets] refer to the Sources list at the end. Rows marked **(est.)** are my own calculations and are not quoted from a source.

---

## 1. Verdict in five lines

1. **The need is large and paid for today, but served badly.** Older adults already pay $19–89/month for human tech support or simplified tablets. The only help they get on the Windows PC they already own is a phone call or a stranger taking remote control.
2. **Scam protection is what gets the buyer to pay.** In 2025 people aged 60+ reported **$7.75B** in losses to the FBI, up 59% from 2024. Customer/tech-support scams alone cost this group **$1.04B** [3]. Adult children buy peace of mind, and the parent uses help with photos and email.
3. **The window is 12–24 months.** Microsoft already gives away "show me where to click" (Copilot Vision Highlights, US, June 2025 [15]), and its agents that click for you are in preview [16]. Our moat is a design built for 80-year-olds, a guardian they trust, the family link, and distribution. Raw capability is not a moat.
4. **Sell to the adult child, design for the parent.** Launch direct-to-consumer at **$14.99/month or $129/year per household**. Then run paid pilots in senior living. Pitch Medicare Advantage only once we have outcome data.
5. **The MVP has seven features, ranked in §8. Everything else waits (§9).**

---

## 2. Size of the opportunity

| Metric | Value | Source |
|---|---|---|
| US adults 65+ (2024) | **61.2M** (18.0% of population), +3.1% in one year | Census V2024 [1] |
| US 65+ who are online | 90% (vs 98% of ages 50–64) | Pew [2] |
| US 65+ with home broadband / smartphone | 70% / 78% (Feb–Jun 2025) | Pew [2] |
| US 65+ **without** a desktop/laptop at home | "nearly 1 in 5" (ACS 2023) | Digitunity/ACS [4] |
| Adults 50+ owning a laptop / desktop | 72% / 50% (Sept 2024, n=3,605) | AARP Tech Trends 2025 [5] |
| US family caregivers | **63M**, average age 51 | AARP/NAC 2025 [6] |
| World population 65+ | 10.3% of humanity in 2024 (≈840M) | UN WPP 2024 [7] |
| EU 65+ / 80+ (1 Jan 2025) | 22.0% / 6.2% of 450.6M → **≈99M / ≈28M** | Eurostat [8] |
| EU aged 65–74 with at least basic digital skills | **33%** (2025) | Eurostat [9] |

**How many people struggle.** 48% of US seniors say "when I get a new device I usually need someone else to set it up or show me how" describes them *very* well. 34% of older internet users have little or no confidence doing online tasks [10] (Pew 2017, the last direct measure; the oldest users are the least confident). In AARP's 2025 survey, **71% of adults 50+ are interested in tech support built for older users** and 59% say tech isn't designed for them [5]. The 2026 wave (n=3,838) puts that second figure at 60% [11].

**Market funnel (US)** (est.)

| Layer | Math | Size |
|---|---|---|
| TAM: 65+ with a large-screen computer | 61.2M × ~0.8 [1][4] | ≈49M people |
| Of which use Windows | × ~0.6 (Windows ≈62% of desktop OS worldwide, lower in the US [12]) | **≈27–30M** |
| SAM: Windows users who need hands-on help | × ~0.48 [10] | **≈13–14M** (≈9–10M households) |
| SOM: 3-year target | 0.7% of SAM households | **≈65k households × $129 ≈ $8.4M ARR** |

The UK, Canada and Australia add roughly 40% on top of the US SAM once English-language v1 ships. The EU is larger but needs localization (v2+).

---

## 3. Pain points, ranked by evidence

| # | Pain | Evidence | What the product does |
|---|---|---|---|
| 1 | **Scams, especially fake tech support and remote access** | 60+: $7.749B lost, 201,266 complaints, **average $38,501 per complaint**, customer-support scams $1.041B, investment scams $3.519B, government-impersonation reports nearly doubled [3]. People 60+ are 5× more likely than younger adults to lose money to tech-support scams [13]. The FTC estimates the true 2024 loss at up to **$81.5B** [14]. Scammers get victims to open Quick Assist/AnyDesk [17]. | Scam Shield: calm full-screen warning, hard block on remote-access tools, gift cards and crypto, and an alert to family. |
| 2 | **Stuck with nobody patient to ask** | Adult children are the first stop for 44% of seniors, but are often "can't be bothered explaining". Grandchildren "fix it without teaching" [18]. | A helper that never sighs, and that **does and teaches** every time. |
| 3 | **Tech isn't built for them** | 60% agree [11]. Only 33% of EU 65–74-year-olds have basic digital skills [9]. | Huge text, one question at a time, no jargon. |
| 4 | **Setup and change**: new devices, updates, Windows 10 end of support | 48% need help setting up [10]. Win10 support ended 14 Oct 2025, with free consumer security updates extended to Oct 2027 [19]. | "Acting up" diagnostics. Win10 22H2 and Win11 both supported. |
| 5 | **Privacy and distrust of AI** | Two-thirds say data privacy is their top barrier to adoption, and about half distrust AI [11]. | Visible "I'm looking at your screen" indicator, the person presses Send, no screenshots stored. Marketing says "helper", not "AI". |
| 6 | **Connection jobs**: photos, email, video calls | 90% of 50+ own a smartphone, texting is their top channel, and the heaviest communication runs on phones [5][11]. The PC is where attachments, printing and portals get stuck. | "Together" tasks: send photos, join a call, print, open the patient portal. |

---

## 4. Competitor landscape

| Player | What it is | Price | Gap we exploit |
|---|---|---|---|
| **GrandPad** (Consumer Cellular) | Closed LTE tablet + service | $40/mo via Consumer Cellular ($38 for AARP members); $65–89/mo direct [20] | Replaces the PC instead of helping with it. Expensive. Cannot do email attachments or the patient portal on their real accounts. |
| **Claris Companion / Breezie** | Simplified tablets, mostly sold through care organizations | Claris $299 + monthly plan [21]; Breezie B2B [22] | Tablet only, no agent. |
| **ElliQ** | Tabletop companion robot | $59/mo, or $588/yr on sale; device $249 or bundled [23] | Companionship, not computer help. |
| **Eldy** | Free simplified PC shell (Italian nonprofit) [24] | Free | Dated, no AI, hides Windows instead of teaching it. |
| **BIG Launcher, Samsung Easy mode, Apple Assistive Access** | Simplified phone/tablet modes | $10 one-time / free / free [25][26] | Phone and tablet only. They simplify the screen but give no help. |
| **Microsoft Copilot Vision + Highlights** | Shares the screen and highlights where to click | Free, US, since 12 Jun 2025 [15] | **Biggest threat.** Generic: no scam guardian, no launcher, no family link, no lesson memory, and the person must know how to start it. It does not click for you [27]. |
| **Copilot Actions / Windows agents** | Agent clicks and types in an isolated "agent workspace" | Experimental, for Windows Insiders only (Oct 2025) [16]. Enterprise computer use is GA in Copilot Studio (May 2026) [28]. | Consumer version not shipped yet. When it does, it will be built for knowledge workers. |
| **ChatGPT agent** | Agent runs in *its own* virtual browser/computer | Plus $20/mo and up (since Jul 2025) [29][30] | Cannot operate *your* Outlook, printer or settings. No senior UX. |
| **Claude for Chrome / Gemini auto browse** | Browser agents | $20/mo / $19.99/mo [31][32] | Chrome only, typed prompts, no teaching. |
| **Anthropic computer-use API** | Developer building block | Usage-based | This is our engine, not a competitor. |
| **Candoo Tech** | Human remote support + lessons for seniors | $228/yr individual, $360/yr couple; 9am–8pm ET [33] | Limited hours, and a human waits on the phone. |
| **Geek Squad / HelloTech** | Retail and in-home support | Best Buy Total $199.99/yr; remote $19.99–149.99 per job; visits $79–249 [34][35][36] | Fixes things but does not teach. Episodic and intimidating. |
| **Senior Planet (AARP)** | Free classes + hotline, 888-713-3495 (Mon–Fri 9–8, Sat 9–2 ET) [37] | Free | Scheduled class times, and no help at the moment of need. |
| **GCFGlobal, YouTube** | Free tutorials | Free | The person must pause, switch windows and copy the steps themselves. |
| **Papa** | Human "Pals" as a Medicare Advantage benefit in ~100 plans, some tech help [38] | Paid by the plan | Human visits, not always available. |
| **Lively / Jitterbug** | Senior phones + urgent response | $14.99–34.99/mo [39] | Phone only. |
| **Carefull** | Financial-fraud monitoring | $12.99/mo or $119.99/yr [40] | Watches bank accounts, not the screen. |
| **New AI helpers for seniors (2025–26)** | Apo/Carevocacy (SMS bot, senior-living pilot with 150 residents) [41]; Techy Seniors (web assistant, screen overlay "soon") [42]; LUNA (camera/screen-share guidance) [43]; TechMaid (chat, $4.99/mo) [44] | $4.99/mo up to B2B | None of them operates the PC **and** teaches **and** guards against scams in one product. |

**The white space.** Nobody sits *on the older adult's existing Windows PC* as a voice-first helper that (a) does the fiddly clicks, (b) teaches each step and saves it as a lesson, (c) blocks scams in real time, and (d) keeps the family informed.

---

## 5. Buyer vs user

| Role | Who | What they want | Implication |
|---|---|---|---|
| **User** | 75–90, Windows laptop, often lives alone, vision and dexterity decline | Dignity, not being a burden, not being fooled | Never say "AI agent". Say "your helper". The person stays in charge. |
| **Primary buyer** | Adult child, 45–65 (caregiver average age 51 [6]) | "Stop the 9 pm 'the computer is broken' calls" and "don't let Mom get scammed" | Buys online with a card. Sets it up in 10 minutes during a visit. Gets alerts. |
| Institutional buyer 1 | Senior-living operators (35,000+ communities [45]) | Resident satisfaction, less staff time spent on tech help | Per-resident license. The Parasol Alliance × Carevocacy pilot shows this budget exists [41]. |
| Institutional buyer 2 | Medicare Advantage plans (34.1M enrollees, 54% of eligible beneficiaries [46]) | Portal/telehealth adoption, digital-literacy screening | SCAN already gives members **24/7 tech support at $0** [47]. Plans do buy this. Long bid cycles. |
| Institutional buyer 3 | Area Agencies on Aging (~622 [48]), libraries (80.4% serve 65+, 70.5% run digital-literacy programs [49]) | Free digital-inclusion tools | Budgets are cut: the Digital Equity Act grants ($2.75B) were cancelled in May 2025 [50]. Use them as **distribution partners**, not revenue. |

**Willingness to pay.** Three-quarters or more of AARP Healthy@Home respondents cap aging-tech spend at **under $50/month** [51]. Actual anchors: Candoo $19/mo, Geek Squad $16.67/mo, Carefull $12.99/mo, GrandPad $38–89/mo, ElliQ $49–59/mo. Households aged 50+ spent $756 on tech in 2025 [11].

---

## 6. Positioning

- **Category:** a patient computer helper for older adults.
- **One-line pitch (to the parent):** "A friendly helper that lives on your computer. Just say what you want, and it helps you do it, one easy step at a time, and warns you if something looks like a scam."
- **One-line pitch (to the adult child):** "Stop being Mom's 24/7 IT desk. [Name] does the tricky clicks with her, teaches her as it goes, and blocks tech-support scammers before they get in."
- **Proof points to lead with:** "It never presses Send for you." "It never lets a stranger take over your computer." "It remembers how you did it, so next time it can show you again."

---

## 7. Pricing recommendation

| Plan | Price | Includes |
|---|---|---|
| **Free** | $0 | Home screen, Scam Shield (warnings + remote-access block), 5 helper conversations a month. This is the acquisition wedge and costs almost nothing to run, because the model is called only when the keyword filter hits. |
| **Family** (default) | **$14.99/mo or $129/yr** per household computer | Unlimited everyday help, "acting up" fixes, lessons, family alerts for up to 3 relatives |
| Senior living | $5/resident/mo, 50-seat minimum | Same as Family + a staff contact in place of the family |
| Medicare Advantage | $1.50 PMPM for an opted-in cohort, or $8 per engaged member per month | Outcome report: portal and telehealth completion |

- **Trial:** 30 days. Card taken from the adult child. Reminder email 3 days before the first charge. One-click cancel. Trust beats short-term conversion with this audience.
- **Unit economics (est.):** the spec caps each task at $0.25; the typical task is likely $0.03–0.10. A heavy user doing 30 tasks a month costs $1.50–3.00 in model spend, a **75–85% gross margin** at $14.99. Enforce a soft cap of about 150 agent tasks a month; beyond that, text answers still work.
- **Why $14.99:** below Candoo and Geek Squad, far below GrandPad and ElliQ, uses the PC they already own, and sits well under the <$50 ceiling [51]. TechMaid's $4.99 is chat-only; we act and we guard.

---

## 8. RANKED MVP feature list (most value first)

1. **Always-on TALK bubble with voice in, voice out and big captions.** This is the front door to everything else. It needs one giant button, push-to-talk, a typed fallback, and an offline fallback (System.Speech).
2. **Scam Shield + hard safety rules.** Watch window text, show a calm full-screen warning, block remote-access tools and card/SSN typing, refuse gift cards, crypto and wires, and alert family. This is the #1 reason the buyer pays, and it runs almost free.
3. **"Let's do it together" agent for 6 jobs.** (a) Email a photo, via Outlook, Gmail or AOL. (b) Join a video call from an invitation. (c) Find, enlarge and print a photo or letter. (d) Open a website safely. (e) Make text bigger or change sound. (f) Log into a patient portal: the person types the password. The helper narrates every step, a confirm card appears before anything is sent, and **the person presses Send**.
4. **"My computer is acting up."** Read-only diagnostics for slow PC, no sound, no internet and printer, explained in plain words, followed by at most 3 whitelisted fixes, each after a yes. This replaces the $99 Geek Squad visit.
5. **Big-tile home screen.** 6–9 tiles plus "Talk to [assistant]". It is the familiar home base and costs little to build.
6. **Automatic lessons.** Every finished task becomes big-print steps with "show me again" replay in teach mode. This is the difference from Copilot and from grandchildren.
7. **Family setup + alerts.** The adult child's 10-minute setup: email provider, key contacts, alert channel. They get a scam alert, a "Mom asked for help 3 times today" note, and a weekly one-paragraph summary.
8. **Memory of personal facts.** "My email is Outlook." "Anne Marie = anne@…". This removes repeat questions.

**Launch success targets:** first task done in the setup session ≥80%. Week-4 retention ≥60%. Trial-to-paid ≥35%. Adult child reports "fewer tech calls" ≥70%.

---

## 9. Do NOT build yet

- Our own hardware or tablet (GrandPad's costly path), plus Mac, iPad and Android versions.
- Companionship or loneliness chat personality (ElliQ's lane, with ethics exposure).
- Health features: medication, vitals, fall detection, emergency response (FDA/HIPAA exposure; Lively's lane).
- A live human support call center. Instead, a "Call my family" button.
- Bank or credit monitoring (Carefull's lane, needs aggregators).
- Fully autonomous purchases, payments or sending. "Do" mode never makes the final irreversible click.
- Storing or typing passwords; a password manager.
- Remote desktop for family members. It is the scammers' #1 vector and conflicts with our own block rule. Revisit only with strong verification.
- B2B admin dashboard, SSO, HIPAA BAA. Build these only after the first signed senior-living pilot.
- Custom speech models, Windows 7/8, a browser extension, and languages other than English. Spanish comes first in v2.

---

## 10. Go-to-market (first 12 months)

1. **Months 0–3, closed beta:** 50 households recruited through adult children (Reddit r/AgingParents, caregiver Facebook groups, family networks). Instrument everything and collect weekly adult-child NPS.
2. **Month 3, direct-to-consumer launch:** SEO and YouTube content aimed at the adult child ("how to stop tech-support scams on Mom's PC", "Windows 10 ended — what Mom should do [19]"). Referral: give a month, get a month.
3. **Months 3–6, partners with no cash cost:** apply to the AARP AgeTech Collaborative accelerator (free, no equity, 4 cohorts a year [52]). Offer independent senior tech coaches (Candoo-style) a reseller margin. Give libraries and Area Agencies on Aging a free community edition for their loaner laptops [49][50].
4. **Months 6–12, paid pilots:** 2–3 senior-living communities with 100–150 residents each (mirrors the Parasol model [41]). Pitch credit unions and banks, which bear fraud costs, as a member benefit.
5. **Month 12+, Medicare Advantage:** use pilot data (portal logins, telehealth completion) to pitch plans. MA bids for the following year are due in early June, so start conversations about 12 months ahead.

**Top risks:** (1) Microsoft ships a free consumer agent. Answer: senior trust design, the guardian, the family link and distribution. (2) A wrong click destroys trust. Answer: "together" mode by default, verify each step, confirm before any action. (3) A missed scam. Answer: market it as "an extra pair of eyes", never a guarantee. (4) Screenshots leaving the PC. Answer: disclose in plain words, keep nothing, mask sensitive fields.

---

## Sources

1. Census, Vintage 2024 estimates — https://www.census.gov/newsroom/press-releases/2025/older-adults-outnumber-children.html
2. Pew, Jan 2026 — https://www.pewresearch.org/short-reads/2026/01/08/internet-use-smartphone-ownership-digital-divides-in-u-s/
3. FBI 2025 IC3 Report — https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf ; summary https://elaca.org/2025-ic3-report-snapshot/ ; https://www.aarp.org/money/scams-fraud/fbi-ftc-report-2025-losses/
4. Digitunity (ACS 2023) — https://digitunity.org/the-united-states-computer-ownership-gap-persists/
5. AARP Tech Trends 2025 — https://www.aarp.org/pri/topics/technology/internet-media-devices/2025-technology-trends-older-adults/
6. AARP/NAC Caregiving in the US 2025 — https://www.aarp.org/press/releases/2025-07-24-new-report-reveals-crisis-point-for-americas-63-million-family-caregivers.html
7. UN WPP 2024 — https://population.un.org/wpp/assets/Files/WPP2024_Summary-of-Results.pdf
8. Eurostat, population ageing — https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Population_structure_and_ageing
9. Eurostat, digital skills — https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Skills_for_the_digital_age
10. Pew 2017 — https://www.pewresearch.org/internet/2017/05/17/tech-adoption-climbs-among-older-adults/
11. AARP Tech Trends 2026 — https://www.aarp.org/pri/topics/technology/internet-media-devices/2026-technology-trends-older-adults/
12. StatCounter — https://gs.statcounter.com/os-market-share/desktop/worldwide/
13. FTC data spotlight — https://www.ftc.gov/news-events/data-visualizations/data-spotlight/2019/03/older-adults-hardest-hit-tech-support-scams
14. FTC Protecting Older Consumers 2024–25 — https://www.ftc.gov/reports/protecting-older-consumers-2024-2025-report-federal-trade-commission ; https://www.cnbc.com/2025/12/13/financial-fraud-seniors-ftc.html
15. Copilot Vision + Highlights US launch — https://blogs.windows.com/windowsexperience/2025/06/12/copilot-vision-on-windows-with-highlights-now-available-in-us/
16. Copilot Actions / agent workspace — https://blogs.windows.com/windowsexperience/2025/10/16/securing-ai-agents-on-windows/ ; https://support.microsoft.com/en-us/windows/experimental-agentic-features-a25ede8a-e4c2-4841-85a8-44839191dfb3
17. Quick Assist abuse — https://www.microsoft.com/en-us/security/blog/2024/05/15/threat-actors-misusing-quick-assist-in-social-engineering-attacks-leading-to-ransomware/
18. RMIT study (The Conversation) — https://theconversation.com/seniors-struggle-with-technology-and-often-their-kids-wont-help-130464
19. Win10 end of support / ESU — https://www.bleepingcomputer.com/news/microsoft/microsoft-quietly-extends-free-windows-10-esu-support-to-october-2027/
20. GrandPad pricing — https://www.seniorliving.org/cell-phone/consumer-cellular/grandpad/ ; https://www.reviewed.com/accessibility/content/grandpad-review-price-tablet-for-seniors-accessible
21. Claris — https://clarishealthcare.com/claris-companion/claris-for-family/product-details/
22. Breezie — https://www.ehomecare.com.au/product-page/breezie-4g
23. ElliQ — https://elliq.com/collections/all
24. Eldy — http://www.eldy.eu/
25. BIG Launcher — https://blog.biglauncher.com/best-android-launcher-for-seniors/
26. Apple Assistive Access — https://support.apple.com/guide/assistive-access-iphone/welcome/ios
27. Copilot Vision does not act — https://www.microsoft.com/en-us/windows/learning-center/two-must-try-ai-tools-that-simplify-tasks
28. Copilot Studio computer use GA — https://www.digitalapplied.com/blog/copilot-studio-computer-use-agents-ga-deep-dive
29. ChatGPT agent — https://openai.com/index/introducing-chatgpt-agent/
30. ChatGPT pricing — https://www.eesel.ai/blog/chatgpt-pricing
31. Claude for Chrome — https://claude.com/pricing ; https://justinmckelvey.com/blog/claude-in-chrome
32. Gemini auto browse — https://9to5google.com/2026/01/28/chrome-gemini-auto-browse/
33. Candoo Tech — https://www.candootech.com/service-offerings/annual-membership
34. Best Buy Total — https://www.bestbuy.com/product/yearly-membership/JCQ6HTG5V6
35. Geek Squad per-job prices — https://clearguidetech.com/blog/best-tech-support-options-for-elderly-parents
36. HelloTech per-visit — https://techmaid.ai/blog/best-tech-support-for-seniors
37. Senior Planet hotline — https://seniorplanet.org/hotline
38. Papa / MA — https://kffhealthnews.org/aging/medicare-advantage-plans-senior-companions-profits/
39. Lively — https://www.seniorliving.org/cell-phone/jitterbug/
40. Carefull — https://www.aarp.org/personal-technology/tools-to-avoid-elder-financial-abuse/
41. Carevocacy × Parasol — https://www.mcknightsseniorliving.com/news/ai-pilot-will-put-personal-tech-coach-in-senior-living-residents-pockets/
42. Techy Seniors — https://www.techyseniors.org/ ; https://mccormick.northwestern.edu/computer-science/news-events/news/articles/2026/helping-older-adults-confidently-navigate-technology.html
43. LUNA — https://www.wqad.com/article/news/local/the-current/iowa-senior-tech-help-luna-ai-seniors-technology-washington/526-856e09a9-2cb3-45d8-a8eb-1ac3d9bb6454
44. TechMaid — https://techmaid.ai/blog/best-tech-support-for-seniors
45. NIC MAP — https://www.nicmap.com/platform/
46. KFF MA enrollment 2025 — https://www.kff.org/medicare/medicare-advantage-in-2026-enrollment-update-and-key-trends/
47. SCAN HEALTHtech — https://www.scanhealthplan.com/Plans-and-Benefits/Supplemental-Benefits/2026/Supplemental-Benefits/Technology-Support-Benefit
48. USAging / AAAs — https://www.usaging.org/
49. PLA 2025 survey — https://www.ala.org/news/2026/06/new-pla-data-reveals-public-libraries-boosted-support-food-security-health-and
50. Digital Equity Act cancelled — https://www.ala.org/advocacy/federal-resources/broadband-policy/digital-equity-resources/DEA-FAQ
51. Willingness to pay (AARP Healthy@Home) — https://www.ageinplacetech.com/content/can-baby-boomers-afford-pay-parents-aging-place-technology
52. AgeTech Collaborative — https://agetechcollaborative.org/startups/
