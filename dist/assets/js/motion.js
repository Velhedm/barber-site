'use strict';
(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const root = document.documentElement;
  const progress = document.querySelector('.scroll-thread');
  let observer;
  let frame = 0;
  let activeCard = null;
  let activeButton = null;
  let pointerX = 0;
  let pointerY = 0;

  function resetCard() {
    if (!activeCard) return;
    ['--tilt-x', '--tilt-y', '--spot-x', '--spot-y'].forEach(key => activeCard.style.removeProperty(key));
    activeCard = null;
  }
  function resetButton() {
    if (!activeButton) return;
    activeButton.style.removeProperty('--magnet-x');
    activeButton.style.removeProperty('--magnet-y');
    activeButton = null;
  }
  function paint() {
    frame = 0;
    if (reduceMotion.matches) return;
    const total = root.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${total > 0 ? Math.min(1, Math.max(0, scrollY / total)) : 0})`;
    if (activeCard) {
      const rect = activeCard.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (pointerX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (pointerY - rect.top) / rect.height));
      activeCard.style.setProperty('--tilt-x', `${(0.5 - y) * 5}deg`);
      activeCard.style.setProperty('--tilt-y', `${(x - 0.5) * 6}deg`);
      activeCard.style.setProperty('--spot-x', `${x * 100}%`);
      activeCard.style.setProperty('--spot-y', `${y * 100}%`);
    }
    if (activeButton) {
      const rect = activeButton.getBoundingClientRect();
      activeButton.style.setProperty('--magnet-x', `${Math.max(-5, Math.min(5, (pointerX - rect.left - rect.width / 2) * .08))}px`);
      activeButton.style.setProperty('--magnet-y', `${Math.max(-4, Math.min(4, (pointerY - rect.top - rect.height / 2) * .08))}px`);
    }
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(paint); }
  function move(event) {
    if (reduceMotion.matches || !finePointer.matches || event.pointerType === 'touch') return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    schedule();
  }
  document.querySelectorAll('.gallery-card').forEach(card => {
    card.addEventListener('pointerenter', event => {
      if (reduceMotion.matches || !finePointer.matches || event.pointerType === 'touch') return;
      resetCard(); activeCard = card; move(event);
    });
    card.addEventListener('pointermove', move);
    card.addEventListener('pointerleave', resetCard);
    card.addEventListener('click', resetCard);
  });
  document.querySelectorAll('.hero .button,.contact .button').forEach(button => {
    button.addEventListener('pointerenter', event => {
      if (reduceMotion.matches || !finePointer.matches || event.pointerType === 'touch') return;
      resetButton(); activeButton = button; move(event);
    });
    button.addEventListener('pointermove', move);
    button.addEventListener('pointerleave', resetButton);
    button.addEventListener('click', resetButton);
  });
  function configure() {
    if (observer) observer.disconnect();
    root.classList.toggle('motion-ready', !reduceMotion.matches);
    if (reduceMotion.matches) {
      resetCard(); resetButton();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      return;
    }
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('motion-entered');
          observer.unobserve(entry.target);
        }
      }), {threshold: .15});
      document.querySelectorAll('.service-list,.signature').forEach(el => observer.observe(el));
    } else document.querySelectorAll('.service-list,.signature').forEach(el => el.classList.add('motion-entered'));
    schedule();
  }
  addEventListener('scroll', schedule, {passive: true});
  addEventListener('resize', schedule, {passive: true});
  addEventListener('blur', () => {resetCard(); resetButton();});
  finePointer.addEventListener('change', () => {resetCard(); resetButton();});
  reduceMotion.addEventListener('change', configure);
  configure();
})();
