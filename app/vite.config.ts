import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// https + all network interfaces, so a phone on the same wifi gets a secure origin (Web MIDI needs one).
// `npm run dev:http` is the plain localhost server.
const plain = process.env.PLAIN_HTTP === '1';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) }, // shown top-right so you can tell which build a device has
  plugins: plain ? [] : [basicSsl()],
  server: { port: 5173, host: !plain },
  preview: { host: !plain },
  // Scores stay separate files however small (Vite folds anything under 4 kB into the script), so a build can be checked by counting them.
  build: { assetsInlineLimit: (file) => (/\.(mxl|musicxml|xml)$/.test(file) ? false : undefined) },
  test: { include: ['src/**/*.test.ts'] },
});
