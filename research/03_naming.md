# 03 — Naming: product + helper persona

Date: 2026-09-26. Checks run today: web search on each finalist, the USPTO trademark search API
(`tmsearch.uspto.gov`, live marks only), and domain RDAP (`rdap.verisign.com` for .com,
`pubapi.registry.google` for .app), one lookup at a time.

## Decision

| | |
|---|---|
| **PRODUCT** | **Barnaby** |
| **ASSISTANT (voice persona)** | **Barnaby** (same name, so there is only one name to remember) |
| **Spoken greeting / wake phrase** | "Hello, Barnaby" (older adults find "Hello" more natural and polite than "Hey") |
| **Tagline** | **"Help that never hurries."** |
| **Descriptor line** | "Barnaby, your patient computer helper. He does it with you and shows you how." |
| **Domain** | **hellobarnaby.com** (RDAP 404, so likely unregistered). Register these as backups at the same time: meetbarnaby.com, barnabyhelps.com, barnabyhelp.com, hellobarnaby.app (all 404). |
| **Default voice** | A warm, lower-pitched male voice at a slow rate. See the hearing notes below. |

For `app/src/product.js`: `name: 'Barnaby'`, `assistantName: 'Barnaby'`, `tagline: 'Help that never hurries.'`,
`website: 'https://hellobarnaby.com'`.

