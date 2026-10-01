import { matchTexts } from './matcher.js';
onmessage = ({data}) => {
  try { postMessage({ranges: matchTexts(data.texts, data.rules), profiles: data.profiles || [], profileRanges: matchTexts(data.texts, (data.profiles || []).map(p => ({value: p.name, mode: 'exact'})))}); }
  catch (error) { postMessage({error: error.message}); }
};
