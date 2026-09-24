// Runs before every test file (see `test.setupFiles` in vite.config.ts).
import { config } from '@vue/test-utils';
import { afterEach, beforeEach, expect, vi, type MockInstance } from 'vitest';

// A Vue warning (a missing prop, a wrong prop type, an unknown element, …) fails the test.
config.global.config.warnHandler = (message) => {
  throw new Error(`[Vue warn] ${message}`);
};

// So does any unexpected console.error. A test that expects one can stub it with
// `vi.spyOn(console, 'error').mockImplementation(() => undefined)` and check the calls itself.
let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error');
});

afterEach(() => {
  const calls = consoleError.mock.calls;
  const isStubbed = consoleError.getMockImplementation() !== undefined;
  consoleError.mockRestore();
  if (!isStubbed) {
    expect(calls, 'unexpected console.error call').toEqual([]);
  }
});
