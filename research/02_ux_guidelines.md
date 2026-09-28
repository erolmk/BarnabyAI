# 02 — UX guidelines for older adults (70–90), as buildable rules

Research date: 2026-09-26. Scope: the launcher, the floating helper widget, the teaching overlay, voice,
lessons, tech-support and scam screens described in `SPEC.md`. Every rule here is written so a builder
can apply it without re-reading the research. The name of the product and the assistant never appear here:
examples use `{assistant}` (from `app/src/product.js`) and a sample user called **Rose**.

---

## 0. The 12 non-negotiables (if you read nothing else)

1. **Text is never smaller than 20 px, and body text is 24 px.** Nothing is lighter than weight 400. Text never
   uses thin grey. Every text/background pair is **≥ 7:1** (WCAG 1.4.6 AAA), all of them, in both themes.
2. **Every clickable thing is ≥ 64 × 64 px, and main actions are ≥ 88 px tall,** with ≥ 16 px between targets.
3. **One click does everything.** No double-click, drag, right-click, hover-to-reveal, swipe or long-press is
   ever *required*. A second click within 600 ms on the same button is ignored (habitual double-clickers).
4. **Every icon has a visible word next to it.** No icon-only buttons, including the collapsed widget.
5. **One question at a time, answered with 2–4 big named buttons** plus "I'm not sure". The question comes
   last in the sentence. Spoken and written, identically.
6. **Nothing on our screens has a time limit.** Questions, confirm cards and warnings never auto-close.
   A listening window that ends quietly never says "timed out"; the buttons stay.
7. **Every spoken line is also shown as a caption,** word for word, and stays visible until the next line.
8. **Speech is ~10% slower than the voice's default, lower-pitched voice by default, with short pauses** —
   not slow, sing-song "elderspeak".
9. **We never blame the person.** Problems are the computer's or ours ("that's my fault"). No "Oops",
   no "invalid", no "just", no "simply", no "easy", no pet names.
10. **Things stay where they are.** Widget, Stop, Home and Talk are in the same place on every screen; tiles
    never reorder themselves; updates never move them.
11. **Teach while doing:** before every action, ring the target and say *what, where and why*; after it,
    say what changed. The person always does the personal and final steps (pick, type password, press Send).
12. **Nothing can happen that can't be undone without a confirm card** that shows the exact details in big
    type and waits as long as it takes.

---

## 1. Evidence base (what the rules are built on)

| Finding | Number | Source |
|---|---|---|
| Seniors (65+) vs 21–55 on real websites | success 55.3% vs 74.5%; time 7:49 vs 5:28; errors 2.4 vs 1.1 | NN/g, 2013 [1] |
| Seniors blame themselves for problems | 90% of the time vs 58% for younger users | NN/g [1] |
| Usability ability declines with age | ~0.8% per year from 25 to 60; 123 participants 65+ over ~20 years, 5 countries | NN/g, 2019 [2] |
| Main senior problems | tiny/light text, tiny targets, startling sounds, unforgiving input, poor error messages | NN/g [2][3] |
| Older users' needs | reduced contrast sensitivity & near focus; reduced dexterity; trouble with high-pitched sounds and background noise; reduced short-term memory, easily distracted | W3C WAI, updated 20 Nov 2025 [4] |
| WCAG covers most older-user needs | WAI-AGE literature review | W3C WAI [4] |
| Dark text on light background | better for **both** younger and older adults | Piepenbrock et al., Ergonomics 2013 [5] |
| Ageing lens yellows | blue light reaching retina falls sharply; **blue–yellow discrimination** worsens | Sci. Reports 2020 [6] |
| Hearing loss | ~1 in 3 aged 65–74; nearly half over 75 | NIDCD [7] |
| Presbycusis | high frequencies go first → women's/children's (high) voices become hard first | [8] |
| Touch targets for older adults | 19.05 mm button size gave best performance; spacing 3.17–12.7 mm lowered errors | Jin, Plocher, Kiff 2007 [9] |
| Mouse | double-click and drag-and-drop are among the hardest operations for older adults; cursor slips while clicking | Applied Ergonomics 2017 cursor-freeze study [10]; Smith, Sharit, Czaja 1999 [11] |
| Click assistance | suppressing slips/bounce clicks helped 5 of 11 motor-impaired users; 9 of 11 preferred it | Trewin et al., ASSETS 2006 (Steady Clicks) [12] |
| Voice assistants in older adults' homes | 24.8% of 2,552 requests failed; people repaired 65% of errors themselves, mostly by **repeating**; the assistant started the repair in < 5% | 15 adults 66–94, 4 weeks [13] |
| Being cut off | older adults pause longer mid-sentence; VAD cuts them off. "When the robot interrupts me, I feel like I've done something wrong." Barge-in agent default: 1.5 s | CHI 2025 [14] |
| Incremental clarification | asking to complete a cut-off sentence recovered 45.6% of interrupted questions | Frontiers in Dementia 2024 [15] |
| Preferred reply speed | expected feedback ~3.6–3.8 words/s (Mandarin); **the longer the reply, the slower they want it**; fast talkers want faster replies | 29 adults, mean 61.9 yrs [16] |
| Elderspeak | instructions in elderspeak were rated patronizing and made **no** difference to task performance; in dementia care resistiveness 0.55 vs 0.26 with normal talk | Kemper & Harden 1999; Williams et al. [17][18] |
| Training type | **action (procedural) training** beat concept training for older adults, immediately and after 1 month | Mead & Fisk 1998 [19] |
| Pace | older learners need more time and make more errors; **self-paced** training removed age differences | Kelley & Charness 1995 [20] |
| Take-home text | 113 adults 65–85: a top preference is self-training from **written material / a manual** | Mitzner et al. 2008 [21] |
| Written steps | 11 guidelines for senior-friendly instructions raised task success **52% → 86%** and cut time ~60% | Fan & Truong, TACCESS 2018 [22] |
| In-place highlighting | VLM tool with on-screen highlights + clarifying questions matched **in-person instruction** and lowered cognitive load (18 older adults) | GuideMe, CHI 2026 [23] |
| Do-for vs teach | taking the device and doing it for them "robs them of autonomy to learn" and creates shame; fear: "I'm going to press the wrong button and kill the phone" | Digital educators, 2025 [24] |
| Over-help | "Excessive dependence may inadvertently signal incompetence or fuel learned helplessness" (n = 480) | cross-sectional survey, China, 2026 [25] |
| Technology caregiving | 36 studies: AI should "support, don't replace", explain rather than hide, design for stability | Review, Aug 2026 [26] |
| Design mismatch | 60% of adults 50+ say tech is "not designed with their age in mind"; AI use 18% → 30% (2024→2025); privacy is top barrier | AARP Tech Trends 2026 (n = 3,838) [27] |
| Scams | $10k+ impersonation-loss reports up 4× (2020→2024), $100k+ up ~7×; fake security pop-ups are a top pattern | FTC Data Spotlight, Aug 2025 [28] |
| Apple Assistive Access | distill to 1–2 core features; fewer options; no hidden gestures or nested UI; **no timed interactions**; step-by-step flows; confirm destructive actions twice; icon **and** label | WWDC25 [29] |
| Microsoft Inclusive Design | recognize exclusion; learn from diversity; solve for one, extend to many; Windows min target 40×40 epx, 44×44 touch-optimized | [30][31] |
| Icons | "Icon labels should be visible at all times, without any interaction from the user." | NN/g [32] |
| Memory | recognition is easier than recall because it supplies cues | NN/g 2024 [33] |

What this adds up to: a slower, anxious, self-blaming user who is **capable** when the steps are concrete,
self-paced, visible on the real screen and written down afterwards — and who resents being talked down to.

---

## 2. Design tokens (numbers to build with)

### 2.1 Type

| Token | px at scale 1.0 | Weight | Use |
|---|---|---|---|
| `--fs-min` | 20 | 400 | the smallest text anywhere (timestamps, "or press F9") |
| `--fs-body` | 24 | 400 | body, lesson steps, field values |
| `--fs-button` | 26 | 600 | button labels, tile labels (tiles: 28) |
| `--fs-caption` | 28 | 500 (600 for the current line) | the helper's spoken words in the widget |
| `--fs-h3` | 28 | 600 | card titles |
| `--fs-h2` | 32 | 600 | screen titles, confirm-card question |
| `--fs-h1` | 40 | 600 | greeting, scam-warning headline |
| `--fs-display` | 64 | 600 | clock |

