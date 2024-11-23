import type { UnknownAnchor, UnknownModel, UnknownOverlay, UnknownResource } from '../../src/app.type.js';
import {
  Account,
  App,
  Container,
  Deployment,
  Environment,
  Execution,
  Filesystem,
  Image,
  Pipeline,
  Region,
  Server,
  Service,
  Subnet,
} from '../../src/index.js';
import { OverlayDataRepository } from '../../src/overlays/overlay-data.repository.js';
import { ResourceDataRepository } from '../../src/resources/resource-data.repository.js';
import { ModelSerializationService } from '../../src/services/serialization/model/model-serialization.service.js';
import { ResourceSerializationService } from '../../src/services/serialization/resource/resource-serialization.service.js';
import { SharedTestResource, TestOverlay, TestResource } from './test-classes.js';

export async function commit<T extends UnknownModel>(model: T): Promise<T> {
  const modelSerializationService = await Container.getInstance().get(ModelSerializationService);
  return (await modelSerializationService.deserialize(await modelSerializationService.serialize(model))) as T;
}

export async function commitResources({
  skipAddActualResource = false,
}: {
  skipAddActualResource?: boolean;
} = {}): Promise<void> {
  if (!skipAddActualResource) {
    const resourceDataRepository = await Container.getInstance().get(ResourceDataRepository);
    for (const resource of resourceDataRepository.getNewResourcesByProperties()) {
      resourceDataRepository.addActualResource(resource);
    }
  }

  const resourceSerializationService = await Container.getInstance().get(ResourceSerializationService);
  const actualSerializedResources = await resourceSerializationService.serializeActualResources();
  const oldSerializedResources = await resourceSerializationService.serializeNewResources();
  await resourceSerializationService.deserialize(actualSerializedResources, oldSerializedResources);
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
  service?: (string | undefined)[];
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
    result.app.push(app);
  }

  for (const [index, entry] of account.entries()) {
    if (entry === undefined) {
      continue;
    }
    const [id, i] = splitEntry(entry, index);

    const account = new Account(id);
    const app = result.app[i];
    app.addAccount(account);
    result.account.push(account);
  }

  for (const [index, entry] of image.entries()) {
    if (entry === undefined) {
      continue;
    }
    const [id, i] = splitEntry(entry, index);

    const image = new Image(id, 'v1', { dockerfilePath: '/Dockerfile' });
    const account = result.account[i];
    account.addImage(image);
    result.image.push(image);
  }

  for (const [index, entry] of pipeline.entries()) {
    if (entry === undefined) {
      continue;
    }
    const [id, i] = splitEntry(entry, index);

    const pipeline = new Pipeline(id);
    const account = result.account[i];
    account.addPipeline(pipeline);
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
    result.subnet.push(subnet);
  }

  for (const [index, entry] of server.entries()) {
    if (entry === undefined) {
      continue;
    }
    const [id, i] = splitEntry(entry, index);

    const server = new Server(id);
    const account = result.account[i];
    account.addServer(server);
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
    result.deployment.push(deployment);
  }

  for (const [index, entry] of service.entries()) {
    if (entry === undefined) {
      continue;
    }
    const [id, i] = splitEntry(entry, index);

    const service = new Service(id);
    const account = result.account[i];
    account.addService(service);
    result.service.push(service);
  }

  for (const [index, entry] of execution.entries()) {
    if (entry === undefined) {
      continue;
    }
    const [, i1, i2, i3] = splitEntry(entry, index);

    const execution = new Execution(result.deployment[i1], result.environment[i2], result.subnet[i3]);
    result.execution.push(execution);
  }

  return result;
}

export async function createTestOverlays(overlays: { [key: string]: UnknownAnchor[] }): Promise<UnknownOverlay[]> {
  const overlayDataRepository = await Container.getInstance().get(OverlayDataRepository);
  const result: UnknownOverlay[] = [];

  for (const [overlayId, anchors] of Object.entries(overlays)) {
    const overlay = new TestOverlay(overlayId, {}, anchors);
    overlayDataRepository.add(overlay);

    result.push(overlay);
  }

  return result;
}

export async function createTestResources(
  resources: { [key: string]: (UnknownResource | string)[] },
  sharedResources: { [key: string]: (UnknownResource | string)[] } = {},
): Promise<UnknownResource[]> {
  const resourceDataRepository = await Container.getInstance().get(ResourceDataRepository);
  const result: UnknownResource[] = [];

  for (const [resourceId, parentEntries] of Object.entries(resources)) {
    const parents = parentEntries.map((p) => {
      if (typeof p === 'string') {
        return result.find((r) => r.resourceId === p)!;
      }
      return p;
    });
    const resource = new TestResource(resourceId, {}, parents);
    resourceDataRepository.addNewResource(resource);

    result.push(resource);
  }

  for (const [resourceId, parentEntries] of Object.entries(sharedResources)) {
    const parents = parentEntries.map((p) => {
      if (typeof p === 'string') {
        return result.find((r) => r.resourceId === p)!;
      }
      return p;
    });
    const resource = new SharedTestResource(resourceId, {}, parents);
    resourceDataRepository.addNewResource(resource);

    result.push(resource);
  }

  return result;
}

function splitEntry(entry: string, currentIndex: number): [string, ...number[]] {
  const parts = entry.split(':');
  if (parts.length === 1) {
    return [parts[0], currentIndex];
  }
  return [parts[0], ...parts.slice(1).map((p) => currentIndex + Number(p))];
}
