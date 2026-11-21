import { normal, parseM3U, parseGuide, programs, readURL, searchEntries, openStorage, ranking } from './data.js';
import * as tv from './cast.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const iconPaths = {
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  tv:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="m8 2 4 4 4-4"/>',
  guide:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M9 9v12m6-12v12M3 15h18"/>',
  star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>',
  film:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4m-4 8h4m10-8h4m-4 8h4M7 12h10"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="m10 3-.6 2.2-2 .9-2-.9L3 8l1.5 1.6-.2 2.3L2 13l1 3 2.4.1 1.4 1.7-.2 2.3 3 1.3 1.4-1.8h2l1.4 1.8 3-1.3-.2-2.3 1.4-1.7 2.4-.1 1-3-2.3-1.1-.2-2.3L21 8l-2.4-2.8-2 .9-2-.9L14 3z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  play:'<path fill="currentColor" d="m9 5 11 7-11 7z"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  cast:'<path d="M3 5h18v14h-6M3 19h.1M3 14a5 5 0 0 1 5 5M3 9a10 10 0 0 1 10 10"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  file:'<path d="M7 3h7l5 5v13H5V3zM14 3v6h5M8 13h8m-8 4h8"/>',
  link:'<path d="M9 15l6-6m-7 8-2 2a3 3 0 0 1-4-4l5-5a3 3 0 0 1 4 0m2 4a3 3 0 0 0 4 0l5-5a3 3 0 0 0-4-4l-2 2"/>'
};
const icon = name => '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (iconPaths[name] || '') + '</svg>';
const theme = ['mint','blue','peach','pink','violet','gold'];
const time = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' });
const date = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const initial = { playlist:null, favorites:[], archive:{}, history:[], progress:{}, last:'', guideURL:'' };
let state = initial;
let storage;
let guide;
let guideDate;
let guideSource;
let listBusy = false;
let guideBusy = false;
let index = new Map();
let tvSeries = new Map();
let tab = 'inicio';
let listQuery = '';
let group = '';
let catalogQuery = '';
let catalogGroup = '';
let kind = '';
let page = 60;
let guideCount = 20;
let guideGroup = '';
let guideStart = startHour(Date.now());
let importError = '';
let toastTimer;
let active;
let queue = [];
let hls;
let playbackSession;
let isCasting = false;
let castPending = false;
let castLostAt = 0;
let castLastTime = 0;
let installPrompt;

function persist(key, value) {
  return storage?.set(key, value).catch(() => notify('No se pudo guardar en este dispositivo. Comprueba el espacio y los permisos del navegador.'));
}
function savePersonal() {
  const { playlist, ...personal } = state;
  return persist('personal', personal);
}
function notify(message) {
  $('#toast').textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').textContent = ''; }, 5000);
}
function entries(type) { return (state.playlist?.entries || []).filter(entry => entry.kind === type); }
function currentEntry(id) { return index.get(id); }
function isFavorite(id) { return state.favorites.includes(id); }
function availableCatalog() { return entries('movie').length || entries('series').length; }
function startHour(value) { const d = new Date(value); d.setMinutes(0, 0, 0); return +d; }
function itemMeta(id) { return currentEntry(id) || { id, name:state.archive[id]?.name || 'Contenido de una lista anterior', category:state.archive[id]?.category || '', kind:state.archive[id]?.kind || 'live', unavailable:true }; }
function schedule(entry) {
  const now = Date.now();
  const list = programs(guide, entry);
  return { now, current:list.find(p => p.start <= now && now < p.end), next:list.find(p => p.start > now) };
}
function badge(text) { return '<span class="badge">' + escape(text) + '</span>'; }
function initials(name) {
  const chunks = name.replace(/^\s*(?:[A-Z]{2}\s*[|:·-])\s*/, '').split(/\s+/);
  return (chunks.length === 1 ? chunks[0].slice(0, 3) : chunks.slice(0, 2).map(word => word[0]).join('')).toUpperCase();
}
function art(entry, wide = false) {
  const tone = theme[[...entry.name].reduce((a, c) => a + c.codePointAt(0), 0) % theme.length];
  return '<div aria-hidden="true" class="art ' + tone + (wide ? ' wide' : '') + '"><span>' + escape(initials(entry.name)) + '</span>' +
    (entry.logo ? '<img alt="" referrerpolicy="no-referrer" loading="lazy" src="' + escape(entry.logo) + '">' : '') + '</div>';
}
function button(label, action, options = {}) {
  return '<button type="button" class="button ' + (options.class || 'quiet') + '" data-action="' + action + '"' +
    (options.id ? ' data-id="' + escape(options.id) + '"' : '') + (options.disabled ? ' disabled' : '') +
    (options.title ? ' aria-label="' + escape(options.title) + '" title="' + escape(options.title) + '"' : '') +
    (options.pressed !== undefined ? ' aria-pressed="' + options.pressed + '"' : '') + '>' +
    (options.icon ? icon(options.icon) : '') + escape(label) + '</button>';
}
function star(entry) {
  const pressed = isFavorite(entry.id);
  return button('', 'favorite', { id:entry.id, icon:'star', class:'quiet star ' + (pressed ? 'selected' : ''), title:(pressed ? 'Quitar de favoritos: ' : 'Añadir a favoritos: ') + entry.name, pressed });
}
function card(entry, action = 'play', subtitle = '') {
  return '<article class="tile' + (entry.unavailable ? ' unavailable' : '') + '"><button class="tile-main" data-action="' + action + '" data-id="' + escape(entry.id) + '"' + (entry.unavailable ? ' disabled' : '') + '>' +
    art(entry, true) + '<span class="tile-name">' + escape(entry.name) + '</span><span class="tile-sub">' + escape(entry.unavailable ? 'No disponible' : subtitle || entry.category) + '</span></button>' + (entry.kind === 'live' ? star(entry) : '') + '</article>';
}
function empty(title, text, action = '', label = '', symbol = 'tv') {
  return '<div class="empty"><div class="empty-icon">' + icon(symbol) + '</div><h2>' + escape(title) + '</h2><p>' + escape(text) + '</p>' +
    (action ? button(label, action, { class:'secondary', icon:action === 'import' ? 'plus' : 'arrow' }) : '') + '</div>';
}
function section(title, cards, extra = '') {
  return '<section class="block"><div class="section-title"><h2>' + title + '</h2>' + extra + '</div>' + cards + '</section>';
}
function grid(body) { return '<div class="tile-grid">' + body + '</div>'; }

