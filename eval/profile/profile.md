# Alex Rivera — Profile

Senior Software Engineer & Tech Lead. 9+ years building full-stack systems.
Quito, Ecuador (UTC-5). alex.rivera@example.com · alexrivera.example · github.com/alexrivera

## Taking over and extending existing codebases

Most of my work has been inheriting running systems rather than starting them. At Upwork I
took over marketplace surfaces already serving 800K monthly active users and extended them;
at Intuit I joined an existing data curation platform and grew it. My method is consistent:
read the tests first to learn the intended behaviour, map the boundaries that already exist
before adding any, and land the first change small enough to prove the feedback loop works
before touching anything structural.

The most recent instance is TurboTime, where in August 2026 I joined two live client
codebases at once — a ~2,000-commit Django/Next.js permit-management platform and a
~1,400-commit medical-operations monorepo — and was shipping merged feature work in both
within days. I now also run the release train on the permit platform: reconciling
`release/next` → `staging` → `main`, repairing squash-merge ancestry when the three diverge,
and resolving the conflicts that come with several engineers landing on one trunk.

The largest example is the Upwork migration from a legacy PHP monolith to GraphQL
microservices. That was strangler-pattern work against live traffic — moving one surface at a
time behind the existing API, keeping both paths alive until the new one was proven, and
measuring the result rather than asserting it. It cut API response time by 35%.

## Python, FastAPI and Django

Python is one of my two primary languages, and it is what most of my current work is written
in. Django + Django REST Framework is the backend on both TurboTime projects: tugestión.com
(permits/trámites, peritos marketplace, quotations, subscription entitlements) and Atlas
(patient intake, insurance verification, claims, orders, inventory), both on PostgreSQL with
Redis and Celery. I also use Django with Graphene for GraphQL — Narbox is a Django Graphene
API behind a Next.js admin dashboard — and Django 6 + DRF on the Innova PBX provisioning
backend.

On the FastAPI side, `aiecommerce-agents` is FastAPI + LangGraph on Python 3.13 with
SQLAlchemy 2.0 async (`asyncpg`/`aiosqlite`), `pydantic-settings`, `uv`, `mypy` and `ruff`;
`ncp-aai` is FastAPI + SQLAlchemy + ChromaDB. So the async SQLAlchemy and Pydantic idioms I
previously listed as gaps are now things I have actually written — in my own projects, not yet
under production load. Alembic I still have not owned; see the gaps section.

## React, Next.js and TypeScript

React and TypeScript are my strongest frontend stack, used across Intuit, Jobsity client work,
my own projects, and both TurboTime codebases. Current production versions in my hands:
Next.js 15 (tugestión.com, Atlas, Narbox, Comfort Care therapist portal), Next.js 16 + React
19 + Tailwind CSS v4 + shadcn/ui (Innova PBX PIM frontend), React 19 with Vite (desktop and
study apps). I led TypeScript adoption across multiple codebases at Jobsity, including
designing the system architecture for the migration rather than only converting files.

## Vue, Nuxt and large-scale frontend

Four years at Upwork on Vue.js/Nuxt marketplace applications — talent discovery, job details,
profile verification and navigation flows, serving 800K monthly active users. Work included
search UX under high traffic: query highlighting, spacing preservation, HTML-based suggestion
rendering protection, and rendering reliability.

## GraphQL and REST API integration

GraphQL on both sides — server and client. At Intuit I integrated internal systems and
external providers through GraphQL, consolidating four separate APIs into one interface and
cutting data retrieval time. At Upwork I architected the migration of a legacy PHP monolith to
GraphQL microservices. Narbox uses Django Graphene on the server with Apollo on the client,
where I have most recently added date-range filtering on consolidations, a pricing API, and
validated extra-attribute modelling.

Third-party REST integration is routine: MercadoLibre marketplace publishing in AIEcommerce,
Hotmart course enrolment with per-perito coupons and Brevo transactional email on the
TurboTime platform, Brightree ETL in the Comfort Care monorepo, and OpenRouter/Ollama/OpenAI
endpoints across my AI work.

## AI and LLM integration in production

