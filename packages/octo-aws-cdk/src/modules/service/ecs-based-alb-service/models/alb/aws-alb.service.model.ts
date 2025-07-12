import { Model, Service, Validate } from '@quadnix/octo';
import { AwsAlbServiceSchema } from './aws-alb.service.schema.js';

/**
 * @internal
 */
@Model<AwsAlbService>('@octo', 'service', AwsAlbServiceSchema)
export class AwsAlbService extends Service {
  @Validate({ options: { maxLength: 32, minLength: 2, regex: /^(?!internal)[a-zA-Z0-9][\w-]*[a-zA-Z0-9]$/ } })
  readonly albName: string;

  constructor(albName: AwsAlbServiceSchema['albName']) {
    super(`${albName}-alb`);

    this.albName = albName;
  }

  override synth(): AwsAlbServiceSchema {
    return {
      albName: this.albName,
      serviceId: this.serviceId,
    };
  }

  static override async unSynth(alb: AwsAlbServiceSchema): Promise<AwsAlbService> {
    return new AwsAlbService(alb.albName);
  }
}
