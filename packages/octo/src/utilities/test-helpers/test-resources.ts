import { type Constructable, NodeType, type UnknownResource, type UnknownSharedResource } from '../../app.type.js';
import { Container } from '../../functions/container/container.js';
import { ResourceDataRepository } from '../../resources/resource-data.repository.js';
import { AResource } from '../../resources/resource.abstract.js';
import type { BaseResourceSchema } from '../../resources/resource.schema.js';
import { ASharedResource } from '../../resources/shared-resource.abstract.js';
import { ResourceSerializationService } from '../../services/serialization/resource/resource-serialization.service.js';

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

function createSharedResource(nodeName: string): Constructable<ASharedResource<any, any>> {
  return class extends ASharedResource<BaseResourceSchema, any> {
    static override readonly NODE_NAME: string = nodeName;
    static override readonly NODE_PACKAGE: string = '@octo';
    static override readonly NODE_SCHEMA = {};
    static override readonly NODE_TYPE: NodeType = NodeType.SHARED_RESOURCE;

    constructor(
      resourceId: string,
      properties: BaseResourceSchema['properties'] = {},
      parents: UnknownResource[] = [],
    ) {
      super(resourceId, properties, parents);
    }
  };
}

export async function createTestResources(
  args: {
    NODE_TYPE?: NodeType;
    parents?: string[] | UnknownResource[];
    properties?: { [key: string]: unknown };
    resourceContext: string;
    response?: { [key: string]: unknown };
  }[],
  options?: { save?: boolean },
): Promise<{ [key: string]: UnknownResource | UnknownSharedResource }> {
  const container = Container.getInstance();
  const [resourceDataRepository, resourceSerializationService] = await Promise.all([
    container.get(ResourceDataRepository),
    container.get(ResourceSerializationService),
  ]);
  const resources: {
    [key: string]: UnknownResource | [Promise<UnknownResource>, (value: UnknownResource) => UnknownResource];
  } = {};

  const deReferenceResource = async (context: string): Promise<UnknownResource> => {
    return resourceDataRepository.getActualResourceByContext(context)!;
  };

  return args.reduce(async (accumulator: Promise<{ [key: string]: UnknownResource }>, arg) => {
    const { NODE_TYPE, parents, properties, resourceContext, response } = arg;
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

    const Resource =
      (NODE_TYPE || NodeType.RESOURCE) === NodeType.RESOURCE
        ? createResource(NODE_NAME)
        : createSharedResource(NODE_NAME);
    Object.defineProperty(Resource, 'name', { value: NODE_NAME });
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
    resourceDataRepository.addNewResource(resource);
    if (options?.save) {
      const resourceClone = await AResource.cloneResource(resource, deReferenceResource);
      resourceDataRepository.addActualResource(resourceClone);
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
