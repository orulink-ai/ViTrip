import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staging = path.join(root, '.packaging');
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
mkdirSync(staging, { recursive: true });
cpSync(path.join(root, 'dist'), path.join(staging, 'dist'), { recursive: true });
cpSync(path.join(root, 'skills'), path.join(staging, 'skills'), { recursive: true });
cpSync(path.join(root, 'docs'), path.join(staging, 'dist', 'licenses'), { recursive: true });
cpSync(path.join(root, 'LICENSE'), path.join(staging, 'dist', 'LICENSE'));
writeFileSync(
  path.join(staging, 'package.json'),
  JSON.stringify({
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: 'ViTrip',
    license: 'MIT',
    type: 'module',
    main: 'dist/main.mjs',
    dependencies: {
      '@earendil-works/pi-coding-agent': manifest.dependencies['@earendil-works/pi-coding-agent'],
      'sanitize-html': manifest.dependencies['sanitize-html'],
    },
  }),
);
execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
  cwd: staging,
  stdio: 'inherit',
});
const config = {
  appId: 'com.vitrip.desktop',
  protocols: [{ name: 'ViTrip 本机引用链接', schemes: ['vitrip'] }],
  productName: 'ViTrip',
  electronVersion: manifest.devDependencies.electron,
  npmRebuild: false,
  asar: true,
  directories: { output: path.join(root, 'release'), buildResources: path.join(root, 'build') },
  files: ['dist/**/*', 'skills/**/*', '!dist/*-check.mjs', '!dist/main.cjs', 'package.json'],
  mac: {
    category: 'public.app-category.travel',
    icon: path.join(root, 'build/icon.icns'),
    target: 'dir',
    identity: '-',
  },
};
const configPath = path.join(staging, 'builder.json');
writeFileSync(configPath, JSON.stringify(config));
execFileSync(
  process.execPath,
  [
    path.join(root, 'node_modules/electron-builder/out/cli/cli.js'),
    '--projectDir',
    staging,
    '--mac',
    'dir',
    '--config',
    configPath,
  ],
  { stdio: 'inherit', env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } },
);

const shortcut = path.join(root, 'ViTrip.app');
if (!existsSync(shortcut))
  symlinkSync(
    process.arch === 'arm64' ? 'release/mac-arm64/ViTrip.app' : 'release/mac/ViTrip.app',
    shortcut,
  );
