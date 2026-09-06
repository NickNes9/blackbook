import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function evaluator() {
  const context = { window: {} };
  vm.runInNewContext(readFileSync(new URL('../public/js/amount-parser.js', import.meta.url), 'utf8'), context);
  return context.window.BlackBookAmount.evaluateAmount;
}

test('amount parser supports ordinary values and safe arithmetic without dynamic evaluation', () => {
  const evaluate = evaluator();
  assert.equal(evaluate('1250'), 1250);
  assert.equal(evaluate('12,50'), 12.5);
  assert.equal(evaluate('50+20*3'), 110);
  assert.equal(evaluate('(2+3)*4'), 20);
  assert.equal(evaluate('-10.25'), -10.25);
});

test('amount parser rejects malformed and unsafe expressions', () => {
  const evaluate = evaluator();
  assert.ok(Number.isNaN(evaluate('5/0')));
  assert.ok(Number.isNaN(evaluate('alert(1)')));
  assert.ok(Number.isNaN(evaluate('2+')));
});
