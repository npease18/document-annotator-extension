// Injects a click listener that overlays a cursor, collects info about the clicked element,
// and asks the background to capture the visible viewport.

(function (){
  // Keep track if extension is active (activated from popup)
  let active = false;

  // Request initial active state from background? We'll rely on popup to toggle.
  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'activate') {
      active = true;
      sendResponse({active});
    }
    if (msg?.type === 'deactivate') {
      active = false;
      sendResponse({active});
    }
  });

  function makeCursorOverlay(x, y) {
    const el = document.createElement('div');
    el.className = '__clickshot_cursor_overlay__';
    Object.assign(el.style, {
      position: 'fixed',
      left: 0,
      top: 0,
      pointerEvents: 'none',
      zIndex: 2147483647,
      transform: `translate(${x}px, ${y}px)`
    });
    // simple cursor marker (SVG) so it shows up in screenshots
    el.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 2l15 10-4 1 1 7-12-18z" fill="red" opacity="0.95"/>
      </svg>
    `;
    document.documentElement.appendChild(el);
    return el;
  }

  function getElementInfo(target) {
    try {
      const tag = target.tagName;
      const id = target.id ? `#${target.id}` : '';
      const cls = target.className ? (typeof target.className === 'string' ? '.' + target.className.split(/\s+/).filter(Boolean).join('.') : '') : '';
      let text = '';
      if (target instanceof HTMLElement) {
        // Get all visible text, including subelements, but omit HTML tags
        if (target.value !== undefined && typeof target.value === 'string') {
          text = target.value;
        } else {
          text = target.textContent || target.alt || target.title || '';
        }
        text = text.trim().replace(/\s+/g, ' ');
        if (text.length > 120) text = text.slice(0, 120) + '…';
      }
      return `Click "${text}"`;
    } catch (e) {
      return 'unknown element';
    }
  }

  document.addEventListener('click', async (ev) => {
    if (!active) return;
    // Prevent infinite loop: ignore synthetic events we dispatch
    if (ev.__synthesized_by_extension__) return;
    ev.preventDefault();
    ev.stopPropagation();

    try {
      const x = Math.round(ev.clientX);
      const y = Math.round(ev.clientY);
      const overlay = makeCursorOverlay(x, y);
      const info = getElementInfo(ev.target || document.elementFromPoint(x, y));

      // Wait one tick to allow overlay to paint
      await new Promise(r => setTimeout(r, 120));

      // Ask background to capture visible tab. The background will return a step number.
      chrome.runtime.sendMessage({ type: 'capture-request', info }, () => {
        // remove overlay after capture
        setTimeout(() => {
          overlay.remove();
          // Now re-dispatch the click event after screenshot, marking it as synthetic
          const newEvent = new ev.constructor(ev.type, ev);
          Object.defineProperty(newEvent, '__synthesized_by_extension__', {
            value: true,
            enumerable: false
          });
          (ev.target || document.elementFromPoint(x, y)).dispatchEvent(newEvent);
        }, 200);
      });
    } catch (e) {
      console.error('click capture failed', e);
    }
  }, true);

})();
