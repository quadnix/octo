import { commit, create } from '../../../test/helpers/test-models.js';

describe('Execution UT', () => {
  describe('diff()', () => {
    describe('when diff of object', () => {
      it('should capture delete', async () => {
        const {
          app: [app],
          execution: [execution],
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

        // Remove the execution.
        execution.remove();

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
          ]
        `);
        /* eslint-enable */
      });
    });
  });
});
