import { strict as assert } from 'assert';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { Validate } from '../../decorators/validate.decorator.js';
import { ModelError } from '../../errors/index.js';
import { Image } from '../image/image.model.js';
import { AModel } from '../model.abstract.js';
import { Pipeline } from '../pipeline/pipeline.model.js';
import { Region } from '../region/region.model.js';
import { Server } from '../server/server.model.js';
import { Service } from '../service/service.model.js';
import type { IApp } from './app.interface.js';

/**
 * An App model is the parent of all other models.
 * It represents the main app for whom the infrastructure is being created.
 *
 * @example
 * ```ts
 * const app = new App('MyApp');
 * ```
 * @group Models
 * @see Definition of [Default Models](/docs/fundamentals/models#default-models).
 */
@Model()
export class App extends AModel<IApp, App> {
  readonly NODE_NAME: string = 'app';

  /**
   * The name of the app.
   */
  @Validate({ options: { maxLength: 64, minLength: 2, regex: /^[a-zA-Z][\w-]*[a-zA-Z0-9]$/ } })
  readonly name: string;

  constructor(name: string) {
    super();
    this.name = name;
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
    this.addChild('name', image, 'imageId');
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
    this.addChild('name', pipeline, 'pipelineName');
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
    this.addChild('name', region, 'regionId');
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
    this.addChild('name', server, 'serverKey');
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
    this.addChild('name', service, 'serviceId');
  }

  override setContext(): string {
    return `${this.NODE_NAME}=${this.name}`;
  }

  override synth(): IApp {
    return {
      name: this.name,
    };
  }

  static override async unSynth(
    app: IApp,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<App> {
    assert(!!deReferenceContext);

    return new App(app.name);
  }
}
