package com.autoreg.app

import java.util.Properties
import javax.mail.Address
import javax.mail.Folder
import javax.mail.Multipart
import javax.mail.Part
import javax.mail.Session
import javax.mail.Store
import javax.mail.internet.InternetAddress

/** 直接连 IMAP 收信取验证码，不依赖任何服务端。 */
object ImapCode {

    data class Cfg(val host: String, val port: Int, val user: String, val pass: String, val ssl: Boolean)

    private val NOISE = Regex("(订单|单号|运单|流水|编号|手机|电话|邮编|快递|跟踪|order|tracking|phone|invoice|serial|ref)", RegexOption.IGNORE_CASE)

    fun test(cfg: Cfg): String {
        val st = store(cfg)
        try {
            val total = folderCount(st)
            return "连接成功，收件箱现有 $total 封邮件"
        } finally {
            runCatching { st.close() }
        }
    }

    /** 最近 minutes 分钟内、发给 email 的邮件里找验证码；返回 (code, subject)。 */
    fun latestCode(cfg: Cfg, email: String, minutes: Int = 20): Pair<String, String>? {
        val st = store(cfg)
        try {
            val f: Folder = st.getFolder("INBOX")
            f.open(Folder.READ_ONLY)
            try {
                val total = f.messageCount
                if (total <= 0) return null
                val from = maxOf(1, total - 19)
                val since = System.currentTimeMillis() - minutes * 60_000L
                var best: Triple<Long, String, String>? = null
                for (i in total downTo from) {
                    val m = try { f.getMessage(i) } catch (e: Exception) { continue }
                    val to = runCatching { m.allRecipients }.getOrNull()
                    if (!toText(to).let { it.isEmpty() || it.contains(email, true) }) continue
                    val subj = runCatching { m.subject ?: "" }.getOrDefault("")
                    val body = runCatching { textOf(m) }.getOrDefault("")
                    val code = extractCode(subj + "\n" + body) ?: continue
                    val ts = runCatching { m.sentDate?.time ?: 0L }.getOrDefault(0L)
                    if (ts < since && best != null) continue
                    if (best == null || (ts >= since && ts > best!!.first)) best = Triple(ts, code, subj)
                }
                return best?.let { it.second to it.third }
            } finally {
                runCatching { f.close(false) }
            }
        } finally {
            runCatching { st.close() }
        }
    }

    private fun store(cfg: Cfg): Store {
        val props = Properties()
        val proto = if (cfg.ssl) "imaps" else "imap"
        props["mail.store.protocol"] = proto
        props["mail.$proto.host"] = cfg.host
        props["mail.$proto.port"] = cfg.port.toString()
        props["mail.$proto.connectiontimeout"] = "15000"
        props["mail.$proto.timeout"] = "20000"
        props["mail.$proto.writetimeout"] = "20000"
        props["mail.$proto.ssl.enable"] = cfg.ssl.toString()
        props["mail.$proto.ssl.trust"] = "*"
        val session = Session.getInstance(props)
        val st = session.getStore(proto)
        st.connect(cfg.host, cfg.port, cfg.user, cfg.pass)
        return st
    }

    private fun folderCount(st: Store): Int {
        val f = st.getFolder("INBOX")
        f.open(Folder.READ_ONLY)
        val n = try { f.messageCount } finally { runCatching { f.close(false) } }
        return n
    }

    private fun toText(addrs: Array<Address>?): String {
        if (addrs == null) return ""
        return addrs.joinToString(" ") { a -> (a as? InternetAddress)?.address ?: a.toString() }
    }

    private fun textOf(p: Part): String {
        val sb = StringBuilder()
        collect(p, sb, 0)
        return sb.toString()
    }

    private fun collect(p: Part, sb: StringBuilder, depth: Int) {
        if (depth > 8) return
        val type = runCatching { (p.contentType ?: "").lowercase() }.getOrDefault("")
        if (type.startsWith("multipart/")) {
            val mp = runCatching { p.content as? Multipart }.getOrNull() ?: return
            for (i in 0 until mp.count) {
                val part = runCatching { mp.getBodyPart(i) }.getOrNull() ?: continue
                collect(part, sb, depth + 1)
            }
            return
        }
        if (type.startsWith("text/") || type.startsWith("message/")) {
            val s = runCatching { p.content as? String }.getOrNull()
                ?: runCatching { p.inputStream.bufferedReader().readText() }.getOrNull() ?: return
            sb.append(stripHtml(s)).append('\n')
        }
    }

    private fun stripHtml(s: String): String =
        s.replace(Regex("<(script|style)[^>]*>[\\s\\S]*?</\\1>", RegexOption.IGNORE_CASE), " ")
            .replace(Regex("&nbsp;"), " ")
            .replace(Regex("<[^>]+>"), " ")

    fun extractCode(text: String): String? {
        if (text.isBlank()) return null
        // 1) 带关键词的 4-8 位数字
        val kw = Regex("(验证码|校验码|动态码|确认码|verification code|verify code|your code|code is|code:|otp|passcode)[^0-9]{0,14}([0-9]{4,8})", RegexOption.IGNORE_CASE)
        kw.find(text)?.let { return it.groupValues[2] }
        // 2) 6 位数字（常见验证码长度），排除年份/噪杂
        val all = Regex("(?:^|[^0-9])([0-9]{4,8})(?![0-9])").findAll(text)
        for (m in all) {
            val v = m.groupValues[1]
            if (v.length == 4 && v.all { it == '0' }) continue
            if (Regex("^(19|20)\\d{2}$").matches(v)) continue
            val s = maxOf(0, m.range.first - 14)
            val e = minOf(text.length, m.range.last + 15)
            if (NOISE.containsMatchIn(text.substring(s, e))) continue
            return v
        }
        return null
    }
}
