/**
 * 外观首屏启动脚本（内联到 <head>，避免主题闪烁）
 * 优先级：用户本地偏好 site_appearance_v1 > 后台样式设置 admin_style_v1
 * - theme: light / dark / system（system 或缺省跟随系统）
 */
export const APPEARANCE_BOOT = `(function(){try{var r=document.documentElement;var p=null,s=null;try{p=JSON.parse(localStorage.getItem("site_appearance_v1")||"null")}catch(e){}try{s=JSON.parse(localStorage.getItem("admin_style_v1")||"null")}catch(e){}var t=(p&&p.theme)||(s&&s.theme);if(t==="dark")r.setAttribute("data-theme","dark");else if(t==="light")r.setAttribute("data-theme","light");else r.setAttribute("data-theme",window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");if(s&&s.accent)r.style.setProperty("--green",s.accent);}catch(e){}})();`;
