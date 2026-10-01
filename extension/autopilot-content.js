(() => {
  if (window.top !== window || (location.pathname !== '/search' && !['instagram.com', 'www.instagram.com'].includes(location.hostname))) return;
  let stopped = false;
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message.type !== 'autopilot-next-page') return;
    if (message.url !== location.href) { reply({}); return; }
    const link = document.querySelector('a#pnnext, a[rel="next"]');
    reply({url: link?.getClientRects().length ? link.href : null});
  });
  // Ask the worker on every step so stopping also cancels scrolling, and only
  // the dedicated tab's current results document can move the viewport.
  async function step() {
    try {
      const {active} = await chrome.runtime.sendMessage({type: 'autopilot-page'});
      if (stopped) return;
      if (active) window.scrollBy({top: Math.max(300, window.innerHeight * 0.7), behavior: 'smooth'});
    } catch { return; }
    if (!stopped) setTimeout(step, 2000);
  }
  window.addEventListener('pagehide', () => { stopped = true; });
  window.addEventListener('pageshow', event => {
    if (event.persisted) { stopped = false; step(); }
  });
  setTimeout(step, 2000);
})();
