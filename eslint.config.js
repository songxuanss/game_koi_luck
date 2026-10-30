import tseslint from 'typescript-eslint';

const noRealClock = [
  { selector: "MemberExpression[object.name='Date'][property.name='now']", message: 'core 内禁用 Date.now()：时间必须来自输入时间戳。' },
  { selector: "NewExpression[callee.name='Date']", message: 'core 内禁用 new Date()：时间必须来自输入时间戳。' },
  { selector: "MemberExpression[object.name='Math'][property.name='random']", message: 'core 内禁用 Math.random()：使用 shared/prng 的确定性随机。' },
  { selector: "CallExpression[callee.name=/^(setTimeout|setInterval)$/]", message: 'core 内禁用定时器：时间推进由外壳 tick 注入。' },
];

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'artifacts/**', 'client/library/**', 'client/temp/**', 'client/assets/scripts/generated/**', 'docs/**', 'openspec/**', '.opencode/**', 'tools/test/fixtures/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['packages/core/src/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', ...noRealClock] },
  },
  {
    files: ['packages/core/src/**/*.ts', 'packages/shared/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['ws', 'node:*', 'fs', 'path'], message: 'core/shared 必须平台无关、零 IO 依赖。' }] }],
    },
  },
);
