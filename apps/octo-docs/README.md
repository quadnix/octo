# octo-docs

The source of the documentation site at [octo.quadnix.com](https://octo.quadnix.com/), built with
Docusaurus 3. Pages follow `docs/DOCUMENTATION-STANDARDS.md` at the repository root. Nothing in this
repository deploys it.

This app manages its own dependencies.

---

## A — Run the site locally

```sh
pnpm install
pnpm run start
```

## B — Build the API reference

The API pages are generated from the packages' JSDoc by the ported `typedoc-api` plugin, which needs
`octo-aws-cdk`'s index files to exist while it runs:

```sh
pnpm run plugin:pre-script
pnpm run plugin:build
pnpm run build
pnpm run plugin:post-script
```

## C — Upgrade Docusaurus

1. Update the dependencies in `package.json`.
2. Re-swizzle the theme components; each one under `src/theme/*/index.tsx` names its own reference.
