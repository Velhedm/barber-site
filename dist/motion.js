'use strict';
(() => {
 if(!('IntersectionObserver' in window)||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const elements=[...document.querySelectorAll('.hero-copy,.hero-photo,.section-heading,.service-card,.calendar-card,.contact-card,.location-section,.site-footer')];
 const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}},{threshold:0.08,rootMargin:'0px 0px -24px 0px'});
 for(const element of elements){element.classList.add('reveal-on-scroll');observer.observe(element);}
})();
