# Tilt-Guard Product And Architecture Learning Log

## Purpose

This document preserves product, UX, and technical lessons that should continue shaping Tilt-Guard even when the original investigation threads are no longer in view.

Use it as a companion to:
- [docs/tilt_guard_build_route.md](/home/higgo/code/Tilt-Guard/docs/tilt_guard_build_route.md)
- [status.md](/home/higgo/code/Tilt-Guard/status.md)
- [README.md](/home/higgo/code/Tilt-Guard/README.md)

This file is not a changelog.
It is a durable memory for:
- what we learned from reviewing other products
- what we deliberately copied as patterns
- what we deliberately avoided
- what our own live debugging taught us about the current architecture

---

## 1) Lessons From The Drop-Trades / TradeGuard Review

The investigation into the Drop-Trades / TradeGuard product gave us useful product and architecture patterns without requiring us to copy any proprietary implementation.

### Product patterns worth keeping in mind

- The setup must feel simple:
  - user signs into the web app
  - extension connects with minimal friction
  - extension then "just works"
- The dashboard should show backend-owned connection truth, not vague browser guesses.
- Users trust visible connection state:
  - connected
  - live
  - stale
  - degraded
  - disconnected
- Monitoring reliability matters before enforcement ideas matter.
- A browser-first product can still feel disciplined and operationally serious if the extension/session model is clear.

### Technical patterns we wanted to learn from

- Separate app authentication from broker/platform/browser-session observation.
- Treat the extension as a lightweight client that:
  - observes page/session state
  - maintains local durable state
  - sends telemetry and heartbeats to backend
- Treat the backend as the owner of session truth for:
  - connection state
  - monitoring freshness
  - dashboard status
  - historical activity feed
- Prefer a connect/status/heartbeat/disconnect model over ad hoc polling alone.
- Use an adapter model so the platform surface can be handled first and broker specialization can follow later.

### Patterns we explicitly did not want to copy blindly

- Weak auth handoffs through broad wildcard page messaging.
- Sloppy token handling in page storage when safer extension messaging is possible.
- Overclaiming enforcement or broker truth before telemetry is reliable.
- Letting system activity flood the user journal.

---

## 2) Tilt-Guard Decisions That Came From Those Lessons

The following choices in Tilt-Guard are intentional and should be preserved unless there is a clear reason to replace them.

### TradingView-first route

- Tilt-Guard is currently built around TradingView-first browser workflows.
- Broker specialization should sit under that platform-first layer, not replace it.
- Current adapter path:
  - `tradingview_base`
  - `tradingview_fxcm`
  - `tradingview_tradovate`

### Web app plus extension split

- The web app owns:
  - login
  - rules setup later
  - dashboard
  - journal
  - extension connect page
- The extension owns:
  - browser/session observation
  - TradingView tab detection
  - adapter selection
  - local state
  - telemetry queueing
  - heartbeat/reconnect behavior
- The backend owns:
  - extension sessions
  - monitoring truth
  - event ingest
  - dashboard/session state reads

### Product direction reinforced

- Browser-first stays the controlling route.
- Hosted-first stays the operational route.
- Telemetry-before-enforcement stays the build rule.
- Manual trade entry remains fallback until observed telemetry is trustworthy enough to become authoritative.

---

## 3) Lessons From Our Own Tilt-Guard Extension Work

The current implementation work added a few important practical lessons that should not be forgotten.

### 3.1 A lightweight extension can still be a serious product surface

The extension does not need to become a second app.
It only needs to do a small set of things reliably:
- authenticate/connect cleanly
- detect TradingView presence
- detect broker/profile where possible
- observe live chart/session state
- send telemetry and heartbeats
- show honest status in the popup

### 3.2 Explicit session states matter

We now know it is worth keeping explicit states such as:
- `signed_out`
- `app_authenticated`
- `tradingview_not_detected`
- `tradingview_detected`
- `adapter_unmatched`
- `broker_detected`
- `monitoring_active`
- `monitoring_stale`
- `error`

Do not collapse these back into a vague single "connected" flag.

### 3.3 Live, stale, disconnected, and offline are different states

We learned the UI gets confusing very quickly if these are mixed together.

Use them deliberately:
- `live`: observation is fresh
- `stale`: extension/session still exists, but fresh observation has degraded
- `disconnected`: extension session or connect state is lost
- `offline`: app/extension/backend is genuinely unavailable

Do not show `offline` when the real state is only stale or degraded.

### 3.4 Symbol state must have one source of truth

The latest detected symbol should be treated as shared session metadata for UI surfaces such as:
- live context card
- session box/header
- minimised strip
- popup/debug state

It should not become ordinary journal clutter.

### 3.5 System activity must stay separate from the main journal

The journal is for:
- user journal entries
- explicit workflow prompts
- approved session workflow content

