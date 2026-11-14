(function () {
  const mobileNavQuery = window.matchMedia('(max-width: 500px)');
  const mobileOverviewQuery = window.matchMedia('(max-width: 500px)');
  let mobileSettingsState = null;
  let mobileReportsWheel = null;
  let mobileReportsDateOverlay = null;

  function setCommandDragState(button, dragging) {
    if (button.dataset.action === 'reports-pages') {
      button.classList.toggle('is-reports-wheel-dragging', !!dragging);
      return;
    }
    button.classList.toggle('is-command-dragging', !!dragging);
    button.textContent = dragging ? '>' : '+';
  }

  function closeMobileReportsWheel() {
    if (mobileReportsWheel) mobileReportsWheel.remove();
    mobileReportsWheel = null;
  }

  function setMobileReportsWheelSelection(id) {
    if (!mobileReportsWheel) return;
    mobileReportsWheel.dataset.selectedView = id || '';
    mobileReportsWheel.querySelectorAll('[data-report-wheel-view]').forEach(option => {
      const selected = option.dataset.reportWheelView === id;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-selected', String(selected || (!id && option.classList.contains('is-current'))));
    });
  }

  function selectMobileReportsView(id) {
    const bb = window.BlackBook;
    closeMobileReportsWheel();
    closeMobileReportsDatePicker();
    if (bb && bb.currentPage === 'reports' && id) bb.setReportsView(id);
  }

  function positionMobileReportsWheel(overlay) {
    const button = document.querySelector('.mobile-action-bar[data-page="reports"] .mobile-action-add');
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const anchorX = rect.left + rect.width / 2;
    const anchorY = rect.top + rect.height / 2;
    const options = [...overlay.querySelectorAll('[data-report-wheel-view]')];
    const radius = Math.min(150, Math.max(100, window.innerWidth / 2 - 48), Math.max(100, anchorY - 48));
    options.forEach((option, index) => {
      const angle = (180 + (options.length > 1 ? 180 * index / (options.length - 1) : 90)) * Math.PI / 180;
      option.style.left = (anchorX + Math.cos(angle) * radius) + 'px';
      option.style.top = (anchorY + Math.sin(angle) * radius) + 'px';
    });
    overlay.dataset.anchorX = String(anchorX);
    overlay.dataset.anchorY = String(anchorY);
  }

  function mobileReportsCategoryIcon() {
    const present = (x, y, z) => x >= 0 && x < 2 && y >= 0 && y < 2 && z >= 0 && z < 2 && !(x === 1 && y === 1 && z === 1);
    const point = (x, y, z) => (12 + 4.6 * (x - y)).toFixed(2) + ',' + (12 + 2.7 * (x + y) - 5.4 * z).toFixed(2);
    const face = (points, filled) => '<path d="M' + points.map(point => point.join(' ')).join(' L') + ' Z" fill="' + (filled ? 'currentColor' : 'none') + '"/>';
    const faces = [];
    for (let z = 0; z < 2; z++) for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      if (!present(x, y, z)) continue;
      if (!present(x, y, z + 1)) faces.push(face([[x,y,z+1],[x+1,y,z+1],[x+1,y+1,z+1],[x,y+1,z+1]].map(([a,b,c]) => point(a,b,c).split(',')), false));
      if (!present(x + 1, y, z)) faces.push(face([[x+1,y,z],[x+1,y+1,z],[x+1,y+1,z+1],[x+1,y,z+1]].map(([a,b,c]) => point(a,b,c).split(',')), true));
      if (!present(x, y + 1, z)) faces.push(face([[x,y+1,z],[x+1,y+1,z],[x+1,y+1,z+1],[x,y+1,z+1]].map(([a,b,c]) => point(a,b,c).split(',')), false));
    }
    return faces.join('');
  }
  function mobileReportsPageIcon(id) {
    const icons = {
      categories: mobileReportsCategoryIcon(),
      compare: '<path d="M4 20h16"/><rect x="6" y="13" width="4" height="7" fill="currentColor"/><rect x="14" y="5" width="4" height="15" fill="currentColor"/>',
      people: '<circle cx="12" cy="7" r="3"/><path d="M5 20v-1a7 7 0 0 1 14 0v1z"/>',
      moneyflow: '<path d="M4 6h5l3 6h8M4 18h5l3-6"/><path d="m17 9 3 3-3 3"/>',
      calendar: '<circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5M5.6 5.6l3.2 3.2m6.4 6.4 3.2 3.2m0-12.8-3.2 3.2M8.8 15.2l-3.2 3.2"/>',
      forecast: '<path d="M3 19h18M5 16l4-5 4 2 6-8"/><path d="M15 5h4v4"/>',
      items: '<path d="M5 4h14v10l-7 6-7-6z"/><circle cx="12" cy="14" r="1.2"/>',
    };
    return '<svg class="mobile-reports-page-icon' + (id === 'categories' ? ' mobile-reports-category-icon' : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (icons[id] || icons.categories) + '</svg>';
  }
  function openMobileReportsWheel() {
    const bb = window.BlackBook;
    if (!bb || bb.currentPage !== 'reports') return null;
    closeMobileReportsDatePicker();
    if (mobileReportsWheel?.isConnected) return mobileReportsWheel;
    const views = bb.reportsMobileViewOptions ? bb.reportsMobileViewOptions() : [];
    if (!views.length) return null;
    const activeView = bb.reportsState().view;
    const overlay = document.createElement('div');
    overlay.className = 'mobile-reports-wheel';
    overlay.setAttribute('role', 'presentation');
    overlay.innerHTML = '<div class="mobile-reports-wheel-menu" role="listbox" aria-label="Report pages">' + views.map(view =>
      '<button type="button" class="mobile-reports-wheel-option' + (view.id === activeView ? ' is-current' : '') + '" role="option" aria-selected="' + (view.id === activeView) + '" data-report-wheel-view="' + view.id + '">' + mobileReportsPageIcon(view.id) + '<span>' + view.label.toUpperCase() + '</span></button>'
    ).join('') + '</div>';
    overlay.dataset.selectedView = '';
    overlay.addEventListener('click', event => {
      const option = event.target.closest('[data-report-wheel-view]');
      if (option) {
        event.preventDefault();
        selectMobileReportsView(option.dataset.reportWheelView);
      } else closeMobileReportsWheel();
    });
    document.body.appendChild(overlay);
    mobileReportsWheel = overlay;
    positionMobileReportsWheel(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-open'));
    return overlay;
  }

  function updateMobileReportsWheelAt(x, y, anchorY) {
    const overlay = mobileReportsWheel;
    if (!overlay) return '';
    if (y >= anchorY - 12) {
      setMobileReportsWheelSelection('');
      return '';
    }
    let nearest = null, nearestDistance = Infinity;
    overlay.querySelectorAll('[data-report-wheel-view]').forEach(option => {
      const rect = option.getBoundingClientRect();
      const distance = Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2));
      if (distance < nearestDistance) { nearest = option; nearestDistance = distance; }
    });
    const id = nearest && nearestDistance <= 54 ? nearest.dataset.reportWheelView : '';
    setMobileReportsWheelSelection(id);
    return id;
  }

  function closeMobileReportsDatePicker() {
    if (mobileReportsDateOverlay) mobileReportsDateOverlay.remove();
    mobileReportsDateOverlay = null;
  }

  function openMobileReportsDatePicker() {
    closeMobileDatePicker();
    const bb = window.BlackBook;
    const source = document.querySelector('#page-reports .month-picker');
    if (!bb || bb.currentPage !== 'reports' || !source) return;
    closeMobileReportsWheel();
    closeMobileReportsDatePicker();
    const overlay = document.createElement('div');
    overlay.className = 'mobile-reports-date-overlay';
    const panel = document.createElement('div');
    panel.className = 'mobile-reports-date-panel';
    panel.appendChild(source.cloneNode(true));
    overlay.appendChild(panel);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeMobileReportsDatePicker();
    });
    panel.addEventListener('click', event => {
      const yearStep = event.target.closest('[data-report-item-year]');
      const range = event.target.closest('[data-report-item-range]');
      if (yearStep || range) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const state = bb.reportsState();
        if (yearStep) {
          const year = state.itemYear + Number(yearStep.dataset.reportItemYear || 0);
          if (year >= 1900 && year <= 2099) { state.itemYear = year; state.itemRange = 'year'; }
        } else state.itemRange = range.dataset.reportItemRange === 'year' ? 'year' : 'lifetime';
        closeMobileReportsDatePicker();
        bb.renderPage('reports');
        return;
      }
      if (event.target.closest('button')) closeMobileReportsDatePicker();
    }, true);
    panel.addEventListener('wheel', event => {
      const picker = event.target.closest('.month-picker');
      const onMonths = event.target.closest('.mp-months');
      const onYear = event.target.closest('.mp-year');
      if (!picker || !event.deltaY || (!onMonths && !onYear)) return;
      event.preventDefault();
      event.stopPropagation();
      const direction = event.deltaY > 0 ? 1 : -1;
      const state = bb.reportsState();
      closeMobileReportsDatePicker();
      if (onMonths) {
        const date = new Date(Date.UTC(state.year, state.month + direction, 1));
        bb.changeReportsCalendar('period', date.getUTCFullYear(), date.getUTCMonth());
      } else if (state.view === 'items') {
        const year = state.itemYear - direction;
        if (year >= 1900 && year <= 2099) { state.itemYear = year; state.itemRange = 'year'; bb.renderPage('reports'); }
      } else bb.changeReportsCalendar('period', state.year - direction, state.month);
    }, { passive:false });
    document.body.appendChild(overlay);
    mobileReportsDateOverlay = overlay;
  }

  function mobileSettingsSectionKey(section) {
    const title = section.querySelector('.settings-section-title')?.textContent.trim().split(' · ')[0] || '';
    return ({'APPEARANCE':'appearance','DEFAULTS':'defaults','PAGES':'pages','DATA':'data','ABOUT & UPDATES':'about-updates','ACCOUNTS':'accounts','CATEGORIES':'categories','EXCHANGE RATES':'currencies','PROFILES':'profiles'})[title] || '';
  }

  function teardownMobileSettings() {
    const state = mobileSettingsState;
    if (!state) return;
    for (const content of state.root.querySelectorAll('.mobile-settings-swipe-content')) {
      const row=content.parentElement;
      while(content.firstChild) row.insertBefore(content.firstChild,content);
      content.remove();
      row.style.padding='';
      row.classList.remove('mobile-swipe-left','mobile-swipe-right','mobile-swipe-archive','mobile-swipe-delete');
    }
    for (const entry of state.cardAnchors) if (entry.anchor.parentNode) { entry.anchor.parentNode.insertBefore(entry.row, entry.anchor); entry.anchor.remove(); delete entry.row.dataset.mobileSettingsKind; delete entry.row.dataset.mobileEntityId; entry.row.classList.remove('mobile-settings-swipe-row'); }
    for (const entry of state.sectionAnchors) if (entry.anchor.parentNode) { entry.anchor.parentNode.insertBefore(entry.section, entry.anchor); entry.anchor.remove(); }
    state.aboutSection?.classList.remove('mobile-settings-about-area');
    if (state.footerAnchor?.parentNode) { state.footerAnchor.parentNode.insertBefore(state.footer, state.footerAnchor.nextSibling); state.footerAnchor.remove(); }
    state.root.classList.remove('mobile-settings-active');
    delete state.root.dataset.mobileSettingsSection;
    state.shell.remove();
    mobileSettingsState = null;
  }

  function setupMobileSettings(root) {
    if (!root) return;
    if (!mobileNavQuery.matches) { teardownMobileSettings(); return; }
    if (mobileSettingsState && mobileSettingsState.root === root && root.contains(mobileSettingsState.shell)) return;
    const restoreKey = mobileSettingsState?.root === root ? mobileSettingsState.activeKey : '';
    if (mobileSettingsState) teardownMobileSettings();
    const sections = [...root.querySelectorAll('.settings-ordered > .settings-section'), ...root.querySelectorAll('.settings-cols:not(.settings-cols-import-rules) > .settings-section')];
    if (!sections.length) return;
    const shell = document.createElement('div'); shell.className = 'mobile-settings-shell';
    const home = document.createElement('div'); home.className = 'mobile-settings-home';
    const menu = document.createElement('nav'); menu.className = 'mobile-settings-menu'; menu.setAttribute('aria-label','Settings sections'); home.appendChild(menu);
    const view = document.createElement('section'); view.className = 'mobile-settings-subpage'; view.setAttribute('aria-label','Settings section');
    view.innerHTML = '<header class="mobile-settings-subpage-header"><span class="mobile-settings-subpage-title"></span></header><div class="mobile-settings-subpage-body"></div>';
    const store = document.createElement('div'); store.className = 'mobile-settings-store';
    const profileModal = document.createElement('div'); profileModal.className = 'mobile-settings-profile-modal'; profileModal.hidden = true;
    profileModal.innerHTML = '<div class="mobile-settings-profile-scrim" data-mobile-settings-close-profile></div><section class="mobile-settings-profile-dialog" role="dialog" aria-modal="true" aria-label="Profiles"><header class="mobile-settings-profile-header"><span>PROFILES</span><button type="button" class="mobile-settings-profile-close" data-mobile-settings-close-profile aria-label="Close profiles">&times;</button></header><div class="mobile-settings-profile-body"></div></section>';
    const addMenu = document.createElement('div'); addMenu.className = 'mobile-settings-add-menu'; addMenu.hidden = true; addMenu.setAttribute('aria-label','Add setting item');
    addMenu.innerHTML = [['account','ACCOUNT'],['card','CREDIT CARD'],['category','CATEGORY'],['currency','CURRENCY']].map(([a,l]) => '<button type="button" data-action="settings-add-choice" data-settings-add="'+a+'">'+l+'</button>').join('');
    const footer = root.querySelector('.settings-footer');
    let footerAnchor = null;
    if (footer) { footerAnchor = document.createComment('mobile-settings-footer'); footer.parentNode.insertBefore(footerAnchor,footer); }
    shell.append(home,view,store,profileModal,addMenu); root.appendChild(shell);
    const sectionAnchors=[], byKey=new Map();
    for (const section of sections) {
      const key=mobileSettingsSectionKey(section); if(!key) continue;
      const anchor=document.createComment('mobile-settings-'+key); section.parentNode.insertBefore(anchor,section);
      sectionAnchors.push({section,anchor}); section.dataset.mobileSettingsKey=key; byKey.set(key,section); store.appendChild(section);
    }
    if (byKey.has('profiles')) profileModal.querySelector('.mobile-settings-profile-body').appendChild(byKey.get('profiles'));
    const aboutSection=byKey.get('about-updates');
    if(aboutSection){aboutSection.classList.add('mobile-settings-about-area');home.appendChild(aboutSection);}
    if(footer) home.appendChild(footer);
    const accountList=byKey.get('accounts')?.querySelector('#settings-account-list'), cardAnchors=[];
    const cards=document.createElement('section'); cards.className='settings-section mobile-settings-cards-section'; cards.dataset.mobileSettingsKey='cards';
    cards.innerHTML='<div class="settings-section-header"><span class="settings-section-title">CREDIT CARDS</span></div><div class="settings-list mobile-settings-card-list"></div>';
    const cardList=cards.querySelector('.mobile-settings-card-list');
    if(accountList) for(const row of Array.from(accountList.querySelectorAll('.settings-row')).filter(r=>r.querySelector('.settings-row-meta')?.textContent.trim().startsWith('CREDIT CARD'))){const anchor=document.createComment('mobile-settings-card');row.parentNode.insertBefore(anchor,row);cardAnchors.push({row,anchor});row.dataset.mobileSettingsKind='card';row.dataset.mobileEntityId=row.querySelector('[onclick*="openEditAccount"]')?.getAttribute('onclick')?.match(/card:([^']+)/)?.[1]||'';row.classList.add('mobile-settings-swipe-row');cardList.appendChild(row);}
    if(!cardList.children.length) cardList.innerHTML='<div class="mobile-settings-empty">No credit cards yet.</div>';
    if(accountList&&!accountList.querySelector('.settings-row')) accountList.innerHTML='<div class="mobile-settings-empty">No accounts yet.</div>';
    store.appendChild(cards); byKey.set('cards',cards);
    for(const button of [...(byKey.get('accounts')?.querySelectorAll('.settings-section-header button')||[]),...(byKey.get('categories')?.querySelectorAll('.settings-section-header button')||[]),...(byKey.get('currencies')?.querySelectorAll('.settings-section-header button')||[]),...(byKey.get('data')?.querySelectorAll('.settings-subsection .settings-section-header button')||[])]) if(button.id!=='settings-refresh-all-rates') button.classList.add('mobile-settings-inline-add');
    const labels={accounts:'ACCOUNTS',cards:'CREDIT CARDS',currencies:'CURRENCIES',categories:'CATEGORIES',appearance:'APPEARANCE',pages:'PAGES',data:'DATA'};
    for(const key of ['accounts','cards','currencies','categories','appearance','pages','data']) if(byKey.has(key)){const b=document.createElement('button');b.type='button';b.className='mobile-settings-link';b.dataset.action='settings-section';b.dataset.settingsSection=key;b.innerHTML='<span>'+labels[key]+'</span><span class="mobile-settings-chevron" aria-hidden="true">&#8250;</span>';menu.appendChild(b);}
    mobileSettingsState={root,shell,home,menu,view,viewBody:view.querySelector('.mobile-settings-subpage-body'),viewTitle:view.querySelector('.mobile-settings-subpage-title'),store,profileModal,addMenu,sections:byKey,sectionAnchors,cardAnchors,aboutSection,footer,footerAnchor,activeKey:''};
    root.classList.add('mobile-settings-active');
    menu.addEventListener('click',e=>{const b=e.target.closest('[data-settings-section]');if(b)openMobileSettingsSection(b.dataset.settingsSection);});
    const addChoice=e=>{const b=e.target.closest('[data-action="settings-add-choice"]');if(b){addMenu.hidden=true;runMobileSettingsAdd(b.dataset.settingsAdd);}};
    home.addEventListener('click',addChoice); addMenu.addEventListener('click',addChoice);
    profileModal.addEventListener('click',e=>{if(e.target.closest('[data-mobile-settings-close-profile]'))closeMobileSettingsProfiles();});
    bindMobileSettingsGestures(root);
    if(!document._mobileSettingsDismissBound){document._mobileSettingsDismissBound=true;document.addEventListener('pointerdown',e=>{
      if(e.target.matches('#add-currency-overlay')){window.BlackBook?.closeAddCurrencyModal();return;}
      const backdrop=e.target.closest('#settings-account-modal .modal-backdrop,#settings-category-modal .modal-backdrop');
      if(backdrop){const modal=backdrop.closest('.modal');if(modal)window.BlackBook?.closeModal(modal.id);return;}
      const state=mobileSettingsState;if(!state||state.addMenu.hidden)return;
      if(e.target.closest('.mobile-settings-add-menu,.mobile-action-add'))return;
      state.addMenu.hidden=true;
    },true);}
    if(!document._mobileSettingsEscapeBound){document._mobileSettingsEscapeBound=true;document.addEventListener('keydown',e=>{
      if(e.key!=='Escape')return;
      const currencyOverlay=document.getElementById('add-currency-overlay');
      const createModal=document.querySelector('#settings-account-modal:not(.hidden),#settings-category-modal:not(.hidden)');
      if(currencyOverlay){window.BlackBook?.closeAddCurrencyModal();return;}
      if(createModal){window.BlackBook?.closeModal(createModal.id);return;}
      if(!mobileSettingsState)return;
      if(!mobileSettingsState.profileModal.hidden)closeMobileSettingsProfiles();
      else if(!mobileSettingsState.addMenu.hidden)mobileSettingsState.addMenu.hidden=true;
      else if(mobileSettingsState.activeKey)closeMobileSettingsSection();
    });}
    if(restoreKey&&byKey.has(restoreKey))openMobileSettingsSection(restoreKey);
  }

  function openMobileSettingsSection(key) {
    const state=mobileSettingsState, section=state&&state.sections.get(key); if(!state||!section)return;
    if(state.activeKey&&state.sections.get(state.activeKey)?.parentNode===state.viewBody)state.store.appendChild(state.sections.get(state.activeKey));
    state.activeKey=key; state.root.dataset.mobileSettingsSection=key;
    state.viewTitle.textContent=section.querySelector('.settings-section-title')?.textContent.trim().split(' · ')[0]||key.toUpperCase();
    state.viewBody.replaceChildren(section); state.home.classList.add('is-away'); state.view.classList.add('is-open'); state.addMenu.hidden=true; syncQuickActions();
  }
  function closeMobileSettingsSection() {
    const state=mobileSettingsState;if(!state)return;
    if(state.activeKey&&state.sections.get(state.activeKey)?.parentNode===state.viewBody)state.store.appendChild(state.sections.get(state.activeKey));
    state.activeKey='';delete state.root.dataset.mobileSettingsSection;state.view.classList.remove('is-open');state.home.classList.remove('is-away');syncQuickActions();
  }
  function openMobileSettingsProfiles(){if(!mobileSettingsState)setupMobileSettings(document.getElementById('page-settings'));if(!mobileSettingsState)return;mobileSettingsState.addMenu.hidden=true;mobileSettingsState.profileModal.hidden=false;mobileSettingsState.profileModal.classList.add('is-open');}
  function closeMobileSettingsProfiles(){if(!mobileSettingsState)return;mobileSettingsState.profileModal.classList.remove('is-open');mobileSettingsState.profileModal.hidden=true;}
  function ensureMobileSwipeContent(row) {
    let content=row.querySelector(':scope > .mobile-settings-swipe-content');
    if(content)return content;
    const style=getComputedStyle(row);
    content=document.createElement('div');content.className='mobile-settings-swipe-content';
    content.style.display=style.display==='grid'?'grid':'flex';
    content.style.alignItems=style.alignItems;
    content.style.gap=style.gap;
    content.style.minWidth='0';content.style.width='100%';content.style.boxSizing='border-box';content.style.padding=style.padding;
    if(style.display==='grid'){content.style.gridTemplateColumns=style.gridTemplateColumns;content.style.gridColumn='1 / -1';}
    else {content.style.flexWrap=style.flexWrap;}
    content._mobileSwipeBackground=style.backgroundColor==='rgba(0, 0, 0, 0)'?'var(--surface)':style.backgroundColor;
    content._mobileSwipeBackgroundImage=style.backgroundImage;
    while(row.firstChild)content.appendChild(row.firstChild);
    row.style.padding='0';
    row.appendChild(content);
    return content;
  }
  function bindMobileSettingsGestures(root) {
    if (!root || root._mobileSettingsGesturesBound) return;
    root._mobileSettingsGesturesBound = true;
    let active = null;
    const resetRow = row => { if (!row) return; const content=row.querySelector(':scope > .mobile-settings-swipe-content');if(content){content.style.transform='';content.style.transition='';content.style.backgroundColor='';content.style.backgroundImage='';}row.classList.remove('mobile-swipe-left','mobile-swipe-right','mobile-swipe-archive','mobile-swipe-delete'); };
    root.addEventListener('pointerdown', event => {
      if (!mobileNavQuery.matches || window.BlackBook?.currentPage !== 'settings' || !mobileSettingsState?.activeKey || (event.button != null && event.button !== 0)) return;
      const row = event.target.closest('.mobile-settings-swipe-row');
      if (row && mobileSettingsState.viewBody.contains(row)) {
        if (event.target.closest('button,a,input,select,textarea,[role="button"]')) return;
        active = { kind:'row', row, content:null, x:event.clientX, y:event.clientY, dx:0, horizontal:false, vertical:false, pointerId:event.pointerId };
        return;
      }
      if (event.target.closest('button,a,input,select,textarea,[role="button"],.settings-row,.rate-grid-row,.form-group,.mobile-settings-subpage-header,.settings-section-header')) return;
      active = { kind:'back', x:event.clientX, y:event.clientY, dx:0, horizontal:false, vertical:false, pointerId:event.pointerId };
    }, true);
    root.addEventListener('pointermove', event => {
      if (!active || event.pointerId !== active.pointerId) return;
      const dx=event.clientX-active.x, dy=event.clientY-active.y;
      if (!active.horizontal && !active.vertical) {
        if (Math.abs(dx)<8 && Math.abs(dy)<8) return;
        if (Math.abs(dy)>Math.abs(dx)*1.2) { active.vertical=true; return; }
        if (Math.abs(dx)<=Math.abs(dy)*1.2) return;
        active.horizontal=true;
      }
      if (active.vertical) return;
      if (active.kind==='back') {
        active.dx=Math.max(-24,Math.min(140,dx));
        if (active.dx>0) mobileSettingsState.view.style.transform='translateX('+Math.min(55,active.dx*.35)+'px)';
      } else {
        active.content=active.content||ensureMobileSwipeContent(active.row);
        const kind=active.row.dataset.mobileSettingsKind;
        if (kind==='category' && active.row.dataset.categoryProtected==='true' && dx<0) { active.dx=0; resetRow(active.row); event.preventDefault(); event.stopImmediatePropagation(); return; }
        if (kind==='currency' && active.row.dataset.currencyBase==='true' && dx<0) { active.dx=0; resetRow(active.row); event.preventDefault(); event.stopImmediatePropagation(); return; }
        active.content.style.backgroundColor=active.content._mobileSwipeBackground;
        if(active.content._mobileSwipeBackgroundImage!=='none')active.content.style.backgroundImage=active.content._mobileSwipeBackgroundImage;
        active.dx=kind==='category'?Math.max(-165,Math.min(72,dx)):Math.max(-72,Math.min(72,dx));
        active.content.style.transition='none';
        active.content.style.transform='translateX('+active.dx+'px)';
        active.row.classList.toggle('mobile-swipe-left',active.dx<0);
        active.row.classList.toggle('mobile-swipe-right',active.dx>0);
        active.row.classList.toggle('mobile-swipe-delete',kind==='category'&&active.dx<=-138);
        active.row.classList.toggle('mobile-swipe-archive',kind==='category'&&active.dx<0);
      }
      if (event.cancelable) event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    root.addEventListener('pointerup', event => {
      if (!active || event.pointerId!==active.pointerId) return;
      const gesture=active; active=null;
      if (!gesture.horizontal) return;
      if (gesture.kind==='back') {
        if (mobileSettingsState?.view) mobileSettingsState.view.style.transform='';
        if (gesture.dx>=58) closeMobileSettingsSection();
        if (event.cancelable) event.preventDefault();
        return;
      }
      const row=gesture.row, kind=row.dataset.mobileSettingsKind, dx=gesture.dx;
      row._mobileSettingsSuppressClickUntil=Date.now()+360;
      let run=null, endX=0;
      if (kind==='account' || kind==='card' || kind==='currency') {
        if (Math.abs(dx)>=54) {
          endX=dx<0?-72:72;
          if (kind==='account') run=()=>dx<0?window.BlackBook?.deleteAccount(row.dataset.reorderKey):window.BlackBook?.openEditAccount(row.dataset.reorderKey);
          else if (kind==='card') run=()=>dx<0?window.BlackBook?.deleteCard(row.dataset.mobileEntityId):window.BlackBook?.openEditAccount('card:'+row.dataset.mobileEntityId);
          else run=()=>dx<0?window.BlackBook?.removeCurrency(row.dataset.mobileEntityId):window.BlackBook?.openManualRateModal(row.dataset.mobileEntityId);
        }
      } else if (kind==='category') {
        if (dx>=54) { endX=72; run=()=>window.BlackBook?.openEditCategory(row.dataset.mobileEntityId); }
        else if (dx<=-138) { endX=-126; run=()=>window.BlackBook?.deleteCategory(row.dataset.mobileEntityId); }
        else if (dx<=-64) { endX=-126; run=()=>row.dataset.categoryArchived==='true'?window.BlackBook?.restoreCategory(row.dataset.mobileEntityId):window.BlackBook?.archiveCategory(row.dataset.mobileEntityId); }
      }
      if (run) {
        const content=gesture.content||ensureMobileSwipeContent(row);
        content.style.transition='transform 150ms ease-out'; content.style.transform='translateX('+endX+'px)';
        setTimeout(()=>{run();},kind==='category'?160:90);
      } else if (gesture.content) {
        gesture.content.style.transition='transform 180ms ease-out';gesture.content.style.transform='';
      }
      setTimeout(()=>resetRow(row),run?(kind==='category'?290:220):190);
      if (event.cancelable) event.preventDefault();
    }, true);
    root.addEventListener('pointercancel', event => {
      if (!active || event.pointerId!==active.pointerId) return;
      if (active.kind==='row') resetRow(active.row); else if (mobileSettingsState?.view) mobileSettingsState.view.style.transform='';
      active=null;
    }, true);
    root.addEventListener('click', event => {
      const row=event.target.closest('.mobile-settings-swipe-row');
      if (row && Date.now()<(row._mobileSettingsSuppressClickUntil||0)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
  }
  function addMobileSettingsItem(bb){
    if(!mobileSettingsState)setupMobileSettings(document.getElementById('page-settings'));
    const state=mobileSettingsState;if(!state)return;
    if(!state.profileModal.hidden){bb.createProfile();return;}
    const action={accounts:'account',cards:'card',categories:'category',currencies:'currency',data:'rule'}[state.activeKey];
    if(action)runMobileSettingsAdd(action);
    else if(!state.activeKey)state.addMenu.hidden=!state.addMenu.hidden;
  }
  function runMobileSettingsAdd(action) {
    const bb = window.BlackBook;
    if (!bb) return;
    if (action === 'account') bb.openNewAccount();
    else if (action === 'card') bb.openNewCreditCard();
    else if (action === 'category') bb.openNewCategory();
    else if (action === 'currency') bb.openAddCurrencyModal();
    else if (action === 'rule') bb.openImportRule();
  }

  let mobileDateOverlay = null;

  function closeMobileDatePicker() {
    if (mobileDateOverlay) mobileDateOverlay.remove();
    mobileDateOverlay = null;
  }

  function openMobileDatePicker() {
    const bb = window.BlackBook;
    const page = document.querySelector('.page:not(.hidden)');
    if (!bb || !page) return;
    closeMobileReportsDatePicker();
    closeMobileDatePicker();
    const overlay = document.createElement('div');
    overlay.className = 'mobile-date-overlay';
    const panel = document.createElement('div');
    panel.className = 'mobile-date-panel';
    const source = page.querySelector('.month-picker');
    if (source) panel.appendChild(source.cloneNode(true));
    else {
      panel.innerHTML = bb.monthPickerHtml();
      panel.querySelector('.mp-months')?.remove();
    }
    overlay.appendChild(panel);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeMobileDatePicker();
    });
    panel.addEventListener('click', event => {
      if (event.target.closest('button')) closeMobileDatePicker();
    });
    document.body.appendChild(overlay);
    mobileDateOverlay = overlay;
  }

  function openMobileCalendar() {
    if (window.BlackBook?.currentPage === 'reports') { openMobileReportsDatePicker(); return; }
    openMobileDatePicker();
  }

  function createQuickActions() {
    const footer = document.querySelector('.app-footer');
    if (!footer || footer.querySelector('.mobile-action-bar')) return;
    const bar = document.createElement('nav');
    bar.className = 'mobile-action-bar';
    bar.setAttribute('aria-label', 'Page actions');
    bar.innerHTML = '<button type="button" class="mobile-action mobile-action-slot" data-mobile-action="slot-1"></button>' +
      '<button type="button" class="mobile-action mobile-action-slot" data-mobile-action="slot-2"></button>' +
      '<button type="button" class="mobile-action mobile-action-add" data-mobile-action="add" aria-label="Add transaction">+</button>' +
      '<button type="button" class="mobile-action mobile-action-slot" data-mobile-action="slot-3"></button>' +
      '<button type="button" class="mobile-action mobile-action-slot" data-mobile-action="slot-4"></button>';
    bar.addEventListener('click', (event) => {
      const button = event.target.closest('[data-mobile-action]');
      if (!button || !window.BlackBook) return;
      const action = button.dataset.action || button.dataset.mobileAction;
      const bb = window.BlackBook;
      if (button === bar.querySelector('[data-mobile-action="add"]') && Date.now() < (button._mobileSuppressClickUntil || 0)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (action === 'add') {
        if (bb.currentPage === 'settings') addMobileSettingsItem(bb);
        else if (bb.currentPage === 'cards') bb.openNewCardTx();
        else if (bb.currentPage === 'savings') bb._savingsView === 'wishlist' ? bb.openWishlistItem() : bb.openNewSavingsGoal();
        else if (bb.currentPage === 'debts') bb.openNewDebt();
        else if (bb.currentPage === 'invoices') bb.openNewInvoice();
        else bb.openNewTransaction();
      }
      else if (action === 'reports-pages') openMobileReportsWheel();
      else if (action === 'reports-categories') bb.toggleReportsFilterMenu('categories');
      else if (action === 'reports-date') openMobileReportsDatePicker();
      else if (action === 'reports-flow-group') bb.toggleReportsFlowGroup();
      else if (action === 'reports-flow-period') bb.setReportsFlowPeriod(bb.reportsState().flowPeriod === 'year' ? 'month' : 'year');
      else if (action === 'reports-forecast-days') {
        const ranges = [30, 60, 90];
        const current = Number(bb._forecastDays) || 30;
        bb.setForecastDays(ranges[(ranges.indexOf(current) + 1) % ranges.length]);
      }
      else if (action === 'reports-recurring') bb.openRecurringTemplate();
      else if (action === 'settings-add') addMobileSettingsItem(bb);
      else if (action === 'new-bill') bb.openNewBill();
      else if (action === 'debt-filter') bb.cycleDebtFilter();
      else if (action === 'invoice-filter') bb.cycleInvoiceFilter();
      else if (action === 'graph') runGraphAction(bb);
      else if (action === 'transfer') bb.openTransferModal();
      else if (action === 'allocate') bb.openBudgetAllocationModal();
      else if (action === 'pay-card-bill') bb.openMobileCardBill();
      else if (action === 'accounts') bb.toggleAccountsPanel();
      else if (action === 'date') openMobileCalendar();
      else if (action === 'profile') openMobileSettingsProfiles();
      else if (action === 'theme') bb.setTheme(bb.currentTheme() === 'dark' ? 'light' : 'dark');
      else if (action === 'settings-section') openMobileSettingsSection(button.dataset.settingsSection);
      else if (action === 'settings-back') closeMobileSettingsSection();
      else if (action === 'refresh-rates') bb.refreshAllRates();
      else if (action === 'settings-add-choice') runMobileSettingsAdd(button.dataset.settingsAdd);
      else if (action === 'search') openMobileCommandPalette(bb);
      else if (action === 'pages') document.body.classList.toggle('mobile-nav-open');
    });
    bindMobileAddGesture(bar.querySelector('[data-mobile-action="add"]'));
    bindMobileReportsWheel(bar.querySelector('[data-mobile-action="add"]'));
    footer.appendChild(bar);
    syncQuickActions();
  }

  function bindMobileAddGesture(button) {
    if (!button || button._mobileQuickAddGestureBound) return;
    button._mobileQuickAddGestureBound = true;
    let start = null;
    button.addEventListener('pointerdown', event => {
      if (!mobileNavQuery.matches || !window.BlackBook || (event.button != null && event.button !== 0)) return;
      if (window.BlackBook.currentPage === 'reports') return;
      start = { y:event.clientY, x:event.clientX, pointerId:event.pointerId };
      try { button.setPointerCapture(event.pointerId); } catch (_) {}
    });
    button.addEventListener('pointerup', event => {
      if (!start || event.pointerId !== start.pointerId) return;
      const deltaY = event.clientY - start.y;
      const deltaX = event.clientX - start.x;
      start = null;
      if (deltaY <= -42 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2) {
        button._mobileSuppressClickUntil = Date.now() + 450;
        setCommandDragState(button, false);
        if (event.cancelable) event.preventDefault();
        openMobileCommandPalette(window.BlackBook);
      } else setCommandDragState(button, false);
    });
    button.addEventListener('pointermove', event => {
      if (!start || event.pointerId !== start.pointerId) return;
      const deltaY = event.clientY - start.y;
      const deltaX = event.clientX - start.x;
      setCommandDragState(button, deltaY < -12 && Math.abs(deltaY) > Math.abs(deltaX));
    });
    const clear = () => { start = null; setCommandDragState(button, false); };
    button.addEventListener('pointercancel', clear);
    button.addEventListener('lostpointercapture', clear);
  }

  function bindMobileReportsWheel(button) {
    if (!button || button._mobileReportsWheelBound) return;
    button._mobileReportsWheelBound = true;
    let gesture = null;
    button.addEventListener('pointerdown', event => {
      const bb = window.BlackBook;
      if (!mobileNavQuery.matches || !bb || bb.currentPage !== 'reports' || (event.button != null && event.button !== 0)) return;
      const rect = button.getBoundingClientRect();
      gesture = { pointerId:event.pointerId, anchorY:rect.top + rect.height / 2, moved:false };
      openMobileReportsWheel();
      try { button.setPointerCapture(event.pointerId); } catch (_) {}
      if (event.cancelable) event.preventDefault();
    });
    button.addEventListener('pointermove', event => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      if (Math.hypot(event.clientX - (button.getBoundingClientRect().left + button.offsetWidth / 2), event.clientY - gesture.anchorY) > 10) gesture.moved = true;
      if (!gesture.moved) return;
      updateMobileReportsWheelAt(event.clientX, event.clientY, gesture.anchorY);
      if (event.cancelable) event.preventDefault();
    });
    const finish = event => {
      if (!gesture || (event && event.pointerId !== gesture.pointerId)) return;
      const current = gesture;
      gesture = null;
      if (!current.moved) return;
      const selected = updateMobileReportsWheelAt(event.clientX, event.clientY, current.anchorY);
      button._mobileSuppressClickUntil = Date.now() + 450;
      if (event.cancelable) event.preventDefault();
      if (selected) selectMobileReportsView(selected);
      else closeMobileReportsWheel();
    };
    button.addEventListener('pointerup', finish);
    button.addEventListener('pointercancel', () => { gesture = null; closeMobileReportsWheel(); });
    button.addEventListener('lostpointercapture', () => { if (gesture) { gesture = null; closeMobileReportsWheel(); } });
  }

  function scrollToSettingsSection(action) {
    const root = document.getElementById('page-settings');
    if (!root) return;
    let target = null;
    if (action === 'profile') target = root.querySelector('#profiles-list');
    else if (action === 'theme') target = root.querySelector('.settings-theme-highlight-row');
    else if (action === 'settings-accounts') target = root.querySelector('#settings-account-list');
    else if (action === 'categories') {
      target = Array.from(root.querySelectorAll('.settings-section')).find(section =>
        section.querySelector('.settings-section-title')?.textContent.trim() === 'CATEGORIES');
    }
    if (target) (target.closest('.settings-section') || target).scrollIntoView({ behavior:'smooth', block:'start' });
  }

  function syncQuickActions() {
    const bar=document.querySelector('.mobile-action-bar'), bb=window.BlackBook;
    if(!bar||!bb||!bb.currentPage)return;
    const settingsRoot=document.getElementById('page-settings');
    if(mobileNavQuery.matches)setupMobileSettings(settingsRoot);else teardownMobileSettings();
    const activePage=document.querySelector('.page:not(.hidden)'),hasDate=!!activePage?.querySelector('.month-picker');
    let actions;
    if(bb.currentPage==='overview')actions=[['accounts','ACCOUNTS'],['graph','GRAPH'],['transfer','TRANSFER'],['date','DATE']];
    else if(bb.currentPage==='bills')actions=[['search','SEARCH'],['graph','GRAPH'],['none',''],['none','']];
    else if(bb.currentPage==='budget')actions=[['search','SEARCH'],['graph','GRAPH'],['allocate','ALLOCATE'],['date','DATE']];
    else if(bb.currentPage==='settings')actions=mobileSettingsState?.activeKey==='currencies'
      ?[['none',''],['refresh-rates','REFRESH'],['none',''],['settings-back','BACK']]
      :mobileSettingsState?.activeKey
        ?[['none',''],['none',''],['none',''],['settings-back','BACK']]
        :[['profile','PROFILE'],['none',''],['none',''],['none','']];
    else if(bb.currentPage==='cards')actions=[['search','SEARCH'],['none',''],['none',''],['pay-card-bill','PAY BILL']];
    else if(bb.currentPage==='savings')actions=[['search','SEARCH'],['none',''],['none',''],['none','']];
    else if(bb.currentPage==='debts')actions=[['search','SEARCH'],['debt-filter',({in:'OWED',out:'I OWE',all:'ALL'}[bb._debtFilter||'all'])],['transfer','TRANSFER'],['none','']];
    else if(bb.currentPage==='invoices')actions=[['search','SEARCH'],['invoice-filter',({out:'INCOMES',in:'EXPENSES',all:'ALL'}[bb._invFilter||'all'])],['transfer','TRANSFER'],[hasDate?'date':'none',hasDate?'YEAR':'']];
    else if(bb.currentPage==='reports'){
      const view=bb.reportsState&&bb.reportsState().view;
      const state=bb.reportsState?bb.reportsState():{};
      const hasCategories=!!document.querySelector('#page-reports .reports-mobile-filter-control.reports-mobile-filter-categories');
      const hasReportsDate=!!document.querySelector('#page-reports .month-picker');
      if(view==='forecast') actions=[['search','SEARCH'],['graph','GRAPH'],['reports-forecast-days',(Number(bb._forecastDays)||30)+' DAYS'],['reports-recurring','RECURRING']];
      else if(view==='moneyflow') actions=[['search','SEARCH'],['reports-flow-group',state.flowGroup==='people'?'PEOPLE':'CATEGORIES'],['reports-flow-period',state.flowPeriod==='year'?'YEAR':'MONTH'],[hasReportsDate?'reports-date':'none',hasReportsDate?'DATE':'']];
      else actions=[['search','SEARCH'],['none',''],[hasCategories?'reports-categories':'none',hasCategories?'CATEGORIES':''],[hasReportsDate?'reports-date':'none',hasReportsDate?'DATE':'']];
    }
    else actions=[['search','SEARCH'],['none',''],['none',''],['none','']];
    bar.dataset.page = bb.currentPage;
    const add=bar.querySelector('[data-mobile-action="add"]');
    if(add){
      const key=mobileSettingsState?.activeKey||'';
      const context={accounts:'Add account',cards:'Add credit card',categories:'Add category',currencies:'Add currency',data:'Add rule'}[key];
      const profileOpen=mobileSettingsState&&!mobileSettingsState.profileModal.hidden;
      const reportsWheel=bb.currentPage==='reports';
      const unavailable=(bb.currentPage==='settings'&&key!==''&&!context&&!profileOpen);
      const pageAddLabel=bb.currentPage==='bills'?'New bill':bb.currentPage==='cards'?'New card purchase':bb.currentPage==='savings'?(bb._savingsView==='wishlist'?'Add wishlist item':'Add savings goal'):bb.currentPage==='debts'?'New debt':bb.currentPage==='invoices'?'New invoice':'Add transaction';
      const label=reportsWheel?'Choose report page':profileOpen?'New profile':bb.currentPage==='settings'?(context||'Add'):pageAddLabel;
      add.dataset.action=reportsWheel?'reports-pages':bb.currentPage==='bills'?'new-bill':bb.currentPage==='settings'?'settings-add':'add';
      add.innerHTML=reportsWheel?'<svg class="mobile-reports-main-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M1 2.7h22L12 21.75z"/></svg>':'+';
      add.setAttribute('aria-label',label);add.title=label;add.disabled=unavailable;
      if(!reportsWheel)closeMobileReportsWheel();
    }
    bar.querySelectorAll('.mobile-action-slot').forEach((button,index)=>{const [action,label]=actions[index],unavailable=action==='none',refresh=action==='refresh-rates';button.dataset.action=action;button.textContent=label;button.disabled=unavailable;button.tabIndex=unavailable?-1:0;button.setAttribute('aria-hidden',String(unavailable));button.setAttribute('aria-label',unavailable?'Unavailable':refresh?'Refresh exchange rates':label.charAt(0)+label.slice(1).toLowerCase());button.title=unavailable?'':button.getAttribute('aria-label');button.classList.toggle('is-disabled',unavailable);button.classList.toggle('mobile-action-refresh',refresh);});
  }

  function runGraphAction(bb) {
    let toggle = null;
    if (bb.currentPage === 'overview') toggle = () => bb.toggleOverviewGraph();
    else if (bb.currentPage === 'bills' && bb.toggleBillsGraph) toggle = () => bb.toggleBillsGraph();
    else if (bb.currentPage === 'budget' && bb.toggleBudgetGraph) toggle = () => bb.toggleBudgetGraph();
    else if (bb.currentPage === 'reports' && bb.reportsState && bb.reportsState().view === 'forecast' && bb.toggleForecastGraph) toggle = () => bb.toggleForecastGraph();
    if (toggle) {
      const workspace = document.querySelector('.app-workspace');
      const list = document.querySelector('#page-overview .tx-list-wrap');
      const workspaceTop = workspace ? workspace.scrollTop : 0;
      const listTop = list ? list.scrollTop : 0;
      const result = toggle();
      Promise.resolve(result).finally(() => requestAnimationFrame(() => {
        const nextWorkspace = document.querySelector('.app-workspace');
        const nextList = document.querySelector('#page-overview .tx-list-wrap');
        if (nextWorkspace) nextWorkspace.scrollTop = workspaceTop;
        if (nextList) nextList.scrollTop = listTop;
      }));
      return result;
    }
    const footerButton = document.getElementById('footer-graph-toggle');
    if (footerButton && !footerButton.classList.contains('hidden')) footerButton.click();
  }

  function openMobileCommandPalette(bb) {
    bb.openCommandPalette();
    const overlay = document.getElementById('command-overlay');
    if (!overlay) return;
    overlay.classList.toggle('mobile-command-mode', mobileNavQuery.matches);
    overlay.classList.remove('mobile-command-expanded', 'mobile-command-has-query');
  }

  function setupMobileCommandPalette() {
    const overlay = document.getElementById('command-overlay');
    const palette = overlay && overlay.querySelector('.command-palette');
    if (!overlay || !palette || palette._mobileDragBound) return;
    palette._mobileDragBound = true;
    const commandInput = palette.querySelector('#command-input');
    if (commandInput) commandInput.addEventListener('input', () => overlay.classList.toggle('mobile-command-has-query', !!commandInput.value.trim()));
    let startY = null;
    let touchStartY = null;
    const applyDrag = deltaY => {
      if (deltaY < -24) overlay.classList.add('mobile-command-expanded');
      else if (deltaY > 36) overlay.classList.remove('mobile-command-expanded');
    };
    palette.addEventListener('pointerdown', event => {
      if (!mobileNavQuery.matches || !overlay.classList.contains('mobile-command-mode') || event.button !== 0) return;
      if (event.target.closest('button, .command-item')) return;
      startY = event.clientY;
      if (palette.setPointerCapture) palette.setPointerCapture(event.pointerId);
    });
    palette.addEventListener('pointerup', event => {
      if (startY == null) return;
      const deltaY = event.clientY - startY;
      startY = null;
      applyDrag(deltaY);
    });
    palette.addEventListener('pointercancel', () => { startY = null; });
    palette.addEventListener('touchstart', event => {
      if (!mobileNavQuery.matches || !overlay.classList.contains('mobile-command-mode') || event.touches.length !== 1) return;
      touchStartY = event.touches[0].clientY;
    }, { passive:true });
    palette.addEventListener('touchend', event => {
      if (touchStartY == null || !event.changedTouches.length) return;
      const deltaY = event.changedTouches[0].clientY - touchStartY;
      touchStartY = null;
      applyDrag(deltaY);
    }, { passive:true });
  }

  function createDrawerScrim() {
    if (document.querySelector('.mobile-nav-scrim') || !document.querySelector('.app-sidebar')) return;
    const scrim = document.createElement('button');
    scrim.type = 'button';
    scrim.className = 'mobile-nav-scrim';
    scrim.setAttribute('aria-label', 'Close pages menu');
    scrim.addEventListener('click', () => document.body.classList.remove('mobile-nav-open'));
    document.body.appendChild(scrim);
  }

  function bindBillsFilterMenu() {
    document.addEventListener('click', event => {
      const wrap = document.querySelector('#page-bills .bills-graph-controls.is-open');
      if (!wrap || wrap.contains(event.target)) return;
      wrap.classList.remove('is-open');
      const button = wrap.querySelector('.bills-mobile-filter-toggle');
      if (button) button.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const wrap = document.querySelector('#page-bills .bills-graph-controls.is-open');
      if (!wrap) return;
      wrap.classList.remove('is-open');
      const button = wrap.querySelector('.bills-mobile-filter-toggle');
      if (button) button.setAttribute('aria-expanded', 'false');
    });
  }

  function activeMobileToolbar() {
    const activePage = document.querySelector('.page:not(.hidden)');
    return activePage && activePage.querySelector('.mobile-overview-toolbar');
  }

  function createPopover(toolbar, className, label) {
    const panel = document.createElement('div');
    panel.className = 'mobile-control-popover ' + className;
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', label);
    panel.hidden = true;
    toolbar.appendChild(panel);
    return panel;
  }

  function openMobilePanel(name) {
    const toolbar = activeMobileToolbar();
    if (!toolbar) return;
    const next = toolbar.querySelector('[data-mobile-panel="' + name + '"]');
    const wasOpen = next && !next.hidden;
    closeMobilePanels(toolbar);
    if (next && !wasOpen) {
      next.hidden = false;
      next.classList.add('is-open');
      const button = toolbar.querySelector('[data-mobile-control="' + name + '"]');
      if (button) button.setAttribute('aria-expanded', 'true');
    }
  }

  function closeMobilePanels(toolbar) {
    if (!toolbar) return;
    toolbar.querySelectorAll('.mobile-control-popover').forEach(panel => {
      panel.hidden = true;
      panel.classList.remove('is-open');
    });
    toolbar.querySelectorAll('[data-mobile-control]').forEach(button => button.setAttribute('aria-expanded', 'false'));
  }

  function setupAccountDeck(root) {
    const chips = root.querySelector('.account-chips');
    if (!chips) return;
    let deck = root.querySelector('.mobile-account-deck');
    if (!mobileOverviewQuery.matches) {
      if (!deck) return;
      const track = deck.querySelector('.mobile-account-track');
      const row = chips.querySelector('.account-chips-row');
      const list = row && row.querySelector('.account-chip-list');
      const cards = track ? Array.from(track.children) : [];
      const all = deck.querySelector('.mobile-all-accounts-shortcut');
      if (all) {
        all.innerHTML = all.dataset.mobileOriginalHtml || '<span class="ov-triangle"></span>';
        all.classList.remove('mobile-account-card', 'mobile-all-accounts-shortcut', 'selected');
        if (!window.BlackBook || !window.BlackBook.selectedAccount) all.classList.add('selected');
        if (list) row.insertBefore(all, list);
      }
      track?.querySelector('.mobile-account-all-summary')?.remove();
      if (list) {
        cards.filter(card => !card.classList.contains('mobile-account-all-summary')).forEach(card => {
          card.classList.remove('mobile-account-card');
          list.appendChild(card);
        });
      }
      chips.classList.remove('mobile-account-source');
      deck.remove();
      return;
    }
    if (!deck) {
      const row = chips.querySelector('.account-chips-row');
      const list = row && row.querySelector('.account-chip-list');
      if (!row || !list) return;
      deck = document.createElement('section');
      deck.className = 'mobile-account-deck';
      deck.setAttribute('aria-label', 'Select account');
      const track = document.createElement('div');
      track.className = 'mobile-account-track';
      track.setAttribute('role', 'group');
      const dots = document.createElement('div');
      dots.className = 'mobile-account-dots';
      deck.append(track, dots);
      const commitAccountPosition = index => {
        const bb = window.BlackBook;
        const cards = Array.from(track.children);
        const offset = cards[0]?.classList.contains('mobile-account-all-summary') ? 1 : 0;
        const accountIndex = index - offset;
        updateAccountDots(deck, accountIndex);
        if (!bb) return;
        if (accountIndex < 0) {
          if (bb.selectedAccount) bb.selectAccount(null);
          return;
        }
        const account = (bb.visibleAccounts ? bb.visibleAccounts() : [])[accountIndex];
        if (account && bb.selectedAccount !== account.id) bb.selectAccount(account.id);
      };
      const settleAccountPosition = () => {
        if (track._accountDrag || track._accountSnapAnimating || !track.clientWidth) return;
        clearTimeout(track._accountScrollTimer);
        clearTimeout(track._accountSnapTimer);
        track.classList.remove('is-account-snapping');
        track.style.removeProperty('scroll-snap-type');
        track.style.removeProperty('scroll-behavior');
        const cards = Array.from(track.children);
        const index = Math.max(0, Math.min(cards.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
        track._accountSnapTarget = null;
        commitAccountPosition(index);
      };
      const animateAccountTo = index => {
        const width = track.clientWidth;
        const cards = Array.from(track.children);
        if (!width || !cards.length) return;
        index = Math.max(0, Math.min(cards.length - 1, index));
        clearTimeout(track._accountSnapTimer);
        track._accountAnimationToken = (track._accountAnimationToken || 0) + 1;
        const token = track._accountAnimationToken;
        track._accountSnapTarget = index;
        track._accountSnapAnimating = true;
        track.style.scrollSnapType = 'none';
        track.style.scrollBehavior = 'auto';
        track.classList.add('is-account-snapping');
        track.classList.remove('is-account-dragging');
        const startLeft = track.scrollLeft;
        const targetLeft = index * width;
        const distanceToTarget = targetLeft - startLeft;
        if (Math.abs(distanceToTarget) < 1) {
          track._accountSnapAnimating = false;
          settleAccountPosition();
          return;
        }
        const duration = 420;
        const startTime = performance.now();
        const finish = () => {
          if (token !== track._accountAnimationToken || !track.isConnected) return;
          track.scrollLeft = targetLeft;
          track._accountSnapAnimating = false;
          settleAccountPosition();
        };
        const animateSnap = now => {
          if (token !== track._accountAnimationToken || !track.isConnected) return;
          const progress = Math.min(1, (now - startTime) / duration);
          const eased = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
          track.scrollLeft = startLeft + distanceToTarget * eased;
          updateAccountIndicatorFromTrack(deck, track);
          if (progress < 1) {
            requestAnimationFrame(animateSnap);
            return;
          }
          finish();
        };
        requestAnimationFrame(animateSnap);
        track._accountSnapTimer = setTimeout(finish, duration + 100);
      };
      track._animateAccountTo = animateAccountTo;
      root.insertBefore(deck, chips);
      const all = row.querySelector('.ov-chip');
      if (all) {
        all.dataset.mobileOriginalHtml = all.innerHTML;
        all.innerHTML = '<span class="ov-triangle"></span>';
        all.classList.add('mobile-all-accounts-shortcut');
        deck.insertBefore(all, track);
        const allSummary = document.createElement('div');
        allSummary.className = 'mobile-account-card mobile-account-all-summary';
        allSummary.innerHTML = '<span class="chip-name">ALL ACCOUNTS</span><span class="chip-balance"></span>';
        allSummary.addEventListener('click', () => all.click());
        track.appendChild(allSummary);
      }
      Array.from(list.children).forEach(card => {
        card.classList.add('mobile-account-card');
        track.appendChild(card);
      });
      chips.classList.add('mobile-account-source');
      track.addEventListener('scroll', () => {
        updateAccountIndicatorFromTrack(deck, track);
        if (track._accountDrag || track._accountSnapTarget != null) {
          clearTimeout(track._accountScrollTimer);
          return;
        }
        clearTimeout(track._accountScrollTimer);
        track._accountScrollTimer = setTimeout(settleAccountPosition, 120);
      }, { passive: true });
      track.addEventListener('scrollend', settleAccountPosition);
      track.addEventListener('pointerdown', event => {
        if (event.isPrimary === false || event.button !== 0) return;
        if (track._accountSnapAnimating) {
          track._accountAnimationToken = (track._accountAnimationToken || 0) + 1;
          clearTimeout(track._accountSnapTimer);
          track._accountSnapAnimating = false;
          track._accountSnapTarget = null;
          track.classList.remove('is-account-snapping');
          track.style.scrollSnapType = 'none';
          track.style.scrollBehavior = 'auto';
        }
        const width = track.clientWidth;
        const cards = Array.from(track.children);
        if (!width || !cards.length) return;
        const startIndex = Math.max(0, Math.min(cards.length - 1, Math.round(track.scrollLeft / width)));
        track._accountDrag = {
          pointerId:event.pointerId,
          x:event.clientX,
          y:event.clientY,
          left:track.scrollLeft,
          width,
          startIndex,
          minLeft:Math.max(0, (startIndex - 1) * width),
          maxLeft:Math.min((cards.length - 1) * width, (startIndex + 1) * width),
          horizontal:false,
          vertical:false,
          moved:false
        };
        if (track.setPointerCapture) track.setPointerCapture(event.pointerId);
      }, true);
      track.addEventListener('pointermove', event => {
        const drag = track._accountDrag;
        if (!drag || event.pointerId !== drag.pointerId) return;
        const delta = event.clientX - drag.x;
        const deltaY = event.clientY - drag.y;
        if (!drag.horizontal && !drag.vertical) {
          if (Math.abs(delta) < 8 && Math.abs(deltaY) < 8) return;
          if (Math.abs(deltaY) > Math.abs(delta) * 1.25) { drag.vertical = true; return; }
          if (Math.abs(delta) <= Math.abs(deltaY) * 1.25) return;
          drag.horizontal = true;
        }
        if (drag.vertical) return;
        drag.moved = true;
        track.classList.add('is-account-dragging');
        const intendedOffset = -delta;
        track.scrollLeft = Math.max(drag.minLeft, Math.min(drag.maxLeft, drag.left + intendedOffset));
        updateAccountIndicatorFromTrack(deck, track);
        event.preventDefault();
      });
      const finishAccountDrag = event => {
        const drag = track._accountDrag;
        if (!drag || (event && event.pointerId !== drag.pointerId)) return;
        track._accountDrag = null;
        if (!drag.moved) {
          track.classList.remove('is-account-dragging');
          if (!track._accountSnapAnimating) {
            track.style.removeProperty('scroll-snap-type');
            track.style.removeProperty('scroll-behavior');
          }
          return;
        }
        event?.preventDefault();
        track._ignoreAccountClickUntil = Date.now() + 220;
        const width = track.clientWidth;
        const cards = Array.from(track.children);
        if (!width || !cards.length) return;
        const minIndex = Math.max(0, drag.startIndex - 1);
        const maxIndex = Math.min(cards.length - 1, drag.startIndex + 1);
        const nearestIndex = Math.round(track.scrollLeft / width);
        const index = Math.max(minIndex, Math.min(maxIndex, nearestIndex));
        animateAccountTo(index);
      };
      track.addEventListener('pointerup', finishAccountDrag);
      track.addEventListener('pointercancel', finishAccountDrag);
      track.addEventListener('click', event => {
        if (Date.now() < (track._ignoreAccountClickUntil || 0)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        const card = event.target.closest('.mobile-account-card');
        if (!card || !track.contains(card)) return;
        const cards = Array.from(track.children);
        const width = track.clientWidth;
        const currentIndex = width ? Math.max(0, Math.min(cards.length - 1, Math.round(track.scrollLeft / width))) : cards.findIndex(item => item.classList.contains('selected'));
        const cardIndex = cards.indexOf(card);
        if (cardIndex !== currentIndex || !card.clientWidth) return;
        const x = event.clientX - card.getBoundingClientRect().left;
        const nextIndex = x < card.clientWidth / 2 ? cardIndex - 1 : cardIndex + 1;
        if (nextIndex < 0 || nextIndex >= cards.length || nextIndex === cardIndex) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        track._animateAccountTo(nextIndex);
      }, true);
    }
    const track = deck.querySelector('.mobile-account-track');
    const dots = deck.querySelector('.mobile-account-dots');
    const cards = track ? Array.from(track.children) : [];
    const all = deck.querySelector('.mobile-all-accounts-shortcut');
    const allSummary = track && track.querySelector('.mobile-account-all-summary');
    const accountCards = cards.filter(card => !card.classList.contains('mobile-account-all-summary'));
    const accountOffset = cards.length - accountCards.length;
    if (all && allSummary && window.BlackBook && window.BlackBook.data) {
      const bb = window.BlackBook;
      const total = (bb.visibleAccounts ? bb.visibleAccounts() : []).reduce((sum, account) => sum + bb.accountBalance(account.id), 0);
      const balance = allSummary.querySelector('.chip-balance');
      const totalText = bb.accountChipAmount ? bb.accountChipAmount(total, bb.baseCurrency()) : bb.fmtBase(total);
      if (balance && (balance.querySelector(".money-full")?.textContent || balance.textContent) !== totalText) balance.textContent = totalText;
      allSummary.classList.toggle('selected', !bb.selectedAccount);
      all.setAttribute('aria-label', 'Show all accounts · ' + totalText);
      all.setAttribute('aria-pressed', String(!bb.selectedAccount));
    }
    if (dots && dots.querySelectorAll('.mobile-account-dot').length !== accountCards.length) {
      dots.innerHTML = accountCards.map((card, index) => '<button type="button" class="mobile-account-dot" aria-label="Select ' + (card.querySelector('.chip-name')?.textContent.trim() || 'account') + '" data-account-index="' + index + '"></button>').join('') + '<span class="mobile-account-indicator" aria-hidden="true"></span>';
      dots.onclick = event => {
        const button = event.target.closest('[data-account-index]');
        if (!button || !track) return;
        const index = Number(button.dataset.accountIndex) || 0;
        const account = window.BlackBook && window.BlackBook.visibleAccounts && window.BlackBook.visibleAccounts()[index];
        if (account && track._animateAccountTo) track._animateAccountTo(index + accountOffset);
      };
    }
    const selectedIndex = window.BlackBook && window.BlackBook.selectedAccount
      ? Math.max(1, cards.findIndex(card => card.classList.contains('selected')))
      : 0;
    if (track && track.clientWidth && Math.round(track.scrollLeft / track.clientWidth) !== selectedIndex) track.scrollLeft = selectedIndex * track.clientWidth;
    updateAccountDots(deck, window.BlackBook && window.BlackBook.selectedAccount ? selectedIndex - accountOffset : -1);
  }

  function updateAccountDots(deck, activeIndex) {
    if (!deck) return;
    deck.querySelectorAll('.mobile-account-dot').forEach((dot, index) => {
      dot.classList.toggle('selected', index === activeIndex);
      const current = index === activeIndex ? 'true' : 'false';
      if (dot.getAttribute('aria-current') !== current) dot.setAttribute('aria-current', current);
    });
    updateAccountIndicator(deck, activeIndex);
  }

  function updateAccountIndicatorFromTrack(deck, track) {
    if (!track || !track.clientWidth) return;
    const offset = track.firstElementChild?.classList.contains('mobile-account-all-summary') ? 1 : 0;
    updateAccountIndicator(deck, track.scrollLeft / track.clientWidth - offset);
  }

  function updateAccountIndicator(deck, accountPosition) {
    const dots = deck && deck.querySelector('.mobile-account-dots');
    const segments = dots ? Array.from(dots.querySelectorAll('.mobile-account-dot')) : [];
    const indicator = dots && dots.querySelector('.mobile-account-indicator');
    if (!dots || !segments.length || !indicator) return;
    const first = segments[0];
    const gap = parseFloat(getComputedStyle(dots).columnGap) || 0;
    const step = first.offsetWidth + gap;
    const boundedPosition = Math.max(-1, Math.min(segments.length - 1, accountPosition));
    indicator.style.width = first.offsetWidth + 'px';
    indicator.style.transform = 'translateX(' + (first.offsetLeft + boundedPosition * step) + 'px)';
    indicator.style.opacity = String(Math.max(0, Math.min(1, accountPosition + 1)));
  }

  function rememberMobileAnchor(element) {
    if (!element || element._mobileAnchor) return;
    const anchor = document.createElement('span');
    anchor.hidden = true;
    anchor.className = 'mobile-control-anchor';
    element.parentNode.insertBefore(anchor, element);
    element._mobileAnchor = anchor;
  }

  function restoreMobileNode(element) {
    const anchor = element && element._mobileAnchor;
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(element, anchor.nextSibling);
      anchor.remove();
      delete element._mobileAnchor;
    }
  }

  function setupBudgetToolbar(root) {
    let toolbar = root.querySelector('.mobile-overview-toolbar');
    if (!mobileOverviewQuery.matches) {
      if (!toolbar) return;
      restoreMobileNode(toolbar.querySelector('.month-picker'));
      toolbar.remove();
      return;
    }
    const picker = root.querySelector(':scope > .month-picker');
    const summary = root.querySelector('.budget-summary');
    if (!picker || !summary) return;
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'mobile-overview-toolbar mobile-budget-toolbar';
      toolbar.setAttribute('aria-label', 'Budget controls');
      const panel = createPopover(toolbar, 'mobile-calendar-popover', 'Calendar');
      panel.dataset.mobilePanel = 'calendar';
      summary.insertAdjacentElement('afterend', toolbar);
    } else if (summary.nextElementSibling !== toolbar) {
      summary.insertAdjacentElement('afterend', toolbar);
    }
    const panel = toolbar.querySelector('[data-mobile-panel="calendar"]');
    if (panel && picker.parentNode !== panel) {
      rememberMobileAnchor(picker);
      panel.appendChild(picker);
    }
  }

  function setupOverviewToolbar(root) {
    let toolbar = root.querySelector('.mobile-overview-toolbar');
    if (!mobileOverviewQuery.matches) {
      if (!toolbar) return;
      const picker = toolbar.querySelector('.month-picker');
      const filter = toolbar.querySelector('.cat-filter');
      const typeButton = toolbar.querySelector('.ov-type-cycle');
      const sortButton = toolbar.querySelector('.ov-sort-cycle');
      const sortDirButton = toolbar.querySelector('.ov-sort-dir');
      const panel = toolbar.querySelector('#accounts-panel');
      const chips = root.querySelector('.account-chips');
      if (panel && chips) chips.appendChild(panel);
      restoreMobileNode(picker);
      restoreMobileNode(filter);
      restoreMobileNode(typeButton);
      restoreMobileNode(sortButton);
      restoreMobileNode(sortDirButton);
      if (sortButton && sortButton.dataset.mobileOriginalHtml) { sortButton.innerHTML = sortButton.dataset.mobileOriginalHtml; delete sortButton.dataset.mobileOriginalHtml; sortButton.classList.remove('mobile-overview-control', 'mobile-sort-control'); }
      if (sortButton && sortButton.dataset.mobileOriginalOnclick) { sortButton.setAttribute('onclick', sortButton.dataset.mobileOriginalOnclick); delete sortButton.dataset.mobileOriginalOnclick; }
      if (sortDirButton && sortDirButton.dataset.mobileOriginalHtml) { sortDirButton.innerHTML = sortDirButton.dataset.mobileOriginalHtml; delete sortDirButton.dataset.mobileOriginalHtml; sortDirButton.classList.remove('mobile-overview-control', 'mobile-sort-direction'); }
      if (typeButton) { typeButton.classList.remove('mobile-overview-control', 'mobile-sort-type'); typeButton.style.removeProperty('color'); typeButton.textContent = window.BlackBook?.ovTypeLabel ? window.BlackBook.ovTypeLabel() : 'TYPE'; delete typeButton.dataset.mobileOriginalHtml; }
      root.querySelector('.overview-accounts-sep')?.classList.remove('mobile-overview-sep-hidden');
      toolbar.remove();
      root.querySelector('.mobile-sort-group')?.remove();
      root.querySelector('.mobile-overview-linear-chart')?.remove();
      return;
    }
    const summary = root.querySelector('.month-summary');
    if (!summary) return;
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'mobile-overview-toolbar';
      toolbar.setAttribute('aria-label', 'Overview controls');
      const categoryButton = document.createElement('button');
      categoryButton.type = 'button';
      categoryButton.className = 'mobile-overview-control';
      categoryButton.dataset.mobileControl = 'categories';
      categoryButton.setAttribute('aria-expanded', 'false');
      categoryButton.setAttribute('aria-label', 'Open categories');
      categoryButton.innerHTML = '<span>CATEGORIES</span>';
      const datePanel = createPopover(toolbar, 'mobile-calendar-popover', 'Calendar');
      datePanel.dataset.mobilePanel = 'calendar';
      const categoryPanel = createPopover(toolbar, 'mobile-category-popover', 'Categories');
      categoryPanel.dataset.mobilePanel = 'categories';
      toolbar.insertBefore(categoryButton, categoryPanel);
      categoryButton.addEventListener('click', () => openMobilePanel('categories'));
      const picker = root.querySelector(':scope > .month-picker');
      const filter = root.querySelector('.cat-filter');
      const typeButton = root.querySelector('.ov-type-cycle');
      const sortButton = root.querySelector('.ov-sort-cycle');
      const sortDirButton = root.querySelector('.ov-sort-dir');
      [picker, filter, typeButton, sortButton, sortDirButton].forEach(rememberMobileAnchor);
      if (picker) datePanel.appendChild(picker);
      if (sortButton) {
        sortButton.dataset.mobileOriginalHtml = sortButton.innerHTML;
        sortButton.dataset.mobileOriginalOnclick ||= sortButton.getAttribute('onclick') || '';
        sortButton.setAttribute('onclick', 'BlackBook.cycleOvSortField()');
        const label = document.createElement('span');
        label.className = 'mobile-sort-label';
        sortButton.innerHTML = '';
        sortButton.append(label);
        sortButton.classList.add('mobile-overview-control', 'mobile-sort-control');
        const sortGroup = document.createElement('div');
        sortGroup.className = 'mobile-sort-group';
        toolbar.insertBefore(sortGroup, categoryPanel);
        sortGroup.appendChild(sortButton);
        if (sortDirButton) {
          sortDirButton.dataset.mobileOriginalHtml ||= sortDirButton.innerHTML;
          sortDirButton.classList.add('mobile-overview-control', 'mobile-sort-direction');
          sortGroup.appendChild(sortDirButton);
        }
      }
      if (filter) categoryPanel.appendChild(filter);
      const searchButton = document.createElement('button');
      searchButton.type = 'button';
      searchButton.className = 'mobile-overview-control mobile-search-control';
      searchButton.setAttribute('aria-label', 'Search and filter transactions');
      searchButton.title = 'Search and filter transactions';
      searchButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.2"></circle><path d="m15.4 15.4 5 5"></path></svg>';
      searchButton.addEventListener('click', () => window.BlackBook?.toggleOverviewFindReplace());
      toolbar.appendChild(searchButton);
      const sep = root.querySelector('.overview-accounts-sep');
      if (sep) sep.classList.add('mobile-overview-sep-hidden');
      summary.insertAdjacentElement('afterend', toolbar);
    } else {
      const datePanel = toolbar.querySelector('[data-mobile-panel="calendar"]');
      const categoryPanel = toolbar.querySelector('[data-mobile-panel="categories"]');
      const picker = root.querySelector(':scope > .month-picker');
      const filter = root.querySelector('.cat-filter');
      const typeButton = root.querySelector('.ov-type-cycle');
      const sortButton = root.querySelector('.ov-sort-cycle');
      const sortDirButton = root.querySelector('.ov-sort-dir');
      if (picker && datePanel && picker.parentNode !== datePanel) { rememberMobileAnchor(picker); datePanel.appendChild(picker); }
      if (filter && categoryPanel && filter.parentNode !== categoryPanel) { rememberMobileAnchor(filter); categoryPanel.insertBefore(filter, categoryPanel.firstChild); }
      if (sortButton && sortButton.parentNode !== toolbar.querySelector('.mobile-sort-group')) {
        rememberMobileAnchor(sortButton);
        sortButton.dataset.mobileOriginalOnclick ||= sortButton.getAttribute('onclick') || '';
        sortButton.setAttribute('onclick', 'BlackBook.cycleOvSortField()');
        let sortGroup = toolbar.querySelector('.mobile-sort-group');
        if (!sortGroup) { sortGroup = document.createElement('div'); sortGroup.className = 'mobile-sort-group'; toolbar.insertBefore(sortGroup, toolbar.querySelector('[data-mobile-panel="categories"]')); }
        sortGroup.appendChild(sortButton);
      }
      const sortGroup = toolbar.querySelector('.mobile-sort-group');
      if (sortDirButton && sortGroup && sortDirButton.parentNode !== sortGroup) {
        rememberMobileAnchor(sortDirButton);
        sortDirButton.dataset.mobileOriginalHtml ||= sortDirButton.innerHTML;
        sortDirButton.classList.add('mobile-overview-control', 'mobile-sort-direction');
        sortGroup.appendChild(sortDirButton);
      }
      if (sortButton && sortDirButton && sortGroup && sortButton.nextElementSibling !== sortDirButton) sortGroup.insertBefore(sortButton, sortDirButton);
      const categoriesButton = toolbar.querySelector('[data-mobile-control="categories"]');
      const categoriesPanel = toolbar.querySelector('[data-mobile-panel="categories"]');
      if (categoriesButton && sortGroup && categoriesButton.nextElementSibling !== sortGroup) toolbar.insertBefore(sortGroup, categoriesButton.nextSibling);
    }
    const sortButton = toolbar.querySelector('.ov-sort-cycle');
    if (sortButton && window.BlackBook) {
      const bb = window.BlackBook;
      const label = sortButton.querySelector('.mobile-sort-label');
      const sortModes = ['date', 'value', 'type'];
      if (!sortModes.includes(bb._ovSortBy)) bb._ovSortBy = 'date';
      const nextLabel = bb._ovSortBy.toUpperCase();
      if (label && label.textContent !== nextLabel) label.textContent = nextLabel;
      const aria = 'Sort transactions by ' + bb._ovSortBy;
      if (sortButton.getAttribute('aria-label') !== aria) sortButton.setAttribute('aria-label', aria);
      sortButton.title = aria;
    }
    const sortDirButton = toolbar.querySelector('.ov-sort-dir');
    if (sortDirButton && window.BlackBook) {
      const bb = window.BlackBook;
      const typeMode = bb._ovSortBy === 'type';
      const label = typeMode ? (bb._ovSortDir === 'asc' ? '+' : bb._ovSortDir === 'desc' ? '−' : '±') : (bb._ovSortDir === 'asc' ? '▲' : '▼');
      if (sortDirButton.textContent.trim() !== label) sortDirButton.textContent = label;
      sortDirButton.style.color = typeMode ? (bb._ovSortDir === 'asc' ? 'var(--income)' : bb._ovSortDir === 'desc' ? 'var(--expense)' : 'var(--text-muted)') : '';
      sortDirButton.style.fontSize = typeMode ? '17px' : '';
      const aria = typeMode
        ? (bb._ovSortDir === 'asc' ? 'Income first' : bb._ovSortDir === 'desc' ? 'Expenses first' : 'Neutral type order')
        : 'Sort transactions ' + (bb._ovSortDir === 'asc' ? 'ascending' : 'descending');
      sortDirButton.setAttribute('aria-label', aria);
      sortDirButton.title = aria;
    }
    const panel = root.querySelector('#accounts-panel');
    if (panel && toolbar && panel.parentNode !== toolbar) toolbar.appendChild(panel);

    const categoryBar = root.querySelector('.cat-bar-container');
    if (categoryBar && summary.nextElementSibling !== categoryBar) summary.insertAdjacentElement('afterend', categoryBar);
    const searchButton = toolbar.querySelector('.mobile-search-control');
    const bb = window.BlackBook;
    searchButton?.classList.toggle('is-filter-active', !!(bb?._overviewCustomFilter && bb._overviewCustomFilter.profile === bb.profile));
    syncMobileLinearChart(root);
  }

  function syncMobileLinearChart(root) {
    const donutPanel = root.querySelector('.overview-charts.with-donut .donut-panel');
    const bb = window.BlackBook;
    if (!donutPanel || !bb || typeof bb.overviewMonthlyTotals !== 'function') return;
    let linear = root.querySelector('.mobile-overview-linear-chart');
    if (!mobileOverviewQuery.matches) { if (linear) linear.remove(); return; }
    const totals = bb.overviewMonthlyTotals();
    const visibility = typeof bb.overviewChartVisibility === 'function' ? bb.overviewChartVisibility() : { income:true, expenses:true };
    const income = visibility.income ? Math.abs(totals.income) : 0;
    const expenses = visibility.expenses ? Math.abs(totals.expenses) : 0;
    const total = income + expenses;
    const incomeWidth = total > 0 ? income / total * 100 : 0;
    const expenseWidth = total > 0 ? expenses / total * 100 : 0;
    const incomeText = bb.fmtBase(income);
    const expenseText = bb.fmtBase(expenses);
    const signature = [incomeText, expenseText, visibility.income, visibility.expenses, incomeWidth.toFixed(2), expenseWidth.toFixed(2)].join('|');
    if (!linear) {
      linear = document.createElement('div');
      linear.className = 'mobile-overview-linear-chart';
      linear.setAttribute('role', 'img');
      linear.setAttribute('aria-label', 'Monthly income and expenses');
    }
    if (linear.parentNode !== donutPanel) donutPanel.appendChild(linear);
    if (linear.dataset.signature === signature) return;
    linear.dataset.signature = signature;
    linear.setAttribute('aria-label', 'Income ' + incomeText + '. Expenses ' + expenseText);
    linear.innerHTML = '<div class="mobile-linear-readout"><span class="mobile-linear-total income"' + (visibility.income ? '' : ' style="display:none"') + '>INCOME <b>' + incomeText + '</b></span><span class="mobile-linear-total expense"' + (visibility.expenses ? '' : ' style="display:none"') + '>EXPENSES <b>' + expenseText + '</b></span></div><div class="mobile-linear-track"><span class="mobile-linear-fill income" style="width:' + incomeWidth.toFixed(2) + '%"></span><span class="mobile-linear-fill expense" style="width:' + expenseWidth.toFixed(2) + '%"></span></div>';
  }
  function syncOverviewControls() {
    const root = document.getElementById('page-overview');
    const budgetRoot = document.getElementById('page-budget');
    if (budgetRoot) setupBudgetToolbar(budgetRoot);
    if (!root) return;
    if (!mobileOverviewQuery.matches) {
      setupOverviewToolbar(root);
      setupAccountDeck(root);
      return;
    }
    setupOverviewToolbar(root);
    setupAccountDeck(root);
    syncQuickActions();
  }

  function bindOverviewFilterMenu() {
    document.addEventListener('pointerdown', event => {
      document.querySelectorAll('.mobile-overview-toolbar').forEach(toolbar => {
        if (!toolbar.contains(event.target)) closeMobilePanels(toolbar);
      });
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const toolbar = activeMobileToolbar();
      if (!toolbar) return;
      const open = toolbar.querySelector('.mobile-control-popover:not([hidden])');
      if (open) {
        closeMobilePanels(toolbar);
        toolbar.querySelector('[data-mobile-control="' + open.dataset.mobilePanel + '"]')?.focus();
      }
    });
  }

  function bindDrawerGestures() {
    let start = null;
    const isOverlayOpen = () => !!document.querySelector('.modal:not(.hidden), #command-overlay:not(.hidden)');
    document.addEventListener('touchstart', event => {
      if (!mobileNavQuery.matches || event.touches.length !== 1 || isOverlayOpen()) return;
      const touch = event.touches[0];
      const isOpen = document.body.classList.contains('mobile-nav-open');
      if (event.target.closest('.account-chips, .account-chip-list, .mobile-account-deck, .tx-list-wrap')) return;
      if (!isOpen && touch.clientX <= 22) { start = { x: touch.clientX, y: touch.clientY, mode: 'drawer-open' }; return; }
      if (isOpen && event.target.closest('.app-sidebar')) { start = { x: touch.clientX, y: touch.clientY, mode: 'drawer-close' }; return; }
      const blocked = event.target.closest('button, input, select, textarea, a, [role="button"], .month-picker, .cat-filter, .mobile-overview-toolbar, .chart-panel, .tx-row');
      if (!blocked && event.target.closest('.app-workspace')) start = { x: touch.clientX, y: touch.clientY, mode: 'page' };
    }, { passive: true });
    document.addEventListener('touchend', event => {
      if (!start || !mobileNavQuery.matches || isOverlayOpen()) { start = null; return; }
      const touch = event.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) > 72 && Math.abs(dx) > Math.abs(dy) * 1.25) {
        if (start.mode === 'drawer-open' && dx > 0) document.body.classList.add('mobile-nav-open');
        else if (start.mode === 'drawer-close' && dx < 0) document.body.classList.remove('mobile-nav-open');
        else if (start.mode === 'page' && window.BlackBook && window.BlackBook.cyclePage) window.BlackBook.cyclePage(dx < 0 ? 1 : -1);
      }
      start = null;
    }, { passive: true });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') document.body.classList.remove('mobile-nav-open');
    });
    mobileNavQuery.addEventListener('change', event => {
      document.body.classList.remove('mobile-nav-open');
      if (!event.matches) {
        try { document.body.classList.toggle('sb-collapsed', localStorage.getItem('bb-sidebar-collapsed') === '1'); } catch (err) {}
      }
    });
  }

  function bindMobileTransactionGestures() {
    const root = document.getElementById('page-overview');
    if (!root || root._mobileTransactionGesturesBound) return;
    root._mobileTransactionGesturesBound = true;
    let active = null;
    const reset = rows => {
      if (!rows) return;
      (Array.isArray(rows) ? rows : [rows]).forEach(row => {
        if (!row) return;
        row.style.transform = '';
        row.classList.remove('mobile-swipe-left', 'mobile-swipe-right');
      });
    };
    const actOnTransaction = (row, direction) => {
      const bb = window.BlackBook;
      const id = row && row.id && row.id.replace(/^tx-row-/, '');
      const tx = bb && bb.data && bb.data.transactions.find(item => item.id === id);
      if (!bb || !tx) return;
      const bulkSelected = bb._bulkSel && bb._bulkSel.size > 1 && bb._bulkSel.has(id);
      if (bulkSelected) {
        if (direction < 0) bb.bulkDelete();
        else bb.openBulkEdit();
        return;
      }
      if (direction < 0) bb.deleteTransaction(id);
      else if (tx.type === 'transfer') bb.openEditTransfer(id);
      else if (tx.cardId) bb.openEditCardTx(id);
      else bb.openEditTransaction(id);
    };
    root.addEventListener('pointerdown', event => {
      if (!mobileOverviewQuery.matches || event.button !== 0) return;
      const row = event.target.closest('.tx-row:not(.tx-split-part-row)');
      if (!row || !root.contains(row) || event.target.closest('button, a, input, select, textarea')) return;
      const bb = window.BlackBook;
      const id = row.id.replace(/^tx-row-/, '');
      const rows = bb && bb._bulkSel && bb._bulkSel.size > 1 && bb._bulkSel.has(id)
        ? Array.from(root.querySelectorAll('.tx-row:not(.tx-split-part-row)')).filter(item => bb._bulkSel.has(item.id.replace(/^tx-row-/, '')))
        : [row];
      active = { row, rows, x: event.clientX, y: event.clientY, dx: 0, horizontal: false };
    }, true);
    root.addEventListener('pointermove', event => {
      if (!active) return;
      const dx = event.clientX - active.x;
      const dy = event.clientY - active.y;
      if (!active.horizontal && Math.abs(dx) > 9 && Math.abs(dx) > Math.abs(dy) * 1.25) active.horizontal = true;
      if (!active.horizontal) return;
      active.dx = Math.max(-40, Math.min(72, dx));
      active.rows.forEach(row => {
        row.style.transform = 'translateX(' + active.dx + 'px)';
        row.classList.toggle('mobile-swipe-left', active.dx < 0);
        row.classList.toggle('mobile-swipe-right', active.dx > 0);
      });
      event.preventDefault();
    }, true);
    const endGesture = event => {
      if (!active) return;
      const gesture = active;
      active = null;
      const threshold = gesture.dx < 0 ? 40 : 72;
      if (gesture.horizontal) gesture.rows.forEach(row => { row._mobileSuppressClickUntil = Date.now() + 350; });
      if (gesture.horizontal && Math.abs(gesture.dx) >= threshold) {
        const direction = gesture.dx < 0 ? -1 : 1;
        const reveal = direction < 0 ? 40 : 72;
        gesture.rows.forEach(row => {
          row.style.transition = 'transform 140ms ease-out';
          row.style.transform = 'translateX(' + (direction * reveal) + 'px)';
        });
        setTimeout(() => actOnTransaction(gesture.row, direction), 90);
        setTimeout(() => { reset(gesture.rows); gesture.rows.forEach(row => { row.style.transition = ''; }); }, 210);
        if (event.cancelable) event.preventDefault();
      } else reset(gesture.rows);
    };
    root.addEventListener('pointerup', endGesture, true);
    root.addEventListener('pointercancel', event => { if (active) reset(active.rows); active = null; }, true);
    root.addEventListener('click', event => {
      const row = event.target.closest('.tx-row:not(.tx-split-part-row)');
      if (row && Date.now() < (row._mobileSuppressClickUntil || 0)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }

  function bindMobileBudgetGestures() {
    const root = document.getElementById('page-budget');
    if (!root || root._mobileBudgetGesturesBound) return;
    root._mobileBudgetGesturesBound = true;
    let active = null;
    const reset = card => {
      if (!card) return;
      const row = card.querySelector('.budget-headrow');
      if (row) { row.style.transform = ''; row.style.transition = ''; }
      card.classList.remove('mobile-swipe-left');
    };
    root.addEventListener('pointerdown', event => {
      if (!mobileOverviewQuery.matches || (event.button != null && event.button !== 0)) return;
      const row = event.target.closest('.budget-headrow');
      const card = row && row.closest('.budget-card');
      if (!row || !card || !root.contains(card)) return;
      active = { row, card, x:event.clientX, y:event.clientY, dx:0, horizontal:false, pointerId:event.pointerId };
      try { row.setPointerCapture(event.pointerId); } catch (_) {}
    }, true);
    root.addEventListener('pointermove', event => {
      if (!active || event.pointerId !== active.pointerId) return;
      const dx = event.clientX - active.x;
      const dy = event.clientY - active.y;
      if (!active.horizontal && Math.abs(dx) > 9 && Math.abs(dx) > Math.abs(dy) * 1.25) active.horizontal = true;
      if (!active.horizontal) return;
      active.dx = Math.max(-72, Math.min(0, dx));
      active.row.style.transform = 'translateX(' + active.dx + 'px)';
      active.card.classList.toggle('mobile-swipe-left', active.dx < 0);
      if (event.cancelable) event.preventDefault();
    }, true);
    const endGesture = event => {
      if (!active || event.pointerId !== active.pointerId) return;
      const gesture = active;
      active = null;
      if (gesture.horizontal) gesture.card._mobileBudgetSuppressClickUntil = Date.now() + 350;
      if (gesture.horizontal && gesture.dx <= -54) {
        gesture.row.style.transition = 'transform 180ms ease-in-out';
        gesture.row.style.transform = 'translateX(-72px)';
        setTimeout(() => {
          const bb = window.BlackBook;
          const id = gesture.card.dataset.budgetCategoryId;
          if (!bb || !id) return;
          if (gesture.card.dataset.budgetPlanActive === 'true') bb.openBudgetAllocationModal(id);
          else bb.openBudgetModal(id);
        }, 130);
        setTimeout(() => reset(gesture.card), 280);
        if (event.cancelable) event.preventDefault();
      } else reset(gesture.card);
    };
    root.addEventListener('pointerup', endGesture, true);
    root.addEventListener('pointercancel', event => {
      if (active && event.pointerId === active.pointerId) reset(active.card);
      active = null;
    }, true);
    root.addEventListener('click', event => {
      const card = event.target.closest('.budget-card');
      if (card && Date.now() < (card._mobileBudgetSuppressClickUntil || 0)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }

  function bindMobileBillGestures() {
    const root = document.getElementById('page-bills');
    if (!root || root._mobileBillGesturesBound) return;
    root._mobileBillGesturesBound = true;
    let active = null;
    const reset = entry => {
      if (!entry) return;
      const row = entry.querySelector('.mobile-bill-row');
      if (row) { row.style.transform = ''; row.style.transition = ''; }
      entry.classList.remove('mobile-swipe-left', 'mobile-swipe-right');
    };
    root.addEventListener('pointerdown', event => {
      if (!mobileOverviewQuery.matches || (event.button != null && event.button !== 0)) return;
      const row = event.target.closest('.mobile-bill-row');
      const entry = row && row.closest('.mobile-bill-entry');
      if (!row || !entry || !root.contains(entry) || event.target.closest('.mobile-bill-history, .mobile-bill-month, a, input, select, textarea')) return;
      active = { row, entry, x:event.clientX, y:event.clientY, dx:0, horizontal:false, pointerId:event.pointerId };
      try { row.setPointerCapture(event.pointerId); } catch (error) {}
    }, true);
    root.addEventListener('pointermove', event => {
      if (!active || event.pointerId !== active.pointerId) return;
      const dx = event.clientX - active.x;
      const dy = event.clientY - active.y;
      if (!active.horizontal && Math.abs(dx) > 9 && Math.abs(dx) > Math.abs(dy) * 1.25) active.horizontal = true;
      if (!active.horizontal) return;
      active.dx = Math.max(-72, Math.min(72, dx));
      active.row.style.transform = 'translateX(' + active.dx + 'px)';
      active.entry.classList.toggle('mobile-swipe-left', active.dx < 0);
      active.entry.classList.toggle('mobile-swipe-right', active.dx > 0);
      if (event.cancelable) event.preventDefault();
    }, true);
    const endGesture = event => {
      if (!active || event.pointerId !== active.pointerId) return;
      const gesture = active;
      active = null;
      if (gesture.horizontal) gesture.row._mobileBillSuppressClickUntil = Date.now() + 350;
      if (gesture.horizontal && Math.abs(gesture.dx) >= 54) {
        const direction = gesture.dx < 0 ? -1 : 1;
        gesture.row.style.transition = 'transform 180ms ease-in-out';
        gesture.row.style.transform = 'translateX(' + (direction * 72) + 'px)';
        setTimeout(() => {
          const bb = window.BlackBook;
          const billId = gesture.entry.dataset.billId;
          if (!bb || !billId) return;
          if (direction > 0) bb.openEditBill(billId);
          else bb.openBillPayModal(billId, gesture.row.dataset.payMonth);
        }, 130);
        setTimeout(() => reset(gesture.entry), 280);
        if (event.cancelable) event.preventDefault();
      } else reset(gesture.entry);
    };
    root.addEventListener('pointerup', endGesture, true);
    root.addEventListener('pointercancel', event => {
      if (active && event.pointerId === active.pointerId) reset(active.entry);
      active = null;
    }, true);
    root.addEventListener('click', event => {
      const row = event.target.closest('.mobile-bill-row');
      if (row && Date.now() < (row._mobileBillSuppressClickUntil || 0)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }


  function bindMobileCardGestures() {
    const root = document.getElementById('page-cards');
    if (!root || root._mobileCardGesturesBound) return;
    root._mobileCardGesturesBound = true;
    let active = null;
    const reset = card => {
      if (!card) return;
      card.style.transform = ''; card.style.transition = '';
      card.classList.remove('mobile-swipe-left', 'mobile-swipe-right');
    };
    root.addEventListener('pointerdown', event => {
      if (!mobileOverviewQuery.matches || (event.button != null && event.button !== 0)) return;
      const card = event.target.closest('.plan-card');
      if (!card || !root.contains(card) || event.target.closest('button,a,summary,input,select,textarea,.item-details')) return;
      active = { card, x:event.clientX, y:event.clientY, dx:0, horizontal:false, pointerId:event.pointerId };
      try { card.setPointerCapture(event.pointerId); } catch (_) {}
    }, true);
    root.addEventListener('pointermove', event => {
      if (!active || event.pointerId !== active.pointerId) return;
      const dx=event.clientX-active.x, dy=event.clientY-active.y;
      if (!active.horizontal && Math.abs(dx)>9 && Math.abs(dx)>Math.abs(dy)*1.25) active.horizontal=true;
      if (!active.horizontal) return;
      active.dx=Math.max(-72,Math.min(72,dx));
      active.card.style.transform='translateX('+active.dx+'px)';
      active.card.classList.toggle('mobile-swipe-left',active.dx<0);
      active.card.classList.toggle('mobile-swipe-right',active.dx>0);
      if (event.cancelable) event.preventDefault();
    }, true);
    const end = event => {
      if (!active || event.pointerId!==active.pointerId) return;
      const g=active; active=null;
      if (g.horizontal) g.card._mobileCardSuppressClickUntil=Date.now()+350;
      if (g.horizontal && Math.abs(g.dx)>=54) {
        const direction=g.dx<0?-1:1;
        g.card.style.transition='transform 180ms ease-in-out';
        g.card.style.transform='translateX('+(direction*72)+'px)';
        setTimeout(() => {
          const bb=window.BlackBook;
          if (direction<0) bb?.deleteInstallment(g.card.dataset.mobilePlanId);
          else if (g.card.dataset.mobileTxId) bb?.openEditCardTx(g.card.dataset.mobileTxId);
        },130);
        setTimeout(()=>reset(g.card),280);
        if (event.cancelable) event.preventDefault();
      } else reset(g.card);
    };
    root.addEventListener('pointerup',end,true);
    root.addEventListener('pointercancel',event=>{if(active&&event.pointerId===active.pointerId)reset(active.card);active=null;},true);
    root.addEventListener('click',event=>{
      const card=event.target.closest('.plan-card');
      if(!card)return;
      if(Date.now()<(card._mobileCardSuppressClickUntil||0)){event.preventDefault();event.stopImmediatePropagation();return;}
      if(!mobileOverviewQuery.matches||event.target.closest('button,a,summary,input,select,textarea,.item-details'))return;
      const details=card.querySelector('.item-details');
      if(details)details.open=!details.open;
    },true);
  }

  function bindMobileSavingsGestures() {
    const root=document.getElementById('page-savings');
    if(!root||root._mobileSavingsGesturesBound)return;
    root._mobileSavingsGesturesBound=true;
    let active=null;
    const reset=(card,animate=true)=>{
      if(!card)return;
      const content=card.querySelector('.wishlist-card-content')||card;
      const rails=Array.from(card.querySelectorAll('.wishlist-swipe-actions'));
      content.style.transition=animate?'transform 180ms ease-out':'';
      content.style.transform='';
      rails.forEach(rail=>{rail.style.transition=animate?'transform 180ms ease-out':'';rail.style.transform='';});
      card.classList.remove('mobile-swipe-left','mobile-swipe-right','mobile-swipe-left-delete');
      if(animate)setTimeout(()=>{
        if(!card.isConnected)return;
        content.style.transition='';
        rails.forEach(rail=>{rail.style.transition='';});
      },200);
    };
    root.addEventListener('pointerdown',event=>{
      if(!mobileOverviewQuery.matches||(event.button!=null&&event.button!==0))return;
      const card=event.target.closest('.savings-card[data-mobile-swipe-kind]');
      if(!card||!root.contains(card)||event.target.closest('button,a,summary,input,select,textarea,.item-details'))return;
      const content=card.querySelector('.wishlist-card-content')||card;
      const rails=Array.from(card.querySelectorAll('.wishlist-swipe-actions'));
      active={card,content,rails,kind:card.dataset.mobileSwipeKind,x:event.clientX,y:event.clientY,dx:0,horizontal:false,pointerId:event.pointerId};
      try{content.setPointerCapture(event.pointerId);}catch(_){}
    },true);
    root.addEventListener('pointermove',event=>{
      if(!active||event.pointerId!==active.pointerId)return;
      const dx=event.clientX-active.x,dy=event.clientY-active.y;
      if(!active.horizontal&&Math.abs(dx)>9&&Math.abs(dx)>Math.abs(dy)*1.25){
        active.horizontal=true;
        active.content.style.transition='none';
        active.rails.forEach(rail=>{rail.style.transition='none';});
      }
      if(!active.horizontal)return;
      active.dx=Math.max(active.kind==='wishlist'?-144:-72,Math.min(72,dx));
      active.content.style.transform='translateX('+active.dx+'px)';
      if(active.kind==='wishlist')active.rails.forEach(rail=>{rail.style.transform='translateX('+active.dx+'px)';});
      active.card.classList.toggle('mobile-swipe-left',active.dx<0);
      active.card.classList.toggle('mobile-swipe-right',active.dx>0);
      active.card.classList.toggle('mobile-swipe-left-delete',active.kind==='wishlist'&&active.dx<=-136);
      if(event.cancelable)event.preventDefault();
    },true);
    const end=event=>{
      if(!active||event.pointerId!==active.pointerId)return;
      const g=active;active=null;
      if(g.horizontal)g.card._mobileSavingsSuppressClickUntil=Date.now()+350;
      const wishlistAction=g.kind==='wishlist'&&g.dx>=54?'edit':g.kind==='wishlist'&&g.dx<=-136?'delete':g.kind==='wishlist'&&g.dx<=-64?'bought':'';
      if(g.horizontal&&(g.kind==='wishlist'?!!wishlistAction:Math.abs(g.dx)>=54)){
        const direction=g.dx<0?-1:1;
        const reveal=g.kind==='wishlist'?(wishlistAction==='delete'?144:wishlistAction==='bought'?78:72):72;
        g.content.style.transition='transform 180ms ease-in-out';
        g.content.style.transform='translateX('+(direction*reveal)+'px)';
        if(g.kind==='wishlist')g.rails.forEach(rail=>{rail.style.transition='transform 180ms ease-in-out';rail.style.transform='translateX('+(direction*reveal)+'px)';});
        setTimeout(()=>{
          const bb=window.BlackBook,kind=g.card.dataset.mobileSwipeKind,id=g.card.dataset.mobileSwipeId;
          if(!bb||!id)return;
          if(kind==='wishlist'){if(wishlistAction==='delete')bb.deleteWishlistItem(id);else if(wishlistAction==='bought')bb.buyWishlistItem(id);else bb.openWishlistItem(id);}
          else {if(direction<0)bb.deleteSavingsGoal(id);else bb.openEditSavingsGoal(id);}
        },130);
        setTimeout(()=>reset(g.card),300);
        if(event.cancelable)event.preventDefault();
      }else reset(g.card);
    };
    root.addEventListener('pointerup',end,true);
    root.addEventListener('pointercancel',event=>{if(active&&event.pointerId===active.pointerId)reset(active.card);active=null;},true);
    root.addEventListener('click',event=>{
      const card=event.target.closest('.savings-card[data-mobile-swipe-kind]');
      if(card&&Date.now()<(card._mobileSavingsSuppressClickUntil||0)){event.preventDefault();event.stopImmediatePropagation();}
    },true);
  }

  document.addEventListener('DOMContentLoaded', () => {
    createQuickActions();
    createDrawerScrim();
    bindBillsFilterMenu();
    setupMobileCommandPalette();
    bindOverviewFilterMenu();
    bindDrawerGestures();
    bindMobileTransactionGestures();
    bindMobileBillGestures();
    bindMobileBudgetGestures();
    bindMobileCardGestures();
    bindMobileSavingsGestures();
    const budget = document.getElementById('page-budget');
    if (budget) {
      const observer = new MutationObserver(() => setupBudgetToolbar(budget));
      observer.observe(budget, { childList:true, subtree:true });
      setupBudgetToolbar(budget);
    }
    const overview = document.getElementById('page-overview');
    if (overview) {
      const observer = new MutationObserver(() => syncOverviewControls());
      observer.observe(overview, { childList: true, subtree: true });
      syncOverviewControls();
    }
    const workspace = document.querySelector('.app-workspace') || document.body;
    const pageObserver = new MutationObserver(() => syncQuickActions());
    pageObserver.observe(workspace, { childList: true, subtree: true });
    let budgetMobileMode = mobileOverviewQuery.matches;
    window.addEventListener('resize', () => {
      syncOverviewControls();
      syncQuickActions();
      const nextBudgetMobileMode = mobileOverviewQuery.matches;
      if (nextBudgetMobileMode !== budgetMobileMode) {
        budgetMobileMode = nextBudgetMobileMode;
        if (window.BlackBook?.currentPage === 'budget') window.BlackBook.renderPage('budget');
      }
    }, { passive: true });
    mobileOverviewQuery.addEventListener('change', syncOverviewControls);
    mobileNavQuery.addEventListener('change', syncQuickActions);
  }, { once: true });
})();



