'use strict';
// First deployment: order/cash/report APIs, without Meta secrets or messaging.
process.env.TROPI_CORE_ONLY = 'true';
module.exports = require('./index.cjs');
