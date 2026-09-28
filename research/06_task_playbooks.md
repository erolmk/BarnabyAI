# 06 — Task playbooks (domain knowledge for the agent)

Research date: 2026-09-26. Machine version: `app/src/playbooks.json` (28 entries = sections 2–29,
< 16,000 chars; section 30 "write a letter" is md-only to stay under budget).
This file is the long form: why each task is on the list, how people ask for it, what to ask first,
provider recipes with where the buttons are, which steps the PERSON does, and pitfalls.

## 0. Why these tasks (evidence)

- 90% of U.S. adults 65+ use the internet (Pew, surveys Feb–Jun 2025), but only 14% are online
  "almost constantly" — they come to the PC for specific jobs, not to browse.
  https://www.pewresearch.org/short-reads/2026/01/08/internet-use-smartphone-ownership-digital-divides-in-u-s/
- AARP Tech Trends 2026 (fielded Sep 9 – Oct 6 2025, n = 3,838 adults 50+): texting is now their #1
  communication method; 9 in 10 use social media; 8 in 10 stream video weekly; they use video chat,
  online shopping, banking, health-record apps, photo storage, games. 3 in 5 say technology is not
  designed for their age. AI use rose from 18% (2024) to 30% (2025); privacy is the top barrier.
  https://www.aarp.org/pri/topics/technology/internet-media-devices/2026-technology-trends-older-adults/
- FBI IC3 2025: 201,000+ victims aged 60+ reported $7.7 billion lost (+37% vs 2024), average loss
  above $38,000; tech/customer-support scams alone > 80,000 complaints and > $2.9 billion.
  https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf ·
  https://www.aarp.org/money/scams-fraud/fbi-ftc-report-2025-losses/
  → every playbook that touches money, links, logins or pop-ups carries a scam pitfall.

Launch priority (must be flawless on day one, in order): email (read/send/photo), photos
(iCloud/Google/phone), video call + Zoom link, text size, sound, Wi-Fi, scary pop-up, slow
computer, print, find a file/download, forgot password. Second tier: MyChart, Medicare, banking,
shopping, WhatsApp, Facebook, YouTube, news, games, letter writing.

## 1. Rules that apply to every playbook

1. **One question at a time**, with the answers as big buttons. Put the likely answers in the question
   ("Which email do you use: Gmail, Outlook, AOL, or Yahoo?") plus "I'm not sure".
