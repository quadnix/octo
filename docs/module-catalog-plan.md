# Octo — Model Vocabulary & Module Catalog Expansion Plan

> Working document (2026-07-12, amended 2026-08-26). Plans two things: (1) splitting the
> overloaded `service` model into a richer — but still small and fixed — model vocabulary, and
> (2) the next waves of octo-aws-cdk modules. Then two platform features that ride on the catalog
> (out-of-the-box advanced debugging, AI log-expectation learning), and three shippable units that
> ride alongside it (the migration planner, capture, and guards on the terraform JSON Octo parses).
>
> Altitude: planning, not full design. Each wave gets a detailed design (schemas, anchors,
> actions, tests) when it is scheduled, following the anatomy of existing modules
> (`aws-ecs-alb-service` is the reference: module schema with anchor-constrained inputs,
> module-owned models/overlays/actions, snapshot tests).

## Why this catalog matters (the AI thesis)

Modules are the **tested building blocks of "how"**. Anything done in infra today is fair game
for Octo: if a team can set it up by hand, a module can set it up as a custom-made, reviewed,
reusable solution. When AI later operates on infrastructure, it does not invent Terraform — it
selects, composes, replaces, and parameterizes these blocks. The catalog is therefore the AI's
action space: every module added is a new verified move the AI can make. Breadth and
composability of this catalog is a direct investment in the AI product.

---

# Part I — Splitting the `service` model

## Problem

`Service` is documented as "third-party services hosted outside your infrastructure," but in
practice it is the catch-all: today's catalog puts DynamoDB (a database), ALB (a load balancer),
S3 storage, and S3 static websites all under `service`. This muddies the review surface ("added 1
service" says nothing), blocks decision-surface abstraction (a database exposes different knobs
than a load balancer), and weakens the vocabulary that the model graph's readability depends on.

## Proposal

Introduce new first-class model kinds as siblings of `Server`/`Service` (each an `AModel`
subclass with its own `NODE_NAME` and schema). Committed set:

| Model kind | Meaning | Absorbs / first modules |
| --- | --- | --- |
| `database` | Stateful query-addressed store | `aws-dynamodb-service` → `aws-dynamodb-database`, `aws-dynamodb-global-service` → global variant; later RDS/Aurora |
| `cache` | Volatile keyed store | ElastiCache Redis (Wave B) |
| `queue` | Message transport (queues, topics, streams) | SQS, SNS, MSK, Firehose (Wave A) |
| `loadbalancer` | Traffic entry/distribution | `aws-ecs-alb-service` → `aws-alb-loadbalancer` |
| `storage` | Object storage | `aws-s3-storage-service` → `aws-s3-storage`; static website stays a service-level variant or becomes `aws-s3-static-website-storage` — decide at design time |

Candidates, added only when their first module lands (keep the vocabulary small — every addition
must earn its place): `gateway` (KrakenD, API Gateway), `identity` (Keycloak, Cognito).
`filesystem` already exists and keeps meaning "mountable" (EFS) as distinct from `storage`
(object). `Service` remains — restored to its documented meaning: genuinely external third-party
managed services Octo does not provision.

## Mechanics & migration

- Each new kind: `packages/octo/src/models/<kind>/` (model + schema), same parent rules as
  `Service` (child of `app`), registered in the diff/serialization machinery like existing kinds.
- **Context strings change** (`service=my-db,app=x` → `database=my-db,app=x`): breaking for
  persisted state. Needs a one-shot migration over the committed `models.json`/`resources.json`,
  run before the first `generate` on the new vocabulary — design it alongside the split, not after.
- Module moves are renames + schema-import updates; actions/resources are untouched (resources
  never knew their model kind).
- Downstream: the FE graph parser is already forward-compatible with unknown node kinds (it
  falls back + warns); add theme colors/levels for the five new kinds. The review-surface
  summarizer gains precision for free ("added 1 database" vs "added 1 service").

---

# Part II — Module waves

Waves are dependency-ordered, not priority-ordered; items within a wave are independent. The
original request groups (2)–(6) map onto waves as noted. Per-module notes give: model kind,
resources provisioned, anchor relationships (consumed ◂ / produced ▸), and risks. All modules
follow the standard anatomy and ship with module tests against the existing
`aws-localstack-account` / `aws-moto-account` test harness where the service is supported, plus
snapshot tests.

## Wave A — Platform primitives (groups 2 & 6)

