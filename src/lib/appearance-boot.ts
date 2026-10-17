/**
 * 外观首屏启动脚本（内联到 <head>，避免主题/模板闪烁）
 * 优先级：用户本地偏好 site_appearance_v1 > 后台样式设置 admin_style_v1
 * - theme: light / dark / system（system 或缺省跟随系统）
 * - template: modern（默认，绿白毛玻璃）/ classic（经典，蓝灰扁平）
 */
export const APPEARANCE_BOOT = `(function(){try{var r=document.documentElement;var p=null,s=null;try{p=JSON.parse(localStorage.getItem("site_appearance_v1")||"null")}catch(e){}try{s=JSON.parse(localStorage.getItem("admin_style_v1")||"null")}catch(e){}var t=(p&&p.theme)||(s&&s.theme);if(t==="dark")r.setAttribute("data-theme","dark");else if(t==="light")r.setAttribute("data-theme","light");else r.setAttribute("data-theme",window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");var tpl=(p&&p.template)||"modern";if(tpl&&tpl!=="modern")r.setAttribute("data-template",tpl);else r.removeAttribute("data-template");if(s&&s.accent&&tpl!=="classic")r.style.setProperty("--green",s.accent);}catch(e){}})();`;
