#!/bin/bash

: '
Fails when a real AWS account number reaches a tracked file.

This repository is public, and its e2e suites run against a live AWS account, so captured output
carries that account in ARNs, node contexts, terraform provider aliases, and account-owner fields.
The jest snapshot serializer in "packages/octo-templates" redacts snapshots; this is the net that
catches every other path in.

Matching is PCRE, so the allowed numbers are excluded per match rather than per line: a line holding
a placeholder and a real account is still caught. It also refuses to read the first twelve digits of
a longer number as an account.

Allowed twelve-digit numbers:
- <AWS_ACCOUNT_ID>  the snapshot serializer token
- 123456789012      the documentation placeholder
- 123456789123      the scaffold and .env.defaults placeholder
- 999999999999      the second account in the definition file docs
- 000000000000      terragrunt mock outputs
'
PATTERN_PREFIX='(arn:aws[[:alnum:]-]*:[^:\s]*:[^:\s]*:|account=|aws\._|:oidc-provider/|:assumed-role/)'
PATTERN_ALLOWED='(?!123456789012|123456789123|999999999999|000000000000)'
PATTERN_ACCOUNT_ID="${PATTERN_PREFIX}${PATTERN_ALLOWED}[0-9]{12}(?![0-9])"

if ! git grep -qP '' -- . >/dev/null 2>&1; then
  echo "ERROR: this git is built without PCRE support, so \"git grep -P\" cannot run."
  exit 1
fi

matches=$(git grep -InP "$PATTERN_ACCOUNT_ID" -- . ':(exclude)*.lock' ':(exclude)pnpm-lock.yaml')

if [[ -n "$matches" ]]; then
  echo "ERROR: an AWS account number was found in a tracked file."
  echo "Redact it before committing, and see \".github/jobs/detect-aws-account-id.job.sh\" for the allowed placeholders."
  echo ""
  echo "$matches"
  exit 1
fi

echo "No AWS account numbers found in tracked files."
