import { MongoClient } from 'mongodb';

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
    const collectionName = process.env.MONGODB_COLLECTION || 'Articles';

    try {
        const client = new MongoClient(uri);
        await client.connect();
        const db = client.db(dbName);
        const col = db.collection(collectionName);

        const articles = await col.find({}, {
            projection: {
                title: 1,
                url: 1,
                body: 1,
                scrapedAt: 1
            }
        }).sort({ scrapedAt: -1 }).toArray();

        // Generate XML
        const baseUrl = 'https://hourlyhouston.vercel.app';
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
    ${articles.map(article => {
        const firstParagraph = article.body?.split('\n')[0]?.trim() || '';
        const articleUrl = `${baseUrl}/article.html?${encodeURIComponent(article.title)}`;
        const imageUrl = article.url?.startsWith('http') ? article.url : `${baseUrl}${article.url}`;
        return `<url>
        <loc>${articleUrl}</loc>
        <lastmod>${new Date(article.scrapedAt).toISOString()}</lastmod>
        <changefreq>never</changefreq>
        <priority>0.8</priority>
        <news:news>
            <news:publication>
                <news:name>Hourly Houston</news:name>
                <news:language>en</news:language>
            </news:publication>
            <news:publication_date>${new Date(article.scrapedAt).toISOString()}</news:publication_date>
            <news:title>${article.title}</news:title>
        </news:news>
        <image:image>
            <image:loc>${imageUrl}</image:loc>
            <image:title>${article.title}</image:title>
            <image:caption>${firstParagraph}</image:caption>
        </image:image>
        <meta name="description" content="${firstParagraph}" />
        <meta property="og:title" content="${article.title}" />
        <meta property="og:description" content="${firstParagraph}" />
        <meta property="og:image" content="${imageUrl}" />
    </url>`
    }).join('\n    ')}
</urlset>`;

        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Cache-Control', 's-maxage=3600');
        res.status(200).send(xml);

        await client.close();
    } catch (err) {
        console.error('Sitemap generation error:', err);
        res.status(500).json({ error: 'Failed to generate sitemap' });
    }
}