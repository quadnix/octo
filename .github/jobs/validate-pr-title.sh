#!/bin/bash

: '
Release Definitions
====
- chore: no release. Internal update.
- major / minor / patch: release as per https://semver.org/

Release Category Matrix
====
| category | chore | patch | minor | major |
|----------|-------|-------|-------|-------|
| docs     | Y     | N     | N     | N     |
| feat     | Y     | Y     | Y     | Y     |
| fix      | Y     | Y     | Y     | Y     |
| refactor | Y     | Y     | N     | N     |
| release  | Y     | N     | N     | N     |
| revert   | Y     | Y     | Y     | Y     |
| test     | Y     | Y     | N     | N     |
'
PATTERN_COMMITS='^(chore|major|minor|patch)\((docs|feat|fix|refactor|release|revert|test)\):\ .+\.$'

title=$1
if ! [[ "$title" =~ $PATTERN_COMMITS ]]; then
  echo "ERROR: PR title \"$title\" is not valid! Please see regex in \".github/jobs/validate-pr-title.sh\"."
  exit 1;
fi
