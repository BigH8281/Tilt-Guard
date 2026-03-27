# Tilt-Guard Build Route

## Purpose

This document is the controlling product route for Tilt-Guard.

It exists to keep development aligned with the actual product goal, real-world user constraints, and agreed phase order.

If a proposed feature, refactor, integration, or architecture choice conflicts with this document, this document takes priority unless explicitly overridden by the Product Owner.

---

## 1) Product Aim

Tilt-Guard is a browser-first trading discipline platform.

Its purpose is to help the trader:
- journal consistently
- capture trading behaviour accurately
- measure behaviour against rules
- identify tilt and discipline breakdown
- later intervene when behaviour deteriorates

Tilt-Guard is **not** just a journal.
Tilt-Guard is **not** just an AI coach.
Tilt-Guard is a structured trading discipline system built in layers.

---

## 2) Core User Constraint

The primary user trades during working hours on a work PC and uses the browser as the main trading environment.

This creates the following hard constraints:

- Core product access must work in a browser
- Core product must be accessible from anywhere
- Core product must not depend on installing Electron or desktop apps
- Trading integration must assume browser-based charting and broker workflows
- Current extension implementation is TradingView-first
- Broker-specific expansion later must preserve the browser-first constraint
- Mobile and tablet access should remain possible

Because of this, Tilt-Guard must be built **web-first**, not desktop-first.

---

## 3) Core Architecture Direction

Tilt-Guard must follow this architecture direction:

### Main application
- React web frontend
- FastAPI backend
- Postgres database
- Hosted deployment
- Browser-accessible authentication
- Hosted screenshot/file storage

### Trading integration
- Browser extension for browser-based trading/chart telemetry
- Current telemetry slice is TradingView-first
- Extension/web/backend split should preserve a simple "sign in once, connect extension, then it just works" experience
- Extension streams trade/account/order/session events to backend
- Backend becomes the source of truth for captured behaviour
- Broker/platform specialization should sit under a TradingView-first adapter layer rather than scattering broker logic everywhere

### Intelligence layer
- Backend rules engine
- Hosted model analysis for journal text later
- Visual/screenshot analysis later
- No dependency on local LLMs for core product behaviour

### Optional later layer
- Electron may exist later as an optional wrapper or power-user client
- Electron must never be treated as required for core product use

---

## 4) Product Development Principle

Build in this order:

**Available first. Accurate second. Authoritative third. Intelligent fourth.**

Interpretation:
- First make the product usable anywhere
- Then make the captured data reliable
- Then make the system capable of judging rule compliance
- Then make the system capable of deeper tilt analysis

Do not invert this order.

---

## 5) Fixed Phase Order

Development must follow this phase order unless explicitly changed by the Product Owner.

### Phase 1 — Hosted Journal MVP
Goal:
- make the current journal available online and usable from anywhere

Includes:
- auth/login
- session creation
- guided journal flow
- screenshot upload
- session timeline
- session history
- manual trade entry fallback
- stable persistence

Does **not** include:
- broker automation
- hard rule enforcement
- live video analysis
- local model installation
- Electron dependency

### Phase 2 — Browser Extension Telemetry
Goal:
- capture trade behaviour automatically from browser-based trading surfaces

Includes:
- browser extension
- hosted auth/connect flow for the extension
- browser tab/session detection
- event capture
- event streaming to backend
- extension session lifecycle and backend heartbeat
- broker adapter/profile matching
- backend system feed for extension-observed state changes
- linking captured trade events to live journal sessions
- automatic trade timeline population
- chart-first confirmation from visible TradingView chart surfaces where the browser surface genuinely supports it
- confirmed observed trade persistence into the journal with shared reflection flow
- session-wide confirmed trade attachment even across symbol changes
- keeping provenance, mismatch context, and reconciliation detail out of the main journal

Priority:
- reliability over cleverness
- observation before enforcement
- resilient monitoring over brittle DOM-only triggers

Current working rule inside Phase 2:
- primary confirmation source is the visible on-chart TradingView confirmation surface
- `Positions` and other broker/account surfaces are supporting evidence only
- manual trade entry remains fallback where confirmation is incomplete or ambiguous

### Phase 3 — Rules Engine v1
Goal:
- measure broker-verified behaviour against objective rules

Includes:
- time rules
- trade count rules
- max attempts
- contract size rules
- cooldown rules
- daily stop conditions
- breach logging
- session rule-status display

### Phase 4 — Soft Tilt Protection
Goal:
- intervene without yet taking hard control

Includes:
- warnings
- banners
- prompts
- escalation notices
- interruption UX
- lock-state messaging

### Phase 5 — Hard Enforcement
Goal:
- actively stop or restrict trading when defined thresholds are crossed

Includes:
- block order flow
- cancel working orders
- flatten positions
- lockout actions

Condition:
- only after telemetry and rule detection are proven reliable

### Phase 6 — Language-Based Tilt Analysis
Goal:
- assess journal language for emotional deterioration

Includes:
- journal text analysis
- contradiction detection
- emotional escalation scoring
- linking language with broker behaviour