2. **Ask once, remember forever.** Every `ask_first` answer that is a stable fact (email provider,
   bank name, which photo service, family members' addresses after the person confirmed them) goes
   through `remember`. Before asking, check memory and say it instead: "You use Gmail — I'll open it."
3. **"I'm not sure" is a normal answer.** Then detect: look at the taskbar/Start pins, open windows,
   browser tabs, Edge favorites; for email, the address ending (@gmail.com, @aol.com, @yahoo.com,
   @outlook.com / @hotmail.com / @live.com / @msn.com). Comcast/Xfinity, Verizon (now AOL), AT&T
   (now Yahoo: https://mail.yahoo.com with @att.net / @sbcglobal.net), Spectrum, Cox addresses exist
   too — use the provider web address the person or family confirms.
4. **The person always does:** typing passwords and one-time codes, picking which photo/file,
   pressing Send / Post / Place order / Pay / Submit, anything on their phone (scanning a QR code,
   reading a code), plugging/unplugging hardware, answering "Trust this browser?" on a shared PC.
   Use `guide_user` (ring + arrow on the exact button) for these, and wait for their real click.
5. **Open websites by typing the known address, never from search ads or email links.** The URLs in
   this file and in `apps.js` are the whitelist. Search ads impersonate banks, Medicare, support lines.
6. **Before any send/post/buy/change-setting:** `confirm` card with the exact fields.
7. **Narrate where things are** in stable words: "top left", "the blue Compose button", "the paper
   clip at the bottom" — these are the words the lesson keeps. Always say the colour + position + label.
8. **Never switch the person's app version** (e.g. classic Outlook ↔ new Outlook toggle, Gmail
   layout settings). Their muscle memory is the product.
9. **Slow down on pages that ask for money, codes, or a phone call.** Run `checkScreen`.
10. After `done`, the lesson title is the person's own words ("Send photos to Anne Marie").

Web email locations (verified Sep 2026, support pages cited in each section):

| Provider | Address | New message | Attach | Send | Save an attachment |
|---|---|---|---|---|---|
| Gmail | https://mail.google.com | "Compose" (pencil), top left | paper clip, bottom of the compose box | blue "Send", bottom left of compose box | hover the file card under the email → down-arrow "Download" |
| Outlook web / new Outlook app | https://outlook.live.com | "New mail", top left | "Attach file" (paper clip) on the Message/Insert toolbar | blue "Send", top left of the message, beside "To" | the arrow or "…" on the file card → "Download" |
| Classic Outlook (desktop) | Start → Outlook | "New Email", top left of Home ribbon | "Attach File" on the Message ribbon | "Send" button left of "To" | right-click attachment → "Save As" |
| AOL Mail | https://mail.aol.com | "Compose", top left | paper clip, bottom of compose | "Send", bottom left | hover file → "Download" |
| Yahoo Mail | https://mail.yahoo.com | "Compose", top left | paper clip, bottom toolbar | "Send", bottom left | hover file → "Download" |

Attachment limits: Gmail 25 MB (bigger becomes a Google Drive link), Yahoo 25 MB total, AOL 25 MB,
Outlook.com ~20–25 MB then offers a OneDrive link. Rule of thumb: **more than 5 phone photos or any
video → share a link instead of attaching** (section 7).
Sources: https://support.google.com/mail/answer/6584 · https://help.yahoo.com/kb/SLN5673.html ·
https://help.aol.com/articles/attach-files-or-insert-gifs-in-new-aol-mail ·
https://support.microsoft.com/en-us/outlook/mail/add-pictures-or-attach-files-to-emails-in-outlook ·
https://support.microsoft.com/en-us/outlook/reduce-attachment-size-to-send-large-files-with-outlook

---

## 2. Email — read my email  (`email_read`)
**They say:** "check my email", "did I get any mail", "read me my emails", "open my mail", "is there
anything from my daughter".
**Ask first:** "Which email do you use: Gmail, Outlook, AOL, or Yahoo?" (skip if remembered).
**Recipe:** open the provider address (table above). Unread mail is **bold**. Click the sender to open.
Offer to read it aloud. "Reply" is at the top right of the message (Gmail: curved arrow; Outlook:
"Reply" on the message toolbar; AOL/Yahoo: "Reply" arrow above the message).
Missing email → check Spam (Gmail left column "Spam", may be under "More"), Junk Email (Outlook),
Spam (AOL/Yahoo). Promotions tab in Gmail hides some mail.
**Person does:** signs in if logged out (password + code).
**Pitfalls:** Yahoo/AOL inboxes show ads styled like emails at the top (small "Ad"/"Sponsored"
label) — never click them. Before opening links or attachments in an email, run the scam check;
anything about a locked account, refund, invoice, package problem, or "call this number" is
treated as suspicious until the person confirms they expected it.

## 3. Email — write and send  (`email_send`)
**They say:** "send an email to Bob", "write to my grandson", "email the church", "reply to Linda".
**Ask first:** (1) provider (if not remembered); (2) "Who is it for?"; (3) "What would you like to
say? You can just tell me and I'll write it down."
**Recipe:** New message (table). In "To", type the first letters of the name — the address book
suggests the right one; read the full address aloud and confirm. If unknown, ask the person for the
address and repeat it back letter by letter for spelled names. Subject = 3–6 words. Body = the
person's words, lightly tidied, in their voice (keep their greeting and sign-off: "Love, Grandma").
**Person does:** checks the confirm card (To / Subject / Message / Attachments) and presses **Send**.
**Pitfalls:** autocomplete picks an old or wrong address (two "Bob"s) — always show the full address.
Reply-all on group emails — say who will receive it. Never send to an address that came from a
suspicious email. Save the confirmed address with `remember`.

## 4. Send photos by email — the "Anne Marie" task  (`email_photo`)
**They say:** "I want to send photos from my iCloud to my friend Anne Marie", "email my grandson the
pictures from Christmas", "send a picture to my sister".
**Ask first, one at a time:**
1. "Which email do you use: Gmail, Outlook, AOL, or Yahoo?"
2. "Where are the photos: on your iPhone or iCloud, in Google Photos, on this computer, or in an email
   someone sent you?"
3. "What is Anne Marie's email address? If she's in your contacts, just say her name."
**Recipe (iCloud → Gmail example):**
1. Open https://www.icloud.com/photos. Person signs in with their Apple Account password; a 6-digit
   code appears on their iPhone — they type it. "Trust this browser?" → "Trust" only on their own PC.
2. Say: "Please find the photo you want and click on it." (`guide_user` wait_for done). The person
   chooses. More than one: hold **Ctrl** and click each (up to 1,000).
3. Helper clicks **More (…) → More Download Options → Most Compatible** (JPEG — HEIC files from
   iPhones may not open on the friend's computer), then **Download** (top-right toolbar). Files land
   in **Downloads**.
4. Open https://mail.google.com → **Compose** → To: Anne Marie → Subject "Photos for you" → body in the
   person's words → **paper clip** → Downloads → select the photos → Open.
5. `confirm` card: To (full address), Subject, Message, Attachments (file names + count).
6. `guide_user` on **Send**; the person clicks it. Lesson saved: "Send photos to Anne Marie".
**Variants:** Google Photos → select with the check circle (top-left of each photo on hover) → "…"
(More options, top right) → Download (Shift+D); many photos come as one .zip — prefer a share link.
Gmail can also insert directly from Google Photos via the "Insert photo" icon in the compose toolbar.
Photos already on the PC → attach from Pictures. With iCloud for Windows installed, photos are in
File Explorer → "iCloud Photos" and in the Windows Photos app sidebar.
**Person does:** sign-in + code, choosing photos, confirming the address, pressing Send.
**Pitfalls:** > 25 MB or > 5 phone photos → offer "Instead I can send her a link to see them all"
(section 7). HEIC. Wrong Anne Marie in autocomplete. The download bar may hide the files — Edge
Downloads is Ctrl+J. Sources: https://support.apple.com/en-us/111762 ·
https://support.apple.com/en-us/108994 · https://support.google.com/photos/answer/6131416

## 5. Save or open an attachment  (`save_attachment`)
**They say:** "save the file my doctor sent", "open the attachment", "download the form", "print the
PDF in my email".
**Ask first:** provider; "Which email is it in? Who sent it?"
**Recipe:** open the email → the file card sits under the message text. Hover/click it → Download
(down-arrow). It goes to **Downloads**; offer to move it to Documents or print it (Ctrl+P). PDFs
open in Edge.
**Pitfalls:** attachments from unknown senders, or named `.zip`, `.exe`, `.html`, `.iso`, `.msi`,
`.js`, "invoice", "voicemail", "payment" → do not open; run the scam check and ask. Office files
asking to "Enable content/macros" → refuse.

## 6. iCloud photos on Windows  (`icloud_photos`)
**They say:** "see my iPhone pictures on the computer", "get my iCloud photos", "download pictures from
iCloud".
**Ask first:** "Do you want to just look at them, or save some onto this computer?"
**Recipe (no install):** https://www.icloud.com/photos → person signs in + 2FA code from iPhone →
Library view; click a photo to enlarge, arrows to move through. Save: select → Download (top right);
Most Compatible for JPEG. **Recipe (install, for repeat use):** iCloud for Windows from the Microsoft
Store (publisher Apple Inc.; needs Windows 11) → sign in → tick Photos → photos appear in File
Explorer "iCloud Photos" and the Windows Photos app. Installing = confirm card.
**Person does:** password, 2FA code, Trust browser decision.
**Pitfalls:** "iCloud storage full — buy more" prompts (don't buy without the person); lookalike
"iCloud" login pages from emails; HEIC format. Sources: https://support.apple.com/en-us/108994 ·
https://support.apple.com/en-us/103232 · https://support.apple.com/guide/icloud-windows/download-and-view-photos-and-videos-icw2ed20ffd1/icloud

## 7. Share photos with family by link  (`share_photos_link`)
**They say:** "share the wedding pictures with the family", "send everyone the album", "too many
photos to email".
**Ask first:** "Where are the photos: iCloud or Google Photos?"; "Who should get them, and how: by email
or by text message?"
**Recipe — iCloud:** icloud.com/photos → select → Share icon (square with arrow) → **Copy Link** →
paste into an email/message. iCloud links expire after **30 days**; stop earlier via "iCloud Links" in
the sidebar → Stop Sharing. For lasting family albums use Shared Albums (iPhone or iCloud for Windows).
**Recipe — Google Photos:** photos.google.com → select (check circle) → **Share** (top right) → type a
name/email, or **Create link** → Copy → paste. Recipients don't need Google Photos.
**Person does:** picks photos, confirms recipients, presses Send.
**Pitfalls:** a link lets anyone who has it see the photos — say so in plain words. Sources:
https://support.apple.com/en-my/guide/icloud/mm93a9b98683/icloud ·
https://support.google.com/photos/answer/6131416?co=GENIE.Platform%3DDesktop

## 8. Google Photos  (`google_photos`)
**They say:** "open my Google pictures", "find the photo of the dog", "download pictures from Google".
**Recipe:** https://photos.google.com (same Google account as Gmail). Search box at the top understands
words ("dog", "beach", "Christmas 2024", a person's name if face groups are on). Click to enlarge;
arrows to move. Download: open photo → "…" More options (top right) → Download, or Shift+D.
**Pitfalls:** "Storage full — get Google One" upsells; deleting from Google Photos deletes from the
phone too (warn, confirm, and prefer not to).

## 9. Photos from my phone onto the computer  (`phone_photos_to_pc`)
**They say:** "get pictures off my phone", "copy my photos to the computer", "back up my phone pictures".
**Ask first:** "Is your phone an iPhone or an Android, like a Samsung?"
**Recipe:** iPhone → iCloud route (sections 6/4) is easiest with no cables. Cable route: plug in; on the
iPhone tap **Trust** + passcode (person); Windows Photos app → **Import** (top) → From a connected
device → select → Import. Android: plug in, pull down the notification and choose **File transfer**
(person), then Photos app Import; or Google Photos web if backup is on. Phone Link app (Start →
"Phone Link") shows recent Android/iPhone photos wirelessly.
**Pitfalls:** "Trust this computer" missed on the phone → nothing appears; the person must unlock the
phone during import.

## 10. Video call with family  (`video_call`)
**They say:** "call my daughter on video", "FaceTime my grandson", "video chat with the family".
**Ask first:** "Who do you want to see?"; "What do they usually use: FaceTime on an iPhone, WhatsApp,
Zoom, Facebook Messenger, or Google Meet?"
**Recipe:** FaceTime: Windows cannot start a FaceTime call, but can **join** one — the family member
creates a FaceTime link on their iPhone and emails/texts it; it opens in Edge/Chrome → type name →
Continue → Join; allow camera and microphone. WhatsApp: section 12 (desktop app → chat → video camera
icon, top right). Zoom: section 11. Messenger: https://www.messenger.com → chat → camera icon.
Google Meet: link → https://meet.google.com/... → "Ask to join"/"Join now".
**Person does:** allows camera/mic the first time ("Allow" in the browser box, top left), speaks.
**Pitfalls:** blocked camera/mic permission (browser address bar camera icon → Allow); wrong
speaker/mic; the helper overlay must not cover the call — collapse the widget during calls.

## 11. Join a Zoom meeting from an email  (`zoom_link`)
**They say:** "join the Zoom", "my doctor sent a Zoom link", "church meeting on Zoom", "open the
meeting".
**Ask first:** "Which email is the invitation in, and who sent it?"
**Recipe:** open the email → click the link (…zoom.us/j/…) → browser asks "Open Zoom Workplace?" →
**Open**. No app installed: click **Cancel**, then "**Join from your browser**" at the bottom of the
page. Enter name → Join. Passcode is in the same email. "Join with Computer Audio". Bottom-left
**Unmute** and **Start Video**; red **Leave** bottom right. Suggest joining 5 minutes early.
**Pitfalls:** fake Zoom links (domain must end in zoom.us or zoomgov.com); "update Zoom" pop-ups from
websites; waiting room ("the host will let you in soon" — say so, it's normal). Sources:
https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0060732 ·
https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0065180

## 12. WhatsApp on the computer  (`whatsapp`)
**They say:** "WhatsApp on the computer", "message my family on WhatsApp", "see my WhatsApp on the big
screen".
**Ask first:** "Do you have WhatsApp on your phone already?" (required).
**Recipe:** install **WhatsApp** from the Microsoft Store (publisher WhatsApp Inc.) or use
https://web.whatsapp.com. A QR code appears. On the phone: iPhone → WhatsApp **Settings → Linked
devices → Link a device**; Android → **⋮ → Linked devices → Link a device** → point the phone at the
screen (person). Then: chats on the left, type at the bottom, camera icon top right for video.
**Person does:** everything on the phone, pressing Send for anything important.
**Pitfalls:** "Hi Mum/Dad, this is my new number" scam; fake WhatsApp download sites (Store only).

## 13. Print something  (`print`)
**They say:** "print this", "print my boarding pass", "print the recipe", "the printer won't print".
**Ask first:** "What do you want to print: something on the screen now, an email, or a file?"
**Recipe:** Ctrl+P (or "…" menu → Print) → check the printer name → pages ("All" / "Current page") →
Print. Emails: open it → "…" → Print. Won't print → support: `run_check printers`; Settings →
Bluetooth & devices → Printers & scanners → select printer → Open print queue → untick "Pause
printing" / "Use printer offline"; turn printer off/on (person); Get Help printer troubleshooter.
**Person does:** power, paper, ink, cables.
**Pitfalls:** printing 40 pages of a web page — show page count first; "printer driver" download
sites are scams (drivers come from Windows Update or the maker's site). Sources:
https://support.microsoft.com/en-us/windows/hardware/printer/troubleshooting-offline-printer-problems-in-windows

## 14. Make things bigger / easier to see  (`text_size`)
**They say:** "the words are too small", "make it bigger", "I can't read the screen", "zoom in".
**Ask first:** "Is it everything on the computer, or just this one page?"
**Recipe:** this page only → **Ctrl and +** (Ctrl and 0 resets); everything → Settings → Accessibility
→ **Text size** slider → Apply (Win+U opens Accessibility); also Display → Scale 125–175%;
Magnifier Win and + (Win+Esc closes); high contrast/dark mode: Accessibility → Contrast themes.
Mouse pointer: Accessibility → Mouse pointer and touch → size.
**Person does:** says when it looks right ("Is this better?" after each step).
**Pitfalls:** changes to Settings = confirm card; Scale changes can move buttons — tell them.
Sources: https://support.microsoft.com/en-us/accessibility/windows/make-text-and-apps-bigger

## 15. No sound / too quiet  (`sound`)
**They say:** "I can't hear anything", "no sound", "the video has no sound", "make it louder".
**Mode:** support (diagnose first, no screen control): `run_check sound`.
**Recipe:** speaker icon bottom right of the taskbar (or Win+A) → slider up; mute cross? → click the
speaker. Wrong output: the ">" next to the volume slider → choose speakers/headphones. In a website:
the video's own speaker icon; a muted browser tab. Bluetooth headphones may be grabbing sound.
Fix: `apply_fix unmute_audio`.
**Person does:** turns on external speakers / checks the plug.

## 16. Wi-Fi / internet not working  (`wifi`)
**They say:** "the internet is down", "no Wi-Fi", "it says no internet", "pages won't load".
**Mode:** support: `run_check network`.
**Recipe:** Win+A → Wi-Fi tile on? Airplane mode off? ">" next to Wi-Fi → pick the home network →
Connect → password (on the router sticker; **person types**). Router restart: unplug 30 seconds, plug
back, wait 2–3 minutes (person). `apply_fix flush_dns` if connected but pages fail.
**Pitfalls:** "Wi-Fi repair" / "ISP support" phone numbers from search results are scams; the real
provider number is on the bill.

## 17. Windows updates  (`updates`)
**They say:** "it wants to update", "should I update", "is my computer up to date", "Windows 10 is
ending".
**Mode:** support: `run_check updates`.
**Recipe:** Windows 11: Settings → **Windows Update** → Check for updates → install → restart at a
convenient time (Restart = confirm). Windows 10: Settings → Update & Security → Windows Update →
**"Enroll now"** for Extended Security Updates — free (syncing PC settings) or 1,000 Rewards points
or $30; coverage now runs to **October 12, 2027** (extended from Oct 13 2026).
**Pitfalls:** Windows never updates from a website pop-up or a phone call; "update your browser/Flash/
driver" pages are scams; don't restart during a download. Sources:
https://www.microsoft.com/en-us/windows/extended-security-updates ·
https://www.bleepingcomputer.com/news/microsoft/microsoft-quietly-extends-free-windows-10-esu-support-to-october-2027/

## 18. Find a file or a download  (`find_files`)
**They say:** "where did my document go", "I saved it and now it's gone", "where are my downloads",
"find the letter I wrote".
**Ask first:** "What is it — a letter, a photo, or something from the internet or email? Do you remember
any word in its name?"
**Recipe:** File Explorer (Win+E) → **Home/Recent** shows recent files; **Downloads** for anything from
the internet or email; Documents/Pictures otherwise. Search box top right of File Explorer. Browser
downloads list: Ctrl+J. Word: File → Open → Recent.
**Pitfalls:** OneDrive "Files On-Demand" cloud icons; don't delete anything while looking; offer to
put a shortcut on the launcher Family/Lessons area.

## 19. Shop online carefully  (`shopping`)
**They say:** "order more printer ink", "buy a birthday present on Amazon", "is this website real".
**Ask first:** "Which store do you usually use: Amazon, Walmart, Target, or another?"
**Recipe:** type the store address (https://www.amazon.com, https://www.walmart.com,
https://www.target.com, https://www.costco.com) — never from ads, emails, or social media. Search →
helper reads price, seller, delivery date, reviews count aloud → Add to cart → cart → checkout →
helper shows the order summary on a confirm card.
**Person does:** chooses the item, signs in, checks the total, presses **Place your order**.
**Pitfalls:** fake stores with huge discounts (site < 1 year old, no phone, pays only by Zelle/gift
card/crypto → refuse); "Sold by" a third party; subscription tick boxes ("Subscribe & Save", Prime
trial) — point them out; gift cards as payment = always a scam. Prefer credit card over debit.

## 20. Log in to my bank  (`banking`)
**They say:** "check my bank balance", "log in to Chase", "did my pension come in", "pay my bill".
**Ask first:** "Which bank is it?" (remember it + its confirmed web address).
**Recipe:** open the bank's address from memory/favorites, or the person reads it from the back of their
card/statement. Never from a search ad or an email/text link. Helper says: "Please type your username
and password now; I'll look away." (pause screenshots/logging while the password box is focused).
Show balance/transactions on request.
**Person does:** username, password, codes, every payment and transfer (helper never moves money).
**Pitfalls (hard stop + warning):** anyone on the phone telling them to log in, move money to a "safe
account", buy gift cards, withdraw cash, or install an app; a text "your account is locked"; a
"bank" pop-up with a phone number. Banks never ask for your code.

## 21. MyChart / patient portal  (`mychart`)
**They say:** "see my test results", "message my doctor", "MyChart", "book an appointment", "my video
visit".
**Ask first:** "Which hospital or doctor's office is it with?"
**Recipe:** https://www.mychart.org → find your organization (search by name) → that system's MyChart
login. Person signs in. Menu: **Messages** (write to doctor), **Test Results**, **Visits/Appointments**
(eCheck-in, video visit "Begin visit" ~15 minutes before). Forgot login → "Forgot username?" /
"Forgot password?" under the boxes; new account needs the activation code from the after-visit summary.
**Person does:** login, choosing appointment times, sending messages about their health.
**Pitfalls:** people have several MyCharts (one per health system); don't interpret results — read them
and suggest asking the doctor. Sources: https://www.mychart.org/l/en-us/help/forgot-password/

## 22. Medicare.gov  (`medicare`)
**They say:** "log into Medicare", "compare drug plans", "open enrollment", "print my Medicare card".
**Recipe:** https://www.medicare.gov → **Log in** (https://www.medicare.gov/account/login). Since
March 2026 new accounts use **ID.me, CLEAR, or Login.gov** (free; existing Medicare logins still work
for now). Plan comparison: https://www.medicare.gov/plan-compare. **Open Enrollment: Oct 15 – Dec 7**
(changes start Jan 1). Help: 1-800-MEDICARE (1-800-633-4227). Replacement card: account → "Get
your Medicare card".
**Person does:** identity verification (ID photo, selfie, codes), choosing a plan.
**Pitfalls:** Medicare never calls, texts, or emails asking for your Medicare number or to "renew" a
card; search ads for "Medicare help" often go to brokers; "free" gift offers for switching plans.
Sources: https://www.medicare.gov/account/login/help · https://www.cms.gov/newsroom/fact-sheets/medicare-gov-enhanced-log ·
https://www.medicare.gov/health-drug-plans/open-enrollment

## 23. Read the news  (`news`)
**They say:** "show me the news", "what's the weather", "read the paper", "local news".
**Ask first:** "Which news do you like: a newspaper, a TV channel, or just the headlines?"
**Recipe:** open their named source directly (e.g. https://apnews.com, https://www.npr.org,
https://www.bbc.com/news, their local paper); weather: https://weather.gov or Start → Weather. Edge
**Immersive Reader** (F9 or book icon in the address bar) removes clutter and reads aloud.
**Pitfalls:** "Your computer is infected" or prize pop-ups on news sites (→ section 27); paywall
subscribe prompts — never pay without the person; "sponsored" story blocks.

## 24. YouTube  (`youtube`)
**They say:** "play some Frank Sinatra", "find a video on how to…", "watch Lawrence Welk", "church service".
**Recipe:** https://www.youtube.com → search box top centre → click a video → **Full screen** button
bottom right of the video (or F; Esc exits) → CC for subtitles → "Skip" appears bottom right of ads
after ~5 s.
**Pitfalls:** ads/videos/comments with "tech support" or "crypto" phone numbers or links; "Subscribe"
is free but "Join"/"Super Thanks" cost money.

## 25. Facebook  (`facebook`)
**They say:** "see my grandkids on Facebook", "post a picture", "message on Facebook", "someone sent a
friend request".
**Recipe:** https://www.facebook.com → person logs in → Home feed; search (top left) for a person;
Messenger icon top right; to post: "What's on your mind?" → Photo/video → person picks → **Post**.
**Person does:** login, choosing what to post, pressing Post, accepting friend requests.
**Pitfalls:** duplicate/cloned friend requests from people already friends; "Is this you in this
video?" links; Marketplace sellers wanting deposits or Zelle; quizzes asking for pet names/birth
year (security questions); "Facebook support" phone numbers (there are none).

## 26. Games  (`games`)
**They say:** "play solitaire", "cards", "crossword", "mahjong", "a game".
**Recipe:** Start → type "Solitaire" → **Microsoft Solitaire Collection** → Klondike (classic). Free
with ads; it upsells a Premium subscription — don't buy unless asked (paid users still report ads in
2026). Ad-light alternative: https://games.aarp.org (free solitaire, mahjong, crosswords).
**Pitfalls:** ads that look like "Play"/"Download" buttons install junk; never install "free game"
downloads. Source: https://learn.microsoft.com/en-us/answers/questions/5958305/have-active-paid-subscription-for-ms-solitaire-col

## 27. My computer is slow  (`slow_computer`)
**They say:** "the computer is so slow", "everything takes forever", "it keeps freezing", "the fan is loud".
**Mode:** support (no screen control): `run_check overview`, `top_processes`, `startup_apps`,
`disk_space`, then explain in plain words and propose ≤ 3 fixes, each with confirm.
**Common causes → fix:** not restarted in > 7 days → `restart_computer`; browser with dozens of tabs →
`close_app` or close tabs; disk < 10% free → `clear_temp` (+ empty Recycle Bin only with a yes);
heavy startup apps → `disable_startup_app`; Windows Update running → wait; 4 GB RAM machine → say
honestly it is the machine; Defender full scan running → wait.
**Pitfalls:** never install "PC cleaner", "driver updater", "RAM booster" — these are often scams;
never call numbers from pop-ups.

## 28. Scary pop-up / "is this real?"  (`scary_popup`)
**They say:** "it says I have a virus", "my computer is locked", "a Microsoft warning with a phone
number", "someone called saying they're from Microsoft/Amazon/my bank".
**Recipe:** say calmly: "This is a fake warning. Your computer is fine. Don't call the number." Press
**Esc** (exit full screen) → **Ctrl+W** closes the tab; if stuck, Ctrl+Shift+Esc → Task Manager →
end the browser → reopen and choose **not** to restore pages. Then `apply_fix defender_quick_scan`.
If they already called / let someone connect / paid: alert family; call the bank from the number on
the card; report at https://reportfraud.ftc.gov and https://www.ic3.gov; AARP Fraud Watch
Helpline 877-908-3360; uninstall any remote-access tool they were told to install.
**Hard rules:** never open AnyDesk/TeamViewer/Quick Assist etc.; never buy gift cards/crypto/wire.

## 29. Forgot my password  (`forgot_password`)
**They say:** "I forgot my password", "it won't let me in", "locked out".
**Ask first:** "Which account is it: email, Apple, bank, or something else?"
**Recipe:** click "**Forgot password?**" under the password box, or the recovery pages:
Google https://accounts.google.com/signin/recovery · Microsoft https://account.live.com/password/reset ·
Yahoo https://login.yahoo.com/forgot · AOL https://login.aol.com/forgot · Apple https://iforgot.apple.com.
A code goes to their phone or backup email; the person reads it and types it; they choose and type
the new password. Suggest writing it in a paper notebook kept at home.
**Pitfalls:** never share a code with a caller; "account recovery" phone numbers from search results
are scams; bank/Medicare logins: use the site's own link only.

## 30. Write a letter  (`write_letter`)
**They say:** "type a letter", "write a note to the insurance company", "make a list".
**Recipe:** Word if installed (Start → Word → Blank document); otherwise https://docs.google.com or
Notepad. The person dictates, helper types, reads back; Ctrl+S → Documents → name it (tell them the
name for later); Ctrl+P to print.
**Pitfalls:** WordPad was removed from Windows 11 24H2; Word "Activate/Subscribe" banner — don't buy.

---

## 31. How the app uses playbooks.json

- `router.js` / `agent.js`: lowercase the utterance, pick playbooks whose any trigger is a substring
  (max 2, most trigger hits first). Inject `hints` into the brain's system prompt as
  "Known recipe for this task: …". Run `ask_first` questions one at a time **only** for facts not in
  memory (`memory.js`); store each answer with `remember`.
- Hints are guidance, not scripts: the brain still observes the real screen (UI changes monthly).
- Budget: file kept < 16,000 chars so all of it can be cached in the system prompt if wanted
  (~4k tokens).
- Refresh this file each quarter; provider UIs shift (Outlook web and Gmail both changed toolbars in 2025).
