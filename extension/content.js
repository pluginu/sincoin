(() => {
  const key = 'sin-names';
  let enabled = true, timer, busy = false, again = false, revision = 0;
  let status = {count: 0, message: 'Scanning…'};
  let linkedRanges = [], cardHost, card, active, closeTimer, pointerFrame;
  const normalize = value => value.replace(/\s+/g, ' ').trim().toLowerCase();
  const excluded = 'script,style,noscript,textarea,input,select,option,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"]';
  function collect() {
    const groups = [];
    let group = null, total = 0, truncated = false;
    function visit(node) {
      if (total >= 200000) { truncated = true; return; }
      if (node.nodeType === Node.TEXT_NODE) {
        if (!node.data) return;
        if (!group) { group = {text: '', nodes: []}; groups.push(group); }
        const text = node.data.slice(0, 200000 - total);
        group.nodes.push({node, start: group.text.length, length: text.length});
        group.text += text; total += text.length;
        if (text.length < node.data.length) truncated = true;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node === cardHost) return;
      if (node.matches(excluded)) { group = null; return; }
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') { group = null; return; }
      const block = !['inline', 'contents'].includes(style.display) || node.tagName === 'BR';
      if (block) group = null;
      for (const child of node.childNodes) visit(child);
      if (block) group = null;
    }
    if (document.body) visit(document.body);
    return {groups, truncated};
  }
  async function scan() {
    if (!enabled) return;
    if (busy) { again = true; return; }
    busy = true;
    const version = revision;
    try {
      const {groups, truncated} = collect();
      const result = await chrome.runtime.sendMessage({type: 'match', texts: groups.map(g => g.text)});
      if (!enabled || version !== revision) return;
      dismiss(); linkedRanges = [];
      CSS.highlights.delete(key);
      if (result.error) { status = {count: 0, message: result.error}; return; }
      const ranges = [];
      result.ranges.forEach((matches, i) => matches.forEach(([start, end]) => {
        const nodes = groups[i].nodes;
        const first = nodes.find(n => start >= n.start && start < n.start + n.length);
        const last = nodes.find(n => end > n.start && end <= n.start + n.length);
        if (!first?.node.isConnected || !last?.node.isConnected) return;
        const range = new Range();
        range.setStart(first.node, start - first.start);
        range.setEnd(last.node, end - last.start);
        ranges.push(range);
      }));
      const profiles = new Map((result.profiles || []).map(p => [normalize(p.name), p]));
      (result.profileRanges || []).forEach((matches, i) => matches.forEach(([start, end]) => {
        const nodes = groups[i].nodes;
        const first = nodes.find(n => start >= n.start && start < n.start + n.length);
        const last = nodes.find(n => end > n.start && end <= n.start + n.length);
        const profile = profiles.get(normalize(groups[i].text.slice(start, end)));
        if (!profile || !first?.node.isConnected || !last?.node.isConnected) return;
        const range = new Range();
        range.setStart(first.node, start - first.start);
        range.setEnd(last.node, end - last.start);
        if (ranges.some(highlight => highlight.compareBoundaryPoints(Range.START_TO_START, range) <= 0 && highlight.compareBoundaryPoints(Range.END_TO_END, range) >= 0)) linkedRanges.push({range, profile});
      }));
      CSS.highlights.set(key, new Highlight(...ranges));
      status = {count: ranges.length, message: truncated || ranges.length >= 5000 ? 'Large page: scan limited to 200,000 characters / 5,000 matches.' : 'Page scanned'};
    } catch (error) { status = {count: 0, message: 'Refresh this page to reconnect the extension.'}; }
    finally { busy = false; if (again) { again = false; schedule(); } }
  }
  function schedule() { clearTimeout(timer); if (enabled) timer = setTimeout(scan, 250); }
  function changed(mutations) {
    if (mutations.every(m => m.target === cardHost || (m.type === 'childList' && [...m.addedNodes, ...m.removedNodes].every(n => n === cardHost)))) return;
    revision++; dismiss(); linkedRanges = []; schedule();
  }
  function dismiss() {
    clearTimeout(closeTimer);
    if (cardHost) cardHost.style.setProperty('display', 'none', 'important');
    active = null;
  }
  function closeSoon() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { if (!cardHost?.shadowRoot.activeElement) dismiss(); }, 250);
  }
  function show(entry, rect) {
    clearTimeout(closeTimer);
    if (active === entry) return;
    if (!cardHost) {
      cardHost = document.createElement('div');
      cardHost.id = 'sin-profile-popup';
      cardHost.style.cssText = 'all: initial !important; position: fixed !important; z-index: 2147483647 !important;';
      const shadow = cardHost.attachShadow({mode: 'open'});
      const style = document.createElement('style');
      style.textContent = `
        :host { color-scheme: dark; }
        * { box-sizing: border-box; }
        section { width: min(300px, calc(100vw - 16px)); max-height: min(420px, calc(100vh - 16px)); overflow: auto; padding: 18px; border: 1px solid #75602c; border-radius: 16px; background: #18171e; color: #f8f4e9; box-shadow: 0 12px 40px #0006; font: 14px/1.4 system-ui, sans-serif; }
        header { display:flex; align-items: start; gap: 12px; margin-bottom: 14px; }
        h2 { font-size: 17px; margin: 0; flex: 1; overflow-wrap: anywhere; }
        small { display: block; color: #ccb86d; font-size: 10px; letter-spacing: 2px; margin-bottom: 5px; }
        button { border: 0; background: transparent; color: #c7c0cc; cursor: pointer; font-size: 20px; }
        a { display: flex; align-items: center; gap: 12px; padding: 10px; margin-top: 6px; border-radius: 9px; background: #25232c; color: #fff; text-decoration: none; }
        a:hover, a:focus-visible { background: #38313a; outline: 2px solid #e8c65d; }
        .icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; background: #e8c65d; color: #211a09; font-weight: 700; }
        .detail { flex: 1; min-width: 0; } .host { display:block; font-size: 11px; color: #aaa4b4; overflow-wrap: anywhere; }
        footer { font-size: 11px; color: #aaa4b4; margin-top: 13px; }
      `;
      card = document.createElement('section');
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-label', 'Creator profile links');
      shadow.append(style, card);
      cardHost.addEventListener('pointerenter', () => clearTimeout(closeTimer));
      cardHost.addEventListener('pointerleave', closeSoon);
      shadow.addEventListener('focusout', closeSoon);
      document.documentElement.append(cardHost);
    }
    active = entry;
    card.replaceChildren();
    const header = document.createElement('header');
    const title = document.createElement('h2');
    const brand = document.createElement('small'); brand.textContent = 'SIN · CONNECT';
    title.append(brand, document.createTextNode(entry.profile.name));
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Close profile links'); close.onclick = dismiss;
    header.append(title, close); card.append(header);
    for (const link of entry.profile.links) {
      const a = document.createElement('a');
      a.href = link.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.referrerPolicy = 'no-referrer';
      const icon = document.createElement('span'); icon.className = 'icon'; icon.textContent = link.icon; icon.setAttribute('aria-hidden', 'true');
      const detail = document.createElement('span'); detail.className = 'detail'; detail.textContent = link.platform;
      const host = document.createElement('span'); host.className = 'host'; host.textContent = link.host;
      detail.append(host); a.append(icon, detail, document.createTextNode('↗')); a.title = link.url; card.append(a);
    }
    const footer = document.createElement('footer'); footer.textContent = 'Profile links · Opens in a new tab'; card.append(footer);
    cardHost.style.setProperty('display', 'block', 'important');
    const size = card.getBoundingClientRect();
    cardHost.style.setProperty('left', `${Math.max(8, Math.min(rect.left, innerWidth - size.width - 8))}px`, 'important');
    const top = rect.bottom + 8 + size.height <= innerHeight ? rect.bottom + 8 : rect.top - size.height - 8;
    cardHost.style.setProperty('top', `${Math.max(8, Math.min(top, innerHeight - size.height - 8))}px`, 'important');
  }
  document.addEventListener('pointermove', event => {
    if (event.composedPath().includes(cardHost)) { clearTimeout(closeTimer); return; }
    cancelAnimationFrame(pointerFrame);
    pointerFrame = requestAnimationFrame(() => {
      if (!enabled) return;
      // Narrow candidates to the text under the pointer before measuring ranges.
      const caret = document.caretRangeFromPoint(event.clientX, event.clientY);
      for (const entry of linkedRanges) {
        if (!entry.range.startContainer.isConnected || !caret || !entry.range.isPointInRange(caret.startContainer, caret.startOffset)) continue;
        for (const rect of entry.range.getClientRects()) {
          if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) { show(entry, rect); return; }
        }
      }
      closeSoon();
    });
  }, {passive: true});
  document.addEventListener('keydown', event => { if (event.key === 'Escape') dismiss(); });
  document.addEventListener('pointerdown', event => { if (!event.composedPath().includes(cardHost)) dismiss(); });
  document.addEventListener('pointerleave', closeSoon);
  window.addEventListener('blur', dismiss);
  window.addEventListener('resize', dismiss);
  window.addEventListener('scroll', event => { if (!event.composedPath().includes(cardHost)) dismiss(); }, true);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    // Timestamp-only refreshes do not change matches or require a new scan.
    if (Object.keys(changes).every(key => key === 'entertainerCache') &&
        JSON.stringify([changes.entertainerCache.oldValue?.names, changes.entertainerCache.oldValue?.profiles]) === JSON.stringify([changes.entertainerCache.newValue?.names, changes.entertainerCache.newValue?.profiles])) return;
    if (changes.enabled) enabled = changes.enabled.newValue !== false;
    revision++; dismiss(); linkedRanges = [];
    CSS.highlights.delete(key);
    status = {count: 0, message: enabled ? 'Scanning…' : 'Highlighting is off'};
    schedule();
  });
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message.type === 'status') reply(status);
  });
  chrome.storage.local.get({enabled: true}).then(settings => {
    enabled = settings.enabled;
    if (!enabled) status = {count: 0, message: 'Highlighting is off'};
    new MutationObserver(changed).observe(document.documentElement, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'contenteditable', 'aria-hidden']});
    schedule();
    setInterval(() => { if (enabled) schedule(); }, 30000);
  });
})();
