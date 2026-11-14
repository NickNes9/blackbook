(function () {
  Object.assign(window.BlackBook, {
    wishlistItems() {
      if (!Array.isArray(this.data.wishlist)) this.data.wishlist = [];
      return this.data.wishlist;
    },

    renderWishlist() {
      this._savingsView = 'wishlist';
      this.renderPage('savings');
    },

    wishlistListHtml(items = this.wishlistItems()) {
      if (!items.length) return '<div class="empty-state"><div class="empty-state-text">Nothing on your WISHLIST yet. Add an item to keep its price, note, and category handy.</div></div>';
      return items.map(item => this.wishlistItemHtml(item)).join('');
    },

    wishlistItemHtml(item) {
      const category = (this.data.categories || []).find(candidate => candidate.id === item.categoryId);
      const categoryColor = category ? this.categoryColor(category) : 'var(--text-dim)';
      const note = String(item.note || '').trim();
      const noteHtml = note ? '<div class="wishlist-note">' + this.wishlistNoteHtml(note) + '</div>' : '';
      const wantBy = item.wantBy ? '<span>WANT BY ' + this.escapeHtml(this.fmtDateInput(item.wantBy)) + '</span>' : '';
      const categoryHtml = category ? '<span style="color:' + categoryColor + '">' + this.escapeHtml(this.categoryLabel(category)) + '</span>' : '';
      const metaHtml = categoryHtml || wantBy ? '<div class="wishlist-item-meta">' + categoryHtml + wantBy + '</div>' : '';
      return '<article class="savings-card wishlist-card' + this.focusRecordHtml('wishlist', item.id) + '" data-mobile-swipe-kind="wishlist" data-mobile-swipe-id="' + this.escapeHtml(item.id) + '">' +
        '<div class="wishlist-swipe-actions wishlist-swipe-actions-left" aria-hidden="true"><span class="wishlist-swipe-box wishlist-swipe-edit">EDIT</span></div>' +
        '<div class="wishlist-swipe-actions wishlist-swipe-actions-right" aria-hidden="true"><span class="wishlist-swipe-box wishlist-swipe-buy">BUY</span><span class="wishlist-swipe-box wishlist-swipe-delete">×</span></div>' +
        '<div class="wishlist-card-content">' +
        '<div class="savings-header"><span class="savings-name">' + this.escapeHtml(item.name || 'Wishlist item') + '</span><span class="savings-actions">' +
          '<span class="wishlist-price">' + this.fmtAmount(item.estimatedPrice || 0, item.currency || this.baseCurrency()) + '</span>' +
          '<button type="button" class="btn btn-sm btn-primary" onclick="BlackBook.buyWishlistItem(\'' + this.escapeHtml(item.id) + '\')">BOUGHT</button>' +
          '<button type="button" class="btn btn-sm btn-secondary mobile-savings-edit" onclick="BlackBook.openWishlistItem(\'' + this.escapeHtml(item.id) + '\')">EDIT</button>' +
          '<button type="button" class="btn btn-sm btn-danger btn-icon mobile-savings-delete" title="Remove from WISHLIST" aria-label="Remove ' + this.escapeHtml(item.name || 'wishlist item') + '" onclick="BlackBook.deleteWishlistItem(\'' + this.escapeHtml(item.id) + '\')">' + this.xIcon() + '</button>' +
        '</span></div>' +
        '<div class="wishlist-detail-row">' + metaHtml + noteHtml + '</div>' +
        '</div></article>';
    },

    wishlistNoteHtml(note) {
      return note.split(/(https?:\/\/[^\s]+)/g).map(part => {
        if (!/^https?:\/\//i.test(part)) return this.escapeHtml(part);
        return '<a href="' + this.escapeHtml(part) + '" target="_blank" rel="noopener noreferrer">' + this.escapeHtml(part) + '</a>';
      }).join('');
    },

    openWishlistItem(itemId = '') {
      const item = itemId ? this.wishlistItems().find(candidate => candidate.id === itemId) : null;
      if (itemId && !item) return;
      const id = document.getElementById('wishlist-id');
      const name = document.getElementById('wishlist-name');
      const price = document.getElementById('wishlist-price');
      const currency = document.getElementById('wishlist-currency');
      const categoryInput = document.getElementById('wishlist-category-input');
      const categoryHidden = document.getElementById('wishlist-category');
      const note = document.getElementById('wishlist-note');
      const wantBy = document.getElementById('wishlist-want-by');
      id.value = item ? item.id : '';
      name.value = item ? item.name || '' : '';
      price.value = item ? String(item.estimatedPrice ?? '') : '';
      currency.value = item ? item.currency || this.baseCurrency() : this.baseCurrency();
      categoryHidden.value = item ? item.categoryId || '' : '';
      const category = (this.data.categories || []).find(candidate => candidate.id === categoryHidden.value);
      categoryInput.value = category ? category.name.toUpperCase() : '';
      note.value = item ? item.note || '' : '';
      wantBy.value = item && item.wantBy ? this.fmtDateInput(item.wantBy) : '';
      document.getElementById('wishlist-modal-title').textContent = item ? 'Edit WISHLIST Item' : 'Add to WISHLIST';
      this.syncCustomSelect(currency);
      this.initCategoryPicker('wishlist-category-input', 'wishlist-category', 'wishlist-category-dropdown');
      this.openModal('wishlist-modal');
      name.focus();
    },

    bindWishlistForm() {
      const form = document.getElementById('wishlist-form');
      if (!form || form.dataset.bound === 'true') return;
      form.dataset.bound = 'true';
      form.addEventListener('submit', event => { event.preventDefault(); this.saveWishlistItem(); });
    },

    async saveWishlistItem() {
      const form = document.getElementById('wishlist-form');
      const id = document.getElementById('wishlist-id').value;
      const name = document.getElementById('wishlist-name').value.trim();
      const price = this.evalAmount(document.getElementById('wishlist-price').value);
      const currency = document.getElementById('wishlist-currency').value || this.baseCurrency();
      const rawWantBy = document.getElementById('wishlist-want-by').value.trim();
      const wantBy = rawWantBy ? this.parseDateInput(rawWantBy) : '';
      const categoryId = document.getElementById('wishlist-category').value || '';
      if (!name) { this.showToast('Enter an item name.'); return; }
      if (!(Number.isFinite(price) && price > 0)) { this.showToast('Enter a valid estimated price.'); return; }
      if (rawWantBy && !wantBy) { this.showToast('Enter a valid want-by date (' + this.dateFormatPattern() + ').'); return; }
      if (!this.categorySelectionAllowed(categoryId, this.today(), '')) { this.showToast('Choose a currently available category.'); return; }
      const list = this.wishlistItems();
      const index = id ? list.findIndex(item => item.id === id) : -1;
      if (id && index < 0) return;
      const previous = index >= 0 ? { ...list[index] } : null;
      const item = {
        id: id || crypto.randomUUID(), name, estimatedPrice: Math.round(price * 100) / 100,
        currency, categoryId, note: document.getElementById('wishlist-note').value.trim(),
        wantBy, createdAt: previous ? previous.createdAt : new Date().toISOString()
      };
      if (index >= 0) list[index] = item;
      else list.push(item);
      if (!(await this.save())) {
        if (index >= 0) list[index] = previous;
        else this.data.wishlist = list.filter(candidate => candidate.id !== item.id);
        return;
      }
      form.reset();
      this.closeModal('wishlist-modal');
      this._savingsView = 'wishlist';
      this.renderPage('savings');
    },

    async deleteWishlistItem(itemId) {
      const list = this.wishlistItems();
      const index = list.findIndex(item => item.id === itemId);
      if (index < 0) return;
      const item = list[index];
      if (!(await this.confirmModal({ title: 'Remove Wishlist Item', message: 'Remove “' + item.name + '” from your WISHLIST?', confirmText: 'Remove', danger: true }))) return;
      list.splice(index, 1);
      if (!(await this.save())) { list.splice(index, 0, item); return; }
      this._savingsView = 'wishlist';
      this.renderPage('savings');
    },

    buyWishlistItem(itemId) {
      const item = this.wishlistItems().find(candidate => candidate.id === itemId);
      if (!item) return;
      const targetAccount = this.defaultAccountForCurrency(item.currency || this.baseCurrency());
      this.openNewTransaction(targetAccount || undefined);
      const transactionForm = document.getElementById('transaction-form');
      if (document.getElementById('transaction-modal').classList.contains('hidden')) return;
      transactionForm.dataset.wishlistPurchaseId = item.id;
      document.getElementById('tx-type').value = 'expense';
      const amountInput = document.getElementById('tx-amount');
      amountInput.dataset.fallbackType = 'expense';
      const selectedAccount = document.getElementById('tx-account').value;
      const account = selectedAccount.startsWith('card:')
        ? this.cardById(selectedAccount.slice(5))
        : (this.data.accounts || []).find(candidate => candidate.id === selectedAccount);
      const accountCurrency = (account && account.currency) || this.baseCurrency();
      const estimatedCurrency = item.currency || this.baseCurrency();
      const estimate = Math.abs(Number(item.estimatedPrice) || 0);
      const converted = accountCurrency === estimatedCurrency ? estimate : this.convertBetweenCurrencies(estimate, estimatedCurrency, accountCurrency);
      if (Number.isFinite(converted) && converted > 0) amountInput.value = converted.toFixed(2);
      else {
        amountInput.value = '';
        this.showToast('Enter the actual amount; there is no saved rate to convert this estimate.');
      }
      document.getElementById('tx-note').value = item.name + (item.note ? ' — ' + item.note : '');
      const category = (this.data.categories || []).find(candidate => candidate.id === item.categoryId && this.categorySelectionAllowed(candidate.id, this.today(), ''));
      document.getElementById('tx-category').value = category ? category.id : '';
      document.getElementById('tx-category-input').value = category ? category.name.toUpperCase() : '';
      const nativeAmount = document.getElementById('tx-native-amount');
      const nativeCurrency = document.getElementById('tx-native-currency-select');
      if (estimatedCurrency !== accountCurrency && Number.isFinite(converted) && converted > 0) {
        nativeCurrency.value = estimatedCurrency;
        nativeAmount.value = estimate.toFixed(2);
      } else {
        nativeCurrency.value = accountCurrency;
        nativeAmount.value = '';
      }
      this.syncCustomSelect(nativeCurrency);
      this.updateTxNativeRow();
      this.updateTransactionSign();
      this.initCategoryPicker('tx-category-input', 'tx-category', 'category-dropdown');
      this.updateTxPreview();
    }
  });
})();
