import type { Constructable, UnknownModel } from '../../app.type.js';
import { Container } from '../../functions/container/container.js';
import { getSchemaInstance } from '../../functions/schema/schema.js';
import { Account } from '../../models/account/account.model.js';
import { AccountSchema, AccountType } from '../../models/account/account.schema.js';
import { App } from '../../models/app/app.model.js';
import { AppSchema } from '../../models/app/app.schema.js';
import { Deployment } from '../../models/deployment/deployment.model.js';
import { DeploymentSchema } from '../../models/deployment/deployment.schema.js';
import { Environment } from '../../models/environment/environment.model.js';
import { EnvironmentSchema } from '../../models/environment/environment.schema.js';
import { Execution } from '../../models/execution/execution.model.js';
import { ExecutionSchema } from '../../models/execution/execution.schema.js';
import { Filesystem } from '../../models/filesystem/filesystem.model.js';
import { FilesystemSchema } from '../../models/filesystem/filesystem.schema.js';
import { Image } from '../../models/image/image.model.js';
import { ImageSchema } from '../../models/image/image.schema.js';
import { Pipeline } from '../../models/pipeline/pipeline.model.js';
import { PipelineSchema } from '../../models/pipeline/pipeline.schema.js';
import { Region } from '../../models/region/region.model.js';
import { RegionSchema } from '../../models/region/region.schema.js';
import { Server } from '../../models/server/server.model.js';
import { ServerSchema } from '../../models/server/server.schema.js';
import { Service } from '../../models/service/service.model.js';
import { ServiceSchema } from '../../models/service/service.schema.js';
import { Subnet } from '../../models/subnet/subnet.model.js';
import { SubnetSchema } from '../../models/subnet/subnet.schema.js';
import { ModelSerializationService } from '../../services/serialization/model/model-serialization.service.js';

export async function commit<T extends UnknownModel>(model: T): Promise<T> {
  const modelSerializationService = await Container.getInstance().get(ModelSerializationService);
  return (await modelSerializationService.deserialize(await modelSerializationService.serialize(model))) as T;
}

