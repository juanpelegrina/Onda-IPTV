let context;
let model;
let controller;
let loading;
const listeners = new Set();

export function setupCast() {
  if (loading) return loading;
  loading = new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), 8000);
    window.__onGCastApiAvailable = available => {
      clearTimeout(timer);
      if (!available) { resolve(false); return; }
      try {
        context = cast.framework.CastContext.getInstance();
        context.setOptions({
          receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
          autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
          resumeSavedSession: false
        });
        model = new cast.framework.RemotePlayer();
        controller = new cast.framework.RemotePlayerController(model);
        controller.addEventListener(cast.framework.RemotePlayerEventType.ANY_CHANGE, () => {
          for (const listener of listeners) listener();
        });
        resolve(true);
      } catch { resolve(false); }
    };
    const sdk = document.createElement('script');
    sdk.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    sdk.onerror = () => { clearTimeout(timer); resolve(false); };
    document.head.append(sdk);
  });
  return loading;
}

export function subscribe(listener) { listeners.add(listener); }
export function remote() { return model; }
export function deviceName() { return context?.getCurrentSession()?.getCastDevice()?.friendlyName || 'la TV'; }
export function state() { return context?.getCastState(); }

export async function connect() {
  if (state() === 'NO_DEVICES_AVAILABLE') throw new Error('No se detectó una TV compatible. Comprueba que esté conectada a la misma red.');
  if (!context.getCurrentSession()) await context.requestSession();
  if (!context.getCurrentSession()) throw new Error('No se seleccionó una TV.');
}

export async function load(entry, time) {
  const url = new URL(entry.url);
  const mime = entry.mime || (/\.m3u8$/i.test(url.pathname) ? 'application/x-mpegURL'
    : /\.webm$/i.test(url.pathname) ? 'video/webm' : 'video/mp4');
  const media = new chrome.cast.media.MediaInfo(entry.url, mime);
  media.streamType = entry.kind === 'live' && !entry.demo ? chrome.cast.media.StreamType.LIVE : chrome.cast.media.StreamType.BUFFERED;
  media.metadata = new chrome.cast.media.GenericMediaMetadata();
  media.metadata.title = entry.name;
  if (entry.logo) media.metadata.images = [new chrome.cast.Image(entry.logo)];
  const request = new chrome.cast.media.LoadRequest(media);
  if (entry.kind !== 'live' && time > 0) request.currentTime = time;
  request.autoplay = true;
  await context.getCurrentSession().loadMedia(request);
}

export function toggleRemote() { controller?.playOrPause(); }
export function seekRemote(time) { if (model?.canSeek) { model.currentTime = time; controller.seek(); } }
export function disconnect() { context?.getCurrentSession()?.endSession(true); }
