import {
  type AAnchor,
  App,
  Container,
  Deployment,
  Environment,
  Execution,
  Image,
  OverlayService,
  Pipeline,
  Region,
  Server,
  Service,
  Subnet,
  type UnknownModel,
  type UnknownOverlay,
  type UnknownResource,
} from '../../src/index.js';
import { ResourceDataRepository } from '../../src/resources/resource-data.repository.js';
import { ModelSerializationService } from '../../src/services/serialization/model/model-serialization.service.js';
import { ResourceSerializationService } from '../../src/services/serialization/resource/resource-serialization.service.js';
import { SharedTestResource, TestOverlay, TestResource } from './test-classes.js';

export async function commit<T extends UnknownModel>(model: T): Promise<T> {
  const modelSerializationService = await Container.get(ModelSerializationService);
  return (await modelSerializationService.deserialize(await modelSerializationService.serialize(model))) as T;
}

export async function commitResources(): Promise<void> {
  const resourceSerializationService = await Container.get(ResourceSerializationService);
  const actualSerializedResources = await resourceSerializationService.serializeActualResources();
  const oldSerializedResources = await resourceSerializationService.serializeNewResources();
  await resourceSerializationService.deserialize(actualSerializedResources, oldSerializedResources);
}

export function create({
  app = [],
  deployment = [],
  environment = [],
  execution = [],
  image = [],
  pipeline = [],
  region = [],
  server = [],
  service = [],
  subnet = [],
}: {
  app?: (string | undefined)[];
  deployment?: (string | undefined)[];
  environment?: (string | undefined)[];
  execution?: (string | undefined)[];
  image?: (string | undefined)[];
  pipeline?: (string | undefined)[];
  region?: (string | undefined)[];
  server?: (string | undefined)[];
  service?: (string | undefined)[];
  subnet?: (string | undefined)[];
}): {
  app: App[];
  deployment: Deployment[];
  environment: Environment[];
  execution: Execution[];
  image: Image[];
  pipeline: Pipeline[];
  region: Region[];
  server: Server[];
  service: Service[];
  subnet: Subnet[];
} {
  const result: ReturnType<typeof create> = {
    app: [],
    deployment: [],
    environment: [],
    execution: [],
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

  for (const [index, entry] of image.entries()) {
    if (entry === undefined) {
      continue;
    }
    const [id, i] = splitEntry(entry, index);

    const image = new Image(id, 'v1', { dockerfilePath: '/Dockerfile' });
    const app = result.app[i];
    app.addImage(image);
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
    result.pipeline.push(pipeline);
  }

  for (const [index, entry] of region.entries()) {
    if (entry === undefined) {
      continue;
    }
    const [id, i] = splitEntry(entry, index);

    const region = new Region(id);
    const app = result.app[i];
    app.addRegion(region);
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
    const app = result.app[i];
    app.addServer(server);
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
    const app = result.app[i];
    app.addService(service);
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

export async function createTestOverlays(overlays: { [key: string]: AAnchor[] }): Promise<UnknownOverlay[]> {
  const overlayService = await Container.get(OverlayService);
  const result: UnknownOverlay[] = [];

  for (const [overlayId, anchors] of Object.entries(overlays)) {
    const overlay = new TestOverlay(overlayId, {}, anchors);
    overlayService.addOverlay(overlay);

    result.push(overlay);
  }

  return result;
}

export async function createTestResources(
  resources: { [key: string]: (UnknownResource | string)[] },
  sharedResources: { [key: string]: (UnknownResource | string)[] } = {},
): Promise<UnknownResource[]> {
  const resourceDataRepository = await Container.get(ResourceDataRepository);
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
