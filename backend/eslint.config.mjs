import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Errors are things that are wrong; warnings are things to clean up over time. CI fails on any error
// and on more warnings than the cap in package.json ("lint"), so the count can only go down.
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'uploads/**', 'prisma/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    },
  },
  // These print on purpose: before the logger exists, or as the logger itself.
  { files: ['src/config/env.ts', 'src/config/check-env.ts', 'src/utils/logger.ts'], rules: { 'no-console': 'off' } },
);
