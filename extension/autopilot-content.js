(() => {
  if (window.top !== window || (location.pathname !== '/search' && !['instagram.com', 'www.instagram.com'].includes(location.hostname))) return;
  let stopped = false;
  let searchedName = '';
  let openedSearch = false;
  const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
  const searchInput = () => [...document.querySelectorAll('input[placeholder*="Search" i], input[aria-label*="Search" i], input[type="search"]')]
      .find(element => visible(element) && !element.disabled && !element.readOnly);
  function instagramSearch(name) {
    const input = searchInput();
    if (!input) {
      const icon = [...document.querySelectorAll('[aria-label="Search" i]')].find(visible);
      const trigger = icon?.closest('a, button, [role="button"]') ||
        [...document.querySelectorAll('a, button, [role="button"]')].find(element => visible(element) && element.textContent.trim() === 'Search');
      if (trigger && !openedSearch) { trigger.click(); openedSearch = true; }
      return false;
    }
    openedSearch = false;
    if (searchedName === name && input.value === name) return true;
    input.focus();
    // Use the native setter so React receives a real value change via input.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, name);
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
    searchedName = name;
    return false; // Allow Instagram's debounced results to render before scrolling.
  }
  function scrollInstagramResults() {
    const input = searchInput();
    const panel = input?.closest('[role="dialog"]') || input?.parentElement;
    // Instagram renders search results in a scrollable side panel.
    for (let root = panel; root && root !== document.body; root = root.parentElement) {
      const scroller = [root, ...root.querySelectorAll('div')].find(element =>
        visible(element) && element.scrollHeight > element.clientHeight &&
        /auto|scroll/.test(getComputedStyle(element).overflowY));
      if (scroller) { scroller.scrollBy({top: 300, behavior: 'smooth'}); return; }
    }
  }
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
      const {active, name, platform} = await chrome.runtime.sendMessage({type: 'autopilot-page', searchedName: searchInput()?.value === searchedName ? searchedName : ''});
      if (stopped) return;
      if (active && platform === 'instagram') {
        if (instagramSearch(name)) scrollInstagramResults();
      } else if (active) window.scrollBy({top: Math.max(300, window.innerHeight * 0.7), behavior: 'smooth'});
    } catch { return; }
    if (!stopped) setTimeout(step, 2000);
  }
  window.addEventListener('pagehide', () => { stopped = true; });
  window.addEventListener('pageshow', event => {
    if (event.persisted) { stopped = false; step(); }
  });
  setTimeout(step, 2000);
})();
