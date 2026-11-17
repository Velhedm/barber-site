'use strict';
(() => {
 const preference=matchMedia('(prefers-reduced-motion: reduce)');
 const animateLanguage=()=>{if(preference.matches)return;const target=document.querySelector('main');if(!target||typeof target.animate!=='function')return;target.animate([{opacity:.72},{opacity:1}],{duration:220,easing:'ease-out'});};
 document.addEventListener('languagechange',animateLanguage);
 if(!('IntersectionObserver' in window)||preference.matches)return;
 const elements=[...document.querySelectorAll('.hero-copy,.hero-photo,.section-heading,.service-card,.calendar-card,.contact-card,.location-section,.site-footer')];
 const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}},{threshold:0.08,rootMargin:'0px 0px -24px 0px'});
 for(const element of elements){element.classList.add('reveal-on-scroll');observer.observe(element);}
 // A user can change this setting while the page is open. Reveal everything
 // immediately, including elements which have not yet entered the viewport.
 preference.addEventListener?.('change',event=>{
  if(!event.matches)return;
  observer.disconnect();
  for(const element of elements)element.classList.add('is-visible');
 });
})();
