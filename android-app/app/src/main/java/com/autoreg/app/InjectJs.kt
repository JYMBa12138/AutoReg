package com.autoreg.app

object InjectJs {
    val SCRIPT: String = """(function () {
  if (window.__autoreg) return;
  var A = window.Android || { onLog: function () {}, onResult: function () {}, onStatus: function () {} };

  function setVal(el, v) {
    if (!el) return false;
    try {
      var d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
      if (d && d.set) d.set.call(el, v); else el.value = v;
    } catch (e) { el.value = v; }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function pick(sel) { try { return document.querySelector(sel); } catch (e) { return null; } }

  function findSubmit() {
    var nodes = document.querySelectorAll('button, input[type="submit"], a[role="button"], .btn');
    var re = /创建账户|注册|提交|sign up|register|create account/i;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var t = (n.innerText || n.value || n.textContent || '').trim();
      if (re.test(t) && !/登录|login|github|linuxdo|linux\.do/i.test(t)) return n;
    }
    return null;
  }

  function hasWidget() {
    if (pick('[name="cf-turnstile-response"]')) return true;
    var ifs = document.querySelectorAll('iframe');
    for (var i = 0; i < ifs.length; i++) {
      var s = ifs[i].src || '';
      if (/turnstile|challenge|recaptcha|hcaptcha|geetest/i.test(s)) return true;
    }
    return !!pick('.cf-turnstile, [id*="cf-chl-widget"]');
  }

  var state = { filled: false, submitted: false, done: false };

  function fillOnce(email, pass, conf) {
    var em = pick('input[type="email"], #email, input[name="email"]');
    var un = pick('input[name="username"], #username, input[name="user"]');
    var pws = document.querySelectorAll('input[type="password"]');
    if (!em && !un && pws.length === 0) return false;
    if (em) { setVal(em, email); A.onLog('已填邮箱'); }
    else if (un) { setVal(un, email); A.onLog('已填用户名'); }
    if (pws.length >= 1) { setVal(pws[0], pass); A.onLog('已填密码'); }
    if (pws.length >= 2) { setVal(pws[1], conf); A.onLog('已填确认密码'); }
    state.filled = true;
    return true;
  }

  function submitNow() {
    if (state.submitted) return;
    state.submitted = true;
    var btn = findSubmit();
    if (!btn) { A.onResult(false, '找不到提交按钮，请手动点击'); return; }
    btn.click();
    A.onStatus('已点击提交，等待结果');
    watch();
  }

  function watch() {
    var start = Date.now();
    var startUrl = location.href;
    var ticks = 0;
    var iv = setInterval(function () {
      ticks++;
      var body = document.body ? document.body.innerText : '';
      var url = location.href;
      if (state.done) { clearInterval(iv); return; }
      if (/注册成功|创建成功|account created|signup success|success/i.test(body) && body.length < 4000) {
        state.done = true; clearInterval(iv); A.onResult(true, '注册成功'); return;
      }
      if (url !== startUrl && !/register|signup/i.test(url)) {
        state.done = true; clearInterval(iv); A.onResult(true, '页面已跳转：' + url); return;
      }
      if (/已被注册|已存在|邮箱.*存在|用户名.*存在|注册失败|验证失败|密码.*不符|invalid|already exists|failed/i.test(body)) {
        state.done = true;
        clearInterval(iv);
        A.onResult(false, body.replace(/\s+/g, ' ').slice(0, 160));
        return;
      }
      if (Date.now() - start > 40000) {
        state.done = true;
        clearInterval(iv);
        A.onResult(false, '未检测到明确结果，请查看下方网页');
      }
    }, 1500);
  }

  function pollToken() {
    var start = Date.now();
    var widgetSeen = false;
    var iv = setInterval(function () {
      if (state.done) { clearInterval(iv); return; }
      var el = pick('[name="cf-turnstile-response"]');
      var v = el && el.value ? String(el.value) : '';
      if (v.length > 20) {
        clearInterval(iv);
        A.onLog('人机验证通过，token 长度 ' + v.length);
        submitNow();
        return;
      }
      if (!widgetSeen && hasWidget()) { widgetSeen = true; A.onLog('检测到人机验证组件，请稍候或点一下复选框'); }
      var body = document.body ? document.body.innerText : '';
      if (/验证失败|人机验证失败|challenge failed/i.test(body)) {
        clearInterval(iv);
        A.onResult(false, '人机验证失败，请在网页里手动完成后重试');
        return;
      }
      var spent = Date.now() - start;
      if (!hasWidget() && spent > 10000) {
        clearInterval(iv);
        A.onLog('页面无验证组件，直接提交');
        submitNow();
        return;
      }
      if (spent > 180000) {
        clearInterval(iv);
        A.onResult(false, '等待人机验证超时，请在网页里手动点一下复选框');
      }
    }, 1000);
  }

  window.__autoreg = {
    run: function (email, pass, conf) {
      A.onStatus('正在填写表单');
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        if (fillOnce(email, pass, conf)) {
          clearInterval(iv);
          A.onStatus('表单已填写，等待人机验证');
          pollToken();
        } else if (tries > 40) {
          clearInterval(iv);
          A.onResult(false, '页面上找不到输入框，可能站点结构变了');
        }
      }, 800);
    },
    ping: function () { return 'ok'; }
  };
})();"""
}
