import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform === 'darwin') {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const bundle = path.join(root, 'dist', 'ViTrip Calendar.app');
  const contents = path.join(bundle, 'Contents');
  const binary = path.join(contents, 'MacOS', 'ViTripCalendar');
  const source = path.join(root, 'native/calendar/main.swift');
  const plist = path.join(root, 'native/calendar/Info.plist');
  const latest = Math.max(
    statSync(source).mtimeMs,
    statSync(plist).mtimeMs,
    statSync(fileURLToPath(import.meta.url)).mtimeMs,
  );
  if (!existsSync(binary) || statSync(binary).mtimeMs < latest) {
    mkdirSync(path.dirname(binary), { recursive: true });
    copyFileSync(plist, path.join(contents, 'Info.plist'));
    execFileSync(
      'xcrun',
      [
        'swiftc',
        '-O',
        '-target',
        `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macosx12.0`,
        source,
        '-o',
        binary,
      ],
      { stdio: 'inherit' },
    );
    execFileSync(
      '/usr/bin/codesign',
      ['--force', '--sign', '-', '--identifier', 'com.vitrip.calendar', bundle],
      { stdio: 'inherit' },
    );
  }
}