I build production AI systems, not demos. AIEcommerce is a multi-agent orchestration system in
LangGraph that autonomously scrapes hardware listings, validates component compatibility and
publishes enriched listings to MercadoLibre — 100% automation of listing creation with zero
incompatible bundles shipped, plus self-healing inventory logic that re-selects compatible
alternatives when a component goes out of stock mid-assembly. It has since been split into
three services: a Django catalogue/API, a FastAPI + LangGraph orchestration layer, and a
MedusaJS storefront that consumes the catalogue through a synced external-catalog integration
with retry, quarantine and sync-health monitoring.

The TurboTime permit platform carries its own AI surface (internally "Mareana"): a
conversational permit-preview assistant on pgvector-backed RAG, Celery-queued enrichment, and
OpenAI Guardrails for moderation and PII protection in front of user input.

At Upwork I built AI-powered search and freelancer insight experiences, with the parts that
matter in production: fallback handling, experiment orchestration, facet/ontology updates, and
resilient error recovery when upstream insight requests fail.

Recent AI work of my own, in order of how much it taught me:

- **Innova Bot** — a governed customer-facing agent: coordinator/specialist fan-out, parallel
  investigation with isolated structured context, deterministic identity/privacy/refund gates,
  tool interception and typed error recovery, durable sessions with checkpoints and forks,
  golden-trace regression tests, and an SSE run-trace panel that makes the operational trace
  legible without exposing chain-of-thought. Spanish-first (`es-419`) with full English parity.
- **Fillix** — a Manifest V3 Chrome extension (Svelte, Vite, Tailwind v4) running entirely
  against a local Ollama model: streaming chat in the side panel, a model-driven tool-calling
  loop (Wikipedia, Hacker News, arbitrary URL fetch) with inspectable inline tool results, and
  cached per-story summarization. No remote inference, no telemetry.
- **NCP-AAI** — a local-first RAG study platform: FastAPI, SQLite, ChromaDB,
  `sentence-transformers` embeddings, ingestion from PDFs, docs, transcripts and web pages,
  deterministic offline retrieval, and generated study material with readiness tracking.

Providers and tooling: LangGraph, LangChain, RAG pipelines, OpenAI API, Gemini API, Anthropic
Claude API, OpenRouter, Ollama, pgvector, ChromaDB. AWS Certified AI Practitioner (October
2025).

## Agent orchestration for engineering workflow

This is the newest and most distinctive part of my work: using agents to run the parts of
software delivery that are usually manual, with the determinism kept outside the model.

**tu-gestion-bot** is a LangGraph hierarchy that walks a Linear board on a timer — it moves
Todo tickets into Planning, judges the resulting plans, reviews the pull requests, and merges
the approved ones. Three levels of graph (root → per-column → per-ticket), each column on its
own interval measured from its own last finish, so a half-hour code review no longer holds the
other columns at the gate. State lives in Postgres through `langgraph-checkpoint-postgres`; a
single shared Chromium instance is serialised behind a browser lock while the model work
overlaps.

The design rule is the part worth defending: every node is exactly one of three kinds — an
**action** (a script, a GitHub read, an email, a ledger row; no model), a **subagent** (one
model run against an OpenAI-compatible endpoint with a fixed prompt, a file-tool allowlist and
an MCP subset), or a **decision** (a pure function over plain dicts). Every invariant lives in
the decision module once — verdict-matches-report, mail-before-click, mail-before-ledger,
ledger-before-merge, the retry rule, and "a sign-in prompt stops the column." Adding a rule is
a pure function, a node, an edge, and a test that drives the real graph against fakes and
asserts the order the gates fire in. Plan judging and code review each fan out into a panel —
one seat per review axis or panel member — and adjudicate.

**personal-bot** is the other half: a black-box Playwright suite for the same product that
asserts only on what the browser shows and never touches the app's source, plus a bot that
sweeps a Linear column and writes user stories for every ticket that deserves one, using a
cheap model for the brief and a strong one to walk the UI and quote the copy actually on
screen.

**no-mistakes** is a local gate I built and now run on my own work: intent, rebase, review,
test, document, lint, push, PR, CI — machine-readable output, skippable stages, and a refusal
to push anything that has not passed.

## LLM cost discipline

My cost work has been architectural rather than billing-dashboard work: fallback handling and
resilient recovery when upstream requests fail, self-healing logic that avoids re-running
expensive steps, and routing cheap models to cheap stages — in the ticket bot, a small model
writes the brief and a strong one only does the work that needs it.

