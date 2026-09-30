(() => {
  const key = 'sin-names';
  let enabled = true, timer, busy = false, again = false, revision = 0;
  let status = {count: 0, message: 'Scanning…'};
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
      CSS.highlights.set(key, new Highlight(...ranges));
      status = {count: ranges.length, message: truncated || ranges.length >= 5000 ? 'Large page: scan limited to 200,000 characters / 5,000 matches.' : 'Page scanned'};
    } catch (error) { status = {count: 0, message: 'Refresh this page to reconnect the extension.'}; }
    finally { busy = false; if (again) { again = false; schedule(); } }
  }
  function schedule() { clearTimeout(timer); if (enabled) timer = setTimeout(scan, 250); }
  function changed() { revision++; schedule(); }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    // Timestamp-only refreshes do not change matches or require a new scan.
    if (Object.keys(changes).every(key => key === 'entertainerCache') &&
        JSON.stringify(changes.entertainerCache.oldValue?.names) === JSON.stringify(changes.entertainerCache.newValue?.names)) return;
    if (changes.enabled) enabled = changes.enabled.newValue !== false;
    revision++;
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
