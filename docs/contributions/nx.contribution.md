---
path: /contributions/nx.json
sidebar_label: nx.json
slug: /contributions/nx.json
title: nx.json
---

:::info[Info]
| **Key**  | **Value**        |
| -------- | ---------------- |
| **path** | `/nx.json` |
:::

Octo uses [NX Monorepo](https://nx.dev/concepts/more-concepts/why-monorepos) to manage its repository.
This file is the base NX configuration file, and most other app and package level configurations are handled
using the `project.json` file, or the `nx` property in the `package.json` file.
* Less configuration duplication.
* Ability to invoke common commands, such as - `build`, `format`, `lint`, `test`
  for all projects with just one nx command.
* Enforce module boundaries.

## Setup
* Below dev dependencies were installed to [package.json](/contributions/package.json) to support NX.
  * **@nx/devkit** base package.
  * **@nx/eslint-plugin** provides default eslint configuration rules for nx projects.
  * **@nx/js** provides generators and executors for building, testing, linting, and serving
  JavaScript and TypeScript projects within a Nx workspace.
  * **nx**: base package.
* Added `workspaces` in `package.json` to instruct nx where to look for projects.

## Configuration
Only a few notable options are explained in this document.
Please refer to the [NX documentation](https://nx.dev/reference/nx-json)
for more information on each option.

```
"$schema": "./node_modules/nx/schemas/nx-schema.json",
```
fetches the JSON schema to help IDE validate the configuration file.
<br />

```
"extends": "nx/presets/npm.json",
```
sets [default](https://github.com/nrwl/nx/blob/master/packages/nx/presets/npm.json) nx configurations.
<br />

```
"targetDefaults": { ... }
```
is setting common options for all projects. See [docs](https://nx.dev/reference/nx-json#target-defaults).
The default target build `"dependsOn": ["^build"]` is a shorthand to instruct nx to first build
all the dependencies of the project before building the project.
<br />

```
"tasksRunnerOptions": { ... }
```
is setting the behavior of nx runs. See [docs](https://nx.dev/reference/nx-json#tasks-runner-options).
The default runner and options instruct nx to cache the output of given commands for a faster run.
