'use strict';
const { R, fail, digest, requireUser, key, orderId, text, sanitizeCheckout, loyalty } = require('./domain.cjs');
const OPT_IN_TEXT = 'Quero receber no WhatsApp atualizações da TropiSertão sobre o preparo e a entrega deste pedido. Posso parar respondendo SAIR.';
function createService({ db, clock = Date.now, whatsappEnabled = () => false }) {
  async function ensureLoyalty(uid) {
    const ref = db.doc('customers/' + uid), existing = await ref.get();
    if (!existing.exists || existing.data().loyalty?.version === 2) return;
    // Rebuild the old counters from completed orders, once per customer. A
    // request created in the old checkout is not proof of a completed sale.
    const snapshot = await db.collection('orders').where('customer.id', '==', uid).get();
    const own = snapshot.docs.map(doc => doc.data()).filter(order => !order.expired);
    const completed = own.filter(order => order.status === 'concluido');
    const counts = { version: 2,
      qualifying: completed.filter(order => !order.reward && order.total > 0).length,
      redeemed: completed.filter(order => order.reward || order.redeemsReward).length,
      reserved: own.filter(order => ['recebido', 'preparando', 'entrega'].includes(order.status) && (order.reward || order.redeemsReward)).length };
    const waiting = own.filter(order => order.status === 'recebido').sort((a, b) => b.date - a.date);
    const pending = waiting.find(order => !R.pendingExpired(order, clock())) || waiting[0];
    await db.runTransaction(async tx => {
      const current = await tx.get(ref);
      if (!current.exists || current.data().loyalty?.version === 2) return;
      tx.set(ref, { loyalty: counts, pendingOrderId: pending?.id || null, updatedAt: clock() }, { merge: true });
    });
  }
  async function expireOrder(id) {
    const ref = db.doc('orders/' + id), initial = await ref.get();
    if (!initial.exists || !R.pendingExpired(initial.data(), clock())) return false;
    await ensureLoyalty(initial.data().customer.id);
    return db.runTransaction(async tx => {
      const snapshot = await tx.get(ref), order = snapshot.data(), at = clock();
      if (!snapshot.exists || !R.pendingExpired(order, at)) return false;
      const customerRef = db.doc('customers/' + order.customer.id), customer = await tx.get(customerRef);
      const counts = loyalty(customer.data()?.loyalty);
      const update = { updatedAt: at, loyalty: { version: 2, qualifying: counts.qualifying, redeemed: counts.redeemed,
        reserved: Math.max(0, counts.reserved - (order.reward || order.redeemsReward ? 1 : 0)) } };
      if (customer.data()?.pendingOrderId === id) update.pendingOrderId = null;
      tx.set(customerRef, update, { merge: true });
      tx.set(ref, { ...order, status: 'cancelado', expired: true, updatedAt: at,
        statusHistory: [...(order.statusHistory || []), { status: 'cancelado', at, actor: 'system', reason: 'Sem confirmação da loja em 24 horas' }] });
      return true;
    });
  }
  async function getLoyalty(user) {
    requireUser(user);
    await ensureLoyalty(user.uid);
    const ref = db.doc('customers/' + user.uid);
    const customer = await ref.get(), pendingId = customer.data()?.pendingOrderId;
    if (pendingId) await expireOrder(pendingId);
    return { loyalty: loyalty((pendingId ? await ref.get() : customer).data()?.loyalty) };
  }
  async function expirePending() {
    const snapshot = await db.collection('orders').where('status', '==', 'recebido').limit(40).get();
    let expired = 0;
    for (const doc of snapshot.docs) if (R.pendingExpired(doc.data(), clock()) && await expireOrder(doc.id)) expired++;
    return { expired };
  }
  async function createOrder(user, input) {
    requireUser(user);
    const data = sanitizeCheckout(input), at = clock();
    const request = db.doc('orderRequests/' + digest(user.uid + ':' + data.requestKey));
    const customerRef = db.doc('customers/' + user.uid), counter = db.doc('controls/orderCounter');
    const rateRef = db.doc('orderRateLimits/' + user.uid), recipient = db.doc('whatsappRecipients/' + digest(data.phone));
    const ipRateRef = user.ipHash ? db.doc('orderIpRateLimits/' + user.ipHash) : null;
    await getLoyalty(user);
    return db.runTransaction(async tx => {
      const prior = await tx.get(request);
      if (prior.exists) {
        const [currentOrder, customer] = await Promise.all([tx.get(db.doc('orders/' + prior.data().order.id)), tx.get(customerRef)]);
        return { order: currentOrder.data() || prior.data().order, loyalty: loyalty(customer.data()?.loyalty), duplicate: true };
      }
      const [c, n, r, ipR] = await Promise.all([tx.get(customerRef), tx.get(counter), tx.get(rateRef), ipRateRef ? tx.get(ipRateRef) : Promise.resolve(null)]);
      const counts = c.data()?.loyalty || {}, available = loyalty(counts);
      if (c.data()?.pendingOrderId) {
        const waiting = await tx.get(db.doc('orders/' + c.data().pendingOrderId));
        if (waiting.exists && waiting.data().status === 'recebido') fail('failed-precondition', 'Você já tem um pedido aguardando a loja. Confira Meus pedidos.');
      }
      const checkoutError = R.validateCheckout(data.lines, available);
      if (checkoutError) fail('failed-precondition', checkoutError);
      const rate = r.data(), inWindow = rate && at - rate.startedAt < 600000;
      if (inWindow && rate.count >= 5) fail('resource-exhausted', 'Aguarde alguns minutos antes de criar outro pedido.');
      const ipRate=ipR?.data(), ipInWindow=ipRate && at-ipRate.startedAt<600000;
      if (ipInWindow && ipRate.count >= 12) fail('resource-exhausted','Muitos pedidos desta rede. Aguarde alguns minutos.');
      const sequence = (n.data()?.value || 0) + 1;
      const id = 'TROPI-' + String(sequence).padStart(3, '0');
      const order = {
        id, date: at, updatedAt: at, status: 'recebido', expiresAt: at + R.PENDING_REQUEST_TTL, loyaltyApplied: false, total: data.total,
        customer: { id: user.uid, name: data.name, phone: data.phone },
        payment: data.payment, cardType: data.cardType, delivery: data.delivery, neighborhood: data.neighborhood, deliveryFee: data.deliveryFee, payableTotal: data.payableTotal, address: data.address, reference: data.reference,
        change: data.change, lines: data.lines, reward: data.reward, redeemsReward: data.redeemsReward,
        whatsappConsent: { granted: data.whatsappOptIn, at, version: 'tropi-status-v1', text: OPT_IN_TEXT, source: 'checkout' },
        notifications: {}, statusHistory: [{ status: 'recebido', at, actor: user.uid }]
      };
      const nextCounts = { version: 2, qualifying: available.qualifying, redeemed: available.redeemed, reserved: available.reserved + (data.redeemsReward ? 1 : 0) };
      tx.create(db.doc('orders/' + id), order);
      tx.set(customerRef, { id: user.uid, name: data.name, phone: data.phone, loyalty: nextCounts, pendingOrderId: id, updatedAt: at }, { merge: true });
      tx.set(counter, { value: sequence });
      tx.set(rateRef, { startedAt: inWindow ? rate.startedAt : at, count: inWindow ? rate.count + 1 : 1 });
      if (ipRateRef) tx.set(ipRateRef,{startedAt:ipInWindow?ipRate.startedAt:at,count:ipInWindow?ipRate.count+1:1});
      if (data.whatsappOptIn) tx.set(recipient, { phone: data.phone, optedOut: false, consentAt: at, source: 'checkout', consentVersion: 'tropi-status-v1' }, { merge: true });
      const result = { order, loyalty: loyalty(nextCounts) };
      tx.create(request, result);
      return result;
    });
  }
  async function updateStatus(user, input) {
    requireUser(user, true);
    const id = orderId(input?.id), status = input?.status, at = clock();
    const ref = db.doc('orders/' + id);
    const initial = await ref.get();
    if (!initial.exists) fail('not-found', 'Pedido não encontrado.');
    await ensureLoyalty(initial.data().customer.id);
    if (R.pendingExpired(initial.data(), at)) {
      await expireOrder(id);
      fail('failed-precondition', 'Este pedido expirou sem confirmação da loja.');
    }
    return db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) fail('not-found', 'Pedido não encontrado.');
      const old = snap.data();
      if (old.status === status) return { order: old, duplicate: true };
      if (input.expectedStatus !== old.status) fail('aborted', 'O pedido mudou em outro dispositivo. Atualize e tente novamente.');
      if (!R.canTransition(old, status)) fail('failed-precondition', 'Esta mudança de status não é permitida.');
      const control = await tx.get(db.doc('controls/cash'));
      const cashRef = control.data()?.activeId ? db.doc('cashSessions/' + control.data().activeId) : null;
      const cash = cashRef ? await tx.get(cashRef) : null;
      const customerRef = db.doc('customers/' + old.customer.id);
      const customer = await tx.get(customerRef), counts = loyalty(customer.data()?.loyalty);
      const customerUpdate = { updatedAt: at };
      if (customer.data()?.pendingOrderId === id) customerUpdate.pendingOrderId = null;
      const next = { ...old, status, updatedAt: at, statusHistory: [...(old.statusHistory || []), { status, at, actor: user.uid }] };
      if (status === 'concluido') {
        next.completedAt = at;
        next.loyaltyApplied = true;
        customerUpdate.loyalty = { version: 2, qualifying: counts.qualifying + (!old.reward && old.total > 0 ? 1 : 0),
          redeemed: counts.redeemed + (old.reward || old.redeemsReward ? 1 : 0),
          reserved: Math.max(0, counts.reserved - (old.reward || old.redeemsReward ? 1 : 0)) };
        if (cash?.exists && cash.data().status === 'open') {
          const booked = R.bookCashSale([cash.data()], next, at)[0];
          tx.set(cashRef, booked);
          next.cashSessionId = booked.id;
        }
      }
      if (status === 'cancelado') {
        customerUpdate.loyalty = { version: 2, qualifying: counts.qualifying, redeemed: counts.redeemed,
          reserved: Math.max(0, counts.reserved - (old.reward || old.redeemsReward ? 1 : 0)) };
      }
      if (['preparando', 'entrega'].includes(status)) {
        let state = 'disabled';
        if (whatsappEnabled()) {
          state = old.whatsappConsent?.granted ? 'pending' : 'no-consent';
          if (state === 'pending') {
            const jobId = id + '__' + status;
            tx.create(db.doc('messageJobs/' + jobId), {
              id: jobId, orderId: id, status, phone: old.customer.phone, customerName: old.customer.name,
              state: 'pending', attempts: 0, createdAt: at, updatedAt: at, nextAttemptAt: at
            });
          }
        }
        next.notifications = { ...(old.notifications || {}), [status]: { state, at } };
      }
      tx.set(customerRef, customerUpdate, { merge: true });
      tx.set(ref, next);
      return { order: next };
    });
  }
  async function cashAction(user, input) {
    requireUser(user, true);
    const at = clock(), action = input?.action, requestKey = key(input?.requestKey);
    const controlRef = db.doc('controls/cash');
    return db.runTransaction(async tx => {
      const control = await tx.get(controlRef), activeId = control.data()?.activeId;
      const sessionId = action === 'open' ? requestKey : input?.id;
      if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(sessionId)) fail('invalid-argument', 'Caixa inválido.');
      const ref = db.doc('cashSessions/' + sessionId), snap = await tx.get(ref);
      if (action === 'open') {
        if (snap.exists) return { session: snap.data(), duplicate: true };
        if (activeId) fail('failed-precondition', 'Já existe um caixa aberto.');
        const session = R.openCashSession([], { id: sessionId, at, openingCents: input.openingCents });
        if (!session) fail('invalid-argument', 'Valor inicial inválido.');
        session.openedBy = user.uid;
        tx.create(ref, session); tx.set(controlRef, { activeId: sessionId });
        return { session };
      }
      if (!snap.exists) fail('not-found', 'Caixa não encontrado.');
      const old = snap.data();
      if (action === 'close' && old.status === 'closed') return { session: old, duplicate: true };
      if (activeId !== sessionId || old.status !== 'open') fail('failed-precondition', 'O caixa está fechado.');
      if (action === 'movement') {
        if (old.entries.some(e => e.id === requestKey)) return { session: old, duplicate: true };
        if (old.entries.length >= 2000) fail('resource-exhausted', 'Feche este caixa antes de registrar novas movimentações.');
        const next = R.cashMovement(old, { id: requestKey, type: input.type, amountCents: input.amountCents, reason: text(input.reason, 120), at });
        if (!next) fail('invalid-argument', 'Revise o valor e a descrição da movimentação.');
        tx.set(ref, next); return { session: next };
      }
      if (action !== 'close') fail('invalid-argument', 'Ação de caixa inválida.');
      const next = R.closeCashSession(old, { countedCents: input.countedCents, at });
      if (!next) fail('invalid-argument', 'Informe o dinheiro contado em centavos.');
      next.closedBy = user.uid;
      tx.set(ref, next); tx.set(controlRef, { activeId: null });
      return { session: next };
    });
  }
  async function report(user, input) {
    requireUser(user, true);
    const bounds = R.periodBounds(input?.value, input?.period);
    if (!bounds) fail('invalid-argument', 'Período inválido.');
    const begin = Date.parse(bounds.start + 'T00:00:00-03:00');
    const end = Date.parse(bounds.end + 'T23:59:59.999-03:00');
    const snapshot = await db.collection('orders').where('date', '>=', begin).where('date', '<=', end).get();
    return R.orderReport(snapshot.docs.map(d => d.data()), input);
  }
  return { createOrder, updateStatus, cashAction, report, getLoyalty, expirePending };
}
module.exports = { createService, OPT_IN_TEXT };
