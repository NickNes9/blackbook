import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = { BlackBook: {} };
await import('../public/js/transaction-tools.js');
await import('../public/js/undo-history.js');
const { matches, rewrite } = window.TransactionTools;

test('literal replacement preserves context, ignores case, and replaces all matches', () => {
  assert.equal(rewrite({note:'Birthday CAKE and cake'},'cake','banana cake','replace',{}),'Birthday banana cake and banana cake');
  assert.equal(rewrite({note:'Item (cake) cost $5'},'(cake)','$10','replace',{}),'Item $10 cost $5');
});
test('templates expand once without interpreting original description tokens', () => {
  assert.equal(rewrite({note:'#year cake'},'cake','#description · #month · #person','rewrite',{description:'#year cake',month:'February',person:'Sample Person'}),'#year cake · February · Sample Person');
});
test('filters combine account, date, type, category, and person across years', () => {
  const tx = {note:'Birthday cake',type:'expense',accountId:'cash',categoryId:'shop',date:'2024-02-15',personIds:['person-a']};
  assert.equal(matches(tx,{find:'CAKE',account:'cash',category:'shop',type:'expense',from:'2024-02-01',to:'2024-02-28',person:'person-a'}),true);
  assert.equal(matches(tx,{find:'cake',person:'other'}),false);
  assert.equal(matches(tx,{from:'2025-01-01'}),false);
  assert.equal(matches({type:'transfer',fromAccountId:'cash',toAccountId:'bank'}, {account:'bank'}),true);
});
test('description batch undo restores both descriptions without changing financial fields', () => {
  const history = new window.UndoHistory();
  const data = {transactions:[{id:'one',amount:-20,currency:'EUR',note:'cake'},{id:'two',amount:-30,currency:'EUR',note:'Birthday cake'}]};
  const before = history.snapshot(data);
  data.transactions.forEach(tx=>tx.note=rewrite(tx,'cake','banana cake','replace',{}));
  const delta = history.diff(before,history.snapshot(data));
  history.apply(data,delta,'undo');
  assert.deepEqual(data.transactions,before.transactions);
});
test('person deletion undo restores the person and associations together', () => {
  const history = new window.UndoHistory();
  const data = {people:[{id:'person-a',name:'Sample Person'}],transactions:[{id:'one',amount:-20,personIds:['person-a']}]};
  const before = history.snapshot(data);
  data.people=[]; data.transactions[0].personIds=[];
  const delta = history.diff(before,history.snapshot(data));
  history.apply(data,delta,'undo');
  assert.deepEqual(data.people,before.people);
  assert.deepEqual(data.transactions,before.transactions);
});
