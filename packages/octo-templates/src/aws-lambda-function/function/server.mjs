import { createServer } from 'node:http';
import process from 'node:process';

// Answers every request with what it was asked, and the greeting its environment holds.
createServer((request, response) => {
  let body = '';
  request.on('data', (chunk) => (body += chunk));
  request.on('end', () => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ body, greeting: process.env.GREETING, method: request.method, path: request.url }));
  });
}).listen(Number(process.env.PORT));
