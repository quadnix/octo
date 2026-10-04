import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TestContainer, type TestModuleContainer } from '@quadnix/octo';
import {
  SERVERLESS_US_EAST_1,
  appModules,
  countByType,
  createStackTestModuleContainer,
  imageModule,
  imageTagModule,
  planStack,
  serverlessRegionModules,
} from '../../utilities/stack.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated', 'multiple-images');

describe('Multiple images E2E', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    testModuleContainer = await createStackTestModuleContainer(['us-east-1'], OUTPUT_DIR);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should plan two images in one region, and two tags of one of them', async () => {
    const { name } = SERVERLESS_US_EAST_1;
    const resource = await planStack(
      testModuleContainer,
      [
        ...appModules('multiple-images'),
        ...serverlessRegionModules(SERVERLESS_US_EAST_1),
        imageModule('backend', [name]),
        imageModule('worker', [name]),
        imageTagModule('backend', '0.0.1'),
        imageTagModule('backend', '0.0.2'),
        imageTagModule('worker', '0.0.1'),
      ],
      OUTPUT_DIR,
    );

    expect(countByType(Object.keys(resource))).toMatchInlineSnapshot(`
     {
       "aws_ecr_repository": 2,
       "null_resource": 3,
     }
    `);
  }, 1_800_000);
});
