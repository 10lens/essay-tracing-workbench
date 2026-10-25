import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('answer-card preview remains visible beneath a transparent canvas', async () => {
  const css = await readFile(path.join(root, 'styles.css'), 'utf8');
  assert.match(css, /#previewFallback\s*\{[^}]*display:\s*block/s);
  assert.match(css, /\.paper-wrap\.has-rendered #previewFallback\s*\{\s*display:\s*block/s);
  assert.doesNotMatch(css, /\.paper-wrap\.has-rendered #previewFallback\s*\{\s*display:\s*none/s);
  const app = await readFile(path.join(root, 'app.js'), 'utf8');
  assert.match(app, /canvas\.getContext\("2d", \{ alpha: true \}\)/);
  assert.match(app, /drawTextOverlay\(ctx, rows, getOptions\(\), canvas\.width, canvas\.height\)/);
});

test('bundled Chinese Kai font and its license ship with the PWA', async () => {
  const fontPath = path.join(root, 'assets', 'arphic-kaiti-gb.ttf');
  const licensePath = path.join(root, 'assets', 'ARPHICPL.TXT');
  assert.ok((await stat(fontPath)).size > 1_000_000);
  const license = await readFile(licensePath, 'utf8');
  assert.match(license, /ARPHIC PUBLIC LICENSE/);
  assert.match(license, /ARPHICPL\.TXT/);
  const sw = await readFile(path.join(root, 'sw.js'), 'utf8');
  assert.match(sw, /arphic-kaiti-gb\.ttf/);
});
