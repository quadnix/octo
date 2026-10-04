import type { TerraformService } from '../../services/terraform/terraform.service.js';
import { HclUtility } from './hcl.utility.js';

type ModuleFiles = ReturnType<TerraformService['renderAllModules']>;

function moduleFiles(
  entries: Record<string, Partial<Record<'mainTf' | 'outputsTf' | 'terragruntHcl' | 'variablesTf', string>>>,
): ModuleFiles {
  const map: ModuleFiles = new Map();
  for (const [moduleId, files] of Object.entries(entries)) {
    map.set(moduleId, { mainTf: '', outputsTf: '', terragruntHcl: '', variablesTf: '', ...files });
  }
  return map;
}

describe('HclUtility UT', () => {
  describe('serialize()', () => {
    it('should render every file with a header, showing <empty> for blank files', () => {
      const out = HclUtility.serialize(moduleFiles({ region: { mainTf: 'resource "aws_vpc" "vpc" {\n}' } }));
      expect(out).toMatchInlineSnapshot(`
       "# region/main.tf
       resource "aws_vpc" "vpc" {
       }

       # region/outputs.tf
       <empty>

       # region/terragrunt.hcl
       <empty>

       # region/variables.tf
       <empty>"
      `);
    });

    it('should sort folders by module id', () => {
      const out = HclUtility.serialize(moduleFiles({ a: { mainTf: 'a' }, b: { mainTf: 'b' } }));
      expect(out.indexOf('# a/main.tf')).toBeLessThan(out.indexOf('# b/main.tf'));
    });
  });

  describe('diffBlocks()', () => {
    it('should report no changes for identical renders', () => {
      const render = HclUtility.serialize(moduleFiles({ region: { mainTf: 'resource "x" "y" {\n  a = 1\n}' } }));
      expect(HclUtility.diffBlocks(render, render)).toBe('<no changes>');
    });

    it('should show a full body for an added block', () => {
      const before = '# region/main.tf\nresource "x" "a" {\n  v = 1\n}';
      const after = '# region/main.tf\nresource "x" "a" {\n  v = 1\n}\n\nresource "x" "b" {\n  v = 2\n}';
      expect(HclUtility.diffBlocks(before, after)).toMatchInlineSnapshot(`
       "+ region/main.tf
       resource "x" "b" {
         v = 2
       }"
      `);
    });

    it('should show a full old body for a removed block', () => {
      const before = '# region/main.tf\nresource "x" "a" {\n  v = 1\n}\n\nresource "x" "b" {\n  v = 2\n}';
      const after = '# region/main.tf\nresource "x" "a" {\n  v = 1\n}';
      expect(HclUtility.diffBlocks(before, after)).toMatchInlineSnapshot(`
       "- region/main.tf
       resource "x" "b" {
         v = 2
       }"
      `);
    });

    it('should show a line-level hunk for a changed block', () => {
      const before = HclUtility.serialize(moduleFiles({ region: { mainTf: 'resource "x" "y" {\n  a = 1\n}' } }));
      const after = HclUtility.serialize(moduleFiles({ region: { mainTf: 'resource "x" "y" {\n  a = 2\n}' } }));
      expect(HclUtility.diffBlocks(before, after)).toMatchInlineSnapshot(`
       "~ region/main.tf resource "x" "y" {
       @@ -1,3 +1,3 @@
         resource "x" "y" {
       -   a = 1
       +   a = 2
         }"
      `);
    });

    it('should keep a block with a blank line inside it whole', () => {
      const before = '# region/main.tf\nresource "x" "a" {\n  v = 1\n\n  depends_on = [x.b]\n}';
      const after = '# region/main.tf\nresource "x" "a" {\n  v = 2\n\n  depends_on = [x.b]\n}';
      expect(HclUtility.diffBlocks(before, after)).toMatchInlineSnapshot(`
       "~ region/main.tf resource "x" "a" {
       @@ -1,3 +1,3 @@
         resource "x" "a" {
       -   v = 1
       +   v = 2
         "
      `);
    });

    it('should show an added block that shares its header with another block', () => {
      const before = '# region/main.tf\nprovider "aws" {\n  alias = "a"\n}';
      const after = '# region/main.tf\nprovider "aws" {\n  alias = "a"\n}\n\nprovider "aws" {\n  alias = "b"\n}';
      expect(HclUtility.diffBlocks(before, after)).toMatchInlineSnapshot(`
       "+ region/main.tf
       provider "aws" {
         alias = "b"
       }"
      `);
    });

    it('should show a changed block that shares its header with another block', () => {
      const before =
        '# region/main.tf\nprovider "aws" {\n  alias = "a"\n  region = "r1"\n}\n\nprovider "aws" {\n  alias = "b"\n  region = "r1"\n}';
      const after =
        '# region/main.tf\nprovider "aws" {\n  alias = "a"\n  region = "r1"\n}\n\nprovider "aws" {\n  alias = "b"\n  region = "r2"\n}';
      expect(HclUtility.diffBlocks(before, after)).toMatchInlineSnapshot(`
       "~ region/main.tf provider "aws" { alias = "b"
       @@ -2,3 +2,3 @@
           alias = "b"
       -   region = "r1"
       +   region = "r2"
         }"
      `);
    });
  });

  describe('parse()', () => {
    it('should read nothing from text with no resource or data blocks', () => {
      expect(HclUtility.parse('terraform {\n  required_version = ">= 1.6.0"\n}')).toEqual({ data: {}, resource: {} });
    });

    it('should key resources and data sources by their terraform address', () => {
      const hcl = [
        'provider "aws" {',
        '  region = "us-east-1"',
        '}',
        '',
        'resource "aws_vpc" "vpc-region" {',
        '  cidr_block = "10.0.0.0/16"',
        '}',
        '',
        'data "aws_iam_policy" "policy" {',
        '  name = "ReadOnly"',
        '}',
      ].join('\n');

      expect(HclUtility.parse(hcl)).toEqual({
        data: { 'data.aws_iam_policy.policy': { name: 'ReadOnly' } },
        resource: { 'aws_vpc.vpc-region': { cidr_block: '10.0.0.0/16' } },
      });
    });

    it('should unquote strings and keep every other value as its text', () => {
      const hcl = [
        'resource "aws_lb" "alb" {',
        '  internal = false',
        '  name = "api"',
        '  security_groups = [aws_security_group.sg.id]',
        '  vpc_id = var.vpc_VpcId',
        '}',
      ].join('\n');

      expect(HclUtility.parse(hcl).resource['aws_lb.alb']).toEqual({
        internal: 'false',
        name: 'api',
        security_groups: '[aws_security_group.sg.id]',
        vpc_id: 'var.vpc_VpcId',
      });
    });

    it('should read nested blocks, and a repeated nested block as an array', () => {
      const hcl = [
        'resource "aws_lb_listener" "listener" {',
        '  default_action {',
        '    type = "forward"',
        '  }',
        '  tags = {',
        '    Name = "listener"',
        '  }',
        '  rule {',
        '    priority = 1',
        '  }',
        '  rule {',
        '    priority = 2',
        '  }',
        '}',
      ].join('\n');

      expect(HclUtility.parse(hcl).resource['aws_lb_listener.listener']).toEqual({
        default_action: { type: 'forward' },
        rule: [{ priority: '1' }, { priority: '2' }],
        tags: { Name: 'listener' },
      });
    });

    it('should keep a value spanning lines whole, ignoring brackets inside strings', () => {
      const hcl = [
        'resource "aws_ecs_task_definition" "task" {',
        '  container_definitions = jsonencode([',
        '    {',
        '      command = ["echo", "}"]',
        '    }',
        '  ])',
        '  family = "backend"',
        '}',
      ].join('\n');

      expect(HclUtility.parse(hcl).resource['aws_ecs_task_definition.task']).toEqual({
        container_definitions: 'jsonencode([\n    {\n      command = ["echo", "}"]\n    }\n  ])',
        family: 'backend',
      });
    });

    it('should read every module of a serialized render', () => {
      const render = HclUtility.serialize(
        moduleFiles({
          region: { mainTf: 'resource "aws_vpc" "vpc" {\n  cidr_block = "10.0.0.0/16"\n}' },
          subnet: { mainTf: 'resource "aws_subnet" "subnet" {\n  vpc_id = var.vpc_VpcId\n}' },
        }),
      );

      expect(Object.keys(HclUtility.parse(render).resource)).toEqual(['aws_vpc.vpc', 'aws_subnet.subnet']);
    });
  });

  describe('unifiedDiff()', () => {
    it('should return an empty string for identical inputs', () => {
      expect(HclUtility.unifiedDiff('a\nb\nc', 'a\nb\nc')).toBe('');
    });

    it('should show only the changed line plus context for a single-line change', () => {
      const before = ['tags = {', '  tag1 = "value1"', '}'].join('\n');
      const after = ['tags = {', '  tag1 = "value1_1"', '  tag2 = "value2"', '}'].join('\n');
      expect(HclUtility.unifiedDiff(before, after, { contextLines: 1 })).toMatchInlineSnapshot(`
       "@@ -1,3 +1,4 @@
         tags = {
       -   tag1 = "value1"
       +   tag1 = "value1_1"
       +   tag2 = "value2"
         }"
      `);
    });

    it('should mark every line removed when the after is empty', () => {
      expect(HclUtility.unifiedDiff('a\nb', '', { contextLines: 1 })).toMatchInlineSnapshot(`
       "@@ -1,2 +0,0 @@
       - a
       - b"
      `);
    });

    it('should mark every line added when the before is empty', () => {
      expect(HclUtility.unifiedDiff('', 'a\nb', { contextLines: 1 })).toMatchInlineSnapshot(`
       "@@ -0,0 +1,2 @@
       + a
       + b"
      `);
    });

    it('should split far-apart changes into separate hunks', () => {
      const before = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7'].join('\n');
      const after = ['l1-changed', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7-changed'].join('\n');
      expect(HclUtility.unifiedDiff(before, after, { contextLines: 1 })).toMatchInlineSnapshot(`
       "@@ -1,2 +1,2 @@
       - l1
       + l1-changed
         l2
       @@ -6,2 +6,2 @@
         l6
       - l7
       + l7-changed"
      `);
    });

    it('should merge nearby changes into a single hunk', () => {
      const before = ['l1', 'l2', 'l3', 'l4', 'l5'].join('\n');
      const after = ['l1-changed', 'l2', 'l3', 'l4', 'l5-changed'].join('\n');
      expect(HclUtility.unifiedDiff(before, after, { contextLines: 3 })).toMatchInlineSnapshot(`
       "@@ -1,5 +1,5 @@
       - l1
       + l1-changed
         l2
         l3
         l4
       - l5
       + l5-changed"
      `);
    });

    it('should not emit ANSI escape sequences', () => {
      const out = HclUtility.unifiedDiff('a', 'b');
      expect(out.includes(String.fromCharCode(27))).toBe(false);
    });
  });
});
