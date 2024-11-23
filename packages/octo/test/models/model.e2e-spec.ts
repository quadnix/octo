import type { UnknownModel } from '../../src/app.type.js';
import {
  Account,
  App,
  DependencyRelationship,
  DiffAction,
  Environment,
  Region,
  TestContainer,
} from '../../src/index.js';
import type { AModel } from '../../src/models/model.abstract.js';
import { TestAnchor, TestModelWithoutUnsynth } from '../helpers/test-classes.js';
import { create, createTestOverlays } from '../helpers/test-models.js';

describe('Model E2E Test', () => {
  beforeEach(async () => {
    await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
  });

  describe('common functions', () => {
    const {
      account: [account],
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
      account: ['account'],
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
        model: account,
      },
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
        account: [account],
        app: [app],
      } = create({ account: ['account'], app: ['test'] });

      expect(() => {
        app.addChild('name', account, 'accountId');
      }).toThrowErrorMatchingInlineSnapshot(`"Dependency relationship already exists!"`);

      expect(() => {
        account.addChild('accountId', app, 'name');
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
      } = create({ account: ['account'], app: ['app'], region: ['region'], service: ['service'] });

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
      } = create({ account: ['account'], app: ['test'], region: ['region'], service: ['service'] });

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
        } = create({ account: ['account'], app: ['app'], image: ['image'] });
        const anchor1 = new TestAnchor('anchor-1', {}, app);
        app.addAnchor(anchor1);

        const [overlay1] = await createTestOverlays({ 'overlay-1': [anchor1] });

        app.addRelationship(overlay1);

        const diff = await app.diff();
        expect(diff.map((d) => d.value)).toEqual(['image:v1', 'account', 'app']);
      });
    });
  });

  describe('getAncestors()', () => {
    it('should not include children as ancestor', () => {
      const {
        region: [region],
      } = create({ account: ['account'], app: ['app'], environment: ['env-0'], region: ['region-0'] });

      expect(region.getAncestors().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should not include sibling dependency as ancestor without explicit behavior', () => {
      const {
        region: [region],
        service: [service],
      } = create({ account: ['account'], app: ['app'], region: ['region'], service: ['service'] });

      service.addRelationship(region);

      expect(service.getAncestors().map((m) => m.getContext())).toMatchSnapshot();
      expect(region.getAncestors().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should include sibling dependency as ancestor with explicit behavior', () => {
      const {
        region: [region],
        service: [service],
      } = create({ account: ['account'], app: ['app'], region: ['region'], service: ['service'] });

      const { thisToThatDependency } = service.addRelationship(region);
      thisToThatDependency.addBehavior('serviceId', DiffAction.ADD, 'regionId', DiffAction.ADD);

      expect(service.getAncestors().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should include parent of parent as ancestors', () => {
      const {
        environment: [environment],
      } = create({ account: ['account'], app: ['app'], environment: ['env-0'], region: ['region-0'] });

      expect(environment.getAncestors().map((m) => m.getContext())).toMatchSnapshot();
    });
  });

  describe('getBoundaryMembers()', () => {
    it('should demonstrate how boundaries can explode because of a common model', () => {
      const {
        region: [region1, region2],
      } = create({ account: ['account'], app: ['test-app'], region: ['region-1', 'region-2:-1'] });

      // 2 regions, ideally on different boundaries, are merged together because of one common model.
      const environment = new Environment('qa');
      region1.addEnvironment(environment);
      region2.addEnvironment(environment);

      expect(region1.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should not include non-dependents in boundary', () => {
      const {
        region: [region],
      } = create({ account: ['account'], app: ['test-app'], image: ['image'], region: ['region'], server: ['server'] });

      // Just adding a server won't correlate to region. Create an execution in order to correlate.
      expect(region.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should include models in boundary after they are added as dependents', () => {
      const {
        region: [region],
        server: [server],
      } = create({
        account: ['account'],
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
      } = create({ account: ['account'], app: ['app'], region: ['region'], service: ['service'] });

      service.addRelationship(region);

      expect(region.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
    });

    it("should include sibling's sibling in boundary", () => {
      const {
        image: [image],
        region: [region1, region2],
      } = create({ account: ['account'], app: ['app'], image: ['imageName'], region: ['region-1', 'region-2:-1'] });

      region1.addRelationship(image);
      region2.addRelationship(image);

      expect(region1.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should include overlays in boundary', async () => {
      const {
        app: [app],
      } = create({ account: ['account'], app: ['app'], image: ['image'] });
      const anchor = new TestAnchor('test-anchor', {}, app);
      app.addAnchor(anchor);

      const [overlay] = await createTestOverlays({ 'test-overlay': [anchor] });

      expect(overlay.getBoundaryMembers().map((m) => m.getContext())).toMatchInlineSnapshot(`
       [
         "@octo/test-overlay=test-overlay",
         "app=app",
       ]
      `);
      expect(app.getBoundaryMembers().map((m) => m.getContext())).toMatchInlineSnapshot(`
        [
          "app=app",
          "@octo/test-overlay=test-overlay",
          "account=account,app=app",
          "image=image:v1,account=account,app=app",
        ]
      `);
    });

    describe('Circular Dependencies', () => {
      it('should throw error on one level of circular dependency', () => {
        const account = new Account('account');
        const region = new Region('region');

        expect(() => {
          account.addRegion(region);
          region.addChild('regionId', account, 'accountId');
          account.getBoundaryMembers();
        }).toThrowErrorMatchingInlineSnapshot(`"Dependency relationship already exists!"`);
      });

      it('should throw error on two levels of circular dependency', () => {
        const app = new App('test-app');
        const account = new Account('account');
        const region = new Region('region');
        const environment = new Environment('qa');

        expect(() => {
          app.addAccount(account);
          account.addRegion(region);
          region.addEnvironment(environment);
          environment.addChild('environmentName', account, 'accountId');
          app.getBoundaryMembers();
        }).toThrowErrorMatchingInlineSnapshot(`"Found circular dependencies!"`);
      });
    });
  });

  describe('getAnchor()', () => {
    it('should get anchor using specified parent', async () => {
      const {
        app: [app],
      } = create({ account: ['account'], app: ['test'], image: ['image'] });
      const anchor1 = new TestAnchor('anchor-1', {}, app);
      app.addAnchor(anchor1);

      const [overlay1] = await createTestOverlays({ 'overlay-1': [anchor1] });

      expect(overlay1.getAnchor('anchor-1', app)!.anchorId).toBe(anchor1.anchorId);
    });
  });

  describe('getDependency()', () => {
    it('should get a dependency with relationship', () => {
      const {
        account: [account],
        region: [region],
      } = create({ account: ['account'], app: ['test'], region: ['region'] });

      const accountDependencyWithRegion = account.getDependency(region, DependencyRelationship.PARENT);
      expect(accountDependencyWithRegion).not.toBeUndefined();

      const regionDependencyWithAccount = region.getDependency(account, DependencyRelationship.CHILD);
      expect(regionDependencyWithAccount).not.toBeUndefined();
    });

    it('should get a dependency without relationship', () => {
      const {
        image: [image],
        region: [region],
      } = create({ account: ['account'], app: ['test'], image: ['test'], region: ['region'] });

      image.addRelationship(region);

      const imageDependencyWithRegion = image.getDependencies(region);
      expect(imageDependencyWithRegion).toHaveLength(1);

      const regionDependencyWithImage = region.getDependencies(image);
      expect(regionDependencyWithImage).toHaveLength(1);
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
