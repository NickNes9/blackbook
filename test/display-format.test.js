import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/js/core.js', import.meta.url), 'utf8');

test('exact monetary formatting does not depend on viewport width', () => {
  for (const width of [320, 700, 900, 1600]) {
    const context = { window: { innerWidth: width }, localStorage: { getItem: () => null } };
    vm.runInNewContext(source, context);
    const app = context.window.BlackBook;
    assert.equal(app.fmtNumber(70000), '70,000.00');
    assert.equal(app.fmtNumber(0.01), '0.01');
    assert.equal(app.fmtNumber(-12.34), '-12.34');
    assert.equal(app.fmtNumber(1234567.89), '1,234,567.89');
  }
});

test('shared chart styling keeps forecast date labels bounded without changing overview ticks', () => {
  const context = { window: {}, localStorage: { getItem: () => null } };
  vm.runInNewContext(source, context);
  const app = context.window.BlackBook;
  assert.equal(app.lineChartOptions().scales.x.ticks.autoSkip, false);
  const forecast = app.lineChartOptions({ autoSkip: true, maxTicksLimit: 8 });
  assert.equal(forecast.scales.x.ticks.autoSkip, true);
  assert.equal(forecast.scales.x.ticks.maxTicksLimit, 8);
  assert.equal(forecast.scales.y.ticks.color, app.lineChartOptions().scales.y.ticks.color);
});
