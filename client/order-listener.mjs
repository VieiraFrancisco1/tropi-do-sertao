// Keep the indexed query fast; use the customer's single-field index while
// a composite index is missing or still building. Never broaden the UID filter.
export function listenOrders({ db, userId, owner, api, onOrders, onError }) {
  const orders = api.collection(db, 'orders');
  const take = owner ? 1000 : 200;
  let disposed = false, fallback = false, off = null, generation = 0;
  const date = value => typeof value?.toMillis === 'function' ? value.toMillis() : Number(value) || 0;
  const receive = snapshot => {
    if (disposed) return;
    const items = snapshot.docs.map(doc => doc.data());
    items.sort((a, b) => date(b.date) - date(a.date));
    onOrders(items.slice(0, take));
  };
  function attach(target) {
    const version = ++generation;
    const unsubscribe = api.onSnapshot(target, snapshot => { if (version === generation) receive(snapshot); }, error => {
      if (disposed || version !== generation) return;
      const code = String(error?.code || '').split('/').pop();
      if (!owner && !fallback && code === 'failed-precondition' && /index/i.test(error?.message || '')) {
        fallback = true;
        off?.(); off = null;
        // No limit before sorting: an unordered limit could discard new orders.
        attach(api.query(orders, api.where('customer.id', '==', userId)));
      } else onError(error);
    });
    if (!disposed && version === generation) off = unsubscribe;
    else unsubscribe();
  }
  attach(owner
    ? api.query(orders, api.orderBy('date', 'desc'), api.limit(take))
    : api.query(orders, api.where('customer.id', '==', userId), api.orderBy('date', 'desc'), api.limit(take)));
  return () => { disposed = true; generation++; off?.(); off = null; };
}
