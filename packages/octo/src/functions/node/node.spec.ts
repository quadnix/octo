import { MatchingResource, type UnknownNode } from '../../app.type.js';
import { Account } from '../../models/account/account.model.js';
import { AccountType } from '../../models/account/account.schema.js';
import { App } from '../../models/app/app.model.js';
import { TestAnchor } from '../../utilities/test-helpers/test-classes.js';
import { create } from '../../utilities/test-helpers/test-models.js';
import { createOverlay } from '../../utilities/test-helpers/test-overlays.js';
import { createResource } from '../../utilities/test-helpers/test-resources.js';

const TestOverlay = createOverlay('test-overlay').setClassName('TestOverlay');
const TestResource = createResource('test-resource').setClassName('TestResource');

describe('Node UT', () => {
  describe('addChild()', () => {
    describe('when node is a model', () => {
      it('should add a child node', async () => {
        const app1 = new App('app');
        const account1 = new Account(AccountType.AWS, 'account');

        app1.addChild('name', account1, 'accountId');

        expect(app1.getDependencies().length).toBe(1);
        expect(account1.getDependencies().length).toBe(1);
      });

      it('should skip adding child node that already exists', async () => {
        const app1 = new App('app');
        const account1 = new Account(AccountType.AWS, 'account');

        app1.addChild('name', account1, 'accountId');
        app1.addChild('name', account1, 'accountId');

        expect(app1.getDependencies().length).toBe(1);
        expect(account1.getDependencies().length).toBe(1);
      });

      it('should add child node similar to the one that already exists and has a different context', async () => {
        const app1 = new App('app');
        const account1 = new Account(AccountType.AWS, 'account');
        const account2 = new Account(AccountType.AWS, 'account');

        app1.addChild('name', account1, 'accountId');
        // account1 and account2 are not the same node as their contexts are different.
        // So they are treated as different children.
        app1.addChild('name', account2, 'accountId');

        expect(app1.getDependencies().length).toBe(2);
        expect(account1.getDependencies().length).toBe(1);
        expect(account2.getDependencies().length).toBe(1);
      });

      it('should skip adding child node similar to the one that already exists and has same context', async () => {
        const app1 = new App('app');
        const app2 = new App('app');
        const account1 = new Account(AccountType.AWS, 'account');
        const account2 = new Account(AccountType.AWS, 'account');
        app2.addChild('name', account2, 'accountId');

        app1.addChild('name', account1, 'accountId');
        // account1 and account2 are the same node as their contexts are the same.
        // So they are treated as the same child.
        app1.addChild('name', account2, 'accountId');

        expect(app1.getDependencies().length).toBe(1);
        expect(account1.getDependencies().length).toBe(1);
        expect(account2.getDependencies().length).toBe(1);
      });
    });

    describe('when node is an overlay', () => {
      it('should add a child node', async () => {
        const app1 = new App('app');
        const overlay1 = new TestOverlay('test-overlay-1', {}, []);

        app1.addChild('name', overlay1, 'overlayId');

        expect(app1.getDependencies().length).toBe(1);
        expect(overlay1.getDependencies().length).toBe(1);
      });

      it('should skip adding child node that already exists', async () => {
        const app1 = new App('app');
        const overlay1 = new TestOverlay('test-overlay-1', {}, []);

        app1.addChild('name', overlay1, 'accountId');
        app1.addChild('name', overlay1, 'accountId');

        expect(app1.getDependencies().length).toBe(1);
        expect(overlay1.getDependencies().length).toBe(1);
      });

      it('should skip adding child node similar to the one that already exists and has same context', async () => {
        const app1 = new App('app');
        const overlay1 = new TestOverlay('test-overlay-1', {}, []);
        const overlay2 = new TestOverlay('test-overlay-1', {}, []);

        app1.addChild('name', overlay1, 'accountId');
        app1.addChild('name', overlay2, 'accountId');

        expect(app1.getDependencies().length).toBe(1);
        expect(overlay1.getDependencies().length).toBe(1);
        expect(overlay2.getDependencies().length).toBe(1);
      });
    });

    describe('when node is a resource', () => {
      it('should add a child node', async () => {
        const resource1 = new TestResource('resource-1', {}, []);
        const resource2 = new TestResource('resource-2', {}, []);

        resource1.addChild('resourceId', resource2, 'resourceId');

        expect(resource1.getDependencies().length).toBe(1);
        expect(resource1.parents.length).toBe(0);
        expect(resource2.getDependencies().length).toBe(1);
        expect(resource2.parents.length).toBe(1);
      });

      it('should skip adding child node that already exists', async () => {
        const resource1 = new TestResource('resource-1', {}, []);
        const resource2 = new TestResource('resource-2', {}, []);

        resource1.addChild('resourceId', resource2, 'resourceId');
        resource1.addChild('resourceId', resource2, 'resourceId');

        expect(resource1.getDependencies().length).toBe(1);
        expect(resource1.parents.length).toBe(0);
        expect(resource2.getDependencies().length).toBe(1);
        expect(resource2.parents.length).toBe(1);
      });

      it('should skip adding child node similar to the one that already exists and has same context', async () => {
        const resource1 = new TestResource('resource-1', {}, []);
        const resource2 = new TestResource('resource-2', {}, []);
        const resource3 = new TestResource('resource-2', {}, []);

        resource1.addChild('resourceId', resource2, 'resourceId');
        resource1.addChild('resourceId', resource3, 'resourceId');

        expect(resource1.getDependencies().length).toBe(1);
        expect(resource1.parents.length).toBe(0);
        expect(resource2.getDependencies().length).toBe(1);
        expect(resource2.parents.length).toBe(1);
        expect(resource3.getDependencies().length).toBe(1);
        expect(resource3.parents.length).toBe(1);
      });
    });

    describe('when node is a matching resource', () => {
      it('should add a child node', async () => {
        const resource1 = new MatchingResource(new TestResource('resource-1', {}, []));
        const resource2 = new MatchingResource(new TestResource('resource-2', {}, []));

        resource1.addChild('resourceId', resource2.getActual(), 'resourceId');

        expect(resource1.getActual().getDependencies().length).toBe(1);
        expect(resource1.getActual().parents.length).toBe(0);
        expect(resource2.getActual().getDependencies().length).toBe(1);
        expect(resource2.getActual().parents.length).toBe(1);
      });

      it('should skip adding child node that already exists', async () => {
        const resource1 = new MatchingResource(new TestResource('resource-1', {}, []));
        const resource2 = new MatchingResource(new TestResource('resource-2', {}, []));

        resource1.addChild('resourceId', resource2.getActual(), 'resourceId');
        resource1.addChild('resourceId', resource2.getActual(), 'resourceId');

        expect(resource1.getActual().getDependencies().length).toBe(1);
        expect(resource1.getActual().parents.length).toBe(0);
        expect(resource2.getActual().getDependencies().length).toBe(1);
        expect(resource2.getActual().parents.length).toBe(1);
      });

      it('should skip adding child node similar to the one that already exists and has same context', async () => {
        const resource1 = new MatchingResource(new TestResource('resource-1', {}, []));
        const resource2 = new MatchingResource(new TestResource('resource-2', {}, []));
        const resource3 = new MatchingResource(new TestResource('resource-2', {}, []));

        resource1.addChild('resourceId', resource2.getActual(), 'resourceId');
        resource1.addChild('resourceId', resource3.getActual(), 'resourceId');

        expect(resource1.getActual().getDependencies().length).toBe(1);
        expect(resource1.getActual().parents.length).toBe(0);
        expect(resource2.getActual().getDependencies().length).toBe(1);
        expect(resource2.getActual().parents.length).toBe(1);
        expect(resource3.getActual().getDependencies().length).toBe(1);
        expect(resource3.getActual().parents.length).toBe(1);
      });
    });
  });

  describe('addRelationship()', () => {
    it('should add a sibling edge', async () => {
      const app1 = new App('app');
      const overlay1 = new TestOverlay('overlay-1', {}, []);

      app1.addRelationship(overlay1);

      expect(app1.getDependencies().length).toBe(1);
    });

    it('should reuse the sibling edge with a node it already has one with', async () => {
      const app1 = new App('app');
      const overlay1 = new TestOverlay('overlay-1', {}, []);

      const { thisToThatDependency: first } = app1.addRelationship(overlay1);
      const { thisToThatDependency: second } = app1.addRelationship(overlay1);

      expect(app1.getDependencies().length).toBe(1);
      expect(first).toBe(second);
    });

    it('should not reuse a parent or child edge as a sibling edge', async () => {
      const app1 = new App('app');
      const account1 = new Account(AccountType.AWS, 'account');

      app1.addChild('name', account1, 'accountId');
      app1.addRelationship(account1);

      expect(app1.getDependencies().length).toBe(2);
    });
  });

  describe('getBoundaryMembers()', () => {
    const contextsOf = (node: UnknownNode): string[] =>
      node
        .getBoundaryMembers()
        .map((m) => m.getContext())
        .sort();

    // app ── account ─┬─ region-a ─┬─ environment qa ─┐
    //     └─ server   │            └─ subnet-a ───────┴─ execution (also under deployment v1 of server)
    //                 └─ region-b ── subnet-b
    const createGraph = (): ReturnType<typeof create> =>
      create({
        account: ['aws,account'],
        app: ['app'],
        deployment: ['v1'],
        environment: ['qa'],
        execution: [':0:0:0'],
        region: ['region-a', 'region-b:-1'],
        server: ['backend'],
        subnet: ['subnet-a', 'subnet-b'],
      });

    it('should throw error if parents form a cycle', async () => {
      const app1 = new App('app');
      const account1 = new Account(AccountType.AWS, 'account');
      app1.addChild('name', account1, 'accountId');
      account1.addChild('accountId', app1, 'name');

      expect(() => account1.getBoundaryMembers()).toThrow('Found circular dependencies!');
    });

    it('should include only itself when it has no edges', async () => {
      const app1 = new App('app');

      expect(contextsOf(app1)).toEqual(['app=app']);
    });

    it('should include its ancestors', async () => {
      const {
        subnet: [, subnetB],
      } = createGraph();

      expect(contextsOf(subnetB)).toMatchInlineSnapshot(`
       [
         "account=account,app=app",
         "app=app",
         "region=region-b,account=account,app=app",
         "subnet=region-b-subnet-b,region=region-b,account=account,app=app",
       ]
      `);
    });

    it('should include its descendants, and the ancestors of each descendant', async () => {
      const {
        region: [regionA],
      } = createGraph();

      expect(contextsOf(regionA)).toMatchInlineSnapshot(`
       [
         "account=account,app=app",
         "app=app",
         "deployment=v1,server=backend,app=app",
         "environment=qa,region=region-a,account=account,app=app",
         "execution=backend-v1-region-a-qa-subnet-a,deployment=v1,server=backend,app=app,environment=qa,region=region-a,account=account,app=app,subnet=region-a-subnet-a,region=region-a,account=account,app=app",
         "region=region-a,account=account,app=app",
         "server=backend,app=app",
         "subnet=region-a-subnet-a,region=region-a,account=account,app=app",
       ]
      `);
    });

    it("should not include a parent's other children", async () => {
      const {
        region: [, regionB],
      } = createGraph();

      expect(contextsOf(regionB)).toMatchInlineSnapshot(`
       [
         "account=account,app=app",
         "app=app",
         "region=region-b,account=account,app=app",
         "subnet=region-b-subnet-b,region=region-b,account=account,app=app",
       ]
      `);
    });

    it('should include every node once', async () => {
      const {
        app: [app],
      } = createGraph();

      const contexts = contextsOf(app);

      expect(new Set(contexts).size).toBe(contexts.length);
      expect(contexts).toMatchInlineSnapshot(`
       [
         "account=account,app=app",
         "app=app",
         "deployment=v1,server=backend,app=app",
         "environment=qa,region=region-a,account=account,app=app",
         "execution=backend-v1-region-a-qa-subnet-a,deployment=v1,server=backend,app=app,environment=qa,region=region-a,account=account,app=app,subnet=region-a-subnet-a,region=region-a,account=account,app=app",
         "region=region-a,account=account,app=app",
         "region=region-b,account=account,app=app",
         "server=backend,app=app",
         "subnet=region-a-subnet-a,region=region-a,account=account,app=app",
         "subnet=region-b-subnet-b,region=region-b,account=account,app=app",
       ]
      `);
    });

    it('should include an overlay, and every model it joins, but not their children', async () => {
      const {
        environment: [environment],
        region: [, regionB],
      } = createGraph();
      const overlay = new TestOverlay('overlay-1', {}, []);
      overlay.addAnchor(new TestAnchor('anchor-1', {}, environment));
      overlay.addAnchor(new TestAnchor('anchor-2', {}, regionB));

      expect(contextsOf(environment)).toMatchInlineSnapshot(`
       [
         "@octo/test-overlay=overlay-1",
         "account=account,app=app",
         "app=app",
         "deployment=v1,server=backend,app=app",
         "environment=qa,region=region-a,account=account,app=app",
         "execution=backend-v1-region-a-qa-subnet-a,deployment=v1,server=backend,app=app,environment=qa,region=region-a,account=account,app=app,subnet=region-a-subnet-a,region=region-a,account=account,app=app",
         "region=region-a,account=account,app=app",
         "region=region-b,account=account,app=app",
         "server=backend,app=app",
         "subnet=region-a-subnet-a,region=region-a,account=account,app=app",
       ]
      `);
      expect(contextsOf(overlay)).toMatchInlineSnapshot(`
       [
         "@octo/test-overlay=overlay-1",
         "account=account,app=app",
         "app=app",
         "environment=qa,region=region-a,account=account,app=app",
         "region=region-a,account=account,app=app",
         "region=region-b,account=account,app=app",
       ]
      `);
    });

    it('should include a sibling and its ancestors, but not its children', async () => {
      const {
        region: [regionA, regionB],
      } = create({
        account: ['aws,account'],
        app: ['app'],
        region: ['region-a', 'region-b:-1'],
        subnet: ['subnet-a', 'subnet-b'],
      });
      const {
        service: [service],
      } = create({ service: [['service', {}, [regionA]]] });
      service.addRelationship(regionB);

      expect(
        regionA
          .getBoundaryMembers()
          .map((m) => m.getContext())
          .sort(),
      ).toEqual([
        'account=account,app=app',
        'app=app',
        'region=region-a,account=account,app=app',
        'region=region-b,account=account,app=app',
        'service=service,region=region-a,account=account,app=app',
        'subnet=region-a-subnet-a,region=region-a,account=account,app=app',
      ]);
    });

    it('should not include a node whose sibling edge points at self', async () => {
      const {
        region: [regionA, regionB],
      } = create({
        account: ['aws,account'],
        app: ['app'],
        region: ['region-a', 'region-b:-1'],
      });
      const {
        service: [service],
      } = create({ service: [['service', {}, [regionA]]] });
      service.addRelationship(regionB);

      expect(
        regionB
          .getBoundaryMembers()
          .map((m) => m.getContext())
          .sort(),
      ).toEqual(['account=account,app=app', 'app=app', 'region=region-b,account=account,app=app']);
    });

    it('should walk down a node reached across a sibling edge once it is reached as a child', async () => {
      const {
        app: [app],
        region: [regionA, regionB],
      } = create({
        account: ['aws,account'],
        app: ['app'],
        region: ['region-a', 'region-b:-1'],
        subnet: ['subnet-a', 'subnet-b'],
      });
      const {
        service: [serviceA, serviceB],
      } = create({
        service: [
          ['service-a', {}, [regionA]],
          ['service-b', {}, [regionB]],
        ],
      });
      serviceA.addRelationship(regionB);
      serviceB.addRelationship(regionA);

      expect(
        app
          .getBoundaryMembers()
          .map((m) => m.getContext())
          .sort(),
      ).toEqual([
        'account=account,app=app',
        'app=app',
        'region=region-a,account=account,app=app',
        'region=region-b,account=account,app=app',
        'service=service-a,region=region-a,account=account,app=app',
        'service=service-b,region=region-b,account=account,app=app',
        'subnet=region-a-subnet-a,region=region-a,account=account,app=app',
        'subnet=region-b-subnet-b,region=region-b,account=account,app=app',
      ]);
    });
  });
});
