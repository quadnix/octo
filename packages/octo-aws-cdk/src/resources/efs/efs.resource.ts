import { ATerraformResource, Diff, DiffAction, DiffUtility, Resource, type TerraformModuleScope } from '@quadnix/octo';
import { EfsSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<Efs>('@octo', 'efs', EfsSchema)
export class Efs extends ATerraformResource<EfsSchema, Efs> {
  declare properties: EfsSchema['properties'];
  declare response: EfsSchema['response'];

  constructor(resourceId: string, properties: EfsSchema['properties'], parents: []) {
    super(resourceId, properties, parents);
  }

  override async diffProperties(previous: Efs): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      return [
        new Diff(
          this,
          DiffAction.REPLACE,
          'resourceId',
          this.getContext(),
          'efs properties are identity; a change recreates it',
        ),
      ];
    }

    return [];
  }

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const efsOctoResource = terraform.addOctoTerraformResource(this as Efs, {
      provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
    });

    const efsTFResource = efsOctoResource.addTerraformResource('aws_efs_file_system', this.resourceId, {
      encrypted: false,
      performance_mode: 'generalPurpose',
      throughput_mode: 'bursting',
    });
    efsOctoResource.output({
      FileSystemArn: terraform.raw(`${efsTFResource.address}.arn`),
      FileSystemId: terraform.raw(`${efsTFResource.address}.id`),
    });

    efsOctoResource.addTerraformResource('aws_efs_backup_policy', `${this.resourceId}_backup_policy`, {
      backup_policy: { status: 'DISABLED' },
      file_system_id: terraform.raw(`${efsTFResource.address}.id`),
    });

    const tags =
      Object.keys(this.tags).length > 0
        ? { Name: this.properties.filesystemName, ...this.tags }
        : { Name: this.properties.filesystemName };
    efsTFResource.attribute('tags', tags);
  }
}
