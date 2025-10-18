// Vercel Edge Middleware to serve server-side preview HTML to crawlers
// For requests like /article.html?Some%20Title or /article.html?title=Some%20Title

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

export default function middleware(req) {
  try{
    const ua = req.headers.get('user-agent') || '';
    if(!isCrawler(ua)) return;

    const url = new URL(req.url);
    // we only rewrite requests to article.html that include a query (title)
    if(url.pathname === '/article.html' && (url.search || url.searchParams.get('title'))){
      // keep title param as-is and proxy to /api/preview
      const title = url.search ? url.search.replace(/^\?/, '') : '';
      const dest = `/api/preview?${title}`;
      return Response.redirect(dest, 307);
    }
  }catch(e){ /* swallow errors to avoid breaking normal requests */ }
}

export const config = {
  matcher: ['/article.html']
};
