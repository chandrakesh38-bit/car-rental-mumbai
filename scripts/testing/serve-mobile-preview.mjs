import http from 'node:http';

const port=Number(process.env.CWD_MOBILE_PREVIEW_PORT||4314);
const base=`http://127.0.0.1:${Number(process.env.CWD_PREVIEW_PORT||4312)}`;
const html=width=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CWD mobile preview</title>
<style>html{height:100%}body{box-sizing:border-box;height:100vh;height:100dvh;margin:0;padding:0 8px 8px;display:flex;flex-direction:column;overflow:hidden;background:#e8eef5;color:#123f6c;font:12px system-ui;text-align:center}header{flex:none;padding:8px 0}h1{font-size:16px;margin:0 0 4px}a{color:#123f6c}iframe{display:block;flex:1 1 auto;min-height:0;width:${width}px;max-width:100%;max-height:844px;margin:0 auto;border:0;outline:1px solid #becddd;border-radius:12px;background:white}p{margin:4px 0}</style>
<header><h1>CWD mobile preview · ${width}px</h1><p>Local test · Demo OTP: <strong>012345</strong> · Simulated SMS &amp; payments</p><p><a href="/?width=327">327px</a> · <a href="/?width=390">390px</a> · <a href="${base}/" target="_blank">Open full page</a> · <a href="${base}/coupon-review" target="_blank">Screenshots &amp; report</a></p></header>
<iframe title="Interactive CWD mobile booking preview" src="${base}/" allow="clipboard-read; clipboard-write"></iframe></html>`;
http.createServer((req,res)=>{const width=new URL(req.url,'http://localhost').searchParams.get('width')==='327'?327:390;res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html(width));}).listen(port,'127.0.0.1',()=>console.log(`Mobile preview: http://127.0.0.1:${port}/ (local catalogue/API preview: ${base})`));
