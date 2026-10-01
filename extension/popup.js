import { compileRule } from './matcher.js';
const $ = id => document.getElementById(id);
const hints = {exact: 'Matches a whole word or phrase: “Ann” will not match “Anna”.', contains: 'Matches anywhere in text: “ann” also matches “Joanna”.', starts: 'Matches at the start of a word: “Ang” matches the Ang in Angela.', ends: 'Matches at the end of a word: “ley” matches the ley in Riley.', regex: 'JavaScript expression, without / delimiters. Example: Angela\\s+White. Global + Unicode flags are automatic.'};
let settings, editing = null;
const platformLabels = {google: 'Google', x: 'X', instagram: 'Instagram'};
function describeAutopilot() {
  $('autopilotDescription').textContent = {
    google: 'Search names and scroll through up to 3 result pages per name, advancing every 30 seconds.',
    x: 'Search each name on X and scroll the results for 30 seconds before moving to the next name.',
    instagram: 'Search each name, visit up to 5 user results, and open up to 2 posts per profile for 6 seconds each. Private or empty profiles are skipped. Sign in to Instagram first.'
  }[$('autopilotPlatform').value];
}
$('autopilotPlatform').onchange = async () => {
  describeAutopilot();
  try { await chrome.storage.local.set({autopilotPlatform: $('autopilotPlatform').value}); }
  catch (error) { $('autopilotStatus').textContent = error.message; }
};
function renderAutopilot(state) {
  if (state.running) $('autopilotPlatform').value = state.platform || 'google';
  $('autopilotPlatform').disabled = !!state.running;
  describeAutopilot();
  $('autopilot').checked = !!state.running;
  const progress = state.instagramProgress;
  const browsing = progress?.profiles?.length ? ` · profile ${Math.min(progress.profileIndex + 1, progress.profiles.length)}/${progress.profiles.length}${['post', 'viewing', 'return-profile'].includes(progress.phase) ? ` · post ${(progress.postIndex || 0) + 1}/${progress.posts?.length || 0}` : ''}` : '';
  $('autopilotStatus').textContent = state.error || (state.running && state.awaitingSearch ? `Waiting for Instagram Search: ${state.name} · sign in if prompted` : state.running ? `Now browsing ${platformLabels[state.platform || 'google']}: ${state.name}${browsing}${(!state.platform || state.platform === 'google') ? ` · page ${state.page || 1}` : ''}` : 'Autopilot is off');
}
$('autopilot').onchange = async () => {
  $('autopilot').disabled = true;
  $('autopilotPlatform').disabled = true;
  try {
    renderAutopilot(await chrome.runtime.sendMessage({type: 'autopilot', action: $('autopilot').checked ? 'start' : 'stop', platform: $('autopilotPlatform').value}));
    const response = await chrome.runtime.sendMessage({type: 'config'});
    if (response.error) throw new Error(response.error);
    settings = response.settings; render(); await refreshStatus();
  } catch (error) { $('autopilotStatus').textContent = error.message; }
  finally { $('autopilot').disabled = false; $('autopilotPlatform').disabled = $('autopilot').checked; }
};
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.autopilot) renderAutopilot(changes.autopilot.newValue || {});
  if (area === 'local' && settings) {
    for (const key of ['enabled', 'includeNames', 'rules']) if (changes[key]) settings[key] = changes[key].newValue;
    render();
  }
});
function fail(error) { $('error').textContent = error.message; }
async function persist() { await chrome.storage.local.set(settings); render(); await refreshStatus(); }
function reset() { editing = null; $('ruleForm').reset(); $('formTitle').textContent = 'Add a rule'; $('save').textContent = 'Add rule'; $('cancel').hidden = true; $('error').textContent = ''; hint(); }
function hint() { $('hint').textContent = hints[$('mode').value]; }
function render() {
  $('enabled').checked = settings.enabled;
  $('includeNames').checked = settings.includeNames;
  $('ruleCount').textContent = settings.rules.length;
  $('empty').hidden = settings.rules.length > 0;
  $('rules').replaceChildren();
  for (const rule of settings.rules) {
    const row = document.createElement('div'); row.className = 'rule';
    const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = rule.enabled !== false; toggle.setAttribute('aria-label', `Enable ${rule.value}`);
    toggle.onchange = () => { rule.enabled = toggle.checked; persist().catch(fail); };
    const text = document.createElement('div'); text.className = 'text';
    const title = document.createElement('strong'); title.textContent = rule.value;
    const subtitle = document.createElement('small'); subtitle.textContent = `${rule.mode}${rule.caseSensitive ? ' · case sensitive' : ''}`;
    text.append(title, subtitle);
    const edit = document.createElement('button'); edit.textContent = 'Edit'; edit.onclick = () => { editing = rule.id; $('value').value = rule.value; $('mode').value = rule.mode; $('caseSensitive').checked = !!rule.caseSensitive; $('formTitle').textContent = 'Edit rule'; $('save').textContent = 'Save rule'; $('cancel').hidden = false; hint(); $('value').focus(); };
    const remove = document.createElement('button'); remove.textContent = 'Delete'; remove.setAttribute('aria-label', `Delete ${rule.value}`); remove.onclick = () => { settings.rules = settings.rules.filter(r => r.id !== rule.id); if (editing === rule.id) reset(); persist().catch(fail); };
    row.append(toggle, text, edit, remove); $('rules').append(row);
  }
}
async function refreshStatus() {
  if (!settings.enabled) { $('status').textContent = 'Highlighting is off'; $('detail').textContent = 'Switch on to highlight names and keywords.'; return; }
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    const result = await chrome.tabs.sendMessage(tab.id, {type: 'status'}, {frameId: 0});
    $('status').textContent = `${result.count} highlights on this page`;
    $('detail').textContent = result.message;
  } catch { $('status').textContent = 'Ready to highlight'; $('detail').textContent = 'Refresh existing tabs. Chrome internal pages, the Web Store, and PDFs are not supported.'; }
}
$('mode').onchange = hint;
$('cancel').onclick = reset;
$('enabled').onchange = () => { settings.enabled = $('enabled').checked; persist().catch(fail); };
$('includeNames').onchange = () => { settings.includeNames = $('includeNames').checked; persist().catch(fail); };
$('ruleForm').onsubmit = async event => {
  event.preventDefault();
  try {
    const rule = {id: editing || crypto.randomUUID(), value: $('value').value.trim(), mode: $('mode').value, caseSensitive: $('caseSensitive').checked, enabled: editing ? settings.rules.find(r => r.id === editing).enabled : true};
    compileRule(rule);
    if (!editing && settings.rules.length >= 100) throw new Error('You can save up to 100 custom rules.');
    if (editing) settings.rules = settings.rules.map(r => r.id === editing ? rule : r);
    else settings.rules.push(rule);
    await persist(); reset();
  } catch (error) { fail(error); }
};
try {
  const response = await chrome.runtime.sendMessage({type: 'config'});
  if (response.error) throw new Error(response.error);
  settings = response.settings; $('nameCount').textContent = `${response.names.length} names`;
  render(); hint(); await refreshStatus(); setInterval(refreshStatus, 1200);
  const {autopilotPlatform} = await chrome.storage.local.get('autopilotPlatform');
  $('autopilotPlatform').value = platformLabels[autopilotPlatform] ? autopilotPlatform : 'google';
  renderAutopilot(await chrome.runtime.sendMessage({type: 'autopilot', action: 'status'}));
  $('autopilot').disabled = false;
} catch (error) { fail(error); }
