// Runs in the content script's isolated world; only reads the displayed profile.
(() => {
  function count(text) {
    const match = text.trim().match(/^((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*([kmb])?(?:\s|$)/i);
    if (!match) return null;
    const value = Math.round(Number(match[1].replace(/[,\s]/g, '')) * ({k: 1e3, m: 1e6, b: 1e9}[match[2]?.toLowerCase()] || 1));
    return Number.isSafeInteger(value) ? value : null;
  }
  function capture(name) {
    const main = document.querySelector('main, [role="main"]');
    const header = main?.querySelector('header') || document.querySelector('header:has(a[href*="/followers"])');
    const username = location.pathname.split('/').filter(Boolean)[0];
    const root = header;
    const text = root?.innerText || '';
    function statistic(kind) {
      const link = root?.querySelector(`a[href$="/${kind}/"], a[href$="/${kind}"]`);
      const titled = link?.querySelector('[title]');
      const label = titled?.getAttribute('title') || link?.innerText ||
        text.match(new RegExp(`([\\d.,]+\\s*[KMB]?)\\s+${kind}\\b`, 'i'))?.[1] || '';
      return {value: count(label), text: label.trim().slice(0, 100)};
    }
    const followers = statistic('followers'), following = statistic('following');
    // Clone the header to exclude navigation, statistics and action labels from bio.
    const copy = root?.cloneNode(true);
    copy?.querySelectorAll('button, [role="button"], nav, h1, h2, ul, a[href*="/followers"], a[href*="/following"], a[href$="/tagged/"]').forEach(node => node.remove());
    copy?.querySelectorAll('a[href]').forEach(link => {
      try {
        const url = new URL(link.href);
        if (['mailto:', 'tel:'].includes(url.protocol) || !['instagram.com', 'www.instagram.com'].includes(url.hostname)) link.remove();
      } catch {}
    });
    // textContent preserves detached clones; add separators for rendered line breaks.
    copy?.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
    copy?.querySelectorAll('div, section, p').forEach(node => node.append('\n'));
    const explicitBio = root?.querySelector('[data-testid="user-bio"], [data-testid="biography"]');
    const bio = root ? (explicitBio?.innerText ?? copy.textContent).split('\n').map(line => line.trim())
      .filter(line => line && line.toLowerCase() !== username?.toLowerCase() && !/^\d[\d,.]*\s*[KMB]?\s+(posts|followers|following)$/i.test(line)).join('\n').slice(0, 10000) : null;
    const contact = {emails: [], phones: [], links: []};
    for (const link of root?.querySelectorAll('a[href]') || []) {
      try {
        const url = new URL(link.href);
        if (url.protocol === 'mailto:') contact.emails.push(decodeURIComponent(url.pathname));
        else if (url.protocol === 'tel:') contact.phones.push(decodeURIComponent(url.pathname));
        else if (['https:', 'http:'].includes(url.protocol) && !['instagram.com', 'www.instagram.com'].includes(url.hostname)) {
          const target = url.hostname === 'l.instagram.com' ? url.searchParams.get('u') : null;
          contact.links.push(target && /^https?:\/\//i.test(target) ? target : url.href);
        }
      } catch { /* Ignore malformed contact links. */ }
    }
    contact.emails.push(...(text.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []));
    contact.phones.push(...((bio || '').match(/\+?\d[\d ().-]{5,}\d/g) || []).filter(phone => {
      const digits = phone.replace(/\D/g, '').length;
      return digits >= 7 && digits <= 15;
    }));
    for (const key of Object.keys(contact)) contact[key] = [...new Set(contact[key])].filter(item => item.length <= 2000).slice(0, 100);
    return {platform: 'instagram', url: location.href, name, bio, followers: followers.value,
      following: following.value, followersText: followers.text, followingText: following.text, contact, visitedAt: new Date().toISOString()};
  }
  globalThis.sinProfileCapture = {capture, count};
})();
