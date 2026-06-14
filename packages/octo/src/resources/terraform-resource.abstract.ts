import type { UnknownResource } from '../app.type.js';
import type { TerraformModuleScope } from '../services/terraform/terraform.service.js';
import { AResource } from './resource.abstract.js';
import type { BaseResourceSchema } from './resource.schema.js';

/**
 * Base class for resources whose lifecycle is managed by Terraform.
 *
 * Subclasses implement `toHCL()` to contribute terraform resource blocks and outputs.
 * Octo invokes `toHCL()` automatically while generating terraform files.
 * The received scope is bound to the module folder this resource belongs to.
 *
 * Terraform resources cannot have resource actions; registering one throws.
 *
 * @group Resources
 */
export abstract class ATerraformResource<S extends BaseResourceSchema, T extends UnknownResource> extends AResource<
  S,
  T
> {
  abstract toHCL(terraform: TerraformModuleScope): Promise<void> | void;
}
