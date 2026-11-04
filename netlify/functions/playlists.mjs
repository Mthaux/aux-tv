const COLLECTIONS = [
  { id: 'journey', channel: 'journey', name: 'Journey With', playlistId: 'PLbHNC0p9g71g' },
  { id: 'taste-mthaux', channel: 'taste', name: 'Taste Buds — Mthaux', playlistId: 'PLHqwG7251C1Glekc2bvkd3TAaD-yn4zUu' },
  { id: 'taste-network', channel: 'taste', name: 'Taste Buds — Network Buds', playlistId: 'PLlkwifbogSFxh6N8B0wCClpKHUHnx734I' },
  { id: 'run', channel: 'run', name: 'On The Run', playlistId: 'PLHqwG7251C1GkpdxETmPsCAc6F3FYWCKY' },
  { id: 'originals-a', channel: 'originals', name: 'A New Chapter', playlistId: 'PLQ3_rvkGAsZM' },
  { id: 'originals-b', channel: 'originals', name: 'More AUX Originals', playlistId: 'PLExF2bTHY_Xk' }
];

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-store'
};

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers });

async function youtube(endpoint, params, key) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);

  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }

  url.searchParams.set('key', key);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || `YouTube HTTP ${response.status}`);
  }

  return data;
}

async function loadCollection(collection, key) {
  const playlistVideos = [];
  let nextPageToken = '';
  let pages = 0;

  do {
    const data = await youtube('playlistItems', {
      part: 'snippet,contentDetails,status',
      playlistId: collection.playlistId,
      maxResults: '50',
      ...(nextPageToken ? { pageToken: nextPageToken } : {})
    }, key);

    for (const item of data.items || []) {
      const id = item.contentDetails?.videoId;
      const title = item.snippet?.title;

      if (!id || !title ||
          title === 'Private video' ||
          title === 'Deleted video') continue;

      playlistVideos.push({
        id,
        title,
        description: item.snippet?.description?.slice(0, 350) || '',
        thumbnail: item.snippet?.thumbnails?.medium?.url ||
          `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        publishedAt: item.contentDetails?.videoPublishedAt ||
          item.snippet?.publishedAt || ''
      });
    }

    nextPageToken = data.nextPageToken || '';
    pages++;
  } while (nextPageToken && pages < 10);

  const unique = [...new Map(
    playlistVideos.map(video => [video.id, video])
  ).values()];

  const eligibleIds = new Set();

  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);

    const data = await youtube('videos', {
      part: 'snippet,status,liveStreamingDetails',
      id: batch.map(video => video.id).join(',')
    }, key);

    for (const video of data.items || []) {
     
const regularVideo =
  video.snippet?.liveBroadcastContent !== 'upcoming' &&
  video.snippet?.liveBroadcastContent !== 'live' &&
  (!video.liveStreamingDetails ||
    Boolean(video.liveStreamingDetails.actualEndTime));

      const embeddable = video.status?.embeddable === true;
      const publicVideo = video.status?.privacyStatus === 'public';

      if (regularVideo && embeddable && publicVideo) {
        eligibleIds.add(video.id);
      }
    }
  }

  return unique
    .filter(video => eligibleIds.has(video.id))
    .sort((a, b) =>
      new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)
    );
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }

  const key = process.env.YOUTUBE_API_KEY;

  if (!key) {
    return json(503, { error: 'Missing YouTube API key' });
  }

  const collections = await Promise.all(
    COLLECTIONS.map(async collection => {
      try {
        const videos = await loadCollection(collection, key);

        return {
          ...collection,
          videos,
          warning: videos.length
            ? ''
            : 'No eligible public episodes found.'
        };
      } catch (error) {
        return {
          ...collection,
          videos: [],
          warning: `Playlist sync unavailable: ${error.message}`
        };
      }
    })
  );

  return json(200, {
    updatedAt: new Date().toISOString(),
    collections
  });
}

export const config = {
  path: '/api/playlists'
};
