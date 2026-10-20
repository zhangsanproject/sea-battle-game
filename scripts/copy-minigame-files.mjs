import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const sourceDir = path.join(root, 'minigame');
const outputDir = path.join(root, 'minigame-dist');

await mkdir(outputDir, { recursive: true });

for (const file of ['game.json', 'project.config.json']) {
  await copyFile(path.join(sourceDir, file), path.join(outputDir, file));
}

console.log('Copied Douyin mini-game project files to minigame-dist/');
