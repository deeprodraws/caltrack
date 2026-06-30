import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const certPath = path.join(__dirname, 'certs', 'cert.pem');
const keyPath  = path.join(__dirname, 'certs', 'key.pem');
const hasCerts = fs.existsSync(certPath) && fs.existsSync(keyPath);
// Require explicit opt-in so the dev preview (which can't trust mkcert certs) stays HTTP.
// Run `$env:VITE_HTTPS="true"; npm run dev` in PowerShell when you need LAN HTTPS.
const useHttps = process.env.VITE_HTTPS === 'true' && hasCerts;

export default defineConfig({
  plugins: [react()],
  server: {
    host: useHttps ? true : undefined,
    port: Number(process.env.PORT) || 5173,
    https: useHttps
      ? { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) }
      : undefined,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
