'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('backup helper refuses overwrite and removes incomplete output on pipeline failure',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ilker-backup-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const bin=path.join(dir,'bin');fs.mkdirSync(bin);const service=path.join(dir,'service'),key=path.join(dir,'key'),output=path.join(dir,'backup.gpg');fs.writeFileSync(service,'synthetic');fs.writeFileSync(key,'synthetic');
 const dump=path.join(bin,'pg_dump'),gpg=path.join(bin,'gpg');fs.writeFileSync(dump,'#!/bin/sh\nprintf synthetic-dump\n');fs.writeFileSync(gpg,'#!/bin/sh\nwhile [ "$1" != "--output" ]; do shift; done\ncat > "$2"\n');fs.chmodSync(dump,0o755);fs.chmodSync(gpg,0o755);
 const env={...process.env,PATH:bin+':'+process.env.PATH,PGSERVICEFILE:service},script=path.join(__dirname,'../scripts/backup-neon.sh');
 const run=()=>spawnSync('bash',[script,output,key],{env,encoding:'utf8'});assert.equal(run().status,0);assert.equal(fs.readFileSync(output,'utf8'),'synthetic-dump');assert.notEqual(run().status,0);assert.equal(fs.readFileSync(output,'utf8'),'synthetic-dump');
 fs.unlinkSync(output);fs.writeFileSync(dump,'#!/bin/sh\nprintf partial\nexit 1\n');assert.notEqual(run().status,0);assert.equal(fs.existsSync(output),false);assert.deepEqual(fs.readdirSync(dir).filter(f=>f.includes('.partial.')),[]);
});
