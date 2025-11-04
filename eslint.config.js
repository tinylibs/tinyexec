import eslint from '@eslint/js';
import {configs as tseslintConfigs} from 'typescript-eslint';

const {configs: eslintConfigs} = eslint;

export default [
  {
    files: [
      'src/**/*.ts'
    ]
  },
  eslintConfigs.recommended,
  ...tseslintConfigs.strict,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': 'off'
    }
  },
  {
    files: [
      'src/test/**/*.ts'
    ],
    rules: {
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-expressions': 'off'
    }
  }
];
