import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// https + all network interfaces, so a phone on the same wifi gets a secure origin (Web MIDI needs one).
// `npm run dev:http` is the plain localhost server.
const plain = process.env.PLAIN_HTTP === '1';

export default defineConfig({
  plugins: plain ? [] : [basicSsl()],
  server: { port: 5173, host: !plain },
  preview: { host: !plain },
  test: { include: ['src/**/*.test.ts'] },
});
