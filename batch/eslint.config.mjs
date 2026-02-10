import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Aplica las reglas recomendadas de ESLint
  eslint.configs.recommended,

  // Aplica las reglas recomendadas de TypeScript-ESLint
  ...tseslint.configs.recommended,

  // Tu configuración personalizada
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);