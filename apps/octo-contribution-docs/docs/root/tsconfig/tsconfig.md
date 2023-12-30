---
sidebar_position: 8
title: TSConfig & TypeScript
---

We are a TypeScript shop, and we love it!

## Setup
* Below dev dependencies were installed to `<root>/package.json`
  * **typescript**: base package.
  * **@types/node**: contains type definitions for NodeJS.
  * **@typescript-eslint/eslint-plugin**: contains lint rules for TypeScript.
  * **@typescript-eslint/parser**: allows eslint to lint TypeScript files.
  * **rimraf**: helper library to easily delete build and dist directories.
  * **source-map-support**: provides source map support for stack traces in node.
  * **ts-loader**: is used to compile TypeScript to JavaScript.
  * **ts-node**: is used to execute TypeScript files with its JIT transformation.
  We mostly use this package to run tests written in TypeScript.
  * **tsconfig-paths**: is used to load modules specified in the `paths` section of `tsconfig.json`.
  This package is mostly invoked before running tests written in TypeScript.
