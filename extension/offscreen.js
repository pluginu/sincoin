chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.target !== 'offscreen') return;
  const worker = new Worker('worker.js', {type: 'module'});
  const finish = result => { clearTimeout(timer); worker.terminate(); reply(result); };
  const timer = setTimeout(() => finish({error: 'Matching timed out. Simplify or disable complex regex rules.'}), 1500);
  worker.onmessage = event => finish(event.data);
  worker.onerror = () => finish({error: 'Unable to run matching rules.'});
  worker.postMessage({texts: message.texts, rules: message.rules, profiles: message.profiles});
  return true;
});