Small, self-contained, high leverage — most later modules consume these anchors.

| Module | Kind | Notes |
| --- | --- | --- |
| `aws-route53-dns` | new `dns` capability on region/app (decide: model kind vs overlay) | Hosted zones, record sets. ▸ `DnsZoneAnchor` consumed by https, loadbalancer, gateway modules. Decide early whether DNS is a model (visible node) or an overlay (relationship); leaning model — users think about domains. |
| `aws-acm-https` | overlay on `loadbalancer`/`gateway` | Certificate request + DNS validation (◂ DnsZoneAnchor), listener attachment. ▸ `TlsCertificateAnchor`. |
| `aws-kms` | overlay/anchor provider | CMKs, aliases, key policies. ▸ `EncryptionKeyAnchor` consumed by database/storage/queue/secrets modules ("encrypted with your key" as a decision-surface knob). |
| `aws-ssh` | capability on `server` | EC2 key pairs and/or SSM Session Manager access profile (prefer SSM: no open port 22, IAM-audited). ▸ `ShellAccessAnchor` — later consumed by the debugging feature (Part III). |
| `aws-sqs-queue` / `aws-sns-queue` | `queue` | Queues/topics + DLQs, subscriptions; IAM policies wired to consuming executions via overlays. |
| `aws-msk-queue` | `queue` | Managed Kafka. The "aws kafka" ask — recommend MSK **before** self-hosted Kafka (group 3); same model kind, so consumers can later swap modules (the Octo wedge). |
| `aws-firehose-queue` | `queue` | Delivery streams; ▸ into `storage`/ELK targets. Pairs with observability wave. |
| `aws-codebuild-cicd` + `aws-codepipeline-cicd` | `pipeline` (model exists) | Finally gives `Pipeline.instructionSet` meaning: build projects, pipeline stages, source hooks. This is *app* CI/CD provisioning — distinct from the platform's infra-CICD view (frontend plan 09), which observes Octo's own applies. |

## Wave B — Data & compute expansion (group 3)

| Module | Kind | Notes |
| --- | --- | --- |
| `aws-elasticache-cache` | `cache` | Redis replication groups, subnet groups, auth token (◂ EncryptionKeyAnchor). ▸ `CacheEndpointAnchor` for executions. |
| `aws-lambda-server` (+ deployment/execution variants) | `server` family | Serverless compute as an alternative to `aws-ecs-server`: same model vocabulary, function + roles + event sources instead of tasks. Proves module substitution on the compute axis. |
| `aws-eks-*` family | `server`/`environment`/`execution`/`deployment` | The elephant: a full parallel to the ECS family (cluster, node groups/Fargate profiles, IRSA, deployments as k8s manifests via TF kubernetes provider). Schedule as its own effort; it unlocks Tilt (Wave C) and self-hosted stacks. Migration ECS→EKS is the flagship scenario for the migration planner (IV.1). |
| `kafka-on-eks-queue` | `queue` | Self-hosted Kafka for teams outgrowing MSK's constraints. ◂ EKS anchors. Only after EKS + MSK exist. |
| `krakend-gateway` | `gateway` (new kind) | API gateway as containers (◂ ECS or EKS server anchors) + loadbalancer in front; route config as module inputs. |
| `nginx-consul-registrator-stack` | composite (`gateway` + discovery overlays) | The classic self-hosted service-discovery trio on ECS/EC2. Worth doing as the exemplar of a *multi-piece composite module* — proves modules can encode whole architectures, which is exactly the "custom solutions" thesis. |

## Wave C — Delivery & developer experience (group 4)

| Module | Kind | Notes |
| --- | --- | --- |
| `tilt-on-eks` | dev-environment capability | The motivating example: your local dev loop running in the cluster. Provisions a dev namespace, registry access (◂ ECR image anchors), RBAC-scoped kubeconfig, and emits Tiltfile scaffolding for the user's repo. ◂ EKS. Novelty: the module's output is partly *developer-machine config*, not only cloud resources — a new module output type to design deliberately. |
| `opa-policy` | overlay | OPA sidecar/admission (on EKS) or OPA-as-authorizer for gateways; policy bundles from user repo. Also a candidate *internal* consumer: compliance rules (frontend plan 09 §9.9) could compile to OPA policies — keep the door open. |
| `keycloak-identity` | `identity` (new kind) | Keycloak on ECS/EKS + `database` dependency + realm/client provisioning. ▸ `OidcProviderAnchor` consumed by gateways/ALB auth rules — composes with the "auth in front of everything" feed example. |