In my own projects I have now built the controls end to end: per-IP and per-user rate limits,
input/output token caps, per-request token-usage logging aggregated by user and model,
automatic downgrade to a cheaper model when the primary fails or cost spikes, and a circuit
breaker that pauses after N consecutive LLM failures and retries with backoff; plus a model
gateway with model selection, fallback, usage, latency and cost visibility in Innova Bot.
I have still not owned a formal LLM cost ceiling or a region-routing gateway under production
traffic — see the gaps section.

## Realtime systems: WebSockets, SSE and VoIP

PBXAI is a low-latency realtime system on Node.js, TypeScript, Fastify, Asterisk ARI and
WebSockets, bridging telephony to generative AI for bidirectional voice. Before that I
designed and built VoIP applications with Asterisk at Palosanto. At Upwork I built realtime
multi-device behaviour into marketplace surfaces, including conditional action workflows that
depend on ownership state and live profile verification status.

<!-- CHECK THIS: nothing on this machine backs the Fastify/Asterisk-ARI description of PBXAI.
     `pbxai-core` here is a self-hosted fork of an open Vapi/Retell alternative (FastAPI +
     Pipecat + Alembic) that I rebranded, wired for local dev and cost-analysed — 4 commits.
     Either point this paragraph at the repo that has the ARI code, or rewrite it to match. -->

SSE is no longer a gap: Innova Bot streams its run trace over SSE, and the AI content
assistant streams tokens to the browser over SSE from a Fastify backend. Both are my own
projects rather than production systems under load.

## Multi-tenant scoping, permissions and billing entitlements

Most of my TurboTime work lands here, and it has moved this from "not done" to "done, with
one part still missing."

On tugestión.com, a workspace owns folders (expedientes), each folder carries its own plan and
subscription, and access is scoped per member and per perito. I have shipped: folder access
control for peritos and scoped members, plan-flag and Pro-permission gating in the
subscriptions service, Basic-plan assignment guards, a consolidated Django admin view for
peritos with enrolment action permissions, and the bug fixes that come out of getting this
wrong — a plan held in one shared slot so that with several folders the lock and the badge
came from the wrong plan, and quotation flows that ignored the trámite already chosen. On
Atlas I implemented role-based access control across the superuser surface.

The billing is Stripe-backed, and my work sits on the entitlement side of it: which plan
unlocks what, what a downgrade or a deleted workspace must do to the things it was paying for,
and what the UI is allowed to promise. I have not built the payment rails themselves — see the
gaps section, which I have narrowed rather than deleted.

## PostgreSQL and data modelling

PostgreSQL across everything current: both TurboTime platforms, AIEcommerce, Narbox, AWS RDS,
and pgvector for RAG. Recent work that was more interesting than schema design: deduplicating
pre-existing case-duplicate users so a `lower(email)`/`lower(username)` unique constraint
could be added to a database that already violated it — including the Postgres
pending-trigger-events failure you get when the delete's FK cascade and the `AddConstraint`
DDL share one transaction — and concurrency tests around procedure-stage transitions. At
Palosanto I did data flow modelling and database schema design as a consulting deliverable for
external clients. Also DynamoDB (Comfort Care therapist portal), MongoDB, Redis,
ElasticSearch, Couchbase, SQLite and ChromaDB.

## Docker, CI/CD and cloud infrastructure

Everything I work on now runs in Docker Compose locally — the TurboTime platforms, the PBX
provisioning stack, the browser harness, my own services. AWS: Lambda, EC2, S3, CloudWatch,
RDS, and Terraform-managed infrastructure (VPC, security groups, EC2, RDS, ALB, Route53, S3)
across separate staging and production environments in `mx-central-1`, against an explicit
monthly budget target. Also Railway, Netlify and Amplify deployments, and CI/CD with GitHub
Actions — including a scheduled pipeline that generates my site's blog posts end to end.
AWS Certified Solutions Architect – Associate (September 2018). At Upwork I improved system
observability with CloudWatch and Datadog dashboards during the microservices migration, and
supported platform reliability through dependency updates and build/pipeline fixes across
shared surfaces.

## Testing and quality

