import { Region } from '../region/region.model';
import { Server } from '../server/server.model';
import { Support } from '../support/support.model';
import { App } from './app.model';

describe('App UT', () => {
  describe('clone()', () => {
    it('should clone all fields', () => {
      const app = new App('test');
      app.addRegion(new Region(app, 'aws-us-east-1'));
      app.addServer(new Server(app, 'backend'));
      app.addSupport(new Support(app, 'nginx'));

      const duplicate = app.clone();

      expect(duplicate.getContext()).toBe('app=test');
      expect(duplicate.regions[0].regionId).toBe('aws-us-east-1');
      expect(duplicate.servers[0].serverKey).toBe('backend');
      expect(duplicate.supports[0].serverKey).toBe('nginx');
    });
  });
});
