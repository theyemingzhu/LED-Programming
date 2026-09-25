import assert from 'node:assert/strict';
import test from 'node:test';

const { resolveNodeToolCommand } = await import('./node-tool-command.mjs').catch(() => ({}));

test('Windows npm runs its JavaScript CLI with the current Node, without shell argument expansion', () => {
  assert.equal(typeof resolveNodeToolCommand, 'function');
  const args = ['exec', '--', 'playwright', '--grep', 'same & different $(literal)'];
  assert.deepEqual(resolveNodeToolCommand('npm', args, {
    platform: 'win32', nodePath: 'C:\\runtime\\node.exe',
    env: { Path: 'C:\\Program Files\\nodejs;C:\\tools' },
    exists: path => path === 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
  }), {
    command: 'C:\\runtime\\node.exe',
    args: ['C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js', ...args],
  });
});

test('Node children retain the selected runtime and Unix npm remains directly executable', () => {
  assert.deepEqual(resolveNodeToolCommand('node', ['script.mjs'], { nodePath: '/runtime/node' }), {
    command: '/runtime/node', args: ['script.mjs'],
  });
  assert.deepEqual(resolveNodeToolCommand('npm', ['run', 'build'], { platform: 'linux' }), {
    command: 'npm', args: ['run', 'build'],
  });
});

test('missing Windows npm gives a repairable error instead of using a shell', () => {
  assert.throws(() => resolveNodeToolCommand('npm', [], {
    platform: 'win32', nodePath: 'C:\\node.exe', env: {}, exists: () => false,
  }), /npm-cli.js.*install Node.js/i);
});