I drove test modernization at Upwork: expanding unit, integration and Playwright E2E coverage,
leading the migration off legacy Cypress infrastructure, and documenting replacement testing
approaches so the change outlived me. At Intuit I performed code reviews and mentored on best
practices, with a measurable improvement in code quality and test coverage.

Current practice, which has gotten stricter: pytest with `--reuse-db` on Django backends,
Jest + `next/jest` and Playwright on the frontends, Vitest on TypeScript and Rust unit tests
on the desktop app. The black-box suite I maintain for the permit platform holds every spec to
order independence — it must pass alone, with its cycle, and twice in a row — backed by a
Postgres TEMPLATE captured after setup and restored between any spec file tagged `@mutates`,
with resets that refuse to run against anything but the local dev container. I also work
evidence-first on tickets: an implementation plan and a recorded evidence trail per ticket
before the code is considered done, and golden cases for the agent pipelines so a prompt change
that breaks a verdict shows up as a failing test. Tools: pytest, Jest, Cypress, Playwright,
Vitest, ruff, mypy, ESLint. I work TDD where the feedback loop supports it.

## Rust and desktop applications

New since mid-2025 and the reason I would not call Rust a gap any more: a local-first password
manager for Linux built with Tauri 2 — roughly 4.4k lines of Rust across a `vault-core` crate
and the Tauri command layer, with a React 19 frontend. Argon2id for key derivation,
ChaCha20-Poly1305 AEAD, a per-vault DEK under envelope encryption, `zeroize` so secrets are
wiped from memory on drop, atomic writes, and one encrypted file per entry so the vault syncs
through whatever the user already runs while the sync tool only ever sees ciphertext. The
listing API has no password field at all, so a listing cannot leak one even by accident. The
README states the threat model and what leaks anyway (entry count, modification times) rather
than claiming it does not.

## Telephony and PBX platforms

Beyond the realtime voice work: I built the Innova PBX provisioning platform end to end —
Django 6 + DRF + Celery + PostgreSQL + Redis behind a Next.js 16 / React 19 / Tailwind v4
frontend. Admins manage device catalogues, projects and licensing constraints; clients use a
guided wizard and a configuration assistant to populate extensions, device mappings,
credentials and call routing. It does ring groups, queues with uploaded music on hold,
follow-me rules, inbound DID mapping and blocks, fallback destinations, an IVR builder with a
flow diagram, a full audit trail, admin-override mode, and recoverable provisioning exports in
Sangoma, Yealink and Grandstream formats plus a printable bilingual implementation guide.

## Technical leadership, mentoring and hiring

Tech lead for cross-team initiatives at Upwork, partnering with Product, Design and Data
Analytics to define A/B testing strategies and iterate on search relevance using user behaviour
metrics. I have a record of mentoring engineers to senior-level promotions. I share work
through sprint ceremonies, architecture reviews and pair programming rather than keeping it in
my head. At Jobsity I collaborated directly with executive stakeholders to iterate on product
direction and UX, which is the part of leadership that is not code.

In the TurboTime squad the leadership shows up as direction on approach rather than title —
choosing outright deletion over quarantining bad rows in a destructive migration, writing the
roadmap, solution-decision and sign-off documents for the tickets the squad then implemented,
owning the release train across three long-lived branches, and building the review and merge
automation the squad's board runs on, with every verdict mailed out so the decisions stay
auditable.

## Data visualization and dashboards

Real-time data visualization dashboards with dynamic charting at Intuit, presenting large-scale
datasets to stakeholders across business units. Interactive D3.js visualizations, financial
analytics dashboards and marketing analytics platforms across client engagements at Jobsity.
More recently, operational dashboards on real GraphQL data in Narbox and funnel/event
instrumentation (PostHog) on the permit platform.

## Mobile

Cross-platform mobile apps with React Native at Jobsity. Also Ionic and Flutter.

<!-- CHECK THIS: confirm the notice period you actually want to state, and whether the
     TurboTime engagement is full-time or part-time, before sending this to anyone. -->

## Languages

Spanish is my native language — I am Ecuadorian and work in Spanish daily, including product
work where every user-facing string ships in es-MX, and bilingual es-419/en surfaces with
parity across the same workflows. English is professional working proficiency; all of my recent
engagements have been in English. I can work directly with a Spanish-speaking team without an
interpreter and without slowing anyone down.

## Employment history

