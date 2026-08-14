const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyPlugin, countCategories, categoryLabel } = require('./marketplace-categories');

test('topics beat description keywords', () => {
  assert.equal(classifyPlugin({
    topics: ['tui'],
    description: 'cron scheduler for agents',
  }), 'ui');
});

test('keywords beat repository name', () => {
  assert.equal(classifyPlugin({
    keywords: ['telegram'],
    name: 'dsh-better-sidebar',
  }), 'notify');
});

test('classifies common plugin families from prose', () => {
  assert.equal(classifyPlugin({ name: 'dsh-review-loop', description: 'incremental review workflow' }), 'workflow');
  assert.equal(classifyPlugin({ name: 'dsh-web-search-pro', description: 'multi-engine search tool' }), 'tool');
  assert.equal(classifyPlugin({ description: '桌面通知提醒' }), 'notify');
  assert.equal(classifyPlugin({ name: 'dsh-explain', description: 'learning mode that explains steps' }), 'learn');
  assert.equal(classifyPlugin({ name: 'dsh-reloader', description: 'reload after plugin install' }), 'dev');
  assert.equal(classifyPlugin({ name: 'awesome-list', description: 'curated links' }), 'other');
});

test('ignores the discovery topic itself', () => {
  assert.equal(classifyPlugin({
    topics: ['dsh-plugin', 'deepseek-harness'],
    description: 'random notes',
  }), 'other');
});

test('countCategories includes empty buckets and all', () => {
  const rows = countCategories([
    { category: 'ui' },
    { category: 'ui' },
    { category: 'tool' },
  ]);
  assert.equal(rows[0].id, 'all');
  assert.equal(rows[0].count, 3);
  assert.equal(rows.find((row) => row.id === 'ui').count, 2);
  assert.equal(rows.find((row) => row.id === 'learn').count, 0);
  assert.equal(categoryLabel('ui'), '界面');
});
