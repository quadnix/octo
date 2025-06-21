import { type Constructable, type IUnknownResourceAction, NodeType, type UnknownResource } from '../../app.type.js';
import { Container } from '../../functions/container/container.js';
import { ResourceDataRepository } from '../../resources/resource-data.repository.js';
import { AResource } from '../../resources/resource.abstract.js';
import type { BaseResourceSchema } from '../../resources/resource.schema.js';
import { ResourceSerializationService } from '../../services/serialization/resource/resource-serialization.service.js';
import { TransactionService } from '../../services/transaction/transaction.service.js';
import { NodeUtility } from '../node/node.utility.js';

export async function commitResources({
  skipAddActualResource = false,
}: {
  skipAddActualResource?: boolean;
} = {}): Promise<void> {
  const container = Container.getInstance();
  const [resourceDataRepository, resourceSerializationService] = await Promise.all([
    container.get(ResourceDataRepository),
    container.get(ResourceSerializationService),
  ]);

  if (!skipAddActualResource) {
    const deReferenceResource = async (context: string): Promise<UnknownResource> => {
      return resourceDataRepository.getActualResourceByContext(context)!;
    };

    const sortedNewResources = NodeUtility.sortResourcesByDependency(
      resourceDataRepository.getNewResourcesByProperties(),
    );
    for (const resource of sortedNewResources) {
      const resourceClone = await AResource.cloneResource(resource, deReferenceResource);
      resourceDataRepository.addActualResource(resourceClone);
    }
  }

  const actualSerializedResources = await resourceSerializationService.serializeActualResources();
  const oldSerializedResources = await resourceSerializationService.serializeNewResources();
  await resourceSerializationService.deserialize(actualSerializedResources, oldSerializedResources);
}

function createResource(nodeName: string): Constructable<AResource<any, any>> {
  return class extends AResource<BaseResourceSchema, any> {
    static override readonly NODE_NAME: string = nodeName;
    static override readonly NODE_PACKAGE: string = '@octo';
    static override readonly NODE_SCHEMA = {};
    static override readonly NODE_TYPE: NodeType = NodeType.RESOURCE;

    constructor(
      resourceId: string,
      properties: BaseResourceSchema['properties'] = {},
      parents: UnknownResource[] = [],
    ) {
      super(resourceId, properties, parents);
    }
  };
}

export async function createResources(
  args: UnknownResource[],
  options?: { save?: boolean },
): Promise<{ [key: string]: UnknownResource }> {
  const container = Container.getInstance();
  const [resourceDataRepository, resourceSerializationService] = await Promise.all([
    container.get(ResourceDataRepository),
    container.get(ResourceSerializationService),
  ]);

  const deReferenceResource = async (context: string): Promise<UnknownResource> => {
    return resourceDataRepository.getActualResourceByContext(context)!;
  };

  const resources: { [key: string]: UnknownResource } = {};
  for (const resource of args) {
    resourceDataRepository.addNewResource(resource);
    if (options?.save) {
      const resourceClone = await AResource.cloneResource(resource, deReferenceResource);
      const rIndex = resourceDataRepository['actualResources'].findIndex((r) => r.resourceId === resource.resourceId);
      if (rIndex === -1) {
        resourceDataRepository.addActualResource(resourceClone);
      } else {
        resourceDataRepository['actualResources'][rIndex] = resourceClone.merge(
          resourceDataRepository['actualResources'][rIndex],
        );
      }
    }

    const resourceClassName = `${(resource.constructor as typeof AResource).NODE_PACKAGE}/${resource.constructor.name}`;
    try {
      resourceSerializationService.registerClass(resourceClassName, resource.constructor);
    } catch (error) {
      if (error.message !== `Class "${resourceClassName}" is already registered!`) {
        throw error;
      }
    }

    resources[`${resourceClassName}=${resource.resourceId}`] = resource;
  }

  return resources;
}

