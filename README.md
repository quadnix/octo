# Octo

https://octo.quadnix.com/

The open-source infrastructure management and CICD tool.

> Disclaimer,
> This library is still under development and is currently in version `0.x.x`.
> We plan to release version `1.x.x` when it is deemed ready for production use.

# Local Setup

## Prerequisites

- [Node.js](https://nodejs.org) 22 (LTS). This ships with Corepack, which provisions the
  exact package manager the project expects — you do **not** need to install pnpm yourself.

## Install

This repository is a [pnpm](https://pnpm.io) workspace. Corepack reads the `packageManager`
field in the root `package.json` and uses the pnpm version pinned there, so everyone (and CI)
runs the same version.

```sh
# One-time per machine: activate Corepack so the `pnpm` command uses the pinned version.
corepack enable

# Install all workspace dependencies (packages/*).
pnpm install
```

> **Note:** The documentation site under `apps/octo-docs` is an intentionally separate
> project — it consumes the published `@quadnix/*` packages from the registry rather than the
> local source. It is not part of the root workspace and is only installed (with its own
> `pnpm install`, run from inside that directory) when you are working on the docs.
