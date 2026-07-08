import 'vitest';
import type { AxeMatchers } from 'vitest-axe/matchers';

declare module 'vitest' {
  export interface Assertion<T = any> extends AxeMatchers {}
  export interface AsymmetricMatchersContaining extends AxeMatchers {}
}
