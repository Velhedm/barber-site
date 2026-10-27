'use strict';
const {randomBytes,scryptSync}=require('node:crypto');
process.stdout.write('Enter a new owner password (at least 12 characters), then Enter. Input is hidden.\n');
let input='';if(process.stdin.isTTY)process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');process.stdin.resume();
process.stdin.on('data',data=>{for(const char of data){if(char==='\u0003')process.exit(1);if(char==='\r'||char==='\n'){if(input.length<12){console.error('Password too short');process.exit(1);}const salt=randomBytes(16).toString('hex');console.log('ADMIN_PASSWORD_HASH='+salt+':'+scryptSync(input,salt,64).toString('hex'));process.exit(0);}if(char==='\u007f')input=input.slice(0,-1);else input+=char;}});
