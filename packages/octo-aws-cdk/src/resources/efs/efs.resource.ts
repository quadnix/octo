import { Diff, DiffUtility, Resource, ResourceError } from '@quadnix/octo';
import { OctoTerraform, type OctoTerraformFactory } from '../../factories/octo-terraform.factory.js';
import { ATFResource } from '../tf-resource.abstract.js';
import { EfsSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<Efs>('@octo', 'efs', EfsSchema)
export class Efs extends ATFResource<EfsSchema, Efs> {
  declare properties: EfsSchema['properties'];
  declare response: EfsSchema['response'];

  constructor(resourceId: string, properties: EfsSchema['properties'], parents: []) {
    super(resourceId, properties, parents);
  }

  override async diffProperties(previous: Efs): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      throw new ResourceError('Cannot update EFS immutable properties once it has been created!', this);
    }

    return super.diffProperties(previous);
  }

  override async toHCL(): Promise<void> {
    const octoTerraform = await this.container.get<OctoTerraform, typeof OctoTerraformFactory>(OctoTerraform, {
      metadata: { package: '@octo' },
    });

    const efsOctoResource = octoTerraform.addOctoTerraformResource(this as Efs);

    const efsTFResource = efsOctoResource.addTerraformResource('aws_efs_file_system', this.resourceId, {
      encrypted: false,
      performance_mode: 'generalPurpose',
      throughput_mode: 'bursting',
    });
    efsOctoResource.output({
      FileSystemArn: octoTerraform.raw(`${efsTFResource.address}.arn`),
      FileSystemId: octoTerraform.raw(`${efsTFResource.address}.id`),
    });

    efsOctoResource.addTerraformResource('aws_efs_backup_policy', `${this.resourceId}_backup_policy`, {
      backup_policy: { status: 'DISABLED' },
      file_system_id: octoTerraform.raw(`${efsTFResource.address}.id`),
    });

    const tags =
      Object.keys(this.tags).length > 0
        ? { Name: this.properties.filesystemName, ...this.tags }
        : { Name: this.properties.filesystemName };
    efsTFResource.attribute('tags', tags);
  }
}
