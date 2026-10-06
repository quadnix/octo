import { dirname } from 'path';
import { fileURLToPath } from 'url';
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
};

export const config = env.config<Configuration>((env) => {
  return {
    AWS_ACCOUNT_ID: env.AWS_ACCOUNT_ID,
  };
});
