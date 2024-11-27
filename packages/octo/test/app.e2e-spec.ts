import { commit, create } from '../src/utilities/test-helpers/test-models.js';

describe('App E2E Test', () => {
  it('should generate app diff', async () => {
    // Create an initial state of the app.
    const {
      app: [app],
      environment: [environment],
    } = create({
      account: ['aws,account'],
      app: ['test-app'],
      deployment: ['v0.0.1'],
      environment: ['qa'],
      execution: [':0:0:0'],
      filesystem: ['filesystem'],
      image: ['image'],
      pipeline: ['pipeline'],
      region: ['region'],
      server: ['backend'],
      subnet: ['public'],
    });
    environment.environmentVariables.set('env', 'QA');

    await commit(app);

    const diffs = await app.diff();
    expect(diffs).toMatchSnapshot();
  });
});