function navigation() {
  const available = [['inicio','Inicio','home']];
  if (!state.playlist || entries('live').length) available.push(['canales','Canales','tv'], ['guia','Guía','guide']);
  if (!state.playlist || entries('live').length || state.favorites.length) available.push(['favoritos','Favoritos','star']);
  if (availableCatalog()) available.push(['catalogo','Catálogo','film']);
  const labels = { ajustes:'Ajustes', ...Object.fromEntries(available.map(([key, label]) => [key, label])) };
  if (!labels[tab]) tab = 'inicio';
  $('#nav').innerHTML = available.map(([key, label, glyph]) => '<a href="#' + key + '" ' + (tab === key ? 'aria-current="page"' : '') + '>' + icon(glyph) + '<span>' + label + '</span></a>').join('');
  $('#breadcrumb').textContent = labels[tab];
  $('#collection').innerHTML = '<span class="collection-icon">' + icon('file') + '</span><span><strong>' +
    escape(state.playlist?.name || 'Mi lista IPTV') + '</strong><small>' + (state.playlist ? state.playlist.entries.length.toLocaleString('es') + ' entradas' : 'Sin lista cargada') + '</small></span>';
}
function render() {
  navigation();
  renderContent();
}
function renderContent() {
  const view = { inicio:home, canales:channels, guia:guideView, favoritos:favorites, catalogo:catalog, ajustes:settings };
  $('#content').innerHTML = view[tab]();
}
function home() {
  const last = state.last ? itemMeta(state.last) : null;
  const vod = availableCatalog();
  const live = entries('live');
  const favorites = state.favorites.slice(0, 6);
  const tops = ranking(state.history).slice(0, 6);
  const continued = Object.entries(state.progress).filter(([, p]) => p.time > 0 && !p.completed).sort((a, b) => b[1].date - a[1].date).slice(0, 6);
  const current = last && schedule(last).current;
  let heroTitle = 'Tu tele, a tu ritmo.';
  let heroText = 'Reproduce tus listas IPTV, organiza tus favoritos y encuentra lo que están emitiendo.';
  let heroAction = 'import', heroLabel = 'Añadir lista M3U', heroIcon = 'plus';
  let eyebrow = 'MI REPRODUCTOR';
  if (state.playlist) {
    if (last && !last.unavailable && live.length) {
      heroTitle = last.name;
      heroText = current ? current.title : last.category;
      heroAction = 'play'; heroLabel = 'Volver al directo'; heroIcon = 'play'; eyebrow = 'ÚLTIMO CANAL VISTO';
    } else if (live.length) {
      heroTitle = 'Televisión en directo';
      heroText = 'Explora tu lista de canales y guarda los que más te gustan.';
      heroAction = 'canales'; heroLabel = 'Explorar canales'; heroIcon = 'arrow'; eyebrow = 'MI LISTA';
    } else if (vod) {
      heroTitle = 'Tu catálogo';
      heroText = 'Elige algo para ver o continúa donde lo dejaste.';
      heroAction = 'catalogo'; heroLabel = 'Abrir catálogo'; heroIcon = 'arrow'; eyebrow = 'BAJO DEMANDA';
    }
  }
  let html = '<div class="page-title"><h1>Inicio</h1>' + (state.playlist?.demo ? badge('Lista de demostración') : '') + '</div>' +
    '<section class="hero"><div class="hero-copy"><span class="eyebrow"><i></i>' + eyebrow + '</span><h2>' + escape(heroTitle) + '</h2><p>' + escape(heroText) + '</p><div class="actions">' +
    button(heroLabel, heroAction, { id:last?.id, class:'primary', icon:heroIcon }) +
    (!state.playlist ? button('Probar demostración', 'demo', { class:'hero-secondary', icon:'play' }) : '') + '</div></div></section>';
  if (!state.playlist) {
    html += section('Tu espacio de televisión', '<div class="shortcut-grid">' +
      [['tv','Canales','Explora y busca en tus listas M3U.','canales'],['guide','Guía de programación','Consulta qué se está emitiendo y qué viene después.','guia'],['star','Favoritos','Guarda tus canales para volver con un toque.','favoritos']].map(([glyph,title,desc,action]) =>
      '<button class="shortcut" data-action="' + action + '"><span class="shortcut-icon">' + icon(glyph) + '</span><strong>' + title + '</strong><span>' + desc + '</span>' + icon('arrow') + '</button>').join('') + '</div>');
    return html;
  }
  if (live.length || favorites.length) html += section('Favoritos', favorites.length ? grid(favorites.map(id => card(itemMeta(id))).join('')) : empty('Aún no tienes favoritos', 'Pulsa la estrella junto a un canal para guardarlo.', 'canales', 'Explorar canales', 'star'),
    favorites.length ? button('Ver todos', 'favoritos', { icon:'arrow' }) : '');
  if (tops.length && live.length) html += section('Más vistos', grid(tops.map(([id, seconds]) => card(itemMeta(id), 'play', Math.floor(seconds / 60) + ' min en los últimos 30 días')).join('')));
  if (continued.length && vod) html += section('Continuar viendo', grid(continued.map(([id, p]) => card(itemMeta(id), 'resume', 'Visto ' + duration(p.time))).join('')));
  const onAir = [];
  for (const entry of guide ? live : []) {
    const { current } = schedule(entry);
    if (current) onAir.push(card(entry, 'play', current.title));
    if (onAir.length === 6) break;
  }
  if (onAir.length) html += section('En emisión ahora', grid(onAir.join('')), button('Abrir guía', 'guia', { icon:'guide' }));
  return html;
}

