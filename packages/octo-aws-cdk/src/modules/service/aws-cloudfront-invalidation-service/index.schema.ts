import { Schema, type Service, ServiceSchema, Validate } from '@quadnix/octo';
import { AwsCloudFrontAnchorSchema } from '../../../anchors/aws-cloudfront/aws-cloudfront.anchor.schema.js';
import { AwsS3StorageServiceAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';

/**
 * `AwsCloudFrontInvalidationServiceModuleSchema` is the input schema for the `AwsCloudFrontInvalidationServiceModule`
 * module. It names a distribution, and one bucket that distribution serves.
 *
 * @group Modules/Service/AwsCloudFrontInvalidationService
 *
 * @hideconstructor
 *
 * @see {@link AwsCloudFrontInvalidationServiceModule} to learn more about the `AwsCloudFrontInvalidationServiceModule` module.
 */
export class AwsCloudFrontInvalidationServiceModuleSchema {
  /**
   * The distribution whose edges drop the bucket's files: a service produced by
   * `AwsCloudFrontServiceModule`.
   */
  @Validate<unknown>([
    {
      options: {
        isModel: { anchors: [{ schema: AwsCloudFrontAnchorSchema }], NODE_NAME: 'service' },
      },
    },
    {
      destruct: (value: AwsCloudFrontInvalidationServiceModuleSchema['cloudFront']): [ServiceSchema] => [value.synth()],
      options: { isSchema: { schema: ServiceSchema } },
    },
  ])
  cloudFront = Schema<Service>();

  /**
   * The bucket whose files are dropped when they change: a service produced by
   * `AwsS3StorageServiceModule`, and an origin of `cloudFront`.
   */
  @Validate<unknown>([
    {
      options: {
        isModel: { anchors: [{ schema: AwsS3StorageServiceAnchorSchema }], NODE_NAME: 'service' },
      },
    },
    {
      destruct: (value: AwsCloudFrontInvalidationServiceModuleSchema['source']): [ServiceSchema] => [value.synth()],
      options: { isSchema: { schema: ServiceSchema } },
    },
  ])
  source = Schema<Service>();
}
