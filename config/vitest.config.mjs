
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        exclude: ['**/node_modules/**', '**/*.spec.ts', '**/.claude/**'],
        include: ['**/*.test.{ts,tsx}'],
        alias: {
            '@': path.resolve(__dirname, '../'),
        },
        setupFiles: [path.resolve(__dirname, '../tests/setup-env.ts')],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'json'],
            exclude: [
                'node_modules/**',
                'coverage/**',
                '**/*.test.ts',
                '**/*.spec.ts',
                '**/tests/**',
                'scripts/**',
            ],
        },
    },
});
