import {
  type AModel,
  App,
  DependencyRelationship,
  DiffAction,
  Environment,
  OverlayService,
  Region,
  TestContainer,
  type UnknownModel,
} from '../../src/index.js';
import { OverlayDataRepository } from '../../src/overlays/overlay-data.repository.js';
import { TestAnchor, TestModelWithoutUnsynth } from '../helpers/test-classes.js';
import { create, createTestOverlays } from '../helpers/test-models.js';

describe('Model E2E Test', () => {
  beforeEach(async () => {
    const overlayDataRepository = new OverlayDataRepository([]);
    const overlayService = new OverlayService(overlayDataRepository);

    await TestContainer.create(
      {
        mocks: [
          { type: OverlayDataRepository, value: overlayDataRepository },
          { type: OverlayService, value: overlayService },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );
  });

  describe('common functions', () => {
    const {
      app: [app],
      deployment: [deployment],
      environment: [environment],
      execution: [execution],
      filesystem: [filesystem],
      image: [image],
      pipeline: [pipeline],
      region: [region],
      server: [server],
      service: [service],
      subnet: [subnet1, subnet2],
    } = create({
      app: ['test'],
      deployment: ['v1'],
      environment: ['qa'],
      execution: [':0:0:0'],
      filesystem: ['filesystem'],
      image: ['image'],
      pipeline: ['pipeline'],
      region: ['region'],
      server: ['backend'],
      service: ['service'],
      subnet: ['public', 'private:-1'],
    });
    subnet1.updateNetworkingRules(subnet2, true);

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
        model: filesystem,
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
        model: subnet1,
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

      it('getSiblings()', () => {
        expect(Object.keys(data.model.getSiblings())).toMatchSnapshot();
      });

      it('synth()', () => {
        if ((data.model.constructor as typeof AModel).NODE_NAME === 'service') {
          expect(() => {
            data.model.synth();
          }).toThrowErrorMatchingSnapshot();
        } else {
          expect(data.model.synth()).toMatchSnapshot();
        }
      });
    });
  });

  describe('addChild()', () => {
    it('should throw error adding relationship to an already existing relationship', () => {
      const {
        app: [app],
        region: [region],
      } = create({ app: ['test'], region: ['region'] });

      expect(() => {
        app.addChild('name', region, 'regionId');
      }).toThrowErrorMatchingInlineSnapshot(`"Dependency relationship already exists!"`);

      expect(() => {
        region.addChild('regionId', app, 'name');
      }).toThrowErrorMatchingInlineSnapshot(`"Dependency relationship already exists!"`);
    });
  });

  describe('addRelationship()', () => {
    it('should be able to create duplicate relationships', () => {
      const app = new App('test');
      const region = new Region('region');
      app.addRelationship(region);
      app.addRelationship(region);
      region.addRelationship(app);

      expect(app.getDependencies()).toHaveLength(3);
    });

    it('should create a bi-directional relationship', () => {
      const {
        region: [region],
        service: [service],
      } = create({ app: ['app'], region: ['region'], service: ['service'] });

      service.addRelationship(region);

      const serviceSiblings = service.getSiblings();
      expect(
        Object.keys(serviceSiblings).map((k) => serviceSiblings[k].map((m) => m.to.getContext())),
      ).toMatchSnapshot();

      const regionSiblings = region.getSiblings();
      expect(Object.keys(regionSiblings).map((k) => regionSiblings[k].map((m) => m.to.getContext()))).toMatchSnapshot();
    });

    it('should be allowed to add parent-child behavior to relationship', () => {
      const {
        region: [region],
        service: [service],
      } = create({ app: ['test'], region: ['region'], service: ['service'] });

      const { thisToThatDependency } = service.addRelationship(region);
      thisToThatDependency.addBehavior('serviceId', DiffAction.ADD, 'regionId', DiffAction.ADD);

      const serviceRegionDependency = service.getSiblings()['region'][0];
      expect(serviceRegionDependency.hasMatchingBehavior('serviceId', DiffAction.ADD, 'regionId', DiffAction.ADD)).toBe(
        true,
      );
    });
  });

  describe('diff()', () => {
    describe('diff of overlay siblings', () => {
      it('should not produce overlay diffs', async () => {
        const {
          app: [app],
        } = create({ app: ['app'], image: ['image'] });
        const anchor1 = new TestAnchor('anchor-1', {}, app);
        app.addAnchor(anchor1);

        const [overlay1] = await createTestOverlays({ 'overlay-1': [anchor1] });

        app.addRelationship(overlay1);

        const diff = await app.diff();
        expect(diff.map((d) => d.value)).toEqual(['image:v1', 'app']);
      });
    });
  });

  describe('getAncestors()', () => {
    it('should not include children as ancestor', () => {
      const {
        region: [region],
      } = create({ app: ['app'], environment: ['env-0'], region: ['region-0'] });

      expect(region.getAncestors().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should not include sibling dependency as ancestor without explicit behavior', () => {
      const {
        region: [region],
        service: [service],
      } = create({ app: ['app'], region: ['region'], service: ['service'] });

      service.addRelationship(region);

      expect(service.getAncestors().map((m) => m.getContext())).toMatchSnapshot();
      expect(region.getAncestors().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should include sibling dependency as ancestor with explicit behavior', () => {
      const {
        region: [region],
        service: [service],
      } = create({ app: ['app'], region: ['region'], service: ['service'] });

      const { thisToThatDependency } = service.addRelationship(region);
      thisToThatDependency.addBehavior('serviceId', DiffAction.ADD, 'regionId', DiffAction.ADD);

      expect(service.getAncestors().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should include parent of parent as ancestors', () => {
      const {
        environment: [environment],
      } = create({ app: ['app'], environment: ['env-0'], region: ['region-0'] });

      expect(environment.getAncestors().map((m) => m.getContext())).toMatchSnapshot();
    });
  });

  describe('getBoundaryMembers()', () => {
    it('should demonstrate how boundaries can explode because of a common model', () => {
      const {
        region: [region1, region2],
      } = create({ app: ['test-app'], region: ['region-1', 'region-2:-1'] });

      // 2 regions, ideally on different boundaries, are merged together because of one common model.
      const environment = new Environment('qa');
      region1.addEnvironment(environment);
      region2.addEnvironment(environment);

      expect(region1.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should not include non-dependents in boundary', () => {
      const {
        region: [region],
      } = create({ app: ['test-app'], image: ['image'], region: ['region'], server: ['server'] });

      // Just adding a server won't correlate to region. Create an execution in order to correlate.
      expect(region.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should include models in boundary after they are added as dependents', () => {
      const {
        region: [region],
        server: [server],
      } = create({
        app: ['test-app'],
        deployment: ['deployment'],
        environment: ['qa'],
        execution: [':0:0:0'],
        image: ['test'],
        region: ['region'],
        server: ['server'],
        subnet: ['subnet'],
      });

      expect(region.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
      expect(server.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should include sibling dependency in boundary', () => {
      const {
        region: [region],
        service: [service],
      } = create({ app: ['app'], region: ['region'], service: ['service'] });

      service.addRelationship(region);

      expect(region.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
    });

    it("should include sibling's sibling in boundary", () => {
      const {
        image: [image],
        region: [region1, region2],
      } = create({ app: ['app'], image: ['imageName'], region: ['region-1', 'region-2:-1'] });

      region1.addRelationship(image);
      region2.addRelationship(image);

      expect(region1.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should include overlays in boundary', async () => {
      const {
        app: [app],
      } = create({ app: ['app'], image: ['image'] });
      const anchor = new TestAnchor('test-anchor', {}, app);
      app.addAnchor(anchor);

      const [overlay] = await createTestOverlays({ 'test-overlay': [anchor] });

      expect(overlay.getBoundaryMembers().map((m) => m.getContext())).toMatchInlineSnapshot(`
       [
         "test-overlay=test-overlay",
         "app=app",
       ]
      `);
      expect(app.getBoundaryMembers().map((m) => m.getContext())).toMatchInlineSnapshot(`
        [
          "app=app",
          "test-overlay=test-overlay",
          "image=image:v1,app=app",
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
        }).toThrowErrorMatchingInlineSnapshot(`"Dependency relationship already exists!"`);
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

  describe('getAnchor()', () => {
    it('should get anchor using specified parent', async () => {
      const {
        app: [app],
      } = create({ app: ['test'], image: ['image'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      const [overlay1] = await createTestOverlays({ 'overlay-1': [anchor1] });

      expect(overlay1.getAnchor('anchor-1', app)!.anchorId).toBe(anchor1.anchorId);
    });
  });

  describe('getDependency()', () => {
    it('should get a dependency with relationship', () => {
      const {
        app: [app],
        region: [region],
      } = create({ app: ['test'], region: ['region'] });

      const appDependencyWithRegion = app.getDependency(region, DependencyRelationship.PARENT);
      expect(appDependencyWithRegion).not.toBe(undefined);

      const regionDependencyWithApp = region.getDependency(app, DependencyRelationship.CHILD);
      expect(regionDependencyWithApp).not.toBe(undefined);
    });

    it('should get a dependency without relationship', () => {
      const {
        image: [image],
        region: [region],
      } = create({ app: ['test'], image: ['test'], region: ['region'] });

      image.addRelationship(region);

      const imageDependencyWithRegion = image.getDependencies(region);
      expect(imageDependencyWithRegion).toHaveLength(1);

      const regionDependencyWithImage = region.getDependencies(image);
      expect(regionDependencyWithImage).toHaveLength(1);
    });
  });

  // describe('remove()', () => {
  //   it('should throw error when model being a parent cannot be removed', () => {
  //     const {
  //       app: [app],
  //     } = create({ app: ['test'], region: ['region'] });
  //
  //     expect(() => {
  //       app.remove(true);
  //     }).toThrowErrorMatchingInlineSnapshot(`"Cannot remove model until dependent models exist!"`);
  //   });
  //
  //   it('should throw error when model having a direct relationship cannot be removed', () => {
  //     const {
  //       region: [region],
  //     } = create({ app: ['test'], region: ['region'], subnet: ['subnet'] });
  //
  //     expect(() => {
  //       region.remove();
  //     }).toThrowErrorMatchingInlineSnapshot(`"Cannot remove model until dependent models exist!"`);
  //   });
  //
  //   it('should be able to remove leaf model', () => {
  //     const {
  //       app: [app],
  //       region: [region],
  //     } = create({ app: ['test'], region: ['region'] });
  //
  //     expect(app.getChild('region', [{ key: 'regionId', value: 'region' }])).not.toBe(undefined);
  //     region.remove();
  //     expect(app.getChild('region', [{ key: 'regionId', value: 'region' }])).toBe(undefined);
  //   });
  //
  //   it('should not be able to remove leaf model with a direct relationship', () => {
  //     const {
  //       app: [app],
  //       image: [image],
  //       server: [server],
  //     } = create({ app: ['test'], image: ['image'], server: ['server'] });
  //
  //     server.addRelationship(image);
  //
  //     // Image cannot be removed until server is removed.
  //     expect(() => {
  //       image.remove();
  //     }).toThrowErrorMatchingInlineSnapshot(`"Cannot remove model until dependent models exist!"`);
  //
  //     // Remove server.
  //     server.remove(true);
  //
  //     // Remove image.
  //     image.remove();
  //     expect(app.getChild('image', [{ key: 'imageTag', value: 'tag' }])).toBe(undefined);
  //   });
  // });
  //
  // describe('removeRelationship()', () => {
  //   it('should be able to remove relationship', () => {
  //     const {
  //       app: [app],
  //       image: [image],
  //       region: [region],
  //     } = create({ app: ['app'], image: ['image'], region: ['region'] });
  //
  //     image.addRelationship(region);
  //
  //     // Image cannot be removed since it has a relationship with region.
  //     expect(() => {
  //       image.remove();
  //     }).toThrowErrorMatchingInlineSnapshot(`"Cannot remove model until dependent models exist!"`);
  //
  //     image.removeRelationship(region);
  //
  //     // Remove image.
  //     image.remove();
  //     expect(app.getChild('image', [{ key: 'imageTag', value: 'tag' }])).toBe(undefined);
  //   });
  // });

  describe('unSynth()', () => {
    it('should throw error if model does not override unSynth()', async () => {
      await expect(async () => {
        await TestModelWithoutUnsynth.unSynth();
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Method not implemented! Use derived class implementation"`);
    });
  });
});
