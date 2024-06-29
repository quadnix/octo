import { Deployment, Environment, Server, Subnet } from '../src/index.js';
import { commit, create } from './helpers/test-models.js';

describe('App E2E Test', () => {
  it('should generate app diff', async () => {
    // Create an initial state of the app.
    const {
      app: [app],
      environment: [qaEnvironment],
      region: [region],
      server: [backendServer],
    } = create({
      app: ['test-app'],
      environment: ['qa'],
      image: ['image'],
      region: ['region'],
      server: ['backend'],
    });
    qaEnvironment.environmentVariables.set('env', 'QA');

    const app_1 = await commit(app);

    // Add a deployment to backend server.
    backendServer.addDeployment(new Deployment('v0.0.1'));
    // Add a new subnet.
    const publicSubnet = new Subnet(region, 'public');
    region.addSubnet(publicSubnet);
    // Add a new staging environment.
    const stagingEnvironment = new Environment('staging');
    stagingEnvironment.environmentVariables.set('env', 'staging');
    region.addEnvironment(stagingEnvironment);
    // Update the qa environment.
    qaEnvironment.environmentVariables.set('env', 'qa');
    // Add new server.
    const databaseServer = new Server('database');
    databaseServer.addDeployment(new Deployment('v0.0.1'));
    app.addServer(databaseServer);

    const diffs = await app.diff(app_1);
    expect(diffs).toMatchSnapshot();
  });
});
