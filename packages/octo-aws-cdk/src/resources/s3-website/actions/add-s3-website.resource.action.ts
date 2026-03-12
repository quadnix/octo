import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { OctoTerraform, type OctoTerraformFactory } from '../../../factories/octo-terraform.factory.js';
import { PolicyUtility } from '../../../utilities/policy/policy.utility.js';
import type { S3WebsiteSchema } from '../index.schema.js';
import { S3Website } from '../s3-website.resource.js';

/**
 * @internal
 */
@Action(S3Website)
export class AddS3WebsiteResourceAction implements IResourceAction<S3Website> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof S3Website &&
      hasNodeName(diff.node, 's3-website') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<S3Website>): Promise<S3WebsiteSchema['response']> {
    // Get properties.
    const s3Website = diff.node;
    const properties = s3Website.properties;

    // Get instances.
    const octoTerraform = await this.container.get<OctoTerraform, typeof OctoTerraformFactory>(OctoTerraform, {
      metadata: { package: '@octo' },
    });

    const s3WebsiteResource = octoTerraform.addOctoTerraformResource(diff.node);
    const bucketNameTerraformVariable = octoTerraform.variable(
      `${diff.node.resourceId}_website_bucket_name`,
      'string',
      {
        default: properties.Bucket,
        sensitive: false,
      },
    );

    // Create a new bucket.
    const s3WebsiteTerraformResource = s3WebsiteResource.addTerraformResource(
      'aws_s3_bucket',
      `${diff.node.resourceId}_website_bucket`,
    );
    s3WebsiteTerraformResource.attribute('bucket', bucketNameTerraformVariable.ref);
    const s3WebsiteArnTerraformResourceOutput = s3WebsiteTerraformResource.output(
      `${diff.node.resourceId}_website_bucket_arn`,
      octoTerraform.raw(`${s3WebsiteTerraformResource.address}.arn`),
    );

    // Add static website hosting to the bucket.
    const s3WebsiteConfigTerraformResource = s3WebsiteResource.addTerraformResource(
      'aws_s3_bucket_website_configuration',
      `${diff.node.resourceId}_website_bucket_config`,
    );
    s3WebsiteConfigTerraformResource.attribute('bucket', octoTerraform.raw(`${s3WebsiteTerraformResource.address}.id`));
    const s3WebsiteIndexDocumentTerraformBlock = s3WebsiteConfigTerraformResource.block('index_document');
    s3WebsiteIndexDocumentTerraformBlock.attribute('suffix', properties.IndexDocument);
    const s3WebsiteErrorDocumentTerraformBlock = s3WebsiteConfigTerraformResource.block('error_document');
    s3WebsiteErrorDocumentTerraformBlock.attribute('key', properties.ErrorDocument);

    // Configure static website to be accessible to public.
    const s3WebsitePublicAccessTerraformResource = s3WebsiteResource.addTerraformResource(
      'aws_s3_bucket_public_access_block',
      `${diff.node.resourceId}_website_bucket_public_access`,
    );
    s3WebsitePublicAccessTerraformResource.attribute(
      'bucket',
      octoTerraform.raw(`${s3WebsiteTerraformResource.address}.id`),
    );
    s3WebsitePublicAccessTerraformResource.attribute('block_public_acls', false);
    s3WebsitePublicAccessTerraformResource.attribute('block_public_policy', false);
    s3WebsitePublicAccessTerraformResource.attribute('ignore_public_acls', false);
    s3WebsitePublicAccessTerraformResource.attribute('restrict_public_buckets', false);

    // Allow bucket files to be read by everyone.
    const s3WebsitePublicReadPolicyTerraformResource = s3WebsiteResource.addTerraformResource(
      'aws_s3_bucket_policy',
      `${diff.node.resourceId}_website_bucket_public_read_policy`,
    );
    s3WebsitePublicReadPolicyTerraformResource.attribute(
      'bucket',
      octoTerraform.raw(`${s3WebsiteTerraformResource.address}.id`),
    );
    s3WebsitePublicReadPolicyTerraformResource.attribute(
      'policy',
      octoTerraform.jsonencode({
        Statement: [
          {
            Action: ['s3:GetObject'],
            Effect: 'Allow',
            Principal: '*',
            Resource: [octoTerraform.raw(`"\${${s3WebsiteTerraformResource.address}.arn}/*"`)],
            Sid: PolicyUtility.getSafeSid('PublicReadGetObject'),
          },
        ],
        Version: '2012-10-17',
      }),
    );

    const response = await octoTerraform.apply([
      s3WebsiteTerraformResource.address,
      s3WebsiteConfigTerraformResource.address,
      s3WebsitePublicAccessTerraformResource.address,
      s3WebsitePublicReadPolicyTerraformResource.address,
    ]);

    return {
      Arn: response[s3WebsiteArnTerraformResourceOutput.address] as string,
      awsRegionId: properties.awsRegionId,
    };
  }

  async mock(diff: Diff<S3Website>): Promise<S3WebsiteSchema['response']> {
    // Get properties.
    const s3Website = diff.node;
    const properties = s3Website.properties;

    return {
      Arn: `arn:aws:s3:::${properties.Bucket}`,
      awsRegionId: properties.awsRegionId,
    };
  }
}

/**
 * @internal
 */
@Factory<AddS3WebsiteResourceAction>(AddS3WebsiteResourceAction)
export class AddS3WebsiteResourceActionFactory {
  private static instance: AddS3WebsiteResourceAction;

  static async create(): Promise<AddS3WebsiteResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddS3WebsiteResourceAction(container);
    }
    return this.instance;
  }
}
