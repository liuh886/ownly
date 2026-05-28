import { readFile, stat } from 'node:fs/promises';

const REQUIRED_RELEASE_FILES = ['manifest.json', 'versions.json', 'main.js', 'styles.css'];

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function assertFileExists(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size <= 0) {
    throw new Error(`${path} is missing or empty.`);
  }
}

const [packageJson, manifestJson, versionsJson] = await Promise.all([
  readJson('package.json'),
  readJson('manifest.json'),
  readJson('versions.json'),
]);

for (const path of REQUIRED_RELEASE_FILES) {
  await assertFileExists(path);
}

if (manifestJson.id !== 'ownly') {
  throw new Error(`manifest.json id must be "ownly"; received "${manifestJson.id}".`);
}

if (manifestJson.version !== packageJson.version) {
  throw new Error(
    `Version mismatch: package.json=${packageJson.version}, manifest.json=${manifestJson.version}.`,
  );
}

if (!versionsJson[packageJson.version]) {
  throw new Error(`versions.json is missing an entry for ${packageJson.version}.`);
}

if (versionsJson[packageJson.version] !== manifestJson.minAppVersion) {
  throw new Error(
    `versions.json ${packageJson.version} must equal manifest minAppVersion ${manifestJson.minAppVersion}.`,
  );
}

if (!manifestJson.name || !manifestJson.description || !manifestJson.author) {
  throw new Error('manifest.json must include name, description, and author.');
}

console.log(`Ownly Obsidian release package is valid for ${packageJson.version}.`);
