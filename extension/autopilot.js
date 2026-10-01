export const AUTOPILOT_ALARM = 'autopilot-next';
const KEY = 'autopilot';
const idle = {running: false, tabId: null, name: '', index: -1};

// Session storage survives service-worker suspension without restarting a demo
// when the user opens a new browser session. Serialize timer and popup actions.
export function createAutopilot({chrome, readNames}) {
  let pending = Promise.resolve();
  const state = async () => (await chrome.storage.session.get(KEY))[KEY] || {...idle};
  const save = async value => { await chrome.storage.session.set({[KEY]: value}); return value; };
  async function stop(error = '') {
    await chrome.alarms.clear(AUTOPILOT_ALARM);
    return save({...idle, error});
  }
  async function advance(start = false) {
    const previous = await state();
    if (!start && !previous.running) return previous;
    if (start && previous.running) return previous;
    try {
      const names = await readNames();
      if (!names.length) throw new Error('The entertainer list is empty.');
      const index = start ? 0 : (previous.index + 1) % names.length;
      const name = names[index];
      const url = `https://www.google.com/search?${new URLSearchParams({q: name})}`;
      if (start) await chrome.storage.local.set({enabled: true, includeNames: true});
      const tab = start ? await chrome.tabs.create({url, active: true}) : await chrome.tabs.update(previous.tabId, {url});
      const current = await save({running: true, tabId: tab.id, name, index, error: ''});
      await chrome.alarms.create(AUTOPILOT_ALARM, {delayInMinutes: 0.5});
      return current;
    } catch (error) {
      return stop(`Autopilot stopped: ${error.message}`);
    }
  }
  return function dispatch(action, tabId) {
    const run = async () => {
      if (action === 'start') return advance(true);
      if (action === 'next') return advance();
      if (action === 'stop') return stop();
      if (action === 'removed' && (await state()).tabId === tabId) return stop();
      return state();
    };
    const result = pending.then(run);
    pending = result.catch(() => {});
    return result;
  };
}