function libTitle(title, count, action = '') { return '<div class="page-title"><h1>' + title + '</h1>' + (count ? badge(count) : '') + action + '</div>'; }
function groupOptions(list, selected) {
  const groups = [...new Set(list.map(item => item.category))].sort((a, b) => a.localeCompare(b, 'es'));
  return '<option value="">Todos los grupos</option>' + groups.map(value => '<option value="' + escape(value) + '"' + (selected === value ? ' selected' : '') + '>' + escape(value) + '</option>').join('');
}
function channels() {
  const live = entries('live');
  return libTitle('Canales', live.length ? live.length + ' canales' : '', button('Abrir guía', 'guia', { icon:'guide' })) +
    (live.length ? '<div class="filters"><label class="search">' + icon('search') + '<input id="channel-search" placeholder="Buscar un canal…" aria-label="Buscar un canal" value="' + escape(listQuery) + '"></label><select id="channel-group" aria-label="Grupo de canales">' + groupOptions(live, group) + '</select></div><div id="channel-results">' + channelResults(live) + '</div>'
      : empty('Añade tu lista de canales', 'Importa un enlace o un archivo M3U para empezar.', 'import', 'Añadir lista'));
}
function filteredChannels(live = entries('live')) {
  return searchEntries(group ? live.filter(e => e.category === group) : live, listQuery, state.favorites);
}
function channelResults(live) {
  const filtered = filteredChannels(live);
  return filtered.length ? '<div class="list">' + filtered.slice(0, page).map(channelRow).join('') + '</div>' +
    (filtered.length > page ? '<div class="more">' + button('Mostrar más (' + page + ' de ' + filtered.length + ')', 'more') + '</div>' : '') :
    empty('No hay coincidencias', 'Prueba con otro nombre o selecciona otro grupo.', '', '', 'search');
}
function channelRow(entry) {
  const { current, now } = schedule(entry);
  const percent = current ? Math.round(100 * (now - current.start) / (current.end - current.start)) : 0;
  return '<article class="channel-row"><button class="row-main" data-action="play" data-id="' + escape(entry.id) + '"' + (entry.unavailable ? ' disabled' : '') + '>' + art(entry) +
    '<span><strong>' + escape(entry.name) + '</strong><small>' + escape(entry.unavailable ? 'No disponible' : current?.title || 'Sin datos de programación') + '</small>' +
    (current ? '<progress value="' + percent + '" max="100" aria-label="Progreso del programa"></progress>' : '') + '</span></button><span class="row-group">' + escape(entry.category) + '</span>' +
    (!entry.unavailable ? button('', 'detail', { id:entry.id, icon:'guide', title:'Programación de ' + entry.name }) : '') + star(entry) + '</article>';
}
function favorites() {
  return libTitle('Favoritos', state.favorites.length ? state.favorites.length + ' guardados' : '') +
    (state.favorites.length ? '<div class="list">' + state.favorites.map((id, i) => '<div class="ordered">' + channelRow(itemMeta(id)) +
      '<div class="reorder">' + button('↑', 'up', { id, disabled:i === 0, title:'Subir ' + itemMeta(id).name }) + button('↓', 'down', { id, disabled:i === state.favorites.length - 1, title:'Bajar ' + itemMeta(id).name }) + '</div></div>').join('') + '</div>'
      : empty('Tu lista de favoritos está vacía', 'Pulsa la estrella de los canales que quieras guardar.', 'canales', 'Explorar canales', 'star'));
}
function guideView() {
  const live = entries('live');
  if (!live.length) return libTitle('Guía') + empty('Añade una lista con canales', 'Necesitas canales para consultar su programación.', 'import', 'Añadir lista', 'guide');
  if (!guide) return libTitle('Guía') + empty('Guía de programación', guideBusy ? 'Cargando programación…' : 'Añade la URL XMLTV de tu proveedor en Ajustes.', 'ajustes', 'Abrir ajustes', 'guide');
  const rows = guideGroup ? live.filter(entry => entry.category === guideGroup) : live;
  const hour = 3600_000;
  const end = guideStart + 6 * hour;
  const now = Date.now();
  return libTitle('Guía', new Intl.DateTimeFormat('es', { weekday:'long', day:'numeric', month:'short' }).format(guideStart)) +
    '<div class="filters guide-filters">' + button('← 3 h', 'guide-back', { title:'Retroceder tres horas' }) + button('Ahora', 'guide-now', { class:'secondary', icon:'clock' }) +
    button('3 h →', 'guide-forward', { title:'Avanzar tres horas' }) + '<select id="guide-group" aria-label="Grupo de la guía">' + groupOptions(live, guideGroup) + '</select></div>' +
    '<div id="timeline-scroll" class="timeline-scroll" tabindex="0" aria-label="Parrilla de programación"><div class="timeline"><div class="timeline-head"><span>Canales</span><div class="hours">' +
    Array.from({ length:6 }, (_, h) => '<span>' + time.format(guideStart + h * hour) + '</span>').join('') + '</div></div>' +
    rows.slice(0, guideCount).map(entry => {
      const list = programs(guide, entry).filter(p => p.start < end && p.end > guideStart);
      return '<div class="timeline-row"><button class="timeline-name" data-action="play" data-id="' + escape(entry.id) + '">' + art(entry) + '<span>' + escape(entry.name) + '</span></button><div class="track">' +
        (!list.length ? '<span class="no-program">Sin datos de programación</span>' : list.map(p => {
          const left = 100 * (Math.max(p.start, guideStart) - guideStart) / (end - guideStart);
          const width = 100 * (Math.min(p.end, end) - Math.max(p.start, guideStart)) / (end - guideStart);
          const airing = p.start <= now && now < p.end;
          const body = '<strong>' + escape(p.title) + '</strong><small>' + time.format(p.start) + '–' + time.format(p.end) + '</small>';
          const style = ' style="left:' + left + '%;width:' + width + '%"';
          const title = ' title="' + escape(p.title + ' · ' + time.format(p.start) + '–' + time.format(p.end)) + '"';
          return airing ? '<button class="program airing" data-action="play" data-id="' + escape(entry.id) + '"' + style + title + '>' + body + '</button>'
            : '<div class="program"' + style + title + '>' + body + '</div>';
        }).join('')) + '</div></div>';
    }).join('') + '</div></div>' + (rows.length > guideCount ? '<div class="more">' + button('Mostrar más canales', 'guide-more') + '</div>' : '');
}

