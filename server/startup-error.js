'use strict';
// Only fixed messages and allowlisted codes reach logs. Driver messages can contain credentials.
function startupError(error){
 const codes={
  '28P01':'DATABASE_AUTH_FAILED: Neon rejected the database password. Copy a fresh connection string into DATABASE_URL.',
  '28000':'DATABASE_AUTH_FAILED: Check the Neon role and connection string.',
  '3D000':'DATABASE_NOT_FOUND: Check the database name in DATABASE_URL.',
  '42501':'DATABASE_PERMISSION_DENIED: Check database role permissions.',
  'ERR_INVALID_URL':'DATABASE_URL_INVALID: Use the complete postgresql:// connection string without quotes or a DATABASE_URL= prefix.',
  'ENOTFOUND':'DATABASE_HOST_NOT_FOUND: Check the host in DATABASE_URL.',
  'ECONNREFUSED':'DATABASE_CONNECTION_REFUSED: Check Neon availability and connection settings.',
  'ETIMEDOUT':'DATABASE_CONNECTION_TIMEOUT: Check Neon availability and connection settings.'
 };
 if(codes[error?.code])return codes[error.code];
 if(error?.message==='ADMIN_PASSWORD must contain 12 to 200 characters')return 'ADMIN_PASSWORD_INVALID: Set ADMIN_PASSWORD to a password of 12 to 200 characters.';
 if(error?.message==='Production requires ADMIN_PASSWORD_HASH, APP_ORIGIN and valid VAPID settings')return 'PRODUCTION_SETTINGS_MISSING: Check admin password/hash, public origin and VAPID keys.';
 return 'STARTUP_FAILED: Check DATABASE_URL, owner password and VAPID configuration. Secret values are hidden.';
}
module.exports={startupError};
