import {escapeCommand, escapeArgument} from '../escape-command.js';
import * as assert from 'node:assert/strict';
import {test} from 'node:test';

const metas = [
  '(',
  ')',
  ']',
  '[',
  '%',
  '!',
  '^',
  '"',
  '`',
  '<',
  '>',
  '&',
  '|',
  ';',
  ',',
  ' ',
  '*',
  '?'
];
test('escapeCommand', async (t) => {
  await t.test('escapes meta chars', () => {
    for (const chr of metas) {
      assert.equal(escapeCommand(`foo ${chr} bar`), `foo^ ^${chr}^ bar`);
    }
  });

  await t.test('leaves non-meta chars as is', () => {
    assert.equal(escapeCommand('foo'), 'foo');
  });
});

test('escapeArgument', async (t) => {
  await t.test('doubles escapes before quotes', () => {
    assert.equal(escapeArgument('\\\\"', false), '^"\\\\\\\\\\^"^"');
  });

  await t.test('double escapes backslashes before eof', () => {
    assert.equal(escapeArgument('foo\\\\', false), '^"foo\\\\\\\\^"');
  });

  await t.test('wraps the argument in quotes', () => {
    assert.equal(escapeArgument('foo', false), '^"foo^"');
  });

  await t.test('escapes meta chars', () => {
    for (const chr of metas) {
      assert.equal(
        escapeArgument(`foo ${chr} bar`, false),
        `^"foo^ ${chr === '"' ? '\\' : ''}^${chr}^ bar^"`
      );
    }
  });

  await t.test('double escapes meta chars if specified', () => {
    for (const chr of metas) {
      assert.equal(
        escapeArgument(`foo ${chr} bar`, true),
        `^^^"foo^^^ ${chr === '"' ? '\\' : ''}^^^${chr}^^^ bar^^^"`
      );
    }
  });
});
