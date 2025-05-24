import { MatchingResource } from '../../app.type.js';
import { Account } from '../../models/account/account.model.js';
import { AccountType } from '../../models/account/account.schema.js';
import { App } from '../../models/app/app.model.js';
import { TestOverlay, TestResource } from '../../utilities/test-helpers/test-classes.js';

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
});
