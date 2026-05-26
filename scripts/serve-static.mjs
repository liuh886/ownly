import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const rootArg = process.argv[2] || 'out';
const port = Number(process.env.PORT || process.argv[3] || 3000);
const host = process.env.HOST || '0.0.0.0';
const root = resolve(process.cwd(), rootArg);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function resolveRequestPath(url) {
  const pathname = decodeURIComponent(new URL(url, `http://${host}:${port}`).pathname);
  const normalized = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const candidate = resolve(root, `.${sep}${normalized}`);

  if (!candidate.startsWith(root)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;

  const indexPath = join(candidate, 'index.html');
  if (existsSync(indexPath) && statSync(indexPath).isFile()) return indexPath;

  return join(root, 'index.html');
}

createServer((request, response) => {
  if (!request.url) {
    response.writeHead(400);
    response.end('Bad Request');
    return;
  }

  const filePath = resolveRequestPath(request.url);
  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404);
    response.end('Not Found');
    return;
  }

  response.writeHead(200, {
    'Cache-Control': filePath.includes(`${sep}_next${sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
    'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
  });
  createReadStream(filePath).pipe(response);
}).listen(port, host, () => {
  console.log(`Ownly static server listening on http://${host}:${port}`);
});