## Wave D — Observability integrations (group 5)

Consistent with the vision's "no observability platform": these modules **install and wire** the
user's chosen stack into their infra; Octo does not ingest telemetry itself.

| Module | Kind | Notes |
| --- | --- | --- |
| `datadog-observability` | overlay on servers/executions | Agent sidecars/daemonsets, API key from secrets (◂ SecretRefAnchor — depends on platform secrets service, or user-provided SSM ref in v1), unified tags matching Octo's context tags — which makes DD dashboards graph-addressable. |
| `newrelic-observability` | overlay | Same shape as Datadog; second implementation proves the observability anchor contract is real. |
| `elk-stack` | composite (`database`-ish OpenSearch + `queue` firehose + dashboards) | Self-hosted/managed OpenSearch + ingestion (◂ Firehose from Wave A) + Kibana behind ◂ identity/loadbalancer anchors. Also the natural artifact store for Part III's log features. |

---

# Part III — Platform features riding on the catalog

## III.1 Out-of-the-box advanced debugging (flame graphs, heap dumps, memory snapshots)

**What it is:** any server provisioned through Octo can produce profiling artifacts without the
team building a profiling pipeline.

**Shape:** a `diagnostics` capability overlay on `server`/`deployment` modules:

- **Continuous profiling:** agent sidecar (Pyroscope/Parca-style, or language agents) enabled by
  a module input; flame graphs always available at low sampling overhead.
- **On-demand capture:** heap dump / memory snapshot / thermal CPU profile triggered per
  execution. The trigger is an actuation-plane action (frontend plan 09): UI button → operator
  runs the capture (SSM command via ◂ ShellAccessAnchor from Wave A) → artifact lands in a
  module-provisioned S3 diagnostics bucket with retention policy.
- **Surfacing:** artifacts are keyed by context string → the platform UI lists them on the
  node's inspector; flame graph viewer in the FE reads from the diagnostics bucket via the BE.
- **Composes with:** the debug-routing feature-flag flow (frontend plan 09 §9.2) — route one
  request to a debug-enabled execution, capture everything about it.

**Flags:** per-language agent matrix is real work (start Node.js + JVM); captures on production
pods need the same authorization story as debug routing; heap dumps contain user data → the
diagnostics bucket must be encrypted (◂ EncryptionKeyAnchor) with tight IAM and retention.

## III.2 AI log-expectation learning ("this request should produce these logs")

**What it is:** the AI learns, per request route, the expected log signature by observing
successful requests; when a request fails or stalls, the missing/extra log lines localize the
failure before a human reads anything. Auto-adapts as paths and logs evolve.

**Honest decomposition (each step is independently useful):**

1. **Correlation convention (prerequisite, module-enforced):** a request ID injected at the
   entry point (loadbalancer/gateway modules add the header; server modules inject env config for
   structured logging). Without correlation, nothing above it works. This is a *module catalog*
   deliverable, which is why the feature belongs in this doc.
2. **Log template mining:** cluster raw lines into templates (Drain-style algorithm — well-trodden
   prior art, not research) over the telemetry plane's log access. Output: template ids per
   service.
3. **Route fingerprints:** for observed-successful requests (join by correlation ID), learn the
   set/partial-order of template ids per route + variant (the "different use cases" the owner
   described). Store fingerprints keyed by route + commit id — a new fingerprint store in the BE.
4. **Divergence detection:** incomplete request → diff its trail against the fingerprint →
   "expected `payment.charge` log after `cart.validate`; missing — failure likely between X and
   Y (contexts …)". Surfaced in the UI on the flow view and fed to the AI assistant as a
   diagnosis prior.
5. **Drift adaptation:** fingerprints are versioned by commit; new paths/log changes after a
   deploy re-learn automatically (grace window after each apply before divergence alerts arm).

