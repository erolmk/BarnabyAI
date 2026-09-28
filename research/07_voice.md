# 07: Barnaby's voice (decision, 2026-09-26)

## Verdict

**Ship Microsoft MAI-Voice-2 with the voice "Ethan" (`en-US-Ethan:MAI-Voice-2`) through OpenRouter.**
Use one request per sentence. Pass the existing `speechRate` setting (0.9 = Normal) straight through as the
model's `speed`. Use no style tag.

Why this one:

1. **It is top-tier realistic.** It is #1 on Design Arena's Audio Realism board (Elo 1213, 61.4% win rate)
   and #1 on its TTS board (Elo 1181), per OpenRouter's model metadata.
   - In Microsoft's own blind test, 45.5% of listeners preferred it to a real human recording (44% chose the
     human). Microsoft has not published the method.
   - Across the independent Artificial Analysis top 10, the gap from #1 to #6 is only about 40 Elo. That is
     roughly a 55/45 split in blind votes, so every voice in this tier sounds human to most listeners.
   - Once a voice is in that tier, the other factors below decide the choice.
2. **It needs no new account or key.** It runs on the OpenRouter key Barnaby already uses for the brain and
   Jev. It also needs no npm dependency (SPEC line 61).
3. **It is the only top-tier voice that keeps our privacy promise.** Barnaby reads contact names, email
   addresses and subject lines aloud.
   - MAI-Voice-2 has exactly one endpoint on OpenRouter, Azure, and that endpoint is on OpenRouter's
     Zero Data Retention list (checked today against `/api/v1/endpoints/zdr` and
     `/api/v1/models/microsoft/mai-voice-2/endpoints`).
   - Our 16 test generations all reported `provider_name: Azure`.
   - Gemini and Grok are not zero-retention.
4. **It suits older ears.**
   - Ethan's median pitch is about 100 Hz, the low male voice 03_naming asks for.
   - Pace is adjustable (`speed` 0.5-2.0, measured below), so we never pitch-shift or time-stretch.
   - Every MAI sample was word-perfect in Whisper checks. The only exception was one Flash run (see
     "Measured today").
5. **Latency is acceptable, and the risks have fallbacks.**
   - The first sentence arrives in 1.0-2.0 s, the text caption appears at once, and later sentences never
     stalled.
   - Gemini, the runner-up, measured 1.4-5.7 s.
6. **The cost is fine.** It costs $22 per 1M characters, about **$0.84 a month at one task a day** and $2.51 at
   three a day. From 2027-01-01 that is cheaper than Gemini, whose price doubles then.

**Honest limits:**
- **MAI-Voice-2 is an Azure public preview.** Microsoft says it has no SLA and "isn't recommended for
  production workloads" ([MS Learn](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/mai-voices)).
- **The independent evidence is thin.** It is not yet on Artificial Analysis, where its predecessor MAI-Voice-1
  scored only 1031. Design Arena's board may not include Gemini 3.8 or Cartesia 3.6 yet.
- **Erol's ear is the final test.** He should listen to the "start here" files in `voice-samples\README.txt`.
  If he prefers Gemini Charon, the runner-up plan below is ready.

## Erol's question: do we use Jev, and isn't it cheap?

- **Yes, we use Jev, but Jev has no voice.** Barnaby calls `~typesafe/jev-latest` (it answered as
  `typesafe/jev-1.13-20260917`) for decisions only:
  - the Guardian gate (auto, confirm or block)
  - the intent router
  - the scam check

  It takes text and returns probabilities, so it cannot make a sound (SPEC lines 25 and 155-170, 05_tech §2).
- **You remembered right: it is very cheap.** Each call costs $0.00002-0.00004 and takes 150-385 ms. A task
  makes about 50 calls, about $0.0015 in total.
- **The voice is a separate part with its own cost.** Today it is the Windows "Microsoft David" voice through
  `speechSynthesis` in `app/ui/voice.js`, which is why Barnaby sounds robotic. The new voice adds about $0.03
  per task.

## Runner-up

