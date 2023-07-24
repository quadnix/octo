import { App } from '../../models/app/app.model';
import { Environment } from '../../models/environment/environment.model';
import { Region } from '../../models/region/region.model';
import { Server } from '../../models/server/server.model';
import { Support } from '../../models/support/support.model';
import { SerializationService } from './serialization.service';

describe('Serialization Service UT', () => {
  it('should serialize an empty app', () => {
    const app = new App('test-app');

    const output = new SerializationService().serialize(app);
    expect(output).toMatchInlineSnapshot(`
      {
        "dependencies": [],
        "models": {},
        "version": "v0",
      }
    `);
  });

  it('should serialize a non-empty app', async () => {
    const app = new App('test-app');

    const region = new Region('region-1');
    app.addRegion(region);

    const environment = new Environment('qa');
    environment.environmentVariables.set('key', 'value');
    region.addEnvironment(environment);

    app.addServer(new Server('backend'));
    app.addSupport(new Support('nginx', 'nginx'));

    const serializationService = new SerializationService();
    const output = serializationService.serialize(app);
    expect(output).toMatchInlineSnapshot(`
      {
        "dependencies": [
          {
            "behaviors": [
              {
                "forAction": "delete",
                "onAction": "delete",
                "onField": "name",
                "toField": "regionId",
              },
            ],
            "from": "app=test-app",
            "relationship": {
              "onField": "name",
              "toField": "regionId",
              "type": "parent",
            },
            "to": "region=region-1,app=test-app",
          },
          {
            "behaviors": [
              {
                "forAction": "add",
                "onAction": "add",
                "onField": "regionId",
                "toField": "name",
              },
              {
                "forAction": "update",
                "onAction": "add",
                "onField": "regionId",
                "toField": "name",
              },
            ],
            "from": "region=region-1,app=test-app",
            "relationship": {
              "onField": "regionId",
              "toField": "name",
              "type": "child",
            },
            "to": "app=test-app",
          },
          {
            "behaviors": [
              {
                "forAction": "delete",
                "onAction": "delete",
                "onField": "regionId",
                "toField": "environmentName",
              },
            ],
            "from": "region=region-1,app=test-app",
            "relationship": {
              "onField": "regionId",
              "toField": "environmentName",
              "type": "parent",
            },
            "to": "environment=qa,region=region-1,app=test-app",
          },
          {
            "behaviors": [
              {
                "forAction": "add",
                "onAction": "add",
                "onField": "environmentName",
                "toField": "regionId",
              },
              {
                "forAction": "update",
                "onAction": "add",
                "onField": "environmentName",
                "toField": "regionId",
              },
            ],
            "from": "environment=qa,region=region-1,app=test-app",
            "relationship": {
              "onField": "environmentName",
              "toField": "regionId",
              "type": "child",
            },
            "to": "region=region-1,app=test-app",
          },
          {
            "behaviors": [
              {
                "forAction": "delete",
                "onAction": "delete",
                "onField": "name",
                "toField": "serverKey",
              },
            ],
            "from": "app=test-app",
            "relationship": {
              "onField": "name",
              "toField": "serverKey",
              "type": "parent",
            },
            "to": "server=backend,app=test-app",
          },
          {
            "behaviors": [
              {
                "forAction": "add",
                "onAction": "add",
                "onField": "serverKey",
                "toField": "name",
              },
              {
                "forAction": "update",
                "onAction": "add",
                "onField": "serverKey",
                "toField": "name",
              },
            ],
            "from": "server=backend,app=test-app",
            "relationship": {
              "onField": "serverKey",
              "toField": "name",
              "type": "child",
            },
            "to": "app=test-app",
          },
          {
            "behaviors": [
              {
                "forAction": "delete",
                "onAction": "delete",
                "onField": "name",
                "toField": "serverKey",
              },
            ],
            "from": "app=test-app",
            "relationship": {
              "onField": "name",
              "toField": "serverKey",
              "type": "parent",
            },
            "to": "support=nginx,app=test-app",
          },
          {
            "behaviors": [
              {
                "forAction": "add",
                "onAction": "add",
                "onField": "serverKey",
                "toField": "name",
              },
              {
                "forAction": "update",
                "onAction": "add",
                "onField": "serverKey",
                "toField": "name",
              },
            ],
            "from": "support=nginx,app=test-app",
            "relationship": {
              "onField": "serverKey",
              "toField": "name",
              "type": "child",
            },
            "to": "app=test-app",
          },
        ],
        "models": {
          "app=test-app": {
            "className": "App",
            "model": {
              "name": "test-app",
            },
          },
          "environment=qa,region=region-1,app=test-app": {
            "className": "Environment",
            "model": {
              "environmentName": "qa",
              "environmentVariables": {
                "key": "value",
              },
            },
          },
          "region=region-1,app=test-app": {
            "className": "Region",
            "model": {
              "regionId": "region-1",
            },
          },
          "server=backend,app=test-app": {
            "className": "Server",
            "model": {
              "serverKey": "backend",
            },
          },
          "support=nginx,app=test-app": {
            "className": "Support",
            "model": {
              "applicationType": "nginx",
              "serverKey": "nginx",
            },
          },
        },
        "version": "v0",
      }
    `);

    const newApp = (await serializationService.deserialize(output)) as App;
    expect(newApp.name).toBe('test-app');
  });
});