function catalog() {
  const movies = entries('movie');
  const series = entries('series');
  if (!kind || kind === 'movie' && !movies.length || kind === 'series' && !series.length) kind = movies.length ? 'movie' : 'series';
  return libTitle('Catálogo') + '<div class="filters"><div class="chips">' +
    (movies.length ? button('Películas', 'kind-movie', { class:kind === 'movie' ? 'secondary' : 'quiet', pressed:kind === 'movie' }) : '') +
    (series.length ? button('Series', 'kind-series', { class:kind === 'series' ? 'secondary' : 'quiet', pressed:kind === 'series' }) : '') +
    '</div><label class="search">' + icon('search') + '<input id="catalog-search" placeholder="Buscar un título…" aria-label="Buscar en el catálogo" value="' + escape(catalogQuery) + '"></label>' +
    '<select id="catalog-group" aria-label="Grupo del catálogo">' + groupOptions(entries(kind), catalogGroup) + '</select></div><div id="catalog-results">' + catalogResults() + '</div>';
}
function seriesEntries(entry) {
  return tvSeries.get(normal(entry.series)) || [];
}
function catalogResults() {
  const items = entries(kind);
  let list = searchEntries(catalogGroup ? items.filter(e => e.category === catalogGroup) : items, catalogQuery, []);
  if (kind === 'series') {
    const names = new Set();
    list = list.filter(entry => {
      const key = normal(entry.series);
      if (names.has(key)) return false;
      names.add(key);
      return true;
    });
  }
  if (!list.length) return empty('No hay coincidencias', 'Prueba con otro título.', '', '', 'search');
  return grid(list.slice(0, page).map(entry => {
    const count = kind === 'series' ? seriesEntries(entry).length : 0;
    return card(kind === 'series' ? { ...entry, name:entry.series } : entry, 'detail', count ? count + (count === 1 ? ' episodio' : ' episodios') : '');
  }).join('')) + (list.length > page ? '<div class="more">' + button('Mostrar más', 'more') + '</div>' : '');
}
function duration(seconds) {
  const t = Math.floor(seconds);
  const parts = [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60];
  return (parts[0] ? parts.shift() + ':' : (parts.shift(), '')) + parts.map((x, i) => i || t >= 3600 ? String(x).padStart(2, '0') : x).join(':');
}
function describeSchedule(entry) {
  const { current, next } = schedule(entry);
  return '<div class="program-info"><div><span>Ahora</span><strong>' + escape(current?.title || 'Sin datos de programación') + '</strong>' +
    (current ? '<small>' + time.format(current.start) + '–' + time.format(current.end) + '</small>' : '') + '</div><div><span>Después</span><strong>' +
    escape(next?.title || 'Sin datos de programación') + '</strong>' + (next ? '<small>' + time.format(next.start) + '</small>' : '') + '</div></div>';
}
function detail(entry) {
  let body = '<div class="detail-art">' + art(entry, true) + '</div>';
  const saved = state.progress[entry.id];
  const action = (label, name, className = 'quiet') => button(label, name, { id:entry.id, class:className, icon:'play' });
  if (entry.kind === 'live') body += describeSchedule(entry) + '<div class="actions">' + action('Ver en directo', 'play', 'primary') + star(entry) + '</div>';
  if (entry.kind === 'movie') {
    body += '<p class="muted">' + escape([entry.category, entry.seconds ? Math.round(entry.seconds / 60) + ' min' : ''].filter(Boolean).join(' · ')) + '</p>' +
      (entry.description ? '<p>' + escape(entry.description) + '</p>' : '') + '<div class="actions">' +
      (saved?.time && !saved.completed ? action('Continuar desde ' + duration(saved.time), 'resume', 'primary') + action('Desde el principio', 'play') : action('Reproducir', 'play', 'primary')) + '</div>';
  }
  const dialog = $('#detail');
  dialog.innerHTML = '<div class="dialog-head"><h2 id="detail-title">' + escape(entry.kind === 'series' ? entry.series : entry.name) + '</h2>' +
    button('✕', 'close-detail', { title:'Cerrar ficha' }) + '</div>' + body;
  if (entry.kind === 'series') renderEpisodes(entry, dialog);
  if (!dialog.open) dialog.showModal();
}
function renderEpisodes(entry, dialog) {
  const episodes = seriesEntries(entry);
  const seasons = [...new Set(episodes.map(e => e.season))].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
  dialog.insertAdjacentHTML('beforeend', '<label class="field">Temporada<select id="season" data-id="' + escape(entry.id) + '">' +
    seasons.map(s => '<option value="' + (s || '') + '">' + (s ? 'Temporada ' + s : 'Episodios sin temporada') + '</option>').join('') +
    '</select></label><div id="episodes" class="list"></div>');
  fillEpisodes(episodes, $('#season').value);
}
function fillEpisodes(list, season) {
  const episodes = list.filter(e => String(e.season || '') === season);
  if (episodes.every(e => e.episode)) episodes.sort((a, b) => a.episode - b.episode);
  $('#episodes').innerHTML = episodes.map(e => {
    const p = state.progress[e.id];
    const status = p?.completed ? 'Visto' : p?.time ? 'Continuar desde ' + duration(p.time) : 'Reproducir';
    return '<div class="episode"><div><strong>' + escape(e.name) + '</strong><small>' + escape(status) + '</small></div>' +
      button('', p?.time && !p.completed ? 'resume' : 'play', { id:e.id, icon:'play', title:status + ': ' + e.name }) + '</div>';
  }).join('');
}

