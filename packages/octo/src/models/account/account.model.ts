import { strict as assert } from 'assert';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { ModelError } from '../../errors/index.js';
import { Image } from '../image/image.model.js';
import { AModel } from '../model.abstract.js';
import { Pipeline } from '../pipeline/pipeline.model.js';
import { Region } from '../region/region.model.js';
import { Server } from '../server/server.model.js';
import { Service } from '../service/service.model.js';
import { AccountSchema, AccountType } from './account.schema.js';

type AwsCredentials = {
  readonly accessKeyId: string;

  readonly secretAccessKey: string;
};

@Model<Account>('@octo', 'account', AccountSchema)
export class Account extends AModel<AccountSchema, Account> {
  readonly accountId: string;

  readonly accountType: AccountType;

  constructor(accountType: AccountType, accountId: string) {
    super();

    this.accountId = accountId;
    this.accountType = accountType;
  }

  /**
   * To add an {@link Image}.
   */
  addImage(image: Image): void {
    const childrenDependencies = this.getChildren('image');
    if (!childrenDependencies['image']) childrenDependencies['image'] = [];

    // Check for duplicates.
    const images = childrenDependencies['image'].map((d) => d.to);
    if (images.find((i: Image) => i.imageId === image.imageId)) {
      throw new ModelError('Image already exists!', this);
    }
    this.addChild('accountId', image, 'imageId');
  }

  /**
   * To add a {@link Pipeline}.
   */
  addPipeline(pipeline: Pipeline): void {
    const childrenDependencies = this.getChildren('pipeline');
    if (!childrenDependencies['pipeline']) childrenDependencies['pipeline'] = [];

    // Check for duplicates.
    const pipelines = childrenDependencies['pipeline'].map((d) => d.to);
    if (pipelines.find((p: Pipeline) => p.pipelineName === pipeline.pipelineName)) {
      throw new ModelError('Pipeline already exists!', this);
    }
    this.addChild('accountId', pipeline, 'pipelineName');
  }

  /**
   * To add a {@link Region}.
   */
  addRegion(region: Region): void {
    const childrenDependencies = this.getChildren('region');
    if (!childrenDependencies['region']) childrenDependencies['region'] = [];

    // Check for duplicates.
    const regions = childrenDependencies['region'].map((d) => d.to);
    if (regions.find((r: Region) => r.regionId === region.regionId)) {
      throw new ModelError('Region already exists!', this);
    }
    this.addChild('accountId', region, 'regionId');
  }

  /**
   * To add a {@link Server}.
   */
  addServer(server: Server): void {
    const childrenDependencies = this.getChildren('server');
    if (!childrenDependencies['server']) childrenDependencies['server'] = [];

    // Check for duplicates.
    const servers = childrenDependencies['server'].map((d) => d.to);
    if (servers.find((s: Server) => s.serverKey === server.serverKey)) {
      throw new ModelError('Server already exists!', this);
    }
    this.addChild('accountId', server, 'serverKey');
  }

  /**
   * To add a {@link Service}.
   */
  addService(service: Service): void {
    const childrenDependencies = this.getChildren('service');
    if (!childrenDependencies['service']) childrenDependencies['service'] = [];

    // Check for duplicates.
    const services = childrenDependencies['service'].map((d) => d.to);
    if (services.find((s: Service) => s.serviceId === service.serviceId)) {
      throw new ModelError('Service already exists!', this);
    }
    this.addChild('accountId', service, 'serviceId');
  }

  isAwsCredentials(credentials: ReturnType<Account['getCredentials']>): credentials is AwsCredentials {
    return credentials.hasOwnProperty('accessKeyId') && credentials.hasOwnProperty('secretAccessKey');
  }

  getCredentials(): object {
    throw new ModelError('Method not implemented! Use subclass', this);
  }

  override setContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${(this.constructor as typeof Account).NODE_NAME}=${this.accountId}`, app.getContext()].join(',');
  }

  override synth(): AccountSchema {
    return {
      accountId: this.accountId,
      accountType: this.accountType,
    };
  }

  static override async unSynth(
    account: AccountSchema,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Account> {
    assert(!!deReferenceContext);

    return new Account(account.accountType, account.accountId);
  }
}
