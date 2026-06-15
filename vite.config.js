import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

const SAVE_FILE_PATH = path.resolve(__dirname, 'savegame.json');

let serverState = null; 
try {
  if (fs.existsSync(SAVE_FILE_PATH)) {
    serverState = JSON.parse(fs.readFileSync(SAVE_FILE_PATH, 'utf-8'));
  }
} catch (e) {
  console.error("Error reading savegame.json:", e);
}

export default defineConfig({
  server: {
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/save' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              serverState = JSON.parse(body);
              fs.writeFileSync(SAVE_FILE_PATH, JSON.stringify(serverState, null, 2), 'utf-8');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
        } else if (req.url === '/api/load' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ state: serverState }));
        } else {
          next();
        }
      });
    }
  }
});
