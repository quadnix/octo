import {
  App,
  Deployment,
  Environment,
  Execution,
  Image,
  Model,
  Pipeline,
  Region,
  Server,
  Service,
  Support,
} from '../../../src/v0';

describe('Model E2E Test', () => {
  const app = new App('test');
  const image = new Image('nginx', '0.0.1', {
    dockerFilePath: 'path/to/dockerFile',
  });
  const pipeline = new Pipeline('testPipeline');
  const region = new Region('region-1');
  const server = new Server('backend');
  const service = new Service('testService');
  const support = new Support('nginx', 'nginx');
  const deployment = new Deployment('v1', image);
  const environment = new Environment('qa');
  const execution = new Execution(deployment, environment);

  app.addImage(image);
  app.addPipeline(pipeline);
  app.addRegion(region);
  app.addServer(server);
  app.addService(service);
  app.addSupport(support);
  support.addDeployment(deployment);
  region.addEnvironment(environment);

  const testCases: {
    model: Model<unknown, unknown>;
  }[] = [
    {
      model: app,
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
      model: support,
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
  ];

  describe.each(testCases)('Test $model.MODEL_NAME', (data) => {
    it('should get context', () => {
      expect(data.model.getContext()).toMatchSnapshot();
    });

    it('should be able to synth', () => {
      expect(data.model.synth()).toMatchSnapshot();
    });
  });

  describe('Service E2E Test', () => {
    it('should get context', () => {
      const app = new App('test');
      const service = new Service('testService');
      app.addService(service);

      expect(service.getContext()).toMatchSnapshot();
    });

    it('should be able to synth', () => {
      expect(() => {
        service.synth();
      }).toThrowErrorMatchingSnapshot();
    });
  });
});
