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
} from '../../src';

describe('Model E2E Test', () => {
  describe('getContext() & synth()', () => {
    const app = new App('test');
    const image = new Image('nginx', '0.0.1', {
      dockerFilePath: __dirname + '/Dockerfile',
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
      synth?: any;
    }[] = [
      {
        model: app,
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
        model: service,
      },
      {
        model: support,
      },
    ];

    describe.each(testCases)('Test $model.MODEL_NAME', (data) => {
      it('should get context', () => {
        expect(data.model.getContext()).toMatchSnapshot();
      });

      it('should be able to synth', () => {
        if (data.model.MODEL_NAME === 'service') {
          expect(() => {
            data.model.synth();
          }).toThrowErrorMatchingSnapshot();
        } else {
          expect(data.model.synth()).toMatchSnapshot();
        }
      });
    });
  });

  describe('getAncestors()', () => {
    it('should get model ancestors', () => {
      const app0 = new App('test-app');
      const image0 = new Image('test', '0.0.1', { dockerFilePath: 'path' });
      const region0 = new Region('region-0');
      const region1 = new Region('region-1');
      const server0 = new Server('backend');
      const deployment0 = new Deployment('0.0.1', image0);
      const environment0 = new Environment('qa');
      const environment1 = new Environment('qa');
      const execution0 = new Execution(deployment0, environment0);

      app0.addImage(image0);
      app0.addRegion(region0);
      app0.addRegion(region1);
      app0.addServer(server0);
      server0.addDeployment(deployment0);
      region0.addEnvironment(environment0);
      region1.addEnvironment(environment1);

      expect(app0.getAncestors().map((m) => m.getContext())).toMatchSnapshot();
      expect(region0.getAncestors().map((m) => m.getContext())).toMatchSnapshot();
      expect(execution0.getAncestors().map((m) => m.getContext())).toMatchSnapshot();
    });
  });
});
