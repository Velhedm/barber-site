const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict');
const {createApp}=require('../server/app');
const {scryptSync}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const salt='1234567890abcdef1234567890abcdef';
 const runtime=await createApp({databaseUrl:'',databasePath:':memory:',management:true,migrateManagement:true,production:false,now:()=>Date.parse('2030-01-01T00:00:00Z'),adminHash:salt+':'+scryptSync('local-test-password-only',salt,64).toString('hex'),vapid:{}});
 for(const category of ['zal','vip']){await runtime.shop.setDuration('haircut',category,90);await runtime.shop.setDuration('beard_cut',category,30);}
 for(const id of ['master-1','master-2']){const m=(await runtime.shop.masters()).find(m=>m.id===id);await runtime.shop.saveMaster({id,name:'',online:true,archived:false,revision:m.revision,stepMinutes:30,serviceIds:['haircut','beard_cut'],schedule:Array.from({length:7},()=>({closed:false,start:'09:00',end:'21:00',breaks:[{start:'13:00',end:'14:00'}]}))});}
 const server=runtime.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 const artifacts=path.resolve(__dirname,'../artifacts/management');fs.mkdirSync(artifacts,{recursive:true});
 let browser;try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/');await page.locator('#master option[value="master-1"]').waitFor({state:'attached'});
  await page.locator('#master').selectOption('master-1');await page.locator('#booking-slots button:not([disabled])').first().waitFor();
  await page.locator('#booking-slots button[data-time="11:00"]').click();await page.locator('#customer-name').fill('Browser Synthetic');await page.locator('#customer-phone').fill('+994500000002');
  for(const lang of ['ru','en','az']){await page.locator(`[data-language="${lang}"]`).click();assert.equal(await page.locator('#master').inputValue(),'master-1');assert.equal(await page.locator('#customer-name').inputValue(),'Browser Synthetic');assert.equal(await page.locator('#booking-slots [aria-pressed="true"]').getAttribute('data-time'),'11:00');}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(artifacts,'client-mobile.png'),fullPage:true});
  await page.locator('#confirm-booking').click();await page.locator('#booking-success').waitFor();assert.ok((await page.locator('#success-master').innerText()).includes('1'));
  const second=await context.newPage();await second.goto(base+'/');await second.locator('#master option[value="master-1"]').waitFor({state:'attached'});await second.locator('#master').selectOption('master-1');await second.locator('#booking-slots button[data-time="11:00"]').waitFor();assert.equal(await second.locator('#booking-slots button[data-time="11:00"]').isDisabled(),true);
  await second.locator('#master').selectOption('master-2');await second.waitForFunction(()=>!document.querySelector('#booking-slots button[data-time="11:00"]')?.disabled);
  const cancelUrl=await page.locator('#success-cancellation a').getAttribute('href');assert.match(cancelUrl,/^\/cancel\.html#/);const cancel=await context.newPage();cancel.on('pageerror',e=>errors.push(e.message));await cancel.goto(base+cancelUrl);assert.equal((await runtime.shop.listBookings()).rows[0].status,'active');await cancel.locator('[data-lang="en"]').click();await cancel.locator('#cancel').click();await cancel.getByText('Your booking has been cancelled.',{exact:true}).waitFor();assert.equal((await runtime.shop.listBookings({status:'all'})).rows[0].status,'cancelled');assert.equal(await cancel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const admin=await context.newPage();admin.on('pageerror',e=>errors.push(e.message));await admin.goto(base+'/admin.html');await admin.locator('#login input[name=password]').fill('local-test-password-only');await admin.locator('#login button').click();await admin.locator('#dashboard').waitFor();
  await admin.locator('#tab-masters').click();await admin.locator('#masters-view .management-form').waitFor();assert.equal(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await admin.screenshot({path:path.join(artifacts,'admin-masters-mobile.png'),fullPage:true});
  await admin.locator('#tab-services').click();await admin.locator('#services-view .duration-card').first().waitFor();await admin.locator('#services-view .duration-card button').first().click();await admin.locator('#catalog-editor input').first().fill('Saç kəsimi test');await admin.getByRole('button',{name:'Сохранить услугу',exact:true}).click();await admin.waitForFunction(()=>document.querySelector('#catalog-editor').childElementCount===0);
  await admin.locator('#tab-rooms').click();await admin.locator('#rooms-view input[type="text"]').fill('Synthetic resource');await admin.getByRole('button',{name:'Добавить комнату',exact:true}).click();await admin.waitForFunction(()=>document.querySelectorAll('#rooms-view .management-form').length===2);
  await admin.locator('#tab-schedule').click();await admin.locator('#schedule-master').waitFor();
  assert.equal(await admin.locator('.client-link').getAttribute('target'),'_blank');
  assert.deepEqual(errors,[]);console.log('PASS: mobile booking, preserved RU/AZ/EN fields, concurrent availability, admin catalog save and room creation, layout, no JS errors');
  for(const viewport of [{width:360,height:800},{width:1440,height:1000}]){await page.setViewportSize(viewport);await page.goto(base+'/');await page.locator('#master option[value="master-1"]').waitFor({state:'attached'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await admin.setViewportSize(viewport);await admin.locator('#tab-masters').click();await admin.locator('#masters-view .management-form').waitFor();assert.equal(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  console.log('PASS: 360px / 390px / 1440px overflow checks');
 }finally{await browser.close();}
 }finally{await new Promise(resolve=>server.close(resolve));await runtime.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
