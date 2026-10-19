// ui-bridge.js — inside the VST3 this page is only the face: the plugin makes the sound, and this file carries values
// both ways by parameter id. In a browser or Electron there is no window.__JUCE__ and the file does nothing.
// Author: Ari Klopfer / A_Development · MIT
'use strict';
(function () {
  const T = window.TB303;
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  // Web knobs whose plugin parameter is in real units. Every other knob is 0..1 on both sides.
  const REAL = {
    tuning: { id: 'tuning', to: (v) => T.tuneCents(v), from: (c) => c / 200 + 0.5 },
    cutoff: { id: 'cutoff', to: (v) => T.cutoffHz(v), from: (hz) => Math.log2(Math.max(hz, 60) / 60) / 6.5 },
    fdec: { id: 'decay', to: (v) => T.decSec(v), from: (s) => Math.log(Math.max(s, 0.03) / 0.03) / Math.log(83) },
  };
  // Web knobs the plugin has no parameter for (tempo comes from the host); the page hides them inside the plugin.
  const NONE = ['tempo'];
  const idOf = (key) => (REAL[key] ? REAL[key].id : key);
  const toPlugin = (key, v) => (REAL[key] ? REAL[key].to(v) : v);
  const fromPlugin = (key, x) => clamp01(REAL[key] ? REAL[key].from(x) : x);
  // The page's natural size in the plugin (16 steps showing; 32 steps need about 1020 high and scroll). A smaller window scales the page down to fit, never up.
  const NAT_W = 805, NAT_H = 960;
  const fitZoom = (w, h) => Math.min(1, Math.max(0.3, Math.min(w / NAT_W, h / NAT_H)));
  window.PluginMap = { NONE, idOf, toPlugin, fromPlugin, fitZoom };

  if (!window.__JUCE__) return;   // not inside the plugin

  // ---- hide what the plugin has no job for, and keep the page silent ----
  document.body.classList.add('plug');
  const st = document.createElement('style');
  st.textContent = '.plug .seq,.plug #midiBtn,.plug #midiIn,.plug #midiMsg,.plug #autoBtn,.plug #dFat,.plug #dSync,.plug .envc,'
    + '.plug .sect:has(#gBank),.plug #run,.plug #mode,.plug .sect:has(#song)>.t,.plug #song,.plug #sAdd,.plug #sClr,'
    + '.plug div:has(>#io),.plug .grp:has(#sync),.plug .grp:has(#dMs),.plug .kw.nop{display:none!important}';
  document.head.append(st);
  const fit = () => { document.body.style.zoom = fitZoom(innerWidth, innerHeight); };
  fit(); addEventListener('resize', fit);
  window.ensureAudio = () => {};   // the plugin makes the sound; the page never opens an audio context
  window.play = () => {};   // on-screen keys write steps; without an audio context the voice code would throw
  // A key press in the page reads ctx.currentTime before it writes the step, so in the plugin it only writes the step.
  window.noteOn = (n) => { if (rec) { cursor = T.writeNote(S.patterns[S.cur], cursor, n, mods); paintSteps(); save(); } };
  // The typing keys play notes in the web page; here they would throw (no audio context) and FL owns the keyboard anyway.
  for (const type of ['keydown', 'keyup'])
    addEventListener(type, (e) => { if (!(e.target.classList && e.target.classList.contains('knob'))) e.stopImmediatePropagation(); }, true);

  const keys = Object.keys(knobUI).filter((k) => !NONE.includes(k));
  const byId = {}; for (const k of keys) byId[idOf(k)] = k;
  for (const k of NONE) if (knobUI[k]) knobUI[k].el.parentElement.classList.add('nop');
  const DRIVE = ['soft', 'tube', 'wavefold'];
  // Controls that are not 0..1 knobs: plugin id -> [read from the page state, write into it].
  const SW = {
    wave: [() => (S.wave === 'square' ? 1 : 0), (x) => setWave(x > 0.5 ? 'square' : 'saw')],
    dron: [() => (S.drive.on ? 1 : 0), (x) => { S.drive.on = x > 0.5; paintDrive(); }],
    drtype: [() => Math.max(0, DRIVE.indexOf(S.drive.type)), (x) => { S.drive.type = DRIVE[Math.round(x)] || 'soft'; paintDrive(); }],
    swing: [() => S.swing, (x) => { S.swing = x; $('swing').value = Math.round(x * 100); }],
    seqon: [() => (seqOn ? 1 : 0), (x) => { seqOn = x > 0.5; paintSeq(); }],
    rvon: [() => (S.reverb.on ? 1 : 0), (x) => { S.reverb.on = x > 0.5; paintReverb(); }],
    dpp: [() => (S.delay.pp ? 1 : 0), (x) => { S.delay.pp = x > 0.5; paintDelay(); }],
  };
  // Seq switch: the first .sect holds the wave and swing controls.
  let seqOn = false;
  const seqBtn = document.createElement('button');
  seqBtn.className = 'btn'; seqBtn.id = 'seqOn'; seqBtn.textContent = 'Seq'; seqBtn.setAttribute('aria-pressed', 'false');
  seqBtn.title = 'play the step pattern in time with the host tempo and position';
  document.querySelector('.sect').append(seqBtn);
  const paintSeq = () => { seqBtn.classList.toggle('on', seqOn); seqBtn.setAttribute('aria-pressed', String(seqOn)); };
  seqBtn.onclick = () => { seqOn = !seqOn; paintSeq(); };
  const read = (id) => (SW[id] ? SW[id][0]() : toPlugin(byId[id], S.knobs[byId[id]]));
  const ids = [...Object.keys(byId), ...Object.keys(SW)];

  import('./juce-frontend.js').then(() => {
    const backend = window.__JUCE__.backend, last = {}, active = new Set();
    const poll = () => {
      for (const id of ids) {
        const v = read(id);
        if (Math.abs(v - last[id]) > 1e-6) { last[id] = v; backend.emitEvent('set', { id, v }); }
      }
    };
    backend.addEventListener('params', (m) => {
      for (const [id, x] of Object.entries(m)) {
        if (SW[id]) SW[id][1](x);
        else if (byId[id]) { S.knobs[byId[id]] = fromPlugin(byId[id], x); paintKnob(byId[id]); }
        else continue;
        last[id] = read(id);   // what the page now holds, so the poll does not send it straight back
      }
    });
    // Drags: tell the host where a move starts and ends so it records one gesture.
    document.addEventListener('pointerdown', (e) => {
      const k = keys.find((key) => knobUI[key].el === e.target);
      if (k) { active.add(idOf(k)); backend.emitEvent('gesture', { id: idOf(k), on: true }); }
    }, true);
    const release = () => { poll(); for (const id of active) backend.emitEvent('gesture', { id, on: false }); active.clear(); };
    document.addEventListener('pointerup', release, true); document.addEventListener('pointercancel', release, true);

    // The pattern lives in the plugin (saved with the project): ship edits out, take the plugin's copy in.
    const patJson = () => JSON.stringify(S.patterns[S.cur]);
    let lastPat = patJson();
    const pollPattern = () => { const j = patJson(); if (j !== lastPat) { lastPat = j; backend.emitEvent('pattern', { json: j }); } };
    backend.addEventListener('pattern', (m) => {
      S.patterns[S.cur] = T.cleanPattern(JSON.parse(m.json));
      cursor = Math.min(cursor, S.patterns[S.cur].len - 1);
      lastPat = patJson();   // already the plugin's, so do not echo it back
      paintSteps();
    });
    // The playing step: the page's own LED logic needs run.on and an audio clock, so draw it after every paint.
    let hostStep = -1;
    const paint0 = paintSteps;
    window.paintSteps = () => { paint0(); cells.forEach((x, i) => x.led.classList.toggle('on', i === hostStep)); };
    backend.addEventListener('step', (m) => { hostStep = m.i; playing = m.i; paintSteps(); });
    S.delay.fat = false; S.delay.sync = false; paintDelay();   // phase 2 in the plugin
    for (const id of ids) last[id] = read(id);   // nothing is sent until the host has told the page its values
    setInterval(() => { poll(); pollPattern(); }, 30);
    for (const b of ['envBtn', 'twBtn', 'drBtn', 'rvBtn', 'fxBtn']) $(b).click();   // show the sound panels
    backend.emitEvent('ready', {});
  });
})();
