/** Keep isolated Electron tests off the user's desktop unless explicitly requested. */
export function backgroundTest(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.VITRIP_TEST_DATA) && env.VITRIP_TEST_SHOW !== '1';
}
