import { NextResponse } from 'next/server';

// Middleware for Vercel: if a social crawler requests /article.html, rewrite
// the request to /api/preview?title=... so crawlers get server-rendered OG tags.

const CRAWLER_SIGNATURES = [
  'facebookexternalhit', 'facebookplatform', 'twitterbot', 'x-twitterbot',
  'linkedinbot', 'slackbot', 'discordbot', 'whatsapp', 'telegrambot',
  'applebot', 'bingbot', 'googlebot', 'pinterest', 'bitlybot'
];

function isCrawlerUA(ua){
  if(!ua) return false;
  const low = ua.toLowerCase();
  return CRAWLER_SIGNATURES.some(s => low.includes(s));
}

function extractTitleFromSearch(search){
  if(!search) return '';
  // If search contains a key=value like ?title=..., prefer that
  try{
    const sp = new URLSearchParams(search.replace(/^\?/,''));
    if(sp.has('title')) return sp.get('title') || '';
  }catch(e){ /* ignore */ }
  // Otherwise the site uses a raw querystring containing just the title (e.g. ?My%20Title)
  return decodeURIComponent(search.replace(/^\?/,'')).trim();
}

export function middleware(req){
  try{
    const ua = req.headers.get('user-agent') || '';
    const url = new URL(req.url);
    const pathname = url.pathname || '';

    // Handle slug-style article URLs: /articles/my-article-title or /article/my-article-title
    const slugMatch = pathname.match(/^\/(?:articles|article)\/(.+)$/i);
    if(slugMatch){
      const rawSlug = slugMatch[1] || '';
      // slug -> title: replace hyphens with spaces and decode
      const title = decodeURIComponent(rawSlug).replace(/-/g,' ').trim();
      if(!title) return;
      const encoded = encodeURIComponent(title);
      if(isCrawlerUA(ua)){
        // crawlers: rewrite to preview endpoint
        const dest = new URL(`/api/preview?title=${encoded}`, req.url);
        return NextResponse.rewrite(dest);
      } else {
        // regular users: serve interactive article page with title querystring
        const dest = new URL(`/article.html?title=${encoded}`, req.url);
        return NextResponse.rewrite(dest);
      }
    }

    // Fallback: existing behavior for direct article.html requests by crawlers
    if(pathname.endsWith('/article.html')){
      if(!isCrawlerUA(ua)) return;
      const title = extractTitleFromSearch(url.search || '');
      if(!title) return;
      const encoded = encodeURIComponent(title);
      const dest = new URL(`/api/preview?title=${encoded}`, req.url);
      return NextResponse.rewrite(dest);
    }

    return;
  }catch(e){
    // on error, fallback to default behavior (do not block request)
    return;
  }
}

// Run middleware for article patterns and article.html
export const config = {
  matcher: ['/article.html', '/article/:slug*', '/articles/:slug*']
};
