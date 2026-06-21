import {
  ATerraformResource,
  type Diff,
  DiffUtility,
  Resource,
  ResourceError,
  type TerraformModuleScope,
} from '@quadnix/octo';
import { EcrImageSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<EcrImage>('@octo', 'ecr-image', EcrImageSchema)
export class EcrImage extends ATerraformResource<EcrImageSchema, EcrImage> {
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

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const ecrImageOctoResource = terraform.addOctoTerraformResource(this as EcrImage, {
      provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
    });

    const ecrImageTFResource = ecrImageOctoResource.addTerraformResource('aws_ecr_repository', this.resourceId, {
      force_delete: true,
      image_scanning_configuration: { scan_on_push: false },
      image_tag_mutability: 'IMMUTABLE',
      name: this.properties.imageId,
    });

    const ecrAuthToken = terraform.addTerraformData('aws_ecr_authorization_token', this.resourceId, {
      registry_id: terraform.raw(`${ecrImageTFResource.address}.registry_id`),
    });

    ecrImageOctoResource.output(
      {
        authorizationToken: ecrAuthToken.ref('authorization_token'),
        proxyEndpoint: ecrAuthToken.ref('proxy_endpoint'),
        registryId: terraform.raw(`${ecrImageTFResource.address}.registry_id`),
        repositoryArn: terraform.raw(`${ecrImageTFResource.address}.arn`),
        repositoryName: terraform.raw(`${ecrImageTFResource.address}.name`),
        repositoryUri: terraform.raw(`${ecrImageTFResource.address}.repository_url`),
      },
      { sensitiveKeys: ['authorizationToken'] },
    );

    if (Object.keys(this.tags).length > 0) {
      ecrImageTFResource.attribute('tags', this.tags);
    }
  }
}
