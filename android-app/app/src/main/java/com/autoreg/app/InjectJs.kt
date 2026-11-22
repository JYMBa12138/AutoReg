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

  // 按钮是不是躺在「条款/同意」那种遮罩里：这种按钮归 acceptConsent 管，不能拿去提交注册
  function inConsentBox(el) {
    var p = el;
    for (var i = 0; i < 4 && p; i++) {
      p = p.parentElement;
      if (!p) break;
      var tx = (p.innerText || '').slice(0, 600);
      if (/条款|服务条款|隐私政策|使用政策|terms of service|privacy policy|terms update|policy update/i.test(tx) &&
          /拒绝|不同意|decline|reject/i.test(tx)) return true;
    }
    return false;
  }

  function findSubmit() {
    var nodes = document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"], [role="button"], .btn');
    // 强：明确是注册/提交；弱：流程推进词（有的站按钮就叫「继续」「下一步」）
    var strong = /创建账户|创建账号|注册|提交|完成注册|sign up|signup|register|create account|submit/i;
    var weak = /^(继续|下一步|继续注册|下一步骤|continue|next|proceed)$/i;
    var bad = /登录|login|sign in|github|linuxdo|linux\.do|发送验证码|获取验证码|发验证码|重发|重新发送|send code|resend|手机|短信|sms|phone/i;
    var consent = /同意|接受|agree|accept|decline|拒绝|不同意|取消|cancel|later/i;
    var best = null, bestScore = 0;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var t = (n.innerText || n.value || n.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 24) continue;
      if (bad.test(t) || consent.test(t)) continue;
      if (n.offsetParent === null || n.disabled) continue;
      var score = strong.test(t) ? 2 : (weak.test(t) ? 1 : 0);
      if (!score) continue;
      if (inConsentBox(n)) continue;
      if (score > bestScore) { best = n; bestScore = score; }
    }
    return best;
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

  function mailReady() {
    try { return !!(window.Android && window.Android.isMailReady && window.Android.isMailReady()); } catch (e) { return false; }
  }

  function findSendBtn() {
    var nodes = document.querySelectorAll('button, a[role="button"], .btn, input[type="button"]');
    var re = /发送验证码|获取验证码|发验证码|获取邮箱验证码|send code|send verification|get code|发送/;
    for (var i = 0; i < nodes.length; i++) {
      var t = (nodes[i].innerText || nodes[i].value || nodes[i].textContent || '').trim();
      if (re.test(t) && !/手机|短信|sms|phone/i.test(t) && nodes[i].offsetParent !== null) return nodes[i];
    }
    return null;
  }

  function findCodeInput() {
    var sel = 'input[name*="code" i], input[id*="code" i], input[name*="verify" i], input[id*="verify" i],' +
      'input[name*="captcha" i], input[placeholder*="验证码"], input[placeholder*="verification"],' +
      'input[autocomplete="one-time-code"], input[inputmode="numeric"]';
    var els;
    try { els = document.querySelectorAll(sel); } catch (e) { return null; }
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.offsetParent === null || el.disabled) continue;
      if ((el.type || '') === 'password') continue;
      return el;
    }
    return null;
  }

  function findConfirm() {
    var nodes = document.querySelectorAll('button, input[type="submit"], [role="button"], .btn');
    var re = /^(确认|确定|验证|下一步|继续|提交|完成|verify|confirm|next|continue|submit|ok)$/i;
    for (var i = 0; i < nodes.length; i++) {
      var t = (nodes[i].innerText || nodes[i].value || nodes[i].textContent || '').trim();
      if (re.test(t) && nodes[i].offsetParent !== null) return nodes[i];
    }
    return null;
  }

  // 站点有时先弹「条款更新通知 —— 同意并继续」或者 cookie 同意条，挡在注册页前面，自动点掉它
  var consentRe = /^(同意并继续|同意并继续使用|同意并继续注册|我同意|同意|接受|接受并继续|接受全部|继续使用|agree and continue|agree & continue|accept and continue|accept all|i agree|agree|accept|continue)$/i;
  var denyRe = /拒绝|不同意|不接受|取消|稍后|decline|reject|cancel|disagree|later/i;

  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 };
    return r.width > 0 && r.height > 0;
  }

  function findConsentButton() {
    var nodes = document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var t = (n.innerText || n.value || n.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 24) continue;
      if (denyRe.test(t)) continue;
      if (!consentRe.test(t)) continue;
      if (!visible(n) || n.disabled) continue;
      return n;
    }
    return null;
  }

  var consentState = { clicked: 0, lastText: '' };

  function acceptConsent() {
    if (consentState.clicked >= 15) return false;
    var b = findConsentButton();
    if (!b) return false;
    var t = (b.innerText || b.value || b.textContent || '').replace(/\s+/g, ' ').trim();
    consentState.clicked++;
    consentState.lastText = t;
    try { b.click(); } catch (e) {}
    A.onLog('弹出条款/同意提示，已点「' + t + '」');
    return true;
  }

  var codeState = { asked: false, asked2: false, got: false, manual: false };

  function clickConfirm(codeEl) {
    var b = findConfirm();
    if (b) { b.click(); return true; }
    if (codeEl) {
      codeEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      codeEl.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
      return true;
    }
    return false;
  }

  function fillCode(code) {
    var el = findCodeInput();
    if (!el) { A.onResult(false, '页面上找不到验证码输入框'); return false; }
    codeState.got = true;
    setVal(el, code);
    A.onLog('已填验证码 ' + code);
    if (!clickConfirm(el)) A.onLog('没找到确认按钮，回车代替提交');
    return true;
  }

  // 页面要邮箱验证码这一步：点发送 → 问 App 要码 → 填进去 → 继续
  function emailCodeStep(email, next) {
    var sendBtn = findSendBtn();
    var codeEl = findCodeInput();
    if (!sendBtn && !codeEl) { next(); return; }

    if (sendBtn && codeState.asked === false) {
      A.onLog('这个站要邮箱验证码，点发送验证码');
      codeState.asked = true;
      sendBtn.click();
      A.onLog('已点发送验证码，等验证码框出现');
    } else if (codeEl) {
      A.onLog('页面上已经有验证码框');
    }

    var waited = 0;
    var iv = setInterval(function () {
      if (state.done) { clearInterval(iv); return; }
      if (codeState.got) { clearInterval(iv); next(); return; }
      var el = findCodeInput();
      waited += 1000;
      if (el && !mailReady() && !codeState.manual) {
        codeState.manual = true;
        A.onStatus('这个站要邮箱验证码。在上面填 IMAP 收信我会自己取，或者在这里手动填（最多等 5 分钟）');
      }
      if (el && !codeState.asked2) {
        if (mailReady()) {
          codeState.asked2 = true;
          A.onStatus('等验证码邮件…');
          var ok = false;
          try { ok = window.Android.requestCode(email); } catch (e) { ok = false; }
          if (!ok) A.onLog('App 取码请求失败');
        } else {
          // 没配 IMAP：让人手填，填了就往下走
          codeState.asked2 = true;
          A.onStatus('等你手填验证码（最多等 5 分钟）');
        }
      }
      if (codeState.asked2 && !mailReady()) {
        var v = el ? String(el.value || '').trim() : '';
        if (/^\d{4,8}$/.test(v)) { codeState.got = true; }
      }
      if (waited > 300000) {
        clearInterval(iv);
        A.onResult(false, '等验证码超时，请在网页里手动填一下');
      }
    }, 1000);
  }

  var state = { filled: false, submitted: false, done: false };

  function fillOnce(email, user, pass) {
    var em = pick('input[type="email"], #email, input[name="email"], input[name="mail"]');
    var un = pick('input[name="username"], #username, input[name="user"], input[name="nickname"], input[name="user_name"], input[placeholder*="用户名"]');
    var pws = document.querySelectorAll('input[type="password"]');
    if (!em && !un && pws.length === 0) return false;
    if (em) { setVal(em, email); A.onLog('已填邮箱'); }
    else if (un) { setVal(un, user || email); A.onLog('已填用户名'); }
    // 邮箱和用户名是同一个框就不重复填
    if (em && un && un !== em && user) { setVal(un, user); A.onLog('已填用户名'); }
    var filledPw = 0;
    for (var i = 0; i < pws.length; i++) {
      if (pws[i].offsetParent === null) continue;
      setVal(pws[i], pass);
      filledPw++;
    }
    if (filledPw) A.onLog(filledPw >= 2 ? '已填密码（含确认密码 ' + filledPw + ' 个框）' : '已填密码');
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
    run: function (email, user, pass) {
      A.onStatus('正在填写表单');
      var tries = 0;
      var filled = false;

      // 全程盯着条款/同意提示：挡住注册页就点「同意并继续」，点完等页面刷新再重新找输入框
      var consentIv = setInterval(function () {
        if (state.done) { clearInterval(consentIv); return; }
        if (acceptConsent()) {
          setTimeout(function () {
            if (state.done) return;
            if (fillOnce(email, user, pass)) {
              if (!filled) {
                filled = true;
                if (fillIv) clearInterval(fillIv);
                A.onStatus('表单已填写，等待人机验证');
                emailCodeStep(email, pollToken);
              }
            }
          }, 1500);
        }
      }, 1200);
      var consentDeadline = setTimeout(function () { clearInterval(consentIv); }, 600000);

      var fillIv = setInterval(function () {
        tries++;
        if (state.done) { clearInterval(fillIv); clearInterval(consentIv); clearTimeout(consentDeadline); return; }
        if (fillOnce(email, user, pass)) {
          clearInterval(fillIv);
          if (!filled) {
            filled = true;
            A.onStatus('表单已填写，等待人机验证');
            emailCodeStep(email, pollToken);
          }
        } else if (tries > 150) {
          clearInterval(fillIv);
          clearInterval(consentIv);
          A.onResult(false, '页面上找不到输入框，可能站点结构变了（有弹窗挡住就手动点一下「同意并继续」）');
        }
      }, 800);
    },
    ping: function () { return 'ok'; },
    onCode: function (code) {
      A.onLog('收到验证码 ' + code);
      fillCode(code);
    },
    onCodeFail: function (msg) {
      A.onStatus('收信没拿到码（' + msg + '），请手动填验证码');
      codeState.asked2 = true;
      codeState.manual = true;
    }
  };
})();"""
}
