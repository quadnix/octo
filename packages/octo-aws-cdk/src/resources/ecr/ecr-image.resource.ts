import { type Diff, DiffUtility, Resource, ResourceError } from '@quadnix/octo';
import { OctoTerraform, type OctoTerraformFactory } from '../../factories/octo-terraform.factory.js';
import { ATFResource } from '../tf-resource.abstract.js';
import { EcrImageSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<EcrImage>('@octo', 'ecr-image', EcrImageSchema)
export class EcrImage extends ATFResource<EcrImageSchema, EcrImage> {
  declare properties: EcrImageSchema['properties'];
  declare response: EcrImageSchema['response'];

  constructor(resourceId: string, properties: EcrImageSchema['properties']) {
    super(resourceId, properties, []);
  }

  override async diffProperties(previous: EcrImage): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      throw new ResourceError('Cannot update ECR immutable properties once it has been created!', this);
    }

    return [];
  }

  override async toHCL(): Promise<void> {
    const octoTerraform = await this.container.get<OctoTerraform, typeof OctoTerraformFactory>(OctoTerraform, {
      metadata: { package: '@octo' },
    });

    const ecrImageOctoResource = octoTerraform.addOctoTerraformResource(this as EcrImage);

    const ecrImageTFResource = ecrImageOctoResource.addTerraformResource('aws_ecr_repository', this.resourceId, {
      force_delete: true,
      image_scanning_configuration: { scan_on_push: false },
      image_tag_mutability: 'IMMUTABLE',
      name: this.properties.imageId,
    });
    ecrImageOctoResource.output({
      registryId: octoTerraform.raw(`${ecrImageTFResource.address}.registry_id`),
      repositoryArn: octoTerraform.raw(`${ecrImageTFResource.address}.arn`),
      repositoryName: octoTerraform.raw(`${ecrImageTFResource.address}.name`),
      repositoryUri: octoTerraform.raw(`${ecrImageTFResource.address}.repository_url`),
    });

    if (Object.keys(this.tags).length > 0) {
      ecrImageTFResource.attribute('tags', this.tags);
    }
  }
}
