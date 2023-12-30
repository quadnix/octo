---
sidebar_position: 7
title: NX
---

[NX](https://nx.dev/concepts/more-concepts/why-monorepos) is a powerful open-source tool for a wide variety of
performance and code quality enhancements. We currently use `nx` for managing our monorepo,
and might use its other offerings in the near future.

## Setup
* Below dev dependencies were installed to `<root>/package.json`
  * **nx**: base package.
  * **@nx/devkit**
  * **@nx/eslint-plugin**
* Added multiple scripts in `package.json` to run commands via nx on all projects.
* Added `workspaces` in `package.json` to instruct nx where to look for projects.
* Added `nx.json` to configure nx.
* Added `@nx` plugin to `<root>/.eslintrc.cjs`. This plugin enables us to use `@nx/enforce-module-boundaries` rule in
eslint of real projects.
* Each project has a nx tag in `package.json` by adding a `nx > tags` entry.
The value of the tag is the same as used in that package's `.eslintrc.cjs`.

## Configuration
The configuration for nx lives in `nx.json`.
<br />

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
is setting common options for all projects [docs](https://nx.dev/reference/nx-json#target-defaults).
The default target build `"dependsOn": ["^build"]` is a shorthand to instruct nx to first build
all the dependencies of the project before building the project.
<br />

```
"tasksRunnerOptions": { ... }
```
is setting the behavior of nx runs [docs](https://nx.dev/reference/nx-json#tasks-runner-options).
The default runner and options instruct nx to cache the output of given commands for a faster run.

## Philosophy
The idea behind using `nx` is for it to reduce configuration duplication.
* Basic dependencies of all projects are declared in `<root>/packge.json`,
and only the specific packages pertaining to that project is under their package.json
* Having the ability to invoke common commands, such as, `build`, `format`, `lint`, `test`,
for all projects with just one nx command, listed in `<root>/packge.json`.
* To be able to enforce module boundaries, [docs](https://nx.dev/core-features/enforce-module-boundaries)
