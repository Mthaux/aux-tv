const COLLECTIONS = [
  { id:'journey', channel:'journey', name:'Journey With', playlistId:'PLbHNC0p9g71g' },
  { id:'taste-mthaux', channel:'taste', name:'Taste Buds — Mthaux', playlistId:'PLHqwG7251C1Glekc2bvkd3TAaD-yn4zUu' },
  { id:'taste-network', channel:'taste', name:'Taste Buds — Network Buds', playlistId:'PLlkwifbogSFxh6N8B0wCClpKHUHnx734I' },
  { id:'run', channel:'run', name:'On The Run', playlistId:'PLHqwG7251C1GkpdxETmPsCAc6F3FYWCKY' },
  { id:'originals-a', channel:'originals', name:'A New Chapter', playlistId:'PLQ3_rvkGAsZM' },
  { id:'originals-b', channel:'originals', name:'More AUX Originals', playlistId:'PLExF2bTHY_Xk' }
];
const FALLBACK = { 'originals-a': [{id:'YnASfu7yARo', title:'A New Chapter — Featured Episode', thumbnail:'https://i.ytimg.com/vi/YnASfu7yARo/hqdefault.jpg'}], journey: [{id:'ZJFDZWjqbJE', title:'Journey With — Featured Episode', thumbnail:'https://i.ytimg.com/vi/ZJFDZWjqbJE/hqdefault.jpg'}] };
const json = (status, body) => new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','Cache-Control': status===200?'public, max-age=300, s-maxage=900, stale-while-revalidate=3600':'no-store'}});
async function loadCollection(collection, key) {
  let items=[], nextPageToken='', pages=0;
  do {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('part','snippet,contentDetails,status');
    url.searchParams.set('playlistId',collection.playlistId);
    url.searchParams.set('maxResults','50');
    url.searchParams.set('key',key);
    if(nextPageToken) url.searchParams.set('pageToken',nextPageToken);
    const response = await fetch(url, {signal:AbortSignal.timeout(9000)});
    const data = await response.json();
    if(!response.ok) throw new Error(data.error?.message || `YouTube HTTP ${response.status}`);
    for(const item of data.items||[]) {
      const id = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
      const title = item.snippet?.title;
      if(!id || !title || title==='Private video' || title==='Deleted video' || item.status?.privacyStatus==='private') continue;
      items.push({id,title,description:item.snippet?.description?.slice(0,350)||'',thumbnail:item.snippet?.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,publishedAt:item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt || ''});
    }
    nextPageToken = data.nextPageToken||'';
    pages++;
  } while(nextPageToken && pages<10); // cap at 500 videos per playlist
  return items;
}
export default async function handler(request) {
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS'}});
  if(request.method!=='GET') return json(405,{error:'Method not allowed'});
  const key=process.env.YOUTUBE_API_KEY;
  if(!key) return json(503,{error:'Backend not configured: add YOUTUBE_API_KEY to Netlify environment variables.'});
  const collections = await Promise.all(COLLECTIONS.map(async c=>{
    try {const videos=await loadCollection(c,key); return {...c,videos,warning:videos.length?'': 'Playlist returned no public videos.'};}
    catch(e){return {...c,videos:FALLBACK[c.id]||[],warning:`Playlist sync unavailable: ${e.message}`};}
  }));
  return json(200,{updatedAt:new Date().toISOString(),collections});
}
export const config = {path:'/api/playlists'};
