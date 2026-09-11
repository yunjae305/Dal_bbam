import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      // The app intentionally renders remote TourAPI/Supabase images whose hosts
      // are content-driven. They keep explicit alt text and bounded dimensions.
      '@next/next/no-img-element': 'off',
      // These compiler-oriented rules currently flag established data-loading
      // effects and mutable media refs. Keep them visible without failing CI.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn'
    }
  },
  globalIgnores([
    '.next/**',
    '**/.next/**',
    'playwright-report/**',
    '.playwright-browsers/**',
    'coverage/**',
    'out/**',
    'build/**',
    'test-results/**',
    'next-env.d.ts'
  ])
]);
