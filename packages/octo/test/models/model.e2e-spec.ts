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
  describe('common functions', () => {
    const app = new App('test');
    const image = new Image('nginx', '0.0.1', {
      dockerFilePath: '/Dockerfile',
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
      it('getAncestors()', () => {
        expect(data.model.getAncestors().map((m) => m.getContext())).toMatchSnapshot();
      });

      it('getBoundaryMembers()', () => {
        expect(data.model.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
      });

      it('getChildren()', () => {
        expect(Object.keys(data.model.getChildren())).toMatchSnapshot();
      });

      it('getContext()', () => {
        expect(data.model.getContext()).toMatchSnapshot();
      });

      it('getParents()', () => {
        expect(Object.keys(data.model.getParents())).toMatchSnapshot();
      });

      it('synth()', () => {
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
});
