// Reads the channel's public numbers from the YouTube Data API and writes data/latest.json + data/history.json.
// Needs YT_API_KEY in the environment (a read-only key restricted to the YouTube Data API). No dependencies.
import fs from "node:fs";
const KEY = process.env.YT_API_KEY;
const CHANNEL = "UC6nhwZHGF1mn0Xar1Lgg6hQ";
if (!KEY) { console.error("YT_API_KEY is not set"); process.exit(1); }
const api = async (path, params) => {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}?` + new URLSearchParams({ ...params, key: KEY }));
  const j = await r.json();
  if (!r.ok) throw new Error(`${path} ${r.status}: ${j.error?.message || "request failed"}`);
  return j;
};
const ch = (await api("channels", { part: "snippet,statistics,contentDetails", id: CHANNEL })).items?.[0];
if (!ch) throw new Error("channel not found");
const ids = [];
for (let pageToken; ;) {
  const p = await api("playlistItems", { part: "contentDetails", playlistId: ch.contentDetails.relatedPlaylists.uploads, maxResults: "50", ...(pageToken ? { pageToken } : {}) });
  ids.push(...p.items.map((i) => i.contentDetails.videoId));
  if (!(pageToken = p.nextPageToken)) break;
}
const videos = [];
for (let i = 0; i < ids.length; i += 50) {
  const v = await api("videos", { part: "snippet,statistics,contentDetails", id: ids.slice(i, i + 50).join(",") });
  for (const x of v.items) videos.push({
    id: x.id, title: x.snippet.title, published: x.snippet.publishedAt,
    thumb: x.snippet.thumbnails?.medium?.url || x.snippet.thumbnails?.default?.url || "",
    duration: x.contentDetails.duration,
    views: +x.statistics.viewCount || 0, likes: +x.statistics.likeCount || 0, comments: +x.statistics.commentCount || 0,
  });
}
videos.sort((a, b) => b.published.localeCompare(a.published));
const now = new Date().toISOString();
const sum = (k) => videos.reduce((n, v) => n + v[k], 0);
const latest = {
  updated: now,
  channel: { title: ch.snippet.title, handle: ch.snippet.customUrl || "", url: `https://www.youtube.com/channel/${CHANNEL}`, subscribers: +ch.statistics.subscriberCount || 0 },
  // the channel-level view counter lags by a day or more, so totals are summed from the videos
  totals: { views: sum("views"), likes: sum("likes"), comments: sum("comments"), videos: videos.length },
  videos,
};
fs.mkdirSync("data", { recursive: true });
let history = [];
try { history = JSON.parse(fs.readFileSync("data/history.json", "utf8")); } catch {}
history.push({ t: now, s: latest.channel.subscribers, v: latest.totals.views, l: latest.totals.likes, c: latest.totals.comments, n: videos.length, per: Object.fromEntries(videos.map((v) => [v.id, v.views])) });
fs.writeFileSync("data/latest.json", JSON.stringify(latest, null, 1) + "\n");
fs.writeFileSync("data/history.json", JSON.stringify(history) + "\n");
console.log(`${now}: ${videos.length} videos, ${latest.totals.views} views, ${latest.channel.subscribers} subscribers, ${history.length} readings`);
