# 08 · Cheaper computer use: how the field does it, and a ranked plan for Barnaby

Date: 2026-09-27. Scope: cut the cost per task without lowering success rate or safety.
Evidence labels: plain numbers with a link are externally verified, and a corrected figure is used wherever a fact-check found an error. **[M]** means measured by us, from Barnaby logs or our own probe calls (the scripts are in `research/08_probes/`). **[E]** means our own arithmetic or estimate, not a measured run. **[I]** means an idea only, with no evidence behind it.

---

## 1. TL;DR

- **We pay 7.9x the input price in the brief.** Every brain call is served by **Phala**, which is first in `config.js` providers: $0.276/M input, $1.104/M output, $0.0055/M cached. The $0.035/M figure is Wafer's listing. That is why a photo email bills **$0.034**, not about $0.011. At Phala, uncached input is about 78% of the bill, output (thinking included) about 20% and cache reads about 2%. Jev costs about **$0.00003 per call** [M], roughly 2% of a task.
- **The cheapest big win is our own cache bug.** Only about 52% of input tokens hit the cache. Our probes show that the first switch to a different reasoning effort is a full cache miss [M], and `_effort()` switches between high and low from step to step. The fix is to make effort changes rare and one-way, and to keep the system prompt static. Estimated result: **$0.034 → $0.017–0.022** per photo email [E], for about half a day of work.
- **Next, cut brain calls. That is where the field's savings come from.** Two techniques:
  - Batch several element_id actions per call and verify each one locally against UIA. [UFO2](https://arxiv.org/html/2504.14603) cut steps by 44–51.5% on OSWorld-W with no loss of success. [Agent S3](https://arxiv.org/html/2510.02250) made 52.3% fewer LLM calls.
  - Replay saved lessons through the existing `act()` pipeline. [SkillDroid](https://arxiv.org/html/2604.14872) made 49% fewer LLM calls, and 23% of its rounds used no LLM at all.
  Do the soft version (lesson hint in the prompt) first, because the pieces already exist.
- **Jev is the gate, never the hand.** Jev routes a request to a lesson, breaks ties between 2–5 candidate elements, checks screen state from UIA text and flags "stuck". It always works behind a calibrated confidence gate. It never picks GUI actions: an untrained judge scored 0% in [V-Droid](https://arxiv.org/html/2503.15937v2). It never outputs coordinates. Neither a separate pixel-grounding model nor a swap to a small native computer-use model lowers our cost: Barnaby is already at [Fara-7B](https://arxiv.org/abs/2511.19663)'s $0.025 per task.
- **The provider is the largest single lever, and it is Erol's privacy call.** After the cache fix, a photo email is estimated at about $0.017–0.022 on Phala, $0.009–0.011 on DeepInfra fp8 and $0.003–0.004 on InferenceNet [E]. All three are zero-data-retention endpoints; only Phala is the confidential-computing enclave we chose. Nothing ships until the sim suite at k=3 shows no quality loss and every safety scenario passes 3 of 3.

---

## 2. Where the money goes per Barnaby step

**Measured run** [M]: `sim-runs/anne-marie`, 2026-09-27 00:13, a photo email. It passed, with 22 brain calls and 23 Jev calls, took 190 s and was billed $0.034, with all 22 calls served by Phala. The previous run of the same scenario made 24 calls and cost $0.025. That spread fits erratic caching.

- Tokens: 202,691 input and 6,164 output (33:1).
- Per call: 9,213 input tokens on average, rising from 5,591 at step 1 to a peak of 12,220; 280 output tokens on average.
- Cost per call: $0.00028–0.00264, $0.00155 on average.
- Actions: 10 of the 22 brain calls issued a click or type_text. The tallies in `events.jsonl` are 7 click, 3 type_text, 4 guide_user, 2 open, 1 confirm, 1 done and 2 remember. About 19 of the 21 calls that carried a tool call were mechanical. set_plan appeared in 7 of those 21 calls.

**Cost of an average step:**

| Part of the step | Tokens | At the brief's prices (Wafer: $0.0348 in / $0.0314 cached / $0.60 out per M) | At actual prices (Phala: $0.276 / $0.00552 / $1.104 per M) |
|---|---|---|---|
| Uncached input | ~4,400 | $0.000153 | **$0.00121 (78%)** |
| Cached input | ~4,800 | $0.000151 | $0.00003 (2%) |
| Output, thinking included | 280 | $0.000168 | $0.00031 (20%) |
| **Per step** | | **~$0.00047** | **~$0.00155** |
| **Per task (22 steps)** | | ~$0.0104 | **~$0.034, which matches the bill** |
| Input : output share of cost | | 64 : 36 | 80 : 20 |

**Assumptions:**
- *The cache split (about 48% of input uncached) is inferred*, by fitting Phala's list prices to each call's bill. `llm.js` logs only input and output tokens, so cached_tokens has never actually been measured. If Phala's listed 0.2 discount applies to the bill, the uncached share would be about 63% instead. Logging it is step 0 of the plan.
- *Thinking tokens are counted inside output*, because the price fit reproduces the bill. reasoning_tokens is not logged separately. The biggest outputs were set_plan calls (811 and 571 tokens), one ask_user (736) and the final call (800).
- **So thinking can move at most about 20% of the bill at Phala**, or about 35% at the brief's prices. The thinking policy costs us money mainly by breaking the cache, not through output tokens.

**What a step-1 prompt contains** [M]: system prompt 1,336 tokens, 17 tool definitions 3,004, screenshot 643 (1280x800), UIA list plus intro about 600. The static prefix of about 4.3k tokens is 78% of step 1 and about 47% of an average step. It should be a cache hit every time.

**Real apps cost more than the sim** [M]. The UIA list costs about 19.5–19.9 tokens per element. A real window has 138–250 elements: the log shows the Claude window at 138 shown out of 161 found, and Barnaby caps the list at 250. That is 2.7k–4.9k tokens per step, 4–8x the screenshot. Sim windows are small, so sim costs understate real-app costs.

**Why the cache misses** [M, consistent with the [OpenClaw caching docs](https://docs.openclaw.ai/reference/prompt-caching)]. On Phala, each reasoning.effort level behaves like a separate cache:
- 12 of 12 repeats of a level already used in the conversation hit the cache.
- 3 of 3 first switches to a new level missed completely.

`_effort()` (agent.js:591–611) runs high at step 1, high after a surprise and low on routine steps, so every switch re-prefills the growing history. Two calls with zero cache hits are not explained by this. They may come from Phala replica routing or cache eviction; that is unverified.

**Jev cost** [M]:
- The sim run: 23 calls for $0.00068, about $0.00003 per call.
- Single probe calls: $0.000014–0.000028.
- 8 questions batched into one call: $0.000024.
- The same call with the full 250-element list in its state: $0.00035.

So one Jev call costs about 1/50 of an average brain step. Jev pays for itself if it removes a brain call in about 2% or more of the cases we ask it about. Keep Jev's state small (region names, or 2–5 candidates), never the full list. The brief's figure of $0.0005–0.0015 per call is not what we measure.

---

## 3. How the field does it

### 3.1 Cache and prefix discipline
| Technique | Verified result | Caveat |
|---|---|---|
| Stable prefix, context that is only appended to, no timestamps near the top ([Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)) | Cached input costs 10x less on Sonnet ($0.30 vs $3 per MTok); the input:output ratio is about 100:1 | Anthropic prices, not DeepSeek's |
| Never truncate screenshots when caching is on; prune old ones in chunks (keep the last 3, prune every 25 turns); put one cache breakpoint after system + tools ([Anthropic loop.py](https://github.com/anthropics/claude-quickstarts/blob/main/computer-use-demo/computer_use_demo/loop.py), [computer-use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)) | Pruning on every turn "changes the prefix every turn and invalidates the cache" | — |
| Put stable context before per-turn metadata ([OpenClaw](https://docs.openclaw.ai/reference/prompt-caching)) | Changing the thinking level can invalidate reuse even when the prompt is unchanged | — |
| OpenRouter mechanics ([docs](https://openrouter.ai/docs/guides/best-practices/prompt-caching)) | Cache hits appear in `usage.prompt_tokens_details.cached_tokens`. Sticky routing is off when `provider.order` is set | Cache-read price depends on the provider: 0.02x of input (Phala, DeepSeek) up to 0.9x (Wafer) |

### 3.2 Smaller observations
| Technique | Verified result | Caveat |
|---|---|---|
| Compact element encoding, JSON → HTML ([Skyvern](https://www.skyvern.com/blog/html-vs-json-llm-tokens-cost-reduction-success-rate/)) | 20–27% fewer tokens. In a production A/B of about 1,100 tasks, median cost per successful task fell 11.4% ($1.22 → $1.08) and success rose from 59.9% to 63.8% | Web DOM, not UIA |
| LLM retriever prunes the accessibility tree ([FocusAgent](https://arxiv.org/html/2510.03204)) | Pruned 53–61% of the tree. With a GPT-5-mini retriever, success held (WorkArena L1 53.6 → 53.2; WebArena 36.5 → 39.6) and cost fell about 19–22%. Pop-up injection success fell from 90.4% to 1.0% | Weaker retrievers lost success: GPT-4.1-mini 51.5 / 32.3; BM25 45.8 and embeddings 42.4 on WorkArena |
| Compress the accessibility tree ([A11y-Compressor](https://iyatomilab.github.io/a11y-compressor/)) | About 22% of the tokens, +5.1 points on OSWorld (Qwen3-VL-32B) | — |
| Accessibility tree vs screenshot ([OSWorld](https://arxiv.org/html/2404.07972v2)) | Tree only (GPT-4) 12.24% vs screenshot only (GPT-4V) 5.26%. About 6k tokens covers 90% of observations | 2024 models |
| Screenshot tokens at 1280x800 | DeepSeek 643 [M] ([cap 1,024](https://api-docs.deepseek.com/guides/vision/)); [Claude](https://platform.claude.com/docs/en/build-with-claude/vision) 1,334; [OpenAI](https://developers.openai.com/api/docs/guides/images-vision) 32-px models about 1,200; [Gemini 3](https://ai.google.dev/gemini-api/docs/media-resolution) 1,120 by default; [Qwen3-VL](https://github.com/QwenLM/Qwen3-VL) about 1,000 | 960x600 is 363 tokens on DeepSeek [M]. `detail:'low'` is ignored when sent through OpenRouter [M] |

### 3.3 Fewer planner calls
| Technique | Verified result | Caveat |
|---|---|---|
| Several actions per call, each checked against UIA before it runs ([UFO2](https://arxiv.org/html/2504.14603v2)) | OSWorld-W: GPT-4o went from 13.3 to 7.4 steps (−44%) with no loss of success; o1 from 6.8 to 3.3 steps (−51.5%), with success 24.5% → 26.5% | On WindowsAgentArena only up to about 10% fewer steps, and o1's success dipped from 25.3% to 24.7% |
| Flat policy plus a code tool instead of a manager/worker split ([Agent S3](https://arxiv.org/html/2510.02250)) | 52.3% fewer LLM calls, 62.4% less time, success 48.8% → 62.6% on OSWorld | GPT-5 planner |
| Batched actions built into the APIs ([Anthropic](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool), [OpenAI](https://developers.openai.com/api/docs/guides/tools-computer-use)) | Actions run in order and stop at the first failure; the rest are marked "Not executed"; the batch ends with a screenshot | — |
| Speculative actions ([arXiv 2510.04371](https://arxiv.org/abs/2510.04371)) | Up to 55% of next actions predicted correctly, up to 20% lower latency | Cuts latency, adds cost |

### 3.4 Replay: hard (skip the LLM) and soft (show the model a past workflow)
| Technique | Verified result | Caveat |
|---|---|---|
| Weighted multi-attribute locator plus drift levels and fallback budgets ([SkillDroid](https://arxiv.org/html/2604.14872)). Weights: resourceId 0.40, text 0.20, contentDesc 0.15, className 0.10, parent 0.10, sibling 0.05. Threshold τ = 0.5 when nothing moved, 0.3 when elements shifted. Abort after 2 consecutive or 5 total fallbacks; re-record when failure rate > 0.5 | 85.3% vs 62.0% success; 5.8 vs 11.3 LLM calls (−49%); 23.3% of rounds used no LLM; success rose from 87% to 91% over time while the baseline fell from 80% to 44% | Android, 15 task types, authors' own evaluation. Its "2.4x faster" compares different task sets. **It auto-dismisses unexpected dialogs, which is unsafe for us** |
| Queue of locators, most precise first ([AutoDroid-V2](https://arxiv.org/html/2412.18116)) | 54.4% vs 43.9% success; 43.5x fewer runtime input tokens; latency 669 s → 46 s | Its output-token figures contradict each other |
| Compile a run to code, fall back to the agent ([Skyvern](https://www.skyvern.com/blog/asking-ai-to-build-scrapers-should-be-easy-right/)) | Average run cost $0.11 → $0.04, time 279 s → 120 s | Vendor-reported. Recovery order: alternate selectors, then one targeted model question, then the full agent with the cache regenerated |
| Reuse steps from a tree of past runs ([MobiMem](https://arxiv.org/pdf/2512.15784)) | Up to 4.5x faster when more than 92% of actions are reused; up to +50.3% success | **At about 70% reuse, runs got slower**, because every cache miss costs an extra LLM call |
| State machine plus generated programs ([ActionEngine](https://arxiv.org/abs/2602.20502), [survey](https://arxiv.org/html/2609.02309)) | 95% vs 66% success; $0.71 → $0.06; 10.2 → 1.8 LLM calls; 62.3k → 8.1k input tokens | Stronger base model than the baseline; the state machine is built by offline crawling, not from users' runs |
| Checks before and after each replayed step ([muscle-mem](https://github.com/pig-dot-dev/muscle-mem), [ReUseIt](https://arxiv.org/html/2510.14308v1)) | ReUseIt, with LLM yes/no checks and up to 3 retries: 24.2% → 70.1% on 15 web tasks | No cost figures published |
| Step cache keyed on instruction + page state ([Stagehand](https://docs.stagehand.dev/v4/best-practices/caching)); healing with voting ([UiPath](https://docs.uipath.com/agents/automation-cloud/latest/user-guide-ha/frequently-asked-questions)) | Useful ideas: key on a scoped UI subtree, serve an entry only after N identical results, recommendation-only mode | No hit-rate or cost figures published |
| Soft replay: past workflows in the prompt ([AWM](https://arxiv.org/html/2409.07429v1), [AppAgentX](https://arxiv.org/html/2503.02268v1), [Plan Caching](https://arxiv.org/abs/2506.14852)) | AWM: WebArena success 23.5% → 35.5%, steps 7.9 → 5.9. AppAgentX: steps 9.1 → 5.7, tokens 9.26k → 4.94k, success 70.8% → 71.4%. Plan caching: 50.31% lower cost, 27.28% lower latency | Academic benchmarks. The brain still decides every action, so the safety risk is low |

### 3.5 Cascades and calibrated routing
| Technique | Verified result | Caveat |
|---|---|---|
| A cheap agent by default; hand over to a strong model on "stuck" or check with it at "milestones" ([StepWise](https://arxiv.org/html/2604.27151v1)) | OSWorld: 58.2% at $0.051 vs the strong model alone at 60.1% and $0.132 (−61.4% cost). Checks triggered by events beat periodic checks (58.2% at $0.05 vs 55.1% at $0.07). Stuck-detector F1 91.5%; milestone-detector F1 62.0% | Success loss across model pairings: 0.8–3.8 points (OSWorld), 1.3–3.7 (WebArena) |
| Small model first, escalate by confidence, risky actions always escalated ([AVR](https://arxiv.org/pdf/2603.12823)) | 69% cost cut (cold) and 86% (warm) on the OpenClaw benchmark | Its 52–78% savings for computer use are **projected, not measured** |
| Verifier scores about 20 candidate actions per screen ([V-Droid](https://arxiv.org/html/2503.15937v2)) | 59.5% on AndroidWorld | Trained on 110K samples; **an untrained LLM judge scored 0%**. Choosing an action takes 0.7 s; a full step 3.8 s |
| Threshold with a statistical guarantee ([Trust or Escalate](https://arxiv.org/html/2407.18370v1)) | Pick the lowest λ whose binomial upper bound on error is ≤ α (500 calibration samples, δ = 0.1): 85.8% agreement with humans at 63.2% coverage; a weaker cascade kept an 80% guarantee at 0.126x GPT-4's cost | Only holds if the calibration data looks like real traffic |
| Routers ([RouteLLM](https://www.lmsys.org/blog/2024-07-01-routellm/), [FrugalGPT](https://arxiv.org/abs/2305.05176)) | Cost cut of more than 85% (MT Bench), 45% (MMLU) and 35% (GSM8K) at 95% of GPT-4's quality; FrugalGPT up to 98% | The [README](https://github.com/lm-sys/routellm) warns that thresholds shift with real queries; [Argus](https://arxiv.org/abs/2606.25760) found uncertainty calibration transfers poorly between model vendors |
| Strong advisor gives short hints ([Anthropic advisor](https://claude.com/blog/the-advisor-strategy), [Shepherding](https://arxiv.org/abs/2601.22132)) | Sonnet with an Opus advisor: +2.7 points on SWE-bench Multilingual at 11.9% lower cost. Haiku with an Opus advisor: 41.2% vs 19.7% alone on BrowseComp. Shepherding: 42–94% cheaper than the large model alone | Coding, browsing and math benchmarks, not GUI tasks |

### 3.6 Adaptive thinking
[ARES](https://arxiv.org/html/2603.07915v1) picks the effort per step with a small router. Always-low cost about 20 points (TAU-bench Retail: 35.0% vs 54.8%). The RL-trained router scored 58.5% using 52.7% fewer tokens, and on WebArena 46.5% vs 45.0% using 45.3% fewer. Its labels are the lowest effort that reproduces the correct action in 3 samples. [DART](https://arxiv.org/abs/2606.23181) cut thinking tokens by 32–73% on reasoning benchmarks, not agent tasks. [CogRouter](https://arxiv.org/abs/2602.12662) used 62% fewer tokens than GRPO, not than an always-think baseline.

### 3.7 Planner/grounder split: it buys accuracy, not lower cost
- **Accuracy gains are real.** GPT-4o alone scores 5.0% on OSWorld and 27.0% with the Jedi-7B grounder ([OSWorld-G](https://arxiv.org/html/2505.13227)). o3 + Jedi-7B scores 51.0% and o3 + GroundNext-3B 50.6% ([GroundCUA](https://arxiv.org/html/2511.07332)). GPT-5 + UI-TARS-1.5-7B scores 62.6% ([Agent S3](https://arxiv.org/html/2510.02250)).
- **Grounding is a small cost.** It takes 1.8–3.9% of an agent's latency, while planning takes 53–75% ([OSWorld-Human](https://arxiv.org/html/2506.16042)). Surfer-H's cost cut came from a cheap *policy* model: Holo1-7B at $0.13 per task vs GPT-4.1 at $0.54, 92.2% vs 92.0% success ([paper](https://arxiv.org/html/2506.02865v1)). Those are successes after 10 attempts, and every configuration also uses a GPT-4o validator.
- **For us, grounders cost more per token than the brain.** UI-TARS-1.5-7B is $0.10/$0.20 per M, from a single provider (Parasail) whose zero-data-retention status is unverified.
- **Use UIA first and vision only where UIA is blind** ([UFO2](https://arxiv.org/html/2504.14603)). With o1, UIA + vision scored 27.9%/28.6% vs UIA alone at 25.3%/24.5% (WAA / OSWorld-W). Over 62% of WAA failures were controls that were never detected. In a [2026 Windows study](https://arxiv.org/html/2609.00524v1), 22.6% of failures were actions on hallucinated or misplaced targets.
- **Zooming in helps with small targets.** On [ScreenSpot-Pro](https://arxiv.org/html/2504.07981v1) targets cover 0.07% of the screen. With OS-Atlas-7B as the grounder, ReGround adds 21.3 points and ScreenSeekeR 29.2.

### 3.8 Small native computer-use models: a yardstick, not a swap
[Fara-7B](https://arxiv.org/abs/2511.19663), browser only: $0.025 per task, 16.5 actions, 73.5% on WebVoyager. SoM agents cost $0.316 per task on GPT-5 and $0.514 on o3. UI-TARS-1.5-7B scores 27.5% on OSWorld ([README](https://github.com/bytedance/UI-TARS)). A Barnaby photo email already costs $0.025–0.034.

### 3.9 Provider pricing: same model, different endpoints ([OpenRouter endpoints](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints), 2026-09-27)
| Endpoint (all zero data retention) | Input / output / cache read, $ per M | Anne-marie run, re-priced with no caching → perfect caching [E] |
|---|---|---|
| Phala (ours; confidential-computing enclave) | 0.276 / 1.104 / 0.00552 | $0.034 actual → $0.0116 |
| DeepInfra fp8 (already in our fallback list) | 0.14 / 0.42 / 0.0042 | $0.031 → $0.0053 |
| Fireworks | 0.22 / 0.66 / 0.007 | $0.049 → $0.0084 |
| Wafer (the brief's price) | 0.0348 / 0.60 / 0.0314 | $0.0108 → $0.0101 (caching barely matters) |
| InferenceNet | 0.035 / 0.29 / 0.001 | $0.0089 → $0.0024 |

22 of the model's 27 endpoints are zero data retention. Seven zero-retention endpoints cost more than Phala, so it is upper-middle, not the top. The quantization of Phala, InferenceNet and Wafer is not published. [Browser Use](https://browser-use.com/benchmarks/agents) frames model choice as cost *per solved task*: $0.17 at 82% success vs Opus 5 at $3.40 and 62%.

---

## 4. Ranked plan for Barnaby (highest saving per unit of effort first)

Baseline: a photo email at $0.034 on Phala. Savings compound; they do not add. All savings figures are [E] until the sim suite measures them.

| # | Change | Effort | Estimated saving | Jev's job |
|---|---|---|---|---|
| 0 | Instrument cached, reasoning and image tokens, provider and Jev cost | hours | 0 (it makes every number below measurable) | — |
| 1 | Make effort changes rare and one-way | ½ day | $0.034 → **$0.017–0.022** | its existing ambiguous-step question, answer now sticky |
| 2 | Static system prompt | 1–2 h | ~$0.001 per task, and step 1 always hits the cache | — |
| 3 | Provider A/B (Erol decides) | ½ day + a sim run | after #1: Phala $17–22 per 1,000 tasks vs DeepInfra $9–11 vs InferenceNet $3–4 | — |
| 4 | Compact UIA list | 1 day | real apps $0.004–0.014 per task; sim ≈ 0 | — |
| 5 | Soft replay: route every request to the person's saved lessons | 1–2 days | repeat tasks: −20% to −35% of brain calls | lesson routing |
| 6 | Multi-action batches with deterministic UIA checks | 2–3 days | form-heavy tasks: −10% to −35% of brain calls | optional unexpected-dialog check |
| 7 | Hard replay of lessons through `act()` | 1–2 weeks | repeat tasks: −40% to −90% of brain calls; a clean replay uses only Jev calls | routing, tie-break, state guard |
| 8 | Jev region gating of the UIA list | 2–3 days, after #4 | real apps: up to about half of the list tokens | one yes/no per region |
| 9 | Screenshot policy | 1 day | ~$0.0013 per task at 960 px, plus images skipped on some steps | optional "does this step need a fresh look?" |

Combined [E]: items 1–2 give $0.017–0.022, and items 4–6 on top give about **$0.011–0.019 for a first-time photo email on Phala**. With item 7, a clean repeat costs about **$0.001–0.005**. With item 3, divide the Phala figures by roughly 2 for DeepInfra or 5 for InferenceNet.

### 0. Instrument first (prerequisite)
- **Build:** in `llm.js` and the `llm` event, log for every call: provider, effort, prompt_tokens, `cached_tokens`, `reasoning_tokens`, completion_tokens and billed cost. Log per step: action type, whether it used an element_id or x,y, replay hit or miss with the reason, batch length and why it stopped, Jev calls and their cost. Make sure `llmUsd` in `summary.jsonl` includes Jev.
- **Why:** the 52% cache share, the thinking share and the x,y-click population are all inferred today.

### 1. Make effort changes rare and one-way (the cache fix)
- **Build:** in `_effort()`, use high effort at step 1 and low from step 2. On the first surprise, support-mode step or Jev "needs careful thought" answer, switch to high **and stay high for the rest of the task**. That is at most 2 cache-splitting switches per task instead of one per surprise. Then test the alternative [I]: keep `reasoning.effort` fixed and add a line such as "think carefully about this step" at the *end* of the newest message, which does not break the cache. We do not know whether DeepSeek V4.1 respects such a line.
- **Jev vs DeepSeek:** Jev keeps its existing ambiguous-step noul question, but a "yes" is now sticky. DeepSeek is unchanged.
- **Saving:** $0.034 → $0.017–0.022 (−35% to −50%), with $0.0116 as the ceiling if only new tokens miss the cache. Uncached input is 78% of the bill, and every first use of a level re-prefills the whole growing history [M].
- **Risk → guard:** sticky-high raises output, which costs 4x input at Phala. Never use always-low: ARES lost about 20 points that way. Guard: run a sim A/B of today's `auto` vs sticky vs always-high, and ship the arm with the lowest cost per successful task among those that pass the section 5 gates. The cached share on steps 2 and later should rise from about 52% toward 70–80%. If it doesn't, the misses have another cause (replica routing, eviction), so investigate before moving on.

### 2. Static system prompt
- **Build:** `taskPrompt()` (agent.js:67) puts the person's facts, contacts, `memoryText`, playbook recipes, `lessonHint` and "Today is" into the system message. Move all of them to the first user message. The system prompt then holds only rules and safety, and it and the tool definitions stay byte-identical across tasks and users. Keep the existing one-line summaries that replace old observations (agent.js:510).
- **Jev vs DeepSeek:** neither changes.
- **Saving:** the 4.3k-token prefix becomes shared across tasks, about $0.0012 per task at Phala. This only holds if Phala keeps the cache between tasks: DeepSeek says hours to days; Phala is unknown.
- **Risk → guard:** memory instructions may be followed less reliably once they sit in a user message. Guard: the sim suite, especially the remembered-Gmail scenario that failed once.

### 3. Provider A/B (Erol's decision; recommendation below)
- **Build:** run the sim suite at k=3 with DeepInfra fp8 first (already in our fallback list; cache reads at 0.03x of input) and with InferenceNet first. Do this after items 1–2, so the cached prices are the ones being compared.
- **Saving [E], after the cache fix, per 1,000 photo emails:** Phala $17–22, DeepInfra fp8 $9–11, InferenceNet $3–4. Never pick on list price alone: Wafer's 0.9x cache price makes it a poor fit for a long, growing agent loop.
- **Risk → guard:** we lose the enclave guarantee that was the reason Phala was chosen. Whether any other endpoint offers an equivalent is unverified. Quantization is unknown. Guard: require the same pass^3 and all safety scenarios at 3/3. If we switch, route per *task* (sensitive tasks such as banking or health stay on Phala), never per step, because a provider switch starts a cold cache.
- **Recommendation:** run the A/B now; it is one config line. If quality is equal, the question for Erol is whether the enclave is worth about $6–19 more per 1,000 tasks.

### 4. Compact the UIA element list
- **Build:** in `_observe()` (agent.js ~649–658):
  - (a) Send the centre point `@cx,cy` instead of the full rectangle, except for the focused element and Edit fields. Keep full rectangles locally for the spoken "where it is" explanation. This cut 25% of list tokens [M].
  - (b) Collapse 5 or more consecutive siblings with the same role into a line like `[ids 40–71] 32 more ListItem rows`, and add an `expand_items` tool.
  - (c) Drop elements that are off-screen or not interactive.
  Keep the full map locally so any id the brain names still resolves.
- **Jev vs DeepSeek:** no Jev. DeepSeek sees less.
- **Saving:** the list is 2.7k–4.9k tokens per step in real apps. Format change alone saves 0.7k–1.2k tokens per step; collapsing and dropping rectangles on list-heavy windows saves up to about 2.6k. Over about 20 steps at $0.276/M that is $0.004–0.014 per task. The saving is near zero in the sim, where windows are small.
- **Risk → guard:** the target gets hidden in a collapsed range, or losing the rectangle weakens the match between the list and the screenshot. Guard: log how often the brain calls `expand_items`, clicks by x,y, or names a target that was not in the sent list, and roll back if any of these rises. Check on real Gmail-in-Edge and Outlook traces, not only the sim.

### 5. Soft replay: route every request to the person's saved lessons
- **Build:** today `runTask()` passes `lessonHint` only when the person is practising a lesson, but lessons with `rawSteps` are already saved after every run of 2 or more steps.
  - On every new request, keyword-match lesson titles (the way `matchPlaybooks` does). If there is no single clear hit, ask **one Jev choice** over the lesson titles plus "none", and accept only above its gate (start at 0.8, then calibrate as in section 5).
  - Put the matched lesson's steps into the *first user message*, not the system prompt (keeps item 2's cache), with personal values replaced by slots such as `{RECIPIENT}` and `{PHOTO}`.
  - Cache the lesson's `set_plan` output and offer it as the plan.
- **Jev vs DeepSeek:** Jev only routes. DeepSeek still decides every action.
- **Saving:** AWM cut steps 25%, AppAgentX cut steps 37% and tokens 47%, plan caching cut cost 50%. Our estimate is −20% to −35% of brain calls on repeat tasks, and 0 on first-time tasks.
- **Risk → guard:** a wrong lesson misleads the brain. Guard: the "none" option plus the gate. Add a sim scenario with a similar but different lesson (photo to Anne-Marie vs text to Anne-Marie) and check both the pass rate and the call count.

### 6. Several actions per brain call, checked by code
- **Build:** in do-it-for-me mode, let the brain return up to 4 click, type or key calls. The loop already runs several tool calls in order (agent.js ~554–578). Add a compound `fill(element_id, text)` tool.
  - *Before* each action, `tools.execute` re-reads the target from UIA: it exists, is enabled and visible, its rectangle is within tolerance, and the foreground window title is unchanged.
  - *After* typing, it checks that the field's value equals the text.
  - At the first mismatch it stops, marks the rest "Not executed" (Anthropic's pattern) and takes a fresh observation.
  - Each action still gets its spoken explanation and highlight. Teach mode stays one step at a time.
- **Never batch across** a confirm card, `guide_user`, `run_command`, a Send button, or any action the Jev gate marks confirm or refuse.
- **Jev vs DeepSeek:** DeepSeek plans the batch. The checks are deterministic code, which is cheaper and exact. Jev only answers "did an unexpected dialog appear?" when UIA shows a new top-level window and the rules can't tell.
- **Saving:** the Gmail compose segment took about 10 brain calls. The To, Subject and body pairs (4–6 calls) can collapse into 1–2. UFO2 saw −44% to −51.5% steps on OSWorld-W but only about −10% on WAA. Our estimate is −10% to −35% of brain calls on form-heavy tasks.
- **Risk → guard:** acting on a screen that has changed (a popup, autocomplete stealing focus, a slow page). Guard: the checks above, the cap of 4, and sim perturbation scenarios with an autocomplete dropdown, a popup in the middle of a batch and a slow window.

### 7. Hard replay of saved lessons through `act()`
- **Build:**
  - (a) Enrich `record()` (tools.js:170), which today keeps only text, action and a clipped name. Add process, window-title pattern, ControlType, Name, AutomationId (Helper.cs already reads it), the parent Name chain, sibling index, the rectangle relative to the window, a signature of which elements appeared after the step, and slots for personal values.
  - (b) Replay scoring: a weighted locator (AutomationId 0.40, Name 0.20, HelpText 0.15, ControlType 0.10, parent 0.10, sibling 0.05). SkillDroid's τ of 0.5 / 0.3 is a starting point to calibrate. Also require the best match to beat the second-best by a margin.
  - (c) A unique match goes through `act()`, so the highlight, the spoken explanation, the Jev action gate and the scam screen all still run. On a miss: first try alternate locators; then **one DeepSeek call scoped to that step** (current UIA list plus the cached explanation, no history); then the full agent, with the lesson as a hint.
  - (d) Budgets: 2 consecutive or 5 total escalations switch the task to the full agent. When a lesson's failure rate goes above 0.5, re-record it on its next run, and keep up to 3 versions.
  - (e) A lesson becomes replayable only after 2 matching successful runs, or 1 run the person confirmed.
- **Jev vs DeepSeek:** Jev routes to the lesson (item 5). It breaks ties when 2–5 candidates fall in the ambiguous score band. It answers the borderline state check ("does this screen show the state expected before step N?") on UIA text, with the gate starting at 0.9. DeepSeek does every repair and everything off-script. Jev never heals a step.
- **Saving:** SkillDroid made 49% fewer calls, with 23% of rounds needing none. A clean replay costs only Jev calls, about $0.001. Our estimate for a repeat photo email is $0.001–0.01. It saves nothing on first runs, and MobiMem shows that a low hit rate can make replay *worse*, which is what the budgets are for.
- **Risk → guard:** a relaxed threshold clicks a look-alike (a second Send or Reply button); an app update leaves the lesson stale; a slot gets the wrong value, such as the wrong recipient. Guard: the margin rule; **never replay Send** (it stays a `guide_user` step the person presses); **never auto-dismiss a dialog** (an unexpected window escalates to the brain and the scam screen); confirm cards are rebuilt from the current slot values; a sim look-alike-button scenario.

### 8. Jev region gating of the UIA list (after item 4; real apps only)
- **Build:** the C# helper returns top-level containers. One Jev call asks one noul question per region, "is this region relevant to the next step?", which cost $0.000024 for 8 questions [M]. Regions scoring 0.3 or more are sent in full and the rest as one line each. If any region scores in the uncertain 0.35–0.65 band, send everything. Scam banners and dialogs are always sent. Jev's state holds region names only: with the full list in its state, a call cost $0.00035 [M].
- **Saving:** FocusAgent pruned 53–61% of the tree and cut cost about 19% with a strong retriever.
- **Risk → guard:** weak retrievers lost 8–11 points in FocusAgent. Guard: run it in shadow first (section 5), and ship only if the brain's actual target falls in a pruned region in at most 1% of at least 500 steps.

### 9. Screenshot policy (low priority)
A/B a 960 px width (363 vs 643 tokens, saving about $0.0013 per task at Phala) on the sim suite and on a few high-DPI real screens at 125–150% scaling. Skip the image after steps whose effect UIA fully shows (typing into a known field, set_plan). Always send it on a new window title, when the scam check fires, or when the UIA list is poor. Jev can optionally answer "does the next step need a fresh look?", and a low-confidence answer sends the image. Guard: the x,y-click miss rate.

### Not now, with reasons
- **Jev as the step policy (V-Droid pattern):** an untrained judge scored 0%. Run it in shadow only, and only after 500+ labelled steps.
- **A pixel grounder or zoom-crop call on every click:** it adds cost, and grounding is under 4% of the work. First log the x,y-only clicks and check each one with UIA `ElementFromPoint`. Add a crop-and-re-ask fallback only for that population, and only if its miss rate justifies it.
- **Swapping to a small native computer-use model:** it saves nothing (we are already at Fara's $0.025) and we would lose `guide_user`, the playbooks and the safety tooling.
- **Best-of-N rollouts:** impossible on a live desktop, because actions have real side effects.
- **Speculative actions:** they cut latency, not cost.
- **Quality insurance, not savings:** if items 5–7 raise failures, add a Jev stuck detector ("given the last 3 actions and results, is the helper making progress?"), batched into the same call as the action gate so it adds no extra call. It raises effort first and then calls a stronger zero-retention advisor for a plan of at most 500 tokens, capped at 2 per task. StepWise shows event-triggered checks beat periodic ones.

---

## 5. How we prove quality did not drop

**Suite.** Sim scenarios cover:
- all 28 playbooks;
- the safety scenarios (scam, scam-click, confirm cards);
- known past failures (remembered Gmail, make text smaller);
- *perturbation* variants for items 4–8: a moved or renamed button, a popup in the middle of a batch, autocomplete stealing focus, a second Send or Reply look-alike, a window with an empty UIA list (canvas), a changed contact name.

Add real-app traces (Gmail in Edge, Outlook) before any Jev threshold is trusted. Grading is automatic, by end-state rubric checks; there are no new rating sets for Erol.

**Metrics per run.** Pass^3 per scenario (all 3 runs pass), billed $ per *successful* task with Jev included, brain calls per task, cached share of input, x,y-click rate, escalation and replay-miss rates, and safety events (a confirm card shown before every send; the scam screen firing).

**Gates, one change at a time, old vs new on the same scenarios:**
1. **Safety is absolute.** Every safety scenario passes 3 of 3. Unit tests assert the invariants:
   - Send, confirm, payment, password fields and `run_command` are never replayed, never batched and never decided by Jev alone.
   - The scam screen runs on replayed and batched steps.
   - Unexpected dialogs escalate and are never auto-dismissed.
2. **No quality loss, judged per scenario.** 84 trials (28 × 3) at about 90% pass have a ±6.4-point confidence interval, and a two-arm difference needs about 9 points to show, so pooled rates hide regressions. Rule:
   - No scenario that was 3/3 drops below 2/3. Re-run any drop 5 more times before judging.
   - Total passes new ≥ old − 2.
   - Read every failing transcript before calling the gate passed.
3. **Cost.** Cost per successful task goes down, and the cached share rises as expected for items 1–2.

**Shadow mode for every Jev-decided part and for replay.** In the sim, compute the cheap path's decision (lesson route, tie-break, state check, region prune, replay element) next to the brain's without executing it, and log whether they agree. Calibrate each threshold λ per decision type with the [Trust or Escalate](https://arxiv.org/html/2407.18370v1) procedure:
- Use at least 500 labelled cases and δ = 0.1.
- α ≤ 2% for reversible actions; irreversible actions are never automatic.
- Recalibrate whenever the Jev model, the brain model, the provider or the playbooks change. Thresholds do not transfer (RouteLLM README, Argus).

Specific gates:
- Replay: the element it would have clicked equals the brain's element in at least 98% of accepted steps.
- Region gating: the brain's target falls in a pruned region in at most 1% of steps.
- Lesson routing: the wrong-lesson rate is at most α at the chosen λ.

**Rollout.**
- Each change goes behind a feature flag that is off by default. The order is: sim gates, then shadow gates, then the real-hardware smoke test (the real-input test still pending), then enabling per user.
- In production, watch cost per successful task, escalation rate, replay failure rate (above 0.5 triggers a re-record), and the person's stop or undo events.
- The flag is the kill switch.
- Sample transcripts weekly ([Anthropic evals guide](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)).

---

## 6. Sources

**Local evidence** [M]:
- `G:\seniorhelper\sim-runs\anne-marie\report.md`, `events.jsonl` and `sim-runs\summary.jsonl`.
- In `app\src\`: `agent.js` (taskPrompt :67, the old-observation summary :510, the tool loop ~554–578, `_effort` :591–611, `_observe` :614–687 with element cap 250 and width 1280), `config.js:14` (provider order), `tools.js:170` (`record()`), `jev.js`, `lessons.js`, `playbooks.json`.
- Probe scripts: `G:\seniorhelper\research\08_probes\` (cachetest.js, prefix.js, imgtok.py, eltok.py, jevcost.js, jevprune.js).

**Pricing and caching**
- https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints
- https://openrouter.ai/api/v1/endpoints/zdr
- https://openrouter.ai/deepseek/deepseek-v4.1-flash/providers
- https://openrouter.ai/api/v1/models
- https://openrouter.ai/api/v1/models/bytedance/ui-tars-1.5-7b/endpoints
- https://openrouter.ai/docs/guides/best-practices/prompt-caching
- https://docs.openclaw.ai/reference/prompt-caching
- https://api-docs.deepseek.com/guides/kv_cache
- https://github.com/anthropics/claude-quickstarts/blob/main/computer-use-demo/computer_use_demo/loop.py
- https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus

**Observation size and vision tokens**
- https://www.skyvern.com/blog/html-vs-json-llm-tokens-cost-reduction-success-rate/
- https://arxiv.org/html/2510.03204
- https://iyatomilab.github.io/a11y-compressor/
- https://arxiv.org/html/2404.07972 and https://arxiv.org/html/2404.07972v2
- https://api-docs.deepseek.com/guides/vision/
- https://platform.claude.com/docs/en/build-with-claude/vision
- https://developers.openai.com/api/docs/guides/images-vision
- https://ai.google.dev/gemini-api/docs/media-resolution
- https://github.com/QwenLM/Qwen3-VL

**Fewer calls and batching**
- https://arxiv.org/html/2504.14603, https://arxiv.org/html/2504.14603v1 and https://arxiv.org/html/2504.14603v2
- https://microsoft.github.io/UFO/ufo2/overview/
- https://arxiv.org/html/2510.02250
- https://github.com/simular-ai/Agent-S
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
- https://developers.openai.com/api/docs/guides/tools-computer-use
- https://arxiv.org/abs/2510.04371

**Replay and caching of runs**
- https://arxiv.org/abs/2604.14872 and https://arxiv.org/html/2604.14872
- https://arxiv.org/abs/2412.18116 and https://arxiv.org/html/2412.18116
- https://www.skyvern.com/blog/asking-ai-to-build-scrapers-should-be-easy-right/
- https://www.skyvern.com/docs/developers/features/code-caching
- https://www.skyvern.com/docs/developers/optimization/cost-control
- https://www.skyvern.com/products
- https://docs.browser-use.com/cloud/agent/cache-script
- https://github.com/browser-use/workflow-use
- https://arxiv.org/pdf/2512.15784
- https://arxiv.org/abs/2602.20502
- https://arxiv.org/html/2609.02309
- https://arxiv.org/html/2604.09718 (cost figures are the author's estimates)
- https://github.com/pig-dot-dev/muscle-mem
- https://github.com/pig-dot-dev/muscle-mem/blob/main/examples/cua.py
- http://erikdunteman.com/blog/muscle-mem/
- https://arxiv.org/html/2510.14308v1
- https://arxiv.org/html/2505.17716v1
- https://arxiv.org/abs/2409.07429 and https://arxiv.org/html/2409.07429v1
- https://arxiv.org/abs/2504.07079
- https://arxiv.org/html/2503.02268v1
- https://arxiv.org/abs/2506.14852
- https://docs.stagehand.dev/v3/best-practices/caching
- https://docs.stagehand.dev/v4/best-practices/caching
- https://docs.stagehand.dev/v3/basics/act
- https://www.browserbase.com/blog/stagehand-v3
- https://github.com/browserbase/stagehand
- https://deepwiki.com/browserbase/stagehand/6-dom-and-accessibility-processing
- https://docs.uipath.com/agents/automation-cloud/latest/user-guide-ha/what-is-healing-agent
- https://docs.uipath.com/agents/automation-cloud/latest/user-guide-ha/frequently-asked-questions

**Cascades, routing and thinking**
- https://arxiv.org/html/2604.27151v1 and https://arxiv.org/pdf/2604.27151
- https://arxiv.org/pdf/2603.12823
- https://arxiv.org/html/2503.15937v2
- https://arxiv.org/html/2407.18370v1 and https://arxiv.org/abs/2407.18370
- https://www.lmsys.org/blog/2024-07-01-routellm/
- https://github.com/lm-sys/routellm
- https://arxiv.org/abs/2305.05176 and https://ar5iv.labs.arxiv.org/html/2305.05176
- https://arxiv.org/abs/2606.25760
- https://claude.com/blog/the-advisor-strategy
- https://arxiv.org/abs/2601.22132
- https://arxiv.org/html/2603.07915v1
- https://arxiv.org/abs/2606.23181
- https://arxiv.org/abs/2602.12662

**Grounding and small computer-use models**
- https://arxiv.org/html/2505.13227
- https://arxiv.org/html/2507.05791v1
- https://arxiv.org/html/2511.07332
- https://arxiv.org/html/2504.00906
- https://arxiv.org/html/2506.16042
- https://arxiv.org/html/2506.02865v1
- https://hcompany.ai/holo2
- https://huggingface.co/Hcompany/Holo1.5-7B
- https://github.com/bytedance/UI-TARS
- https://arxiv.org/html/2410.05243
- https://arxiv.org/html/2504.07981v1
- https://microsoft.github.io/Phi-Ground/
- https://arxiv.org/html/2409.08264
- https://arxiv.org/html/2609.00524v1
- https://arxiv.org/html/2506.03143
- https://www.microsoft.com/en-us/research/blog/fara-7b-an-efficient-agentic-model-for-computer-use/
- https://arxiv.org/abs/2511.19663

**Evaluation**
- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- https://arxiv.org/pdf/2604.06240
- https://browser-use.com/posts/what-model-to-use
- https://browser-use.com/benchmarks/agents
- https://microsoft.github.io/WindowsAgentArena/
