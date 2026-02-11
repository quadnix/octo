---
path: /contributions/tsconfig.json
sidebar_label: tsconfig.json
slug: /contributions/tsconfig.json
title: tsconfig.json
---

:::info[Info]
| **Key**  | **Value**        |
| -------- | ---------------- |
| **path** | `/tsconfig.json` |
:::

Octo is majorly written in TypeScript, and thus uses `tsconfig.json` to compile the application.
This file is the base TypeScript configuration file. All other apps and packages extend from this file.
This file defines the sane defaults, and allows other parts of the project to override to suit their needs.

## Setup
* Below dev dependencies were installed to [package.json](/contributions/package.json) to support TypeScript.
  * **@types/node**: contains type definitions for Node.js.
  * **@typescript-eslint/eslint-plugin**: contains lint rules for TypeScript.
  * **@typescript-eslint/parser**: allows eslint to lint TypeScript files.
  * **rimraf**: helper library to easily delete build and dist directories.
  * **source-map-support**: provides source map support for stack traces in node.
  * **ts-loader**: is used to compile TypeScript to JavaScript.
  * **ts-node**: is used to execute TypeScript files with its JIT transformation.
    We mostly use this package to run tests written in TypeScript.
  * **tsconfig-paths**: is used to load modules specified in the `paths` section of `tsconfig.json`.
    This package is mostly invoked before running tests written in TypeScript.
  * **typescript**: base package.

## Configuration
Only a few notable options are explained in this document.
Please refer to the [TypeScript documentation](https://www.typescriptlang.org/it/tsconfig)
for more information on each option.

### Decorators
To support decorators, primarily defined in `packages/octo`, these flags have been set.
- `"emitDecoratorMetadata": true`
- `"experimentalDecorators": true`

### Performance
- `"incremental": true` allows for faster typescript compilation since project graph is reused from last compilation,
and saved into `.tsbuildinfo`.
- `"isolatedModules": true` allows for faster typescript compilation since TS is not cross-checking references.
- `"skipLibCheck": true` can save time during compilation at the expense of type-system accuracy.
