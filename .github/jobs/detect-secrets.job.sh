#!/bin/bash

: '
Fails when a value the redaction rules forbid reaches a tracked file.

This repository is public, and its e2e suites run against a live AWS account, so captured output
carries values that identify it. The rules under
"packages/octo-templates/src/utilities/redaction/rules" are the whole of what counts, and are the
same rules the jest snapshot serializer applies, so a new cloud is one rule file rather than a
second copy of its patterns here.

The scan itself is "repository-secrets.spec.ts", which is why this runs after the install rather
than in the PR quality gate.
'
pnpm --filter @quadnix/octo-templates run test:secrets
