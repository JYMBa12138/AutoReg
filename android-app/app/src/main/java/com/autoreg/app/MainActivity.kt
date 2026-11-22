package com.autoreg.app

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var statusText: TextView
    private lateinit var urlInput: EditText
    private lateinit var emailInput: EditText
    private lateinit var passwordInput: EditText
    private lateinit var usernameInput: EditText
    private lateinit var siteSpinner: Spinner
    private lateinit var mHost: EditText
    private lateinit var mPort: EditText
    private lateinit var mUser: EditText
    private lateinit var mPass: EditText

    private var pending: String? = null

    @Volatile
    private var mailCfg: ImapCode.Cfg? = null

    data class Site(val name: String, val url: String)

    private val sites = listOf(
        Site("星驰 API (xingchiapi.com)", "https://xingchiapi.com/register?aff=YEBlQMo6DFM25"),
        Site("启源星 (chuan.sylu.cc)", "https://chuan.sylu.cc/sign-up?aff=UpsG"),
        Site("自定义地址", "")
    )

    private val presets = mapOf(
        "qq.com" to "imap.qq.com",
        "foxmail.com" to "imap.qq.com",
        "163.com" to "imap.163.com",
        "126.com" to "imap.126.com",
        "yeah.net" to "imap.yeah.net",
        "188.com" to "imap.188.com",
        "gmail.com" to "imap.gmail.com",
        "googlemail.com" to "imap.gmail.com",
        "outlook.com" to "outlook.office365.com",
        "hotmail.com" to "outlook.office365.com",
        "live.com" to "outlook.office365.com",
        "msn.com" to "outlook.office365.com",
        "sina.com" to "imap.sina.com",
        "sina.cn" to "imap.sina.cn",
        "sohu.com" to "imap.sohu.com",
        "139.com" to "imap.139.com",
        "aliyun.com" to "imap.aliyun.com"
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        web = findViewById(R.id.webView)
        statusText = findViewById(R.id.statusText)
        urlInput = findViewById(R.id.urlInput)
        emailInput = findViewById(R.id.emailInput)
        passwordInput = findViewById(R.id.passwordInput)
        usernameInput = findViewById(R.id.usernameInput)
        siteSpinner = findViewById(R.id.siteSpinner)
        mHost = findViewById(R.id.mhost)
        mPort = findViewById(R.id.mport)
        mUser = findViewById(R.id.muser)
        mPass = findViewById(R.id.mpass)

        setupWebView()

        val names = sites.map { it.name }
        siteSpinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, names)
        siteSpinner.setSelection(0)
        urlInput.setText(sites[0].url)
        siteSpinner.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: android.widget.AdapterView<*>?, view: android.view.View?, position: Int, id: Long) {
                if (sites[position].url.isNotEmpty()) urlInput.setText(sites[position].url)
            }
            override fun onNothingSelected(parent: android.widget.AdapterView<*>?) {}
        }

        loadMailPrefs()
        if (mHost.text.isEmpty()) mHost.setText(detectHost(emailInput.text.toString()))

        // 邮箱一改，IMAP 主机跟着猜（只填空的，不动手填过的）
        emailInput.setOnFocusChangeListener { _, _ -> maybeAutofillHost() }
        emailInput.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) { maybeAutofillHost() }
        })

        findViewById<Button>(R.id.startBtn).setOnClickListener { start() }
        findViewById<Button>(R.id.clearBtn).setOnClickListener { reset() }
        findViewById<Button>(R.id.mtest).setOnClickListener { testMail() }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val s: WebSettings = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.loadsImagesAutomatically = true
        s.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        s.userAgentString = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        web.addJavascriptInterface(Bridge(), "Android")
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                injectAndRun()
            }
        }
        web.webChromeClient = WebChromeClient()
    }

    private fun injectAndRun() {
        val p = pending ?: return
        val call: String
        try {
            val o = JSONObject(p)
            call = "window.__autoreg && window.__autoreg.run(" +
                JSONObject.quote(o.optString("email")) + "," +
                JSONObject.quote(o.optString("user")) + "," +
                JSONObject.quote(o.optString("pass")) + ")"
        } catch (e: Exception) {
            statusText.text = "参数有误：" + e.message
            return
        }
        web.evaluateJavascript(InjectJs.SCRIPT) {
            web.evaluateJavascript(call, null)
        }
    }

    private fun start() {
        val email = emailInput.text.toString().trim()
        val password = passwordInput.text.toString()
        val username = usernameInput.text.toString().trim()
        val url = urlInput.text.toString().trim()

        if (!android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches()) {
            toast("请输入正确的邮箱")
            return
        }
        if (password.length < 8) {
            toast("密码至少 8 位")
            return
        }
        if (!url.startsWith("http")) {
            toast("请填写以 http 开头的注册页地址")
            return
        }

        saveMailPrefs()
        mailCfg = buildMailCfg(email)
        mailCfg?.let { statusText.text = "邮箱收信已就绪（" + it.host + "）" }

        statusText.text = "正在打开注册页…"
        pending = JSONObject()
            .put("email", email)
            .put("user", if (username.isNotEmpty()) username else email.substringBefore("@"))
            .put("pass", password)
            .toString()

        web.loadUrl(url)
    }

    private fun reset() {
        emailInput.setText("")
        passwordInput.setText("")
        usernameInput.setText("")
        statusText.text = "已清空。填好邮箱和密码，点「开始注册」。"
        pending = null
        web.loadUrl("about:blank")
    }

    // ---------- IMAP ----------

    private fun detectHost(email: String): String {
        val domain = email.substringAfter("@", "").trim().lowercase()
        if (domain.isEmpty()) return ""
        return presets[domain] ?: ""
    }

    private fun maybeAutofillHost() {
        val guess = detectHost(emailInput.text.toString())
        if (guess.isEmpty()) return
        if (mHost.text.toString().trim().isEmpty()) mHost.setText(guess)
        if (mPort.text.toString().trim().isEmpty()) mPort.setText("993")
    }

    private fun buildMailCfg(email: String): ImapCode.Cfg? {
        val host = mHost.text.toString().trim()
        val pass = mPass.text.toString()
        if (host.isEmpty() || pass.isEmpty()) return null
        val port = mPort.text.toString().trim().toIntOrNull() ?: 993
        val user = mUser.text.toString().trim().ifEmpty { email }
        return ImapCode.Cfg(host = host, port = port, user = user, pass = pass, ssl = port == 993 || port == 995)
    }

    private fun prefs() = getSharedPreferences("autoreg", MODE_PRIVATE)

    private fun loadMailPrefs() {
        val sp = prefs()
        mHost.setText(sp.getString("mhost", ""))
        val p = sp.getInt("mport", 0)
        if (p > 0) mPort.setText(p.toString())
        mUser.setText(sp.getString("muser", ""))
        mPass.setText(sp.getString("mpass", ""))
    }

    private fun saveMailPrefs() {
        prefs().edit()
            .putString("mhost", mHost.text.toString().trim())
            .putInt("mport", mPort.text.toString().trim().toIntOrNull() ?: 0)
            .putString("muser", mUser.text.toString().trim())
            .putString("mpass", mPass.text.toString())
            .apply()
    }

    private fun testMail() {
        saveMailPrefs()
        val cfg = buildMailCfg(emailInput.text.toString().trim())
        if (cfg == null) {
            toast("IMAP 主机和密码/授权码都要填")
            return
        }
        statusText.text = "正在连 " + cfg.host + ":" + cfg.port + " …"
        Thread {
            val msg = try {
                "✅ " + ImapCode.test(cfg)
            } catch (e: Exception) {
                "❌ " + (e.message ?: e.toString())
            }
            runOnUiThread {
                statusText.text = msg
                toast(msg)
            }
        }.start()
    }

    private fun toast(m: String) {
        Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
    }

    inner class Bridge {
        @JavascriptInterface
        fun onLog(msg: String) = runOnUiThread { statusText.text = msg }

        @JavascriptInterface
        fun onStatus(msg: String) = runOnUiThread { statusText.text = msg }

        @JavascriptInterface
        fun onResult(ok: Boolean, msg: String) = runOnUiThread {
            statusText.text = (if (ok) "✔ " else "✘ ") + msg
            toast(if (ok) "注册完成" else msg)
        }

        /** 页面要验证码时先问一句：App 这边有没有配好收信。 */
        @JavascriptInterface
        fun isMailReady(): Boolean = mailCfg != null

        /** 去收件箱里捞一封最近发到 email 的验证码邮件；结果异步回给页面。 */
        @JavascriptInterface
        fun requestCode(email: String): Boolean {
            val cfg = mailCfg ?: buildMailCfg(email) ?: return false
            mailCfg = cfg
            val target = email.trim()
            runOnUiThread { statusText.text = "去收件箱找验证码…" }
            Thread {
                var code: String? = null
                var fail: String? = null
                try {
                    val hit = ImapCode.latestCode(cfg, target, 20)
                    if (hit == null) fail = "最近 20 分钟没收到带验证码的邮件"
                    else code = hit.first
                } catch (e: Exception) {
                    fail = e.message ?: e.toString()
                }
                runOnUiThread {
                    if (code != null) {
                        statusText.text = "收到验证码 " + code
                        web.evaluateJavascript(
                            "window.__autoreg && window.__autoreg.onCode(" + JSONObject.quote(code) + ")",
                            null
                        )
                    } else {
                        statusText.text = "收信失败：" + (fail ?: "未知错误")
                        web.evaluateJavascript(
                            "window.__autoreg && window.__autoreg.onCodeFail(" + JSONObject.quote(fail ?: "未知错误") + ")",
                            null
                        )
                    }
                }
            }.start()
            return true
        }
    }
}
