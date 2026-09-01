/*
 * Hachisu benefits product story.
 *
 * The HTML remains a complete paired sequence without JavaScript. On larger
 * screens, this module promotes it to one sticky, scroll-driven product stage.
 */
(function () {
  'use strict';

  var section = document.querySelector('[data-benefits]');
  if (!section) return;

  var states = Array.from(section.querySelectorAll('[data-benefit-state]'));
  var activeState = 0;
  var scheduledFrame = 0;

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function setActiveState(nextState) {
    if (nextState === activeState) return;
    activeState = nextState;
    states.forEach(function (state, index) {
      state.classList.toggle('is-active', index === activeState);
    });
  }

  function updateState() {
    scheduledFrame = 0;
    var bounds = section.getBoundingClientRect();
    var stickyOffset = window.innerWidth <= 800 ? window.innerHeight * 0.35 : 70;
    var travel = Math.max(1, bounds.height - window.innerHeight + stickyOffset);
    var progress = clamp((stickyOffset - bounds.top) / travel, 0, 1);
    setActiveState(Math.round(progress * (states.length - 1)));
  }

  function requestStateUpdate() {
    if (scheduledFrame) return;
    scheduledFrame = window.requestAnimationFrame(updateState);
  }

  document.documentElement.classList.add('benefits-product-ready');
  updateState();
  window.addEventListener('scroll', requestStateUpdate, { passive: true });
  window.addEventListener('resize', requestStateUpdate, { passive: true });
})();
