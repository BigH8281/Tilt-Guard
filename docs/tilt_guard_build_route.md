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
- Trading integration must assume Tradovate Web in the browser
- TradingView should be assumed browser-based for core workflows
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
- Browser extension for Tradovate Web integration
- Extension streams trade/account/order events to backend
- Backend becomes the source of truth for captured behaviour

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

### Phase 2 — Tradovate Extension Telemetry
Goal:
- capture trade behaviour automatically from Tradovate Web

Includes:
- browser extension
- Tradovate tab/session detection
- event capture
- event streaming to backend
- linking captured trade events to live journal sessions
- automatic trade timeline population

Priority:
- reliability over cleverness
- observation before enforcement

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
What Tradovate data shows actually happened

### Layer 3 — Rules truth
What the system determines was compliant or non-compliant

### Layer 4 — Interpretation truth
What the system infers about tilt, emotional state, or discipline breakdown

These layers must not be confused.

Interpretation must not overrule verified broker facts.

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

---

## 9) Current Position

Tilt-Guard is currently at the start of **Phase 1 — Hosted Journal MVP**.

Immediate objective:
- take the existing journal that works locally
- make it available online
- make it stable and accessible from anywhere
- preserve manual trade recording as fallback for now

Immediate success condition:
- the user can run the journal fully in a browser from work, home, tablet, or phone

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
