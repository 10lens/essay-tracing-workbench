import test from 'node:test';
import assert from 'node:assert/strict';
import { COLS, TOTAL_ROWS, TOTAL_CELLS, makeLayoutRows, makeCompositionRows } from '../layout.js';

test('approved template grid capacity is three columns × 27 rows × 17 cells', () => {
  assert.equal(COLS, 17);
  assert.equal(TOTAL_ROWS, 81);
  assert.equal(TOTAL_CELLS, 1377);
});

test('title is one centered row and paragraph first line receives indent', () => {
  const rows = makeLayoutRows('标题', '第一段内容', { titleAlign: 'center', bodyAlign: 'left', indent: 2, paragraphGap: 0 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].cells[7], '标');
  assert.equal(rows[0].cells[8], '题');
  assert.equal(rows[1].cells[0], '');
  assert.equal(rows[1].cells[1], '');
  assert.equal(rows[1].cells[2], '第');
});

test('paragraph gap adds the requested empty rows', () => {
  const rows = makeLayoutRows('', '第一段\n第二段', { indent: 0, paragraphGap: 2, bodyAlign: 'left' });
  assert.equal(rows.length, 4);
  assert.equal(rows[1].kind, 'blank');
  assert.equal(rows[2].kind, 'blank');
});

test('bottom critique reports conflict when essay occupies card area', () => {
  const essay = Array(79).fill('每行正文内容').join('\n');
  const { info } = makeCompositionRows('', essay, '点评内容', { indent: 0, critiqueMode: 'card', critiquePlacement: 'bottom', critiqueFontSize: 10 });
  assert.equal(info.conflict, true);
});

test('short essay without critique fits within one writing column', () => {
  const { rows, info } = makeCompositionRows('标题', '这是一段短作文。', '', { indent: 2, titleAlign: 'center', bodyAlign: 'left' });
  assert.equal(rows.length, 2);
  assert.equal(info.overflow, false);
  assert.equal(info.conflict, false);
});
