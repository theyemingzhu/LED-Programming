import { readSessionCookie } from '../library/_shared/accountAuth.js';
import { createD1AccountStore } from '../library/_shared/accountStore.js';

const headers = {
  'cache-control': 'no-store',
  'content-type': 'text/html; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  'vary': 'Cookie',
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
export const OWNER_LOGIN_SCRIPT = `const form=document.querySelector('form');
const message=document.querySelector('[role="alert"]');
form?.addEventListener('submit',async event=>{
  event.preventDefault();const button=form.querySelector('button');button.disabled=true;message.textContent='';
  const data=new FormData(form);const passwordChange=form.dataset.mode==='password';
  const body=passwordChange?{password:data.get('password')}:{username:data.get('username'),password:data.get('password')};
  try {
    const response=await fetch(passwordChange?'/api/account/password':'/api/account/login',{method:'POST',credentials:'same-origin',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const result=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(result?.error?.message||'Sign-in is unavailable. Please try again.');
    form.reset();window.location.replace('/api/owner/studio');
  }catch(error){message.textContent=error.message||'Sign-in is unavailable. Please try again.';button.disabled=false;}
});
document.querySelector('[data-logout]')?.addEventListener('click',async()=>{
  try{const response=await fetch('/api/account/logout',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'});if(!response.ok)throw new Error();window.location.replace('/api/owner/studio');}
  catch{message.textContent='Could not sign out. Please try again.';}
});`;

export function ownerEntryHtml(mode = 'login') {
  const forbidden = mode === 'forbidden';
  const unavailable = mode === 'unavailable';
  const password = mode === 'password';
  const title = forbidden ? 'Owner account needed' : unavailable ? 'Owner tools are unavailable' : password ? 'Choose your password' : 'Owner tools';
  const description = forbidden ? 'This account does not have owner access.' : unavailable ? 'Please try again shortly. Your player is still available.' : password ? 'Replace your temporary password to continue.' : 'Sign in to design and manage your installation.';
  const form = forbidden ? '<button type="button" data-logout>Use another account</button>' : unavailable ? '' : `<form method="post" data-mode="${password ? 'password' : 'login'}">${password ? '' : '<label>Username<input name="username" autocomplete="username" required maxlength="64"></label>'}<label>${password ? 'New password' : 'Password'}<input name="password" type="password" autocomplete="${password ? 'new-password' : 'current-password'}" required ${password ? 'minlength="12"' : ''} maxlength="256"></label><button type="submit">${password ? 'Save password' : 'Open owner tools'}</button></form>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Lightweaver</title><style>*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;background:#f5f2eb;color:#262b28;font:16px system-ui,sans-serif;padding:24px}main{width:100%;max-width:410px}.brand{font-size:12px;letter-spacing:.18em;font-weight:650}h1{font:400 38px Georgia,serif;margin:38px 0 12px}p{color:#626961;line-height:1.6}label{display:grid;gap:8px;margin:20px 0 0}input{width:100%;font:inherit;padding:13px;border:1px solid #bdc3b8;border-radius:8px;background:#fff}button{width:100%;margin:24px 0 8px;border:0;border-radius:8px;padding:14px;font:600 15px system-ui;background:#294736;color:white;cursor:pointer}button:disabled{opacity:.6}a{color:#365a43;text-underline-offset:4px}footer{margin-top:25px}[role=alert]{color:#8d302b;min-height:24px}</style></head><body><main><div class="brand">LIGHTWEAVER</div><h1>${title}</h1><p>${description}</p>${form}<p role="alert" aria-live="polite"></p><footer><a href="https://light.mandalacodes.com/">Back to player</a></footer></main><script src="/api/owner/studio?asset=login.js" defer></script></body></html>`;
}

export async function handleOwnerStudio(context, options = {}) {
  if (context.request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { ...headers, allow: 'GET' } });
  if (new URL(context.request.url).searchParams.get('asset') === 'login.js') {
    return new Response(OWNER_LOGIN_SCRIPT, { headers: { ...headers, 'content-type': 'text/javascript; charset=utf-8' } });
  }
  const page = (mode, status) => new Response(ownerEntryHtml(mode), { status, headers });
  try {
    const store = options.accountStore || createD1AccountStore(context.env);
    if (!store) return page('unavailable', 503);
    const token = readSessionCookie(context.request);
    const identity = token ? await store.authenticateSession(token) : null;
    if (!identity) return page('login', 401);
    if (identity.role !== 'owner') return page('forbidden', 403);
    if (identity.mustChangePassword) return page('password', 403);
    if (!context.env.ASSETS?.fetch) return page('unavailable', 503);
    // Never forward the session cookie to the static asset fetch or its response.
    const asset = await context.env.ASSETS.fetch(new Request(new URL('/index.html', context.request.url), { headers: { accept: 'text/html' } }));
    if (asset.status !== 200) return page('unavailable', 503);
    const responseHeaders = new Headers(asset.headers);
    responseHeaders.set('cache-control', 'no-store');
    responseHeaders.set('vary', 'Cookie');
    responseHeaders.set('x-robots-tag', 'noindex, nofollow');
    responseHeaders.set('x-content-type-options', 'nosniff');
    responseHeaders.delete('set-cookie');
    return new Response(asset.body, { status: 200, headers: responseHeaders });
  } catch {
    return page('unavailable', 503);
  }
}
export const onRequest = context => handleOwnerStudio(context);
