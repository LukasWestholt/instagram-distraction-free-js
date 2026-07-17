import js from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
    {
        ignores: ['node_modules/**'],
    },
    js.configs.recommended,
    eslintConfigPrettier,
    {
        files: ['*.user.js'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                GM_getValue: 'readonly',
                GM_setValue: 'readonly',
                GM_xmlhttpRequest: 'readonly',
                unsafeWindow: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
            'no-empty': ['error', { allowEmptyCatch: true }],
            'no-console': 'off',
        },
    },
];