Important:
- language analysis must be grounded against actual trade behaviour where possible

### Phase 7 — Visual Intelligence Layer
Goal:
- add screenshots or sampled visual context later

Includes:
- screenshot review
- selected frame analysis
- event-linked visual context

Does **not** currently mean:
- full continuous live video reasoning
- always-on live LLM screen watching as a core dependency

---

## 6) Non-Goals For Now

The following are explicitly not current build goals unless directly instructed:

- building Electron as the main application route
- requiring local LLM installation
- building around desktop-only workflows
- full live video streaming to an LLM
- hard enforcement before telemetry is reliable
- advanced psychological modelling before broker truth exists
- replacing verified broker data with user memory or manual inference
- “smart” AI features that are not grounded in stable product inputs

---

## 7) Source of Truth Rules

Tilt-Guard should evolve through these truth layers:

### Layer 1 — Journal truth
What the trader says they thought, planned, and felt

### Layer 2 — Broker truth
What browser-captured broker/platform telemetry shows actually happened

### Layer 3 — Rules truth
What the system determines was compliant or non-compliant

### Layer 4 — Interpretation truth
What the system infers about tilt, emotional state, or discipline breakdown

These layers must not be confused.

Interpretation must not overrule verified broker facts.

For the current Tilt-Guard implementation:
- confirmed observed browser/platform facts are the practical factual source of truth for trade fields
- manual input remains the source of truth for reflection, rationale, psychology, and fallback gaps
- provenance and reconciliation detail belong in `System Status`, not the main journal

---

## 8) Build Discipline Rules

All contributors, including AI coding agents, must follow these rules:

1. Do not jump phases without explicit instruction  
2. Do not introduce architecture that conflicts with browser-first delivery  
3. Do not make Electron a hidden dependency  
4. Do not build enforcement before reliable telemetry exists  
5. Do not treat manual trade entry as the long-term source of truth  
6. Do not add AI interpretation features before the underlying product inputs are stable  
7. Prefer simple, stable, reversible changes over clever architecture  
8. When in doubt, preserve the agreed phase order  
9. If a proposed change conflicts with this build route, stop and prefer this document  
10. Ask: “Does this help the current phase, or is it leaking into a later phase?”

Additional rules from the current extension work:
11. Keep system/platform activity separate from the trader's main journal content
12. Do not label stale/degraded monitoring as offline unless connectivity is actually gone
13. Keep live session metadata such as the current symbol in shared live-state UI, not as journal clutter
14. Do not rely on TradingView page refresh as a normal monitoring strategy

---

## 9) Current Position

Tilt-Guard is currently in **late Phase 1 / active Phase 2 foundation work**.

What is now true in the repo:
- the hosted journal MVP exists with auth, sessions, screenshots, history, and manual trade fallback
- the backend is deployed on Railway and serves a hosted `/extension/connect` page
- a single unpacked browser extension now exists with `Hosted` / `Local` switching
- the extension can authenticate against the hosted backend, maintain extension session state, and ingest broker telemetry
- backend APIs now include extension session lifecycle and broker telemetry feed endpoints
- current extension hardening has already taught us important real-world lessons about stale state, symbol propagation, and observer starvation under TradingView mutation storms

What is not yet true:
- broker telemetry is not yet proven as the final authoritative trade history source
- rules truth, enforcement, and AI interpretation are not implemented
- telemetry coverage is TradingView-first, not a finished multi-broker/browser integration layer

Immediate objective:
- stabilize the hosted extension telemetry slice
- validate the hosted extension rollout and connection UX for real remote users
- improve telemetry reliability and broker/profile coverage before any rules-engine work
- preserve manual trade recording as the fallback until broker truth is genuinely trustworthy
- preserve and re-read the recorded product/architecture lessons before expanding into more broker-specific work

Immediate success condition:
- the user can run the journal in a browser from anywhere
- the user can load one extension, connect it to the hosted backend, and see reliable TradingView-first monitoring state
- the project can move into rules planning without needing to revisit the core hosted/browser-first delivery choice

---

## 10) Working Rule For AI Coding Agents

When executing coding tasks for this project:

- follow this file as the controlling roadmap
- complete the smallest useful step that supports the current phase
- avoid speculative future-phase implementation unless explicitly requested
- do not redesign the product around a different delivery model
- do not optimise for hypothetical users at the expense of the actual primary use case

If unsure, align to:
**browser-first, hosted-first, telemetry-before-enforcement, truth-before-intelligence**

---

## 11) Companion Project Control Files

This file should be used alongside:

- `status.md`  
  Current implementation status and what is done / in progress / next

- `docs/tilt_guard_product_learning_log.md`
  Retained product and technical lessons from the Drop-Trades / TradeGuard review and our own extension implementation/debugging work

- task-specific briefs  
  The exact development step being worked on now

This file defines the route.
`status.md` defines the current position on the route.
Task briefs define the next immediate move.

---

## 12) Guiding Summary

Tilt-Guard is being built in this order:

1. Make it available  
2. Make it accurate  
3. Make it authoritative  
4. Make it intelligent

Do not drift from this.
