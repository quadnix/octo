# Octo Architecture

The pieces this repository is made of, and how they fit together. What exists, not what is planned.

`README.md` holds the commands. `CODING-STANDARDS.md` holds the rules. `OPEN-ITEMS.md` holds what is
wrong and what is missing. What one package needs a maintainer to know before reading its code is in
that package's `README.md`.

---

## The world this sits in

Octo is infrastructure as code written as **intent**. A user describes an app, the accounts and
regions it runs in, its environments, and the servers and services it needs. **Modules** turn that
description into Terraform, one Terragrunt folder per module, and the user's own Terraform and
Terragrunt apply it.

Two kinds of people write against it:

- **An app author** lists modules and their inputs in an `octo.yaml` and drives the `octo` CLI.
- **A module author** writes models, overlays, resources and actions in TypeScript, published as a
  library. `@quadnix/octo-aws-cdk` is Quadnix's own library for AWS.

Octo never reads the cloud to find out what exists. It compares the graph described now with the
one it recorded after the last run.

---

## The pieces

| Package                         | Depends on                        | What it owns                                                         |
|---------------------------------|-----------------------------------|----------------------------------------------------------------------|
| `packages/octo`                 | —                                 | the graph, modules, transactions, Terraform rendering, state, events |
| `packages/octo-aws-cdk`         | `octo`                            | AWS models, modules, anchors, overlays and resources                 |
| `packages/octo-event-listeners` | `octo`                            | the logger, the CLI report, the journal                              |
| `packages/octo-build`           | `octo`, `octo-event-listeners`    | the `octo` CLI and the `octo.yaml` loader                            |
| `packages/octo-templates`       | `octo`, `octo-aws-cdk`, listeners | tested stacks, and the e2e suites that apply them                    |
| `apps/octo-docs`                | the published packages            | the Docusaurus site, and the API reference generated from JSDoc      |

**`octo` knows no cloud and no presentation.** It emits events for what it did; a listener decides
what they mean. Nothing in `octo` names AWS.

Nx controls `packages/` only; `apps/octo-docs` manages its own dependencies and pins released
versions.

---

## The graph

Everything in `octo` is a node in a graph, an edge between nodes, or a reaction to the graph
changing.

- **Models** are intent, in a fixed vocabulary of twelve: app, account, region, subnet, environment,
  server, deployment, execution, service, image, filesystem, pipeline. New intent composes these;
  it does not add to them. A model may materialize nothing.
- **Overlays** are models that join other models — "this server reads that bucket". An overlay is a
  peer of what it joins, ordered after it, never its child.
- **Anchors** are a model's public face: a small named set of properties other modules match on by
  **schema**, never by class. A model class is private to its library; its anchors are the contract.
- **Resources** are concrete infrastructure. A resource is either **Terraform-owned**
  (`ATerraformResource`, rendered to HCL) or **external** (driven by octo through a provider SDK).
- **Dependencies** are edges carrying an optional parent/child relationship and **behaviors** —
  ordering rules between one node's diff and another's.
- **Actions** react to diffs. A **model action** turns a model or overlay diff into resources, and
  is the only place intent becomes infrastructure. A **resource action** performs an external
  resource's change against the cloud.

### Two graphs

The **model graph** holds models and overlays, rooted at the app. The **resource graph** holds
resources, in three views: **actual** (what the last commit recorded), **old** and **new**.

The model side is **pure ADD**: every run restates the whole desired graph as additions, so every
model action runs on every run. Comparison — and so UPDATE, REPLACE and DELETE — happens only in the
resource graph, between what the model actions declared now and what was recorded.

### Resource identity

A module author names a resource with a `localResourceId`, unique among its siblings. Octo appends
a hash of the resource's **scope** — where its creating model sits in the graph — to form the
`resourceId`, unique across the app. The same stack built in two regions therefore yields distinct
ids without the author naming the region. `packages/octo/README.md` holds the details.

---

## Modules

A module takes typed inputs and returns models, overlays and anchors from `onInit`. Everything it
needs from another module it finds through that module's anchors, so modules compose without
importing each other.

- Modules run **a class at a time**, in the order the definition lists the classes. A module whose
  input names an instance of a later class fails with a missing reference.
- The same class can be loaded many times under different module ids.
- A resource belongs to the module whose action created it: one Terragrunt folder per module, and
  only that module's actions find it and tag it.
- Hooks a module registers are global, keyed by action class name.

---

## The lifecycle

A change is four commands, each its own process. Each one boots octo, rebuilds the graph from the
definition and the recorded state, and does one step:

| Command         | Does                                                                                     | Touches the cloud |
|-----------------|------------------------------------------------------------------------------------------|-------------------|
| `octo generate` | diffs the resource graph and writes one Terragrunt folder per module                     | no                |
| `octo validate` | plans every folder and reads the plan against octo's own diff, as a report               | reads             |
| `octo lock`     | takes the app's lock and prints its id; the lock is the **run**                          | no                |
| `octo apply`    | refuses any planned destroy unless approved, then applies the folders through Terragrunt | yes               |
| `octo commit`   | reads Terraform outputs back into resource responses, saves state, releases the lock     | no                |

`octo unlock` releases a lock without committing.

**An external resource calls back into octo.** It renders as a `null_resource` whose provisioner
runs `octo run-action --resourceId=…`, and a `data "external"` that runs `octo get-response`.
Terraform therefore launches further octo processes mid-apply; each finds the modules through the
definition file and the prior state through the state provider it names.

`TestModuleContainer` runs all of this in one process for tests, deriving the model transaction once
and handing it to every step.

---

## Terraform generation

`TerraformService` collects what every resource renders and writes the folders.

- **One folder per module.** A reference between two resources in one folder is an inline
  expression; across folders it becomes a variable, a Terragrunt `dependency`, and mock outputs so a
  first plan works before anything is applied. A dependency cycle between folders is refused at
  generate.
- **A removed module's folder is emptied, never deleted**: provider blocks only, so the next apply
  destroys what it held.
- **A renamed resource or folder moves its state.** When a `uniqueProperties` name survives an id
  change, generate writes `moved` blocks, and a folder change moves state between folders before
  Terraform runs.
- **Generated Terraform is committed** and must name nothing machine-specific. The one account
  number it carries by design is the provider alias, replaced by `accountName` where that matters.

---

## State

The state provider stores `models.json`, the resource graph (`resources-actual.json`,
`resources-old.json`), per-resource records, and each folder's Terraform state, which octo checks in
periodically during an apply.

| Provider              | For                                                                    |
|-----------------------|------------------------------------------------------------------------|
| `LocalStateProvider`  | one person, state on disk                                              |
| `RemoteStateProvider` | teams; uploads and downloads through the Quadnix backend's signed URLs |
| `TestStateProvider`   | tests, in memory                                                       |

The lock is the unit of work: everything from the `generate` before it until its release is one
run. With `JournalEventListener` listed, every command also writes a **journal** — its events,
Terraform's output, and copies of the state it overwrote — archived per lock.

---

## Events and reports

`octo` emits typed events through `EventService` and holds no output policy. `octo-event-listeners`
supplies the listeners an `octo.yaml` can list: `LoggingEventListener`, which also prints the CLI's
validate report, and `JournalEventListener`. A presentation change ships in that package alone.

**What leaves the process is a contract**, published by the package that writes it:
`@quadnix/octo/types` holds the state files, and `@quadnix/octo-event-listeners/types` the journal,
the Terraform log, each event's payload as the journal holds it, and the error a command failed with.
The Quadnix web app reads Octo's files through these two entry points.

---

## Testing

| Kind  | File            | Where                           | Cost                                    |
|-------|-----------------|---------------------------------|-----------------------------------------|
| unit  | `*.spec.ts`     | every package; CI runs them     | free                                    |
| integ | `*.ispec.ts`    | `octo`, `octo-templates`        | real Terraform, locally or LocalStack   |
| e2e   | `*.e2e-spec.ts` | `octo-aws-cdk/test/modules`     | plans against real AWS, applies nothing |
| e2e   | `*.e2e-spec.ts` | `octo-templates/src/<template>` | **creates real AWS resources**          |

Every module test runs through `TestModuleContainer.runModules()`, whose `terraformTarget` is `skip`
(unit), `plan`, or `apply`. Template suites that hold an external resource drive the real CLI
instead. Packages import `octo` from `dist`, so a suite sees only what was built.

---

## Build and release

An Nx monorepo on pnpm, ESM throughout, TypeScript on Node16 module resolution. Every package
versions independently.

`nx.json` maps the commit **type** to the bump: `chore` releases nothing, `patch`, `minor` and
`major` bump as named. Nx picks the project from the files a commit touches, not from the package
named in the subject, and the highest bump since a package's last tag wins.

- **Pre-commit hook**: format check, lint, build with its type check, circular-dependency check, the
  secrets spec, the docs code-block check.
- **Pull Request Workflow**: title check, format check, lint, the secrets spec, the docs code-block
  check, build with its type check, circular-dependency check, unit tests. No integration or e2e
  suite runs in CI.
- **Manual Release**: build, version and tag, write the changelog, publish to npm. Dependents'
  ranges are rewritten.
- **Manual Documentation Release** publishes `apps/octo-docs`.