function settings() {
  const playlist = state.playlist;
  const guideStatus = guideBusy ? 'Actualizando…' : guideDate ? 'Última carga correcta: ' + date.format(guideDate) : 'Todavía no se ha cargado la guía.';
  const recent = [...new Map([...state.history].reverse().map(row => row.id).map(id => [id, itemMeta(id)])).values()].slice(0, 12);
  if (state.last && recent.every(e => e.id !== state.last)) recent.unshift(itemMeta(state.last));
  return libTitle('Ajustes') +
    section('Lista IPTV', '<div class="panel"><strong>' + escape(playlist?.name || 'Ninguna lista importada') + '</strong><p class="muted">' +
      (playlist ? 'Última carga correcta: ' + date.format(playlist.updated) : 'Importa un archivo o un enlace M3U.') + '</p><div class="actions">' +
      button('Cambiar lista', 'import', { icon:'plus', disabled:listBusy }) + (playlist ? button(listBusy ? 'Actualizando…' : 'Actualizar lista', 'update', { disabled:listBusy }) : '') + '</div></div>') +
    section('Guía de programación', '<div class="panel"><form id="epg-form"><label class="field">URL XMLTV (opcional)' +
      '<input name="guide" type="password" autocomplete="off" placeholder="' + (playlist?.epg ? 'Usa la fuente de la lista' : 'https://proveedor.example/guia.xml') + '"></label>' +
      '<p class="muted">' + (state.guideURL ? 'Fuente personalizada guardada. ' : '') + guideStatus + '</p><div class="actions"><button class="button primary">Guardar y cargar</button>' +
      button('Recargar guía', 'reload-guide', { disabled:guideBusy }) + (state.guideURL ? button('Usar fuente de la lista', 'reset-guide') : '') + '</div></form></div>') +
    section('Historial', '<div class="panel"><p class="muted">El historial y las posiciones de reproducción se guardan en este dispositivo.</p>' +
      (recent.length ? '<ul class="recent">' + recent.map(entry => '<li>' + escape(entry.name) + (entry.unavailable ? ' · No disponible' : '') + '</li>').join('') + '</ul>' : '') +
      button('Borrar historial', 'clear-history') + '</div>') +
    section('Enviar a TV', '<div class="panel"><strong>' + escape(isCasting ? 'Reproduciendo en ' + tv.deviceName() : 'Google Cast') +
      '</strong><p class="muted">Abre un vídeo y pulsa «Enviar a TV». El dispositivo debe estar en la misma red y poder acceder a la emisión.</p>' +
      (isCasting ? button('Volver al mando', 'open-player') + button('Desconectar', 'stop-cast') : '') + '</div>') +
    section('Instalación', '<div class="panel"><p class="muted">En iPhone o iPad abre el menú Compartir de Safari y elige «Añadir a pantalla de inicio». En navegadores compatibles también encontrarás «Instalar» en el menú.</p></div>');
}
function openImport(update = false) {
  $('#import-dialog').dataset.update = String(update === true);
  importError = '';
  renderImport();
  if (!$('#import-dialog').open) $('#import-dialog').showModal();
}
function renderImport() {
  const dialog = $('#import-dialog');
  dialog.innerHTML = '<div class="dialog-head"><div><h2 id="import-title">Añadir lista IPTV</h2><p class="muted">Usa un enlace o un archivo M3U de tu proveedor.</p></div>' +
    button('✕', 'close-import', { title:'Cerrar importación', disabled:listBusy }) + '</div><form id="import-form">' +
    '<label class="field">' + icon('link') + ' Enlace M3U<input name="url" type="password" inputmode="url" autocomplete="off" required placeholder="https://…" ' + (listBusy ? 'disabled' : '') + '></label><button class="button primary" ' +
    (listBusy ? 'disabled' : '') + '>Importar enlace</button></form><div class="separator">o bien</div><label class="upload">' + icon('file') +
    '<span><strong>Abrir archivo M3U</strong><small>Formatos .m3u y .m3u8</small></span><input id="playlist-file" aria-label="Abrir archivo M3U" type="file" accept=".m3u,.m3u8,text/plain,application/x-mpegURL" ' +
    (listBusy ? 'disabled' : '') + '></label><p class="import-status" role="status">' + escape(listBusy ? 'Importando y organizando el contenido…' : importError) + '</p>';
}
function makeIndex() {
  index = new Map((state.playlist?.entries || []).map(e => [e.id, e]));
  tvSeries = new Map();
  for (const entry of entries('series')) {
    const key = normal(entry.series);
    if (!tvSeries.has(key)) tvSeries.set(key, []);
    tvSeries.get(key).push(entry);
  }
}
function resetFilters() {
  group = ''; guideGroup = ''; listQuery = ''; catalogQuery = ''; catalogGroup = ''; kind = ''; page = 60;
}
async function importList({ url, file, demo = false, update = false }) {
  if (listBusy) return;
  listBusy = true;
  importError = '';
  if ($('#import-dialog').open) renderImport();
  if (tab === 'ajustes') renderContent();
  try {
    let raw;
    let base;
    if (file) raw = await file.text();
    else {
      const response = await readURL(url);
      raw = await response.text();
      base = response.url;
    }
    const parsed = parseM3U(raw, base);
    const name = demo ? 'Demostración Onda' : file ? file.name.replace(/\.m3u8?$/i, '') : state.playlist?.url === url ? state.playlist.name : 'Mi lista IPTV';
    if (demo) for (const entry of parsed.entries) entry.demo = true;
    const playlist = { ...parsed, name, url:url || '', updated:Date.now(), demo };
    if (storage) await storage.set('playlist', playlist);
    for (const id of new Set([...state.favorites, ...state.history.map(row => row.id), ...Object.keys(state.progress), state.last])) {
      const entry = currentEntry(id);
      if (entry) state.archive[id] = { name:entry.name, category:entry.category, kind:entry.kind };
    }
    state.playlist = playlist;
    makeIndex();
    savePersonal();
    if (!update) resetFilters();
    $('#import-dialog').close();
    if (!update) go('inicio');
    const count = [['live','canales'], ['movie','películas'], ['series','episodios']].map(([type, label]) => entries(type).length + ' ' + label).join(' · ');
    notify('Lista cargada. ' + count);
    const source = effectiveGuide();
    if ((guideSource !== source || demo) && source) void refreshGuide(false);
    if (!source) { guide = undefined; guideDate = undefined; guideSource = undefined; }
  } catch (error) {
    importError = error instanceof DOMException ? 'No se pudo leer o guardar la lista en el dispositivo.' : error.message;
    if (!$('#import-dialog').open) notify(importError);
  } finally {
    listBusy = false;
    if ($('#import-dialog').open) renderImport();
    render();
  }
}
function effectiveGuide() { return state.guideURL || (state.playlist?.demo ? 'demo' : state.playlist?.epg || ''); }
function demoGuide() {
  const hour = 3600_000;
  const start = startHour(Date.now()) - hour;
  const channels = new Map();
  const labels = [['La mañana', 'Panorama', 'Al día'], ['Bosques del norte', 'Planeta azul', 'La vida salvaje'], ['Sesión de tarde', 'Cortometrajes', 'Detrás de cámara'], ['La pista', 'Entrenamiento', 'Resumen semanal']];
  for (const [i, entry] of entries('live').entries()) {
    if (i >= labels.length) break;
    channels.set(entry.tvg, Array.from({ length:14 }, (_, j) => ({
      start:start + j * 45 * 60_000, end:start + (j + 1) * 45 * 60_000, title:labels[i][j % 3]
    })));
  }
  return { channels, names:new Map() };
}
async function refreshGuide(announce = true) {
  const source = effectiveGuide();
  if (guideBusy) return;
  if (!source) { if (announce) notify('Añade una URL XMLTV en Ajustes.'); return; }
  guideBusy = true;
  if (tab === 'ajustes' || tab === 'guia') renderContent();
  try {
    let next;
    if (source === 'demo') next = demoGuide();
    else {
      const response = await readURL(source);
      let bytes = await response.arrayBuffer();
      const magic = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
      if (magic[0] === 31 && magic[1] === 139) {
        bytes = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      }
      next = parseGuide(new TextDecoder().decode(bytes));
    }
    if (effectiveGuide() !== source) return;
    guide = next;
    guideDate = Date.now();
    guideSource = source;
    if (source !== 'demo') void persist('guide', { guide, date:guideDate, source });
    if (announce) notify('Guía de programación actualizada.');
  } catch (error) {
    if (effectiveGuide() === source) notify(error.message || 'No se pudo actualizar la guía.');
  } finally {
    guideBusy = false;
    if (effectiveGuide() && effectiveGuide() !== source) void refreshGuide(false);
    if (tab === 'canales' && $('#channel-results')) {
      const results = $('#channel-results');
      if (!results.contains(document.activeElement)) results.innerHTML = channelResults(entries('live'));
    } else if (tab !== 'catalogo') renderContent();
    if (active?.kind === 'live' && $('#player').open) $('#player-guide').innerHTML = describeSchedule(active);
  }
}

