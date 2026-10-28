package com.unscroll.blocker.core

/**
 * Minimal, dependency-free JSON parser/serializer for the enforcer's own
 * state and for policy JSON sent by the app. Pure Kotlin so it runs in plain
 * JVM unit tests. Rejects deeply nested or oversized input.
 */
object MiniJson {
  private const val MAX_DEPTH = 32
  private const val MAX_LENGTH = 512 * 1024

  class ParseException(msg: String) : Exception(msg)

  fun parse(text: String): Any? {
    if (text.length > MAX_LENGTH) throw ParseException("input too large")
    val p = Parser(text)
    p.skipWs()
    val v = p.value(0)
    p.skipWs()
    if (p.i != text.length) throw ParseException("trailing data at ${p.i}")
    return v
  }

  fun stringify(v: Any?): String = StringBuilder().also { write(it, v) }.toString()

  private fun write(sb: StringBuilder, v: Any?) {
    when (v) {
      null -> sb.append("null")
      is Boolean -> sb.append(if (v) "true" else "false")
      is Int, is Long -> sb.append(v.toString())
      is Double -> {
        require(v.isFinite()) { "non-finite number" }
        if (v == Math.floor(v) && Math.abs(v) < 9.0E15) sb.append(v.toLong().toString()) else sb.append(v.toString())
      }
      is Float -> write(sb, v.toDouble())
      is Number -> write(sb, v.toDouble())
      is String -> quote(sb, v)
      is Map<*, *> -> {
        sb.append('{')
        var first = true
        for ((k, value) in v) {
          if (!first) sb.append(',')
          first = false
          quote(sb, k.toString())
          sb.append(':')
          write(sb, value)
        }
        sb.append('}')
      }
      is List<*> -> {
        sb.append('[')
        v.forEachIndexed { idx, item ->
          if (idx > 0) sb.append(',')
          write(sb, item)
        }
        sb.append(']')
      }
      else -> throw IllegalArgumentException("unsupported type ${v::class.java.simpleName}")
    }
  }

  private fun quote(sb: StringBuilder, s: String) {
    sb.append('"')
    for (c in s) {
      when (c) {
        '"' -> sb.append("\\\"")
        '\\' -> sb.append("\\\\")
        '\n' -> sb.append("\\n")
        '\r' -> sb.append("\\r")
        '\t' -> sb.append("\\t")
        else -> if (c < ' ' || c == ' ' || c == ' ') sb.append(String.format("\\u%04x", c.code)) else sb.append(c)
      }
    }
    sb.append('"')
  }

  private class Parser(val s: String) {
    var i = 0

    fun skipWs() {
      while (i < s.length && (s[i] == ' ' || s[i] == '\n' || s[i] == '\r' || s[i] == '\t')) i++
    }

    fun value(depth: Int): Any? {
      if (depth > MAX_DEPTH) throw ParseException("too deep")
      if (i >= s.length) throw ParseException("unexpected end")
      return when (val c = s[i]) {
        '{' -> obj(depth)
        '[' -> arr(depth)
        '"' -> str()
        't' -> lit("true", true)
        'f' -> lit("false", false)
        'n' -> lit("null", null)
        else -> if (c == '-' || c.isDigit()) num() else throw ParseException("unexpected '$c' at $i")
      }
    }

    private fun lit(word: String, v: Any?): Any? {
      if (!s.startsWith(word, i)) throw ParseException("bad literal at $i")
      i += word.length
      return v
    }

    private fun obj(depth: Int): Map<String, Any?> {
      val out = LinkedHashMap<String, Any?>()
      i++
      skipWs()
      if (peek() == '}') { i++; return out }
      while (true) {
        skipWs()
        if (peek() != '"') throw ParseException("expected key at $i")
        val k = str()
        skipWs()
        expect(':')
        skipWs()
        out[k] = value(depth + 1)
        skipWs()
        when (peek()) {
          ',' -> i++
          '}' -> { i++; return out }
          else -> throw ParseException("expected , or } at $i")
        }
      }
    }

    private fun arr(depth: Int): List<Any?> {
      val out = ArrayList<Any?>()
      i++
      skipWs()
      if (peek() == ']') { i++; return out }
      while (true) {
        skipWs()
        out.add(value(depth + 1))
        skipWs()
        when (peek()) {
          ',' -> i++
          ']' -> { i++; return out }
          else -> throw ParseException("expected , or ] at $i")
        }
      }
    }

    private fun str(): String {
      expect('"')
      val sb = StringBuilder()
      while (true) {
        if (i >= s.length) throw ParseException("unterminated string")
        val c = s[i++]
        when {
          c == '"' -> return sb.toString()
          c == '\\' -> {
            if (i >= s.length) throw ParseException("bad escape")
            when (val e = s[i++]) {
              '"' -> sb.append('"')
              '\\' -> sb.append('\\')
              '/' -> sb.append('/')
              'b' -> sb.append('\b')
              'f' -> sb.append('\u000c')
              'n' -> sb.append('\n')
              'r' -> sb.append('\r')
              't' -> sb.append('\t')
              'u' -> {
                if (i + 4 > s.length) throw ParseException("bad unicode escape")
                val hex = s.substring(i, i + 4)
                if (!hex.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }) throw ParseException("bad unicode escape")
                sb.append(hex.toInt(16).toChar())
                i += 4
              }
              else -> throw ParseException("bad escape \\$e")
            }
          }
          c < ' ' -> throw ParseException("control character in string")
          else -> sb.append(c)
        }
      }
    }

    private fun num(): Double {
      val start = i
      if (peek() == '-') i++
      while (i < s.length && (s[i].isDigit() || s[i] == '.' || s[i] == 'e' || s[i] == 'E' || s[i] == '+' || s[i] == '-')) i++
      val d = s.substring(start, i).toDoubleOrNull() ?: throw ParseException("bad number at $start")
      if (!d.isFinite()) throw ParseException("non-finite number")
      return d
    }

    private fun peek(): Char = if (i < s.length) s[i] else '\u0000'

    private fun expect(c: Char) {
      if (peek() != c) throw ParseException("expected '$c' at $i")
      i++
    }
  }
}

// --- typed accessors ---------------------------------------------------------

@Suppress("UNCHECKED_CAST")
internal fun Any?.asMap(): Map<String, Any?>? = this as? Map<String, Any?>
internal fun Any?.asList(): List<Any?>? = this as? List<Any?>
internal fun Any?.asLongOrNull(): Long? = (this as? Double)?.takeIf { it.isFinite() && it == Math.floor(it) }?.toLong()
internal fun Any?.asIntOrNull(): Int? = asLongOrNull()?.takeIf { it in Int.MIN_VALUE..Int.MAX_VALUE }?.toInt()
internal fun Any?.asStringOrNull(): String? = this as? String
internal fun Any?.asBoolOrNull(): Boolean? = this as? Boolean
