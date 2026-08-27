(() => {
  if (window.__PVD_HOOK_V132__) return;
  window.__PVD_HOOK_V132__ = true;
  const SOURCE="personal-social-video-downloader";
  const cache=new Map();
  function platform(){return location.hostname.includes("instagram.com")?"instagram":"x";}
  function igContext(){
    let m=location.pathname.match(/^\/stories\/([^/]+)\/(\d+)/i); if(m)return {postKey:`story:${m[2]}`,username:m[1],contentKind:"story"};
    m=location.pathname.match(/^\/(?:reel|reels|p)\/([^/]+)/i); if(m)return {postKey:m[1],contentKind:location.pathname.includes("reel")?"reel":"post"};
    return {postKey:null,contentKind:"feed"};
  }
  function twKey(url=""){const m=String(url).match(/\/(?:ext_tw_video(?:_thumb)?|amplify_video(?:_thumb)?|tweet_video(?:_thumb)?)\/(\d+)/i);return m?m[1]:null;}
  function igVideo(url=""){return (url.includes("cdninstagram.com")||url.includes("fbcdn.net"))&&(url.includes(".mp4")||url.includes("/v/t16/")||url.includes("/o1/v/"));}
  function storeAndPost(list){
    const now=Date.now();
    for(const v of list||[]){if(!v?.url)continue; const p=v.platform||platform(); if(p==="x"&&!v.url.startsWith("https://video.twimg.com/"))continue;if(p==="instagram"&&!igVideo(v.url))continue; cache.set(v.url,{...v,platform:p,seenAt:now});}
    while(cache.size>240) cache.delete(cache.keys().next().value);
    const variants=[...cache.values()].filter(v=>now-(v.seenAt||0)<12*60*1000);
    if(variants.length) window.postMessage({source:SOURCE,type:"MEDIA_VARIANTS",variants},"*");
  }
  function scanX(root){
    const out=[],seen=new WeakSet();
    function walk(v,tid=null,d=0){if(!v||d>55)return;if(typeof v==="string"){if(v.startsWith("https://video.twimg.com/")&&(/\.mp4|\.webm|\.m3u8/i.test(v)))out.push({url:v,platform:"x",tweetId:tid,mediaKey:twKey(v)});return;}if(typeof v!=="object"||seen.has(v))return;seen.add(v);let id=tid;if((v.__typename==="Tweet"||v.legacy?.full_text)&&v.rest_id)id=String(v.rest_id);if(v.video_info?.variants)for(const q of v.video_info.variants)if(q?.url)out.push({url:q.url,platform:"x",tweetId:id,mediaKey:twKey(q.url),bitrate:q.bitrate||0,contentType:q.content_type||""});for(const k of Object.keys(v))try{walk(v[k],id,d+1)}catch{}}
    walk(root);storeAndPost(out);
  }
  function scanIG(root){
    const out=[],seen=new WeakSet(); const initial=igContext();
    function walk(v,ctx=initial,d=0){if(!v||d>60)return;if(typeof v==="string"){if(igVideo(v))out.push({url:v,platform:"instagram",postKey:ctx.postKey,contentKind:ctx.contentKind,contentType:"video/mp4"});return;}if(typeof v!=="object"||seen.has(v))return;seen.add(v);let c={...ctx};if(typeof v.code==="string")c.postKey=v.code;else if(typeof v.shortcode==="string")c.postKey=v.shortcode;if(v.video_versions)for(const q of v.video_versions)if(q?.url)out.push({url:q.url,platform:"instagram",postKey:c.postKey,contentKind:c.contentKind,width:q.width||0,height:q.height||0,contentType:"video/mp4"});if(typeof v.video_url==="string"&&igVideo(v.video_url))out.push({url:v.video_url,platform:"instagram",postKey:c.postKey,contentKind:c.contentKind,contentType:"video/mp4"});for(const k of Object.keys(v))try{walk(v[k],c,d+1)}catch{}}
    walk(root);storeAndPost(out);
  }
  function scanJson(v){platform()==="instagram"?scanIG(v):scanX(v);}
  function inspectUrl(url){const s=String(url||"");return platform()==="instagram"?(s.includes("/api/")||s.includes("/graphql")||s.includes("instagram.com")):(s.includes("/graphql/")||s.includes("/i/api/graphql/")||s.includes("TweetDetail"));}
  const ofetch=window.fetch;
  if(ofetch)window.fetch=function(...args){const u=typeof args[0]==="string"?args[0]:args[0]?.url||"";const p=ofetch.apply(this,args);if(inspectUrl(u))p.then(r=>{try{const c=r.clone();(c.headers.get("content-type")||"").includes("json")&&c.json().then(scanJson).catch(()=>{})}catch{}}).catch(()=>{});return p;};
  const X=window.XMLHttpRequest;if(X?.prototype){const oo=X.prototype.open,os=X.prototype.send;X.prototype.open=function(m,u,...r){this.__pvd_url=String(u||"");return oo.call(this,m,u,...r)};X.prototype.send=function(...a){if(inspectUrl(this.__pvd_url))this.addEventListener("load",()=>{try{if(this.responseType==="json"&&this.response)scanJson(this.response);else if(!this.responseType||this.responseType==="text")scanJson(JSON.parse(this.responseText))}catch{}},{once:true});return os.apply(this,a)}}
  function rescanResources(){const ctx=igContext();const out=[];for(const e of performance.getEntriesByType("resource")){const u=e.name;if(u.startsWith("https://video.twimg.com/")&&(/\.mp4|\.webm|\.m3u8/i.test(u)))out.push({url:u,platform:"x",mediaKey:twKey(u)});else if(igVideo(u))out.push({url:u,platform:"instagram",postKey:ctx.postKey,contentKind:ctx.contentKind,contentType:"video/mp4"});}storeAndPost(out);}
  try{rescanResources();new PerformanceObserver(l=>{const ctx=igContext(),out=[];for(const e of l.getEntries()){const u=e.name;if(u.startsWith("https://video.twimg.com/")&&(/\.mp4|\.webm|\.m3u8/i.test(u)))out.push({url:u,platform:"x",mediaKey:twKey(u)});else if(igVideo(u))out.push({url:u,platform:"instagram",postKey:ctx.postKey,contentKind:ctx.contentKind,contentType:"video/mp4"});}storeAndPost(out)}).observe({type:"resource",buffered:true})}catch{}
  window.addEventListener("message",e=>{if(e.source===window&&e.data?.source===SOURCE&&e.data?.type==="RESCAN_REQUEST"){rescanResources();storeAndPost([])}});
})();
