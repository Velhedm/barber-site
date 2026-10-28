'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {startupError}=require('../server/startup-error');
test('startup diagnosis identifies known causes without printing secret-bearing errors',()=>{
 for(const code of ['28P01','ERR_INVALID_URL','42501','ENOTFOUND']){const output=startupError({code,message:'secret-password',detail:'postgresql://secret',stack:'secret-stack'});assert.doesNotMatch(output,/secret/);assert.notEqual(output.startsWith('STARTUP_FAILED'),true);}
 assert.match(startupError(new Error('ADMIN_PASSWORD must contain 12 to 200 characters')),/ADMIN_PASSWORD_INVALID/);
 assert.doesNotMatch(startupError(new Error('private unknown value')),/private unknown value/);
});