### Why Barnaby wins
1. **It is easy to hear.** Say it as BAR-nuh-bee. Every sound is low-frequency: b, open vowels, r, n. It
   has no s, f, th, sh, ch, k, t or p. Those are the consonants that age-related hearing loss (presbycusis)
   removes first ([Wikipedia: Presbycusis](https://en.wikipedia.org/wiki/Presbycusis);
   [MedLink: Presbycusis](https://www.medlink.com/articles/presbycusis)). It has 3 syllables and about 7
   phonemes. Wake-word guidance says to aim for about 3 syllables and at least 6 phonemes, and to avoid
   everyday words ([Picovoice: choosing a wake word](https://picovoice.ai/docs/tips/choosing-a-wake-word/);
   [Sensory 2026 wake-word guide](https://sensory.com/custom-wake-words-branded-voice-ux-guide-2026/)).
   "Hello, Barnaby" is 5 syllables, and no English word or common phrase sounds like it.
2. **It will not collide with names in the user's life.** Barnaby has never been in the US top-1000 baby
   names ([Behind the Name: no US data](https://www.behindthename.com/name/barnaby/top/united-states)).
   People born between 1935 and 1956 almost never have a spouse, sibling or friend called Barnaby. The
   helper will not wake up when they mention one, and no scammer's "Barnaby" can blend in with people
   they know. Compare Robin, Nora, Lorna and Walter, which were all common names in that generation.
3. **The meaning suits the job.** Barnaby is the English form of Barnabas, which Acts 4:36 explains as
   **"son of encouragement"** ([Behind the Name: Barnabas](https://www.behindthename.com/name/barnabas)).
   That describes a patient teacher who does the task with you. Many churchgoing users will recognise it.
4. **The associations help with the scam guard, and they show a capable older adult.** *Barnaby Jones*
   (CBS, 1973–1980, 178 episodes) starred Buddy Ebsen as a detective in his mid-sixties who comes out of
   retirement and catches crooks ([Wikipedia: Barnaby Jones](https://en.wikipedia.org/wiki/Barnaby_Jones)).
   Our 70–90 year olds watched it. *Midsomer Murders* (DCI Barnaby) is a PBS and Acorn favourite with the
   same audience. So the name suggests a calm, sharp person who spots trouble. The picture is of a capable
   older person, not a frail one.
5. **It is the cleanest name we checked.** The USPTO search returned **0 live marks for BARNABY in
   Class 9 (software), 42 (SaaS/AI) or 45 (personal/companion services)**. Its 14 live marks are
   restaurants, entertainment and a toy shop. On the web, the only uses near software are a developer IDE
   for AI agents ([barnaby.build](https://barnaby.build/)), a Brussels bar-payment app from 2015
   ([Crunchbase](https://www.crunchbase.com/organization/barnaby)) and a hobby robot repo on GitHub.
   None of them is a consumer, senior or tech-support product.
6. **It stands out from the competition.** Senior AI products almost all use warm female names: Call
   Mabel, Ramona, Norma, Lauren AI, LUNA, Gloria, Meela and ElliQ (sources in the conflict list below). A
   male helper with a lower voice looks different on the shelf, and research says it is also easier to
   hear (next point).
7. **A lower voice is easier to hear for our users.** Listeners with high-frequency hearing loss need a
   better signal-to-noise ratio to understand female talkers than male talkers. People with hearing loss
   often say women's voices are harder to follow
   ([PMC3370057](https://pmc.ncbi.nlm.nih.gov/articles/PMC3370057);
   [Univ. of Utah ASA poster](https://health.utah.edu/sites/g/files/zrelqx131/files/media/documents/2020/johnson-ferguson-asa.pdf)).
   A male persona lets the default voice be low-pitched without the name and the voice contradicting
   each other.

### Known risks with Barnaby and how to handle them
- **Someone registered heybarnaby.com on 2026-09-24** through Cloudflare. No site is live yet.
  getbarnaby.com was registered 2026-07-19 through GoDaddy and is parked. **Register hellobarnaby.com
  and the backups now**, before launch copy is published.
- **Nickname "Barney".** Barney is the purple children's dinosaur. Never shorten the name in the UI or
  voice. It is always "Barnaby".
- **Spelling.** People may type Barnabee or Barnabie. Buy barnabyhelps.com as well, and make the website
  and search ads say "Barnaby — B-A-R-N-A-B-Y" once.
- **Some users may want a female voice.** Offer a "softer voice" setting (slow, low alto) and keep the
  name. One persona is enough, so do not build a second.
- **Trademark.** This was a knock-out search, not legal clearance. Before spending on the brand, file
  BARNABY in Classes 9 and 42 (about $350 per class with USPTO base filing) and get a proper
  clearance search.

### How the name is used in the product (copy rules)
- Launcher button: **"Talk to Barnaby"**. Widget bubble label: **"Barnaby"**.
- Greeting: "Good morning, Anne. Barnaby is here whenever you need him."
- Trust line on the scam screen, the website and the welcome card:
  **"Barnaby will never phone you, never ask for money, and never ask for gift cards."**
  The distinctive name makes this rule easy to remember. Anyone calling as "Barnaby" is a scammer.
- On the website, speak to the families who set it up: "Set up Barnaby for Mum in 10 minutes."
- Never use "for seniors" or "for the elderly" in the name or the headline.

---

## Method

Hard filters (pass/fail): 1–3 syllables. None of the words senior, elder, grandpa, old, simple, easy or
assist. No famous-brand clash in software or AI. Not a common English word.

Weighted score, each criterion 1–5:

| Criterion | Weight | What 5 means |
|---|---|---|
| Hearing clarity | 25% | Only voiced, low-frequency sounds (m n l r w b d g plus open vowels). No s/f/th/sh/ch/k/t/p. |
| Warmth, trust, patience | 20% | Feels like a kind, capable person. The meaning and associations support it. |
| Dignity (not stigmatizing) | 10% | Not babyish, no "-ie" cuteness, not an "old lady" or "old man" joke, no negative idiom |
| Voice distinctness | 15% | Not a common word or name in the users' generation. Low false-trigger risk. Good wake-word length. |
| Brand/trademark conflict | 20% | No live USPTO marks in Classes 9/42/45 and no senior or assistant product with the name |
| Domain | 10% | A good .com form is free (hello-, meet-, -help) |

## Long list (54 candidates) and why each was cut

| # | Name | Result | Reason |
|---|---|---|---|
| 1 | **Barnaby** | **WINNER** | See above |
| 2 | Bellamy | runner-up | Clean, but formal and "upper-class" |
| 3 | Lorna | runner-up | Clean marks. Sounds like "Lauren" (Lauren AI for seniors). A common name in the users' generation. |
| 4 | Rowan | runner-up | Rowan TELS holds AI and legal software marks. A young, trendy baby name. |
| 5 | Marlo | runner-up | Crowded AI space: Marlo AI career coach, Marloo, and a pending AI SaaS mark |
| 6 | Mabel | shortlist, **killed** | USPTO **MABEL** (BYOD LLC) is registered in Class 42 for voice personal-assistant SaaS. **CALL MABEL** has a Class 45 filing for elder companionship and runs as the live product [callmabel.com](https://www.callmabel.com/). [mabelcare.com](https://www.mabelcare.com/about-us) does senior care placement. |
| 7 | Nora | shortlist, killed | 23 live marks in 9/42/45, including Nationwide Mutual's **NORA** chatbot (Class 42) and Meltwater NORA AI. 5+ AI apps called Nora. Every domain fallback is taken. |
| 8 | Ollie | shortlist, killed | [KaiOS "Ollie, your grandparent's AI companion phone"](https://www.indiegogo.com/en/projects/kaiostechnologies/ollie-your-grandparent-s-ai-companion-phone), [ollie.ai](https://try.ollie.ai/), and an OLLIE voice-interface mark held by Oliver IQ |
| 9 | Robin | shortlist, killed | Hinge Health **ROBIN** chatbot mark and Expper **ROBIN** AI companion robot mark. Robinhood. Sounds like "robbin'", which is wrong for a scam guard. |
| 10 | Nellie | shortlist, killed | Pending NELLIE AI SaaS mark. "Nervous Nellie" idiom. Diminutive. |
| 11 | Ramona | killed | [Ramona](https://hiramona.com/for-seniors/): an AI health companion for seniors |
| 12 | Norma | killed | [heynorma.ai](https://heynorma.ai/): "AI companion for seniors" |
| 13 | Luna | killed | [LUNA](https://www.wqad.com/article/news/local/the-current/iowa-senior-tech-help-luna-ai-seniors-technology-washington/526-856e09a9-2cb3-45d8-a8eb-1ac3d9bb6454): AI tech help for seniors (Iowa) |
| 14 | Lauren | killed | [Lauren AI](https://www.lauren-ai.com/): voice assistant for seniors |
| 15 | Gloria | killed | [hello-gloria.com](https://www.hello-gloria.com/): AI companion for older adults |
| 16 | Goldie | killed | [Hey Goldie](https://heygoldie.com/features/ai-assistant) uses our exact wake phrase for an AI assistant. [Goldie May](https://www.goldiemay.com/) is a genealogy tool, a popular hobby with our users. |
| 17 | Wendell | killed | [wendell.bot](https://wendell.bot/): "The AI agent that actually does the work" |
| 18 | Bonnie | killed | [bonnie.ai](https://bonnie.ai/) phone assistant. The Bonnie & Clyde association is wrong for a scam guard. |
| 19 | Lulu | killed | "Lulu: AI girlfriend" app ([Google Play](https://play.google.com/store/apps/details?id=com.lulu.app&hl=gsw)). Lulu.com. |
| 20 | Dewey | killed | Sounds like "do we", so it would false-trigger |
| 21 | Rosie | killed | The z sound. Rosie AI phone answering. |
| 22 | Hazel | killed | Weak h and z sounds. Hazel Health. |
| 23 | Della | killed | Too close to **Dell** in the computer category |
| 24 | Dolly | killed | Sounds like DALL·E. Databricks Dolly. A common noun. |
| 25 | Pearl | killed | The p sound. Pearl.com AI plus expert answers. Pearl dental AI. |
| 26 | Ruby | killed | Programming language. Ruby Receptionists. |
| 27 | Birdie | killed | Birdie is home-care software in the UK |
| 28 | Milo | killed | Milo, a family AI assistant |
| 29 | Arlo | killed | Arlo Technologies (NYSE: ARLO), which makes cameras |
| 30 | Arden | killed | 13 live marks in 9/42/45. Elizabeth Arden is a famous mark. |
| 31 | Ada | killed | Ada Health, an AI symptom checker |
| 32 | Alma | killed | Alma mental-health platform |
| 33 | Juno | killed | Juno was the users' 1990s email provider. Juno Therapy. |
| 34 | Winnie | killed | WINNIE (Winnie Inc.) software mark. Disney's Winnie the Pooh. |
| 35 | Wally | killed | Sounds like WALL·E |
| 36 | Otto | killed | Sounds like "auto". Otto Insurance. |
| 37 | Nola | killed | Reads as "New Orleans" |
| 38 | Orla | killed | Orla Kiely brand |
| 39 | Mae | killed | Sounds like "may" |
| 40 | June | killed | A month. June Oven. |
| 41 | Nell | killed | One syllable, too short for a wake word. Sounds like "no" or "nail". |
| 42 | Benny | killed | Casual. Benny Hill association. |
| 43 | Buddy | killed | Generic and patronizing. Many products use it. |
| 44 | Barney | killed | The purple dinosaur. Babyish. |
| 45 | Walter | killed | Cronkite gives it trust, but it was a top-30 name in the 1930s–40s (often a late husband's name). Breaking Bad. |
| 46 | Lorraine | killed | A common name in the users' generation. Quiche and region associations. |
| 47 | Wilbur | killed | Wilbur SaaS marks (Claim Central, GA Telesis). The pig. |
| 48 | Monroe | killed | Dozens of marks. The Marilyn association. |
| 49 | Mirabel | killed | Disney's *Encanto* heroine. Mirabel Technologies holds software marks. |
| 50 | Murray | killed | Sounds like "Mary" (a common name among users) and "hurry" |
| 51 | Harbor (product word) | killed | Weak h. Harbor Freight. A common noun. |
| 52 | Porchlight (product word) | killed | Has p, ch and t, all hard to hear |
| 53 | Beacon / Kindly / Lantern / Hearth / Nearby / Tandem (product words) | killed | Common words (false triggers). Hard consonants (k, t, th). Crowded marks. |
| 54 | Lumo | killed | Proton's **Lumo** AI assistant |

Other senior AI names already taken (avoid anything that sounds like them): ElliQ ([elliq.com](https://elliq.com/)),
Ato ([PRWeb](https://www.prweb.com/releases/ato-is-the-voice-first-ai-companion-to-combat-senior-loneliness-and-empower-family-caregivers-302756517.html)),
Apo, an AI tech support for older adults ([TheGerontechnologist](https://thegerontechnologist.com/the-first-ai-tech-support-for-older-adults-apo-by-carevocacy/)),
Meela, Reca, Sentai ([Reca blog](https://www.heyreca.com/blog/best-ai-companion-devices-for-seniors)),
Mabu robot ([BuddyX list](https://buddyxtheme.com/best-ai-tools-for-elderly-care/)), GrandPad.

## Shortlist scored (10)

Weighted total = 0.25·Hear + 0.20·Warm + 0.10·Dignity + 0.15·Distinct + 0.20·Conflict + 0.10·Domain

| Name | Hear | Warm | Dignity | Distinct | Conflict | Domain | **Total** | Key facts |
|---|---|---|---|---|---|---|---|---|
| **Barnaby** | 5 | 5 | 4 | 5 | 5 | 4 | **4.80** | 0 live marks in Classes 9/42/45. Never a US top-1000 name. hellobarnaby.com, meetbarnaby.com, barnabyhelp(s).com, hellobarnaby.app free. heybarnaby.com taken 2026-09-24. |
| Bellamy | 5 | 4 | 5 | 4 | 4 | 4 | 4.35 | Old French *bel ami*, "beautiful friend" ([BtN](https://www.behindthename.com/name/bellamy)). [Bellamy.ai](https://bellamy.ai/company) is a small recruiting startup. Swatch BELLAMY (payment watch, Class 9). hellobellamy.com, meetbellamy.com, bellamyhelp(s).com, hellobellamy.app free. |
| Lorna | 5 | 4 | 4 | 3 | 4 | 3 | 4.00 | No software marks and no senior AI called Lorna. Close to "Lauren" (Lauren AI). Only lornahelp(s).com free. |
| Rowan | 5 | 3 | 5 | 3 | 3 | 3 | 3.70 | Rowan TELS holds AI/legal marks in 9/42/45. In folklore the rowan tree wards off harm, which fits the scam guard. Only rowanhelp(s).com free. |
| Mabel | 5 | 5 | 4 | 4 | 1 | 2 | 3.65 | Direct competitor Call Mabel (elder AI companion calls). MABEL mark for voice personal-assistant SaaS. |
| Marlo | 5 | 3 | 4 | 4 | 2 | 3 | 3.55 | Pending AI SaaS mark (MKTG Reboot). [Marlo AI](https://apps.apple.com/us/app/marlo-ai/id6755945257) app. [Marloo](https://www.marloo.com/us). |
| Nellie | 5 | 4 | 2 | 3 | 3 | 2 | 3.50 | NELLIE AI mark filed. [Nellie AI](https://apps.apple.com/us/app/nellie-ai-book-writing-creator/id6738056993) book app. "Nervous Nellie". |
| Nora | 5 | 4 | 5 | 3 | 1 | 1 | 3.30 | Nationwide NORA chatbot mark. Meltwater NORA AI. [Many Nora AIs](https://www.noramed.ai/). |
| Ollie | 5 | 4 | 3 | 3 | 1 | 1 | 3.10 | KaiOS senior "Ollie" phone. ollie.ai. OLLIE voice-UI mark. |
| Robin | 5 | 4 | 4 | 2 | 1 | 1 | 3.05 | Hinge ROBIN chatbot mark. Expper ROBIN AI robot. Sounds like "robbin'". |

## Runner-ups (in order)
1. **Bellamy.** Gender-neutral. The meaning ("beautiful friend") is ideal. Clean in Class 42. Use it if
   Erol wants a neutral or female voice by default. Domain: **hellobellamy.com** (free).
2. **Lorna.** The best female option: soft, all sonorants, no software marks. It is weaker on
   distinctness because it was a common name in the users' generation and is close to "Lauren".
   Domain: lornahelp.com (free).
3. **Rowan.** Neutral, and the protective-tree story fits the scam guard. The main risk is the Rowan TELS
   AI marks. Domain: rowanhelp.com (free).
4. **Marlo.** Neutral and very audible, but the AI namespace is crowded. Domain: marlohelp.com (free).

## Domain check log (RDAP: 200 = registered, 404 = likely free)
- All 54 bare `<name>.com` domains returned **200** (taken). That includes barnaby.com, which has been
  registered since 1995 (Tucows).
- Barnaby: askbarnaby.com 200 (2016, Network Solutions, no site). heybarnaby.com 200 (2026-09-24,
  Cloudflare). getbarnaby.com 200 (2026-07-19, GoDaddy, parked). **hellobarnaby.com 404**.
  **meetbarnaby.com 404**. **barnabyhelp.com 404**. **barnabyhelps.com 404**.
  **barnabyhelper.com 404**. barnaby.app 200. **hellobarnaby.app 404**. **meetbarnaby.app 404**.
  **barnabyhelps.app 404**.
- Bellamy: askbellamy.com 200 (expired Squarespace site). heybellamy.com 200. getbellamy.com 200.
  **hellobellamy.com 404**. **meetbellamy.com 404**. **bellamyhelp(s).com 404**. bellamy.app 200.
  **hellobellamy.app 404**.
- Lorna: ask/hey/hello/meet .com all 200. **lornahelp(s).com 404**. lorna.app 200.
- Rowan: ask/hey/hello/get/meet .com all 200. **rowanhelp(s).com 404**. rowan.app 200.
- Marlo: ask/hey/hello/get/meet .com all 200. **marlohelp(s).com 404**. marlo.app 200.
- Nora, Robin, Ollie: every fallback checked was 200. Mabel: only mabelhelps.com was 404.
  Nellie: only nelliehelp.com was 404.

A 404 means no registration record was found today. It is not a guarantee: a domain can be reserved,
or be in the redemption or pending-delete stage. Confirm at the registrar when buying.

## Trademark check log (USPTO tmsearch API, live marks, Classes 9/42/45)
BARNABY 0 · BELLAMY 2 (Bellamy Sport pending Class 9, Swatch BELLAMY payment watch) · MABEL 3 (incl. BYOD voice-assistant
SaaS, CALL MABEL elder companionship) · ROWAN 9 · MARLO 9 · NELLIE 2 (incl. NELLIE AI) · NORA 23 · ROBIN 16 · ARDEN 13 ·
OLLIE 12 · WINNIE 2+ · WILBUR 6+. This is a knock-out search only. Get formal clearance before filing.
