# Coverage

Which pages have been executed, not merely read. Update this as part of every run.

Legend: **run** the page was carried out and its output compared; **read** its claims were checked
against artifacts a run produced, but the page itself has no commands; **open** neither.

Last updated: 2026-09-03.

## Introduction

| Page              | State | Notes                                                                 |
|-------------------|-------|-----------------------------------------------------------------------|
| `introduction`    | read  | Argument page. Its diagram's resource set was checked against a run.  |
| `why-octo`        | read  | Its validate report and terraform plan blocks were compared to real output. |

## Getting Started

| Page                             | State | Notes                                                              |
|----------------------------------|-------|--------------------------------------------------------------------|
| `getting-started/installation`   | run   | Scaffolded both projects. Found the `0.0.x` pin.                   |
| `getting-started/static-website` | run   | Deployed, changed a page, destroyed. Two output corrections.       |
| `getting-started/shop-stack`     | run   | Both passes, checkout added on live infrastructure.                |
| `getting-started/the-lifecycle`  | run   | Each step's table row checked, including what each touches.        |
| `getting-started/project-structure` | run | `.octo/` file list and the version-control table checked on disk.  |

## Fundamentals

All ten read, and their concrete claims checked against `.octo/` and generated terraform from the
shop run: the twelve model types, the five `DiffAction` members, the state file key sets, the
overlay's anchors and properties, and the dependency behaviors.

`how-octo-works`, `models`, `resources`, `dependencies`, `actions`, `anchors`, `overlays`,
`modules`, `state`, `shop-stack-explained`.

## Using Octo

| Page                                | State | Notes                                                            |
|-------------------------------------|-------|------------------------------------------------------------------|
| `using-octo/the-definition-file`    | run   | Every section exercised except `hooks`.                          |
| `using-octo/composing-modules`      | run   | Two instances of one module, and both wrong-connection errors.   |
| `using-octo/reading-a-validate-report` | run | `clean`, `changes`, `drift`, and `failed` all produced deliberately. |
| `using-octo/tagging-resources`      | run   | Both scopes, and all three documented tag errors.                |
| `using-octo/destroying-infrastructure` | run | Single-module removal and full teardown.                        |
| `using-octo/troubleshooting`        | open  | Read but not exercised message by message.                       |

## Building Modules

All nine run. A `@shop` library was written with the generators and applied to real AWS: module,
schema, model, model action, anchor, terraform resource, overlay, overlay action, and the unit test
harness. `create-external-resource`'s scaffold was generated and compiled but not implemented; the
external-resource machinery itself was exercised through `AwsEcrImageTagModule`.

`publishing-a-library` is **open**: read, never carried out.

## Techniques

**All six open.** This is the largest gap.

| Page                                  | Notes                                                        |
|---------------------------------------|--------------------------------------------------------------|
| `techniques/schema`                   | Including schema translation between anchor shapes.          |
| `techniques/validation`               | Every documented validator rule.                             |
| `techniques/events-and-listeners`     | Writing a listener; the event count claim.                   |
| `techniques/hooks`                    | The one `octo.yaml` section never exercised.                  |
| `techniques/state-providers`          | `LocalEncryptionStateProvider` especially.                    |
| `techniques/github-actions-pipeline`  | Deliberately skipped once; needs a decision on how to verify. |

## Reference

| Page                            | State | Notes                                                        |
|---------------------------------|-------|--------------------------------------------------------------|
| `reference/cli`                 | run   | Every command listed, plus lock semantics and flags.         |
| `reference/aws-module-catalog`  | part  | App, account, region, subnet, environment, server, deployment, execution, image, S3 storage, S3 website. **Open:** DynamoDB, DynamoDB global, ALB, EFS, multi-AZ region. |
| `reference/templates`           | open  | Only `aws-s3-website` scaffolded. `aws-ecs-server` and `aws-dynamodb-service` never run. |

## Contribution Guide

`contributions/nx.contribution`, `contributions/tsconfig.contribution` - **open**. Generated pages
with explicit slugs.
