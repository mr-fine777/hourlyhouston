import { MongoClient } from 'mongodb';

// Simple serverless preview endpoint for social crawlers
// Usage: /api/preview?title=Exact%20Article%20Title
// Returns a minimal HTML document with Open Graph + Twitter meta tags populated from the DB

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase(uri, dbName) {
  if (cachedClient && cachedDb) return { client: cachedClient, db: cachedDb };
  const client = new MongoClient(uri, { ignoreUndefined: true });
  await client.connect();
  const db = client.db(dbName);
  cachedClient = client;
  cachedDb = db;
  return { client, db };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const uri = process.env.MONGODB_URI;
  if (!uri) return res.status(500).send('MONGODB_URI not configured');
  const dbName = process.env.MONGODB_DB || 'HourlyHouston';
  const collectionName = process.env.MONGODB_COLLECTION || 'Articles';

  const titleQuery = req.query && req.query.title ? String(req.query.title) : null;
  if (!titleQuery) return res.status(400).send('Missing title');

  try {
    const { db } = await connectToDatabase(uri, dbName);
    const col = db.collection(collectionName);
    const doc = await col.findOne({ title: titleQuery }, { projection: { title: 1, url: 1, body: 1, scrapedAt: 1 } });
    if (!doc) return res.status(404).send('Not found');

    const title = doc.title || 'Hourly Houston';
    const description = (doc.body || '').split(/\n\n+/)[0] || 'Hourly Houston';
    let image = doc.url || '';
    try{
      if(image && !/^https?:\/\//i.test(image)) image = new URL(image, (req.headers['x-forwarded-proto'] || 'https') + '://' + (req.headers.host || '')).href;
    }catch(e){ /* ignore */ }
    if(!image) image = (req.headers['x-forwarded-proto'] || 'https') + '://' + (req.headers.host || '') + '/ogImage.png';

    const html = `<!doctype html><html><head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${escapeHtml((req.headers['x-forwarded-proto'] || 'https') + '://' + (req.headers.host || '') + req.url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
</head><body>
<p>Preview for ${escapeHtml(title)}</p>
</body></html>`;

    // Cache for crawlers briefly
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).send(html);
  } catch (err) {
    console.error('preview error', err);
    res.status(500).send('Server error');
  }
}

function escapeHtml(s){
  return String(s || '').replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c];
  });
}