export async function createTestResources<S extends BaseResourceSchema[]>(
  args: {
    [K in keyof S]: Partial<Pick<S[K], 'properties' | 'response' | 'tags'>> & {
      parents?: string[] | UnknownResource[];
      resourceActions?: IUnknownResourceAction[];
      resourceContext: string;
    };
  },
  options?: { save?: boolean },
): Promise<{ [key: string]: AResource<S[number], any> }> {
  const container = Container.getInstance();
  const [resourceDataRepository, resourceSerializationService, transactionService] = await Promise.all([
    container.get(ResourceDataRepository),
    container.get(ResourceSerializationService),
    container.get(TransactionService),
  ]);
  const resources: {
    [key: string]: UnknownResource | [Promise<UnknownResource>, (value: UnknownResource) => UnknownResource];
  } = {};

  const deReferenceResource = async (context: string): Promise<UnknownResource> => {
    return resourceDataRepository.getActualResourceByContext(context)!;
  };

  return args.reduce(async (accumulator: Promise<{ [key: string]: UnknownResource }>, arg) => {
    const { parents, properties, resourceContext, response, tags } = arg;
    const [resourceMeta, resourceId] = resourceContext.split('=');
    const [, NODE_NAME] = resourceMeta.split('/');

    const parentsResolved = await Promise.all(
      (parents || []).map(async (p: UnknownResource | string): Promise<UnknownResource> => {
        if (typeof p === 'string') {
          const parentResource = resourceDataRepository.getNewResourceByContext(p);
          if (!parentResource) {
            if (!resources.hasOwnProperty(p)) {
              let promiseResolve: (value: UnknownResource) => UnknownResource;
              const promise = new Promise<UnknownResource>((resolve) => {
                promiseResolve = resolve as (value: UnknownResource) => UnknownResource;
              });
              resources[p] = [promise, promiseResolve!];
              return promise;
            } else {
              return resources[p][0];
            }
          } else {
            return Promise.resolve(parentResource);
          }
        }
        return Promise.resolve(p);
      }),
    );

    const Resource = createResource(NODE_NAME);
    Object.defineProperty(Resource, 'name', { value: NODE_NAME });
    transactionService.registerResourceActions(Resource, arg.resourceActions || []);

    const resource = new Resource(resourceId, {}, parentsResolved);
    if (properties) {
      for (const [key, value] of Object.entries(properties)) {
        resource.properties[key] = value;
      }
    }
    if (response) {
      for (const [key, value] of Object.entries(response)) {
        resource.response[key] = value;
      }
    }
    if (tags) {
      for (const [key, value] of Object.entries(tags)) {
        resource.tags[key] = value;
      }
    }
    resourceDataRepository.addNewResource(resource);
    if (options?.save) {
      const resourceClone = await AResource.cloneResource(resource, deReferenceResource);
      const rIndex = resourceDataRepository['actualResources'].findIndex((r) => r.resourceId === resource.resourceId);
      if (rIndex === -1) {
        resourceDataRepository.addActualResource(resourceClone);
      } else {
        resourceDataRepository['actualResources'][rIndex] = resourceClone.merge(
          resourceDataRepository['actualResources'][rIndex],
        );
      }
    }

    const resourceClassName = `${(resource.constructor as typeof AResource).NODE_PACKAGE}/${resource.constructor.name}`;
    try {
      resourceSerializationService.registerClass(resourceClassName, Resource);
    } catch (error) {
      if (error.message !== `Class "${resourceClassName}" is already registered!`) {
        throw error;
      }
    }

    if (resources[resourceContext] && Array.isArray(resources[resourceContext])) {
      resources[resourceContext] = (resources[resourceContext][1] as (value: UnknownResource) => UnknownResource)(
        resource,
      );
    } else {
      resources[resourceContext] = resource;
    }

    return {
      ...(await accumulator),
      [resourceContext]: resource,
    };
  }, Promise.resolve({}));
}
