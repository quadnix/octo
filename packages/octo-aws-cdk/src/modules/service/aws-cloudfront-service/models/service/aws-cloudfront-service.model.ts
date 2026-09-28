import { type AModel, type Account, Model, Service, ServiceType, Validate } from '@quadnix/octo';
import { AwsCloudFrontServiceSchema } from './aws-cloudfront-service.schema.js';

/**
 * @internal
 */
@Model<AwsCloudFrontService>('@octo', 'service', AwsCloudFrontServiceSchema)
export class AwsCloudFrontService extends Service {
  @Validate({ options: { maxLength: 64, minLength: 2, regex: /^[a-zA-Z0-9][\w-]*[a-zA-Z0-9]$/ } })
  readonly distributionName: string;

  /**
   * @internal
   */
  constructor(distributionName: AwsCloudFrontServiceSchema['distributionName'], account: Account) {
    super(`${distributionName}-cloudfront`, [account], ServiceType.GATEWAY, 'cloudfront');

    this.distributionName = distributionName;
  }

  /**
   * @internal
   */
  static override async unSynth(
    service: AwsCloudFrontServiceSchema,
    deReferenceContext: (context: string) => Promise<AModel<any, any>>,
  ): Promise<AwsCloudFrontService> {
    const account = (await deReferenceContext(service.parents[0].context)) as Account;
    return new AwsCloudFrontService(service.distributionName, account);
  }

  /**
   * @internal
   */
  override synth(): AwsCloudFrontServiceSchema {
    return {
      ...super.synth(),
      distributionName: this.distributionName,
    };
  }
}
