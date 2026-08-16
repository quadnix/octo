import type { UnknownResource } from '../app.type.js';
import { type Diff, DiffAction } from '../functions/diff/diff.js';
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
 * @example
 * ```ts
 * override async toHCL(terraform: TerraformModuleScope): Promise<void> {
 *   const scope = terraform.addOctoTerraformResource(this, {
 *     provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
 *   });
 *   const bucket = scope.addTerraformResource('aws_s3_bucket', this.resourceId, {
 *     bucket: this.properties.bucketName,
 *   });
 *   scope.output({ arn: terraform.raw(`${bucket.address}.arn`) });
 * }
 * ```
 *
 * @group Resources
 *
 * @see {@link TerraformModuleScope} for what `toHCL()` can emit.
 * @see Definition of [Resources](/docs/fundamentals/resources).
 */
export abstract class ATerraformResource<S extends BaseResourceSchema, T extends UnknownResource> extends AResource<
  S,
  T
> {
  /**
   * @internal
   */
  override async diffInverse(
    diff: Diff,
    deReferenceResource: (context: string) => Promise<UnknownResource>,
  ): Promise<void> {
    if (diff.action === DiffAction.VALIDATE) {
      return;
    }
    if (diff.field === 'resourceId' && diff.action === DiffAction.DELETE) {
      this.remove(true);
      return;
    }
    await this.cloneResourceInPlace(diff.node as T, deReferenceResource);
  }

  /**
   * Emits this resource as terraform.
   *
   * @param terraform The module folder to write into, already scoped to this resource's module.
   */
  abstract toHCL(terraform: TerraformModuleScope): Promise<void> | void;
}
