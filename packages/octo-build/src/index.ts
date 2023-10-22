#!/usr/bin/env node

import yargs from 'yargs/yargs';

const parser = yargs(process.argv.slice(2)).options({
  a: { default: false, type: 'boolean' },
});

const argv = await parser.argv;
console.log(argv.a);
