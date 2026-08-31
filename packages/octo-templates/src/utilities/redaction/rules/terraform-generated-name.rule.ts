import type { IRedactionRule } from '../redaction.utility.js';

/**
 * A name terraform generates for a resource declared with `name_prefix`, e.g.
 * `terraform-1928412261f614d06a14a8017f`.
 *
 * The suffix is terraform's own unique id, minted per apply, so it names a different string every
 * time the resource is recreated. Detected rather than replaced, for the reason
 * [AWS_RESOURCE_ID_RULE](./aws-resource-id.rule.ts) gives.
 */
export const TERRAFORM_GENERATED_NAME_RULE: IRedactionRule = {
  name: 'Terraform generated name',
  patterns: [/\bterraform-[0-9a-f]{20,32}\b/g],
  placeholders: [],
  token: null,
};
