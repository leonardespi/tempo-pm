import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    projects: [
      {
        test: {
          name: 'server',
          include: ['server/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [react()],
        resolve: { alias: { '@': path.resolve(__dirname, './src') } },
        test: {
          name: 'client',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'happy-dom',
          globals: true,
          setupFiles: ['./src/test/setup.ts'],
        },
      },
    ],
  },
});
