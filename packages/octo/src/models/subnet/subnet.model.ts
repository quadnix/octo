import { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { AModel } from '../model.abstract.js';
import { Region } from '../region/region.model.js';
import { ISubnet } from './subnet.interface.js';

@Model()
export class Subnet extends AModel<ISubnet, Subnet> {
  readonly MODEL_NAME: string = 'subnet';

  readonly subnetId: string;

  constructor(region: Region, name: string) {
    super();

    this.subnetId = region.regionId + '-' + name;
  }

  getContext(): string {
    const parents = this.getParents();
    const region = parents['region'][0].to;
    return [`${this.MODEL_NAME}=${this.subnetId}`, region.getContext()].join(',');
  }

  synth(): ISubnet {
    const parents = this.getParents();
    const region = parents['region'][0].to as Region;

    return {
      region: { context: region.getContext() },
      subnetId: this.subnetId,
    };
  }

  static override async unSynth(
    subnet: ISubnet,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Subnet> {
    const region = (await deReferenceContext(subnet.region.context)) as Region;
    return new Subnet(region, subnet.subnetId);
  }
}
