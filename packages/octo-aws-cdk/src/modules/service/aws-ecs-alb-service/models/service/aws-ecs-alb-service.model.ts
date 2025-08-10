import { AModel, Model, Service, type Subnet, Validate } from '@quadnix/octo';
import { AwsEcsAlbServiceSchema } from './aws-ecs-alb-service.schema.js';

/**
 * @internal
 */
@Model<AwsEcsAlbService>('@octo', 'service', AwsEcsAlbServiceSchema)
export class AwsEcsAlbService extends Service {
  @Validate({ options: { maxLength: 32, minLength: 2, regex: /^(?!internal)[a-zA-Z0-9][\w-]*[a-zA-Z0-9]$/ } })
  readonly albName: string;

  constructor(albName: AwsEcsAlbServiceSchema['albName'], subnets: Subnet[]) {
    super(`${albName}-alb`);

    this.albName = albName;

    for (const subnet of subnets) {
      subnet.addChild('subnetId', this, 'serviceId');
    }
  }

  override setContext(): string | undefined {
    const parents = this.getParents();
    const app = parents['app']?.[0]?.to;
    const subnets = parents['subnet']?.map((d) => d.to as Subnet) || [];
    if (!app || subnets.length === 0) {
      return undefined;
    }
    return [`${Service.NODE_NAME}=${this.serviceId}`, ...subnets.map((s) => s.getContext()), app.getContext()].join(
      ',',
    );
  }

  override synth(): AwsEcsAlbServiceSchema {
    const parents = this.getParents();
    const subnets = parents['subnet'].map((d) => d.to as Subnet);

    return {
      albName: this.albName,
      serviceId: this.serviceId,
      subnets: subnets.map((s) => ({ context: s.getContext() })),
    };
  }

  static override async unSynth(
    service: AwsEcsAlbServiceSchema,
    deReferenceContext: (context: string) => Promise<AModel<any, any>>,
  ): Promise<AwsEcsAlbService> {
    const subnets = (await Promise.all(service.subnets.map((s) => deReferenceContext(s.context)))) as Subnet[];
    return new AwsEcsAlbService(service.albName, subnets);
  }
}
