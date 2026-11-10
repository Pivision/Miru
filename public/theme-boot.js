/* 首屏主题引导：必须在第一次绘制前同步跑完，否则深色模式会先闪一下浅色。用普通 <script src> 加载（不是 module，也不带 defer），浏览器会阻塞渲染执行它。判断逻辑与 src/client/lib/hooks/theme.ts 的 applyTheme 一致，但不能合并：这一份要在任何模块加载之前执行。 */
(function () {
  try {
    var v = localStorage.getItem('miru-theme');
    var d =
      v === 'dark' ||
      (v !== 'light' && !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches));
    var e = document.documentElement;
    e.classList.toggle('dark', d);
    e.style.colorScheme = d ? 'dark' : 'light';
  } catch (err) {}
})();
