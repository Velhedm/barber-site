'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'../dist');
test('admin and client manifests have different identities and valid launch scopes',()=>{
 const admin=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 const client=JSON.parse(fs.readFileSync(path.join(root,'client-manifest.json'),'utf8'));
 const origin='https://example.invalid';
 assert.notEqual(admin.id,client.id);
 for(const manifest of [admin,client]){
  const start=new URL(manifest.start_url,origin),scope=new URL(manifest.scope,origin);
  assert.equal(start.origin,scope.origin);
  assert.ok(start.pathname.startsWith(scope.pathname));
  for(const icon of manifest.icons)assert.ok(fs.existsSync(path.join(root,icon.src)));
 }
 assert.equal(new URL('/',origin).pathname.startsWith(new URL(admin.scope,origin).pathname),false);
 assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'),/href="\/client-manifest\.json"/);
 assert.match(fs.readFileSync(path.join(root,'admin.html'),'utf8'),/href="\/manifest\.json"/);
});
