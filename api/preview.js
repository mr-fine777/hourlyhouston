import { MongoClient } from 'mongodb';

// GET /api/preview?title=Exact%20Article%20Title
// Returns a minimal HTML page with Open Graph + Twitter meta tags populated from MongoDB

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'HourlyHouston';
const MONGODB_COLLECTION = process.env.MONGODB_COLLECTION || 'Articles';

let cachedClient = null;
let cachedDb = null;

async function connect() {
  if (cachedClient && cachedDb) return { client: cachedClient, db: cachedDb };
  if (!MONGODB_URI) throw new Error('MONGODB_URI not configured');
  const client = new MongoClient(MONGODB_URI, { ignoreUndefined: true });
  await client.connect();
  const db = client.db(MONGODB_DB);
  cachedClient = client; cachedDb = db;
  return { client, db };
}

function absolutizeImage(url, host) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.href;
  } catch (e) {
    // relative path -> make absolute using host
    if (!host) return url;
    return `${host.replace(/\/$/, '')}/${url.replace(/^\/*/, '')}`;
  }
}

export default async function handler(req, res) {
  try {
  // support ?title=Exact Title or ?t= or ?slug=hyphenated-slug
  const title = req.query && (req.query.title || req.query.t) ? (req.query.title || req.query.t) : null;
  const slug = req.query && req.query.slug ? req.query.slug : null;
  // Accept either a title or a slug; if only slug is provided we'll try slug-based lookup.
  if (!title && !slug) return res.status(400).send('Missing title or slug');
    const { db } = await connect();
    const col = db.collection(MONGODB_COLLECTION);
    let doc = null;
    if(slug){
      // convert slug back to a title-like string and do case-insensitive match
      const slugToTitle = slug.replace(/-/g, ' ').replace(/\s+/g,' ').trim();
      doc = await col.findOne({ title: { $regex: `^${escapeForRegex(slugToTitle)}$`, $options: 'i' } }, { projection: { title: 1, body: 1, url: 1, scrapedAt: 1 } });
      // If slug lookup failed, as a fallback try matching the slug against a stored slug field (if present)
      if(!doc){
        doc = await col.findOne({ slug: slug }, { projection: { title: 1, body: 1, url: 1, scrapedAt: 1 } });
      }
    } else {
      doc = await col.findOne({ title: title }, { projection: { title: 1, body: 1, url: 1, scrapedAt: 1 } });
    }
    if (!doc) return res.status(404).send('Not found');

  const proto = (req.headers['x-forwarded-proto'] || 'https');
  const host = req.headers.host ? `${proto}://${req.headers.host}` : '';
    const image = absolutizeImage(doc.url || '', host);
    const description = (doc.body || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const published = doc.scrapedAt ? new Date(doc.scrapedAt).toISOString() : '';

  // helpful debug headers so you can tell if the preview endpoint was hit
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Preview-Found', '1');
  res.setHeader('X-Preview-Title', String(doc.title || ''));
    // cache briefly on CDN
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(doc.title || 'Article')}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Hourly Houston">
  <meta property="og:title" content="${escapeHtml(doc.title || '')}">
  <meta property="og:description" content="${escapeHtml(description)}">
  ${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ''}
  ${published ? `<meta property="article:published_time" content="${escapeHtml(published)}">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(doc.title || '')}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  ${image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : ''}
  <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fff;color:#111;padding:18px}</style>
</head>
<body>
  <article>
    <h1>${escapeHtml(doc.title || '')}</h1>
    ${image ? `<p><img src="${escapeHtml(image)}" alt="${escapeHtml(doc.title || '')}" style="max-width:480px;width:100%;height:auto;border-radius:8px"></p>` : ''}
    <p>${escapeHtml(description)}</p>
  </article>
</body>
</html>`;

    res.status(200).send(html);
  } catch (err) {
    console.error('preview error', err);
    res.status(500).send('Server error');
  }
}

function escapeHtml(str){
  if(!str) return '';
  return String(str).replace(/[&<>\"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]; });
}

function escapeForRegex(s){
  if(!s) return '';
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
