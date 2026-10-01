(function () {
Object.assign(window.BlackBook, {
  refreshDataHealth() { this._healthIssues = window.DataHealth.scan(this.data); },
  healthMarker(collection, id) {
    const issues = (this._healthIssues || []).filter(i => i.collection === collection && i.id === id && (i.kind === 'broken-link' || i.kind === 'duplicate-id'));
    if (!issues.length) return '';
    return '<button type="button" class="health-link" title="' + this.escapeHtml(issues.map(i => i.message).join('\n')) + '" aria-label="Review broken links" onclick="event.stopPropagation();BlackBook.openDataHealth()">' + this.transactionLinkIcon() + '</button>';
  },
  healthSummaryHtml() {
    const count = (this._healthIssues || []).length;
    return '<button type="button" class="btn btn-secondary" onclick="BlackBook.openDataHealth()">CHECK DATA' + (count ? ' · ' + count : '') + '</button>';
  },
  dataHealthTransactionButton(ids) {
    const validIds = [...new Set(ids || [])].filter(id => (this.data.transactions || []).some(tx => tx && tx.id === id));
    if (!validIds.length) return '';
    const encoded = validIds.map(encodeURIComponent).join(',');
    return '<button type="button" class="btn btn-sm btn-secondary linked-tx-action" data-tx-ids="' + this.escapeHtml(encoded) + '" onclick="event.stopPropagation();BlackBook.openDataHealthTransactions(this.dataset.txIds.split(\',\').map(decodeURIComponent))" title="Show ' + validIds.length + ' related transaction' + (validIds.length === 1 ? '' : 's') + ' on Overview" aria-label="Show related transactions on Overview">' + this.transactionLinkIcon() + '</button>';
  },
  openDataHealth() {
    this.refreshDataHealth();
    const issues = this._healthIssues;
    const names = { transactions: 'Transaction', accounts: 'Account', bills: 'Bill', invoices: 'Invoice', debts: 'Debt', savingsGoals: 'Savings goal', installments: 'Card plan', categories: 'Category', creditCards: 'Credit card' };
    const transactionSummary = (tx, issue) => {
      const category = (this.data.categories || []).find(item => item.id === tx.categoryId);
      const account = (this.data.accounts || []).find(item => item.id === (tx.accountId || tx.fromAccountId));
      const amount = this.fmtAmount(Math.abs(Number(tx.amount) || 0), tx.currency || this.baseCurrency());
      const date = tx.date ? this.fmtDateInput(tx.date) : 'No date';
      const type = String(tx.type || 'transaction').toUpperCase();
      return '<div class="health-transaction-summary"><div class="health-transaction-main"><strong>' + this.escapeHtml(type) + ' · ' + this.escapeHtml(date) + ' · ' + this.escapeHtml(amount) + '</strong>' +
        '<span>' + this.escapeHtml(tx.note || 'No description') + '</span></div><div class="health-transaction-meta">' +
        (category ? '<span>' + this.escapeHtml(category.name) + '</span>' : '') + (account ? '<span>' + this.escapeHtml(account.name) + '</span>' : '') +
        this.dataHealthTransactionButton(issue.relatedIds || [tx.id]) + '</div></div>';
    };
    const rows = issues.map(issue => {
      const record = (this.data[issue.collection] || []).find(item => item.id === issue.id) || {};
      const label = issue.collection === 'transactions' ? 'Transaction details' : (record.name || record.party || record.person || record.note || 'Unknown record');
      const summary = issue.collection === 'transactions' ? transactionSummary(record, issue) : '';
      const safeMessage = issue.message.replace(/\s*\([^)]*\)/g, '');
      return '<div class="health-issue"><span class="health-issue-title">' + this.escapeHtml((names[issue.collection] || issue.collection) + ': ' + label) + '</span>' + summary + '<span class="health-issue-message">' + this.escapeHtml(safeMessage) + '</span></div>';
    }).join('');
    document.getElementById('data-health-results').innerHTML = '<p class="health-explanation">Read-only check. Nothing is changed automatically. Possible duplicates can be legitimate payments.</p>' + (rows || '<p>No broken references, duplicate warnings, or missing account exchange rates detected.</p>');
    this.openModal('data-health-modal');
    const modal = document.getElementById('data-health-modal');
    const close = modal.querySelector('.modal-close');
    close.focus();
    if (!modal._healthKeysBound) {
      modal.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const focusable = [close, ...modal.querySelectorAll('#data-health-results .linked-tx-action')];
        const current = focusable.indexOf(document.activeElement);
        const next = event.shiftKey ? (current <= 0 ? focusable.length - 1 : current - 1) : (current < 0 || current === focusable.length - 1 ? 0 : current + 1);
        event.preventDefault();
        focusable[next].focus();
      });
      modal._healthKeysBound = true;
    }
  }
});
})();
