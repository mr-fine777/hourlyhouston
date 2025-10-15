import { MongoClient } from 'mongodb';

// Vercel serverless function: GET /api/posts
// Environment variables:
// - MONGODB_URI (required)
// - MONGODB_DB (optional, default: HourlyHouston)
// - MONGODB_COLLECTION (optional, default: posts)

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
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    res.status(500).json({ error: 'MONGODB_URI not configured' });
    return;
  }

  const dbName = process.env.MONGODB_DB || 'HourlyHouston';
  const collectionName = process.env.MONGODB_COLLECTION || 'posts';

  try {
    const { db } = await connectToDatabase(uri, dbName);
    const col = db.collection(collectionName);

    // Return up to 20 most recent posts
    const cursor = col.find({}, { projection: { title: 1, url: 1, body: 1, scrapedAt: 1 } }).sort({ scrapedAt: -1 }).limit(20);
    const docs = await cursor.toArray();

    // Normalize scrapedAt to ISO string for client
    const out = docs.map(d => ({
      _id: d._id,
      title: d.title || '',
      url: d.url || '',
      body: d.body || '',
      scrapedAt: d.scrapedAt ? new Date(d.scrapedAt).toISOString() : null,
    }));

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(200).json(out);
  } catch (err) {
    console.error('DB error', err);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
}
