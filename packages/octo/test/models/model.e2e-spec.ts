import {
  App,
  DependencyRelationship,
  Deployment,
  DiffAction,
  Environment,
  Execution,
  Image,
  Pipeline,
  Region,
  Server,
  Service,
  Subnet,
  type UnknownModel,
} from '../../src/index.js';
import { TestAnchor, TestModelWithoutUnsynth, TestOverlay } from '../helpers/test-classes.js';

describe('Model E2E Test', () => {
  describe('common functions', () => {
    const app = new App('test');
    const image = new Image('image', '0.0.1', {
      dockerfilePath: '/Dockerfile',
    });
    app.addImage(image);
    const pipeline = new Pipeline('pipeline');
    app.addPipeline(pipeline);
    const region = new Region('region');
    app.addRegion(region);
    const server = new Server('backend');
    app.addServer(server);
    const deployment = new Deployment('v1');
    server.addDeployment(deployment);
    const service = new Service('service');
    app.addService(service);
    const subnet = new Subnet(region, 'public');
    region.addSubnet(subnet);
    const environment = new Environment('qa');
    region.addEnvironment(environment);
    const execution = new Execution(deployment, environment, subnet);

    const testCases: {
      model: UnknownModel;
      synth?: any;
    }[] = [
      {
        model: app,
      },
      {
        model: deployment,
      },
      {
        model: environment,
      },
      {
        model: execution,
      },
      {
        model: image,
      },
      {
        model: pipeline,
      },
      {
        model: region,
      },
      {
        model: server,
      },
      {
        model: service,
      },
      {
        model: subnet,
      },
    ];

    describe.each(testCases)('Test $model.MODEL_NAME', (data) => {
      it('getAncestors()', () => {
        expect(data.model.getAncestors().map((m) => m.getContext())).toMatchSnapshot();
      });

      it('getBoundaryMembers()', () => {
        expect(data.model.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
      });

      it('getChildren()', () => {
        expect(Object.keys(data.model.getChildren())).toMatchSnapshot();
      });

      it('getContext()', () => {
        expect(data.model.getContext()).toMatchSnapshot();
      });

      it('getParents()', () => {
        expect(Object.keys(data.model.getParents())).toMatchSnapshot();
      });

      it('synth()', () => {
        if (data.model.MODEL_NAME === 'service') {
          expect(() => {
            data.model.synth();
          }).toThrowErrorMatchingSnapshot();
        } else {
          expect(data.model.synth()).toMatchSnapshot();
        }
      });
    });
  });

  describe('addRelationship()', () => {
    it('should create a bi-directional relationship', () => {
      const app = new App('app');
      const region = new Region('region');
      app.addRegion(region);
      const service = new Service('service');
      app.addService(service);

      service.addRelationship(region);

      const serviceSiblings = service.getSiblings();
      expect(
        Object.keys(serviceSiblings).map((k) => serviceSiblings[k].map((m) => m.to.getContext())),
      ).toMatchSnapshot();

      const regionSiblings = region.getSiblings();
      expect(Object.keys(regionSiblings).map((k) => regionSiblings[k].map((m) => m.to.getContext()))).toMatchSnapshot();
    });

    it('should be allowed to add parent-child behavior to relationship', () => {
      const app = new App('app');
      const region = new Region('region');
      app.addRegion(region);
      const service = new Service('service');
      app.addService(service);

      const dependencies = service.addRelationship(region);
      dependencies[0].addBehavior('serviceId', DiffAction.ADD, 'regionId', DiffAction.ADD);

      const serviceRegionDependency = service.getSiblings()['region'][0];
      expect(serviceRegionDependency.hasMatchingBehavior('serviceId', DiffAction.ADD, 'regionId', DiffAction.ADD)).toBe(
        true,
      );
    });
  });

  describe('getAncestors()', () => {
    it('should not include children as ancestor', () => {
      const app = new App('app');
      const region = new Region('region-0');
      app.addRegion(region);
      const environment = new Environment('env-0');
      region.addEnvironment(environment);

      expect(region.getAncestors().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should not include sibling dependency as ancestor without explicit behavior', () => {
      const app = new App('app');
      const region = new Region('region');
      app.addRegion(region);
      const service = new Service('service');
      app.addService(service);

      service.addRelationship(region);

      expect(service.getAncestors().map((m) => m.getContext())).toMatchSnapshot();
      expect(region.getAncestors().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should include sibling dependency as ancestor with explicit behavior', () => {
      const app = new App('app');
      const region = new Region('region');
      app.addRegion(region);
      const service = new Service('service');
      app.addService(service);

      const dependencies = service.addRelationship(region);
      dependencies[0].addBehavior('serviceId', DiffAction.ADD, 'regionId', DiffAction.ADD);

      expect(service.getAncestors().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should include parent of parent as ancestors', () => {
      const app = new App('app');
      const region = new Region('region-0');
      app.addRegion(region);
      const environment = new Environment('env-0');
      region.addEnvironment(environment);

      expect(environment.getAncestors().map((m) => m.getContext())).toMatchSnapshot();
    });
  });

  describe('getBoundaryMembers()', () => {
    it('should demonstrate how boundaries can explode because of a common model', () => {
      const app = new App('test-app');
      const region1 = new Region('region-1');
      app.addRegion(region1);
      const region2 = new Region('region-2');
      app.addRegion(region2);
      const environment = new Environment('qa');

      // 2 regions, ideally on different boundaries, are merged together because of one common model.
      region1.addEnvironment(environment);
      region2.addEnvironment(environment);

      expect(region1.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should not include non-dependents in boundary', () => {
      const app = new App('test-app');
      const image = new Image('image', '0.0.1', {
        dockerfilePath: '/Dockerfile',
      });
      app.addImage(image);
      const region = new Region('region');
      app.addRegion(region);

      // Just adding a server won't correlate to region. Create an execution in order to correlate.
      const server = new Server('server');
      app.addServer(server);

      expect(region.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should include models in boundary after they are added as dependents', () => {
      const app = new App('test-app');
      const image = new Image('test', 'test', { dockerfilePath: 'Dockerfile' });
      app.addImage(image);
      const region = new Region('region');
      app.addRegion(region);
      const subnet = new Subnet(region, 'subnet');
      region.addSubnet(subnet);
      const environment = new Environment('qa');
      region.addEnvironment(environment);
      const server = new Server('server');
      app.addServer(server);
      const deployment = new Deployment('deployment');
      server.addDeployment(deployment);
      new Execution(deployment, environment, subnet);

      expect(region.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
      expect(server.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should include sibling dependency in boundary', () => {
      const app = new App('app');
      const region = new Region('region');
      app.addRegion(region);
      const service = new Service('service');
      app.addService(service);

      service.addRelationship(region);

      expect(region.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
    });

    it("should include sibling's sibling in boundary", () => {
      const app = new App('app');
      const image = new Image('imageName', 'imageTag', {
        dockerfilePath: 'path/to/Dockerfile',
      });
      app.addImage(image);
      const region1 = new Region('region-1');
      app.addRegion(region1);
      const region2 = new Region('region-2');
      app.addRegion(region2);

      region1.addRelationship(image);
      region2.addRelationship(image);

      expect(region1.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should not include overlays in boundary', () => {
      const app = new App('app');
      const anchor = new TestAnchor('test-anchor', {}, app);
      const overlay = new TestOverlay('test-overlay', {}, [anchor]);

      expect(overlay.getBoundaryMembers().map((m) => m.getContext())).toMatchInlineSnapshot(`[]`);
      expect(app.getBoundaryMembers().map((m) => m.getContext())).toMatchInlineSnapshot(`
        [
          "app=app",
        ]
      `);
    });

    describe('Circular Dependencies', () => {
      it('should throw error on one level of circular dependency', () => {
        const app = new App('test-app');
        const region = new Region('region');

        expect(() => {
          app.addRegion(region);
          region.addChild('regionId', app, 'name');
          app.getBoundaryMembers();
        }).toThrowErrorMatchingInlineSnapshot(`"Found circular dependencies!"`);
      });

      it('should throw error on two levels of circular dependency', () => {
        const app = new App('test-app');
        const region = new Region('region');
        const environment = new Environment('qa');

        expect(() => {
          app.addRegion(region);
          region.addEnvironment(environment);
          environment.addChild('environmentName', app, 'name');
          app.getBoundaryMembers();
        }).toThrowErrorMatchingInlineSnapshot(`"Found circular dependencies!"`);
      });
    });
  });

  describe('getAnchorByParent()', () => {
    it('should get anchor using default parent', () => {
      const app = new App('test');
      const anchor1_0 = new TestAnchor('anchor-1', {}, app);
      app['anchors'].push(anchor1_0);

      const anchor1_1 = app.getAnchorByParent('anchor-1')!;
      expect(anchor1_1.anchorId).toBe(anchor1_0.anchorId);
    });

    it('should get anchor using specified parent', () => {
      const app = new App('test');
      const anchor1_0 = new TestAnchor('anchor-1', {}, app);
      app['anchors'].push(anchor1_0);
      const overlay1 = new TestOverlay('overlay-1', {}, [anchor1_0]);

      const anchor1_1 = overlay1.getAnchorByParent('anchor-1', app)!;
      expect(anchor1_1.anchorId).toBe(anchor1_0.anchorId);
    });
  });

  describe('getDependency()', () => {
    it('should get a dependency with relationship', () => {
      const app = new App('test');
      const region = new Region('region');
      app.addRegion(region);

      const appDependencyWithRegion = app.getDependency(region, DependencyRelationship.PARENT);
      expect(appDependencyWithRegion).not.toBe(undefined);

      const regionDependencyWithApp = region.getDependency(app, DependencyRelationship.CHILD);
      expect(regionDependencyWithApp).not.toBe(undefined);
    });

    it('should get a dependency without relationship', () => {
      const app = new App('test');
      const region = new Region('region');
      app.addRegion(region);
      const image = new Image('test', '0.0.1', { dockerfilePath: 'docker' });
      app.addImage(image);
      image.addRelationship(region);

      const imageDependencyWithRegion = image.getDependency(region, undefined);
      expect(imageDependencyWithRegion).not.toBe(undefined);

      const regionDependencyWithImage = region.getDependency(image, undefined);
      expect(regionDependencyWithImage).not.toBe(undefined);
    });
  });

  describe('remove()', () => {
    it('should throw error when model being a parent cannot be removed', () => {
      const app = new App('app');
      const region = new Region('region');
      app.addRegion(region);

      expect(() => {
        app.remove(true);
      }).toThrowErrorMatchingInlineSnapshot(`"Cannot remove model until dependent models exist!"`);
    });

    it('should throw error when model having a direct relationship cannot be removed', () => {
      const app = new App('app');
      const region = new Region('region');
      app.addRegion(region);
      const subnet = new Subnet(region, 'subnet');
      region.addSubnet(subnet);

      expect(() => {
        region.remove();
      }).toThrowErrorMatchingInlineSnapshot(`"Cannot remove model until dependent models exist!"`);
    });

    it('should be able to remove leaf model', () => {
      const app = new App('app');
      const region = new Region('region');
      app.addRegion(region);

      expect(app.getChild('region', [{ key: 'regionId', value: 'region' }])).not.toBe(undefined);
      region.remove();
      expect(app.getChild('region', [{ key: 'regionId', value: 'region' }])).toBe(undefined);
    });

    it('should not be able to remove leaf model with a direct relationship', () => {
      const app = new App('app');
      const image = new Image('image', 'tag', { dockerfilePath: '/Dockerfile' });
      app.addImage(image);
      const server = new Server('server');
      app.addServer(server);
      server.addRelationship(image);

      // Image cannot be removed until server is removed.
      expect(() => {
        image.remove();
      }).toThrowErrorMatchingInlineSnapshot(`"Cannot remove model until dependent models exist!"`);

      // Remove server.
      server.remove(true);

      // Remove image.
      image.remove();
      expect(app.getChild('image', [{ key: 'imageTag', value: 'tag' }])).toBe(undefined);
    });
  });

  describe('removeRelationship()', () => {
    it('should be able to remove relationship', () => {
      const app = new App('app');
      const region = new Region('region');
      app.addRegion(region);
      const image = new Image('image', 'tag', { dockerfilePath: '/Dockerfile' });
      app.addImage(image);
      image.addRelationship(region);

      // Image cannot be removed since it has a relationship with region.
      expect(() => {
        image.remove();
      }).toThrowErrorMatchingInlineSnapshot(`"Cannot remove model until dependent models exist!"`);

      image.removeRelationship(region);

      // Remove image.
      image.remove();
      expect(app.getChild('image', [{ key: 'imageTag', value: 'tag' }])).toBe(undefined);
    });
  });

  describe('unSynth()', () => {
    it('should throw error if model does not override unSynth()', async () => {
      await expect(async () => {
        await TestModelWithoutUnsynth.unSynth();
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Method not implemented! Use derived class implementation"`);
    });
  });
});
