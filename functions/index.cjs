'use strict';
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret, defineString, defineBoolean } = require('firebase-functions/params');
const { setGlobalOptions } = require('firebase-functions/v2');
const { createService } = require('./lib/service.cjs');
const { createWhatsApp } = require('./lib/whatsapp.cjs');
const { AppError, requireUser } = require('./lib/domain.cjs');
initializeApp();
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 3, memory: '256MiB' });
const db = getFirestore();
const coreOnly = process.env.TROPI_CORE_ONLY === 'true';
const enabled = defineBoolean('WHATSAPP_ENABLED', { default: false });
const phoneId = defineString('WHATSAPP_PHONE_NUMBER_ID', { default: '' });
const wabaId = defineString('WHATSAPP_WABA_ID', { default: '' });
const version = defineString('WHATSAPP_GRAPH_API_VERSION', { default: '' });
const preparo = defineString('WHATSAPP_TEMPLATE_PREPARO', { default: 'tropi_pedido_em_preparo' });
const entrega = defineString('WHATSAPP_TEMPLATE_ENTREGA', { default: 'tropi_pedido_saiu_entrega' });
const language = defineString('WHATSAPP_TEMPLATE_LANGUAGE', { default: 'pt_BR' });
const token = coreOnly ? null : defineSecret('WHATSAPP_ACCESS_TOKEN');
const appSecret = coreOnly ? null : defineSecret('WHATSAPP_APP_SECRET');
const verifyToken = coreOnly ? null : defineSecret('WHATSAPP_VERIFY_TOKEN');
const service = createService({ db, whatsappEnabled: () => !coreOnly && enabled.value() });
const identity = request => ({ uid: request.auth?.uid, admin: request.auth?.token?.tropiAdmin === true });
const callable = fn => onCall({ enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' }, async request => {
  try { return await fn(identity(request), request.data); }
  catch (e) {
    if (e instanceof AppError) throw new HttpsError(e.code, e.message);
    console.error('Tropi backend failure', { code: e.code || 'internal' });
    throw new HttpsError('internal', 'Não foi possível concluir. Tente novamente.');
  }
});
exports.createOrder = callable(service.createOrder);
exports.updateOrderStatus = callable(service.updateStatus);
exports.cashAction = callable(service.cashAction);
exports.getOrderReport = callable(service.report);
exports.getLoyalty = callable(service.getLoyalty);
exports.expirePendingOrders = onSchedule({ schedule: 'every 15 minutes', timeZone: 'America/Fortaleza', maxInstances: 1 }, () => service.expirePending());
exports.getStoreConnection = callable(async user => { requireUser(user, true); return { whatsappEnabled: !coreOnly && enabled.value() }; });
function whatsapp({ sender = false, receiver = false } = {}) {
  return createWhatsApp({ db, config: () => ({
    enabled: enabled.value(), phoneNumberId: phoneId.value(), wabaId: wabaId.value(), version: version.value(),
    token: sender ? token.value() : '', appSecret: receiver ? appSecret.value() : '',
    preparoTemplate: preparo.value(), entregaTemplate: entrega.value(), language: language.value()
  }) });
}
if (!coreOnly) {
exports.sendWhatsAppStatus = onDocumentCreated({ document: 'messageJobs/{jobId}', secrets: [token], retry: true }, event => whatsapp({ sender: true }).process(event.params.jobId));
exports.retryWhatsAppMessages = onSchedule({ schedule: 'every 1 minutes', timeZone: 'America/Fortaleza', secrets: [token], maxInstances: 1 }, () => whatsapp({ sender: true }).retryDue());
exports.whatsappWebhook = onRequest({ secrets: [appSecret, verifyToken], cors: false }, async (req, res) => {
  if (req.method === 'GET') {
    if (req.query['hub.mode'] === 'subscribe' && verifyToken.value() && req.query['hub.verify_token'] === verifyToken.value()) {
      res.status(200).send(String(req.query['hub.challenge'] || '')); return;
    }
    res.sendStatus(403); return;
  }
  if (req.method !== 'POST') { res.set('Allow', 'GET, POST').sendStatus(405); return; }
  try {
    const result = await whatsapp({ receiver: true }).webhook({ rawBody: req.rawBody, signature: req.get('X-Hub-Signature-256'), body: req.body });
    res.sendStatus(result.status);
  } catch (e) {
    console.error('WhatsApp webhook failure', { code: e.code || 'internal' });
    res.sendStatus(500);
  }
});
}
