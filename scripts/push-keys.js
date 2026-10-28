'use strict';
const {generateVAPIDKeys}=require('web-push');const keys=generateVAPIDKeys();
console.log('VAPID_PUBLIC_KEY='+keys.publicKey);console.log('VAPID_PRIVATE_KEY='+keys.privateKey);console.log('VAPID_SUBJECT=mailto:owner@example.com');
console.log('\nStore these in .env or hosting secrets. Set VAPID_SUBJECT to your contact. Keep the private key secret and do not rotate keys for existing subscriptions.');
