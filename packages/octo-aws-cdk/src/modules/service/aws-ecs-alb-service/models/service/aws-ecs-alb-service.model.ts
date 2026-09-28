import { type AModel, Model, Service, ServiceType, type Subnet, Validate } from '@quadnix/octo';
import { AwsEcsAlbServiceSchema } from './aws-ecs-alb-service.schema.js';

/**
 * @internal
 */
@Model<AwsEcsAlbService>('@octo', 'service', AwsEcsAlbServiceSchema)
export class AwsEcsAlbService extends Service {
  @Validate({ options: { maxLength: 32, minLength: 2, regex: /^(?!internal)[a-zA-Z0-9][\w-]*[a-zA-Z0-9]$/ } })
  readonly albName: string;

  /**
   * @internal
   */
  constructor(albName: AwsEcsAlbServiceSchema['albName'], subnets: Subnet[]) {
    super(`${albName}-alb`, subnets, ServiceType.LOAD_BALANCER, 'alb');

    this.albName = albName;
  }

  /**
   * @internal
   */
  static override async unSynth(
    service: AwsEcsAlbServiceSchema,
    deReferenceContext: (context: string) => Promise<AModel<any, any>>,
  ): Promise<AwsEcsAlbService> {
    const subnets = (await Promise.all(service.parents.map((p) => deReferenceContext(p.context)))) as Subnet[];
    return new AwsEcsAlbService(service.albName, subnets);
  }

  /**
   * @internal
   */
  override synth(): AwsEcsAlbServiceSchema {
    return {
      ...super.synth(),
      albName: this.albName,
    };
  }
}
