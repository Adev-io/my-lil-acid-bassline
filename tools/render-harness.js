// Offline render helper for Playwright browser_evaluate. Paste the whole file as the evaluate body; it defines window.__h.
// It renders notes through the REAL graph (buildGraph/play) into an OfflineAudioContext, then restores the live page.
// Top-level `let` bindings of index.html are reachable from here because evaluate runs in the page's global scope.
(() => {
  const SR = 44100;
  const GLOBALS = ['ctx', 'osc', 'f1', 'f2', 'vca', 'master', 'dry', 'wet', 'dFx', 'drFx', 'rvFx', 'hpF', 'pwG', 'pwDly', 'pwLfo', 'pwLfoG', 'keyMul', 'lastFreq', 'sweep'];
  const get = (n) => { try { return (0, eval)(n); } catch (_) { return undefined; } };
  // indirect eval assigns the global `let` binding; the value travels through window.__v
  const put = (n, v) => { try { window.__v = v; (0, eval)(n + ' = window.__v'); } catch (_) { /* absent in older builds */ } finally { delete window.__v; } };
  // knobs: overrides for S.knobs; opts: { wave, drive:{on,type}, reverb:{on}, delay:{pp,fat,sync}, notes:[{midi,t,accent,slide...}], secs }
  window.__h = {
    async render({ knobs = {}, wave = 'saw', drive, reverb, delay, notes, secs = 2, gate = 0.125 }) {
      const keep = {}; for (const n of GLOBALS) keep[n] = get(n);
      const S0 = JSON.stringify(get('S'));
      try {
        const St = get('S');
        Object.assign(St.knobs, knobs); St.wave = wave;
        if (drive) Object.assign(St.drive, drive);
        if (reverb) Object.assign(St.reverb, reverb);
        if (delay) Object.assign(St.delay, delay);
        const oc = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
        get('buildGraph')(oc);
        const play = get('play');
        for (const n of notes) play({ off: false, trig: n.trig !== false, glide: !!n.glide, midi: n.midi, accent: !!n.accent, hold: !!n.hold, len: 0.55 }, n.t, gate);
        const buf = await oc.startRendering();
        return { L: Array.from(buf.getChannelData(0)), R: Array.from(buf.getChannelData(1)) };
      } finally {
        put('S', get('T').cleanState(JSON.parse(S0)));
        for (const n of GLOBALS) if (keep[n] !== undefined) put(n, keep[n]);
      }
    },
    rms: (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); },
    peak: (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0),
    // share of energy in the high band: sum of squared first differences over sum of squares (rises with brightness)
    bright: (x, a = 0, b = x.length) => { let d = 0, e = 1e-12; for (let i = a + 1; i < b; i++) { d += (x[i] - x[i - 1]) ** 2; e += x[i] ** 2; } return d / e; },
    duty: (x, a = 0, b = x.length) => { let p = 0; for (let i = a; i < b; i++) if (x[i] > 0) p++; return p / (b - a); },
    corr: (x, y) => { let xy = 0, xx = 1e-12, yy = 1e-12; for (let i = 0; i < x.length; i++) { xy += x[i] * y[i]; xx += x[i] * x[i]; yy += y[i] * y[i]; } return xy / Math.sqrt(xx * yy); },
    sr: SR,
  };
  return 'harness ready';
})();
