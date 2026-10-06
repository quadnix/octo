import { createServer } from 'node:http';
import process from 'node:process';

const MEGABYTE = 'a'.repeat(1024 * 1024);

// Answers every request with as many megabytes as `STREAM_MEGABYTES` holds, written one at a time.
createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'application/octet-stream' });
  for (let index = 0; index < Number(process.env.STREAM_MEGABYTES); index++) {
    response.write(MEGABYTE);
  }
  response.end();
}).listen(Number(process.env.PORT));
