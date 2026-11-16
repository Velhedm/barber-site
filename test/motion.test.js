'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

test('enabling reduced motion reveals elements that are still off screen',()=>{
 const elements=Array.from({length:2},()=>({classes:new Set(),classList:{add(value){this.owner.add(value);}}}));
 for(const element of elements)element.classList.owner=element.classes;
 let changed,observer;
 class Observer{constructor(){observer=this;}observe(){}unobserve(){}disconnect(){this.disconnected=true;}}
 const preference={matches:false,addEventListener(type,handler){if(type==='change')changed=handler;}};
 const context={window:{IntersectionObserver:Observer},IntersectionObserver:Observer,matchMedia:()=>preference,document:{querySelectorAll:()=>elements}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/motion.js'),'utf8'),context);
 assert.equal(elements[0].classes.has('is-visible'),false);
 changed({matches:true});
 assert.equal(observer.disconnected,true);
 assert.ok(elements.every(element=>element.classes.has('is-visible')));
});
