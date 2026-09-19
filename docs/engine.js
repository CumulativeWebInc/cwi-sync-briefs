/**
 * engine.js — deterministic sync-brief engine. Zero deps, Node + browser.
 *
 * The requester's text is ONLY token-matched against known track titles.
 * It is NEVER executed, interpolated, echoed, or embedded in the output.
 * Unknown tracks get an honest refusal card, never a fabricated brief.
 */
const IS_NODE = typeof process !== 'undefined' && !!(process.versions && process.versions.node);
// Top-level await in a module: the node: imports only evaluate under Node,
// so this same file runs unmodified in the browser demo.
const _fs = IS_NODE ? await import('node:fs') : null;
const _path = IS_NODE ? await import('node:path') : null;
const _url = IS_NODE ? await import('node:url') : null;
const DIR = IS_NODE ? _path.dirname(_url.fileURLToPath(import.meta.url)) : null;

let DATA = null;
function data() {
  if (!DATA) {
    if (!IS_NODE) throw new Error('engine: no data set — call setData() in the browser');
    DATA = JSON.parse(_fs.readFileSync(_path.join(DIR, 'briefs.json'), 'utf8'));
  }
  return DATA;
}
// Browser override point: demo sets ENGINE_DATA before first call.
export function setData(d) { DATA = d; }

function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Aliases: common ways a supervisor names a track → canonical title.
const ALIASES = {
  'diabolique': 'Diabolique (Louder)',
  'diabolique louder': 'Diabolique (Louder)',
  'zooted zone': 'Zooted Zone',
  'zooted': 'Zooted Zone',
  'shaka zulu': 'Shaka Zulu',
  'shaka': 'Shaka Zulu',
  'doves and diamonds': 'Doves & Diamonds',
  'warped and wicked': 'Warped & Wicked',
  'warped & wicked': 'Warped & Wicked',
  'golden diamond': 'Golden Diamond',
  'spirits n shadows': 'Spirits n Shadows',
  'spirits and shadows': 'Spirits n Shadows',
  'rainbows and roses': 'Rainbows And Roses',
  '7th angel': '7th Angel',
  'seventh angel': '7th Angel',
  'place i go to dream': 'Place I Go To Dream',
};

export function matchTrack(text) {
  const n = norm(text);
  if (!n) return null;
  // Longest-alias-first so "diabolique louder" wins over "diabolique".
  const keys = Object.keys(ALIASES).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (re.test(n)) return ALIASES[k];
  }
  // Fallback: exact normalized title match.
  for (const b of data().briefs) {
    if (norm(b.title) === n) return b.title;
  }
  return null;
}

export function getBrief(title) {
  const b = data().briefs.find(x => x.title === title);
  return b ? JSON.parse(JSON.stringify(b)) : null;
}

export function availableTracks() {
  return data().briefs.map(b => b.title);
}

/**
 * Chat-length render of the brief. Compact enough for Messenger (2000 chars).
 * The brief content comes ONLY from briefs.json — request text never enters it.
 */
export function renderChatBrief(brief) {
  const L = [];
  L.push(`SYNC BRIEF — "${brief.title}" / That Boy Hi Hat`);
  L.push(`Genre: ${brief.genre.value}`);
  L.push(brief.bpm.status === 'UNVERIFIED'
    ? 'BPM: UNVERIFIED (no measurement on record)'
    : `BPM: ~${brief.bpm.value} (third-party analysis, observed ${brief.bpm.observed_at})`);
  const an = brief.audio_numbers || {};
  if (an.key) L.push(`Key: ${an.key.value} ${an.mode ? an.mode.value : ''}`.trim());
  if (an.energy) L.push(`Energy ${an.energy.value} · Danceability ${an.danceability ? an.danceability.value : 'n/a'} · Valence ${an.valence ? an.valence.value : 'n/a'}`);
  const creds = brief.credits.map(c => `${c.role}: ${c.name}`).join('; ');
  if (creds) L.push(`Credits: ${creds}`);
  if (brief.placements.length) {
    L.push('Placements: ' + brief.placements.map(p =>
      `${p.playlist} (#${p.position}, ${p.status} — last verified ${p.observed_at})`).join('; '));
  }
  L.push(`Clearance: ${brief.clearance.status.toUpperCase()} — ${brief.clearance.meaning}`);
  L.push('Splits: UNVERIFIED — no splits data on record; shared only at rights-holder clearance.');
  L.push('PRO affiliation: UNVERIFIED — none on record.');
  L.push('Moods / scene use / instrumentation: UNVERIFIED — pending human annotation, never machine-inferred.');
  L.push(`Full brief + evidence: ${brief.one_sheet_url}`);
  L.push(`Sync contact: ${brief.contact.value} (Cumulative Web Inc)`);
  const out = L.join('\n');
  return out.length > 1900 ? out.slice(0, 1897) + '…' : out;
}

export function refusalCard() {
  return 'I couldn\'t match that to a catalog track with a sync brief. ' +
    'Tracks with briefs: ' + availableTracks().join(', ') + '. ' +
    'Note: only 9 of 24 catalog tracks have published cue sheets so far.';
}

/**
 * resolve(text) — the single entry point the webhook and demo use.
 * Returns { kind: 'brief'|'refusal', title?, brief?, text }.
 */
export function resolve(text) {
  const title = matchTrack(text);
  if (!title) return { kind: 'refusal', text: refusalCard() };
  const brief = getBrief(title);
  if (!brief) return { kind: 'refusal', text: refusalCard() };
  return { kind: 'brief', title, brief, text: renderChatBrief(brief) };
}
