import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
export function startServer(root = defaultRoot, port = 4173) {
  root = path.resolve(root);
  const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpeg':'image/jpeg','.json':'application/json'};
  const server = http.createServer(async (req,res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end('Use a Vercel preview for API requests.'); }
      let file = path.resolve(root, '.' + pathname);
      if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
      if (pathname === '/') file = path.join(root, 'index.html');
      else if (!path.extname(file)) file += '.html';
      if (!(await stat(file)).isFile()) throw new Error('Not a file');
      res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream'});
      res.end(req.method === 'HEAD' ? undefined : await readFile(file));
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await startServer();
  console.log('Preview at http://127.0.0.1:4173 (static pages; API requires Vercel).');
}
