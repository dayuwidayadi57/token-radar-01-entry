// Token Radar dashboard (radar-4). It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table,
// a per-protocol detail view with the model's own inputs and the protocol's
// costed farm plan and verdict, and a model sandbox. No network: every byte
// it shows is in data.js, and every farm plan shown is the exact string
// board.json holds.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = {
    q: '', category: 'all', chain: 'all', watchOnly: false, minTvl: 0,
    tab: 'pre-token', sort: 'implied', dir: -1, selected: null,
    baseScale: 1, growthScale: 1, sandboxOn: false
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtUsd2(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var sign = n < 0 ? '-' : '';
    var v = Math.abs(n);
    if (v >= 100) return sign + '$' + Math.round(v).toLocaleString('en-US');
    return sign + '$' + v.toFixed(2);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // impliedValue: the same arithmetic main.ts scores with, in one function.
  // The page recomputes a row from the fitted components and checks the
  // number board.json carries, so page code and board data visibly agree.
  // The sandbox only scales the fitted value and the growth coefficient;
  // the board's ranking always uses the defaults, and the page says so.
  //   log10(implied) = slope x log10(TVL) + category level
  //                    + growth coefficient x growth value
  function impliedOf(row, opts) {
    var coef = row.growth_coef * (opts && opts.growthScale !== undefined ? opts.growthScale : 1);
    var logVal = row.slope * Math.log10(row.tvl_usd) + row.category_level + coef * row.growth_value;
    var base = Math.pow(10, logVal) * (opts && opts.baseScale !== undefined ? opts.baseScale : 1);
    return Math.max(1, Math.round(base));
  }
  function shownImplied(row) {
    return state.sandboxOn ? impliedOf(row, { baseScale: state.baseScale, growthScale: state.growthScale }) : row.implied_value_usd;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The watchlist set, for the "watchlist only" filter and the row badges.
  var watchSet = new Set();
  (DATA.watchlist_slugs || []).forEach(function (s) { watchSet.add(s); });

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('watch') === '1') state.watchOnly = true;
    if (params.get('sort')) state.sort = params.get('sort');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchOnly) params.set('watch', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.watchOnly && !watchSet.has(r.slug)) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' '), r.farm.verdict].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'verdict') { av = a.farm.net_usd; bv = b.farm.net_usd; }
      else { av = shownImplied(a); bv = shownImplied(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var top10 = DATA.rows.slice(0, 10).reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var vc = DATA.model.verdict_counts;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', null, 'The watchlist is the floor: every protocol with at least ', el('b', { text: '$' + Math.round(DATA.floor_usd / 1e6) + 'M' }), ' of TVL and no token on record. The early radar adds ', el('b', { text: String(DATA.early_size) }), ' pre-token protocols below that floor, ranked by the same fitted model. Implied value is a model, not a promise — and never a prediction that a token launches.')
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Protocols accounted for' }), el('b', { text: String(DATA.accounting.total) + ' of ' + String(DATA.accounting.total) })),
        el('div', { class: 'fact' }, el('span', { text: 'Farm verdicts' }), el('b', { text: vc.FARM + ' FARM · ' + vc.THIN + ' THIN · ' + vc.SKIP + ' SKIP' })),
        el('div', { class: 'fact' }, el('span', { text: 'Top 10 implied value' }), el('b', { text: fmtUsd(top10) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      ),
      el('p', { class: 'accounting', text: 'All ' + DATA.accounting.total + ' protocols in the snapshot are accounted for: ' + DATA.accounting.ranked + ' ranked on this board, ' + DATA.accounting.live_fitted + ' live tokens fitted by the model (' + DATA.accounting.live_shown + ' shown), ' + DATA.accounting.live_unfitted + ' live tokens the fit cannot use (no positive market cap or TVL), and ' + (DATA.accounting.excluded_category + DATA.accounting.excluded_name) + ' pre-token protocols excluded by the house rule (' + DATA.accounting.excluded_category + ' by category, ' + DATA.accounting.excluded_name + ' by name).' })
    );
  }

  function spotlight() {
    var cards = DATA.rows.slice(0, 5).map(function (r) {
      return el('button', { type: 'button', class: 'spot-card', onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'rank', text: '#' + r.rank + ' · ' + (r.category || 'Other') }),
        el('b', { text: r.name }),
        el('span', { class: 'val', text: fmtUsd(r.implied_value_usd) }),
        el('span', { class: 'meta', text: fmtUsd(r.tvl_usd) + ' TVL · ' + fmtPct(r.change_7d) + ' 7d' }),
        el('span', { class: 'verdict ' + r.farm.verdict.toLowerCase(), text: r.farm.verdict + ' · net ' + fmtUsd2(r.farm.net_usd) })
      );
    });
    return el('section', { class: 'spot', 'aria-label': 'Top 5 by implied value' }, cards);
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search the board', value: state.q, 'aria-label': 'Search the board by name, category or chain' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var tvlSel = el('select', { id: 'mintvl', 'aria-label': 'Minimum TVL' },
      [0, 5e7, 1e8, 5e8, 1e9].map(function (v) {
        return el('option', { value: String(v), text: v === 0 ? 'Any TVL' : 'TVL ≥ ' + fmtUsd(v), selected: v === state.minTvl ? 'selected' : null });
      })
    );
    tvlSel.addEventListener('change', function () { state.minTvl = Number(tvlSel.value); render(); });
    var watch = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.watchOnly ? 'checked' : null, onchange: function (e) { state.watchOnly = e.target.checked; writeHash(); render(); } }),
      'Watchlist only'
    );
    var sortSel = el('select', { id: 'sort', 'aria-label': 'Sort the board' },
      [['implied', 'Sort: implied value'], ['tvl', 'Sort: TVL'], ['growth', 'Sort: 7d growth'], ['age', 'Sort: age'], ['verdict', 'Sort: farm net'], ['name', 'Sort: name']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: o[0] === state.sort ? 'selected' : null });
      })
    );
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { for: 'mintvl', text: 'Size' }), tvlSel),
      el('div', { class: 'field' }, el('label', { text: 'Scope' }), watch),
      el('div', { class: 'field' }, el('label', { for: 'sort', text: 'Order' }), sortSel),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false; state.minTvl = 0; writeHash(); render(); } })
      ));
    }
    var max = Math.max.apply(null, list.map(function (r) { return shownImplied(r); })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var rankRange = r.rank_low !== r.rank_high ? 'range #' + r.rank_low + '–' + r.rank_high : 'rank holds';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, el('div', { class: 'rank-cell' }, el('b', { text: String(r.rank) }), el('span', { class: 'sub', text: rankRange }))),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (watchSet.has(r.slug) ? ' · watchlist' : '') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((shownImplied(r) / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(shownImplied(r)) }),
          el('span', { class: 'sub', text: 'P10–P90 ' + fmtUsd(r.implied_p10_usd) + '–' + fmtUsd(r.implied_p90_usd) })
        )),
        el('td', null, el('span', { class: 'verdict ' + r.farm.verdict.toLowerCase(), text: r.farm.verdict })),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: state.sandboxOn ? 'Sandbox values shown: the board ranking in board.json uses the default model.' : 'Pre-token protocols, strongest implied value first. The band under each value is the 200-refit P10–P90 range; the verdict is the farm plan netted to a dollar. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('verdict', 'Verdict'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and they are the comparables the value model is fitted on.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var mults = Object.keys(DATA.category_multiple).sort().map(function (k) {
      return el('div', null, el('span', { text: k }), el('b', { text: 'x' + DATA.category_multiple[k] }));
    });
    mults.push(el('div', null, el('span', { text: 'Other / unlisted' }), el('b', { text: 'x' + DATA.default_multiple })));
    var tests = m.term_tests.map(function (t) {
      var line = t.term + ': ' + (t.kept ? 'KEPT, coefficient ' + t.coefficient : 'dropped') +
        ' — blind test x' + t.loo_x_factor + ' vs base x' + t.base_loo_x_factor;
      return el('div', null, el('b', { text: t.kept ? 'kept' : 'dropped', class: t.kept ? 'pos' : 'neg' }), el('span', { text: ' ' + line }));
    });
    var baseRange = el('input', { type: 'range', min: '0.5', max: '2', step: '0.1', value: String(state.baseScale), 'aria-label': 'Base multiple scale' });
    var baseOut = el('output', { text: 'x' + state.baseScale.toFixed(1) });
    baseRange.addEventListener('input', function () { state.baseScale = Number(baseRange.value); state.sandboxOn = true; baseOut.textContent = 'x' + state.baseScale.toFixed(1); render(); });
    var gwRange = el('input', { type: 'range', min: '0', max: '2', step: '0.1', value: String(state.growthScale), 'aria-label': 'Growth coefficient scale' });
    var gwOut = el('output', { text: 'x' + state.growthScale.toFixed(1) });
    gwRange.addEventListener('input', function () { state.growthScale = Number(gwRange.value); state.sandboxOn = true; gwOut.textContent = 'x' + state.growthScale.toFixed(1); render(); });
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset to board defaults', onclick: function () { state.baseScale = 1; state.growthScale = 1; state.sandboxOn = false; render(); } });
    var vc = m.verdict_counts;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function fitted from the snapshot\'s own live tokens. No protocol name is special-cased, and no row is hand-picked. The snapshot carries market cap, not fully-diluted value, so every multiple below is honestly a market-cap multiple.' }),
      el('div', { class: 'formula' },
        'log10(implied) = ', el('b', { text: String(m.slope) }), ' x log10(TVL) + ', el('b', { text: 'category level' }), ' + ', el('b', { text: String(m.kept_terms.growth !== undefined ? m.kept_terms.growth : 0) }), ' x growth'
      ),
      el('p', { class: 'sub', text: 'The size curve is a Theil-Sen robust fit on ' + m.live_count + ' live tokens (log10 market cap on log10 TVL, slope ' + m.slope + '). Each category level is the median of its live tokens, shrunk toward the global level so a thin category cannot swing on one token. The multiples below are the fitted market-cap multiple at $100M TVL, so categories compare on one size.' }),
      el('div', { class: 'mult-table' }, mults),
      el('h3', { text: 'The blind test — what the model keeps, and what it drops' }),
      el('p', { class: 'sub', text: 'Leave-one-out: each live token is held out, the whole model refit without it, and the held-out market cap predicted. The selected model\'s miss is a median absolute log-error of ' + m.loo_median_abs_log_err + ' — the median prediction is x' + m.loo_x_factor + ' off. A term is kept only when it improves that blind miss by at least 1%; a smaller gain is noise.' }),
      el('div', { class: 'mult-table' }, tests),
      el('p', { class: 'sub', text: 'Growth is a contrary signal in this snapshot: its fitted coefficient is ' + (m.kept_terms.growth !== undefined ? m.kept_terms.growth : 0) + ', so the fastest TVL growers are discounted, not rewarded — the live tokens show that fast growth has not yet been priced into market cap. Maturity and breadth were tested the same way and dropped: neither improves the blind test once growth is in.' }),
      el('h3', { text: 'Farm economics — every plan netted to a verdict' }),
      el('p', { class: 'sub', text: 'Each row\'s plan costs setup gas + weekly gas x hold weeks + claim gas, against an expected airdrop of ' + Math.round(m.airdrop_pool_pct * 100) + '% of implied value shared pro-rata by deposit over TVL. Deposits run $250–$1,250 by TVL band: at retail $50–$250 deposits 89% of rows landed SKIP, so the plan sizes up to the smallest band where the verdicts separate. Capital is locked, not spent, so it is shown and never subtracted. Verdicts across the board: ' + vc.FARM + ' FARM (net ≥ $2), ' + vc.THIN + ' THIN (within $2 of break-even), ' + vc.SKIP + ' SKIP (net below −$2).' }),
      el('p', { class: 'sub', text: 'Uncertainty: ' + m.bootstrap_refits + ' bootstrap refits of the live set give every row a P10–P90 band and a rank range. The bands are wide — the blind miss is x' + m.loo_x_factor + ' — so a row\'s rank is a range, not a point.' }),
      el('div', { class: 'sandbox' },
        el('h3', { text: 'Model sandbox — what if?' }),
        el('p', { class: 'sub', text: 'Move a slider and the board recomputes live. This changes only what you see here; board.json and the ranking always use the defaults above.' }),
        el('div', { class: 'row' }, el('label', { text: 'Fitted value scale' }), baseRange, baseOut),
        el('div', { class: 'row' }, el('label', { text: 'Growth coefficient scale' }), gwRange, gwOut),
        el('div', { class: 'row' }, reset, state.sandboxOn ? el('span', { class: 'badge', text: 'SANDBOX ACTIVE' }) : null)
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = row.farm_steps || [];
    var recomputed = impliedOf(row, {});
    var sandboxVal = state.sandboxOn ? impliedOf(row, { baseScale: state.baseScale, growthScale: state.growthScale }) : null;
    var f = row.farm;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · rank range #' + row.rank_low + '–' + row.rank_high + (watchSet.has(row.slug) ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · listed ' + (row.listed_at || 'date unknown') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Fitted market-cap multiple (at this TVL)' }), el('b', { text: 'x' + row.fitted_multiple })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { text: fmtPct(row.change_7d) + ' → x' + row.growth_multiplier })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'P10–P90 band (200 refits)' }), el('b', { text: fmtUsd(row.implied_p10_usd) + ' – ' + fmtUsd(row.implied_p90_usd) })),
        el('div', null, el('span', { text: 'Rank range across refits' }), el('b', { text: '#' + row.rank_low + ' – #' + row.rank_high }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + (sandboxVal !== null ? ' Sandbox value: ' + fmtUsd(sandboxVal) + '.' : '') + ' This is an estimate, not a price, and it never predicts a token launches.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm economics — netted to a verdict' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Deposit (' + f.chain + ', hold ' + f.hold_days + 'd)' }), el('b', { text: fmtUsd2(f.deposit_usd) })),
        el('div', null, el('span', { text: 'Total gas (setup + ' + f.weeks + ' weeks + claim)' }), el('b', { text: fmtUsd2(f.total_gas_usd) })),
        el('div', null, el('span', { text: 'Expected airdrop (10% pool, pro-rata)' }), el('b', { text: fmtUsd2(f.expected_usd) })),
        el('div', null, el('span', { text: 'Net' }), el('b', { text: fmtUsd2(f.net_usd) })),
        el('div', null, el('span', { text: 'Verdict' }), el('b', { text: f.verdict }))
      ),
      el('p', { class: 'sub', text: 'The deposit is locked, not spent, so it is shown and never subtracted. The net is the expected airdrop minus gas, the true sunk cost.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Method: “no token” means the protocol records no token in the sealed snapshot — it is a record, not proof it has none. Wrapped, staked and bridged products of tokens that already trade are excluded from the ranking, as are versioned pools and exchanges. Implied value is fitted from the snapshot\'s live tokens, never asserted; the blind-test miss and the bootstrap bands say how far off it can be.' }),
      el('p', { text: 'Source: DefiLlama protocol index, snapshot ' + DATA.as_of + '. The board is generated from that sealed snapshot by one deterministic program; re-running it writes byte-identical output.' })
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'pre-token') shell.appendChild(spotlight());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
