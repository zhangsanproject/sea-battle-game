import { copyFile, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const sourceDir = path.join(root, 'minigame');
const outputDir = path.join(root, 'minigame-dist');

// The devtools compiles every .js it finds under the imported directory, so a
// single stray file (a macOS __MACOSX resource fork, an unzipped template, a
// leftover folder) breaks the build with a confusing syntax error.
const expectedEntries = new Set(['game.js', 'game.json', 'project.config.json']);

await mkdir(outputDir, { recursive: true });

for (const file of ['game.json', 'project.config.json']) {
  await copyFile(path.join(sourceDir, file), path.join(outputDir, file));
}

// Prune anything the build did not produce. This makes the output directory
// self-healing: import it, drop junk in it, rebuild, and it is clean again.
const entries = await readdir(outputDir, { withFileTypes: true });
for (const entry of entries) {
  if (expectedEntries.has(entry.name)) continue;
  await rm(path.join(outputDir, entry.name), { recursive: true, force: true });
  console.warn(`Removed unexpected entry from minigame-dist/: ${entry.name}`);
}

const remaining = new Set(
  (await readdir(outputDir)).filter((name) => expectedEntries.has(name)),
);
for (const name of expectedEntries) {
  if (!remaining.has(name)) {
    console.error(`minigame-dist/ is missing ${name}`);
    process.exitCode = 1;
  }
}

const bundle = await stat(path.join(outputDir, 'game.js')).catch(() => null);
if (!bundle) {
  console.error('minigame-dist/game.js was not produced by the Vite build.');
  process.exitCode = 1;
} else {
  console.log(
    `minigame-dist/ ready: game.js ${(bundle.size / 1024).toFixed(1)} KB, ` +
      'game.json, project.config.json',
  );
}

const projectConfig = JSON.parse(
  await readFile(path.join(outputDir, 'project.config.json'), 'utf8'),
);

if (!projectConfig.douyinProjectType) {
  console.warn(
    'project.config.json has no douyinProjectType; the devtools may not recognise the project as a Douyin mini game.',
  );
}
if (!projectConfig.appid || /^tt0+$/.test(projectConfig.appid)) {
  console.warn(
    `project.config.json still uses the placeholder appid (${projectConfig.appid}). ` +
      'Replace it with your own mini-game AppID before importing into the devtools.',
  );
}
