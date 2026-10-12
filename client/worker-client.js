import { listenOrders } from './order-listener.mjs';
import { phoneLoginAlias } from './phone-login.js';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, EmailAuthProvider, linkWithCredential, signOut, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, collection, doc, query, where, orderBy, limit, onSnapshot, connectFirestoreEmulator } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from 'firebase/app-check';

const config = window.TropiConfig;
const app = initializeApp(config.firebase);
const appCheck = !config.emulators ? initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(config.appCheckSiteKey), isTokenAutoRefreshEnabled: true }) : null;
const auth = getAuth(app), db = getFirestore(app);
if (config.emulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
let resolveReady, rejectReady, hooks = {}, listeners = [], started = false, sessionVersion = 0;
const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
// Initialization errors are also reported in UI; avoid an unhandled rejection.
ready.catch(() => {});
const stop = () => { listeners.forEach(fn => fn()); listeners = []; };
const call = async (name, data) => {
  await ready;
  const user = auth.currentUser;
  if (!user) throw new Error('Entre na sua conta para continuar.');
  const headers = {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + await user.getIdToken()};
  if (appCheck) headers['X-Firebase-AppCheck'] = (await getToken(appCheck)).token;
  const controller = new AbortController();
  const timeout = name === 'createOrder' ? setTimeout(() => controller.abort(), 30000) : null;
  let response;
  try {
    response = await fetch(config.workerApiUrl.replace(/\/$/, '') + '/api/' + name, {
      method: 'POST', headers, body: JSON.stringify(data), cache: 'no-store', signal: controller.signal
    });
  } catch {
    const error = new Error(controller.signal.aborted ? 'O pedido demorou a responder. Tente novamente.' : 'Confira sua conexão e tente novamente.');
    error.code = 'unavailable'; error.publicMessage = error.message;
    throw error;
  } finally { if (timeout !== null) clearTimeout(timeout); }
  let result;
  try { result = await response.json(); } catch { throw new Error('Servidor indisponível. Tente novamente.'); }
  if (!response.ok) { const message = typeof result?.error === 'string' ? result.error : 'Não foi possível concluir.'; const error = new Error(message); error.code = result?.code || 'unavailable'; error.publicMessage = message; throw error; }
  return result;
};
window.TropiCloud = {
  enabled: true, ready,
  start(callbacks) {
    if (started) return; started = true; hooks = callbacks;
    onAuthStateChanged(auth, async user => {
      const version = ++sessionVersion;
      stop(); hooks.onOrders([]); hooks.onCash([]); hooks.onProfile(null); hooks.onSession(null);
      if (!user) {
        try { await signInAnonymously(auth); } catch (e) { rejectReady(e); hooks.onError(e); }
        return;
      }
      try {
        const result = await user.getIdTokenResult();
        if (version !== sessionVersion) return;
        const owner = result.claims.tropiAdmin === true;
        hooks.onSession({ uid: user.uid, owner, anonymous: user.isAnonymous });
        const current = fn => value => { if (version === sessionVersion) fn(value); };
        listeners.push(listenOrders({ db, userId: user.uid, owner, api: { collection, query, where, orderBy, limit, onSnapshot }, onOrders: current(hooks.onOrders), onError: current(hooks.onError) }));
        listeners.push(onSnapshot(doc(db, 'customers', user.uid), current(snapshot => hooks.onProfile(snapshot.data() || null)), current(hooks.onError)));
        if (owner) listeners.push(onSnapshot(query(collection(db, 'cashSessions'), orderBy('openedAt', 'desc'), limit(100)), current(snapshot => hooks.onCash(snapshot.docs.map(d => d.data()))), current(hooks.onError)));
        resolveReady();
      } catch (e) { if (version === sessionVersion) { rejectReady(e); hooks.onError(e); } }
    }, hooks.onError);
  },
  async login(phone, password) { await ready; await signInWithEmailAndPassword(auth, await phoneLoginAlias(phone), password); },
  async register(phone, password) {
    await ready;
    if (!auth.currentUser?.isAnonymous) throw new Error('Saia da conta atual para criar outra.');
    await linkWithCredential(auth.currentUser, EmailAuthProvider.credential(await phoneLoginAlias(phone), password));
    // Linking keeps the guest UID and its existing orders/card.
    const user = auth.currentUser;
    hooks.onSession({ uid: user.uid, owner: false, anonymous: false });
  },
  async logout() { stop(); await signOut(auth); },
  createOrder: data => call('createOrder', data),
  updateStatus: data => call('updateOrderStatus', data),
  cashAction: data => call('cashAction', data),
  report: data => call('getOrderReport', data),
  connection: () => call('getStoreConnection', {})
};
