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
    const app_0 = new App('test-app');
    const image = new Image('image', 'tag', { dockerfilePath: '.' });
    app_0.addImage(image);
    const region_0 = new Region('region');
    app_0.addRegion(region_0);
    const qaEnvironment_0 = new Environment('qa');
    qaEnvironment_0.environmentVariables.set('env', 'QA');
    region_0.addEnvironment(qaEnvironment_0);
    app_0.addServer(new Server('backend'));

    const app_1 = (await modelSerializationService.deserialize(
      await modelSerializationService.serialize(app_0),
    )) as App;
    const region_1 = app_1.getChild('region', [{ key: 'regionId', value: 'region' }]) as Region;
    const backendServer_1 = app_1.getChild('server', [{ key: 'serverKey', value: 'backend' }]) as Server;
    const qaEnvironment_1 = region_1.getChild('environment', [{ key: 'environmentName', value: 'qa' }]) as Environment;

    // Add a deployment to backend server.
    backendServer_1.addDeployment(new Deployment('backend@v0.0.1'));
    // Add a new subnet.
    const publicSubnet_0 = new Subnet(region_1, 'public');
    region_1.addSubnet(publicSubnet_0);
    // Add a new staging environment.
    const stagingEnvironment_0 = new Environment('staging');
    stagingEnvironment_0.environmentVariables.set('env', 'staging');
    region_1.addEnvironment(stagingEnvironment_0);
    // Update the qa environment.
    qaEnvironment_1.environmentVariables.set('env', 'qa');
    // Add new server.
    const databaseServer_0 = new Server('database');
    databaseServer_0.addDeployment(new Deployment('database@v0.0.1'));
    app_1.addServer(databaseServer_0);

    const diffs = await app_1.diff(app_0);
    expect(diffs).toMatchSnapshot();
  });
});
