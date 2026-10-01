/**
 * Minimal static file server for the exported app (`next build` runs with
 * `output: export`, so there is no Next server to start).
 *
 * Python's `http.server` stalls under Chromium's parallel chunk loading, which
 * shows up as phantom `status: 0` fetch failures and makes the smoke tests
 * flaky. Node's HTTP server handles the concurrency and keep-alive correctly.
 *
 * Usage: node tests/smoke/static-server.mjs <root-dir> <port>
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function resolveTarget(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  // Normalize first so `..` cannot escape the served root.
  const relative = normalize(decoded).replace(/^([/\\])+/, '');
  let candidate = resolve(root, relative);
  if (!candidate.startsWith(root + sep) && candidate !== root) return null;
  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    candidate = join(candidate, 'index.html');
  }
  return candidate;
}

export function startStaticServer(rootDir, port) {
  const root = resolve(rootDir);
  const server = createServer((request, response) => {
    const target = resolveTarget(root, request.url ?? '/');
    if (!target || !existsSync(target)) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'content-type': MIME[extname(target)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(target).pipe(response);
  });

  return new Promise((resolveReady, rejectReady) => {
    server.on('error', rejectReady);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      resolveReady({
        server,
        port: typeof address === 'object' && address ? address.port : port,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

// `import.meta.url === \`file://${argv[1]}\`` breaks on Windows, where the URL
// has three slashes. Compare resolved paths instead.
const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const [, , rootArg = 'out', portArg = '47123'] = process.argv;
  startStaticServer(rootArg, Number(portArg)).then(({ port }) => {
    console.log(`serving ${resolve(rootArg)} on http://127.0.0.1:${port}`);
  });
}
