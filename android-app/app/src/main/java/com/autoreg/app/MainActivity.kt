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

    private var pending: String? = null

    data class Site(val name: String, val url: String)

    private val sites = listOf(
        Site("星驰 API (xingchiapi.com)", "https://xingchiapi.com/register?aff=YEBlQMo6DFM25"),
        Site("启源星 (chuan.sylu.cc)", "https://chuan.sylu.cc/sign-up?aff=UpsG"),
        Site("自定义地址", "")
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

        findViewById<Button>(R.id.startBtn).setOnClickListener { start() }
        findViewById<Button>(R.id.clearBtn).setOnClickListener { reset() }
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
    }
}
