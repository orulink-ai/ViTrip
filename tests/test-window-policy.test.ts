import { expect, it } from 'vitest';
import { backgroundTest } from '../src/main/test-window-policy';
it('only isolated test instances default to the background; visible tests require explicit opt-in', () => {
  expect(backgroundTest({})).toBe(false);
  expect(backgroundTest({ VITRIP_TEST_DATA: '/tmp/test' })).toBe(true);
  expect(backgroundTest({ VITRIP_TEST_DATA: '/tmp/test', VITRIP_TEST_SHOW: '1' })).toBe(false);
  expect(backgroundTest({ VITRIP_TEST_SHOW: '0' })).toBe(false);
});
