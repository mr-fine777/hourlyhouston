// Vercel/Next middleware: rewrite crawler requests for article pages to server preview
import { NextResponse } from 'next/server';

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

export function middleware(req){
  try{
    const ua = req.headers.get('user-agent') || '';
    if(!isCrawler(ua)) return NextResponse.next();

    const url = new URL(req.url);
    // rewrite requests to article.html that include a query (title) to the preview endpoint
    if(url.pathname === '/article.html' && (url.search || url.searchParams.get('title'))){
      const titleQuery = url.search ? url.search.replace(/^\?/, '') : '';
      const dest = new URL(`/api/preview?${titleQuery}`, req.url);
      return NextResponse.rewrite(dest);
    }
  }catch(e){ /* swallow errors to avoid breaking normal requests */ }
  return NextResponse.next();
}

export const config = {
  matcher: ['/article.html']
};
