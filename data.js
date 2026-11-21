export const normal = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const tvName = value => normal(value).replace(/\b(?:hd|uhd|fhd|sd|4k)\b/g, '').replace(/^\s*(?:es|fr|uk|us)\s+/, '').trim();

export function httpURL(value, base) {
  try {
    const url = new URL(value, base);
    return /^https?:$/.test(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function attrs(line) {
  const result = {};
  for (const match of line.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g)) {
    result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
  }
  return result;
}

export function parseM3U(text, base) {
  const entries = [];
  const seen = new Map();
  let epg = '';
  let pending;
  let group = '';
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n|\r/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTM3U')) {
      const header = attrs(line);
      epg = httpURL((header['x-tvg-url'] || header['url-tvg'] || header['tvg-url'] || '').split(',')[0].trim() || 'invalid:', base);
      continue;
    }
    if (line.startsWith('#EXTINF:')) {
      const separator = line.match(/^(?:[^"']|"[^"]*"|'[^']*')*?,/)?.[0].length ?? 0;
      const info = line.slice(8, separator ? separator - 1 : undefined);
      pending = { ...attrs(info), title: separator ? line.slice(separator).trim() : '', seconds: Number(info.split(/\s/)[0]) };
      continue;
    }
    if (line.startsWith('#EXTGRP:')) { group = line.slice(8).trim(); continue; }
    if (line.startsWith('#')) continue;
    const url = httpURL(line, base);
    if (!url) { pending = undefined; group = ''; continue; }
    const item = pending || {};
    const name = item.title || item['tvg-name'] || ('Entrada ' + (entries.length + 1));
    const category = item['group-title'] || group || 'Sin grupo';
    const number = name.match(/\bS(\d{1,3})\s*E(\d{1,4})\b|\b(\d{1,3})x(\d{1,4})\b/i);
    const rawType = normal(item['tvg-type'] || item['media-type'] || item.type);
    const groupName = normal(category);
    const season = Number(item['season-number'] || item.season || number?.[1] || number?.[3]) || null;
    const episode = Number(item['episode-number'] || item.episode || number?.[2] || number?.[4]) || null;
    const hasSeriesMetadata = Boolean(number || item['series-title'] || season && episode);
    const kind = /^(live|tv|channel|canal)$/.test(rawType) ? 'live'
      : /^(series?|episode|episodio)$/.test(rawType) ? 'series'
      : /^(vod|movies?|film|pelicula)$/.test(rawType) ? (hasSeriesMetadata && rawType === 'vod' ? 'series' : 'movie')
      : hasSeriesMetadata || /\b(series|episodios|temporadas)\b/.test(groupName) ? 'series'
      : /\b(cine|movies|peliculas|films|filmes|vod)\b/.test(groupName)
        && (item.seconds > 0 || /\.(mp4|mkv|webm|mov|avi)(?:$|\?)/i.test(url) || /\b(?:peliculas|movies|films|vod)\b/.test(groupName)) ? 'movie'
      : 'live';
    const series = item['series-title'] || (number && name.slice(0, number.index).replace(/[\s._–-]+$/g, '')) || name;
    const tvg = item['tvg-id'] || '';
    const identity = kind === 'live' && tvg ? 'tvg:' + tvg.trim().toLowerCase()
      : kind === 'series' && season && episode ? [normal(series), season, episode]
      : [normal(name), normal(category)];
    const key = JSON.stringify([kind, identity]);
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    entries.push({ id: key + ':' + count, kind, name, category, url, tvg, epgName: item['tvg-name'] || '', logo: httpURL(item['tvg-logo'] || item.logo || 'invalid:', base), series, season, episode, seconds: item.seconds > 0 ? item.seconds : 0, description: item.description || item['tvg-description'] || '', mime: item['content-type'] || '' });
    pending = undefined;
    group = '';
  }
  if (!entries.length || !/^\s*#EXTM3U/im.test(text) && !/^\s*#EXTINF:/im.test(text) && text.split(/\r?\n/).some(line => line.trim() && !line.trim().startsWith('#') && !/^https?:\/\//i.test(line.trim()))) {
    throw new Error('El archivo no contiene una lista M3U válida con enlaces reproducibles.');
  }
  return { entries, epg };
}

function xmlTime(value) {
  const p = value?.match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?(?:\s*([+-])(\d\d)(\d\d))?\s*(?:Z|UTC)?\s*$/i);
  if (!p) return NaN;
  const offset = p[7] ? (Number(p[8]) * 60 + Number(p[9])) * (p[7] === '+' ? 1 : -1) : 0;
  return Date.UTC(+p[1], +p[2] - 1, +p[3], +p[4], +p[5], +(p[6] || 0)) - offset * 60_000;
}

export function parseGuide(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.documentElement.localName !== 'tv' || doc.querySelector('parsererror')) throw new Error('La fuente no contiene una guía XMLTV válida.');
  const channels = new Map();
  const names = new Map();
  for (const channel of doc.querySelectorAll('channel[id]')) {
    const id = channel.getAttribute('id');
    channels.set(id, []);
    for (const tag of channel.querySelectorAll('display-name')) {
      const name = tvName(tag.textContent);
      if (name) names.set(name, names.has(name) && names.get(name) !== id ? null : id);
    }
  }
  const now = Date.now();
  for (const program of doc.querySelectorAll('programme[channel]')) {
    const start = xmlTime(program.getAttribute('start'));
    const end = xmlTime(program.getAttribute('stop'));
    if (!(end > start) || end < now - 2 * 864e5 || start > now + 8 * 864e5) continue;
    const id = program.getAttribute('channel');
    if (!channels.has(id)) channels.set(id, []);
    channels.get(id).push({ start, end, title: program.querySelector('title')?.textContent || 'Programa sin título' });
  }
  for (const list of channels.values()) list.sort((a, b) => a.start - b.start);
  return { channels, names };
}

export function programs(guide, entry) {
  if (!guide || !entry) return [];
  const id = guide.channels.has(entry.tvg) ? entry.tvg : guide.names.get(tvName(entry.epgName || entry.name));
  return guide.channels.get(id) || [];
}

export function searchEntries(entries, query, favorites) {
  const words = normal(query).split(' ').filter(Boolean);
  if (!words.length) return entries;
  const scores = [];
  const favoriteIds = new Set(favorites);
  for (const entry of entries) {
    const name = normal(entry.name);
    const all = name + ' ' + normal(entry.category) + ' ' + normal(entry.series);
    if (words.every(word => all.includes(word))) {
      const score = Number(name.includes(words.join(' '))) * 4 + Number(words.every(word => name.includes(word))) * 2 + Number(favoriteIds.has(entry.id));
      scores.push({ entry, score });
    }
  }
  return scores.sort((a, b) => b.score - a.score).map(result => result.entry);
}

export async function readURL(url) {
  const parsed = httpURL(url);
  if (!parsed) throw new Error('Introduce una URL HTTP o HTTPS válida.');
  if (location.protocol === 'https:' && parsed.startsWith('http:')) throw new Error('Desde GitHub Pages, introduce una URL HTTPS.');
  let response;
  try { response = await fetch(parsed, { signal: AbortSignal.timeout(40_000), cache: 'no-store' }); }
  catch { throw new Error('El servidor no respondió o no permite el acceso desde esta web (CORS). Si tienes el archivo, puedes importarlo directamente.'); }
  if (!response.ok) throw new Error('El servidor devolvió un error HTTP ' + response.status + '.');
  return response;
}

export async function openStorage() {
  const request = indexedDB.open('onda-iptv:' + new URL('./', location.href).pathname, 1);
  request.onupgradeneeded = () => request.result.createObjectStore('state');
  const db = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return {
    get(key) {
      const read = db.transaction('state').objectStore('state').get(key);
      return new Promise((resolve, reject) => {
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
    },
    set(key, value) {
      const transaction = db.transaction('state', 'readwrite');
      transaction.objectStore('state').put(value, key);
      return new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onabort = () => reject(transaction.error);
      });
    }
  };
}

export const ranking = (history, now = Date.now()) => {
  const totals = new Map();
  for (const row of history) {
    if (row.date >= now - 30 * 864e5 && row.seconds >= 60) {
      totals.set(row.id, (totals.get(row.id) || 0) + row.seconds);
    }
  }
  return [...totals].sort((a, b) => b[1] - a[1]);
};