**TurboTime** — Senior Full Stack Engineer, client squads. Aug 2026 – present. Django/DRF +
Next.js product work on two live client platforms (tugestión.com, a permit and trámite
management platform for Mexico; Atlas, an in-house medical operations platform), plus release
management and the agent automation the squad's delivery board runs on.

<!-- CHECK THIS: replace "Senior Full Stack Engineer, client squads" with your actual title
     and engagement type (employee / contractor) at TurboTime. -->

**Upwork** — Senior Frontend Developer, Marketplace Engineering (Search & Discovery).
May 2022 – May 2026.

**Intuit** — Senior Software Engineer, Data Curation Platform. Jun 2019 – Mar 2022.

**Jobsity** — Full Stack Developer (staff augmentation). May 2017 – Oct 2021. Delivered
full-stack applications across multiple client engagements using React, TypeScript, Node.js,
GraphQL, Python/Django, Laravel, Prisma and Docker.

**Palosanto Solutions / Freelance** — Software Developer & VoIP Engineer. May 2015 – May 2017.
Asterisk VoIP applications, web applications in PHP/AngularJS/EmberJS, and technology
consulting including data flow modelling and database schema design.

## Selected projects

**tugestión.com** (TurboTime client) — Permit and trámite management platform for Mexico
(CDMX first): rules-driven permit identification, peritos marketplace, quotations, per-folder
subscriptions and entitlements, staff-curated rules engine, AI permit-preview assistant.
Django + DRF, Next.js, PostgreSQL/pgvector, Redis, Celery, Terraform on AWS, Stripe, es-MX,
WCAG 2.1 AA.

**Atlas** (TurboTime client — Comfort Care Medical) — In-house operations platform for patient
intake, insurance verification, claims, orders, inventory and staff management.
Django + DRF, Next.js, PostgreSQL, Redis, Celery, Terraform (staging + production on AWS).

**tu-gestion-bot** — LangGraph orchestrator that runs a Linear delivery board: plans tickets,
judges plans and pull requests with review panels, merges what passes, and keeps every gate as
a pure decision function. LangGraph, Postgres checkpointing, MCP, Playwright/CDP, Docker.

**Innova Bot** — Governed customer-facing agent demo: coordinator/specialist fan-out, policy
gates, typed error recovery, durable resumable sessions, SSE run traces, es-419/en parity.

**Innova PBX / PIM** — PBX deployment and provisioning platform with guided configuration,
call routing, IVR builder, audit trail and multi-vendor provisioning exports.
Django 6 + DRF, Celery, PostgreSQL, Next.js 16, React 19, Tailwind v4, shadcn/ui.

**AIEcommerce** — Autonomous PC assembly and marketplace pipeline, now three services:
Django catalogue/API, FastAPI + LangGraph orchestration, MedusaJS storefront with synced
external catalog (retry, quarantine, sync-health monitoring). OpenAI/Gemini, PostgreSQL, Redis.

**Fillix** — Local-first MV3 Chrome extension: side-panel LLM chat on Ollama with a
tool-calling loop and cached summarization. Svelte, Vite, Tailwind v4, TypeScript, Vitest.

**personal-keys-handler** — Local-first password manager for Linux. Tauri 2, Rust
(Argon2id, ChaCha20-Poly1305, envelope-encrypted per-entry files), React 19.

**Narbox** — Package consolidation and global logistics platform.
Next.js, Django, GraphQL (Graphene + Apollo), PostgreSQL, Tailwind CSS.

**PBXAI** — Real-time voice AI orchestration engine.
Node.js, TypeScript, Fastify, Asterisk ARI, WebSockets.

**alexrivera.example** — Astro portfolio with an autonomous blog pipeline: OpenRouter deep
research grounded in search citations, repair-then-validate generation, and GitHub Actions
scheduling. Plus marketing sites in Astro for ATG and JGAC Tech (SEO, structured data,
Turnstile-verified sessions).

## Education and certifications

Escuela Politécnica Nacional — Engineer's Degree, Electronics. Quito, Ecuador, 2011–2015.

AWS Certified AI Practitioner (Oct 2025). AWS Certified Solutions Architect – Associate
(Sep 2018). Zend Certified PHP Engineer (May 2014). LPIC-2 Linux Professional (May 2012).
