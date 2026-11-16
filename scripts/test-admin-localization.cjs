'use strict';
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict');
const {createApp}=require('../server/app');
const {scryptSync}=require('node:crypto');
(async()=>{
 const salt='1234567890abcdef1234567890abcdef';
 const runtime=await createApp({databaseUrl:'',databasePath:':memory:',management:true,migrateManagement:true,production:false,now:()=>Date.parse('2030-01-01T00:00:00Z'),adminHash:salt+':'+scryptSync('local-test-password-only',salt,64).toString('hex'),vapid:{}});
 await runtime.shop.setDuration('haircut','zal',60);const master=(await runtime.shop.masters())[0];await runtime.shop.saveMaster({id:master.id,revision:master.revision,name:'',online:true,archived:false,stepMinutes:30,serviceIds:['haircut'],schedule:Array.from({length:7},()=>({closed:false,start:'09:00',end:'21:00',breaks:[]}))});
 await runtime.shop.book({name:'Synthetic Client',phone:'+994500000118',date:'2030-01-02',time:'12:00',masterId:master.id,serviceIds:['haircut'],room:'zal',requestKey:require('node:crypto').randomUUID()});
 const server=runtime.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 let browser;
 try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/admin.html');
  await page.locator('.header-tools [data-admin-language=en]').click();
  await page.locator('#login input[name=password]').fill('local-test-password-only');await page.locator('#login button').click();await page.locator('#dashboard').waitFor();
  const untranslated=[];
  for(const tab of ['home','bookings','calendar','clients','masters','rooms','services','schedule','settings']){
   await page.locator('#tab-'+tab).click();await page.waitForTimeout(200);
   const strings=await page.evaluate(()=>{const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),out=[];let n;while(n=walk.nextNode()){if(/[А-Яа-яЁё]/.test(n.nodeValue)&&n.parentElement?.checkVisibility())out.push(n.nodeValue.trim());}return [...new Set(out)];});
   if(strings.length)untranslated.push({tab,strings});
  }
  assert.deepEqual(untranslated,[],'Untranslated visible dashboard text');
  await page.locator('#tab-bookings').click();await page.locator('#manual-booking').click();
  const bookingDialog=page.locator('dialog[open]');await bookingDialog.getByLabel('Client name',{exact:true}).fill('Synthetic name');await bookingDialog.getByLabel('Phone',{exact:true}).fill('+994500000115');
  const untranslatedDialog=await bookingDialog.evaluate(root=>{const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),out=[];let n;while(n=walker.nextNode())if(/[А-Яа-яЁё]/.test(n.nodeValue)&&n.parentElement?.checkVisibility())out.push(n.nodeValue.trim());return out;});assert.deepEqual(untranslatedDialog,[],'Untranslated manual booking dialog');
  await bookingDialog.getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('#tab-masters').click();await page.locator('#masters-view .management-form').waitFor();
  await page.getByLabel('Barber name',{exact:true}).fill('История');
  await page.locator('#masters-view details.management-day').first().locator('summary').click();
  await page.locator('#masters-view details.management-day').first().getByLabel('Working day',{exact:true}).check();
  await page.locator('#masters-view details.management-day').first().getByLabel('Start',{exact:true}).fill('10:30');
  await page.locator('.header-tools [data-admin-language=az]').click();
  assert.equal(await page.getByLabel('Ustanın adı',{exact:true}).inputValue(),'История');
  assert.equal(await page.locator('#masters-view details.management-day').first().getByLabel('Başlanğıc',{exact:true}).inputValue(),'10:30');
  assert.equal(await page.locator('#masters-view details.management-day').first().getByLabel('İş günü',{exact:true}).isChecked(),true);
  assert.ok((await page.locator('#masters-view').innerText()).includes('Bazar ertəsi'));
  await page.reload();assert.equal(await page.locator('html').getAttribute('lang'),'az');
  await page.locator('#dashboard').waitFor();await page.locator('#tab-settings').click();await page.locator('#settings-view h2').waitFor();
  await page.getByLabel('Salonun adı',{exact:true}).fill('Synthetic unsaved name');await page.getByLabel('Ləğv ziyarətdən neçə dəqiqə əvvəl',{exact:true}).fill('180');
  await page.locator('.header-tools [data-admin-language=en]').click();assert.equal(await page.getByLabel('Salon name',{exact:true}).inputValue(),'Synthetic unsaved name');assert.equal(await page.getByLabel('Cancellation cutoff in minutes',{exact:true}).inputValue(),'180');await page.locator('.header-tools [data-admin-language=az]').click();
  await page.getByRole('button',{name:'Şifrəni dəyiş',exact:true}).click();
  const dialog=page.locator('dialog[open]');await dialog.getByLabel('Yeni şifrə',{exact:true}).fill('draft-not-submitted');
  await dialog.locator('[data-admin-language=en]').click();assert.equal(await dialog.getByLabel('New password',{exact:true}).inputValue(),'draft-not-submitted');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: all main admin sections EN, AZ schedules, preserved master/password drafts, stored locale, mobile layout, no JS errors');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));await runtime.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
