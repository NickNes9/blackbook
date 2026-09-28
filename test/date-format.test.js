import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const core = readFileSync(new URL('../public/js/core.js', import.meta.url), 'utf8');

function appWithFormat(dateFormat) {
  const context = { window: {}, localStorage: { getItem: () => '' } };
  vm.runInNewContext(core, context);
  const app = context.window.BlackBook;
  app.data = { settings: dateFormat ? { dateFormat } : { dateSeparator: '.' } };
  return app;
}

test('date formats round trip with numbers, month names, and short years', () => {
  const cases = [
    ['DDMMYYYY', '07092026'],
    ['DD/MM/YYYY', '07/09/2026'],
    ['D MMM YY', '7 SEP 26'],
    ['YYYY-MM-DD', '2026-09-07']
  ];
  for (const [format, displayed] of cases) {
    const app = appWithFormat(format);
    assert.equal(app.validDateFormat(format), true);
    assert.equal(app.fmtDateInput('2026-09-07'), displayed);
    assert.equal(app.parseDateInput(displayed), '2026-09-07');
  }
});

test('invalid dates and incomplete format patterns are rejected', () => {
  const app = appWithFormat('DDMMYYYY');
  assert.equal(app.parseDateInput('31022026'), null);
  for (const format of ['DD/MM', 'DD/MM/YYYY/YY', 'MMYYYY', 'DATE', 'DD-X-YYYY', 'DD MMMM YYYY'])
    assert.equal(app.validDateFormat(format), false);
});

test('existing separator setting and entered day-first dates remain readable', () => {
  const app = appWithFormat();
  assert.equal(app.fmtDateInput('2026-09-07'), '7.9.2026');
  assert.equal(app.parseDateInput('7.9.2026'), '2026-09-07');
  assert.equal(app.parseDateInput('07/09/2026'), '2026-09-07');
});
