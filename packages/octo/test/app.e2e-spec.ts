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
      deployment: ['v1'],
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

// TODO: update template yaml schema location. Currently points to local.
// On that front, the aws-s3-website template looks completely wrong.
// There are extra packages.
// The scripts don't make sense because there is no main.ts, and probably more.

// TODO: ensure the resource template has been updated.
// We now return a response. mock() and handle() signatures have changed.
// We also should create validate resource action, and update docs.

// octo
// ====
// TODO: how to test octo tf validate and run-action? We might need to ensure outputs and refs are validated.
// TODO: some of the names like plan.json and tfstate are hard-coded. What if users don't pass the same name?

// octo-aws-cdk
// ====
// TODO: Find a way to do separate test(s) for tags on all resources.

// TODO: We need to understand if we need all the resource overrides with TF now?
