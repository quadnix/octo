#!/bin/sh

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

msg=${{ github.event.pull_request.title }}
if ! [[ "$msg" =~ $PATTERN_COMMITS ]]; then
  echo -e "\x1b[31mPR title: \x1b[0m \x1b[33m"$msg"\x1b[0m s not valid! Please see regex in \".github/jobs/validate-pr-title.sh\".' \x1b[33m"
  exit 1;
fi
