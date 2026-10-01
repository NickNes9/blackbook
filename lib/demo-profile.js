// Entirely fictional, standalone examples. Never copies an existing profile.
export function createDemoProfile(now = new Date()) {
  const year = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const monthsToShow = Math.min(currentMonth, 12);
  const monthKey = month => year + '-' + String(month).padStart(2, '0');
  const fullDate = (month, day) => monthKey(month) + '-' + String(day).padStart(2, '0');

  // A seeded generator keeps the demo varied but stable for the whole year.
  let seed = (Math.imul(year, 2654435761) ^ 0x9e3779b9) >>> 0;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const int = (min, max) => min + Math.floor(random() * (max - min + 1));
  const pick = values => values[Math.floor(random() * values.length)];
  const money = (min, max) => Math.round((min + random() * (max - min)) * 100) / 100;

  const categories = [
    ['paycheck', 'Paycheck', '#4ade80'], ['groceries', 'Groceries', '#86efac'], ['restaurant', 'Restaurant', '#fb923c'], ['drinks', 'Drinks', '#38bdf8'],
    ['transport', 'Transport', '#60a5fa'], ['home', 'Home', '#c084fc'], ['hobbies', 'Hobbies', '#f472b6'],
    ['bills', 'Bills', '#facc15'], ['health', 'Health', '#2dd4bf'], ['clothes', 'Clothes', '#a78bfa'],
    ['family', 'Family', '#fda4af'], ['invoice', 'Invoice', '#fa8c3c'], ['transfer', 'Transfer', '#71717a'],
    ['debt', 'Debt', '#eab308'], ['uncategorized', 'Uncategorized', '#94a3b8']
  ].map(([id, name, color]) => ({ id: 'demo-cat-' + id, name, color }));
  const category = id => 'demo-cat-' + id;
  const bank = 'demo-bank', cash = 'demo-cash', usd = 'demo-usd';
  const transaction = (id, month, day, amount, cat, note, extra = {}) => ({
    id: 'demo-tx-' + id, date: fullDate(month, day), amount,
    type: amount < 0 ? 'expense' : 'income', currency: 'EUR', accountId: bank,
    categoryId: category(cat), note, ...extra
  });
  const transactions = [];
  const add = tx => (transactions.push(tx), tx);

  const bills = [
    { id: 'demo-internet', name: 'Home Internet', amount: 35, currency: 'EUR', dueDay: 3, categoryId: category('bills'), payAccountId: bank, active: true, autopay: false, color: '#60a5fa' },
    { id: 'demo-electricity', name: 'Electricity', amount: 64, currency: 'EUR', dueDay: 13, categoryId: category('bills'), payAccountId: bank, active: true, autopay: true, color: '#facc15' },
    { id: 'demo-phone', name: 'Mobile Plan', amount: 18, currency: 'EUR', dueDay: 25, categoryId: category('bills'), payAccountId: bank, active: true, autopay: false, color: '#c084fc' },
    { id: 'demo-water', name: 'Water Service', amount: 29, currency: 'EUR', dueDay: 17, categoryId: category('bills'), payAccountId: bank, active: true, autopay: false, color: '#2dd4bf' },
    { id: 'demo-insurance', name: 'Home Insurance', amount: 46, currency: 'EUR', dueDay: 6, categoryId: category('bills'), payAccountId: bank, active: true, autopay: true, color: '#fb7185' },
    { id: 'demo-music', name: 'Music Plan', amount: 12, currency: 'EUR', dueDay: 22, categoryId: category('bills'), payAccountId: bank, active: true, autopay: false, color: '#f472b6' }
  ];
  const billPayments = [];
  for (let month = 1; month <= monthsToShow; month++) {
    for (const bill of bills) {
      const paid = random() < 0.76;
      const amount = bill.id === 'demo-electricity' ? money(52, 84)
        : bill.id === 'demo-water' ? money(21, 39) : bill.amount;
      const payment = { billId: bill.id, month: monthKey(month), paid, amount };
      if (paid) {
        const id = 'bil-' + bill.id + '-' + monthKey(month);
        payment.txId = id;
        add({ id, date: fullDate(month, bill.dueDay), type: 'expense', amount: -amount, currency: 'EUR', accountId: bank, categoryId: category('bills'), note: bill.name });
      }
      billPayments.push(payment);
    }
  }

  add(transaction('drinks-jessica-nick', 1, 15, -24, 'drinks', 'Jessica and Nick'));
  add(transaction('dinner-with-j', 2, 9, -56, 'restaurant', 'Dinner with J.'));
  add({ id: 'demo-fund-cash', date: fullDate(1, 1), type: 'transfer', amount: 1000, currency: 'EUR', amountIn: 1000, currencyIn: 'EUR', fromAccountId: bank, toAccountId: cash, categoryId: category('transfer'), note: 'Cash reserve transfer' });
  add({ id: 'demo-fund-usd', date: fullDate(1, 1), type: 'transfer', amount: 500, currency: 'EUR', amountIn: 600, currencyIn: 'USD', fromAccountId: bank, toAccountId: usd, categoryId: category('transfer'), note: 'USD reserve transfer' });

  // Three savings goals deliberately show complete, roughly halfway, and early progress.
  const savingsGoals = [
    { id: 'demo-emergency', name: 'Emergency Cushion', targetAmount: 800, currency: 'EUR', events: [[1, 12, 200, 'First deposit'], [2, 11, 200, 'Monthly deposit'], [3, 12, 200, 'Monthly deposit'], [4, 10, 200, 'Goal completed']] },
    { id: 'demo-holiday', name: 'Holiday Fund', targetAmount: 1400, currency: 'EUR', events: [[2, 19, 180, 'Trip savings'], [5, 20, 240, 'Spring deposit'], [8, 18, 210, 'Summer deposit'], [10, 16, 70, 'Final top-up']] },
    { id: 'demo-laptop', name: 'New Laptop', targetAmount: 1800, currency: 'EUR', events: [[3, 22, 150, 'First deposit'], [7, 17, 190, 'Monthly deposit'], [10, 14, 110, 'Monthly deposit']] }
  ].map(goal => {
    goal.entries = goal.events.map(([month, day, amount, note], index) => {
      const id = goal.id + '-entry-' + (index + 1);
      const entry = { id, date: fullDate(month, day), amount, note };
      add(transaction('savings-' + id, month, day, amount, 'transfer', 'Savings: ' + goal.name + ' — ' + note, {
        type: 'transfer', amountIn: amount, currencyIn: 'EUR', accountId: null,
        fromAccountId: bank, toAccountId: bank, linkId: id
      }));
      return entry;
    });
    delete goal.events;
    return goal;
  });

  // Multiple debt records exercise unpaid, partial, and fully settled histories.
  const debts = [
    { id: 'demo-debt-alex', person: 'Alex', type: 'in', amount: 400, currency: 'EUR', date: fullDate(1, 5), categoryId: category('debt'), note: 'Shared trip costs', payments: [], amountPaid: 0 },
    { id: 'demo-debt-sam', person: 'Sam', type: 'out', amount: 360, currency: 'EUR', date: fullDate(2, 3), categoryId: category('debt'), note: 'Borrowed for a home repair', payments: [], amountPaid: 0 },
    { id: 'demo-debt-taylor', person: 'Taylor', type: 'out', amount: 250, currency: 'EUR', date: fullDate(6, 9), categoryId: category('debt'), note: 'Shared equipment purchase', payments: [], amountPaid: 0 },
    { id: 'demo-debt-morgan', person: 'Morgan', type: 'in', amount: 180, currency: 'EUR', date: fullDate(9, 4), categoryId: category('debt'), note: 'Recently lent for travel', payments: [], amountPaid: 0 }
  ];
  const debtEvents = [
    ['demo-debt-alex', 1, 18, 100], ['demo-debt-alex', 5, 15, 200],
    ['demo-debt-sam', 2, 18, 180], ['demo-debt-sam', 4, 18, 180],
    ['demo-debt-taylor', 8, 20, 125]
  ];
  for (const [debtId, month, day, amount] of debtEvents) {
    const debt = debts.find(item => item.id === debtId);
    const type = debt.type === 'in' ? 'income' : 'expense';
    const id = 'debt-payment-' + debtId.replace('demo-debt-', '') + '-' + month;
    const tx = add(transaction(id, month, day, type === 'income' ? amount : -amount, 'debt', 'Debt payment: ' + debt.person, { type, debtId }));
    debt.payments.push({ txId: tx.id, amount, date: tx.date, type });
    debt.amountPaid += amount;
  }

  // Invoice examples include fully paid, partly paid, and unpaid invoices.
  const invoices = [
    { id: 'demo-invoice-paid', number: '014/' + year, party: 'Sample Studio', dir: 'out', currency: 'EUR', date: fullDate(4, 3), paidDate: fullDate(4, 14), categoryId: category('invoice'), lines: [{ desc: 'Brand illustration', qty: 3, price: 150 }], amountPaid: 450, payments: [] },
    { id: 'demo-invoice-partial', number: '027/' + year, party: 'Brightside Design', dir: 'out', currency: 'EUR', date: fullDate(7, 8), paidDate: '', categoryId: category('invoice'), lines: [{ desc: 'Website design', qty: 4, price: 175 }], amountPaid: 350, payments: [] },
    { id: 'demo-invoice-unpaid', number: '039/' + year, party: 'Northwind Community', dir: 'out', currency: 'EUR', date: fullDate(10, 5), paidDate: '', categoryId: category('invoice'), lines: [{ desc: 'Event poster set', qty: 4, price: 120 }], amountPaid: 0, payments: [] }
  ];
  const invoiceEvents = [
    ['demo-invoice-paid', 4, 14, 450], ['demo-invoice-partial', 8, 6, 350]
  ];
  for (const [invoiceId, month, day, amount] of invoiceEvents) {
    const invoice = invoices.find(item => item.id === invoiceId);
    const id = 'invoice-payment-' + invoiceId.replace('demo-invoice-', '');
    const tx = add(transaction(id, month, day, amount, 'invoice', 'Invoice ' + invoice.number + ' — ' + invoice.party));
    invoice.payments.push({ txId: tx.id, date: tx.date, amount, accountId: bank, categoryId: category('invoice'), seq: 1 });
  }

  const creditCards = [
    { id: 'demo-card', name: 'Everyday Credit', shortName: 'CREDIT', currency: 'EUR', limit: 2400, ratePct: 0, dueDay: 18, color: '#fb923c', payAccountId: bank },
    { id: 'demo-travel-card', name: 'Travel Card', shortName: 'TRAVEL', currency: 'EUR', limit: 1600, ratePct: 2, dueDay: 24, color: '#a78bfa', payAccountId: bank }
  ];
  const installments = [];
  const addPlan = ({ id, cardId, name, total, months, startMonth, categoryId, paid }) => {
    const plan = { id, cardId, name, total, months, startMonth: monthKey(startMonth), ratePct: 0, dueDay: 18, paid: [] };
    installments.push(plan);
    const purchase = add(transaction('purchase-' + id, startMonth, 5, -total, categoryId, name, {
      accountId: null, cardId, installId: id
    }));
    for (const [seq, amount] of paid) {
      const month = startMonth + seq - 1;
      add(transaction('installment-' + id + '-' + seq, month, 18, -amount, 'transfer', 'Installment ' + name + ' ' + seq + '/' + months, {
        pairId: 'inst-' + id + '-s' + seq
      }));
    }
    return purchase;
  };
  addPlan({ id: 'demo-plan-desk', cardId: 'demo-card', name: 'Desk chair', total: 360, months: 3, startMonth: 1, categoryId: 'home', paid: [[1, 120], [2, 120], [3, 120]] });
  addPlan({ id: 'demo-plan-tablet', cardId: 'demo-card', name: 'Drawing tablet', total: 800, months: 4, startMonth: 5, categoryId: 'hobbies', paid: [[1, 200], [2, 100]] });
  addPlan({ id: 'demo-plan-camera', cardId: 'demo-travel-card', name: 'Travel camera', total: 600, months: 3, startMonth: Math.min(currentMonth, 10), categoryId: 'hobbies', paid: [] });

  const featureCounts = Array(13).fill(0);
  for (const tx of transactions) featureCounts[Number(tx.date.slice(5, 7))]++;

  const notes = {
    groceries: ['Fresh produce at Green Market', 'Pantry staples from Maxi', 'Market basket at Lidl', 'Fruit and vegetables', 'Weekly shop at Corner Market', 'Household groceries at Fresh Basket', 'Bakery and pantry top-up', 'Weekend groceries at City Market', 'Produce from Riverside Market', 'Kitchen staples at Northside Grocer'],
    transport: ['Monthly transit pass', 'Train tickets for a day trip', 'Fuel for the family car', 'Bike service and parts', 'City bus fare', 'Parking near the park', 'Regional train fare', 'Tire repair', 'Taxi home after an event'],
    restaurant: ['Lunch at Riverside Kitchen', 'Dinner at Maple Table', 'Noodle House meal', 'Lunch with friends at Green Plate', 'Sunday brunch at Orchard Kitchen', 'Dinner at Harbor Grill', 'Takeaway from Little Oven', 'Family meal at Garden Kitchen', 'Pasta night at Piazza'],
    drinks: ['Refreshments at the waterfront', 'Juice and snacks after the market', 'Tea and lemonade at Garden House', 'Smoothies after a walk', 'Drinks at the music venue', 'Sparkling water for a picnic'],
    home: ['New kitchen towels', 'Hardware for a shelf repair', 'Fresh bedsheets', 'Desk lamp replacement', 'Storage boxes for the hallway', 'Plant pots for the balcony', 'Small home repair supplies'],
    hobbies: ['Board game expansion', 'Digital puzzle pack', 'Museum entry', 'Art supplies from Paper House', 'Concert ticket', 'Weekend pottery class', 'Trail map and guidebook', 'Photography print'],
    health: ['Pharmacy essentials', 'First-aid supplies', 'Vitamins and supplements', 'Dental check-up co-pay', 'Sports recovery supplies', 'Prescription refill'],
    clothes: ['Everyday socks and basics', 'Winter gloves', 'Running shirt', 'Tailoring and repairs', 'Light rain jacket', 'Weekend shoes'],
    family: ['Birthday present', 'Family outing contribution', 'Flowers for a relative', 'Shared celebration meal', 'Book for a family member'],
    bills: ['Water service bill', 'Home heating charge', 'Streaming subscription', 'Household mobile top-up', 'Waste collection fee'],
    paycheck: ['Weekend event shift', 'Small freelance illustration', 'Tutoring session', 'Marketplace sale', 'Project completion bonus']
  };
  const expenseKinds = ['groceries', 'groceries', 'groceries', 'restaurant', 'restaurant', 'drinks', 'transport', 'transport', 'home', 'hobbies', 'health', 'clothes', 'family', 'bills'];
  const contextNotes = ['for the weekend', 'after work', 'while running errands', 'for a family visit', 'during a day trip', 'planned seasonal purchase', 'on the way home', 'for the apartment', 'local pickup', 'special occasion', 'one-time replacement', 'monthly top-up', 'near the station', 'for a rainy day', 'before the trip', 'for a small celebration'];
  const regularTransactions = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let month = 1; month <= monthsToShow; month++) {
    const desiredTotal = int(22, 28);
    const needed = Math.max(0, desiredTotal - featureCounts[month]);
    const days = new Set();
    const nextDay = () => {
      let day;
      do { day = int(1, 28); } while (days.has(day));
      days.add(day);
      return day;
    };
    const addRegular = (cat, amount, note, extra = {}) => {
      const day = nextDay();
      const tx = transaction('daily-' + year + '-' + month + '-' + (regularTransactions.length + 1), month, day, amount, cat, note, extra);
      regularTransactions.push(tx);
    };
    if (needed > 0) addRegular('paycheck', money(2450, 3400), 'Monthly salary deposit');
    if (needed > 1) addRegular('home', -money(760, 960), 'Apartment rent');
    for (let i = 2; i < needed; i++) {
      let cat = pick(expenseKinds);
      let amount = -money(6, 145);
      let extra = {};
      if (i % 9 === 0) {
        cat = 'paycheck';
        amount = money(45, 420);
      } else if (i % 11 === 0) {
        extra = { accountId: cash };
      } else if (i % 13 === 0) {
        extra = { accountId: usd, currency: 'USD' };
        amount = -money(5, 65);
      }
      const note = pick(notes[cat] || notes.groceries) + ' — ' + pick(contextNotes) + ' (' + monthNames[month - 1] + ')';
      addRegular(cat, amount, note, extra);
    }
  }
  transactions.push(...regularTransactions);

  const budgets = [
    { categoryId: category('groceries'), amount: 420 }, { categoryId: category('restaurant'), amount: 190 },
    { categoryId: category('transport'), amount: 160 }, { categoryId: category('hobbies'), amount: 220 },
    { categoryId: category('home'), amount: 300 }, { categoryId: category('drinks'), amount: 95 }
  ];
  const budgetAllocations = Array.from({ length: monthsToShow }, (_, index) => {
    const month = index + 1;
    const percents = {};
    let remaining = int(72, 88);
    const ids = ['home', 'groceries', 'bills', 'hobbies', 'transport', 'restaurant', 'health', 'family'];
    while (remaining >= 8 && ids.length) {
      const id = ids.splice(Math.floor(random() * ids.length), 1)[0];
      const share = Math.min(remaining, int(8, 25));
      percents[category(id)] = share;
      remaining -= share;
    }
    return { month: monthKey(month), amount: money(2600, 3400), accountId: bank, currency: 'EUR', percents };
  });

  return {
    accounts: [
      { id: bank, name: 'Everyday Bank', shortName: 'BANK', type: 'bank', currency: 'EUR', color: '#60a5fa', openingBalance: 500 },
      { id: cash, name: 'Cash Wallet', shortName: 'CASH', currency: 'EUR', color: '#4ade80', openingBalance: 1000 },
      { id: usd, name: 'Dollar Account', shortName: 'USD', type: 'bank', currency: 'USD', color: '#c084fc', openingBalance: 600 }
    ],
    categories, transactions, bills, billPayments, budgets, budgetAllocations, creditCards, installments, savingsGoals, debts, invoices,
    invoiceTemplates: [{ id: 'demo-template', name: 'Design services', party: 'Sample Studio', dir: 'out', currency: 'EUR', categoryId: category('invoice'), lines: [{ desc: 'Design services', qty: 1, price: 150 }] }],
    recurringTemplates: [{ id: 'demo-recurring', name: 'Salary', type: 'income', amount: 2800, currency: 'EUR', accountId: bank, categoryId: category('paycheck'), interval: 'monthly', startDate: fullDate(1, 1) }],
    importRules: [{ id: 'demo-rule', match: 'supermarket', categoryId: category('groceries') }],
    settings: { baseCurrency: 'EUR', enabledCurrencies: ['EUR', 'USD'], rates: { EUR: { rate: 1, source: 'manual' }, USD: { rate: 0.9, source: 'manual' } }, defaultAccountId: bank, defaultCategoryId: category('groceries'), dateFormat: 'DD/MM/YYYY', dateSeparator: '/', hideBillsGraph: false },
    demo: { fictional: true, revision: 10 }
  };
}
