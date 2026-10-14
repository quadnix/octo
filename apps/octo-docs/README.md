# octo-docs

The documentation site at [octo.quadnix.com](https://octo.quadnix.com/), built with Docusaurus 3 and
deployed by Octo itself through `octo.yaml`. Pages follow `docs/DOCUMENTATION-STANDARDS.md` at the
repository root.

This app manages its own dependencies and pins released versions of the `@quadnix` packages.

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

## C — Release

Run the **Manual Documentation Release** workflow. It builds the site as above, then runs
`octo:generate`, `octo:validate`, `octo:lock`, `octo:apply` and `octo:commit`, and pushes the state
commit. An apply that would destroy anything is refused unless the run's **autoApprove** input is
set.

## D — Upgrade Docusaurus

1. Update the dependencies in `package.json`.
2. Re-swizzle the theme components; each one under `src/theme/*/index.tsx` names its own reference.

## Environment variables

`octo.yaml` declares a placeholder default for each value under `env`; the workflow overrides it.
The account-bearing ones are secrets, because the repository is public.

| Variable                                     | Set by                               | What it does                                                                  |
|----------------------------------------------|--------------------------------------|-------------------------------------------------------------------------------|
| `AWS_ACCOUNT_ID`                             | a repository secret                  | The account the site is deployed into.                                        |
| `AWS_CLOUDFRONT_CERTIFICATE_ARN`             | a repository secret                  | The certificate the site is served with.                                      |
| `AWS_S3_WEBSITE_BUCKET_NAME`                 | `octo.yaml`'s default                | The bucket the built site is uploaded to.                                     |
| `OCTO_STATE_ENCRYPTION_KEY`                  | a repository secret                  | Encrypts the site's state, held by `LocalEncryptionStateProvider` in `.octo`. |
| `AUTO_APPROVE`                               | the workflow's **autoApprove** input | `true` passes `--auto-approve` to `octo apply`, letting it destroy.           |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | repository secrets                   | The workflow's AWS credentials.                                               |
| `GH_TOKEN`                                   | a repository secret                  | Checkout, and pushing the state commit back to the branch.                    |
| `OCTO_DEFINITION_FILE_PATH`                  | every `octo:*` script                | `octo.yaml`, the definition every lifecycle command boots from.               |