**Flags:** logs contain PII → template mining must run on the user's side of the boundary or
under explicit opt-in with masking; log-scan cost must be bounded (sample successful requests,
don't read everything); step 3+ needs the telemetry plane and the event stream (deploy markers)
from the platform plan. This feature is far downstream — but step 1 (correlation convention) is
cheap and should be baked into every Wave A/B module from day one, because retrofitting it is
painful.

---

# Part IV — Independent shippable units

Three units that sit alongside the catalog rather than inside it. All three were carried out of
docs that have since been deleted (`octo-v2-plan.md`, `octo-v2-plan-impl.md`, `octo-vision.md`);
what those docs still had open is recorded here and nothing else survives them.

## IV.1 — Migration planner

**Status:** not started; nothing in `packages/` implements it. A separate product layer, deferred
to a later version — this is vision Milestone 5, and the flagship scenario depends on Wave B.

**What it is.** A planner that takes a current model graph, a desired model graph, and user
constraints (zero downtime, cost ceiling, blast radius), and derives an ordered sequence of
single-step Octo changes plus the workflow steps between them. Execution is driven by an external
durable workflow engine such as Temporal. Humans approve at the gates the planner identifies; an
automatic safe-migration system without human gates is explicitly out of scope.

**Octo's side of the seam** — the only part that lands in this repository:

- Execute each requested single-step change accurately. This is the existing
  generate → validate → apply → commit lifecycle; no new execution machinery is required.
- Expose the per-step diff to the planner as a stable interface. The artifact already exists and
  is already machine-readable (`validate.mode.ts` plus the reporters in `octo-event-listeners`), so
  what is missing is a supported API surface over it, not the data behind it.

Nothing else in octo is required, which is why the planner can be built as a separate layer later
without holding up the catalog.

**Dependencies:** Wave B's EKS family, for the flagship ECS → EKS migration; and Part I's
vocabulary split, because substitution is expressed as swapping the module behind a model kind, and
"swap the database" is only a sentence once `database` is a kind.

**Current honesty in the docs:** `why-octo.mdx` already states the limit in its Swapping section —
Octo reports what will be created, replaced and destroyed, and does not yet sequence the
transition. Nothing needs walking back when this ships.

**Exit criteria:** a real migration (a database engine version upgrade with traffic shift) planned,
reviewed and executed end to end, with humans approving each gate and Octo executing each step.

---

## IV.2 — Capture: adopting infrastructure Octo did not create

**Status:** not built, and not expressible. There is no `capture` command in
`octo-build/src/commands/`, no terraform `import` or `moved` block generation in
`terraform.service.ts`, and nothing in the octo.yaml schema that could name an existing resource —
its eight top-level keys are `env`, `hooks`, `imports`, `modules`, `settings`, `tags`, `terraform`
and `version`, and `imports` is TypeScript class imports (`className` + `importPath`), not
terraform ones.

**Reframe first, because the old design is obsolete.** The original `octo capture <path-to-tfstate>`
was written when Octo emitted HCL and never ran terraform: capture was the only way results came
back into the model. That is no longer the gap — `validate` compares the plan against intent and
`commit` reads responses back through terraform outputs, so the round trip for resources Octo
created is closed. What remains unsolved is the other direction: **adoption**, pointing Octo at
resources that already exist and were never created by it. Anyone rebuilding the tfstate-reader
design will be solving a problem that no longer exists.

**Why this blocks real adoption.** A team with an existing terraform estate cannot start using Octo
incrementally. Their VPC is in state as `aws_vpc.main`; Octo's generated address is
`aws_vpc.<resourceId>`, because the name passed to `addTerraformResource(type, name, …)` is chosen
inside `toHCL()` and is conventionally `this.resourceId`, with no per-instance override. Applying
Octo's HCL against that estate creates a second VPC rather than adopting the first. The only path
today is `terraform state mv` by hand for every resource, which is not an adoption story.

**Why it lands in octo.yaml.** octo.yaml is the supported surface: if it cannot express something,
that thing is not supported and is not documented. Adoption is a per-deployment fact — *this*
environment's VPC already exists at *that* address — so it belongs in the definition file, not in
module code, and not in a flag. This is the first feature that needs a new top-level key since
`tags`.

**Design questions, all open:**

- **Address mapping.** Does octo.yaml map octo resource id → existing terraform address, or does
  Octo emit `import` blocks and let terraform do the matching? The `import` block route keeps Octo
  out of state manipulation entirely and is the reason to prefer it.
- **Granularity.** Per resource is precise and verbose; per module is terse and cannot express a
  partially-adopted module. A real estate will need both.
- **Validation strictness.** When adopting, how much of the live resource must match what the
  module declares — response-mapped attributes only, every declared property, or declared
  properties with extras tolerated. Strict is right for correctness and will make adoption fail
  constantly on estates that drifted; this is the decision that determines whether the feature is
  usable.
- **Gap reporting.** The half-adopted estate is the normal state for months. Octo needs to name
  what it models that the estate lacks, and what the estate has that Octo does not model, without
  blocking progress on either.

**Relationship to Part I.** Both this and the vocabulary split rewrite committed state — one
rewrites context strings, the other writes entries Octo never created. Design the state-rewriting
step once and use it for both.

**Exit criteria:** a project with an existing terraform-managed VPC can declare it in octo.yaml,
run `generate` → `validate` → `apply` → `commit`, and end with that exact resource under Octo's
management, with no resource created, replaced or destroyed by the adoption itself.

---

## IV.3 — Guards on the terraform JSON Octo parses

**Status:** open. Small, cheap, and the only unit here whose trigger is outside your control — it
fires when HashiCorp ships something, not when you write something.

**Note the ownership moved.** This was recorded against `TerragruntUtility` in octo-build. Those
invocations now live in `TerraformUtility`
(`packages/octo/src/utilities/terraform/terraform.utility.ts`): `plan(dir, { json: true })` feeds
`validate` and `output(dir, { json: true })` feeds `commit`, routing every terraform call through
one class in octo core.

**No format assertion.** `readPlan` (`:449`) and `readOutputs` (`:423`) are both a bare
`JSON.parse(stdout) as T`. Neither checks `format_version`, so a payload in a shape Octo does not
know is not rejected — it is coerced into the expected type and misparsed. Whatever falls out of
that surfaces as a wrong diff, or as nothing at all, rather than as an error naming the version.

**No ceiling on the version that produces it.** The generated config block writes
`required_version = ">= 1.6.0"` (`terraform.service.ts:1240`) — a floor with no upper bound. Octo
tells terraform that every future release is acceptable and then parses whatever JSON comes back
without checking what produced it. Those two facts are only safe together by luck.

**Unknown actions read as drift.** `validate.mode.ts:362` treats a change as no-change only when
`actions` is empty or is exactly `['no-op']` or `['read']`. Anything else is a real change. So
`forget` — added in terraform 1.7 for `removed` blocks, and therefore already inside the declared
`>= 1.6.0` range — does not fail; it surfaces as a spurious mismatch against Octo's diff, in the
one report a reviewer is supposed to trust. An action Octo does not recognise should be an
explicit "unknown action" error, not a diff disagreement.

**Scope:** assert `format_version` at both parse sites against the versions Octo has been written
against, and fail with the version in the message; classify terraform actions exhaustively in
validate, with an explicit error for anything unrecognised.

**Exit criteria:** a plan payload carrying an unknown `format_version`, and a plan carrying an
unknown action, each fail with a message naming what was not recognised — neither reaches the
report as a diff result.

---

## IV.4 — Moving a resource between accounts and regions

**Status:** open, and unverified against a live stack. Raised out of the ECR image-tag work
(`docs/aws-ecr-image-publishing.md`), where the rule was settled for one resource — a resource's
identity belongs in its resource id, and what is not identity is not a diff. Every other resource in
`octo-aws-cdk` is on the other side of that rule for two of its properties.

**What was counted.** All 23 resource families under `octo-aws-cdk/src/resources` carry
`awsAccountId` and `awsRegionId` in `properties`. **None of the 23 resource ids contains the
account.** Eight contain the region — `alb`, `ecr`, `ecr-image-tag`, `efs`, `efs-mount-target`,
`internet-gateway`, `security-group`, `vpc`. The other fifteen identify by a name
(`ecs-cluster-<cluster-name>`, `dynamodb-<table-name>`, `bucket-<bucket-name>`, …) that is
region-scoped by convention and nothing else.

**Why that is a problem.** Those two properties do not describe the resource; they select the
provider it is created through. So "move this to another account" or "move this to another region"
reaches octo as an in-place property change to the same resource, which is a thing no cloud API can
do. What each resource makes of it is then per-resource and accidental. `DynamoDB.diffProperties`,
for example, turns any change outside its five-field ignore list into a `REPLACE`, so an edited
account or region reads as "recreate the table" — in a provider block that now points somewhere
else, with the original table left behind in the old account and no longer in octo's graph to
delete. Resources without a `diffProperties` override fall through to `DiffUtility.diffObject` and
emit an `UPDATE`, which is either unhandled or handed to an update action that cannot honour it.

**The shape of a fix, not yet decided.** Put the account and the region in the resource id
everywhere, so a move is an add and a delete of two resources — the same answer `ecr-image-tag`
already gives for its tag, and the one that needs no new kind of action. What that costs is a
resource-id rewrite over committed state, which is the third feature in this document to need one:
design that step once with Part I's context-string migration and IV.2's adoption entries.

Open before it can be designed: whether an account move and a region move are the same problem
(they select the provider the same way, but an account move also crosses a credentials boundary);
what terraform does with an existing address whose provider alias changed, which nothing here has
measured; and whether any resource is legitimately account- or region-agnostic — `bucket-<name>`
is the candidate, S3 bucket names being globally unique.

**Exit criteria:** editing `awsAccountId` or `awsRegionId` on a declared module produces a diff
naming both the resource leaving the old location and the one arriving at the new one, and an apply
leaves nothing behind in the old one.

---

## IV.5 — Sensitive values leave the folder that marked them

**Status:** open, and currently latent. The marking machinery exists and has no callers, so nothing
generated today is marked sensitive — which is why none of this has bitten yet, and why it is cheap
to fix before it does.

**What exists.** `OctoTerraformResourceScope.output(outputs, { sensitiveKeys })` records a per-key
flag, and `TerraformOutput.render` writes `sensitive = true` onto the output block
(`terraform.type.ts:536`). `TerraformModuleScope.variable(name, type, { default, sensitive })` does
the same for an author-declared variable. That flag is not a nicety: terraform refuses to plan a root
output carrying a sensitive value without it, so the feature was built to satisfy terraform, and the
redaction is a side effect of that.

**No caller.** Grepping `packages/` and `apps/`, no resource in `octo-aws-cdk` passes
`sensitiveKeys`. Every generated output is unmarked. The first resource that needs it will find the
three problems below rather than a working feature.

**1. The mark does not survive a folder boundary.** A cross-folder reference generates its auto
variable as `variable "<name>" {}`, or `type = map(string)` for an external producer
(`terraform.service.ts:678`) — never `sensitive = true`. Terragrunt reads the producer's output
through `terraform output -json` and passes the value as an input, and the mark does not travel with
it. So a value the producer folder was forced to mark is an ordinary variable in the consumer folder,
free to be printed in its plan. The producer's flag is already in hand at the point the variable is
recorded (`producer.outputs.get(ref.key).sensitive` in `computeWiring`), and is simply not carried.

**2. An external resource can never mark anything.** Its whole-result output is constructed with
`sensitive: false` (`terraform.service.ts:340`) and takes no option. This one is structural rather
than an oversight — an external resource's response shape is unknown at generation time, since the
action has not run, so there are no keys to mark. The decision to make is whether an external
resource can declare its whole response sensitive, which is the only granularity available to it.

**3. `response` is written to state in plaintext.** `terraform output -json` returns sensitive values
in full; commit maps them onto each resource's `response`; `synth()` includes `response`; and
`saveModelState`/`saveResourceState` write it into `resources-actual.json` and `resources-old.json`.
`LocalEncryptionStateProvider` exists and answers this, but the default `LocalStateProvider` does not
encrypt, so the protection depends on a choice made in octo.yaml rather than on the value being
marked. Worth deciding whether a marked response key should force the choice, or at least warn.

**Already safe, and should stay that way:** terragrunt's `mock_outputs` are seeded from the producer
schema's *declared* response defaults and never from the live response, precisely so a regenerate
after a commit cannot inline a real applied value.

**Scope:** carry the producer's flag onto the generated auto variable in `computeWiring`; decide the
external-resource granularity; decide what a marked key implies for the state provider. Then mark the
first real key in `octo-aws-cdk`, since an unused mechanism is an untested one.

**Exit criteria:** a resource declares a response key sensitive; the value is marked in the producer
folder's output, in the consumer folder's variable, and absent from any plan output on either side;
and a test asserts it, so the wiring cannot silently regress to unmarked.

---

## IV.6 — State encryption: no rotation, and a key weaker than the docs imply

**Status:** open, and no longer hypothetical. `apps/octo-docs` commits `LocalEncryptionStateProvider`
output to this repository, which is public, so the ciphertext is downloadable by anyone and the key
is the whole of the defence. Every deployment before this one kept its state private, which is why
none of the properties below has mattered yet.

**0. The key was not the key (fixed, but the ciphertext is already published).**
`settings.stateProvider.encryptionKey` was handed to the provider exactly as written in octo.yaml,
with no environment resolution, so `apps/octo-docs`'s state was encrypted under the literal string
`${env.OCTO_STATE_ENCRYPTION_KEY}` — printed three lines above it in the same public file. Every
committed `.enc` under `apps/octo-docs/.octo/` opens with it: the model graph, the resource graph,
and a 16 MB terraform state. What that discloses is the AWS account number and every ARN, not
credentials; nothing scanned for an access key or a token found one. The resolution bug is fixed, so
the next run re-encrypts under the real key, but published git history does not change and should be
treated as read. Sequence this with the rotation command below, because rotating is what makes the
published copy worthless.

**What the docs promise.** `state-providers.mdx` says of the encrypting provider: "The point is that
the result is safe to commit, which gives a small team shared state with nothing to run." Three
properties of the implementation qualify that sentence, and none of them is written down anywhere a
user would look.

**1. The key is not stretched.** `FileUtility` derives the AES-256-GCM key as a bare
`createHash('sha256').update(key).digest()` (`file.utility.ts:20`, `:64`) — no salt, no iteration
count, no KDF. Against a ciphertext an attacker can fetch at will, a human-chosen passphrase falls at
GPU sha256 speed. The only constraint the provider imposes is a minimum of three characters
(`local-encryption.state-provider.ts:36`), which is the sole signal a user gets about key strength
and points nowhere useful. A long random key makes this a non-issue — but nothing says so, nothing
enforces it, and the failure is silent.

**2. The nonce is derived from the plaintext.** The IV is
`createHash('md5').update(data).digest().subarray(0, IV_LENGTH)` (`file.utility.ts:65`). GCM requires
that a nonce never repeat under one key; here it repeats exactly when the plaintext repeats. The mild
consequence is already visible in committed history — identical state encrypts to identical bytes, so
the history discloses which runs changed nothing. The real one is a nonce reused across two
*different* plaintexts, which surrenders the keystream and the authentication tag together, and
stands one md5 collision away. Constructing md5 collisions is cheap; the only thing in the way is an
attacker's ability to steer state content. A random IV costs nothing and retires the question.

**3. There is no way to rotate.** None of the sixteen commands under `octo-build/src/commands/`
re-keys state, and nothing in `packages/` decrypts and re-encrypts. Once state has been committed
under a key that is later exposed, recovery is a hand-written script calling `FileUtility` directly —
written under exactly the time pressure that makes it go wrong. A key with no rotation path is a key
that can only ever be abandoned along with its state.

**Sequence the rotation command first**, because it is also the migration vehicle. Salting the key or
randomising the IV changes the envelope, and every existing `.enc` file becomes unreadable to the new
code. A command that reads with the old scheme and writes with the new one is the same command that
re-keys, so building it first turns both fixes from breaking changes into a documented step. This is
the fourth feature in this document to need a rewrite over committed state — Part I rewrites context
strings, IV.2 writes entries Octo never created, IV.4 rewrites resource ids — but it is the only one
rewriting the envelope rather than the contents, so it does not share their machinery.

**Related, not duplicated:** IV.5 §3 covers `response` reaching state in plaintext and asks whether a
marked key should force the provider choice. That is about what goes *into* state; this is about how
well the file resists someone who has it. They meet at the same decision — what the encrypting
provider is actually promising — and should be answered together.

**Scope:** salt and stretch the key with a real KDF, storing the salt in the file header; generate the
IV randomly and keep writing it where it already goes; add a rotate command that reads under one key
and scheme and writes under another; raise the minimum key length and say plainly in
`state-providers.mdx` what "safe to commit" does and does not cover.

**Exit criteria:** state encrypted by an older octo is readable after upgrade via one documented
command; two applies that produce identical state produce different ciphertext; a key below the
raised minimum is refused with a message naming the requirement; and `state-providers.mdx` states the
threat model that "safe to commit" assumes.

---

## IV.7 — A listener of your own cannot be registered from octo.yaml

**Status:** open, and documented as a gap rather than as a feature.

**What exists.** Octo narrates its whole run as events, and the stream is public: forty-five event
classes in nine families, `@OnEvent` subscribes by class, and subscribing to a base class catches
its subclasses. Two listeners ship, `LoggingEventListener` and `HtmlReportEventListener`, and
`settings.listeners` names them by type.

**What does not.** `settings.listeners` accepts those two types and nothing else. Registering a
listener class of your own means `octo.initialize(stateProvider, [{ type: MyListener }])`, which is
driving Octo from TypeScript, and there is no path from a definition file to that call.
`techniques/events-and-listeners.mdx` says so plainly today rather than teaching the call, which is
the right treatment for an unreachable extension point, and it leaves the three things the page
suggests building (a pull request comment, an audit trail, a gate) reachable only by parsing the
JSON the HTML listener writes.

**Why it matters more than it looks.** The events stream is the seam the platform's own features are
meant to ride on, and a seam nobody outside the framework can attach to is a seam in name only. It
is also the second capability found in this shape: `registerSchemaTranslation` has exactly the same
problem, exists on the `Octo` class, is called by nothing but its own unit test, and is now
documented as a gap in `techniques/schema.mdx`. Two is a pattern worth deciding about once.

**Design questions, all open:**

- **How a class is named.** `imports` already binds a class name to a package for modules, and a
  listener could reuse it. `hooks` takes a different shape, an `importPath` plus a `method`
  returning what to register, which suits a listener less well because there is nothing to return.
- **Whether the same key covers translations.** A schema translation is registered against the same
  object at the same moment. One mechanism that registers whatever a project brings, listeners and
  translations alike, is probably one key rather than two.
- **What a listener may do.** A listener that throws is a hook by accident. The distinction the docs
  draw, that a listener observes and a hook participates, has to survive contact with user code, so
  decide whether an exception from a listener is swallowed or fatal.
- **Ordering.** Two listeners on one event, and the built-ins among them: `LoggingEventListener`
  owns stdout, so a user listener that prints has to be told to use stderr or be sequenced after it.

**Relationship to the rest of this document.** No state rewrite, no migration, and no dependency on
Part I. It is a definition-file surface addition, the same class of change as IV.2's adoption key,
and worth doing at the same time as that one because both add a top-level concern to octo.yaml.

**Exit criteria:** a project declares its own listener class in `octo.yaml`, the class receives the
events it subscribed to on a real run, and `techniques/events-and-listeners.mdx` teaches the
declaration instead of naming the gap.

---

# Sequencing summary

1. **Part I vocabulary split** — inside the v2 serialization window (context-string migration).
2. **Wave A** primitives (+ correlation-ID convention baked in from the start).
3. **Wave B** — MSK/Redis/Lambda early (small); EKS as its own scheduled effort; KrakenD /
   nginx-consul composite after compute settles.
4. **Wave C** — Tilt right after EKS (it's the demo that sells EKS); OPA/Keycloak independent.
5. **Wave D** — after the anchor contracts from A/B are stable; Datadog first, New Relic proves
   the contract, ELK last (largest composite).
6. **Part III** — III.1 after Wave A (`aws-ssh`) + actuation plane; III.2 steps 2–5 after the
   telemetry plane; step 1 immediately (convention, not a system).
7. **IV.1** — after Wave B's EKS family. A separate product layer, sequenced outside octo.
8. **IV.2** — demand-driven: it is worth nothing until a team with an existing estate wants in,
   and worth everything the day one does. Design its state-rewriting step with Part I.
9. **IV.3** — whenever there is an hour spare, and before any deliberate bump of the terraform
   versions Octo is tested against.
10. **IV.4** — before the catalog grows much further, because every module added lands one more
    resource family on the wrong side of the rule. Its state-rewriting step is shared with Part I
    and IV.2, so schedule it against whichever of the three moves first.
11. **IV.5** — before the first module that has a secret to declare, which is `aws-kms` or the
    secrets dependency behind Wave D at the latest. Cheap while nothing is marked; a migration once
    something is.
12. **IV.6** — rotation first, and now rather than soon: the published state was encrypted under a
    placeholder that is printed beside it, so the exposure is already real rather than a question of
    key strength. Rotation is what retires it; the KDF and IV fixes ride on that command once it
    exists. Answer it with IV.5's provider question rather than twice.
13. **IV.7** — with IV.2, since both add a top-level key to octo.yaml and the shape of one informs
    the other. No dependency on any wave.

Every module lands with: schema-documented decision surface, anchors declared, actions
single-responsibility, localstack/moto module tests + snapshots, and one end-to-end verification
against real AWS before catalog inclusion.
