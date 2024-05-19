import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { BuildFileParser } from '../../src/parsers/build-file.parser.js';

describe('js-yaml E2E', () => {
  it('should throw error reading non-existent file', () => {
    const filePath = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'not-exists.yml'));
    expect(() => {
      load(readFileSync(filePath, 'utf-8'));
    }).toThrow();
  });

  it('should be able to read and parse valid yml', () => {
    const filePath = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'success-build.yml'));
    const json = load(readFileSync(filePath, 'utf-8'));
    const parsed = BuildFileParser.parse(json);
    expect(parsed).toMatchInlineSnapshot(`
      {
        "dist": "dist",
        "env": {
          "KEY1": "value1",
          "Key3": "value3",
          "key2": "value2",
        },
        "jobs": {
          "job1": {
            "command": "command1",
            "dependsOn": [],
            "onError": "throw",
            "retry": 0,
            "timeout": 0,
          },
          "job2": {
            "command": "command2",
            "dependsOn": [
              "job1",
            ],
            "onError": "ignore",
            "retry": 1,
            "timeout": 1000,
          },
          "job3": {
            "command": "command3",
            "dependsOn": [
              "job1",
              "job2",
            ],
            "onError": "throw",
            "retry": 0,
            "timeout": 0,
          },
        },
      }
    `);
  });

  it('should be able to read and parse empty yml', () => {
    const filePath = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'empty-build.yml'));
    const json = load(readFileSync(filePath, 'utf-8'));
    const parsed = BuildFileParser.parse(json);
    expect(parsed).toMatchInlineSnapshot(`
      {
        "dist": "",
        "env": {},
        "jobs": {},
      }
    `);
  });

  it('should be able to read and parse simple yaml', () => {
    const filePath = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'simple-build.yaml'));
    const json = load(readFileSync(filePath, 'utf-8'));
    const parsed = BuildFileParser.parse(json);
    expect(parsed).toMatchInlineSnapshot(`
      {
        "dist": "build",
        "env": {},
        "jobs": {},
      }
    `);
  });
});
