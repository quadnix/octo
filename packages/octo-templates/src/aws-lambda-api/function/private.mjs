import { createServer } from 'node:http';
import process from 'node:process';

// Answers every request with who it is. Its URL admits no one by its own policy, so only a caller whose role
// allows it gets this far.
createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ from: 'private' }));
}).listen(Number(process.env.PORT));
