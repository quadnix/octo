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

  describe('getBoundaryMembers()', () => {
    it('should include the common model to the boundary in literal sense', () => {
      const app0 = new App('test-app');
      const region0 = new Region('region-0');
      const region1 = new Region('region-1');
      const environment0 = new Environment('qa');

      app0.addRegion(region0);
      app0.addRegion(region1);
      region0.addEnvironment(environment0);
      region1.addEnvironment(environment0);

      expect(region0.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should not include server in region boundary', () => {
      const app0 = new App('test-app');
      const region0 = new Region('region-0');
      app0.addRegion(region0);

      // Just adding a server won't correlate to region. Create an execution in order to correlate.
      const server0 = new Server('server-0');
      app0.addServer(server0);

      expect(region0.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
    });

    it('should include server in region boundary after an execution is added', () => {
      const app0 = new App('test-app');
      const image0 = new Image('test', 'test', { dockerFilePath: 'Dockerfile' });
      app0.addImage(image0);
      const region0 = new Region('region-0');
      app0.addRegion(region0);
      const environment0 = new Environment('env-0');
      region0.addEnvironment(environment0);
      const server0 = new Server('server-0');
      app0.addServer(server0);
      const deployment0 = new Deployment('deployment-0', image0);
      server0.addDeployment(deployment0);
      new Execution(deployment0, environment0);

      expect(region0.getBoundaryMembers().map((m) => m.getContext())).toMatchSnapshot();
    });

    describe('Circular Dependencies', () => {
      it('should throw error on one level of circular dependency', () => {
        const app0 = new App('test-app');
        const region0 = new Region('region-0');

        expect(() => {
          app0.addRegion(region0);
          region0.addChild('regionId', app0, 'name');
          app0.getBoundaryMembers();
        }).toThrowErrorMatchingInlineSnapshot(`"Found circular dependencies!"`);
      });

      it('should throw error on two levels of circular dependency', () => {
        const app0 = new App('test-app');
        const region0 = new Region('region-0');
        const environment0 = new Environment('qa');

        expect(() => {
          app0.addRegion(region0);
          region0.addEnvironment(environment0);
          environment0.addChild('environmentName', app0, 'name');
          app0.getBoundaryMembers();
        }).toThrowErrorMatchingInlineSnapshot(`"Found circular dependencies!"`);
      });
    });
  });
});
