(() => {
  const roundMoney = (value) => Number.isFinite(value) ? Math.round(value * 100) / 100 : NaN;

  function evaluateAmount(input) {
    const text = String(input == null ? '' : input).trim().replace(/\s+/g, '').replace(',', '.');
    if (!text) return NaN;
    if (!/^[0-9+\-*/().]+$/.test(text)) return roundMoney(Number(text));

    const tokens = text.match(/(?:\d+\.?\d*|\.\d+)|[()+\-*/]/g);
    if (!tokens || tokens.join('') !== text) return NaN;
    let index = 0;
    const peek = () => tokens[index];
    const take = () => tokens[index++];

    const factor = () => {
      if (peek() === '+') { take(); return factor(); }
      if (peek() === '-') { take(); return -factor(); }
      if (peek() === '(') {
        take();
        const value = expression();
        if (take() !== ')') throw new Error('Missing closing parenthesis');
        return value;
      }
      const token = take();
      if (!token || !/^(?:\d+\.?\d*|\.\d+)$/.test(token)) throw new Error('Expected number');
      return Number(token);
    };
    const term = () => {
      let value = factor();
      while (peek() === '*' || peek() === '/') {
        const operator = take();
        const right = factor();
        if (operator === '/' && right === 0) throw new Error('Division by zero');
        value = operator === '*' ? value * right : value / right;
      }
      return value;
    };
    const expression = () => {
      let value = term();
      while (peek() === '+' || peek() === '-') value = take() === '+' ? value + term() : value - term();
      return value;
    };

    try {
      const value = expression();
      return index === tokens.length ? roundMoney(value) : NaN;
    } catch (_) {
      return NaN;
    }
  }

  window.BlackBookAmount = { evaluateAmount };
})();
