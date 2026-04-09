import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';

export default [
    {
        ignores: ['dist/**', 'node_modules/**', 'codex-clean-main/**'],
    },
    js.configs.recommended,
    {
        files: [
            'src/**/*.{ts,tsx}',
            'scripts/**/*.mjs',
            '*.config.js',
            '*.config.ts',
            'eslint.config.js',
            'vitest.config.ts',
        ],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: false,
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
            globals: {
                process: 'readonly',
                console: 'readonly',
                URL: 'readonly',
                __dirname: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
            react: reactPlugin,
        },
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'react/react-in-jsx-scope': 'off',
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
    },
];
