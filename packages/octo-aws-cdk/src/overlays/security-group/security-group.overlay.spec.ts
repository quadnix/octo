import { App } from '@quadnix/octo';
import { SecurityGroupAnchor } from '../../anchors/security-group.anchor.js';
import { AwsServer } from '../../models/server/aws.server.model.js';
import { SecurityGroupOverlay } from './security-group.overlay.js';

describe('SecurityGroupOverlay UT', () => {
  describe('diff()', () => {
    it('should not generate add diff on new anchor with no rules', async () => {
      const overlay1_0 = new SecurityGroupOverlay('overlay', { awsRegionId: 'awsRegionId', regionId: 'regionId' }, []);
      const overlay1_1 = new SecurityGroupOverlay('overlay', { awsRegionId: 'awsRegionId', regionId: 'regionId' }, []);

      const app = new App('test');
      const server = new AwsServer('backend');
      app.addServer(server);

      const anchor1_1 = new SecurityGroupAnchor('anchor-1', { rules: [], securityGroupName: 'sec-grp' }, server);
      overlay1_1.addAnchor(anchor1_1);

      const diffs = await overlay1_1.diff(overlay1_0);
      expect(diffs.map((d) => ({ action: d.action, field: d.field }))).toMatchInlineSnapshot(`[]`);
    });

    it('should generate add diff on new anchor with rules', async () => {
      const overlay1_0 = new SecurityGroupOverlay('overlay', { awsRegionId: 'awsRegionId', regionId: 'regionId' }, []);
      const overlay1_1 = new SecurityGroupOverlay('overlay', { awsRegionId: 'awsRegionId', regionId: 'regionId' }, []);

      const app = new App('test');
      const server = new AwsServer('backend');
      app.addServer(server);

      const anchor1_1 = new SecurityGroupAnchor(
        'anchor-1',
        {
          rules: [{ CidrBlock: '', Egress: true, FromPort: 8080, IpProtocol: 'tcp', ToPort: 8080 }],
          securityGroupName: 'sec-grp',
        },
        server,
      );
      overlay1_1.addAnchor(anchor1_1);

      const diffs = await overlay1_1.diff(overlay1_0);
      expect(diffs.map((d) => ({ action: d.action, field: d.field }))).toMatchInlineSnapshot(`
       [
         {
           "action": "add",
           "field": "anchor",
         },
       ]
      `);
    });

    it('should not generate diff on previous anchor with no rules and current anchor with no rules', async () => {
      const overlay1_0 = new SecurityGroupOverlay('overlay', { awsRegionId: 'awsRegionId', regionId: 'regionId' }, []);
      const overlay1_1 = new SecurityGroupOverlay('overlay', { awsRegionId: 'awsRegionId', regionId: 'regionId' }, []);

      const app = new App('test');
      const server = new AwsServer('backend');
      app.addServer(server);

      const anchor1_0 = new SecurityGroupAnchor('anchor-1', { rules: [], securityGroupName: 'sec-grp' }, server);
      overlay1_0.addAnchor(anchor1_0);

      const anchor1_1 = new SecurityGroupAnchor('anchor-1', { rules: [], securityGroupName: 'sec-grp' }, server);
      overlay1_1.addAnchor(anchor1_1);

      const diffs = await overlay1_1.diff(overlay1_0);
      expect(diffs.map((d) => ({ action: d.action, field: d.field }))).toMatchInlineSnapshot(`[]`);
    });

    it('should generate add diff on previous anchor with no rules and current anchor with rules', async () => {
      const overlay1_0 = new SecurityGroupOverlay('overlay', { awsRegionId: 'awsRegionId', regionId: 'regionId' }, []);
      const overlay1_1 = new SecurityGroupOverlay('overlay', { awsRegionId: 'awsRegionId', regionId: 'regionId' }, []);

      const app = new App('test');
      const server = new AwsServer('backend');
      app.addServer(server);

      const anchor1_0 = new SecurityGroupAnchor('anchor-1', { rules: [], securityGroupName: 'sec-grp' }, server);
      overlay1_0.addAnchor(anchor1_0);

      const anchor1_1 = new SecurityGroupAnchor(
        'anchor-1',
        {
          rules: [{ CidrBlock: '', Egress: true, FromPort: 8080, IpProtocol: 'tcp', ToPort: 8080 }],
          securityGroupName: 'sec-grp',
        },
        server,
      );
      overlay1_1.addAnchor(anchor1_1);

      const diffs = await overlay1_1.diff(overlay1_0);
      expect(diffs.map((d) => ({ action: d.action, field: d.field }))).toMatchInlineSnapshot(`
       [
         {
           "action": "add",
           "field": "anchor",
         },
       ]
      `);
    });

    it('should generate delete diff on previous anchor with rules and current anchor with no rules', async () => {
      const overlay1_0 = new SecurityGroupOverlay('overlay', { awsRegionId: 'awsRegionId', regionId: 'regionId' }, []);
      const overlay1_1 = new SecurityGroupOverlay('overlay', { awsRegionId: 'awsRegionId', regionId: 'regionId' }, []);

      const app = new App('test');
      const server = new AwsServer('backend');
      app.addServer(server);

      const anchor1_0 = new SecurityGroupAnchor(
        'anchor-1',
        {
          rules: [{ CidrBlock: '', Egress: true, FromPort: 8080, IpProtocol: 'tcp', ToPort: 8080 }],
          securityGroupName: 'sec-grp',
        },
        server,
      );
      overlay1_0.addAnchor(anchor1_0);

      const anchor1_1 = new SecurityGroupAnchor('anchor-1', { rules: [], securityGroupName: 'sec-grp' }, server);
      overlay1_1.addAnchor(anchor1_1);

      const diffs = await overlay1_1.diff(overlay1_0);
      expect(diffs.map((d) => ({ action: d.action, field: d.field }))).toMatchInlineSnapshot(`
       [
         {
           "action": "delete",
           "field": "anchor",
         },
       ]
      `);
    });

    it('should generate update diff on previous anchor with rules and current anchor with rules', async () => {
      const overlay1_0 = new SecurityGroupOverlay('overlay', { awsRegionId: 'awsRegionId', regionId: 'regionId' }, []);
      const overlay1_1 = new SecurityGroupOverlay('overlay', { awsRegionId: 'awsRegionId', regionId: 'regionId' }, []);

      const app = new App('test');
      const server = new AwsServer('backend');
      app.addServer(server);

      const anchor1_0 = new SecurityGroupAnchor(
        'anchor-1',
        {
          rules: [{ CidrBlock: '', Egress: false, FromPort: 8080, IpProtocol: 'tcp', ToPort: 8080 }],
          securityGroupName: 'sec-grp',
        },
        server,
      );
      overlay1_0.addAnchor(anchor1_0);

      const anchor1_1 = new SecurityGroupAnchor(
        'anchor-1',
        {
          rules: [{ CidrBlock: '', Egress: true, FromPort: 8080, IpProtocol: 'tcp', ToPort: 8080 }],
          securityGroupName: 'sec-grp',
        },
        server,
      );
      overlay1_1.addAnchor(anchor1_1);

      const diffs = await overlay1_1.diff(overlay1_0);
      expect(diffs.map((d) => ({ action: d.action, field: d.field }))).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "anchor",
         },
       ]
      `);
    });

    it('should not generate diff on previous anchor with no rules and no new anchor', async () => {
      const overlay1_0 = new SecurityGroupOverlay('overlay', { awsRegionId: 'awsRegionId', regionId: 'regionId' }, []);
      const overlay1_1 = new SecurityGroupOverlay('overlay', { awsRegionId: 'awsRegionId', regionId: 'regionId' }, []);

      const app = new App('test');
      const server = new AwsServer('backend');
      app.addServer(server);

      const anchor1_0 = new SecurityGroupAnchor(
        'anchor-1',
        {
          rules: [],
          securityGroupName: 'sec-grp',
        },
        server,
      );
      overlay1_0.addAnchor(anchor1_0);

      const diffs = await overlay1_1.diff(overlay1_0);
      expect(diffs.map((d) => ({ action: d.action, field: d.field }))).toMatchInlineSnapshot(`[]`);
    });

    it('should generate delete diff on previous anchor with rules and no new anchor', async () => {
      const overlay1_0 = new SecurityGroupOverlay('overlay', { awsRegionId: 'awsRegionId', regionId: 'regionId' }, []);
      const overlay1_1 = new SecurityGroupOverlay('overlay', { awsRegionId: 'awsRegionId', regionId: 'regionId' }, []);

      const app = new App('test');
      const server = new AwsServer('backend');
      app.addServer(server);

      const anchor1_0 = new SecurityGroupAnchor(
        'anchor-1',
        {
          rules: [{ CidrBlock: '', Egress: false, FromPort: 8080, IpProtocol: 'tcp', ToPort: 8080 }],
          securityGroupName: 'sec-grp',
        },
        server,
      );
      overlay1_0.addAnchor(anchor1_0);

      const diffs = await overlay1_1.diff(overlay1_0);
      expect(diffs.map((d) => ({ action: d.action, field: d.field }))).toMatchInlineSnapshot(`
       [
         {
           "action": "delete",
           "field": "anchor",
         },
       ]
      `);
    });
  });
});
