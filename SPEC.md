# Product spec — voice-first computer helper for older adults (Windows)

Working folder: `G:\seniorhelper`. Product name is decided by research and lives in ONE place:
`app/src/product.js` (`name`, `assistantName`, `tagline`). Never hardcode the name anywhere else —
UI reads it through the preload bridge (`window.helper.product`), the website through a single
`{{NAME}}`-free text pass done at the end.

## What it is
1. **Launcher (home screen)** – a calm, huge-text window: greeting + clock + date, 6–9 big tiles
   (Email, Photos, Video call, Internet, Family, My lessons, "Is this a scam?", "My computer is
   acting up", Games), and one giant "Talk to <assistant>" button.
2. **Helper widget** – small always-on-top floating bubble (avatar + TALK button) that sits over every
   app. Click → expands to a panel with big captions of what the helper says, the current step
   ("Step 2 of 5"), big answer buttons, a text box, "Stop" and "Home".
3. **Overlay** – full-screen transparent, click-through window that draws a pulsing ring + arrow +
   label on the thing the person should click (teaching), or a calm full-screen warning card.
4. **Agent** – LLM (OpenRouter, vision + tools) that sees the screen (screenshot + UI Automation
   element list) and acts (click/type/keys/open) while *narrating every step in plain words* so the
   person learns. It asks the person to do the personal steps themselves (pick the photo, type a
   password, press Send). Every finished task becomes a **Lesson** (big-print steps + "walk me
   through it again" replay in teach mode).
5. **Tech support** – "my computer is slow / no sound / internet broken / printer" → runs read-only
   diagnostics through PowerShell (no screen control), explains findings in plain words, applies
   whitelisted fixes after a yes.
6. **Guardian (Jev)** – TypeSafe Jev decisions model on OpenRouter does fast structured decisions:
   intent routing, action-risk gating (auto / confirm / refuse), scam-screen detection, step
   verification. Plus a background **Scam Shield** that watches window titles/text for scam patterns.

## Layout
```
app/
  package.json          electron + electron-builder (devDeps). "main": "main.js"
  main.js               lifecycle, windows, IPC, tray, global shortcut, wiring of src/*
  preload.js            contextBridge -> window.helper (see "Preload API")
  src/product.js        { name, assistantName, tagline, website, version }
  src/config.js         settings load/save/defaults (userData/settings.json)
  src/native.js         spawns native/bin/helper.exe, JSON-lines RPC
  src/llm.js            OpenRouter chat completions (+tools), transcribe(), cost tracking
  src/jev.js            Jev decisions client (choice / noul / score, batching, retries)
  src/guardian.js       hard safety rules + Jev gating + scam detection + family alert
  src/router.js         intent routing of an utterance (Jev, with keyword fast-path + LLM fallback)
  src/agent.js          task loop (observe -> think -> act), modes, narration, lesson recording
  src/tools.js          tool JSON schemas + executors
  src/support.js        diagnostics catalog + fixes catalog (PowerShell, windowless)
  src/lessons.js        lesson store (userData/lessons/*.json)
  src/memory.js         user facts (userData/memory.json)
  src/apps.js           friendly target resolution: "gmail" -> URL, "outlook" -> app/URL, etc.
  src/log.js            file logger (userData/logs/app.log) — NO console windows ever
  ui/shared.css         design tokens (see UX section)
  ui/launcher.html|css|js, ui/widget.html|css|js, ui/overlay.html|js, ui/settings.html|js,
  ui/lessons.html|js, ui/voice.js (mic capture + VAD + WAV, TTS queue)
  native/Helper.cs, native/build.ps1 -> native/bin/helper.exe
  test/*.test.js        node:test, mocks for native + llm + jev
website/                static site (index.html, families.html, safety.html, download/, css)
research/               market / ux / naming / safety / tech / playbooks (.md)
```

## Hard constraints (all code)
- **Never open a visible console window.** Every child process: `spawn(..., {windowsHide: true})`;
  PowerShell with `-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass`.
- No new npm runtime dependencies. Node stdlib + Electron only (`fetch` is global in Electron's Node).
- CommonJS modules (`require`), plain JS, no TypeScript, no bundler.
- Renderer: `contextIsolation: true`, `nodeIntegration: false`, everything through preload.
- UI files must also work when opened directly in a normal browser (no `window.helper`) — then use a
  built-in demo stub so layout can be reviewed in a browser.
- Env `HELPER_MUTE=1` disables all audio output (TTS). Tests always run muted.
- Env `OPENROUTER_API_KEY` overrides the settings key (dev). Never write the key into any file in
  the repo or installer.

## Native helper protocol (`native/bin/helper.exe`)
C# compiled with the .NET Framework compiler that ships with Windows
(`C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`, **C# 5 only**: no `$""`, no `?.`, no
`nameof`, no expression-bodied members, no tuples). References: System.Drawing,
System.Windows.Forms, UIAutomationClient, UIAutomationTypes, WindowsBase, System.Speech,
System.Web.Extensions (JavaScriptSerializer for JSON). Build `/target:winexe` (no console window) —
stdin/stdout still work when spawned with pipes. Per-monitor DPI aware at startup, so **all
coordinates are physical pixels of the virtual screen**.

JSON lines on stdin/stdout. Request `{"id":1,"cmd":"...","args":{...}}` →
response `{"id":1,"ok":true,"result":{...}}` or `{"id":1,"ok":false,"error":"msg"}`.
Long-running commands (`wait_click`, `listen`) must not block other commands: run each request on
its own thread; serialize writes to stdout with a lock. Unknown cmd → ok:false.

| cmd | args | result |
|---|---|---|
| ping | – | `{pong:true, version:"1"}` |
| screen_info | – | `{width,height,scale, monitors:[{x,y,width,height,primary,scale}]}` (primary monitor = coordinates origin reference; `scale` = DPI/96) |
| screenshot | `{maxWidth:1280, x?,y?,width?,height?}` | `{png:"<base64>", width, height, factor, originX, originY}` — image of primary monitor (or region), downscaled to maxWidth; physical = origin + imagePx * factor |
| elements | `{scope:"foreground"\|"window", hwnd?, max:250}` | `{window:{hwnd,title,process,rect:[x,y,w,h]}, elements:[{id,name,role,rect:[x,y,w,h],value?,enabled,focused?}]}` — visible, on-screen, interactive or text-bearing UIA elements of that window in reading order; ids are small ints valid until the next `elements` call. Hard time budget ~2.5 s (return what you have + `truncated:true`). For Chromium/Edge windows walk into the web content (set `UIA_*` cache request / use `TreeWalker.ControlViewWalker`). |
| click | `{x,y,button:"left"\|"right", double:false}` | `{}` (SendInput, moves cursor there) |
| click_element | `{id, double:false}` | `{x,y,method:"invoke"\|"click"}` — Invoke/Select/Toggle pattern if safe else click center |
| type | `{text}` | `{}` (SendInput KEYEVENTF_UNICODE, handles \n as Enter) |
| key | `{combo:"ctrl+c"}` | `{}` (names: ctrl, alt, shift, win, enter, tab, esc, backspace, delete, up, down, left, right, home, end, pageup, pagedown, space, f1..f12, a-z, 0-9) |
| scroll | `{x,y,amount}` | `{}` (wheel notches; negative = down) |
| move | `{x,y}` | `{}` |
| cursor | – | `{x,y}` |
| open | `{target, args?}` | `{pid?}` (ShellExecute: URL, uri scheme, exe path or name) |
| windows | – | `{windows:[{hwnd,title,process,rect,minimized,foreground}]}` visible top-level with titles |
| foreground | – | `{hwnd,title,process,rect}` |
| focus | `{hwnd}` | `{ok}` (restore if minimized; AttachThreadInput trick; ALT-tap) |
| window_text | `{hwnd?, max:4000}` | `{title, text}` — concatenated UIA names/values of foreground (or hwnd) window, for scam scanning |
| wait_click | `{timeoutMs, rect?:[x,y,w,h]}` | `{clicked:bool, x,y, button, inRect}` — WH_MOUSE_LL hook on its own message-loop thread; returns on first real (non-injected, `LLMHF_INJECTED` filtered) button-up |
| listen | `{timeoutMs:15000, culture:"en-US"}` | `{text, confidence}` — System.Speech DictationGrammar (offline STT fallback) |
| speak | `{text, rate:-1}` | `{}` — System.Speech fallback TTS (async; `stop_speaking` cancels) |
| stop_speaking | – | `{}` |
| appbar | `{action:"dock", hwnd, edge:"right", size}` / `{action:"undock", hwnd?}` | dock: `{rect, bar, work}` (work area shrinks; pushed windows are recorded); undock: `{removed, restored}` (no hwnd = every dock). Only edge `right`, size 50 px..2/3 of the screen width |
| window_set | `{hwnd, action:"maximize"\|"restore"\|"minimize"\|"move", rect?}` | `{ok}` — refuses taskbar/desktop; move places the visible frame exactly on rect |
| is_elevated | – | `{elevated, adminGroup, elevationType}` |
| work_area | `{hwnd?}` | `{rect:[x,y,w,h], monitor}` |
| idle | – | `{idleMs, locked}` |
| taskbar | `{aumid, name, pin?}` | `{found, rect, name}`; pin:true right-clicks our taskbar button and invokes the jump list's `TaskbarPin` item -> `+{invoked}`, or `{pinned:true}` when it offers `TaskbarUnpin` (never touched) |

`windows` results also carry `maximized`. Exact shapes: header comment of `native/Helper.cs`.

## Preload API (`window.helper`)
```
helper.product                      -> {name, assistantName, tagline, ...}
helper.getSettings() / saveSettings(obj) -> Promise
helper.ask(text, {mode?})           -> Promise<void>  (user utterance/typed text into the brain)
helper.answer(requestId, value)     -> reply to an ask_user / confirm card
helper.stop()                       -> stop current task
helper.goHome()                     -> show launcher, collapse widget
helper.openTile(tileId)             -> launch a tile (email/photos/…); may start an agent task
helper.transcribe(wavBase64)        -> Promise<{text}>
helper.listLessons() / getLesson(id) / replayLesson(id) / deleteLesson(id)
helper.runCheck(name)               -> Promise<{title, summary, details}> (support)
helper.widget.expand(bool) / widget.dragBy(dx,dy)
helper.on(channel, cb)              -> subscribe to main->renderer events (returns unsubscribe)
```
Main → renderer events (channel: payload):
- `say`: `{text, speak:true}` — caption + TTS
- `status`: `{state:"idle"|"listening"|"thinking"|"looking"|"acting"|"running"|"waiting"|"speaking", label?, detail?,
  step?, totalSteps?, plan?:[{text, state:"done"|"now"|"next"}], effort?:"low"|"high"}` (rendered by `ui/status.js`)
- `ask`: `{requestId, question, choices:[str], kind:"choice"|"text"|"confirm"|"done", details?}`
  (details for confirm: `{title, fields:[{label,value}]}` e.g. email To/Subject/Body/Attachments)
- `ask-cancel`: `{requestId}`
- `overlay` (overlay window only): `{type:"highlight", rect:[x,y,w,h] (DIP), label, arrow:true}` |
  `{type:"warning", title, body, level:"scam"|"info"}` | `{type:"clear"}`
- `lesson-saved`: `{id,title}`; `settings-changed`: settings; `task-done`: `{summary}`

## Agent loop (src/agent.js)
- `runTask(utterance, {mode})`, modes: `together` (default: helper does routine clicks, the person
  does personal choices + final send), `teach` (person does every click; helper highlights),
  `do` (helper does everything except irreversible final actions, which always need the person).
- Each step: observe = foreground window + `elements` (compact text list `[id] role "name" (x,y,w,h)`)
  + screenshot (maxWidth 1280, jpeg/png as data URL) + list of open windows + memory facts + task
  transcript so far. Send to brain model with tools. Execute returned tool calls in order.
  Max 40 steps, per-task cost cap (settings, default $0.25), timeout 15 min, Stop button aborts.
- Every action tool carries `explain` (one short plain sentence, e.g. "I'm clicking the blue
  Compose button at the top left — that starts a new email."). It is spoken + captioned BEFORE the
  action, recorded into the lesson.
- Tools: `click{element_id|x,y, double?, explain}`, `type_text{text, explain}`,
  `press_keys{keys, explain}`, `scroll{direction, amount, explain}`, `open{target, explain}`,
  `wait{seconds}`, `say{text}` (findings / what changed, no question), `ask_user{question, choices?}`, `guide_user{element_id|x,y,w,h, instruction,
  wait_for:"click"|"done"}` (overlay highlight → wait for the person's real click or "I did it"),
  `confirm{title, fields[], question}` (big card, Yes/No; REQUIRED before anything that sends,
  buys, deletes, posts, or changes settings), `remember{fact}`, `run_check{name}`,
  `apply_fix{name, arg?, explain}`, `done{summary, lesson_title}`.
- Guardian gate before each action (see below); `refuse` → speak why + stop; `confirm` → confirm card.
- The person always presses Send/Buy/Submit themselves (agent uses `guide_user` for that click).
- Lesson = `{id,title,created,utterance,steps:[{text, action, target}]}`; after `done` the brain
  rewrites steps into 3–10 big-print numbered instructions.

## Guardian (src/guardian.js) — Jev first, rules always
- Hard rules (no model can override): never open remote-access tools (AnyDesk, TeamViewer,
  UltraViewer, Quick Assist, LogMeIn, ScreenConnect, RustDesk…); never type anything matching card
  numbers / SSN / bank routing; never buy gift cards / crypto / wire money; never navigate to
  sites the scam check flags; never disable antivirus/firewall; never type passwords (person does).
- `gateAction(action, context)` → `{verdict:"auto"|"confirm"|"refuse", reason, confidence}` via one
  Jev choice; if Jev confidence < 0.6 treat `auto` as `confirm`; on Jev failure fall back to rules.
- `checkScreen(text)` → keyword prefilter (virus/infected/call support/gift card/bitcoin/
  suspended/refund/IRS/warrant/…); on a hit → Jev noul "is this a scam?"; p ≥ 0.7 → calm full-screen
  warning via overlay, speak it, log it, alert family (ntfy.sh topic POST if configured).
- Scam Shield background loop: every 4 s check foreground window; on change run `window_text` +
  `checkScreen`. Cheap: no model call unless the prefilter hits.

## Router (src/router.js)
Jev choice over: `task` (do something on the computer), `support` (computer problem), `chat`
(question/conversation, no screen), `teach` (explicit "show me how / teach me"), `scam_check`
("is this real?", suspicious call/email), `family` (call/email family), `stop`. Keyword fast path for
obvious ones; confidence < 0.5 → LLM fallback classification.

## Support (src/support.js)
Checks (read-only, return plain text): `overview` (CPU, RAM, uptime, disk free), `top_processes`,
`startup_apps`, `disk_space`, `network` (adapter up, ping 1.1.1.1, DNS resolve), `sound`
(default playback device, mute/volume via Core Audio), `updates` (pending reboot/last update),
`defender` (AV status, last scan), `printers`. Fixes (each needs confirm): `clear_temp`,
`disable_startup_app{name}`, `close_app{process}`, `restart_explorer`, `flush_dns`,
`defender_quick_scan`, `unmute_audio`, `restart_computer`. Flow for "slow computer": run
overview+top_processes+startup_apps+disk_space → brain explains in plain words → proposes ≤3 fixes →
confirm each → apply → re-check → report.

## UX tokens (ui/shared.css) — refined by research/02_ux_guidelines.md
Base font 24px (settings scale 1.0–1.6), line-height 1.5, min touch target 64px, max 6–9 tiles,
contrast ≥ 7:1, no hover-only affordances, no time-limited UI, no jargon, no icons without words,
one question at a time, reassuring tone, never flashing. System font stack (Segoe UI).

## Module interfaces (contract between parallel builders — do not deviate)
Already written and tested (use, do not rewrite): `src/log.js` {init, log}, `src/product.js`,
`src/config.js` {Config(dir): get(), publicView(), save(patch); DEFAULTS}, `src/native.js`
{Native(exe): start(), call(cmd,args,timeoutMs), stop()}, `src/jev.js` {ask(state, questions, opts),
choice(state, instructions, criteria, opts), noul(state, instructions, opts, criteria?)} where opts =
{apiKey, model}, `src/llm.js` {chat({apiKey, model, fallbackModel, messages, tools, toolChoice,
maxTokens, temperature, reasoningEffort}) -> {message, finish, usage, cost, model};
transcribe({apiKey, model, wavBase64}) -> {text}}.
LLM GOTCHA: Gemini 3 models return `message.reasoning_details`; when you append the assistant message
to history keep the WHOLE message object (content, tool_calls, reasoning_details) or the next call fails.
Tool results go back as `{role:"tool", tool_call_id, content:"<string>"}`. Images: user content part
`{type:"image_url", image_url:{url:"data:image/png;base64,..."}}`. Keep at most the latest 1-2
screenshots in history (replace older image parts with the text "[old screenshot removed]").

`ui` bridge object (created in main.js, passed to Agent) — all positions PHYSICAL px:
- `ui.say(text, {wait=true})` -> Promise (resolves when the widget reports the line was spoken, or
  after a reading-time timeout); captions always shown.
- `ui.status({state, step, totalSteps, label})`
- `ui.ask({question, choices=[], kind:"choice"|"text"|"confirm", details})` -> Promise<string>
  (choice text, typed/spoken text, or "yes"/"no" for confirm); rejects with Error('stopped') on stop.
- `ui.highlight(rect:[x,y,w,h], label)`, `ui.clearOverlay()`, `ui.warn({title, body, level})`
- `ui.showLauncher()`, `ui.hideLauncher()`, `ui.expandWidget(bool)`
- `ui.ownPid` — our process id; never treat our own windows as the target app.

`src/agent.js`: `class Agent extends EventEmitter { constructor({config, native, llm, jev, guardian,
router, memory, lessons, support, apps, playbooks, ui}); handle(utterance, {mode}) -> Promise (routes
then runs task/support/chat/scam_check/family); runTask(goal, {mode, lessonHint}); runSupport(problem);
chat(text); scamCheck(text); stop(); get busy }` emits 'done' {summary, lessonId}, 'error'.
`src/tools.js`: `{schemas(mode) -> [OpenAI tool defs], execute(call, ctx) -> Promise<string>}`.
`src/guardian.js`: `class Guardian { constructor({config, jev, signals, log}); hardCheck(action) ->
null|{verdict, reason}; gateAction(action, context) -> Promise<{verdict:"auto"|"confirm"|"refuse",
reason, confidence}>; prefilter(text) -> {hit, score, matched}; checkScreen({title, text}) ->
Promise<{scam, probability, reason, matched}>; alertFamily(message) -> Promise; isRemoteAccess(str) ->
bool; sensitive(text) -> bool }`. `action` = {tool, args} as produced by the brain.
`src/router.js`: `route(utterance, {apiKey, jevModel, llmFallback?}) -> Promise<{intent, confidence,
source}>`, intents: task|support|chat|teach|scam_check|family|stop|home.
`src/support.js`: `{catalog(), runCheck(name) -> Promise<{name,title,ok,text,ms}>, applyFix(name, arg)
-> Promise<{ok,text}>, ps(script, timeoutMs) -> Promise<string>}`.
`src/lessons.js`: `class Lessons { constructor(dir); list(); get(id); save(lesson) -> id; remove(id) }`.
`src/memory.js`: `class Memory { constructor(file); all(); add(fact); remove(index); text() }`.
`src/apps.js`: `resolve(target, settings) -> {kind:"url"|"uri"|"app", value, label}` for friendly names
(gmail, outlook, aol, yahoo, icloud photos, google photos, windows photos, zoom, whatsapp, facebook,
youtube, news, weather, solitaire, settings, files, browser) + raw URLs; `emailUrl(settings)`,
`photosUrl(settings)`.
Native `windows`/`foreground` results include `pid` so we can skip our own windows.

### Additions (binding) — written by the integrator
- `ui.ask(...)` also speaks + captions the question itself (do not `ui.say` it separately).
  Voice answers are matched in main.js: for `choice` the spoken text is mapped to the closest choice,
  for `confirm` yes/yeah/ok/correct/sure -> "yes", no/nope/wait/stop -> "no"; otherwise raw text.
- `ui.cancelAsk()` — cancels the open question (its promise rejects with Error('cancelled')).
- `ui.lastTarget()` -> `{hwnd,title,process,pid,rect}|null` — the most recent foreground window that is
  NOT ours (main.js polls `foreground` every ~2 s). The agent observes/acts on this window when our
  widget/launcher is in front.
- Preload extras: `helper.spoken(id)` (widget acks a finished TTS line), `helper.overlayDismiss()`,
  `helper.getWeather()` -> `{tempF, tempC, desc, city}|null`, `helper.openSettings()`,
  `helper.minimizeLauncher()`, `helper.listenOffline()` -> `{text}` (native System.Speech fallback),
  `helper.openTile(id, arg?)` (e.g. `openTile('family', {action:'email'|'video', name})`),
  `helper.isDemo` (true only in the browser demo stub).
- Extra main->renderer channels: `talk-toggle` (F9 pressed: widget starts/stops listening),
  `widget-state` `{expanded, docked}` (sent after main resized the widget window).
- `say` payload is `{id, text, speak}`; the widget must call `helper.spoken(id)` when the line
  finished (or immediately if not speaking).
- `helper.overlayDismiss(action)`: action null (just close the warning) | 'close_page' (main focuses the
  scam window and closes the tab/window) | 'call_family' (main speaks the family phone number).
- Docked panel (settings.dockPanel, default on): the open panel is an AppBar on the right third of the screen
  (full work-area height); the person's program is maximized into the left two thirds; closing undocks and the
  pill returns to its corner. Any saved textScale change (Settings or Barnaby's `update_settings`) re-lays out the panel.
- Agent event `'command'` `{cmd, verdict:"auto"|"confirm"|"refuse", ok, rule?}` — main writes a redacted line to the
  safety diary. Settings: brainModel `deepseek/deepseek-v4.1-flash`, providers (pinned ZDR list), thinking
  auto|always|never, dockPanel, allowCommands. The app runs as administrator (requireAdministrator).
- Widget window sizes (main.js via `src/widgetgeom.js`): collapsed pill window 248x112 DIP (draw the ~200x88
  pill inside with a transparent margin); expanded min(480*s, workArea.w-32) x min(760*s, workArea.h-32) where
  s = settings.textScale; while a confirm card is open (`ui.ask` kind 'confirm') up to 90% of the work-area
  height. Expanding grows from the pill's corner; collapsing snaps the pill into the screen corner nearest to
  the panel (so "Move me" sticks). The launcher keeps `--widget-reserve` (264px) free bottom-right; PILL_W +
  MARGIN must fit in it (test/main_logic.test.js). Transparent window background; in the app the panel
  fills the window.
- `ui.highlight(rect, label, opts)`: `opts.dim` (default true) is passed to the overlay message
  `{type:'highlight', rect, label, arrow:true, dim}`. Dimming is for the PERSON's click (guide_user); the
  agent's own-click ring (tools.js, before click/type) MUST pass `{dim:false}` (UX 11.4: no dimming when the
  helper clicks).
- `broadcast()` reaches every window, the overlay included.
- `ui.warn({title, body, level, kind?})`: `kind` = the guardian's scam kind (tech_support, gift_card, ...).
  Every `level:'scam'` warning is written to the safety diary.
- Agent event `'refused'` `{rule}` (guardian rule id, e.g. 'R1'; no page text) — main writes it to the safety
  diary; R1/R16/R3/R4/R5 also alert family (if consented). 'final' is not reported as a refusal.
- Family alerts: only main sends them, only when `settings.family.alertConsent === 'tell_family'` and a topic
  exists; text = W17 (kind + time only, never page text/URLs/amounts); one scam alert per 60-minute episode;
  every alert sent goes into the diary with its exact text and the person hears "I've let <family> know, like
  you asked me to." main wraps `guardian.alertFamily` so any other caller gets the same gate and wording.
- Settings additions: `family.alertConsent` 'just_me'|'tell_family' (default 'just_me'), `family.weeklyNote`
  (default false; counts only, every 7 days), `scamShieldOffAt` (ms; set by main only: switching Scam Shield
  off keeps it scanning for 24 h and tells family; switching it on clears it).
- userData files: `safety-diary.jsonl` (`{time, kind:'warning'|'refusal'|'alert'|'setting', what}`, 90 days),
  `stats.json` (`{done:[ms], weeklyAt}`), `logs/` (14 days: pruned by age at startup).
- Preload extras: `helper.listening(bool)` (widget mic open/closed -> main broadcasts status
  `{state:'listening'}` / the last real status), `helper.safetyDiary()` -> `[{when, kind, what}]` newest first,
  `helper.testAlert()` -> `{ok, why:''|'no_code'|'not_sent', time}` (skips consent and the 10-minute repeat
  guard), `helper.deleteEverything()` -> public settings (removes lessons, memory.json, the diary, stats, logs;
  resets every setting except the connection key).
- No spoken greeting at startup (the collapsed pill cannot caption it; UX rule 7). The launcher greets on screen.
