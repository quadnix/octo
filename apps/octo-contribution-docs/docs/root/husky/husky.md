---
sidebar_position: 2
title: Husky & Git Hooks
---

[Husky](https://typicode.github.io/husky/) is a widely used tool to enforce Git hooks.
Before we make any commit, husky enables us to run hooks that check the "correctness" of the commit.

## Setup
* Below dev dependencies were installed to `<root>/package.json`
  * **husky**: base package.
* Added the `prepare` script in `package.json` for initialization.
* For first time contributors, you need to run `npm run prepare` script to initialize husky.
* A `<root>/.husky/_` directory is created with some husky scripts.
* From this point, husky automagically runs and verifies your commits.

:::danger
You must try to never ignore the husky hooks. Always prefer to fix the issues first, or ask for help.

To ignore verification, you can use the `no-verify` git option,
> git commit --no-verify -m "commit message"
:::

## Configuration
Our husky pre-commit hooks looks like,
```console
#!/bin/sh

npm run lint
```
i.e. we only run the `lint` script as our commit verification.
