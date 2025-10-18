// Vercel Edge Middleware (plain Web API) — avoid importing next/server so this compiles
// It detects crawler user agents and redirects them to the preview endpoint.

const CRAWLER_UAS = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /bingbot/i,
  /slurp/i
];

function isCrawler(ua){
  if(!ua) return false;
  return CRAWLER_UAS.some(rx => rx.test(ua));
}

export default function middleware(req){
  try{
    const ua = req.headers.get('user-agent') || '';
    if(!isCrawler(ua)) return;

    const url = new URL(req.url);
    if(url.pathname === '/article.html' && (url.search || url.searchParams.get('title'))){
      const titleQuery = url.search ? url.search.replace(/^\?/, '') : '';
      // Redirect crawlers to the preview API which returns server-rendered OG meta
      const dest = `${url.origin}/api/preview?${titleQuery}`;
      return Response.redirect(dest, 307);
    }
  }catch(e){ /* swallow errors to avoid breaking normal requests */ }
  // returning undefined lets the request continue to normal file handling
}

export const config = {
  matcher: ['/article.html']
};
