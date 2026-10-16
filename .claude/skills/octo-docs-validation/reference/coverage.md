# Coverage

Which pages have been executed, not merely read. Update this as part of every run.

Legend: **run** the page was carried out and its output compared; **read** its claims were checked
against artifacts a run produced, but the page itself has no commands; **part** some of its surfaces
were exercised and the notes say which were not; **elsewhere** something outside this skill
exercises it, named in the notes; **open** nothing exercises it.

Only **open** is a gap.

Last updated: 2026-09-28.

## Introduction

Both **read**. `introduction` and `why-octo` argue rather than instruct, so what is checkable is
their diagrams and their captured output, and both have been compared against a real run.

## Getting Started

All five **run**: both projects scaffolded, deployed, changed, and destroyed, with the lock
semantics, the destroy refusal, and `--auto-approve` all exercised.

`static-website` re-run 2026-09-28 against the scaffold that puts the website in a serverless
region, with the packages symlinked because that scaffold is unreleased: deployed, changed,
refused, and destroyed. `shop-stack` was not re-run; its captured contexts were already the ones a
bucket under its region produces.

Open on `the-lifecycle`: `commit --partial`, which needs an apply deliberately broken part way.

## Fundamentals

All ten **read**, with their concrete claims checked against `.octo/` and the generated Terraform
from the shop: the twelve model types, the five `DiffAction` members, the state file key sets, the
overlay's anchors and properties, and the dependency behaviours.

## Using Octo

| Page                        | State     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
|-----------------------------|-----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `the-definition-file`       | part      | `env` including `kind: boolean`, `terraform` including `accountName` and the alias collision, `settings`, `imports`, `modules`, `tags`, `hooks`, several definition files, and the `model` / dotted-path / `input` / `metadata` reference forms. **Open:** `setRegionAttribute`, and the `resource` and `overlay` reference forms.                                                                                                                              |
| `composing-modules`         | run       | Two instances of one module, both wrong-connection errors, and the region-module swap end to end.                                                                                                                                                                                                                                                                                                                                                               |
| `reading-a-validate-report` | run       | All four outcomes produced deliberately.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tagging-resources`         | run       | Both scopes, and all three documented tag errors.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `destroying-infrastructure` | run       | Single-module removal and full teardown.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `recovering-a-failed-run`   | part      | Run 2026-09-25 on `LocalStateProvider` against live AWS: a failed apply and `commit --partial`, a failed commit keeping its lock, the destroy refusal and `unlock`, an apply interrupted with Ctrl-C and resumed on the same machine, and a lost machine's leftovers (bucket, VPC, and an internet gateway still being created) found with the page's script and deleted; the `terragrunt import` path was run too. **Open:** the remote-state and CI sections. |
| `troubleshooting`           | elsewhere | Its messages surface on their own as infrastructure gets built. Correct the entry for any message a run actually hits; do not force the rest.                                                                                                                                                                                                                                                                                                                   |

## Building Modules

Eight of nine **run**. A `@shop` library was written with the generators and applied to real AWS:
module, schema, model, model action, anchor, Terraform resource, overlay, overlay action, and the
unit test harness. `create-external-resource`'s scaffold was generated and compiled but not
implemented; the external-resource machinery itself was exercised through `AwsEcrImageTagModule`.

`publishing-a-library` is **elsewhere**: it needs a registry and a second consuming project, and
waits for a real library to publish.

## Techniques

| Page                      | State     | Notes                                                                                                                                                                                                           |
|---------------------------|-----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `schema`                  | run       | `Schema<T>()` required and default, resolved vs validated, and the reachability of schema translation.                                                                                                          |
| `validation`              | run       | Every constraint in the table, `destruct`, several rules, and the transform argument, as a spec in the example project.                                                                                         |
| `events-and-listeners`    | part      | The event count and families counted from source; both shipped listeners registered and their output checked. **Open:** a listener of your own, which the page itself says cannot be named from `octo.yaml`.    |
| `hooks`                   | run       | The page's own example, both `postModelActionHooks` and `preCommitHooks`, through a real apply and commit.                                                                                                      |
| `state-providers`         | part      | **Open:** re-run the page as it now stands.                                                                                                                                                                     |
| `github-actions-pipeline` | elsewhere | Not to be exercised from here yet. `apps/octo-docs` releases through a pipeline of this shape. The part worth checking from a run is the report JSON its comment script parses, which has been, field by field. |

## Reference

| Page                 | State | Notes                                                                                                                                                                                                                                                                            |
|----------------------|-------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `cli`                | run   | Every command listed, plus lock semantics and flags. `commit --partial` open.                                                                                                                                                                                                    |
| `aws-module-catalog` | part  | App, account, both regions, subnet, environment, server, deployment, execution, image, S3 storage, S3 website, DynamoDB applied from here. ALB, EFS and DynamoDB global are **elsewhere**: their inputs are written down, and `octo-templates` stands the ALB up.                |
| `templates`          | part  | All three scaffolded and their module lists checked. `aws-s3-website` and `aws-dynamodb-service` run end to end. `aws-ecs-server` is **elsewhere**: the `octo-templates` package runs it, including its drift and incremental suites, and it bills by the hour to stand up here. |

## Contribution Guide

`contributions/nx.contribution` and `contributions/tsconfig.contribution` are generated from the
files they document, with explicit slugs. Nothing to run.

## Still genuinely open

Nothing. Every page is either run from here or exercised by something named above. The narrow
surfaces still untried are listed in their rows: `commit --partial`, `setRegionAttribute`, the
`resource` and `overlay` reference forms, and `octo build`.
