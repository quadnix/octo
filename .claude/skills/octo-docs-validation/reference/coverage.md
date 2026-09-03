# Coverage

Which pages have been executed, not merely read. Update this as part of every run.

Legend: **run** the page was carried out and its output compared; **read** its claims were checked
against artifacts a run produced, but the page itself has no commands; **part** some of its surfaces
were exercised and the notes say which were not; **open** neither.

Last updated: 2026-09-03.

## Introduction

Both **read**. `introduction` and `why-octo` argue rather than instruct, so what is checkable is
their diagrams and their captured output, and both have been compared against a real run.

## Getting Started

All five **run**: both projects scaffolded, deployed, changed, and destroyed, with the lock
semantics, the destroy refusal, and `--auto-approve` all exercised.

Open on `the-lifecycle`: `commit --partial`, which needs an apply deliberately broken part way.

## Fundamentals

All ten **read**, with their concrete claims checked against `.octo/` and the generated Terraform
from the shop: the twelve model types, the five `DiffAction` members, the state file key sets, the
overlay's anchors and properties, and the dependency behaviours.

## Using Octo

| Page                                   | State | Notes                                                                             |
|----------------------------------------|-------|-----------------------------------------------------------------------------------|
| `the-definition-file`                  | part  | `env` including `kind: boolean`, `terraform` including `accountName` and the alias collision, `settings`, `imports`, `modules`, `tags`, `hooks`, several definition files, and the `model` / dotted-path / `input` / `metadata` reference forms. **Open:** `setRegionAttribute`, and the `resource` and `overlay` reference forms. |
| `composing-modules`                    | run   | Two instances of one module, both wrong-connection errors, and the region-module swap end to end. |
| `reading-a-validate-report`            | run   | All four outcomes produced deliberately.                                          |
| `tagging-resources`                    | run   | Both scopes, and all three documented tag errors.                                 |
| `destroying-infrastructure`            | run   | Single-module removal and full teardown.                                          |
| `troubleshooting`                      | open  | Read, never exercised message by message.                                         |

## Building Modules

Eight of nine **run**. A `@shop` library was written with the generators and applied to real AWS:
module, schema, model, model action, anchor, Terraform resource, overlay, overlay action, and the
unit test harness. `create-external-resource`'s scaffold was generated and compiled but not
implemented; the external-resource machinery itself was exercised through `AwsEcrImageTagModule`.

`publishing-a-library` is **open**: read, never carried out.

## Techniques

| Page                       | State | Notes                                                                                  |
|----------------------------|-------|----------------------------------------------------------------------------------------|
| `schema`                   | run   | `Schema<T>()` required and default, resolved vs validated, and the reachability of schema translation. |
| `validation`               | run   | Every constraint in the table, `destruct`, several rules, and the transform argument, as a spec in the example project. |
| `events-and-listeners`     | part  | The event count and families counted from source; both shipped listeners registered and their output checked. **Open:** a listener of your own, which the page itself says cannot be named from `octo.yaml`. |
| `hooks`                    | run   | The page's own example, both `postModelActionHooks` and `preCommitHooks`, through a real apply and commit. |
| `state-providers`          | run   | `LocalEncryptionStateProvider` end to end, the `.enc` suffix on every file, the key from the shell, the `.gitignore` re-inclusion, and the wrong-key path. |
| `github-actions-pipeline`  | part  | The report JSON the comment script parses, field by field. **Open:** everything that needs a repository and a runner. |

## Reference

| Page                            | State | Notes                                                                        |
|---------------------------------|-------|-------------------------------------------------------------------------------|
| `cli`                           | run   | Every command listed, plus lock semantics and flags. `commit --partial` open.  |
| `aws-module-catalog`            | part  | App, account, both regions, subnet, environment, server, deployment, execution, image, S3 storage, S3 website, DynamoDB. **Open as applied infrastructure:** ALB, EFS, DynamoDB global; their inputs are written down but never created. |
| `templates`                     | part  | All three scaffolded and their module lists checked. `aws-s3-website` and `aws-dynamodb-service` run end to end; `aws-ecs-server` not run, because it creates a NAT gateway and a load balancer that bill by the hour. |

## Contribution Guide

`contributions/nx.contribution` and `contributions/tsconfig.contribution` are **open**. Generated
pages with explicit slugs.
