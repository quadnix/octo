import {
  App,
  Container,
  Deployment,
  Environment,
  Image,
  ModelSerializationService,
  Region,
  Server,
  Subnet,
} from '../src/index.js';

describe('App E2E Test', () => {
  let modelSerializationService: ModelSerializationService;

  beforeAll(async () => {
    modelSerializationService = await Container.get(ModelSerializationService);
  });

  it('should generate app diff', async () => {
    // Create an initial state of the app.
    const app = new App('test-app');
    const image = new Image('image', 'tag', { dockerfilePath: '.' });
    app.addImage(image);
    const region = new Region('region');
    app.addRegion(region);
    const qaEnvironment = new Environment('qa');
    qaEnvironment.environmentVariables.set('env', 'QA');
    region.addEnvironment(qaEnvironment);
    const backendServer = new Server('backend');
    app.addServer(backendServer);

    // Commit state.
    const app_1 = (await modelSerializationService.deserialize(await modelSerializationService.serialize(app))) as App;

    // Add a deployment to backend server.
    backendServer.addDeployment(new Deployment('backend@v0.0.1'));
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
    databaseServer.addDeployment(new Deployment('database@v0.0.1'));
    app.addServer(databaseServer);

    const diffs = await app.diff(app_1);
    expect(diffs).toMatchSnapshot();
  });
});
