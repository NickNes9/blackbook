(function () {
  // Presentation only: amounts in forms, exports, calculations and dialogs stay exact.
  const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  const selectors = [
    '.month-summary-value', '.chip-balance', '.tx-amt', '.metric-value',
    '.budget-bar-values-filled', '.budget-bar-values-unfilled', '.bill-cell', '.bill-cell-total',
    '.savings-progress-text', '.savings-entry-amount', '.inst-amt', '.bill-meta-line',
    '.inv-line-math', '.inv-line-sum', '.forecast-event > :last-child', '.savings-total-text', '.cat-seg-inner'
  ].join(',');

  function decorateAmounts(root) {
    for (const element of root.querySelectorAll(selectors)) {
      const bare = element.matches('.bill-cell, .bill-cell-total');
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) {
        if (!walker.currentNode.parentElement.closest('.money-value')) nodes.push(walker.currentNode);
      }
      for (const node of nodes) {
        const pattern = bare ? /-?\d[\d,]*(?:\.\d+)?(?:\s+[A-Z]{3})?/g : /-?\d[\d,]*(?:\.\d+)?\s+[A-Z]{3}\b/g;
        const text = node.textContent;
        const matches = [...text.matchAll(pattern)];
        if (!matches.length) continue;
        const fragment = document.createDocumentFragment();
        let offset = 0;
        for (const match of matches) {
          const full = match[0];
          const value = Number(full.match(/^-?[\d,.]+/)[0].replaceAll(',', ''));
          const currency = full.match(/[A-Z]{3}$/)?.[0];
          fragment.append(text.slice(offset, match.index));
          const span = document.createElement('span');
          span.className = 'money-value';
          span.title = full;
          span.setAttribute('aria-label', full);
          const exact = document.createElement('span');
          exact.className = 'money-full';
          exact.textContent = full;
          const short = document.createElement('span');
          short.className = 'money-short';
          // Only abbreviate thousands and above; never round away small balances or cents.
          short.textContent = (Math.abs(value) < 1000 ? full : compact.format(value).toLowerCase() + (currency ? ' ' + currency : ''));
          short.setAttribute('aria-hidden', 'true');
          span.append(exact, short);
          fragment.append(span);
          offset = match.index + full.length;
        }
        fragment.append(text.slice(offset));
        node.replaceWith(fragment);
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector('.app-workspace');
    if (!root) return;
    const observer = new MutationObserver(() => {
      observer.disconnect();
      decorateAmounts(root);
      observer.observe(root, { childList: true, subtree: true });
    });
    decorateAmounts(root);
    observer.observe(root, { childList: true, subtree: true });
  });
})();
