import { matchTexts } from './matcher.js';
onmessage = ({data}) => {
  try { postMessage({ranges: matchTexts(data.texts, data.rules)}); }
  catch (error) { postMessage({error: error.message}); }
};
