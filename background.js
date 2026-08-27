const browserApi = globalThis.browser ?? globalThis.chrome;

const CACHE_TTL_MS = 12 * 60 * 1000;
const MAX_MEDIA_PER_TAB = 160;
const memoryMedia = new Map();
const pendingPersist = new Map();

function cacheKey(tabId) { return `pvd_media_${tabId}`; }
function platformFromUrl(url = "") {
  const s = String(url);
  if (s.includes("video.twimg.com") || s.includes("x.com") || s.includes("twitter.com")) return "x";
  if (s.includes("instagram.com") || s.includes("cdninstagram.com") || s.includes("fbcdn.net")) return "instagram";
  return null;
}
function isAllowedMediaUrl(url = "") {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "video.twimg.com" || host === "instagram.com" || host.endsWith(".instagram.com") || host === "cdninstagram.com" || host.endsWith(".cdninstagram.com") || host === "fbcdn.net" || host.endsWith(".fbcdn.net");
  } catch { return false; }
}
function twitterMediaKey(url = "") {
  const m = String(url).match(/\/(?:ext_tw_video(?:_thumb)?|amplify_video(?:_thumb)?|tweet_video(?:_thumb)?)\/(\d+)/i);
  return m ? m[1] : null;
}
function cleanStore(items) {
  const cutoff = Date.now() - CACHE_TTL_MS;
  const dedupe = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.url || !isAllowedMediaUrl(item.url)) continue;
    if ((item.seenAt || 0) < cutoff) continue;
    const old = dedupe.get(item.url);
    if (!old || (item.seenAt || 0) >= (old.seenAt || 0)) dedupe.set(item.url, item);
  }
  return [...dedupe.values()].sort((a,b)=>(a.seenAt||0)-(b.seenAt||0)).slice(-MAX_MEDIA_PER_TAB);
}
function normalizeVariant(item = {}) {
  if (!item.url || typeof item.url !== "string" || !isAllowedMediaUrl(item.url)) return null;
  const platform = item.platform || platformFromUrl(item.url);
  if (!platform) return null;
  return {
    url:item.url, platform,
    bitrate:Number(item.bitrate||0), contentType:item.contentType||item.content_type||"",
    width:Number(item.width||0), height:Number(item.height||0),
    tweetId:item.tweetId ? String(item.tweetId) : null,
    mediaKey:item.mediaKey || (platform === "x" ? twitterMediaKey(item.url) : null),
    postKey:item.postKey ? String(item.postKey) : null,
    contentKind:item.contentKind || null,
    seenAt:Date.now()
  };
}
async function storageArea() {
  return browserApi?.storage?.session ?? browserApi?.storage?.local ?? null;
}
async function hydrateTab(tabId) {
  const memory = cleanStore(memoryMedia.get(tabId) || []);
  const area = await storageArea();
  if (!area?.get) { memoryMedia.set(tabId,memory); return memory; }
  try {
    const data = await area.get(cacheKey(tabId));
    const merged = cleanStore([...memory, ...(data?.[cacheKey(tabId)] || [])]);
    memoryMedia.set(tabId, merged);
    return merged;
  } catch { return memory; }
}
function schedulePersist(tabId) {
  if (pendingPersist.has(tabId)) clearTimeout(pendingPersist.get(tabId));
  pendingPersist.set(tabId, setTimeout(async()=>{
    pendingPersist.delete(tabId);
    const area = await storageArea();
    if (!area?.set) return;
    try { await area.set({[cacheKey(tabId)]: cleanStore(memoryMedia.get(tabId)||[])}); } catch {}
  }, 180));
}
function addMedia(tabId,item) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  const n = normalizeVariant(item); if (!n) return;
  const store = cleanStore(memoryMedia.get(tabId)||[]);
  const existing = store.find(x=>x.url===n.url);
  if (existing) Object.assign(existing, {
    seenAt:Date.now(), bitrate:Math.max(existing.bitrate||0,n.bitrate||0),
    width:Math.max(existing.width||0,n.width||0), height:Math.max(existing.height||0,n.height||0),
    tweetId:existing.tweetId||n.tweetId, mediaKey:existing.mediaKey||n.mediaKey,
    postKey:existing.postKey||n.postKey, contentKind:existing.contentKind||n.contentKind,
    contentType:existing.contentType||n.contentType
  }); else store.push(n);
  memoryMedia.set(tabId, cleanStore(store));
  schedulePersist(tabId);
}
function parseResolution(url="") {
  const m = String(url).match(/\/(\d{2,5})x(\d{2,5})\//);
  return m ? {width:Number(m[1]),height:Number(m[2])} : {width:0,height:0};
}
function resolution(item) { return item.width&&item.height ? {width:item.width,height:item.height} : parseResolution(item.url); }
function isProgressive(item) {
  const url=item?.url||"", ct=(item?.contentType||"").toLowerCase();
  if (/\.m3u8(?:\?|$)/i.test(url) || ct.includes("mpegurl")) return false;
  return /\.(mp4|webm)(?:\?|$)/i.test(url) || ct.includes("video/mp4") || ct.includes("video/webm") || item.platform === "instagram";
}
function score(item) { const {width,height}=resolution(item); return (isProgressive(item)?1e15:0)+(width*height*1e6)+Number(item.bitrate||0); }
function sanitize(v,fallback) { const x=String(v||"").replace(/^@/,"").replace(/[<>:\"/\\|?*\x00-\x1F]/g,"_").replace(/\s+/g,"_").slice(0,90); return x||fallback; }
function chooseCandidates(store,p) {
  const out=[];
  if (p.directUrl && !String(p.directUrl).startsWith("blob:") && isAllowedMediaUrl(p.directUrl)) out.push(normalizeVariant({...p,url:p.directUrl}));
  if (p.platform === "x") {
    if (p.mediaKey) out.push(...store.filter(x=>x.platform==="x"&&x.mediaKey===String(p.mediaKey)));
    if (p.tweetId) out.push(...store.filter(x=>x.platform==="x"&&x.tweetId===String(p.tweetId)));
  } else if (p.platform === "instagram") {
    if (p.postKey) out.push(...store.filter(x=>x.platform==="instagram"&&x.postKey===String(p.postKey)));
  }
  if (!out.filter(Boolean).length) {
    const recent=store.filter(x=>x.platform===p.platform && Date.now()-(x.seenAt||0)<20000);
    out.push(...recent.slice(-24));
  }
  const d=new Map(); for (const i of out.filter(Boolean)) { const old=d.get(i.url); if(!old||score(i)>score(old)) d.set(i.url,i); }
  return [...d.values()];
}
function qualityLabel(item) { const {width,height}=resolution(item); return width&&height ? `${Math.min(width,height)}p` : item.bitrate ? `${Math.round(item.bitrate/1000)} kbps` : "Orijinal"; }
function menuVariants(candidates) {
  const sorted=candidates.filter(isProgressive).sort((a,b)=>score(b)-score(a));
  const byQ=new Map(), unknown=[];
  for(const i of sorted){ const {width,height}=resolution(i), q=width&&height?Math.min(width,height):0; if(!q) unknown.push(i); else if(!byQ.has(q)) byQ.set(q,i); }
  const selected=[...byQ.values(), ...unknown.slice(0,byQ.size?1:4)].slice(0,8);
  return selected.map((i,index)=>{const r=resolution(i);return {url:i.url,label:qualityLabel(i),width:r.width,height:r.height,bitrate:i.bitrate||0,best:index===0,cleanSource:true};});
}
async function getVariants(tabId,payload){
  const store=await hydrateTab(tabId); const candidates=chooseCandidates(store,payload); const variants=menuVariants(candidates);
  if(!variants.length) return {ok:false,code:"NO_VIDEO",message:"Video kaynağı henüz yakalanmadı. Videoyu kısa süre oynatıp Tekrar Dene seçeneğine bas."};
  return {ok:true,variants};
}
async function notificationsEnabled(){
  try { const d=await browserApi.storage.local.get("pvd_settings"); return d?.pvd_settings?.notifications !== false; } catch { return true; }
}
async function notify(title,message){
  if(!browserApi?.notifications?.create || !(await notificationsEnabled())) return;
  try { await browserApi.notifications.create({type:"basic",iconUrl:"icons/icon128.png",title,message}); } catch {}
}
async function downloadSelected(tabId,payload){
  const url=payload.selectedUrl;
  if(!url||!isAllowedMediaUrl(url)) return {ok:false,message:"Geçersiz video adresi."};
  const store=await hydrateTab(tabId); const item=store.find(x=>x.url===url)||normalizeVariant({...payload,url});
  if(!item||!isProgressive(item)) return {ok:false,message:"Doğrudan indirilebilir video kaynağı bulunamadı."};
  const {width,height}=resolution(item), quality=width&&height?`${width}x${height}`:qualityLabel(item);
  const fileExtension=/\.webm(?:\?|$)/i.test(url)?"webm":"mp4";
  const username=sanitize(payload.username,payload.platform==="instagram"?"instagram":"x_user");
  const id=sanitize(payload.platform==="instagram"?payload.postKey:payload.tweetId,"video");
  const qp=width&&height?`_${width}x${height}`:"";
  let folder=payload.platform==="instagram"?"Instagram-Videos":"X-Videos";
  if(payload.platform==="instagram" && payload.contentKind==="story") folder="Instagram-Stories";
  const filename=`${folder}/${username}_${id}${qp}.${fileExtension}`;
  try {
    if(!browserApi?.downloads?.download) return {ok:false,message:"Tarayıcının indirme API'si kullanılamıyor."};
    const downloadId=await browserApi.downloads.download({url,filename,saveAs:false,conflictAction:"uniquify"});
    return {ok:true,downloadId,filename,quality};
  } catch(error){
    console.error("[PVD] download failed",error); await notify("İndirme başlatılamadı",error?.message||"Ağ veya tarayıcı kaynaklı bir hata oluştu.");
    return {ok:false,message:error?.message||"İndirme başlatılamadı."};
  }
}
async function ensureOffscreen(){
  if(!browserApi?.offscreen?.createDocument) return false;
  try {
    if(browserApi.offscreen.hasDocument && await browserApi.offscreen.hasDocument()) return true;
    await browserApi.offscreen.createDocument({url:"audio.html",reasons:["AUDIO_PLAYBACK"],justification:"Convert a user-selected accessible video audio track locally."});
    return true;
  } catch(e){ if(String(e).includes("single offscreen")) return true; return false; }
}
async function extractAudio(tabId,payload){
  const store=await hydrateTab(tabId); const candidates=chooseCandidates(store,payload).filter(isProgressive).sort((a,b)=>score(b)-score(a));
  const source=candidates[0]; if(!source) return {ok:false,message:"Ses çıkarılacak video kaynağı bulunamadı."};
  const filenameBase=`Audio/${sanitize(payload.username,"media")}_${sanitize(payload.platform==="instagram"?payload.postKey:payload.tweetId,"audio")}`;
  const offscreen=await ensureOffscreen();
  if(!offscreen) return {ok:false,code:"AUDIO_ENGINE_UNAVAILABLE",message:"Bu tarayıcıda yerel ses dönüştürme motoru kullanılamıyor."};
  try {
    const converted = await browserApi.runtime.sendMessage({type:"AUDIO_PROCESS",url:source.url,filenameBase});
    if (!converted?.ok) return converted || {ok:false,message:"MP3 oluşturulamadı."};
    if (!converted.blobUrl) return {ok:false,message:"MP3 çıktısı oluşturulamadı."};
    const downloadId = await browserApi.downloads.download({
      url: converted.blobUrl,
      filename: `${filenameBase}.mp3`,
      saveAs: false,
      conflictAction: "uniquify"
    });
    return {ok:true,downloadId,message:"MP3 oluşturuldu ve indirme başladı."};
  } catch(error){ return {ok:false,message:error?.message||"Ses çıkarma işlemi başlatılamadı."}; }
}

browserApi.webRequest.onBeforeRequest.addListener(details=>{
  if(details.tabId<0) return; const url=details.url||""; const platform=platformFromUrl(url); if(!platform) return;
  if(platform==="x" && url.startsWith("https://video.twimg.com/") && (/\.(mp4|webm)(?:\?|$)/i.test(url)||/\.m3u8(?:\?|$)/i.test(url))) addMedia(details.tabId,{url,platform:"x"});
  if(platform==="instagram" && (url.includes("cdninstagram.com")||url.includes("fbcdn.net")) && (/\.mp4(?:\?|$)/i.test(url)||url.includes("/v/t16/")||url.includes("/o1/v/"))) addMedia(details.tabId,{url,platform:"instagram",contentType:"video/mp4"});
},{urls:["https://video.twimg.com/*","https://*.cdninstagram.com/*","https://*.fbcdn.net/*"]});

browserApi.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  const tabId=sender.tab?.id ?? message?.tabId;
  if(message?.type==="CACHE_VARIANTS") { if(Number.isInteger(tabId)&&Array.isArray(message.variants)) for(const v of message.variants) addMedia(tabId,v); sendResponse({ok:true}); return; }
  if(message?.type==="GET_VARIANTS") { if(!Number.isInteger(tabId)){sendResponse({ok:false,message:"Aktif sekme bulunamadı."});return;} getVariants(tabId,message).then(sendResponse); return true; }
  if(message?.type==="DOWNLOAD_SELECTED") { if(!Number.isInteger(tabId)){sendResponse({ok:false,message:"Aktif sekme bulunamadı."});return;} downloadSelected(tabId,message).then(sendResponse); return true; }
  if(message?.type==="EXTRACT_AUDIO") { if(!Number.isInteger(tabId)){sendResponse({ok:false,message:"Aktif sekme bulunamadı."});return;} extractAudio(tabId,message).then(sendResponse); return true; }
  if(message?.type==="OPEN_URL") { browserApi.tabs.create({url:message.url}).then(()=>sendResponse({ok:true})).catch(e=>sendResponse({ok:false,message:e.message})); return true; }
  if(message?.type==="GET_ACTIVE_TAB") { browserApi.tabs.query({active:true,currentWindow:true}).then(t=>sendResponse({ok:true,tab:t[0]||null})).catch(e=>sendResponse({ok:false,message:e.message})); return true; }
});

browserApi.tabs?.onRemoved?.addListener(async tabId=>{
  memoryMedia.delete(tabId); const area=await storageArea(); try{await area?.remove?.(cacheKey(tabId));}catch{}
});

browserApi.downloads?.onChanged?.addListener(async delta=>{
  if(!delta?.state?.current) return;
  if(delta.state.current==="complete") {
    try { const items=await browserApi.downloads.search({id:delta.id}); const name=(items?.[0]?.filename||"").split(/[\\/]/).pop()||"Dosya"; await notify("İndirme tamamlandı",name); } catch { await notify("İndirme tamamlandı","Dosya başarıyla kaydedildi."); }
  } else if(delta.state.current==="interrupted") await notify("İndirme kesildi","Ağ veya tarayıcı kaynaklı bir hata nedeniyle indirme tamamlanamadı.");
});
