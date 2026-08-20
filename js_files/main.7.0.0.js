(function () {
  'use strict';

  function styleInject(css, ref) {
    if ( ref === void 0 ) ref = {};
    var insertAt = ref.insertAt;

    if (!css || typeof document === 'undefined') { return; }

    var head = document.head || document.getElementsByTagName('head')[0];
    var style = document.createElement('style');
    style.type = 'text/css';

    if (insertAt === 'top') {
      if (head.firstChild) {
        head.insertBefore(style, head.firstChild);
      } else {
        head.appendChild(style);
      }
    } else {
      head.appendChild(style);
    }

    if (style.styleSheet) {
      style.styleSheet.cssText = css;
    } else {
      style.appendChild(document.createTextNode(css));
    }
  }

  var css_248z$1 = "";
  styleInject(css_248z$1);

  var css_248z = "";
  styleInject(css_248z);

  function isIe() {
      // @ts-ignore
      return !!document.documentMode;
  }
  function canUseProxy() {
      try {
          new Proxy({}, {});
          return true;
      }
      catch (e) {
          return false;
      }
      return true;
  }
  function showTips() {
      if (isIe() || !canUseProxy()) {
          /* eslint-disable-next-line no-var */
          var compatiblePageEl = document.createElement("div");
          document.documentElement.style.fontSize = "100px";
          // document.documentElement.classList.add("is-ie");
          if (!document.documentElement.className) {
              document.documentElement.className = "is-ie";
          }
          else {
              document.documentElement.className =
                  document.documentElement.className + " is-ie";
          }
          compatiblePageEl.className = "other-home-wrapper";
          compatiblePageEl.innerHTML =
              '<div class="other-home-wrapper"> <div class="other-home-wrapper__img" style="background: url(&quot;comp/comp_img.' +
                  "7.0.0" +
                  '.png&quot;) center center / contain no-repeat;"></div> <div class="other-home-wrapper__text">当前您的浏览器版本较低，请您将浏览器升级到最新版本后体验 </div> </div>';
          document.body.appendChild(compatiblePageEl);
          /* eslint-disable-next-line no-var */
          var compatiblePageAppElement = document.getElementById("app");
          if (compatiblePageAppElement) {
              // @ts-ignore
              compatiblePageAppElement.parentNode.removeChild(compatiblePageAppElement);
          }
      }
  }
  if (document.body) {
      // 获取到了 document.body，在这里做你需要的操作。
      showTips();
  }
  else {
      // 等待 DOMContentLoaded 事件触发，然后在回调函数中获取 document.body。
      try {
          document.addEventListener("DOMContentLoaded", function () {
              // 执行代码
              showTips();
          });
      }
      catch (e) {
          /* noop */
      }
  }

})();
