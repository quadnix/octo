import { commit, create } from '../../../test/helpers/test-models.js';

describe('Server UT', () => {
  describe('diff()', () => {
    describe('when diff of object with children', () => {
      it('should capture delete of children', async () => {
        const {
          app: [app],
          deployment: [deployment],
          execution: [execution],
          server: [server],
        } = create({
          app: ['test'],
          deployment: ['0.0.1'],
          environment: ['qa'],
          execution: [':0:0:0'],
          region: ['region'],
          server: ['backend'],
          subnet: ['subnet'],
        });

        const app_1 = await commit(app);

        // Remove the server, and the execution.
        execution.remove();
        deployment.remove();
        server.remove();

        const diff = await app.diff(app_1);

        /* eslint-disable spellcheck/spell-checker, max-len */
        expect(diff).toMatchInlineSnapshot(`
          [
            {
              "action": "delete",
              "field": "executionId",
              "model": "execution=backend-0.0.1-region-qa-subnet,deployment=0.0.1,server=backend,app=test,environment=qa,region=region,app=test,subnet=region-subnet,region=region,app=test",
              "value": "backend-0.0.1-region-qa-subnet",
            },
            {
              "action": "delete",
              "field": "executionId",
              "model": "execution=backend-0.0.1-region-qa-subnet,deployment=0.0.1,server=backend,app=test,environment=qa,region=region,app=test,subnet=region-subnet,region=region,app=test",
              "value": "backend-0.0.1-region-qa-subnet",
            },
            {
              "action": "delete",
              "field": "executionId",
              "model": "execution=backend-0.0.1-region-qa-subnet,deployment=0.0.1,server=backend,app=test,environment=qa,region=region,app=test,subnet=region-subnet,region=region,app=test",
              "value": "backend-0.0.1-region-qa-subnet",
            },
            {
              "action": "delete",
              "field": "deploymentTag",
              "model": "deployment=0.0.1,server=backend,app=test",
              "value": "0.0.1",
            },
            {
              "action": "delete",
              "field": "serverKey",
              "model": "server=backend,app=test",
              "value": "backend",
            },
          ]
        `);
        /* eslint-enable */
      });
    });
  });
});