- Scale: all sizes multiply by `--ui-scale` (settings 1.0–1.6, steps of 0.1). First run shows three sample
  sentences at 1.0 / 1.2 / 1.4 and asks "Which one is easiest to read?" (recognition, not a settings page).
- Why 24 px: on a common 15.6" 1080p laptop at 125% scaling, 1 CSS px ≈ 0.225 mm, so 24 px Segoe UI has a
  cap height ≈ 3.8 mm ≈ 22 arc-minutes at 60 cm — comfortably readable with reading glasses; 16 px (NN/g's
  absolute web minimum) is ~15 arc-minutes. Our own arithmetic; tune on real users.
- Line height 1.5 for body (WCAG 1.4.8), 1.25 for headings. Paragraph gap 1em. Measure ≤ 60ch.
- Left-aligned, never justified, never centered for more than 2 lines. Sentence case. **No ALL CAPS**
  (one word of emphasis max, and bold is better). No italics for anything longer than a phrase.
- Fonts: app uses the Windows system font (zero download, always there):
  `"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`. Website may use **Atkinson Hyperlegible Next**
  (Braille Institute, free on Google Fonts since Feb 2025, 7 weights) [34]. Never a condensed, light or
  decorative face. Digits must be unambiguous (Segoe/Atkinson are).
- Links are underlined, always. Visited links: not needed in the app.

### 2.2 Colour (every ratio computed with the WCAG formula; text pairs ≥ 7:1, UI boundaries ≥ 3:1)

Light theme is the **default** (positive polarity advantage for all ages [5]). Dark is an opt-in setting
("Dark background"), useful for some people with cataract glare. The background is a warm off-white, not
pure white, to cut glare.

| Token | Hex | Pair | Ratio |
|---|---|---|---|
| `--bg` | `#F7F4EE` | `--text` on it | 15.69 |
| `--surface` (cards, tiles, widget) | `#FFFFFF` | `--text` on it | 17.22 |
| `--text` | `#1B1B1B` | — | — |
| `--text-2` (secondary text; the ONLY grey allowed) | `#3B3B3B` | on bg / surface | 10.20 / 11.20 |
| `--border` (tile/card/input outlines, 2 px) | `#6B6B6B` | vs bg / surface | 4.85 / 5.33 |
| `--primary` (Talk, main buttons, links) | `#0B4A8B` | white text on it | 8.87 |
| — | | primary as text on bg | 8.08 |
| `--primary-strong` (pressed/hover) | `#083A6E` | white on it | 11.41 |
| `--primary-soft` (selected background) | `#E3EDF8` | `--primary-ink #0B3566` on it | 10.34 |
| `--success` | `#1C5E2B` | white on it / as text on bg | 7.82 / 7.12 |
| `--danger` (Stop, delete) | `#9B1C1C` | white on it / as text on bg | 8.15 / 7.42 |
| `--warn-bg` (notice cards) | `#FFF4D6` | `--text` on it; `--warn-border #8A5A00` vs it | 15.72; 5.41 |
| `--caption-bg` (helper captions) | `#FFFBEA` | `--text` on it | 16.60 |
| `--focus` (keyboard focus ring) | `#1B1B1B` | vs bg | 15.69 |
| `--ring-a` / `--ring-b` (teaching ring, two-tone) | `#FFD000` / `#000000` | yellow vs black | 14.27 |

Teaching ring over **any** app: yellow band between two black bands. Against a white app the black edge gives
21:1; against a dark app the yellow gives ≥ 14:1. A single-colour ring would fail on some backgrounds.

Dark theme (opt-in):

| Token | Hex | Pair | Ratio |
|---|---|---|---|
| `--bg` | `#121417` | `--text #F4F4F4` | 16.78 |
| `--surface` | `#1E2228` | `--text` / `--text-2 #D0D0D0` | 14.52 / 10.36 |
| `--border` | `#8D96A0` | vs bg / surface | 6.15 / 5.33 |
| `--primary` | `#8CC0FF` | ink `#0B0F14` on it; as text on surface | 10.16; 8.44 |
| `--success` | `#86E0A0` | ink on it | 12.07 |
| `--danger` | `#FFA3A3` | ink on it; as text on surface | 10.09; 8.38 |
| `--warn-bg` | `#3A2E00` | `--text` on it | 12.16 |

Colour rules:
- Colour is never the only signal (WCAG 1.4.1): selected = soft background **+** 3 px primary border **+**
  a check mark **+** the word "Chosen". Danger buttons say what they do ("Delete 3 photos"), not just red.
- Do not rely on blue-vs-yellow or blue-vs-green differences between two things (lens yellowing [6]).
  Distinguish by lightness, words and position.
- Banned: grey text lighter than `#3B3B3B` on light backgrounds (e.g. `#999` is 2.85:1, `#757575` is 4.61:1 —
  both fail); placeholder text as the only label; text over photos; transparent buttons.
- `@media (forced-colors: active)` (Windows contrast themes): let system colours win; keep 2 px borders so
  buttons remain visible.

### 2.3 Targets, spacing, shape

