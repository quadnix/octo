import { Region } from '../region/region.model';
import { Server } from '../server/server.model';
import { Support } from '../support/support.model';
import { App } from './app.model';

describe('App UT', () => {
  describe('clone()', () => {
    it('should clone all fields', () => {
      const app = new App('test');
      app.addRegion(new Region('region-1'));
      app.addServer(new Server('backend'));
      app.addSupport(new Support('nginx', 'nginx'));

      const duplicate = app.clone();

      expect(duplicate.regions[0].regionId).toBe('region-1');
      expect(duplicate.servers[0].serverKey).toBe('backend');
      expect(duplicate.supports[0].serverKey).toBe('nginx');
    });
  });
});
