/**
 * 外观首屏启动脚本（内联到 <head>，避免主题闪烁）
 * 优先级：用户本地偏好 site_appearance_v1 > 后台样式设置 admin_style_v1
 * - theme: light / dark / system（system 或缺省跟随系统）
 */
export const APPEARANCE_BOOT = `(function(){try{var r=document.documentElement;var p=null,s=null;try{p=JSON.parse(localStorage.getItem("site_appearance_v1")||"null")}catch(e){}try{s=JSON.parse(localStorage.getItem("admin_style_v1")||"null")}catch(e){}var t=(p&&p.theme)||(s&&s.theme);if(t==="dark")r.setAttribute("data-theme","dark");else if(t==="light")r.setAttribute("data-theme","light");else r.setAttribute("data-theme",window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");if(s&&s.accent)r.style.setProperty("--green",s.accent);}catch(e){}})();`;

/**
 * 前台模板首屏启动脚本（内联到 <head>，避免模板切换闪烁）
 * - 读取上次缓存的模板（localStorage front_theme_cache_v1）并写入 <html data-frontend>
 * - 静态导出下页面 DOM 同时包含模板一/模板二两套结构，靠该属性 + CSS 决定显示哪套
 * - 未命中缓存时默认模板一；随后 FrontThemeProvider 会拉取后台设置并回写缓存
 */
export const FRONT_THEME_BOOT = `(function(){try{var t=localStorage.getItem("front_theme_cache_v1");document.documentElement.setAttribute("data-frontend",t==="v2"?"v2":"v1");}catch(e){document.documentElement.setAttribute("data-frontend","v1");}})();`;