**Google Gemini 3.8 Flash TTS, voice "Charon", through the same OpenRouter key.**
- **Realism:** it has the best independent blind score reachable with our key, #2 on the Artificial Analysis
  Speech Arena (Elo 1268).
- **Why it is not the winner:**
  - It is not zero-retention: Google logs requests "for a limited period" for abuse checks.
  - OpenRouter returns it only as non-streamed PCM. The first sentence took 1.4-1.7 s on a warm connection
    and 3.2-5.7 s cold.
  - Pace is steered only by a style prompt, which overshot to 127 wpm.
  - Its price (about $16.5 per 1M characters now) doubles on 2027-01-01.
- **Switching to it takes three changes:**
  1. Add it to `ZDR_TTS` in `tts.js`, renaming that list to "allowed" because Gemini is not zero-retention.
  2. Change the safety.html row to "Kept for a short time to check for misuse".
  3. Add a TODO for the 2027 price change.

**If we will ever open one new vendor account:** choose Cartesia Sonic 3.6. It is #1 on Artificial Analysis
(1277) with about 90 ms latency, but it costs $49 per 1M list and zero retention is enterprise-only. It
slots in as a second adapter behind the same `speak()` iterator. It is not needed now.

## Offline fallback

1. **Today (already built, $0): the Windows voice.** That is the existing `speechSynthesis` "Microsoft David"
   voice, with `helper.exe` System.Speech behind it.
   - It takes over for the rest of a line whenever the cloud voice fails, and stays on for 5 minutes so
     Barnaby does not flip voices mid-task.
   - It is also what "The computer's own voice" in Settings means: nothing leaves the PC.
2. **Phase 2 (so an offline Barnaby still sounds like Barnaby): bundled clips.**
   - Pre-render the roughly 40 fixed lines (FAIL_TEXT, HEARD_FAIL, STILL_WORKING, "Okay, I stopped.", the
     scam-offer lines and so on) once, in Ethan's voice.
   - Ship them as `ui/assets/voice/*.ogg`. That is about 2,400 characters, or $0.05 one-time.
   - Offline, the brain is offline too, so nearly everything Barnaby says then is one of these lines.
3. **Deferred: Kokoro-82M `am_michael` on the local CPU.**
   - It is the best commercially licensed voice that runs locally (Apache-2.0, Artificial Analysis Elo 1065,
     UTMOS 4.40 against 3.62 for David).
   - It would need `sherpa-onnx-node`, which is an npm native addon (SPEC forbids new runtime npm
     dependencies), plus a 350 MB model.
   - On an i5-8250U-class laptop, the first word would take an estimated 1.7-2.5 s.
   - Build it only if the `[tts] failed` log counts show real users hearing David for dynamic lines.
   - Samples: `local_kokoro_*`.

## What the owner must do

Nothing to sign up for: it runs on the OpenRouter key Barnaby already has. Listen to the five "start here"
files and confirm Ethan, then top up OpenRouter credit (only $1.13 left today) before real users.

## Comparison table

- Pitch (F0) is the median of our samples.
- $/mo is per household at 30, 90 and 150 tasks a month (38k, 114k and 190k spoken characters; see Costs).
- "OR" means reachable through OpenRouter with our key.

