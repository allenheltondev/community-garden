 ---
inclusion: manual
---

# Development Roadmap – Community Food Coordination Platform

This roadmap defines the phased delivery plan for the platform. Each phase has clear goals, deliverables, and exit criteria.

## Phase 0: Foundations

**Goal**: A deployable skeleton with auth and observability.

**Deliverables**:
* Repo scaffold, CI, and environment configuration
* PWA shell hosted on S3/CloudFront
* Cognito sign-in and JWT wiring
* Rust API monolambda deployed behind HTTP API
* DynamoDB tables created
* EventBridge bus and baseline event envelope
* End-to-end request correlation ID plumbing

**Exit Criteria**:
* A user can sign in, hit a health endpoint, and load the PWA on a phone

---

## Phase 1: Grower-first MVP

**Goal**: Growers can declare availability with minimal friction.

**Deliverables**:
* Grower profile
* Create and update listings with time window and location context
* Grower's "my listings" view
* Basic discovery view for the same user to verify postings locally
* Events emitted on writes

**Exit Criteria**:
* A grower can post availability from a phone in under a minute

---

## Phase 2: Searcher Basics

**Goal**: Searchers can discover availability and submit requests.

**Deliverables**:
* Search endpoints by geo context
* Create and update requests
* Basic coordination state machine for commitments

**Exit Criteria**:
* A searcher can find an item and request it, and a grower can see the request

---

## Phase 3: Derived Views and Insights

**Goal**: Reduce friction via aggregation and summaries.

**Deliverables**:
* Aggregation workers producing rolling-window supply signals per geo context
* Derived feed endpoint returning listings plus high-level context
* First imbalance signal generation without AI

**Exit Criteria**:
* The UI can show "what's abundant vs scarce" using derived data

---

## Phase 4: AI-Assisted Guidance

**Goal**: Add explainable AI where it improves comprehension.

**Deliverables**:
* Bedrock-backed summarization and explanations cached in derived table
* Grower guidance based on seasonality and aggregated community trends
* Clear UI labeling and opt-out controls

**Exit Criteria**:
* AI outputs are optional, explainable, and do not affect transactional workflows

---

## Phase 5: Reliability and Scaling Hardening

**Goal**: Make the product safe to run continuously.

**Deliverables**:
* Idempotency coverage for APIs and workers
* Backfill and replay tooling for derived pipelines
* Operational dashboards for pipeline lag and data freshness
* Performance tuning and cost controls

**Exit Criteria**:
* The system tolerates retries, replays, and partial failures without corrupting state
