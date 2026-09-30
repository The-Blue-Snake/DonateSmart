/* global __dirname */

const fs = require('fs');
const path = require('path');

const sourcePath = path.join(
  __dirname,
  '..',
  'src',
  'data',
  'taxonomy-with-ids.en-US.txt'
);
const outputPath = path.join(__dirname, '..', 'src', 'data', 'taxonomy.json');

function parseTaxonomy(source) {
  const categories = [];
  const ids = new Set();
  const paths = new Set();

  source.split(/\r?\n/).forEach((line, index) => {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) return;

    const match = trimmedLine.match(/^(\d+)\s+-\s+(.+)$/);

    if (!match) {
      throw new Error(`Invalid taxonomy entry on line ${index + 1}: ${line}`);
    }

    const [, id, fullPath] = match;
    const segments = fullPath.split(' > ');

    if (segments.some((segment) => !segment.trim())) {
      throw new Error(`Invalid category path on line ${index + 1}: ${fullPath}`);
    }

    if (ids.has(id)) {
      throw new Error(`Duplicate taxonomy ID on line ${index + 1}: ${id}`);
    }

    if (paths.has(fullPath)) {
      throw new Error(`Duplicate taxonomy path on line ${index + 1}: ${fullPath}`);
    }

    ids.add(id);
    paths.add(fullPath);
    categories.push({
      id,
      name: segments[segments.length - 1],
      fullPath,
      topLevel: segments[0],
      level: segments.length,
    });
  });

  if (categories.length === 0) {
    throw new Error('The taxonomy source contains no categories.');
  }

  return categories;
}

const source = fs.readFileSync(sourcePath, 'utf8');
const categories = parseTaxonomy(source);

fs.writeFileSync(outputPath, `${JSON.stringify(categories, null, 2)}\n`);
console.log(`Generated ${categories.length} taxonomy categories at ${outputPath}`);