| Option | Realism evidence | Route | First audio (measured) | Pace control | F0 | Retention | $ / 1M chars | $/mo (30 / 90 / 150 tasks) | Call |
|---|---|---|---|---|---|---|---|---|---|
| **MAI-Voice-2 Ethan** | Design Arena #1 realism (1213); MS human-parity test; not on AA yet | OR, existing key | 1.0-2.0 s first sentence; 1.14-1.37 s whole line | native `speed` | ~100 Hz | **ZDR (Azure only)** | 22 | 0.84 / 2.51 / 4.18 | **WINNER** |
| MAI-Voice-2-Flash Ethan | "about 2x faster" than MAI-Voice-2 (Microsoft) | OR | 0.49-0.97 s | native `speed` | 97 Hz | ZDR | 15 | 0.57 / 1.71 / 2.85 | Latency knob only (one misread word today) |
| Gemini 3.8 Flash TTS Charon | AA #2 (1268) | OR | 1.4-1.7 s warm, 3.2-5.7 s cold, no stream | prompt only | 98-123 Hz | not ZDR (Google logs) | ~16.5, ~33 from 2027 | 0.63 / 1.88 / 3.14 (x2 in 2027) | **RUNNER-UP** |
| Cartesia Sonic 3.6 | AA #1 (1277) | new account | ~90 ms claimed, 166-190 ms third-party | yes | n/a | ZDR enterprise only | 49 list | 1.86 / 5.59 / 9.31 | Only if we open one account |
| Inworld Realtime TTS-2 | AA #4 (1244) | new account | <100 ms claimed | yes | n/a | ZDR enterprise | 25 | 0.95 / 2.85 / 4.75 | No account |
| Speechify Simba 3.2 | AA #6 (1238), Vapi 96 | new account | 428 ms (Vapi) | yes | n/a | n/a | 10 | 0.38 / 1.14 / 1.90 | No account |
| ElevenLabs v3 / Flash | AA 1168-1197, Vapi 96 | subscription | 758 ms (v3), 75 ms (Flash) | yes | n/a | ZDR enterprise only | 50-100 | 1.90-3.80 / 5.70-11.40 / 9.50-19.00 | Too expensive |
| Grok Voice TTS rex/leo | Vapi 93 | OR | **0.28-0.54 s, streams** | `speed` | 109-124 Hz | not ZDR (xAI keeps 30 days) | 15 | 0.57 / 1.71 / 2.85 | Fastest, but fails privacy |
| MiniMax 2.8 HD PatientMan | AA 1172, Vapi 93 | OR | 0.52 s | `speed` | 113 Hz | not ZDR | 100 | 3.80 / 11.40 / 19.00 | Too expensive |
| Voxtral mini (gb_oliver) | AA 1079 | OR | 0.82 s, streams | `speed` | 155 Hz | ZDR | 16 | 0.61 / 1.82 / 3.04 | Lower quality, higher pitch, British |
| gpt-audio-mini cedar | AA ~1076 (GPT-Realtime-2) | OR chat route | 0.67-0.87 s | prompt | 127 Hz | not ZDR | ~$0.004/min | 0.18 / 0.55 / 0.92 | Chat model, can paraphrase the caption |
| Kokoro-82M am_michael (local) | AA 1065 (open-weights #5) | on-device | RTF 0.25-0.33 here; est. 1.7-2.5 s first word on old laptops | `speed` | 118 Hz | nothing leaves PC | 0 | 0 | Phase-2 offline |
| Supertonic 3 M1 (local) | not ranked; UTMOS 4.46 | on-device | RTF 0.17 | `speed` | 124 Hz | nothing leaves PC | 0 | 0 | Low-end fallback if Kokoro is built |
| Windows SAPI David (today) | UTMOS 3.62, robotic | built in | ~0 ms | rate | 93 Hz | nothing leaves PC | 0 | 0 | Last resort |
| Windows 11 Narrator natural voices | n/a | **no API for apps** | n/a | n/a | n/a | n/a | n/a | n/a | Not usable |

Rejected, and why:
- **Qwen-Audio-3.0 Plus** (AA 1259): only two Chinese voices on OpenRouter, it mispronounced "Rose", and it
  sits at 182 Hz.
- **Sesame CSM-1B:** 11.5 s and dropped a word.
- **Fish S2.1 Pro:** the default voice is female (178 Hz).
- **Deepgram Flux:** 192 wpm and plain.

## Measured today, pipelined like the app

What was run:
- Script: `voice-lab\mai_pipelined.js`, with raw rows in `voice-lab\mai_pipelined.jsonl`.
- One request per sentence with the next one in flight, the model's edge silence trimmed, and 350 ms gaps
  added: exactly how `tts.js` plays a line.
- The standard test line (28 words). No audio was played.

| File | Model / voice / speed | First audio | Stall after 1st | Pace incl. pauses | F0 | Whisper |
|---|---|---|---|---|---|---|
| `pipelined_mai-voice-2_Ethan_speed0.9.wav` | MAI-Voice-2 Ethan 0.9 (**recommended Normal**) | 1.99 s | 0 ms | 154 wpm | 104 Hz | verbatim |
| `pipelined_mai-voice-2_Ethan_speed0.8.wav` | MAI-Voice-2 Ethan 0.8 (Slower) | 1.31 s | 0 ms | 133 wpm | 100 Hz | verbatim |
| `pipelined_mai-voice-2_Grant_speed0.9.wav` | MAI-Voice-2 Grant 0.9 | 1.25 s | 0 ms | 176 wpm | 127 Hz | verbatim |
| `pipelined_mai-voice-2-flash_Ethan_speed0.9.wav` | MAI-Voice-2-Flash Ethan 0.9 | 0.97 s | 0 ms | 134 wpm | 97 Hz | 1 slip ("That's starts") and odd mid-phrase pauses |

- **Speed maps to pace.** At speed 0.9, Ethan lands at 154 wpm with the app's pauses, right on UX 9.1's
  140-150 wpm target. At 0.8 he lands at 133 wpm.
  - The existing Settings values (0.8 Slower, 0.9 Normal, 1.0 Faster, and the 0.7-1.1 voice command range)
    are all valid MAI speeds, so no mapping table is needed.
  - Grant's pace varied (176 wpm at 0.9), and he has no style support. Ethan is steadier and lower.
- **Softvoice is not the default.** The earlier `cloud_mai-voice-2_en-US-Ethan-softvoice-zdr.wav` (speed 0.85)
  came out at 128 wpm and 85 Hz.
  - Softvoice lowers vocal effort, and consonant energy is what older listeners with high-frequency hearing
    loss depend on ([Gordon-Salant 1987](https://pubmed.ncbi.nlm.nih.gov/3571732/)).
  - It stays a setting only if Erol prefers it by ear.
- **ZDR is confirmed per generation.** All 16 generations were served by `Azure`, the model's only endpoint.
- **Spend:** these runs cost $0.0119 of TTS plus about $0.0003 for the Whisper checks. OpenRouter credit left
  is $1.13.

## Integration plan

Base it on the integration agent's plan and prototype (`research\tts_probe\tts.js`, updated today). That
prototype now has:
- the ZDR allow-list (it refuses any other model before sending a request)
- the `speed` parameter
- `provider.zdr: true`

Its self-check passes (`node tts.js`) and includes the privacy refusal.

### Phase 1 (makes Barnaby sound natural)

1. **`app/src/tts.js`:** copy the prototype in. Export `tag()` from `llm.js` and reuse it instead of the copy.
2. **`app/main.js`: add `speakOut(id, text, muted)`, used by both `ui.say` and `ui.ask`.**
   - Send the widget `'say' {id, text, speak, natural}`.
   - Start `tts.speak(text, {apiKey, model, voice, speed: config.speechRate, signal})` immediately, before the
     widget reaches that line, so it synthesizes while the previous line plays.
   - Forward each chunk with `send(widgetWin, 'tts', {id, ...chunk})`.
   - Keep jobs in a `ttsJobs` Map (id to AbortController). `'spoken'` aborts that id's job, and `stopAll`
     aborts all of them.
   - On error:
     - log only characters and milliseconds, never the text (04_safety 7.1)
     - call `connectionProblem(kind)`
     - set a 5-minute `ttsDownUntil` cooldown
     - send `{id, error}`
   - Register `wait:false` lines in `pendingSay` too, so the wake loop stays paused until Barnaby's voice ends.
   - When the natural voice is on, set the fallback timer to reading time + 6 s.
3. **`app/preload.js`:** add `'tts'` to CHANNELS.
4. **`app/ui/voice.js`: add `play(chunks)`.**
   - Play each chunk as a WAV Blob in `new Audio(url)`. Refactor `wav16`'s header writer to take the sample
     rate, and reuse it.
   - Wait `gapMs` between chunks.
   - `stopSpeaking()` also pauses the current Audio, so barge-in stays within 300 ms.
   - If a chunk arrives as an error, speak the sentences not yet played with the existing `speechSynthesis`.
   - Keep the last line's chunks so "Say it again" replays them with no network call, at
     `playbackRate 0.95` with `preservesPitch`, which matches today's rate minus 0.05 in `widget.js`.
5. **`app/ui/widget.js`:**
   - `on('tts')` buffers chunks per id.
   - `pump()` plays natural lines with `V.play(...)` and sends the ack after the last chunk, or at once when
     stopped.
   - Captions show at the start of the line's turn, as today.
   - Keep the `!listening` guard.
6. **`app/src/config.js` DEFAULTS:** `voiceEngine: 'natural'`, `ttsModel: 'microsoft/mai-voice-2'`,
   `ttsVoice: 'en-US-Ethan:MAI-Voice-2'`.
7. **`app/ui/settings.js`, Voice section, in this order:**
   1. Barnaby: Ethan (default)
   2. Deeper-sounding alternative: Grant
   3. "Softer voice": Harper, the female voice (03_naming)
   4. "The computer's own voice: works without internet, nothing leaves the computer"
   - "Test the voice" plays a shipped `ui/assets/voice/sample-<voice>.ogg`, so the test is free and works
     offline.
8. **`app/test/tts.test.js`:** port the self-check to `node:test` with a fake fetch. Muted means no synthesis
   and $0, so `HELPER_MUTE=1` covers the tests.
9. **`website/safety.html`:** the line "We ask them not to keep what we send" stays true, because the
   allow-list enforces it in code. Add a row:

   | What | When | Where | Kept |
   |---|---|---|---|
   | What Barnaby says out loud | Each time he speaks, while his natural voice is on | To Microsoft's voice service, through OpenRouter. It can include names and email addresses from your task, never passwords or card numbers. | Not kept, and not used to learn from. |

   Then add "Want nothing to leave? Choose 'The computer's own voice' in Settings." Mirror both in
   `settings.js` and `families.html` line 112.

### Fallback chain

1. Bundled clip (phase 2)
2. In-memory cache (64 lines, never on disk)
3. MAI-Voice-2 (8 s timeout, one retry on 408/429/5xx)
4. Windows voice for the rest of the line, then 5 minutes of cooldown

If field testers find the first word too slow, change `ttsModel` to `microsoft/mai-voice-2-flash`. It keeps
the same voice and ZDR and starts in 0.5-1.0 s, but check its wording errors first.

### Phase 2 (optional, in order)

1. **Bundle the ~40 fixed lines:**
   - Build script `tools/render_phrases.js`: render with `tts.js`, then encode with ffmpeg to Opus at
     32 kbps. The bundle is about 0.7 MB and costs about $0.05 once.
   - Lines with names or personal data stay out of the bundle.
2. **Prefetch** the explain line while the Jev gate runs, which saves 150-385 ms.
3. **Build Kokoro locally** only if the logs justify it (see Offline fallback).

Skipped on purpose:
- a second cloud vendor adapter
- a time-stretch pace system (MAI's native `speed` replaces it)
- a disk cache
- voice cloning

Add each one only when there is a concrete need.

## Costs

**Basis.** The integration agent counted about 1,150 spoken characters per task in `sim-runs` (my recount of
only the say/ask events gives 190-1,030, so these figures lean high). Adding 10% for repeats gives:
- light: 30 tasks, about 38k characters a month
- typical: 90 tasks, about 114k
- heavy: 150 tasks (the soft cap), about 190k

| Item | Per household per month |
|---|---|
| MAI-Voice-2 ($22 / 1M chars) | **$0.84 light / $2.51 typical / $4.18 heavy** |
| Same, muted, or Windows voice | $0 |
| Brain LLM for comparison (05_tech) | $4-5 at 1 task/day, $12-15 at 3/day |
| Jev | about $0.0015 per task, about $0.05-0.23 a month |
| One-time: fixed-phrase bundle and voice samples | about $0.05 |

- The voice adds about 17-20% on top of the brain.
- Against the $14.99 Family plan, the brain is the real cost driver, not the voice.
- Preview prices can change at GA. Re-check at https://openrouter.ai/microsoft/mai-voice-2 before launch.

## Licensing and compliance

- **Commercial use:** Microsoft's doc says the prebuilt MAI voices are "available for third-party developers",
  and Microsoft holds the commercial licensing rights.
  - Using the prebuilt Ethan, Grant and Harper voices needs no extra approval.
  - Cloning a custom "Barnaby" voice would need Limited Access approval and a consent recording from a
    licensed voice actor. That is not planned.
- **No watermark requirement is documented** (Gemini, by contrast, adds SynthID).
- **Disclosure:** Barnaby is plainly an AI helper, and the safety page says his voice is made by a voice
  service.

## Risks, and what would change the decision

- **Preview outage or deprecation.** The Windows-voice fallback with cooldown covers it. Watch the
  `[tts] failed` log. If MAI goes away, switch `ttsModel` to Gemini Charon with the runner-up changes.
- **Erol prefers another voice by ear.** Switching is a config change plus, for non-ZDR voices, the
  safety-copy change.
- **Artificial Analysis lists MAI-Voice-2 well below Gemini.** Re-run the listening comparison. Privacy and
  latency still favor MAI unless the realism gap is large (over about 60 Elo).
- **OpenRouter starts enforcing `provider.zdr` on `/audio/speech`.** Nothing changes. The allow-list stays as
  a second guard.

## Sources

**Microsoft and OpenRouter**
- MAI-Voice-2 preview status, voices, styles and licensing:
  https://learn.microsoft.com/en-us/azure/ai-services/speech-service/mai-voices
- MAI-Voice-2 claims and pricing: https://microsoft.ai/models/mai-voice-2/
- OpenRouter listing ($22 / 1M): https://openrouter.ai/microsoft/mai-voice-2
- Flash tier: https://onepin.ai/blog/microsoft-mai-voice-2-flash-quality-speed-cost-routing-2026
- OpenRouter TTS endpoint: https://openrouter.ai/docs/guides/overview/multimodal/tts
- OpenRouter audio APIs announcement: https://openrouter.ai/blog/announcements/announcing-audio-apis/
- OpenRouter ZDR list: https://openrouter.ai/api/v1/endpoints/zdr

**Rankings**
- Artificial Analysis Speech Arena, re-checked today: https://artificialanalysis.ai/text-to-speech/leaderboard
- Vapi Humanness Index: https://humannessindex.vapi.ai/

**Other vendors**
- Gemini TTS pricing and the 2027 doubling: https://www.eesel.ai/blog/gemini-3-8-flash-tts-pricing and
  https://www.digitalapplied.com/blog/gemini-3-8-flash-tts-voice-cloning-price-doubles-january
- Google retention: https://ai.google.dev/gemini-api/terms
- xAI retention: https://docs.x.ai/developers/faq/security
- Cartesia ZDR: https://docs.cartesia.ai/enterprise/zero-data-retention
- ElevenLabs pricing: https://elevenlabs.io/pricing
- Inworld: https://inworld.ai/tts-api

**Local voices**
- Kokoro: https://huggingface.co/hexgrad/Kokoro-82M
- Windows natural voices have no app API:
  https://learn.microsoft.com/en-us/answers/questions/4125876/why-are-natural-voices-only-available-for-narrator

**Hearing research**
- Lower talkers are easier to follow with hearing loss: https://pmc.ncbi.nlm.nih.gov/articles/PMC3370057
- Clear and slower speech for older listeners: https://pubs.asha.org/doi/10.1044/2019_JSLHR-H-19-0094
- Consonant-vowel ratio: https://pubmed.ncbi.nlm.nih.gov/3571732/
- Pauses at phrase boundaries: https://www.jstage.jst.go.jp/article/ast/32/6/32_6_264/_article

**Research inputs**
- The cloud, local and integration agent reports of 2026-09-26.
- Their raw data: `voice-samples\results.jsonl`, `voice-samples\check.json`,
  `research\tts_probe\probe_results.jsonl` and the `voice-lab\*.out` files.