It is not the place for a noisy platform/system feed.

System and telemetry activity should live in a separate activity feed.

### 3.6 Chart-visible confirmation is the practical primary truth surface

Recent live work clarified an important product rule:

- the visible TradingView chart confirmation surface is the primary confirmation path when it is genuinely readable
- chart-visible execution toasts/overlays and chart-position support state matter more than the `Positions` tab for real use
- the `Positions` tab is still useful as support/fallback evidence, but should not be the default confirmation dependency

This matters because:
- traders usually keep the chart visible
- the chart is the surface the trader is actually watching
- the `Positions` tab is not reliably open in normal use

### 3.7 Observed-first factual truth is now the intended journal rule

Tilt-Guard has now crossed an important boundary:

- confirmed observed trade facts can persist as real `trade_events`
- confirmed observed trades can attach to the live journal session even across symbol changes
- confirmed observed trade facts can override conflicting manual factual input when the evidence is strong enough
- manual input still matters for narrative, rationale, psychology, and fallback truth

Do not regress back to:
- manual factual fields quietly overriding strong confirmed observed facts
- keeping confirmed different-symbol trades out of the journal during the same live session
- surfacing provenance/reconciliation mechanics in the main journal

### 3.8 Reflection parity matters for trust

When Tilt-Guard records a confirmed trade automatically, the user should still be guided into the same reflective flow used for manual trade entries.

That keeps the product honest:
- TG captures factual trade truth
- the trader still supplies the why/context
- downstream analysis can compare reflection against confirmed behaviour

---

## 4) Live Debugging Lessons From TradingView

The real browser-debugging pass taught us things that matter for future telemetry work.

### 4.1 Mutation storms can starve naive observers

TradingView can generate constant DOM churn from prices, watchlists, and UI updates.

A naive observer that:
- watches too much of the page
- resets a debounce timer on every mutation
- only flushes after the page "goes quiet"

can stall almost indefinitely while the page is actually live.

This caused real bugs in Tilt-Guard:
- symbol changes not reaching backend/UI
- telemetry becoming stale too easily
- visible charts being shown as degraded because fresh snapshots were not being emitted

### 4.2 Heartbeat-driven refresh is necessary

Do not rely only on narrow mutation triggers.

Periodic snapshot refresh while an active TradingView chart is visible is a valid and necessary monitoring mechanism.

Trigger fresh observation on:
- symbol change
- title change
- URL change
- focus/visibility return
- important trading panel state changes
- timed heartbeat refresh while the chart is active

### 4.3 Refreshing TradingView is not a neutral action

Reloading a TradingView tab can:
- trigger "some changes will not be saved"
- restore a previously saved chart state
- revert the symbol after refresh

That means reload is not a safe normal monitoring strategy.
Tilt-Guard should prefer in-page observation continuity over page refresh recovery.

### 4.4 Frontend polling cadence affects perceived trust

Even when backend and extension are working, a slow polling interval can make the product feel stale or unreliable.

Perceived responsiveness is part of monitoring trust.

---

## 5) Working Architectural Rules For Future Development

When building future Tilt-Guard telemetry or broker support, keep these rules in mind.

### Copy these patterns

- simple web login plus easy extension connection
- explicit backend-owned extension session lifecycle
- adapter-based broker/platform layering
- honest freshness/status UI
- observational reliability before enforcement
- lightweight extension with durable state and queue/retry logic

### Avoid these patterns

- brittle DOM-only assumptions when a broader observation strategy is possible
- page reload as a normal state-recovery mechanism
- mixing telemetry/system noise into the journal
- overpromising broker truth before it is proven
- implementing enforcement before the observation model is stable

---

## 6) Concrete Future Opportunities To Revisit

These are legitimate future options, but not current obligations.

- strengthen broker-specific adapters under the TradingView-first base
- improve higher-confidence trade-entry detection
- add richer backend observability for extension health and telemetry latency
- add safer extension/app auth sync hardening as distribution broadens
- move from unpacked-folder distribution toward a more formal release path later
- harden rapid same-symbol delta/re-entry interpretation without broadening into rules or enforcement
- explore soft warnings/interruption UX only after telemetry confidence is materially better
- explore hard enforcement only after broker truth and rules truth are proven

---

## 7) Retrieval Rule

Before starting any major work in these areas, revisit this document:
- extension architecture
- TradingView monitoring
- broker adapters
- dashboard live-state UX
- telemetry freshness/reliability
- rules or enforcement planning

If a future idea conflicts with the lessons recorded here, stop and compare it against:
- [docs/tilt_guard_build_route.md](/home/higgo/code/Tilt-Guard/docs/tilt_guard_build_route.md)
- [status.md](/home/higgo/code/Tilt-Guard/status.md)

The goal is to preserve learned judgment, not just preserved code.
