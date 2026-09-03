# Where to look

The kinds of disagreement between a page and the tool that previous runs have hit. Each names a
place to look and a way to find out. What was found and fixed is in the git history; this file
stays about detection, and gets shorter as often as it gets longer.

## Captured output drifts

A page quotes what the tool printed the day it was written, and the tool moves. Watch for a key
added to a response, a paragraph the reporter now emits, and a marker whose meaning changed because
the page's own example reached a second pass.

**How:** diff every printed block against your run, character by character. Never assume a
difference is your setup.

## Output the tool never produced

Worse than stale, because it cannot be reproduced. A page can document a feature into existence by
quoting a line the tool has no code to print.

**How:** grep `packages/` for any literal string a block claims the tool emits.

## An example that cannot run

Code that compiles in the author's head. Protected constructors on abstract bases are the repeat
offender: a subclass needs a public one, and a listing that omits it fails on the `new` two
sections later.

**How:** type the code out and build it. `pnpm run check:docs-code` proves a block parses. It does
not prove the block compiles, or that it can run.

## Dead code in a worked example

An example that demonstrates a method by comparing something the method can never see. A property
the resource id is derived from is the usual case: two resources cannot differ in it, so the
comparison never runs.

**How:** for each branch, ask what input would reach it, then produce that input.

## A generator that writes something else

**How:** run every `create-*` command and list the files. Check `src/index.ts` too: the generators
maintain it, and a construct missing from it does not exist as far as octo is concerned.

## An input named but not given

The most expensive kind, because the reader can neither proceed nor guess. Nested object inputs and
values that have to be assembled by hand are where it happens.

**How:** for every module in the catalog, write its definition-file entry using only the page. An
input you cannot fill from the page is a finding.

## A default that does not work

**How:** run the happy path with only the required inputs, then check the result does something. An
apply finishing means the resources exist, not that they work.

## A grant that grants nothing

An action placed in a statement whose Resource it can never be evaluated against.

**How:** `aws iam simulate-principal-policy`, on the allowed case and the denied case. See
`verification.md`.

## An identity derived from too little

A derived id that omits part of what makes the thing distinct collides the moment two of them exist.
Resource ids, overlay ids, and anchor ids are all derived.

**How:** load every module twice, with inputs that differ only in the part you suspect is missing.

## An error that names the wrong thing

Every documented message is a claim, and the ones that wrap another error are where the useful half
gets dropped.

**How:** break things on purpose and read what a user sees, including the fields after the message,
not just the line the page quotes.

## A version claim with a shelf life

**How:** compare `npm view @quadnix/<pkg> version` against what the scaffold installs, and against
every version number a page states.
