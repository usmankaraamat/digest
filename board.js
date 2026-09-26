// Read-only view of the scheduled crawl. The local app is where anything gets done;
// this is for reading the queue with the computer off.
//
// Hide and Save are per phone, in localStorage, because a static page has nowhere else
// to write. Every read and write is guarded: storage throws in a private window and comes
// back empty after site data is cleared, and losing it costs little - the lead is still
// on the board until the sources stop listing it.
(() => {
  const $ = s => document.querySelector(s);
  const E = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };

  const store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { } }
  };
  const HIDDEN = 'digest.hidden', SAVED = 'digest.saved', TRACK = 'digest.track';
  const setOf = key => new Set(store.get(key, []));
  function toggle(key, url) {
    const s = setOf(key);
    s.has(url) ? s.delete(url) : s.add(url);
    store.set(key, [...s]);
    return s.has(url);
  }

  let TRACKS = [], WHO = null, DATA = null, SRC = '';

  // One colour per source, the same table as the local app, so a Freelancer.com lead and
  // a Bubble forum lead are told apart before the title is read.
  const SOURCE_HUES = {
    'n8n': 10, 'hacker news': 35, 'wordpress': 58, 'brave': 85, 'indie hackers': 125, 'weweb': 165,
    'freelancer.com': 205, 'linkedin': 228, 'bubble': 262, 'make ·': 292, 'agency': 322, 'reddit': 345, 'dev listings': 180,
    'ml scientist': 32, 'duooffer': 140, 'bluesky': 205, 'mastodon': 275,
    'himalayas': 160, 'remoteok': 350, 'arbeitnow': 50, 'working nomads': 105, 'we work remotely': 190, 'remotive': 232, 'jobicy': 295,
    'mustakbil': 100, 'rozee': 18
  };
  function sourceTag(name, tag) {
    const key = String(name || '').toLowerCase();
    const s = E(tag || 'span', String(name || 'Source').split(' · ')[0], 'src');
    let h = null;
    for (const k in SOURCE_HUES) if (key.includes(k)) { h = SOURCE_HUES[k]; break; }
    if (h === null && key && !key.includes('direct public url')) { h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0; h %= 360; }
    if (h === null) s.classList.add('src--plain'); else s.style.setProperty('--h', h);
    s.title = name || '';
    return s;
  }

  const tag = (lead, prefix) => ((lead.tags || []).find(t => t.indexOf(prefix) === 0) || '').slice(prefix.length);
  const has = (lead, t) => (lead.tags || []).includes(t);

  // Badges say where an answer came from, the same way the local app does: an
  // employer's own field and a phrase we matched are not the same quality of answer.
  function badges(lead) {
    const out = [];
    const fit = lead.fit || 'review';
    out.push([fit, fit === 'possible' ? 'good' : fit === 'reject' ? 'bad' : 'warn']);
    const where = tag(lead, 'where-');
    if (where) out.push([{ commutable: 'within reach', relocation: 'too far', unstated: 'place unstated' }[where] + (has(lead, 'place-stated') ? ' (stated)' : ''),
      where === 'commutable' ? 'good' : where === 'relocation' ? 'bad' : 'warn']);
    const pay = tag(lead, 'pay-');
    if (pay && pay !== 'unstated') out.push([{ above: 'pay clears floor', below: 'pay below floor', stated: 'pay stated', 'other-currency': 'pay, other currency', unusable: 'pay not readable' }[pay] || pay,
      pay === 'below' ? 'bad' : (pay === 'above' || pay === 'stated') ? 'good' : 'warn']);
    const reach = tag(lead, 'remote-');
    if (reach) out.push([{ open: 'hires worldwide', restricted: 'region-locked', unstated: 'region unstated' }[reach] + (has(lead, 'reach-stated') ? ' (stated)' : ''),
      reach === 'open' ? 'good' : reach === 'restricted' ? 'bad' : 'warn']);
    if (lead.scope) out.push([lead.scope.replace('-', ' '), lead.scope === 'weekend-sized' ? 'good' : lead.scope === 'oversized' ? 'bad' : 'warn']);
    if (typeof lead.competition === 'number') out.push([lead.competition + (lead.competition === 1 ? ' reply' : ' replies'), lead.competition <= 3 ? 'good' : lead.competition <= 20 ? 'warn' : 'bad']);
    if (has(lead, 'headline-only')) out.push(['headline only', 'warn']);
    return out;
  }

  function safeLink(url) {
    try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch (e) { return ''; }
  }

  function card(lead, hidden, saved) {
    const c = E('article', null, 'card' + (hidden ? ' dim' : ''));
    c.dataset.fit = lead.fit || 'review';
    const meta = E('div', null, 'meta');
    meta.append(sourceTag(lead.source));
    badges(lead).forEach(([text, tone]) => meta.append(E('span', text, 'chip ' + tone)));
    if (lead.published_at) meta.append(E('span', String(lead.published_at).slice(0, 10)));
    c.append(meta);

    const h = E('h2'), link = safeLink(lead.url);
    if (link) { const a = E('a', lead.title || 'Untitled'); a.href = link; a.target = '_blank'; a.rel = 'noopener'; h.append(a); }
    else h.textContent = lead.title || 'Untitled';
    c.append(h);
    if (lead.company) c.append(E('p', lead.company, 'org'));
    // The source's own words come first; the rules' verdict is behind "Why this verdict".
    const text = (lead.description || lead.excerpt || '').trim();
    if (text) {
      const d = E('p', text, 'desc');
      c.append(d);
      if (text.length > 280) {
        d.classList.add('folded');
        const more = E('button', 'Read more', 'more');
        more.onclick = () => { const f = d.classList.toggle('folded'); more.textContent = f ? 'Read more' : 'Show less'; };
        c.append(more);
      }
    }

    if ((lead.reasons || []).length || (lead.unknowns || []).length || lead.summary) {
      const why = E('details', null, 'why');
      why.append(E('summary', 'Why this verdict'));
      if (lead.summary) why.append(E('p', lead.summary, 'summary'));
      const ul = E('ul');
      (lead.reasons || []).forEach(r => ul.append(E('li', r)));
      (lead.unknowns || []).forEach(u => ul.append(E('li', 'Unknown: ' + u, 'unknown')));
      why.append(ul);
      c.append(why);
    }

    const acts = E('div', null, 'acts');
    if (link) { const open = E('a', 'Open'); open.href = link; open.target = '_blank'; open.rel = 'noopener'; acts.append(open); }
    const contact = safeLink(lead.contact_url);
    if (contact && contact !== link) { const a = E('a', 'Contact'); a.href = contact; a.target = '_blank'; a.rel = 'noopener noreferrer'; acts.append(a); }
    const save = E('button', saved ? 'Saved' : 'Save');
    save.setAttribute('aria-pressed', String(saved));
    save.onclick = () => { toggle(SAVED, lead.url); render(); };
    const hide = E('button', hidden ? 'Unhide' : 'Hide');
    hide.onclick = () => { toggle(HIDDEN, lead.url); render(); };
    acts.append(save, hide);
    c.append(acts);
    return c;
  }

  function render() {
    const list = $('#list');
    list.replaceChildren();
    if (!DATA) return;
    const hidden = setOf(HIDDEN), saved = setOf(SAVED);
    const showRejects = $('#showRejects').checked, showHidden = $('#showHidden').checked, savedOnly = $('#savedOnly').checked;
    const items = (DATA.items || []).filter(l => (!SRC || l.source === SRC) &&
      (showRejects || l.fit !== 'reject') && (showHidden || !hidden.has(l.url)) && (!savedOnly || saved.has(l.url)));
    $('#count').textContent = items.length + ' shown · ' + DATA.passing + ' passing rules · ' + DATA.count + ' collected';
    // Source chips: every source on this track with its count. Tap one to see only it.
    const per = {};
    (DATA.items || []).filter(l => showRejects || l.fit !== 'reject').forEach(l => { per[l.source] = (per[l.source] || 0) + 1; });
    const bar = $('#sources');
    bar.replaceChildren();
    Object.entries(per).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
      const b = sourceTag(k, 'button');
      b.append(E('span', String(v), 'n'));
      b.setAttribute('aria-pressed', String(SRC === k));
      b.onclick = () => { SRC = SRC === k ? '' : k; render(); };
      bar.append(b);
    });
    if (!items.length) list.append(E('div', DATA.count ? 'Nothing in this view. Try showing rejected or hidden leads.' : 'The last crawl found nothing for this track.', 'empty'));
    items.forEach(l => list.append(card(l, hidden.has(l.url), saved.has(l.url))));

    const notes = [...(DATA.error ? ['Track failed: ' + DATA.error] : []), ...(DATA.warnings || [])];
    $('#health').hidden = !notes.length;
    $('#warnings').replaceChildren(...notes.map(w => E('li', w)));
  }

  async function load(track) {
    WHO = track; SRC = '';
    store.set(TRACK, track);
    $('#tracks').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === track)));
    $('#count').textContent = 'Loading…';
    $('#list').replaceChildren();
    try {
      const r = await fetch('board-' + track + '.json', { cache: 'no-cache' });
      if (!r.ok) throw Error('board');
      DATA = await r.json();
    } catch (e) {
      DATA = null;
      $('#count').textContent = '';
      $('#list').append(E('div', 'Could not load this track. Try again shortly.', 'empty'));
      return;
    }
    render();
  }

  async function start() {
    try {
      const r = await fetch('tracks.json', { cache: 'no-cache' });
      const data = await r.json();
      TRACKS = data.tracks || [];
      if (data.checked_at) $('#checked').textContent = 'Checked ' + new Date(data.checked_at).toLocaleString();
    } catch (e) { TRACKS = []; }
    const nav = $('#tracks');
    nav.replaceChildren();
    TRACKS.forEach(t => {
      const b = E('button', t.label);
      b.dataset.id = t.id;
      b.append(E('span', String(t.passing), 'n'));
      b.onclick = () => load(t.id);
      nav.append(b);
    });
    if (!TRACKS.length) { $('#list').append(E('div', 'Could not load the board. Try again shortly.', 'empty')); return; }
    const remembered = store.get(TRACK, null);
    load(TRACKS.some(t => t.id === remembered) ? remembered : TRACKS[0].id);
  }

  ['#showRejects', '#showHidden', '#savedOnly'].forEach(s => $(s).addEventListener('change', render));
  start();
})();
