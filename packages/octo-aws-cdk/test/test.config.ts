import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import env from 'env-smart';

const __dirname = dirname(fileURLToPath(import.meta.url));

env.load({
  directory: __dirname,
  envDefaultsFilename: '.env.defaults',
  envFilename: '.env',
  inlineTypes: false,
  process: true,
});

type Configuration = {
  AWS_ACCOUNT_ID: string;
  AWS_REGION_ID: string;
};

export const config = env.config<Configuration>((env) => {
  return {
    AWS_ACCOUNT_ID: env.AWS_ACCOUNT_ID,
    AWS_REGION_ID: env.AWS_REGION_ID,
  };
});
