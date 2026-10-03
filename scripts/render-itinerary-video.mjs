import { app } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderItineraryVideo } from '../src/main/itinerary-video.ts';
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    const plan = JSON.parse(await readFile(process.argv[2], 'utf8'));
    const result = await renderItineraryVideo(
      plan,
      Number(process.argv[3] ?? 0),
      path.resolve(process.argv[4] ?? 'artifacts/itinerary-video'),
      (label) => process.stdout.write(label + '\n'),
    );
    const { dataURL, ...metadata } = result;
    await writeFile(
      path.join(path.dirname(result.filePath), 'result.json'),
      JSON.stringify(metadata, null, 2),
    );
    process.stdout.write(JSON.stringify(metadata) + '\n');
    app.quit();
  } catch (error) {
    process.stderr.write(String(error) + '\n');
    app.exit(1);
  }
});
