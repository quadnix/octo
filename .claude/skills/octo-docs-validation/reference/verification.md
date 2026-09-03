# Proving a claim, rather than watching a command succeed

An apply that finishes means the resources exist. It does not mean they do what the page said. These
are the techniques that have caught something.

## IAM grants

`aws iam simulate-principal-policy` evaluates a policy the way AWS will, without needing to assume
the role. Test the allowed case and the denied case; a grant that allows everything passes the first
and fails the second.

```bash
ROLE=arn:aws:iam::<account>:role/ServerRole-checkout
chk() {
  aws iam simulate-principal-policy --policy-source-arn "$ROLE" \
    --action-names "$1" --resource-arns "$2" \
    --query 'EvaluationResults[0].EvalDecision' --output text
}
chk s3:PutObject "arn:aws:s3:::shop-receipts/uploads/x"   # allowed
chk s3:GetObject "arn:aws:s3:::shop-receipts/secrets/x"   # implicitDeny
```

A bucket-level action needs its condition context supplied, and this is what proved `s3:ListBucket`
was dead:

```bash
for pfx in "uploads/" "secrets/" ""; do
  aws iam simulate-principal-policy --policy-source-arn "$ROLE" \
    --action-names s3:ListBucket --resource-arns "arn:aws:s3:::shop-receipts" \
    --context-entries "ContextKeyName=s3:prefix,ContextKeyType=string,ContextKeyValues=$pfx" \
    --query 'EvaluationResults[0].EvalDecision' --output text
done
```

Quote the `--context-entries` argument as one shell word or the CLI misreads it as a resource.

## A container that is supposed to run

`aws ecs describe-services` reporting the service as `ACTIVE` says nothing about whether a task
started. Wait for `runningCount`, and read `stoppedReason` when it does not arrive.

```bash
until [ "$(aws ecs describe-services --cluster <cluster> --services <svc> --region <r> \
  --query 'services[0].runningCount' --output text)" = "1" ]; do sleep 15; done
```

```bash
aws ecs describe-tasks --cluster <cluster> --region <r> --tasks <arn> \
  --query 'tasks[0].{last:lastStatus,reason:stoppedReason}' --output json
```

`ResourceInitializationError ... cannot pull registry auth from Amazon ECR` means the task has no
route out: no egress rule, no public IP, or no NAT.

## A policy that is supposed to be attached to a queue or bucket

Read it back from the provider and compare the statements, not the fact that a policy exists.

```bash
aws sqs get-queue-attributes --queue-url <url> --attribute-names Policy \
  --region <r> --query 'Attributes.Policy' --output text | python3 -m json.tool
aws s3api get-bucket-policy --bucket <b> --region <r> --query Policy --output text | python3 -m json.tool
```

## A website that is supposed to answer

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://<bucket>.s3-website-<region>.amazonaws.com
curl -s -o /dev/null -w "%{http_code}\n" http://<bucket>.s3-website-<region>.amazonaws.com/nope
```

The second should be the error document's status, which is what the module's `error_document`
bought. A 403 for both usually means account-level S3 Block Public Access.

## Generated terraform, without credentials

The fastest loop while a resource is being written, and it needs no AWS at all:

```bash
cd .octo-tf/<moduleId>
terraform init -backend=false
terraform validate
```

Catches an argument name typo, a block that should have been a map attribute, and a missing required
argument.

## Octo's own state

The claims Fundamentals makes about `.octo/` are checkable directly. Every JSON excerpt on a page
should match the real key set and nesting.

```bash
node -e "const j=require('fs').readFileSync('.octo/models.json','utf8');
  console.log(Object.keys(JSON.parse(j).data))"
node -e "const j=JSON.parse(require('fs').readFileSync('.octo/resources-actual.json','utf8'));
  console.log(Object.keys(j.data.resources))"
```

## A module, without any cloud at all

The harness from `building-modules/testing-a-module` runs the real lifecycle in memory with
`terraformTarget: 'skip'`. It exercises everything octo owns, in milliseconds, and it belongs in the
example project rather than only in `packages/`.

```bash
cd ../octo-examples/shop-example && npm test
```

## Errors

Every documented error message is a claim. Make each one fire and read what a user sees, including
the stack trace and the structured fields, not just the message the page quotes.

```bash
OCTO_DEFINITION_FILE_PATH=octo.test.yaml node_modules/.bin/octo generate -o /tmp/errtest
```

Keep the broken definition in a scratch file rather than editing `octo.yaml`, so the project stays
in a known state.