export function create({
  account = [],
  app = [],
  deployment = [],
  environment = [],
  execution = [],
  filesystem = [],
  image = [],
  pipeline = [],
  region = [],
  server = [],
  service = [],
  subnet = [],
}: {
  account?: (string | undefined)[];
  app?: (string | undefined)[];
  deployment?: (string | undefined)[];
  environment?: (string | undefined)[];
  execution?: (string | undefined)[];
  filesystem?: (string | undefined)[];
  image?: (string | undefined)[];
  pipeline?: (string | undefined)[];
  region?: (string | undefined)[];
  server?: (string | undefined)[];
  service?: ([string, Record<string, unknown>?] | undefined)[];
  subnet?: (string | undefined)[];
}): {
  account: Account[];
  app: App[];
  deployment: Deployment[];
  environment: Environment[];
  execution: Execution[];
  filesystem: Filesystem[];
  image: Image[];
  pipeline: Pipeline[];
  region: Region[];
  server: Server[];
  service: Service[];
  subnet: Subnet[];
} {
  const result: ReturnType<typeof create> = {
    account: [],
    app: [],
    deployment: [],
    environment: [],
    execution: [],
    filesystem: [],
    image: [],
    pipeline: [],
    region: [],
    server: [],
    service: [],
    subnet: [],
  };

  for (const entry of app) {
    if (entry === undefined) {
      continue;
    }

    const app = new App(entry);

    getSchemaInstance(AppSchema, app.synth());
    result.app.push(app);
  }

  for (const [index, entry] of account.entries()) {
    if (entry === undefined) {
      continue;
    }
    const [args, i] = splitEntry(entry, index);

    const [type, id] = args.split(',') as [AccountType, string];
    if (!Object.values(AccountType).includes(type) || !id) {
      throw new Error(`Invalid account arguments: ${args}`);
    }

    const account = new Account(type, id);
    const app = result.app[i];
    app.addAccount(account);

    getSchemaInstance(AccountSchema, account.synth());
    result.account.push(account);
  }

  for (const [index, entry] of image.entries()) {
    if (entry === undefined) {
      continue;
    }
    const [id, i] = splitEntry(entry, index);

    const imageParts = id.split('/');
    const imageFamily = imageParts.length > 1 ? imageParts[0] : 'test';
    const imageName = imageParts.length > 1 ? imageParts[1] : id;
    const image = new Image(imageFamily, imageName);
    const app = result.app[i];
    app.addImage(image);

    getSchemaInstance(ImageSchema, image.synth());
    result.image.push(image);
  }

  for (const [index, entry] of pipeline.entries()) {
    if (entry === undefined) {
      continue;
    }
    const [id, i] = splitEntry(entry, index);

    const pipeline = new Pipeline(id);
    const app = result.app[i];
    app.addPipeline(pipeline);

    getSchemaInstance(PipelineSchema, pipeline.synth());
    result.pipeline.push(pipeline);
  }

  for (const [index, entry] of region.entries()) {
    if (entry === undefined) {
      continue;
    }
    const [id, i] = splitEntry(entry, index);

    const region = new Region(id);
    const account = result.account[i];
    account.addRegion(region);

    getSchemaInstance(RegionSchema, region.synth());
    result.region.push(region);
  }

  for (const [index, entry] of environment.entries()) {
    if (entry === undefined) {
      continue;
    }
    const [id, i] = splitEntry(entry, index);

    const environment = new Environment(id);
    const region = result.region[i];
    region.addEnvironment(environment);

    getSchemaInstance(EnvironmentSchema, environment.synth());
    result.environment.push(environment);
  }

  for (const [index, entry] of filesystem.entries()) {
    if (entry === undefined) {
      continue;
    }
    const [id, i] = splitEntry(entry, index);

    const filesystem = new Filesystem(id);
    const region = result.region[i];
    region.addFilesystem(filesystem);

    getSchemaInstance(FilesystemSchema, filesystem.synth());
    result.filesystem.push(filesystem);
  }

  for (const [index, entry] of subnet.entries()) {
    if (entry === undefined) {
      continue;
    }
    const [id, i] = splitEntry(entry, index);

    const region = result.region[i];
    const subnet = new Subnet(region, id);
    region.addSubnet(subnet);

    getSchemaInstance(SubnetSchema, subnet.synth());
    result.subnet.push(subnet);
  }

  for (const [index, entry] of server.entries()) {
    if (entry === undefined) {
      continue;
    }
    const [id, i] = splitEntry(entry, index);

    const server = new Server(id);
    const app = result.app[i];
    app.addServer(server);

    getSchemaInstance(ServerSchema, server.synth());
    result.server.push(server);
  }

  for (const [index, entry] of deployment.entries()) {
    if (entry === undefined) {
      continue;
    }
    const [id, i] = splitEntry(entry, index);

    const deployment = new Deployment(id);
    const server = result.server[i];
    server.addDeployment(deployment);

    getSchemaInstance(DeploymentSchema, deployment.synth());
    result.deployment.push(deployment);
  }

  for (const [index, serviceEntry] of service.entries()) {
    if (serviceEntry === undefined) {
      continue;
    }
    const [entry, serviceProperties] = serviceEntry;
    const [id, i] = splitEntry(entry, index);
    const TestServiceClass = createTestServiceModel(id, serviceProperties || {});
    const service = new TestServiceClass();

    const app = result.app[i];
    app.addService(service);

    getSchemaInstance(ServiceSchema, service.synth());
    result.service.push(service);
  }

  for (const [index, entry] of execution.entries()) {
    if (entry === undefined) {
      continue;
    }
    const [, i1, i2, i3] = splitEntry(entry, index);

    const execution = new Execution(result.deployment[i1], result.environment[i2], result.subnet[i3]);

    getSchemaInstance(ExecutionSchema, execution.synth());
    result.execution.push(execution);
  }

  return result;
}

function createTestServiceModel(serviceId: string, properties: Record<string, unknown>): Constructable<Service> {
  const TestServiceClass = class extends Service {
    constructor() {
      super(serviceId);

      for (const key of Object.keys(properties)) {
        this[key] = properties[key];
      }
    }

    override synth(): ServiceSchema {
      return {
        ...properties,
        serviceId: this.serviceId,
      };
    }
  };
  TestServiceClass['unSynth'] = async (): Promise<Service> => {
    return new TestServiceClass();
  };
  return TestServiceClass;
}

function splitEntry(entry: string, currentIndex: number): [string, ...number[]] {
  const parts = entry.split(':');
  if (parts.length === 1) {
    return [parts[0], currentIndex];
  }
  return [parts[0], ...parts.slice(1).map((p) => currentIndex + Number(p))];
}
