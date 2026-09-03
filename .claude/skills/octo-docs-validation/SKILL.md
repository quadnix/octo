---
name: octo-docs-validation
description: Validate octo's documentation by running it. Read every page under apps/octo-docs/docs in sidebar order, build what it says in ../octo-examples against real AWS, and fix whatever disagrees - in the docs, in packages/, or in both. Use when asked to validate, verify, audit, or re-run the docs, to check a page against the code, or after a release that changes a documented surface.
---

# Validating octo's documentation by running it

A documentation bug and a code bug look identical from the outside: the page says one thing and the
tool does another. Reading cannot tell them apart, and neither can a test, because a test asserts
what the author believed. Running the pages as a reader would is the only thing that does.

You are that reader. The page is the specification; the tool is the thing under test.

## The stance

**The page is right until the tool proves otherwise.** Type what it says, in the order it says,
with the values it gives. When the result differs from the page, you have found something. Decide
afterwards which side was wrong.

**Do not read `packages/` to work out what a page meant.** A reader cannot. If the page does not
tell you the shape of an input, that is a finding; write it down, *then* look at the source to get
unstuck, and fix the page so the next reader does not have to.

**Apply a normal amount of sense.** A page that says "your own bucket name, not this one" means pick
another. It does not mean invent a different lifecycle.

**Finish the page even when it breaks.** A blocked step is one finding, not the end of the run. Note
it, work around it, keep going. Only a bug needing an unpublished release can stop a page, and even
then the other pages continue.

## Before you start

Read these, in this order:

1. `docs/DOCUMENTATION-STANDARDS.md` - the authority for every doc change you make. Its checklist at
   the end is not optional.
2. `apps/octo-docs/sidebars.ts` - the reader's order. Follow it exactly.
3. `../octo-examples/runs/` - the newest file. It says what the last run covered, what it found, and
   what it left undone. Start from what it left undone.

Then confirm the account is empty, because a leftover from a previous run will read as drift:

```bash
aws sts get-caller-identity
aws s3 ls
aws ec2 describe-vpcs --region eu-west-1 --filters Name=isDefault,Values=false --query 'Vpcs[].VpcId'
aws ecs list-clusters --region eu-west-1
aws ecr describe-repositories --region eu-west-1 --query 'repositories[].repositoryName'
```

## Where the work happens

`../octo-examples`, a git repository with no remote that is **never deleted**. It holds one project
per walkthrough, and its tags are the record of which versions each run exercised.

It carries a real AWS account number in committed state and generated terraform, on purpose: those
files are the evidence. `.git/hooks/pre-push` refuses to push. Do not add a remote, and do not
redact the account number out of the example - redact only when output reaches a page, which
`DOCUMENTATION-STANDARDS.md` covers.

`reference/workflow.md` has the setup, the run cycle, and the commit and tag protocol.

## What a run does

For each page, in sidebar order:

1. **Do what it says.** Every command, every file, every value.
2. **Compare every block it prints** against what you got. Captured output drifts silently: a key
   added to a response, a paragraph the reporter now emits, a marker that changed meaning.
3. **Test the claim, not just the command.** A page that says a grant is scoped to one directory is
   claiming something about IAM, and `aws iam simulate-principal-policy` will tell you whether it is
   true. `reference/verification.md` has the techniques that have actually caught things.
4. **Record the finding**, then fix it: the page under `DOCUMENTATION-STANDARDS.md`, the code under
   `docs/CODING-STANDARDS.md`, or both.
5. **Destroy what you created** before moving on, or at the end of the page group. Verify against
   the provider rather than trusting the report.

`reference/findings.md` is where to look, sorted by the kind of disagreement. Read it before
starting a page group: these classes repeat, and knowing them is most of the skill.

## Fixing

- A code fix ships with the doc change it forces, in one commit. `DOCUMENTATION-STANDARDS.md` has
  the map from surface to owner page.
- Run the full suite for every package you touched, and check that **each commit** is green, not
  only the tip. Snapshots that hold two unrelated fixes have to be split.
- A behaviour change that is genuinely a judgment call - a default that is unsafe either way, a
  contract that would widen - is reported, not decided. Say what you would do and why, and let the
  user rule.
- Once something is fixed, the fix is the record. Do not carry it forward in
  `reference/findings.md`, in a run record, or in a memory: a list of solved problems makes every
  later run read more to learn less. Keep the class and how to catch it, and let the commit hold
  the instance.
- Never publish a package. Never push. If a fix needs a release before a page can be finished, say
  so and move on.

## Finishing

1. Confirm the account is empty, with the same sweep you opened with.
2. Leave both example projects in the resting state the teardown pages describe: every
   infrastructure-producing module commented out, `.octo/` describing an app with nothing in it.
3. Write `../octo-examples/runs/<date>.md` and tag it `validated/<date>`. `reference/workflow.md`
   has the shape.
4. Report: what was covered, what was found, what was fixed, what needs a ruling, and what is still
   not covered.

## Coverage

`reference/coverage.md` tracks which pages have been run and which have not. Update it as part of
the run. A page nobody has executed is worth more than a page executed twice.

## What does not need running here

The goal is that every surface is exercised somewhere, not that this skill exercises all of them.
A page already covered by something that runs is covered; chasing it again costs a run and proves
nothing new.

- **`octo-templates` package tests.** They run the real lifecycle against a real account, including
  drift and incremental cases. A claim those suites already assert does not need repeating.
- **`using-octo/troubleshooting`.** Its messages surface on their own as infrastructure gets built,
  and each one met that way is worth more than one forced. Check the entry for any message you
  actually hit, and correct it then. Do not invent a scenario to trigger the rest.
- **`techniques/github-actions-pipeline`.** Not to be exercised yet. `apps/octo-docs` releases
  through a pipeline of the same shape, so the arrangement is not untried. What is worth checking
  from here is the part that breaks silently: the field names its comment script reads out of the
  report JSON.
- **`building-modules/publishing-a-library`.** Needs a registry and a second consuming project.
  Deferred until there is a real library to publish.
- **Anything that bills by the hour** with no question attached to it. A NAT gateway or a load
  balancer is worth creating to answer something, not to tick a page.

Record these as covered elsewhere rather than as gaps, and say where. A page listed as open should
be one nothing exercises, because that list is the reason to read this file.
