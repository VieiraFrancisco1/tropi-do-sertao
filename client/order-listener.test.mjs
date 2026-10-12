import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listenOrders } from './order-listener.mjs';

function setup(owner = false) {
  const subscriptions = [], results = [], errors = [];
  const api = {
    collection: (db, name) => ({ name }),
    where: (...args) => ({ where: args }),
    orderBy: (...args) => ({ orderBy: args }),
    limit: count => ({ limit: count }),
    query: (collection, ...constraints) => ({ collection, constraints }),
    onSnapshot(target, next, error) {
      const subscription = { target, next, error, stopped: false };
      subscriptions.push(subscription);
      return () => { subscription.stopped = true; };
    }
  };
  const stop = listenOrders({ db: {}, userId: 'customer-a', owner, api, onOrders: x => results.push(x), onError: x => errors.push(x) });
  return { subscriptions, results, errors, stop };
}
const snapshot = items => ({ docs: items.map(item => ({ data: () => item })) });
test('missing composite index retains the UID filter and returns the newest 200 orders', () => {
  const s = setup();
  s.subscriptions[0].error({ code: 'failed-precondition', message: 'The query requires an index.' });
  assert.equal(s.subscriptions.length, 2);
  assert.equal(s.subscriptions[0].stopped, true);
  assert.deepEqual(s.subscriptions[1].target.constraints, [{ where: ['customer.id', '==', 'customer-a'] }]);
  s.subscriptions[1].next(snapshot(Array.from({ length: 210 }, (_, date) => ({ date, id: String(date) }))));
  assert.equal(s.results[0].length, 200);
  assert.equal(s.results[0][0].date, 209);
  assert.equal(s.results[0][199].date, 10);
  assert.equal(s.errors.length, 0);
  s.subscriptions[0].next(snapshot([{ date: 9999 }]));
  assert.equal(s.results.length, 1);
  s.stop();
  assert.equal(s.subscriptions[1].stopped, true);
  s.subscriptions[1].next(snapshot([{ date: 999 }]));
  assert.equal(s.results.length, 1);
});
test('permission errors and unrelated preconditions are reported without a fallback', () => {
  for (const error of [{ code: 'permission-denied', message: 'Denied' }, { code: 'failed-precondition', message: 'Other failure' }]) {
    const s = setup(); s.subscriptions[0].error(error);
    assert.equal(s.subscriptions.length, 1);
    assert.deepEqual(s.errors, [error]);
    s.stop();
  }
});
test('the owner query stays bounded and does not use a customer fallback', () => {
  const s = setup(true);
  assert.deepEqual(s.subscriptions[0].target.constraints, [{ orderBy: ['date', 'desc'] }, { limit: 1000 }]);
  s.subscriptions[0].error({ code: 'failed-precondition', message: 'Missing index' });
  assert.equal(s.subscriptions.length, 1);
  assert.equal(s.errors.length, 1);
  s.stop();
});
test('an error from an old session cannot start another listener', () => {
  const s = setup(); s.stop();
  s.subscriptions[0].error({ code: 'failed-precondition', message: 'Missing index' });
  assert.equal(s.subscriptions.length, 1);
  assert.equal(s.errors.length, 0);
});
