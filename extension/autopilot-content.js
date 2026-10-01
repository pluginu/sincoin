(() => {
  if (window.top !== window || (location.pathname !== '/search' && !['instagram.com', 'www.instagram.com'].includes(location.hostname))) return;
  let stopped = false;
  let searchedName = '';
  let openedSearch = false;
  let currentToken;
  const INSTAGRAM_POST_DWELL = 6000;
  const INSTAGRAM_LOAD_WAIT = 12000;
  const INSTAGRAM_RESULTS_WAIT = 3000;
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
  function instagramPath(url) {
    try {
      const parsed = new URL(url, location.href);
      if (parsed.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(parsed.hostname)) return '';
      return parsed.pathname.replace(/\/$/, '');
    } catch { return ''; }
  }
  function userPath(url) {
    const path = instagramPath(url);
    // Only user-result links qualify, never tags, navigation, login, or messages.
    return /^\/[a-z0-9._]+$/i.test(path) && !/^\/(accounts|about|developer|legal|privacy|terms|explore|direct|reels|reel|p|stories|search|challenge|notifications|web)$/i.test(path) ? path : '';
  }
  const postPath = url => /^\/(?:[a-z0-9._]+\/)?(?:p|reel)\/[a-z0-9_-]+$/i.test(instagramPath(url)) ? instagramPath(url) : '';
  const linksIn = (root, pathFor) => [...(root?.querySelectorAll('a[href]') || [])]
    .filter(link => visible(link) && !link.closest('nav, header, [role="navigation"]') && pathFor(link.href));
  function userResults() {
    for (let root = searchInput()?.parentElement; root && root !== document.body; root = root.parentElement) {
      const links = linksIn(root, userPath);
      if (links.length) return links;
      // Never climb out of a search dialog into unrelated profile/feed links.
      if (root.matches('[role="dialog"]')) break;
    }
    return [];
  }
  async function instagramStep(state) {
    const now = Date.now();
    const progress = state.instagramProgress || {phase: 'search', profiles: null, profileIndex: 0};
    const profile = progress.profiles?.[progress.profileIndex];
    const post = progress.posts?.[progress.postIndex];
    const expired = now - progress.since >= INSTAGRAM_LOAD_WAIT;
    // Save before clicking so full document navigations and worker suspension
    // retain the exact profile/post position. Recheck authorization after saving.
    async function transition(next, action) {
      const reply = await chrome.runtime.sendMessage({type: 'autopilot-page', token: state.token,
        instagramProgress: {...next, since: now}});
      if (!stopped && reply.active && reply.token === state.token) action?.();
    }
    const nextProfile = () => transition({phase: 'search', profiles: progress.profiles,
      profileIndex: progress.profileIndex + 1});
    const returnToProfile = () => {
      const dialog = [...document.querySelectorAll('[role="dialog"]')].find(element => visible(element) && element.querySelector('article'));
      const close = dialog?.querySelector('[aria-label="Close" i]')?.closest('button, [role="button"]');
      return transition({...progress, phase: 'return-profile'}, () => {
        if (close) close.click();
        else if (post && instagramPath(location.href) === post) history.back();
      });
    };
    if (progress.phase === 'search') {
      if (progress.profiles && progress.profileIndex >= progress.profiles.length) {
        // Reopen Search before moving to the next entertainer name.
        if (instagramSearch(state.name)) await transition({phase: 'done'});
      } else if (instagramSearch(state.name)) {
        await transition({...progress, phase: 'results'});
      }
      return;
    }
    if (progress.phase === 'results') {
      if (!instagramSearch(state.name)) return;
      if (now - progress.since < INSTAGRAM_RESULTS_WAIT) return;
      const results = userResults();
      const profiles = progress.profiles || [...new Set(results.map(link => userPath(link.href)))].slice(0, 5);
      const target = profiles[progress.profileIndex];
      const link = results.find(link => userPath(link.href) === target);
      if (link) {
        await transition({...progress, profiles, phase: 'profile', posts: null, postIndex: 0}, () => link.click());
      } else if (expired) {
        if (progress.profiles) await nextProfile();
        else await transition({phase: 'done'});
      } else scrollInstagramResults();
      return;
    }
    if (progress.phase === 'profile' || progress.phase === 'return-profile') {
      if (instagramPath(location.href) !== profile) {
        if (expired) await nextProfile();
        return;
      }
      if (now - progress.since < INSTAGRAM_RESULTS_WAIT) return;
      const links = linksIn(document.querySelector('main, [role="main"]'), postPath);
      const posts = progress.posts || [...new Set(links.map(link => postPath(link.href)))].slice(0, 2);
      const postIndex = progress.phase === 'return-profile' ? progress.postIndex + 1 : 0;
      const link = links.find(link => postPath(link.href) === posts[postIndex]);
      if (link) {
        await transition({...progress, posts, postIndex, phase: 'post'}, () => link.click());
      } else if ((progress.posts && postIndex >= posts.length) || expired) {
        await nextProfile(); // Private, empty, or unavailable profiles are skipped.
      }
      return;
    }
    if (progress.phase === 'post') {
      const postDocument = instagramPath(location.href) === post && document.querySelector('article, main, [role="main"]');
      const postDialog = [...document.querySelectorAll('[role="dialog"] article')].some(visible);
      if (postDocument || postDialog) await transition({...progress, phase: 'viewing'});
      else if (expired) await returnToProfile();
      return;
    }
    if (progress.phase === 'viewing' && now - progress.since >= INSTAGRAM_POST_DWELL) {
      await returnToProfile();
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
      const state = await chrome.runtime.sendMessage({type: 'autopilot-page', token: currentToken, searchedName: searchInput()?.value === searchedName ? searchedName : ''});
      if (stopped) return;
      if (state.token !== currentToken) { searchedName = ''; openedSearch = false; currentToken = state.token; }
      if (state.active && state.platform === 'instagram') {
        await instagramStep(state);
      } else if (state.active) window.scrollBy({top: Math.max(300, window.innerHeight * 0.7), behavior: 'smooth'});
    } catch { return; }
    if (!stopped) setTimeout(step, 2000);
  }
  window.addEventListener('pagehide', () => { stopped = true; });
  window.addEventListener('pageshow', event => {
    if (event.persisted) { stopped = false; step(); }
  });
  setTimeout(step, 2000);
})();