| Token | Value | Notes |
|---|---|---|
| `--target-min` | 64 px | anything clickable (≈14–18 mm; WCAG 2.5.5 AAA asks 44) |
| `--target-primary` | 88 px | main actions, answer buttons, confirm Yes/No (≈20–24 mm ≈ Jin's 19 mm) |
| `--target-hero` | 112 px | "Talk to {assistant}" on the launcher |
| `--gap-target` | 16 px min, 24 px default | between adjacent targets (≈3.6–5.4 mm; Jin 3.2–12.7 mm) |
| spacing scale | 8 / 16 / 24 / 32 / 48 / 64 | `--space-1`…`--space-6` |
| `--radius` | 16 px (buttons, inputs), 24 px (cards, tiles), pill for the collapsed widget | |
| borders | 2 px on every button/input/tile | boundaries must be visible (WCAG 1.4.11) |
| focus | 4 px solid `--focus`, 3 px offset, on `:focus-visible` | exceeds WCAG 2.4.13 |
| shadow | one level only: `0 2px 6px rgba(0,0,0,.18)` | depth by border, not shadow |

- Clickable area = the whole visible shape plus padding; labels and icons inside are part of the target.
- Target sizes scale with `--ui-scale` too (bigger text must not squeeze buttons).
- No **disabled** buttons: a greyed button gives no reason. Keep it enabled; on click, say what is missing
  ("First pick a photo — click one so it gets a tick.").

### 2.4 Motion and sound

- Transitions ≤ 250 ms, ease-out, opacity/size only. No parallax, no sliding carousels, no auto-scroll,
  no confetti, no bouncing. Nothing flashes (WCAG 2.3.1): the fastest repeating change is the teaching-ring
  pulse, **1.6 s per cycle**, scale 1.00 → 1.06, opacity never below 0.7.
- `prefers-reduced-motion`: no pulse (ring gets 2 px thicker instead), all transitions 0 ms.
- The agent's own clicks: show the ring **≥ 1.2 s before** clicking so the eye can find it — never teleport-click
  unseen. (The native `click` moves the cursor instantly; the pause before it is the teaching.)
- Sounds: no alarms, no error buzzes, no sirens even for scams. One optional soft earcon when the microphone
  opens: ≤ 300 ms, low tone (< 800 Hz), ~12 dB quieter than speech, off-switch in settings. No background music
  ever (older ears struggle to separate sounds [4]).

---

## 3. Vision rules

1. Body 24 px, minimum 20 px, weights ≥ 400; buttons/labels 600. Scale 1.0–1.6 with first-run picker.
2. Every text pair ≥ 7:1 (table 2.2); every border/icon ≥ 3:1. Run the checker in §12 on any new colour.
3. Light theme default; dark opt-in; follow Windows contrast themes via `forced-colors`.
4. Icons 48–72 px, simple solid shapes, **always with a word**. Photos of real people for Family (recognition).
5. No text on images, no text in images. No thin dividers as the only separator — use space + 2 px borders.
6. Captions area uses `--caption-bg` so the helper's words are always found in the same yellowish panel.
7. The page never needs horizontal scrolling at 1280 × 720 CSS px, at any scale up to 1.6 (WCAG 1.4.10).
8. Long lists: max 6 items per view, then a big "Show more" button (no infinite scroll, no tiny scrollbar
   as the only way down; mouse wheel still works).

## 4. Motor rules (tremor, arthritis, slow pointing)

1. Only single left-click (or Enter/Space). **Never require** double-click, drag, right-click, hover, scroll-to-
   find, long-press, or chords. Provide buttons for everything a gesture might do (WCAG 2.5.1, 2.5.7).
2. **Double-activation guard:** ignore a second activation of the same control within 600 ms. Many older users
   double-click everything by habit; without this, "Send" or "Yes" fires twice.
3. **Slip tolerance:** targets ≥ 64 px with 16–24 px gaps absorb the small slips between press and release
   (Steady Clicks' main error type [12]). Do not put two different actions side by side with < 16 px between.
4. The widget can be moved **without dragging**: "Move me" button cycles bottom-right → bottom-left → top-left →
   top-right. Dragging is allowed as an extra, never the only way.
5. Volume and speed: "Louder" / "Quieter", "Slower" / "Faster" buttons. No sliders.
6. Keyboard: every control reachable with Tab, activated with Enter/Space, visible 4 px focus. F9 = Talk
   (SPEC). Esc = close the current card (never cancels a task silently — asks first).
7. Text entry is optional everywhere: voice or buttons first, "Type instead" box second.
8. Mouse-hardware suggestions go in lessons, not settings screens (e.g. Windows mouse-pointer size can be
   set by the helper after a yes).

## 5. Hearing rules

1. **Every spoken line is captioned at the same time**, identical wording (no paraphrase), in the widget caption
   panel. Captions stay until the next line replaces them; the last 20 lines are in "What {assistant} said".
2. Captions never time out; `ui.say` may wait a reading time to pace the agent (use `max(2500 ms, 350 ms ×
   words)` ≈ 170 words/min), but the text stays on screen.
3. Default voice is the **lower-pitched** natural voice available; setup offers "a deeper voice" / "a higher
   voice" with a sample sentence. Never pitch-shift a voice (sounds robotic and harder to understand).
4. Rate 0.9 × the voice's default (≈ 140–150 wpm); see §9.1. Volume follows Windows; our Louder/Quieter
   adjusts only the helper.
5. The listening state is shown visually, not only by a sound: the Talk button turns into
   "I'm listening… (press to stop)" with a steady glow. No blinking.
6. "Say it again" button always visible in the expanded widget; voice triggers: "what?", "pardon?",
   "say that again", "repeat", "I didn't hear".
7. Hearing-aid users: no background audio under speech; no sound-only alerts; scam warnings are visual first.

## 6. Cognition rules

1. **One thing at a time**: one question, one card, one highlighted target. Never stack dialogs. The confirm card
   replaces the answer area; it does not float over it.
2. **Recognition over recall** [33]: offer the likely answers as buttons ("Gmail, Outlook, AOL, Yahoo, I'm not
   sure"), show photos of family, show the email provider's logo **with its name**. Never ask "What is your
   email provider?" with an empty box.
3. **Ask once, remember forever** (memory.js). Say what you remembered: "You use Outlook — I'll open it."
4. **Always show where we are:** "Step 2 of 5 — pick the photo" at the top of the widget while a task runs.
   Before a task: the full step list (overview). After: a recap.
5. **No time limits** anywhere (WCAG 2.2.3 AAA). If another website has a timeout, the helper tells them
   ("This bank page closes by itself after a few minutes. No rush — if it closes, I'll open it again.").
6. **Consistent placement** (WCAG 3.2.6): Talk bottom of launcher; widget same corner; in the widget: Stop,
   Home, Say it again always in the same bottom row, same order. Tile order is fixed by the person/family,
   never "smart"-reordered.
7. **No hidden UI**: no hamburger menus, no right-click menus, no tooltips as the only explanation, no
   "swipe to reveal". Apple's rule applies: avoid hidden gestures and nested UI [29].
8. **Undo over "Are you sure?"** where possible; where not (send, delete, buy, change settings): confirm card
   with the specifics (§11.3).
9. **Plain words** (glossary §8.4). Reading level: short sentences, ≤ 15 words each, one idea each.
10. **Status is never silent**: while the agent works, the widget says what it's doing; spoken progress at
    most every ~10 s (§9.7).
11. "I'm not sure" is always an answer, and it is handled, not punished (the helper detects instead).

## 7. Emotion and dignity rules

The user fears breaking the computer, blames themself (90% [1]), dislikes being treated as old or slow, and
worries about privacy and scams. The helper is a **calm, competent adult who is on their side.**

1. **Never blame, never imply fault.** Errors are "that didn't work", "the website didn't answer", "that's my
   fault — I misheard". Never "you clicked the wrong thing".
2. **Normalise:** "Lots of people find this page confusing — it's badly laid out." (Blame the design, truthfully.)
3. **Reassure about breaking things only when it is true**: "You can't break anything by trying things here.
   I'll stop you before anything that can't be undone." (This is true because of the guardian + confirm cards.)
4. **Dignity:** use the name they chose at setup ("What should I call you?" — Rose / Mrs. Alvarez). No pet names
   (dear, honey, sweetie, young lady), no baby-talk, no exaggerated praise, no "we" that means "you"
   ("Shall we open our email?"). "We" only when both act ("We'll do this in 4 steps").
5. **Praise is specific and rare:** once per task step that *they* did, and at the end. "That's it — you attached
   the photo." Not "Great job!!" after every click.
6. **Never say** "easy", "simple", "just", "simply", "obviously", "quick". If it goes wrong, those words say
   "you failed at something easy".
7. **Don't say "senior", "elderly", "old"** anywhere in the product UI, onboarding or voice. (Marketing site can
   talk about "parents" and "families".) 60% already feel tech ignores their age [27]; the fix is good design,
   not a label.
8. **Control stays with them:** "Stop" is always one click; "Do it for me" is always available and never
   commented on; the helper asks before doing anything they might want to do themselves.
9. **Privacy honesty:** say what is looked at, only when true. "While I'm helping you, I look at your screen so I
   know where to click." Never claim "nothing leaves this computer" if screenshots go to a model.
10. **Calm, never alarming**, even for scams: plain statement, what it is, what to do, one big button.
11. **Avatar**: a calm adult face or a simple emblem. No cartoon baby, no mascot that jumps around.

---

## 8. Copywriting rules

### 8.1 Rules
1. Sentences ≤ 15 words; ≤ 2 sentences per caption; one idea per sentence.
2. Lead with what happens or what to do; reason second. Verb first in instructions ("Click …", "Type …").
3. Name things exactly as the screen names them, in quotes or bold: click **"New mail"**. Add colour + position:
   "the blue **Send** button, top left".
4. Numbers as digits ("3 photos", "Step 2 of 5"). Times in speech: "half past three".
5. No codes, no English-only tech words, no acronyms without the plain word (§8.4).
6. Buttons say the outcome, not "OK": "Yes, send it", "No, change something", "Close this page for me".
7. Max one exclamation mark per screen; usually none.
8. Questions end the message. Choices are listed in the order the buttons appear.

### 8.2 Before → after

| Before (don't) | After (do) |
|---|---|
| Error 0x80070005: Access is denied. | Windows wouldn't let me change that. Nothing is broken. I'll try another way. |
| Invalid input. | I didn't catch that — my fault. Could you say it again, or press a button? |
| Oops! Something went wrong. | That didn't work — the website didn't answer. I'll try again. |
| Are you sure? [OK] [Cancel] | This sends the email to Anne Marie Kowalski. Send it? [Yes, send it] [No, change something] |
| Just click the hamburger menu. | Click the three short lines at the top left — this website keeps its menu there. |
| Great job, sweetie!! | That's it — you picked the photo. |
| Shall we check our email? | I'll open your email. |
| Please enter your credentials. | Please type your password in the box I've circled. I won't look. Take your time. |
| Your system is low on memory. | Your computer is slow because 23 programs are open. Closing the ones you're not using will help. |
| Session timed out. | (Never shown by us. If a website did it:) That page closed itself — websites do that. I'll open it again. |
| Download the attachment. | Save the photo onto this computer. |
| Upload a file. | Add the photo to the email. |
| Tap / Right-click / Long-press here. | Click the ringed button. |
| Your request could not be processed. Please try again later. | Outlook isn't answering right now. Let's try again in a minute — I'll remind you. |
| WARNING! VIRUS DETECTED! | This page is pretending to be Microsoft. It's a trick. Your computer is fine. |
| Easy! Simply select a photo. | Click a photo you'd like to send. It will get a tick. |
| You clicked the wrong button. | That opened a different page — no harm done. I'll take us back. |
| Allow notifications? | This website wants to send you pop-up messages. Most people say no. Shall I say no? |

### 8.3 Banned words (lint them)
`oops, uh-oh, whoops, invalid, illegal, fatal, abort, execute, fail/failed (about the person), error (in
headlines), just (as in "just click"), simply, easy, easily, obviously, quick(ly) (as a promise), senior,
elderly, old (about people), dear, honey, sweetie, sweetheart, young lady, good girl/boy, user, input, submit
(in our own UI), hex codes like 0x…, ALL CAPS words`.

Paste-ready check (for `ui.say` / captions / UI strings in tests):
```js
// ponytail: regex lint, not NLP — catches the common slips; human review still needed.
const COPY_LINT = /\b(oops|uh-?oh|whoops|invalid|illegal|fatal|abort(ed)?|execute|simply|obviously|easy|easily|just (click|press|type|tap)|senior|elderly|dear|honey|sweetie|sweetheart|young lady|good (girl|boy)|0x[0-9a-f]{4,})\b|!!/i;
const CAPS_LINT = /\b[A-Z]{5,}\b/;   // case-sensitive on purpose: long ALL-CAPS words
const copyOk = (s) => !COPY_LINT.test(s) && !CAPS_LINT.test(s);
```
("dear" also hits "Dear Anne Marie" in a drafted email body — lint the helper's own speech/UI, not email drafts.)

### 8.4 Plain-word glossary (use the right column in speech and UI)

| Tech word | Say |
|---|---|
| browser / Edge / Chrome | the internet window (name it once: "Edge, the internet program") |
| tab | the page names along the top of the internet window |
| URL / address bar | the web address / the long box at the very top |
| icon | the little picture |
| cursor / pointer | the arrow |
| scroll | move the page down — roll the wheel on the mouse toward you |
| download | save onto this computer |
| upload / attach | add (the photo) to (the email) |
| app / application | program |
| pop-up | a box that jumped up |
| notification | a message in the corner |
| log in / sign in | sign in (keep; it's on the screen) |
| cache / cookies / temp files | leftover files the internet window keeps |
| startup apps | programs that start by themselves when the computer turns on |
| RAM / memory | the computer's short-term memory (only if needed) |
| CPU | the part that does the work |
| disk / storage | space for your files |
| update | a new version from Microsoft |
| reboot / restart | turn it off and on again (Restart) |
| two-factor code | a 6-number code the website just sent to your phone |
| phishing | a fake email pretending to be a company |
| malware | harmful software |
| settings | Settings (keep; it's on the screen) |

---

## 9. Voice script rules

### 9.1 How it sounds
- **Rate** 0.9 × voice default (Web Speech `rate = 0.9`; System.Speech `rate:-1`; SSML `prosody rate="-10%"`).
  Settings: Slower 0.8 / Normal 0.9 / Faster 1.0. Never below 0.75 — very slow speech is elderspeak and does not
  help comprehension [17]. Replies longer than 25 words: another −0.05 (longer → slower preferred [16]).
- **Pauses:** 350 ms between sentences (split into separate utterances or `<break time="350ms"/>`); 600 ms after
  "Step 2 of 5."; open the microphone 300 ms after speech ends (avoid hearing ourselves).
- **Pitch:** natural, lower-pitched voice default; no pitch shifting; normal adult intonation (no sing-song).
- **Length:** ≤ 2 sentences (≤ 25 words) per turn when a reply is expected. Longer explanations are split with
  "Shall I go on?"
- **Emphasis:** the one key word per sentence (the button label). Names of buttons in the same words as the
  screen.

### 9.2 Turn-taking (listening)
| Parameter | Default | Range | Why |
|---|---|---|---|
| end-of-speech silence (VAD) | **1.6 s** | 1.0–3.0 s, adaptive | older adults pause longer mid-sentence; being cut off feels like their fault [14] |
| extend if the transcript ends mid-phrase ("and", "the", "to", "um", "uh", "so") | +1.5 s once | | then use incremental clarification: "Send the photos to…?" [15] |
| no speech after a question | 8 s → one gentle reprompt | | "Take your time. You can say Gmail, Outlook, or press a button." |
| still nothing | +12 s → close mic quietly | | buttons stay; widget: "Press Talk or F9 when you're ready." Never "timed out". |
| barge-in | stop speaking within 300 ms | | on "stop", "wait", "hold on", "what?", Stop button, Talk button, F9 |
| adapt | if the person was cut off twice (they keep talking after we answered), +0.4 s VAD, remember it | | |

### 9.3 How to ask
1. **Yes/No** for confirmations and single decisions: "Is that the right Anne Marie?"
2. **2–4 named choices + "I'm not sure"** for selections, spoken in button order: "Which email do you use:
   Gmail, Outlook, AOL, or Yahoo?" Never more than 4 spoken choices; a 5th+ goes on screen only as "Something else".
3. **Open questions only for things only they know or author**: "What would you like the note to say?" —
   and immediately offer a default: "Or I can write a short one for you."
4. Accept loose answers: "the first one", "the blue one", "that one", "Outlook please", "yeah". (`ui.ask` maps
   speech to the closest choice.) If two choices are equally close, ask a yes/no about the best one.
5. Never ask what the screen/memory already knows. Never ask two things in one question.
6. Before asking for something personal, say why: "To find her email address, I'll look in your contacts. Is
   that all right?"

### 9.4 Hesitation, silence and "I don't know"
- Silence after a question = thinking, not failure (§9.2 timings). One reprompt, then wait with buttons.
- "Um… I don't know" / "I'm not sure" → "That's fine — I'll find out." Then detect (open windows, taskbar pins,
  email address ending; see playbooks §1.3).
- Mid-task silence while they're looking for something (teach mode): after 8 s, offer help once:
  "Would you like me to point to it?" After 20 s without progress: ring it and say where.

### 9.5 Repeating and misunderstanding
- "What?" / "Say it again" → repeat the last line **slower (−0.05) and in simpler words**, not word-for-word louder.
- Misheard once: "Sorry, I didn't catch that — my fault. Could you say it again, or press one of the buttons?"
- Misheard twice on the same question: "Let's use the buttons for this one." (Buttons only; no more voice
  retries for that question.)
- Heard but ambiguous: say what you heard: "Did you say Anne Marie, or Annie?" (yes/no or two buttons).
- The helper starts the repair itself (only < 5% of commercial VA errors were assistant-initiated, and those
  resolved better [13]).

### 9.6 Confirming
- Read back exactly what matters, **one critical item per sentence**: "This will go to Anne Marie Kowalski —
  annemarie dot k at gmail dot com. With 1 photo, of the garden. Is everything right?"
- Show the same on a confirm card (§11.3); spoken summary ≤ 3 sentences, the card holds the full text.
- Never read out passwords, card numbers, codes. Never ask for them by voice.
- The person presses Send/Buy/Submit themselves: "Last step is yours: press the blue **Send** button — I've
  circled it."

### 9.7 While working (no anxious silences)
- Within 1 s of any request: an acknowledgement ("All right — I'll get your photos.").
- Before each action: the `explain` line (§10.3). If an action/page takes > 6 s: "Still opening Outlook — it's
  slow today." Then at most every ~10 s, varied wording. Never silent > 10 s during a task (long silences raise
  apprehension [14]).
- Waiting for them: no nagging. One offer of help (§9.4), then quiet.

### 9.8 Voice scripts (templates)

Greeting (launcher opens): "Good morning, Rose. It's Friday, the 26th. Press Talk if you'd like help."
(Once per session; not every time the launcher is shown.)

Starting a task: "I can help with that. It's {N} steps: {step 1}, {step 2}, {step 3}. I'll do the fiddly bits and
show you each one."

Handing a step to them: "Your turn: {verb} the {colour} {label} {position} — I've circled it."

After their action: "That's it — {what they did}. {What changed on screen}."

Personal step: "This part is yours. Please type your password in the circled box. I won't look — take your time.
Say 'done' or press Done when you've finished."

Stop pressed: "Stopped. Nothing else will happen. Would you like to go back home, or carry on later?"

Done: "Done — {outcome}. I've saved the steps as a lesson called '{their words}'. Would you like them printed?"

Something failed: "That didn't work — {plain reason}. {Next thing I'll do / choice}."

Can't do it: "I can't do that one safely. {Why, one sentence}. {Who can: e.g. 'Your bank can, on the number on
the back of your card.'}"

---

## 10. Teach-while-doing: the interaction pattern

Why: older adults learn best from **concrete actions** (not concepts) [19], at **their own pace** [20], shown **in
place on the real screen** [23], with **written steps to keep** [21][22], and they lose confidence when someone
takes the device away and does it for them [24][25]. So the helper does the fiddly parts, but every action is a
visible, named, repeatable step, and control is handed back step by step over time.

### 10.1 The loop: PLAN → (LOOK → DO → SEE) × steps → RECAP → HAND-OVER NEXT TIME

1. **PLAN** — say the goal and the step names; show the numbered list in the widget ("Step 1 of 5 …").
   (Fan & Truong G1/G6: overview first, goal for grouped steps [22].)
2. For each step:
   - **LOOK**: ring + arrow + label on the target (overlay), and say *what, where, why*:
     "Next, the blue **New mail** button, top left — that starts a new email." Ring stays ≥ 1.2 s before any click.
   - **DO**: depending on the hand-over level (10.2), the helper clicks, or the person clicks (`guide_user` waits
     for their real click inside the ring).
   - **SEE**: name the result: "A new email opened on the right. That's where you write." (G10: show the
     post-action state.) If the result is wrong: fix it without blame (10.4).
3. **RECAP** — specific credit for what *they* did; save the lesson; offer printing.
4. **HAND-OVER NEXT TIME** — next time the same lesson/task comes up, offer the next level:
   "Last time I did the Outlook part. Want to try it yourself while I watch?" [Yes, I'll try] [No, you do it].

### 10.2 Hand-over ladder (fading), per step type, stored in the lesson

| Level | Name | Helper | Person |
|---|---|---|---|
| 0 | I do, you watch | rings, explains, clicks, names result | watches |
| 1 | You do, I point | rings + says where, waits for their click | clicks |
| 2 | You do, I hint | says where in words only; ring appears after 8 s, on "where?", or after a wrong click | finds and clicks |
| 3 | You do, I'm here | silent; steps in after 20 s without progress or on a wrong click | does it |

- Mode mapping: **"Do it for me"** (`do`) = level 0 for everything except personal/final steps;
  **"Do it together"** (`together`, default) = level 0 for routine clicks, level 1 for personal/final steps;
  **"Show me how"** (`teach`) = level 1 minimum for every step.
- Personal and final steps (pick photo, type password/code, press Send/Buy/Post) are **always ≥ level 1**.
- Promote a step type after it succeeded twice at a level (across sessions) — only by *offering*, never
  automatically. Demote instantly and silently on trouble ("Here — I've circled it.").
- "Do it for me" is one click away at every level, and choosing it is never commented on.
- Store per lesson step: `{text, action, target, level, doneByPerson: n}` (extends the SPEC lesson format).

### 10.3 Narration (`explain` field) rules for the brain
- Before the action, present tense, ≤ 20 words: **I'm + verb + the [colour] "[exact label]" [thing] [position]
  — [purpose].** "I'm clicking the blue 'Send' button, top left — that sends the email." No filler, no jargon.
- After the action (next `say`): what changed, ≤ 12 words. "The email is sent — it's in 'Sent Items' now."
- Use the words printed on the screen exactly (G7 consistent language [22]); add colour/shape for recognition.
- Never narrate invisible technical steps ("waiting for the DOM"). Skip narration for scrolling and waiting
  unless > 6 s (then a progress line).
- Paste-ready system-prompt fragment for `agent.js`:

```text
VOICE AND TEACHING STYLE (the person is 70-90, capable, may be anxious; you are a calm adult helper):
- Every action tool's "explain": one sentence, max 20 words: "I'm <verb>ing the <colour> '<exact on-screen label>'
  <thing> <position> - <what it does>." Use the screen's own words. No jargon (say "save onto this computer",
  not "download"; "the internet window", not "browser").
- After each action, in your next message, say in max 12 words what changed on the screen.
- Ask one question at a time, question last, with 2-4 short choices plus "I'm not sure".
- Personal steps are the person's: choosing photos/files, typing passwords or codes, pressing Send/Buy/Post/Submit.
  Use guide_user for those and wait. Always use confirm before anything that sends, buys, deletes, posts or changes
  settings.
- Never blame the person. If something goes wrong: "That didn't work - <plain reason>. <what you'll do>."
- Never say: oops, invalid, just, simply, easy, obviously, dear, honey, sweetie. No "we" meaning "you".
- Praise only what they actually did, specifically, once: "That's it - you attached the photo."
- Keep each spoken message under 25 words unless they asked for an explanation.
- done.summary: one sentence of outcome. lesson steps: 3-10 steps, each "Verb + exact label + where + what you'll see".
```

### 10.4 When the person goes off-track
- Wrong click (teach levels): "That opened a different page — no harm done. I'll take us back." Press Esc/Back,
  re-ring the target. Never "wrong".
- They take over mid-task in `together` mode (they start clicking): pause, watch, then "Carry on — I'll help if you
  want." Resume when they say so or after they stop for 10 s.
- They get overwhelmed ("I can't do this"): "You're doing fine — this page is confusing. Shall I do this part and
  you watch?" [Yes, you do it] [No, I'll keep going].
- Stop pressed: stop immediately, clear overlay, say what state things are in ("The email is saved as a draft.
  Nothing was sent.").

### 10.5 The lesson card (written take-home steps) — applies Fan & Truong's 11 guidelines [22]
- Title in their words: "Send photos to Anne Marie".
- "You'll need": the programs and things used (G1 overview): "Your iCloud photos · Outlook · Anne Marie's email".
- 3–10 numbered steps, each **self-contained** (G3), with everything needed at that step (G4), nothing
  irrelevant (G5), a goal line for grouped steps (G6), exact on-screen words in **bold** (G7), a small cropped
  picture of the button with the ring (G8), plain terms (G9), and **what you'll see after** (G10):
  > **3. Click "New mail"** — the blue button at the top left of Outlook.
  > You'll see an empty email on the right side.
- "Also works for": similar tasks (G11): "Sending a document — same steps, pick the document in step 2."
- Buttons: **"Walk me through it again"** (replay in teach mode), **"Print these steps"**, "Delete lesson" (confirm).
- Print style: 20 pt body, 28 pt title, black on white, 1.5 line spacing, one step per block, a tick box beside
  each step, footer "Made by {assistant} on {date}". Cropped pictures only (never a full screenshot with
  private emails in it).

### 10.6 Worked example — "Send photos from iCloud to Anne Marie" (together mode)

| Who | Line / action | Pattern |
|---|---|---|
| Rose | (presses Talk) "I want to send my friend Anne Marie some photos from my iCloud." | |
| {assistant} | "I can help with that. It's 5 steps: open your photos, pick them, save them, write the email, and send. I'll do the fiddly bits and show you each one." Step list appears. | PLAN |
| {assistant} | "Which email do you use: Gmail, Outlook, AOL, or Yahoo?" [Gmail] [Outlook] [AOL] [Yahoo] [I'm not sure] | one question, recognition |
| Rose | "Outlook." → `remember` "Rose uses Outlook" | |
| {assistant} | "Step 1 of 5. I'm opening the iCloud website in Edge — that's where your iPhone photos are kept." | LOOK/DO |
| {assistant} | (sign-in page) "iCloud wants your Apple password. Please type it in the box I've circled. I won't look — take your time." Ring on the field; waits for "done". | personal step, level 1 |
| {assistant} | "You're in. These are your photos, newest at the top." | SEE |
| {assistant} | "Step 2 of 5 is yours: click a photo you'd like to send. It gets a tick." Waits for click. | personal step |
| Rose | clicks the garden photo | |
| {assistant} | "That's it — the garden photo. Any more?" [That's all] [Pick another] | SEE + choice |
| {assistant} | "Step 3. I'm clicking the download button at the top right — that saves the photo onto this computer." (ring 1.2 s, click) "It's saved in your Downloads folder." | LOOK/DO/SEE |
| {assistant} | "Step 4. I'm opening Outlook… I'm clicking the blue 'New mail' button, top left — that starts a new email." | |
| {assistant} | "I found Anne Marie Kowalski in your contacts — annemarie dot k at gmail dot com. Is that her?" [Yes, that's her] [No] | confirm identity |
| {assistant} | "What would you like the note to say? Or I can write a short one." | open question + default |
| Rose | "Tell her these are from the garden party." | |
| {assistant} | writes "Hi Anne Marie, here are the photos from the garden party. Love, Rose." "I'm clicking the paper clip, 'Attach file' — that adds the photo to the email." | |
| {assistant} | Confirm card: To / Subject / Message / 1 photo (thumbnail). "Is everything right?" [Yes, that's right] [No, change something] | confirm |
| {assistant} | "Step 5 is yours: press the blue **Send** button — I've circled it, top left." `guide_user` waits for her real click. | final step = person |
| {assistant} | "Sent. Anne Marie will get it in a minute or two." | SEE |
| {assistant} | "You chose the photo and sent the email yourself. I've saved the steps as 'Send photos to Anne Marie'. Would you like them printed?" [Print them] [No thanks] | RECAP |
| (next time) | "Last time I did the Outlook part. Want to try it yourself while I watch?" | HAND-OVER |

### 10.7 Tech support voice pattern ("my computer is slow")
1. "Let me check your computer. This only looks — it doesn't change anything. About 20 seconds."
2. Findings in ≤ 3 plain points, biggest first, with a number the person can picture:
   "Your computer isn't broken — it's busy. 14 programs start by themselves every morning, and the internet window
   has 31 pages open."
3. Offer ≤ 3 fixes, one confirm each, saying what it does and that it's reversible:
   "Shall I stop Spotify, Teams and Zoom from starting by themselves? They'll still open when you click them."
   [Yes, do it] [Not now] [Tell me more]
4. After: re-check and report the difference in plain words. Restart is suggested, never forced:
   "Done. It'll be quicker after you restart — do it whenever suits you."

---

## 11. Component specs

### 11.1 Launcher
- Normal maximised window (not kiosk; they must reach other programs). Background `--bg`.
- Top row: greeting "Good morning, Rose" (`--fs-h1`) left; clock (`--fs-display`) + "Friday, September 26"
  (`--fs-h3`) right. Weather one line, optional.
- Tiles: **3 × 3 grid of wide tiles** (icon 64–72 px left, label `--fs-h3` 600 right, optional one-line hint
  `--fs-min` in `--text-2`), min height 140 px, gap 24 px, 2 px border, radius 24, surface background.
  At 1280 × 720 CSS px and scale 1.0 the whole launcher fits without scrolling (header 80 + 3 × 140 + 2 × 20 +
  Talk 96 + padding ≈ 708 px). At larger scales the grid becomes 2 columns and scrolls vertically, with a visible
  "More ↓" button.
- Hero Talk button at the bottom: full width (max 960 px), `--target-hero` tall, `--primary`, white text
  "Talk to {assistant}" + microphone icon, sub-line "or press F9" (`--fs-min`).
- Hover is cosmetic only (border → primary, background → `--primary-soft`); nothing appears on hover.

### 11.2 Helper widget
- **Collapsed**: a pill ~ 200 × 88 px, bottom-right, 24 px above the taskbar: avatar 56 px + the word **"Help"**
  (`--fs-button`, 600). Never icon-only. Always on top; never covered by a website pop-up.
- **Expanded** (480 px wide, up to 70% of screen height), top to bottom:
  1. Status line: "Ready when you are" · "I'm listening…" · "Thinking…" · "Working on it — step 2 of 5" · "Your turn".
  2. Step list (when a task runs): current step bold with ▶, done steps with ✓ and `--text-2`.
  3. Caption panel (`--caption-bg`, `--fs-caption`): current line 600, previous line above in `--text-2`.
  4. Answers: stacked full-width buttons, `--target-primary` tall, max 4 + "I'm not sure". Confirm → §11.3.
  5. "Type instead" box, 64 px tall, `--fs-body`, visible label (not placeholder).
  6. Big Talk button 88 px.
  7. Fixed bottom row, same order everywhere: **[Say it again] [Stop] [Home] [Move me]**, each ≥ 64 px, icon + word.
     Stop uses `--danger`.
- Collapse only when the person presses Home/collapse or the task ends and 0 questions are open.

### 11.3 Confirm card
- Replaces the answer area (widget) or appears centred on the overlay for big content; never auto-closes.
- Title question `--fs-h2`: "Ready to send this email?"
- Rows (label `--fs-body` 600 `--text-2`, value `--fs-body` `--text`): To (name **and** full address), Subject,
  Message (full text, never truncated; scroll inside with "Show all" button if long), Photos (96 px thumbnails +
  count), Amount (for any money, huge: `--fs-h2`).
- Buttons: **[Yes, that's right]** `--primary`, 88 px; **[No, change something]** secondary (surface + 2 px border).
  Irreversible delete: second confirm with the consequence stated ("They'll go to the Recycle Bin").
- Initial keyboard focus on the card title, not on Yes (prevents accidental Enter).

### 11.4 Teaching overlay (ring, arrow, label)
- Ring: target rect + 12 px padding, radius 16; bands: 3 px `#000`, 6 px `#FFD000`, 3 px `#000`.
- Label bubble: `--fs-button` 600, `#000` text on `#FFD000` (14.3:1), 2 px black border, placed outside the target
  on the side with most space; 48 px arrow pointing at the ring.
- Spotlight: while waiting for the *person's* click, dim everything else to 20% black (fade 250 ms); remove on click.
  No dimming when the helper clicks.
- Pulse 1.6 s (reduced-motion: none). Click-through except when showing a warning.
- Coordinates: the overlay uses DIP; convert from physical px via the monitor scale (SPEC).

### 11.5 Scam warning (full-screen, calm)
- Opaque `--bg` at 96% over everything; card max 760 px; shield icon (not a skull), no red flashing, no alarm sound.
- Headline `--fs-h1`: "This looks like a scam."
- Body `--fs-body`, ≤ 3 lines, the specific tell + what's true + what to do:
  "This page says your computer has a virus and shows a phone number. Microsoft never does that. Your computer is
  fine — don't call the number."
- Buttons: **[Close this page for me]** (primary) · **[Call Anna]** (if family set) · [It's something else] (secondary).
- Spoken once at normal pace. Family alert per SPEC. For phone-call scams (asked via "Is this a scam?"), FTC advice
  in plain words: "Hang up. Call the company on a number you know — like the one on your card." [28]

### 11.6 Support result card
- Title = one-sentence verdict ("Your computer is busy, not broken."). Up to 3 finding rows with a plain number.
- Up to 3 fix cards: what it does · is it reversible · [Yes, do it] [Not now]. After: "Before → after" in words.

---

## 12. UI review checklist (tick every box before merging a screen)

**Vision**
- [ ] No text < 20 px at scale 1.0; body 24 px; no weight < 400.
- [ ] Every text pair ≥ 7:1, every border/icon ≥ 3:1 — checked with the script below, in light **and** dark.
- [ ] No grey text other than `--text-2`; no placeholder-only labels; no text on images.
- [ ] Works at scale 1.6 and at 1280 × 720 without horizontal scroll or clipped text.
- [ ] Every icon has a visible word; links underlined.

**Motor**
- [ ] Every clickable ≥ 64 × 64 px; primary actions ≥ 88 px; ≥ 16 px between targets.
- [ ] Nothing requires double-click, drag, right-click, hover, long-press or a slider.
- [ ] Second activation within 600 ms is ignored.
- [ ] Everything works by keyboard; 4 px focus ring visible on every control.
- [ ] No disabled buttons — missing prerequisites are explained on click.

**Hearing**
- [ ] Every spoken line appears as a caption, identical wording, and stays until replaced.
- [ ] "Say it again" works (button + voice) and repeats slower/simpler.
- [ ] No information is sound-only; no background audio; no alarm sounds.

**Cognition**
- [ ] One question/card/highlight at a time; no stacked dialogs.
- [ ] Choices offered as buttons (2–4 + "I'm not sure"); nothing asks the person to recall a fact memory already has.
- [ ] Current step "Step N of M" visible during tasks; plan shown before, recap after.
- [ ] No timers, auto-dismiss, carousels, auto-advance.
- [ ] Stop / Home / Say it again / Talk in the same place as on every other screen.
- [ ] No hidden menus, hamburger icons, tooltips-as-only-help.

**Emotion & copy**
- [ ] `COPY_LINT` passes on every string and on sample agent output.
- [ ] Error messages: plain cause + what happens next; no blame; no codes.
- [ ] Buttons name outcomes ("Yes, send it"), not "OK".
- [ ] Sentences ≤ 15 words, ≤ 2 per caption; glossary words used.
- [ ] Privacy statements match the real data flow.
- [ ] Praise is specific and only for what the person did.

**Safety & teaching**
- [ ] Send/buy/delete/post/settings changes go through a confirm card with full details; the person presses the
      final button.
- [ ] Every agent click is preceded by a ring ≥ 1.2 s and an `explain` line, and followed by a "what changed" line.
- [ ] Personal steps (passwords, codes, picking, sending) are the person's, at level ≥ 1.
- [ ] Task end saves a lesson card with 3–10 self-contained steps, exact labels, "you'll see…", printable.

**Motion**
- [ ] No flashing; pulse ≥ 1.6 s period; reduced-motion respected; transitions ≤ 250 ms.

**Test with people** (NN/g [3]): 5 adults 75+, including a hearing-aid user and someone with tremor/arthritis;
their own laptop if possible; short sessions (fatigue); say "we're testing the software, not you"; give written
task cards. Pass bar: each person completes Email-with-photo and Scary-pop-up unaided by the moderator.

Contrast check (Python, no deps) — run for any new colour:
```python
def lum(h):
    c=[int(h.lstrip("#")[i:i+2],16)/255 for i in (0,2,4)]
    c=[x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4 for x in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
def ratio(a,b):
    hi,lo=sorted([lum(a),lum(b)],reverse=True); return (hi+0.05)/(lo+0.05)
assert ratio("#1B1B1B","#F7F4EE")>=7 and ratio("#FFFFFF","#0B4A8B")>=7
```

---

## 13. Ready-to-paste tokens (`app/ui/shared.css`)

```css
/* Tokens from research/02_ux_guidelines.md. Every text pair >= 7:1, every boundary >= 3:1 (ratios in §2.2). */
:root {
  --ui-scale: 1;                       /* set from settings: 1.0 - 1.6 */
  color-scheme: light;

  /* type */
  --font-sans: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
  --font-display: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif;
  --fs-min:     calc(20px * var(--ui-scale));
  --fs-body:    calc(24px * var(--ui-scale));
  --fs-button:  calc(26px * var(--ui-scale));
  --fs-caption: calc(28px * var(--ui-scale));
  --fs-h3:      calc(28px * var(--ui-scale));
  --fs-h2:      calc(32px * var(--ui-scale));
  --fs-h1:      calc(40px * var(--ui-scale));
  --fs-display: calc(64px * var(--ui-scale));
  --fw-body: 400;
  --fw-caption: 500;
  --fw-strong: 600;
  --lh-body: 1.5;
  --lh-tight: 1.25;
  --measure: 60ch;

  /* colour: light (default) */
  --bg: #F7F4EE;
  --surface: #FFFFFF;
  --text: #1B1B1B;
  --text-2: #3B3B3B;
  --border: #6B6B6B;
  --primary: #0B4A8B;
  --primary-strong: #083A6E;
  --on-primary: #FFFFFF;
  --primary-soft: #E3EDF8;
  --primary-ink: #0B3566;
  --success: #1C5E2B;
  --on-success: #FFFFFF;
  --danger: #9B1C1C;
  --on-danger: #FFFFFF;
  --warn-bg: #FFF4D6;
  --warn-border: #8A5A00;
  --caption-bg: #FFFBEA;
  --focus: #1B1B1B;
  --ring-a: #FFD000;                   /* teaching ring: yellow band ... */
  --ring-b: #000000;                   /* ... between black bands */
  --scrim: rgba(0, 0, 0, 0.20);

  /* size */
  --target-min:     calc(64px * var(--ui-scale));
  --target-primary: calc(88px * var(--ui-scale));
  --target-hero:    calc(112px * var(--ui-scale));
  --gap-target: 24px;
  --space-1: 8px;  --space-2: 16px; --space-3: 24px;
  --space-4: 32px; --space-5: 48px; --space-6: 64px;
  --radius: 16px;
  --radius-lg: 24px;
  --radius-pill: 999px;
  --border-w: 2px;
  --focus-w: 4px;
  --focus-offset: 3px;
  --shadow-1: 0 2px 6px rgba(0, 0, 0, 0.18);

  /* motion */
  --dur-fast: 150ms;
  --dur: 250ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);
  --pulse-period: 1.6s;
  --ring-lead: 1200ms;                 /* ring shown this long before the helper clicks */
  --double-guard: 600ms;               /* ignore repeat activation within this window */
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #121417;
  --surface: #1E2228;
  --text: #F4F4F4;
  --text-2: #D0D0D0;
  --border: #8D96A0;
  --primary: #8CC0FF;
  --primary-strong: #B5D6FF;
  --on-primary: #0B0F14;
  --primary-soft: #1D3350;
  --primary-ink: #F4F4F4;
  --success: #86E0A0;
  --on-success: #0B0F14;
  --danger: #FFA3A3;
  --on-danger: #0B0F14;
  --warn-bg: #3A2E00;
  --warn-border: #E0B040;
  --caption-bg: #262A1E;
  --focus: #F4F4F4;
}

@media (prefers-reduced-motion: reduce) {
  :root { --dur-fast: 0ms; --dur: 0ms; --pulse-period: 0s; }
}

/* Base layer (optional but recommended) */
html { font-family: var(--font-sans); font-size: var(--fs-body); line-height: var(--lh-body);
       color: var(--text); background: var(--bg); -webkit-font-smoothing: antialiased; }
body { margin: 0; background: var(--bg); color: var(--text); }
p, li { max-width: var(--measure); }
button, .btn { min-height: var(--target-min); min-width: var(--target-min); padding: 0 var(--space-3);
       font: var(--fw-strong) var(--fs-button)/var(--lh-tight) var(--font-sans);
       border: var(--border-w) solid var(--border); border-radius: var(--radius);
       background: var(--surface); color: var(--text); cursor: pointer;
       transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease); }
button.primary, .btn.primary { background: var(--primary); color: var(--on-primary); border-color: var(--primary);
       min-height: var(--target-primary); }
button.danger, .btn.danger { background: var(--danger); color: var(--on-danger); border-color: var(--danger); }
:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
a { color: var(--primary); text-decoration: underline; text-underline-offset: 0.15em; }
input, textarea { min-height: var(--target-min); font: var(--fw-body) var(--fs-body)/var(--lh-body) var(--font-sans);
       color: var(--text); background: var(--surface); border: var(--border-w) solid var(--border);
       border-radius: var(--radius); padding: 0 var(--space-2); }
@media (forced-colors: active) { button, .btn, input, textarea { border: 2px solid ButtonText; } }
```

Dark-theme ratios not listed in §2.2 (computed the same way): `--on-primary` on `--primary-strong #B5D6FF`
12.84:1; `--primary-ink #F4F4F4` on `--primary-soft #1D3350` 11.63:1; `--text` on `--caption-bg #262A1E` 13.33:1;
`--warn-border #E0B040` vs `--warn-bg` 6.66:1. Trap: dark `--primary` as text on `--primary-soft` is only 6.76:1 —
text on `--primary-soft` is always `--primary-ink`, in both themes. (Re-run the §12 script if you change any.)

Double-activation guard (tiny, put in each renderer once):
```js
// ponytail: global per-element timestamp; fine for a few dozen buttons.
document.addEventListener('click', (e) => {
  const b = e.target.closest('button, .btn, [role="button"]'); if (!b) return;
  const now = Date.now();
  if (now - (b._lastClick || 0) < 600) { e.stopImmediatePropagation(); e.preventDefault(); return; }
  b._lastClick = now;
}, true);
```

---

## 14. Deltas to SPEC (for the integrator)

- Keep SPEC's 64 px minimum; add **88 px for primary actions** and 112 px for the launcher Talk button.
- Add `--fs-min 20px` floor, `--fs-caption 28px` for helper captions.
- Collapsed widget shows the word **"Help"** (no icon-only bubble); add a **"Move me"** button (no drag required).
- Add the 600 ms double-activation guard and "no disabled buttons".
- TTS: rate 0.9 default, lower-pitched voice default, 350 ms sentence pauses; VAD end-of-speech **1.6 s**
  (+1.5 s when the transcript ends mid-phrase); reprompt after 8 s; mic closes quietly after +12 s.
- `ui.say` reading-time wait: `max(2500, 350 × words)` ms; captions never disappear on a timer.
- Agent: ring ≥ 1.2 s before each own click; `explain` ≤ 20 words with exact label + position + purpose; "what
  changed" line after; progress line if > 6 s; never silent > 10 s.
- Lessons: add `level` and `doneByPerson` per step; "Print these steps" (20 pt print CSS); offer hand-over next time.
- Setup asks: preferred name; text size (3 samples); voice (deeper/higher). Theme default light.

---

## Sources

1. NN/g — Usability for Senior Citizens: Improved, But Still Lacking (2013): https://www.nngroup.com/articles/usability-seniors-improvements/
2. NN/g — Usability for Older Adults: Challenges and Changes (2019): https://www.nngroup.com/articles/usability-for-senior-citizens/ · report: https://www.nngroup.com/reports/senior-citizens-on-the-web/
3. NN/g — Usability Testing With Older Adults (2023): https://www.nngroup.com/articles/usability-testing-older-adults/
4. W3C WAI — Older Users and Web Accessibility (updated 20 Nov 2025): https://www.w3.org/WAI/older-users/ · WCAG 2.2: https://www.w3.org/TR/WCAG22/ · 2.5.5: https://w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html
5. Piepenbrock, Mayr, Mund, Buchner — Positive display polarity is advantageous for both younger and older adults, Ergonomics 2013: https://pubmed.ncbi.nlm.nih.gov/23654206/
6. Age-related changes in visual search: colour cues (Sci. Reports 2020): https://pmc.ncbi.nlm.nih.gov/articles/PMC7721812/
7. NIDCD — Age-Related Hearing Loss: https://www.nidcd.nih.gov/health/age-related-hearing-loss
8. Presbycusis overview: https://en.wikipedia.org/wiki/Presbycusis · https://www.beltone.com/en-us/articles/presbycusis-disease
9. Jin, Plocher, Kiff — Touch Screen User Interfaces for Older Adults: Button Size and Spacing (2007): https://link.springer.com/chapter/10.1007/978-3-540-73279-2_104 · W3C summary: https://www.w3.org/WAI/GL/mobile-a11y-tf/wiki/Summary_of_Research_on_Touch/Pointer_Target_Size
10. Effects of cursor freeze time on older adults' mouse tasks, Applied Ergonomics 2017: https://www.sciencedirect.com/science/article/abs/pii/S0003687017301473
11. Smith, Sharit, Czaja — Aging, Motor Control, and the Performance of Computer Mouse Tasks (1999): https://doi.org/10.1518/001872099779611102
12. Trewin, Keates, Moffatt — Developing Steady Clicks (ASSETS 2006): https://research.ibm.com/publications/developing-steady-clicks-a-method-of-cursor-assistance-for-people-with-motor-impairments
13. Situated Understanding of Errors in Older Adults' Interactions with Voice Assistants (month-long in-home study): https://arxiv.org/html/2403.02421v2
14. Liu et al. — Toward Enabling Natural Conversation with Older Adults via LLM-Powered Voice Agents that Support Interruptions and Backchannels (CHI 2025): https://dl.acm.org/doi/10.1145/3706598.3714228 · PDF: https://www.mingmingfan.com/papers/CHI25-BargeIn.pdf
15. "You have interrupted me again!": dementia-friendly voice assistants with incremental clarification (Frontiers in Dementia 2024): https://www.frontiersin.org/journals/dementia/articles/10.3389/frdem.2024.1343052/full
16. Talk like me: feedback speech-rate regulation for elderly VUI: https://pmc.ncbi.nlm.nih.gov/articles/PMC10132265/
17. Williams & Kemper — Enhancing communication with older adults: overcoming elderspeak (summary of Kemper & Harden 1999): https://journals.healio.com/doi/abs/10.3928/0098-9134-20041001-08 · https://www.disabled-world.com/disability/publications/journals/elderspeak.php
18. Williams et al. — Elderspeak communication: impact on dementia care: https://pmc.ncbi.nlm.nih.gov/articles/mid/NIHMS172973/
19. Mead & Fisk — Measuring skill acquisition and retention with an ATM simulator (Human Factors 1998): https://pubmed.ncbi.nlm.nih.gov/9849109/
20. Kelley & Charness — Issues in training older adults to use computers (BIT 1995): https://www.tandfonline.com/doi/abs/10.1080/01449299508914630
21. Mitzner et al. — Older Adults' Training Preferences for Learning to Use Technology (2008): https://doi.org/10.1177/154193120805202603
22. Fan & Truong — Guidelines for Creating Senior-Friendly Product Instructions (TACCESS 2018): https://www.mingmingfan.com/papers/TACCESS-2018-Fan.pdf
23. GuideMe: A VLM-Based System Assisting Independent Smartphone Learning for Older Adults (CHI 2026): https://dl.acm.org/doi/full/10.1145/3772318.3791448
24. "It's Like Not Being Able to Read and Write": digital educators for older adults (2025): https://arxiv.org/html/2502.10166v1
25. From Digital Anxiety to Empowerment in Older Adults (2026, n = 480): https://pmc.ncbi.nlm.nih.gov/articles/PMC12823018/ · Technophobia review (BMC Public Health 2026): https://pmc.ncbi.nlm.nih.gov/articles/PMC13335241/
26. Technology Caregiving: Reframing How Older Adults Are Supported in Everyday Digital Activities (2026): https://arxiv.org/html/2608.23751
27. AARP — Tech Use and Adoption Growing Among Adults Age 50-Plus (Tech Trends 2026): https://www.aarp.org/pri/topics/technology/internet-media-devices/2026-technology-trends-older-adults/
28. FTC Data Spotlight — False alarm, real scam (Aug 2025): https://www.ftc.gov/news-events/data-visualizations/data-spotlight/2025/08/false-alarm-real-scam-how-scammers-are-stealing-older-adults-life-savings
29. Apple — Customize your app for Assistive Access (WWDC25): https://developer.apple.com/videos/play/wwdc2025/238/ · BOIA summary: https://www.boia.org/blog/what-web-designers-can-learn-from-apples-assistive-access-feature
30. Microsoft Inclusive Design: https://inclusive.microsoft.design/ · https://inclusive.microsoft.design/tools-and-activities/InclusiveDesignForCognitionGuidebook.pdf
31. Microsoft Learn — Targeting guidelines (40 × 40 epx min; 44 × 44 touch): https://learn.microsoft.com/en-us/windows/apps/develop/input/guidelines-for-targeting
32. NN/g — Icon Usability: https://www.nngroup.com/articles/icon-usability/
33. NN/g — Memory Recognition and Recall in User Interfaces (2024): https://www.nngroup.com/articles/recognition-and-recall/
34. Braille Institute — Atkinson Hyperlegible Next (Feb 2025): https://www.brailleinstitute.org/about-us/news/braille-institute-launches-enhanced-atkinson-hyperlegible-font-to-make-reading-easier/
