/**
 * 外观首屏启动脚本（内联到 <head>，避免主题闪烁）
 * 优先级：用户本地偏好 site_appearance_v1 > 后台样式设置 admin_style_v1
 * - theme: light / dark / system（system 或缺省跟随系统）
 */
export const APPEARANCE_BOOT = `(function(){try{var r=document.documentElement;var p=null,s=null;try{p=JSON.parse(localStorage.getItem("site_appearance_v1")||"null")}catch(e){}try{s=JSON.parse(localStorage.getItem("admin_style_v1")||"null")}catch(e){}var t=(p&&p.theme)||(s&&s.theme);if(t==="dark")r.setAttribute("data-theme","dark");else if(t==="light")r.setAttribute("data-theme","light");else r.setAttribute("data-theme",window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");if(s&&s.accent)r.style.setProperty("--green",s.accent);}catch(e){}})();`;

/**
 * 前台模板首屏启动脚本（内联到 <head>，避免模板切换闪烁）
 * - 读取上次缓存的模板（localStorage front_theme_cache_v1）并写入 <html data-frontend>
 * - 同时按需插入该主题包自己的 /themes/<key>/theme.css（模板一无需额外样式）
 * - 静态导出下无法按请求决定模板，因此先按缓存渲染，随后 FrontThemeProvider 拉取后台设置并回写缓存
 */
export const FRONT_THEME_BOOT = `(function(){try{var t=localStorage.getItem("front_theme_cache_v1")||"v1";t=/^[a-z0-9][a-z0-9_-]*$/.test(t)?t:"v1";document.documentElement.setAttribute("data-frontend",t);if(t!=="v1"){var l=document.createElement("link");l.id="theme-css-"+t;l.rel="stylesheet";l.href="/themes/"+t+"/theme.css";l.setAttribute("data-theme-css",t);document.head.appendChild(l);}}catch(e){document.documentElement.setAttribute("data-frontend","v1");}})();`;