const video = $('#video');
const player = $('#player');
function playerStatus(text = '', buttons = '') {
  const pane = $('#player-feedback');
  pane.hidden = !text;
  pane.innerHTML = escape(text) + buttons;
}
function playbackError(message) {
  playerStatus(message, '<div class="actions">' + button('Reintentar', 'retry', { class:'secondary' }) +
    (active?.kind === 'live' && queue.length > 1 ? button('Cambiar de canal', 'next') : '') + '</div>');
}
function recordProgress(entry, position, mediaDuration, completed = false) {
  if (entry.kind === 'live' || !Number.isFinite(position) || position <= 0) return;
  state.progress[entry.id] = { time:position, duration:Number.isFinite(mediaDuration) ? mediaDuration : 0, completed:completed || Number.isFinite(mediaDuration) && mediaDuration - position < 2, date:Date.now() };
}
function sample(force = false) {
  if (!active || !playbackSession) return;
  const s = playbackSession;
  const r = tv.remote();
  const wall = Date.now();
  const position = isCasting ? r?.currentTime || castLastTime : video.currentTime;
  const running = isCasting ? r?.isConnected && r.playerState === 'PLAYING' : !video.paused && !video.seeking && video.readyState >= 2;
  const delta = position - s.position;
  if ((running || force && s.running) && delta > 0 && delta <= (wall - s.wall) / 1000 * 1.6 + 0.5) s.seconds += Math.min(delta, (wall - s.wall) / 1000);
  if (active.kind === 'live' && (running && state.last !== active.id || s.seconds >= 1)) {
    state.last = active.id;
    if (!s.row) {
      s.row = { id:active.id, date:wall, seconds:0 };
      state.history.push(s.row);
    }
    s.row.seconds = s.seconds;
  }
  s.position = position;
  s.wall = wall;
  s.running = running;
  if (force || wall - s.saved >= 4000 && (running || s.seconds >= 1)) {
    if (position > 0 && (running || force)) recordProgress(active, position, isCasting ? r?.duration : video.duration, !isCasting && video.ended);
    s.saved = wall;
    if (state.history.some(row => row.date < wall - 31 * 864e5)) state.history = state.history.filter(row => row.date >= wall - 31 * 864e5);
    savePersonal();
  }
}
function startSession() {
  playbackSession = { position:0, wall:Date.now(), saved:0, seconds:0, running:false, row:null };
}
function nextEpisode() {
  if (!active?.season || !active.episode || active.kind !== 'series') return;
  const list = seriesEntries(active);
  if (list.some(e => !e.season || !e.episode) || new Set(list.map(e => e.season + ':' + e.episode)).size !== list.length) return;
  list.sort((a, b) => a.season - b.season || a.episode - b.episode);
  return list[list.findIndex(e => e.id === active.id) + 1];
}
function paintPlayer() {
  if (!active) return;
  const pos = queue.findIndex(e => e.id === active.id);
  $('#playing-title').textContent = active.name;
  $('#playing-kind').textContent = active.kind === 'live' ? 'En directo' : active.kind === 'series' ? 'Serie' : 'Película';
  $('#playing-kind').classList.toggle('live-label', active.kind === 'live');
  const favorite = $('#player-favorite');
  favorite.hidden = active.kind !== 'live';
  const pressed = isFavorite(active.id);
  favorite.innerHTML = icon('star');
  favorite.classList.toggle('selected', pressed);
  favorite.setAttribute('aria-pressed', pressed);
  favorite.setAttribute('aria-label', pressed ? 'Quitar de favoritos' : 'Añadir a favoritos');
  const next = nextEpisode();
  const castButton = $('.cast-action');
  castButton.innerHTML = icon('cast') + (isCasting ? 'Desconectar TV' : 'Enviar a TV');
  $('#player-controls').innerHTML = (active.kind === 'live' ?
    button('← Anterior', 'previous', { disabled:pos <= 0 }) + button('Siguiente →', 'next', { disabled:pos < 0 || pos >= queue.length - 1 }) :
    button('−10 s', 'back-10') + button('+10 s', 'forward-10') + (next ? button('Siguiente episodio', 'episode-next', { id:next.id }) : '')) +
    (isCasting ? button(tv.remote()?.isPaused ? 'Reanudar' : 'Pausar', 'remote-toggle') + button('Ver en este dispositivo', 'stop-cast') : button('Pantalla completa', 'fullscreen'));
  $('#player-guide').innerHTML = active.kind === 'live' ? describeSchedule(active) : '';
  $('#cast-screen').hidden = !isCasting;
  video.hidden = isCasting;
  $('#cast-screen').innerHTML = icon('cast') + '<strong>' + escape('Reproduciendo en ' + tv.deviceName()) + '</strong>';
  const dock = $('#cast-dock');
  dock.hidden = !isCasting;
  dock.innerHTML = icon('cast') + ' ' + escape('Mando · ' + tv.deviceName());
  const remoteVideo = isCasting && active.kind !== 'live';
  if (remoteVideo) $('#cast-screen').insertAdjacentHTML('beforeend', '<label class="cast-seek">Posición en la TV <input id="cast-seek" type="range" min="0" max="100" value="0"></label>');
  updateRemoteSeek();
}
function updateRemoteSeek() {
  const seek = $('#cast-seek');
  if (!seek || seek === document.activeElement) return;
  const remote = tv.remote();
  seek.max = Number.isFinite(remote?.duration) && remote.duration > 0 ? remote.duration : 100;
  seek.value = remote?.currentTime || 0;
  seek.disabled = !remote?.canSeek;
}
function clearVideo() {
  hls?.destroy();
  hls = undefined;
  video.pause();
  video.removeAttribute('src');
  video.load();
}
function tryPlay() {
  video.play().catch(error => {
    if (error.name === 'NotAllowedError' && active && !isCasting) playerStatus('Pulsa el botón de reproducción para empezar.');
  });
}
function attachLocal(entry, timeToResume = 0) {
  clearVideo();
  video.loop = Boolean(entry.demo && entry.kind === 'live');
  video.onloadedmetadata = () => {
    if (active !== entry) return;
    if (timeToResume > 0) video.currentTime = Math.min(timeToResume, Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.25) : timeToResume);
  };
  const path = new URL(entry.url).pathname;
  if (location.protocol === 'https:' && entry.url.startsWith('http:')) {
    playbackError('La emisión usa HTTP. Para abrirla desde GitHub Pages, pide el enlace HTTPS a tu proveedor.');
    return;
  }
  const isHLS = /\.m3u8$/i.test(path) || /mpegurl/i.test(entry.mime) || /(?:^|[?&])(?:type|output|format)=(?:hls|m3u8)(?:&|$)/i.test(new URL(entry.url).search);
  if (isHLS && !video.canPlayType('application/vnd.apple.mpegurl') && window.Hls?.isSupported()) {
    hls = new Hls();
    hls.on(Hls.Events.MEDIA_ATTACHED, () => hls?.loadSource(entry.url));
    hls.on(Hls.Events.MANIFEST_PARSED, tryPlay);
    hls.on(Hls.Events.ERROR, (_, error) => {
      if (error.fatal) playbackError('No se pudo reproducir HLS. Comprueba el enlace, los permisos CORS del servidor o la conexión.');
    });
    hls.attachMedia(video);
  } else {
    video.src = entry.url;
    tryPlay();
  }
}
async function play(entry, resume = false, keepQueue = false) {
  if (!entry || castPending) return;
  sample(true);
  if (!keepQueue) queue = tab === 'favoritos' ? state.favorites.map(currentEntry).filter(Boolean) : tab === 'canales' ? filteredChannels() :
    tab === 'guia' && guideGroup ? entries('live').filter(e => e.category === guideGroup) : entries('live');
  if (entry.kind === 'live' && !queue.some(e => e.id === entry.id)) queue = entries('live');
  active = entry;
  const position = resume ? state.progress[entry.id]?.time || 0 : 0;
  startSession();
  if ($('#detail').open) $('#detail').close();
  if (!player.open) player.showModal();
  paintPlayer();
  playerStatus('Abriendo emisión…');
  if (isCasting) {
    castPending = true;
    try {
      await tv.load(entry, position);
      castLastTime = position;
      playerStatus();
    } catch {
      isCasting = false;
      tv.disconnect();
      paintPlayer();
      attachLocal(entry, position);
      playerStatus('La TV no pudo abrir esta emisión. Continuando en este dispositivo.', button('Reintentar en TV', 'cast'));
    } finally { castPending = false; }
  } else attachLocal(entry, position);
}
function closePlayer() {
  sample(true);
  if (!isCasting) { active = undefined; clearVideo(); playbackSession = undefined; }
  player.close();
  if (tab === 'inicio') renderContent();
}
function switchChannel(direction) {
  const i = queue.findIndex(e => e.id === active?.id);
  void play(queue[i + direction], false, true);
}
async function sendToTV() {
  if (!active || castPending) return;
  if (isCasting) { stopCast(); return; }
  const item = active;
  castPending = true;
  playerStatus('Buscando dispositivos Google Cast…');
  try {
    if (!(await tv.setupCast())) throw new Error('Google Cast no está disponible en este navegador. Prueba Chrome en un dispositivo compatible.');
    if (item !== active) return;
    await tv.connect();
    if (item !== active) { tv.disconnect(); return; }
    if (location.protocol === 'https:' && item.url.startsWith('http:')) throw new Error('La emisión necesita un enlace HTTPS para enviarse a la TV.');
    const resumeAt = video.currentTime;
    try { await tv.load(item, resumeAt); }
    catch { throw new Error('La TV no pudo abrir esta emisión. Comprueba que pueda acceder al enlace y admita el formato.'); }
    if (item !== active) { tv.disconnect(); return; }
    sample(true);
    castLastTime = resumeAt;
    castLostAt = 0;
    isCasting = true;
    clearVideo();
    paintPlayer();
    playerStatus();
  } catch (error) {
    if (!isCasting) tv.disconnect();
    if (item === active) playerStatus(error instanceof Error ? error.message : 'No se pudo conectar con la TV.', '<div class="actions">' +
      button('Reintentar en TV', 'cast', { class:'secondary' }) + button('Ver en este dispositivo', 'dismiss-error') + '</div>');
  } finally { castPending = false; }
}
function stopCast(lost = false) {
  if (!isCasting || !active) return;
  sample(true);
  const position = active.kind === 'live' ? 0 : castLastTime;
  isCasting = false;
  castLostAt = 0;
  if (!lost) tv.disconnect();
  paintPlayer();
  if (player.open) {
    attachLocal(active, position);
    if (lost) playerStatus('Se desconectó la TV. Continuando en este dispositivo.');
  } else {
    active = undefined;
    playbackSession = undefined;
    notify(lost ? 'La TV se ha desconectado.' : 'Reproducción en TV finalizada.');
  }
}
tv.subscribe(() => {
  if (!isCasting || castPending) return;
  const r = tv.remote();
  if (!r?.isConnected) { castLostAt ||= Date.now(); return; }
  castLostAt = 0;
  if (r.currentTime > 0) castLastTime = r.currentTime;
  updateRemoteSeek();
  const button = $('[data-action="remote-toggle"]');
  if (button) button.textContent = r.isPaused ? 'Reanudar' : 'Pausar';
});
function seekBy(delta) {
  if (isCasting) {
    const r = tv.remote();
    tv.seekRemote(Math.max(0, Math.min(r.duration || Infinity, r.currentTime + delta)));
  } else if (Number.isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
}
video.addEventListener('playing', () => { if (!isCasting) { sample(); playerStatus(); } });
video.addEventListener('pause', () => { if (active && !isCasting && video.currentTime > 0) sample(true); });
video.addEventListener('ended', () => { if (active && !isCasting) sample(true); });
video.addEventListener('error', () => {
  if (active && !isCasting && video.getAttribute('src')) playbackError('No se pudo abrir esta emisión. Comprueba el enlace y que tu navegador admita el formato.');
});
setInterval(() => {
  if (castLostAt && !castPending && Date.now() - castLostAt > 1500) stopCast(true);
  else sample();
}, 1000);
setInterval(() => {
  if (active?.kind === 'live' && player.open) $('#player-guide').innerHTML = describeSchedule(active);
  if (state.playlist?.demo && !state.guideURL && guide && Date.now() - guideDate > 3600_000) { guide = demoGuide(); guideDate = Date.now(); }
  if (tab === 'canales' && !player.open) {
    const results = $('#channel-results');
    if (results && !results.contains(document.activeElement)) results.innerHTML = channelResults(entries('live'));
  }
  if (tab === 'inicio' && !player.open && !$('#content').contains(document.activeElement)) renderContent();
}, 60_000);
window.addEventListener('pagehide', () => sample(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) sample(true); });

