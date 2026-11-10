/**
 * 首屏启动遮罩：内联在 HTML 里，样式不依赖任何外部 CSS。
 * 目的：用户中心 / 后台等页面在样式表尚未就绪时，先看到遮罩而不是未加样式的纯文字。
 * 注意：只做“轻量遮罩 + 淡出”，不阻塞页面渲染，最迟 3 秒自动隐藏。
 */
export const BOOT_SPLASH_CSS = `
#boot-splash{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#0b1220;color:#cbd5e1;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;transition:opacity .28s ease;opacity:1}
#boot-splash.boot-hide{opacity:0;pointer-events:none}
#boot-splash .boot-ring{width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.14);border-top-color:#34d399;animation:boot-spin .8s linear infinite}
#boot-splash p{margin:0;font-size:13px;letter-spacing:.08em;color:#94a3b8}
@keyframes boot-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){#boot-splash .boot-ring{animation-duration:1.6s}}
`;

export const BOOT_SCRIPT = `(function(){
  var el=document.getElementById('boot-splash');
  if(!el) return;
  var done=false;
  function hide(){
    if(done) return;
    done=true;
    el.classList.add('boot-hide');
    setTimeout(function(){ if(el && el.parentNode) el.parentNode.removeChild(el); },400);
  }
  function show(){
    done=false;
    el.classList.remove('boot-hide');
    clearTimeout(window.__bootTimer);
    var start=Date.now();
    // 站内跳转时至少显示一小段时间，等新页面的样式表生效后再淡出
    (function tick(){
      if(done) return;
      if(Date.now()-start<260){ requestAnimationFrame(tick); return; }
      hide();
    })();
  }
  function afterLoad(){
    requestAnimationFrame(function(){ requestAnimationFrame(hide); });
  }
  if(document.readyState==='complete') afterLoad();
  else window.addEventListener('load',afterLoad,{once:true});
  setTimeout(hide,3000);
  // 客户端路由跳转时短暂显示遮罩，遮住样式未生效的瞬间
  document.addEventListener('click',function(e){
    var a=e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if(!a) return;
    if(a.target==='_blank'||a.hasAttribute('download')) return;
    if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return;
    var href=a.getAttribute('href')||'';
    if(!href.startsWith('/')||href.startsWith('//')) return;
    if(href===window.location.pathname+window.location.search) return;
    document.body.appendChild(el);
    show();
  },true);
  window.addEventListener('pageshow',function(){ if(document.readyState==='complete') afterLoad(); });
})();`;