function go(next) {
  if (location.hash !== '#' + next) location.hash = next;
  else if (tab !== next) route();
}
function route() {
  tab = location.hash.slice(1) || 'inicio';
  page = 60;
  if (tab === 'guia') { guideCount = 20; guideStart = startHour(Date.now()); }
  render();
  window.scrollTo(0, 0);
}
function refreshFavorites(id) {
  const focused = document.activeElement;
  const action = focused?.dataset.action;
  const key = focused?.dataset.id;
  if (tab === 'inicio' || tab === 'favoritos') {
    renderContent();
    const replacement = [...$('#content').querySelectorAll('[data-action]')].find(el => el.dataset.action === action && el.dataset.id === key);
    if (replacement && !replacement.disabled) replacement.focus({ preventScroll:true });
    else if (action === 'up' || action === 'down') {
      [...$('#content').querySelectorAll('[data-action]')].find(el => el.dataset.id === key && el.dataset.action === (action === 'up' ? 'down' : 'up') && !el.disabled)?.focus({ preventScroll:true });
    }
  }
  for (const element of document.querySelectorAll('[data-action="favorite"]')) {
    if (element.dataset.id !== id) continue;
    const pressed = isFavorite(id);
    element.classList.toggle('selected', pressed);
    element.setAttribute('aria-pressed', pressed);
    const label = (pressed ? 'Quitar de favoritos: ' : 'Añadir a favoritos: ') + itemMeta(id).name;
    element.setAttribute('aria-label', label);
    element.title = label;
  }
  if (active?.id === id) paintPlayer();
}
function toggleFavorite(id) {
  if (isFavorite(id)) state.favorites = state.favorites.filter(value => value !== id);
  else state.favorites = [...state.favorites, id];
  savePersonal();
  refreshFavorites(id);
}
function moveFavorite(id, difference) {
  const i = state.favorites.indexOf(id);
  const j = i + difference;
  if (i < 0 || j < 0 || j >= state.favorites.length) return;
  [state.favorites[i], state.favorites[j]] = [state.favorites[j], state.favorites[i]];
  savePersonal();
  refreshFavorites(id);
}
function useDemo(update = false) {
  void importList({ url:new URL('./assets/demo.m3u', location.href).href, demo:true, update });
}
function changeGuideStart(offset) {
  guideStart = offset === 0 ? startHour(Date.now()) : guideStart + offset * 3600_000;
  renderContent();
}
function changeGuideSource(url) {
  if (url && !/^https?:\/\//i.test(url)) { notify('Introduce una URL que empiece por https://.'); return; }
  state.guideURL = url;
  savePersonal();
  if (!effectiveGuide()) { guide = undefined; guideDate = undefined; guideSource = undefined; renderContent(); }
  else void refreshGuide();
}

const actions = {
  inicio:() => go('inicio'), canales:() => go('canales'), guia:() => go('guia'), favoritos:() => go('favoritos'),
  catalogo:() => go('catalogo'), ajustes:() => go('ajustes'), import:openImport, 'close-import':() => $('#import-dialog').close(),
  demo:() => useDemo(), detail:id => { const entry = currentEntry(id); if (entry) detail(entry); },
  'close-detail':() => $('#detail').close(), play:id => play(currentEntry(id)), resume:id => play(currentEntry(id), true),
  favorite:toggleFavorite, up:id => moveFavorite(id, -1), down:id => moveFavorite(id, 1),
  'player-favorite':() => { if (active) toggleFavorite(active.id); },
  'close-player':closePlayer, 'open-player':() => { if (active && !player.open) { paintPlayer(); player.showModal(); } },
  cast:sendToTV, 'stop-cast':() => stopCast(), 'remote-toggle':tv.toggleRemote, 'dismiss-error':() => playerStatus(),
  retry:() => { if (active) void play(active, active.kind !== 'live', true); },
  next:() => switchChannel(1), previous:() => switchChannel(-1), 'episode-next':id => play(currentEntry(id), true),
  'back-10':() => seekBy(-10), 'forward-10':() => seekBy(10),
  fullscreen:() => {
    if (video.webkitEnterFullscreen) { video.webkitEnterFullscreen(); return; }
    (video.requestFullscreen?.() || Promise.reject()).catch(() => playerStatus('Este navegador no pudo activar la pantalla completa.'));
  },
  'kind-movie':() => { kind = 'movie'; catalogGroup = ''; page = 60; renderContent(); },
  'kind-series':() => { kind = 'series'; catalogGroup = ''; page = 60; renderContent(); },
  'guide-now':() => changeGuideStart(0), 'guide-forward':() => changeGuideStart(3), 'guide-back':() => changeGuideStart(-3),
  'guide-more':() => {
    guideCount += 20;
    const scroll = $('#timeline-scroll').scrollLeft;
    renderContent();
    $('#timeline-scroll').scrollLeft = scroll;
  },
  more:() => {
    page += 60;
    if (tab === 'canales') $('#channel-results').innerHTML = channelResults(entries('live'));
    if (tab === 'catalogo') $('#catalog-results').innerHTML = catalogResults();
  },
  update:() => state.playlist.demo ? useDemo(true) : state.playlist.url ? importList({ url:state.playlist.url, update:true }) : openImport(true),
  'reload-guide':() => refreshGuide(), 'reset-guide':() => changeGuideSource(''),
  'clear-history':() => {
    if (!confirm('¿Borrar los canales recientes, el ranking y el último canal visto?')) return;
    state.history = [];
    state.last = '';
    if (active) startSession();
    savePersonal();
    renderContent();
    notify('Historial borrado.');
  }
};

document.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (button && !button.disabled) actions[button.dataset.action]?.(button.dataset.id);
});
document.addEventListener('input', event => {
  const input = event.target;
  if (input.id === 'channel-search') { listQuery = input.value; page = 60; $('#channel-results').innerHTML = channelResults(entries('live')); }
  if (input.id === 'catalog-search') { catalogQuery = input.value; page = 60; $('#catalog-results').innerHTML = catalogResults(); }
});
document.addEventListener('change', event => {
  const input = event.target;
  if (input.id === 'playlist-file' && input.files[0]) void importList({ file:input.files[0], update:$('#import-dialog').dataset.update === 'true' });
  if (input.id === 'channel-group') { group = input.value; page = 60; $('#channel-results').innerHTML = channelResults(entries('live')); }
  if (input.id === 'catalog-group') { catalogGroup = input.value; page = 60; $('#catalog-results').innerHTML = catalogResults(); }
  if (input.id === 'guide-group') { guideGroup = input.value; guideCount = 20; renderContent(); $('#guide-group').focus({ preventScroll:true }); }
  if (input.id === 'season') { const entry = currentEntry(input.dataset.id); if (entry) fillEpisodes(seriesEntries(entry), input.value); }
  if (input.id === 'cast-seek') tv.seekRemote(Number(input.value));
});
document.addEventListener('submit', event => {
  const form = event.target;
  if (form.id === 'import-form') { event.preventDefault(); void importList({ url:form.elements.url.value.trim() }); }
  if (form.id === 'epg-form') { event.preventDefault(); const url = form.elements.guide.value.trim(); if (url) changeGuideSource(url); else void refreshGuide(); }
});
document.addEventListener('error', event => {
  if (event.target.tagName === 'IMG' && event.target.closest('.art')) event.target.hidden = true;
}, true);
player.addEventListener('cancel', event => { event.preventDefault(); closePlayer(); });
$('#import-dialog').addEventListener('cancel', event => { if (listBusy) event.preventDefault(); });
$('#settings').innerHTML = icon('settings') + '<span>Ajustes</span>';
$('#settings').onclick = () => go('ajustes');
$('#import').innerHTML = icon('plus') + '<span>Añadir lista</span>';
$('#import').onclick = openImport;
$('#install').onclick = async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  installPrompt = undefined;
  $('#install').hidden = true;
};
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  $('#install').hidden = false;
});
window.addEventListener('appinstalled', () => { $('#install').hidden = true; });
function networkStatus() { $('#network').hidden = navigator.onLine; }
window.addEventListener('online', networkStatus);
window.addEventListener('offline', networkStatus);
networkStatus();

try {
  storage = await openStorage();
  const [personal, playlist, savedGuide] = await Promise.all([storage.get('personal'), storage.get('playlist'), storage.get('guide')]);
  state = { ...initial, ...personal, playlist };
  if (savedGuide?.source === effectiveGuide()) { guide = savedGuide.guide; guideDate = savedGuide.date; guideSource = savedGuide.source; }
} catch { notify('El almacenamiento local no está disponible. La lista se conservará mientras esta página esté abierta.'); }
makeIndex();
window.addEventListener('hashchange', route);
route();
if (effectiveGuide() && (!guideDate || Date.now() - guideDate > 6 * 3600_000)) void refreshGuide(false);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
