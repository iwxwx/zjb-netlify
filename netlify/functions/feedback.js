// netlify/functions/feedback.js
import crypto from "crypto";

/** 统一返回 JSON */
const json = (code, obj) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(obj),
});

/** 带可选加签的钉钉发送 */
async function sendToDingTalk({ webhook, secret, payload }) {
  let url = webhook;
  if (secret) {
    const timestamp = Date.now();
    const sign = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}\n${secret}`)
      .digest("base64");
    const sep = url.includes("?") ? "&" : "?";
    url = `${url}${sep}timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
  }
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const text = await resp.text();
  return { ok: resp.ok, text };
}

export async function handler(event) {
  try {
    // -------- 1) 取参（POST 优先，GET 兜底） --------
    let sid = "", unionid = "", dueTime = "", remark = "", detailUrl = "";

    if (event.httpMethod === "POST") {
      try {
        const b = JSON.parse(event.body || "{}");
        sid       = b.sid || b.sourceId || "";
        unionid   = b.unionid || "";
        dueTime   = b.dueTime || "";
        remark    = b.remark || "";
        detailUrl = b.detailUrl || "";
      } catch { /* 忽略 JSON 解析失败，走 query 兜底 */ }
    }
    if (!sid) {
      const q = event.queryStringParameters || {};
      sid       = sid       || q.sid || q.sourceId || "";
      unionid   = unionid   || q.unionid || "";
      dueTime   = dueTime   || q.dueTime || "";
      remark    = remark    || (q.remark ? decodeURIComponent(q.remark) : "");
      detailUrl = detailUrl || q.detailUrl || "";
    }

    // 东八区时间
    const timeCN = new Date(Date.now() + 8 * 3600 * 1000)
      .toISOString().replace("T", " ").slice(0, 19);

    // -------- 2) 环境变量（兼容两种命名） --------
    const webhook = process.env.DING_WEBHOOK || process.env.DINGTALK_WEBHOOK;
    const secret  = process.env.DING_SECRET  || process.env.DINGTALK_SECRET;
    if (!webhook) return json(500, { ok: false, error: "Missing DING_WEBHOOK/DINGTALK_WEBHOOK env" });

    // -------- 3) 组织 Markdown 文本 --------
    const mdLines = [
      "### ✅ 任务完成",
      `> **SID**：\`${sid}\``,
      `> **备注**：${remark || "—"}`,
      `> **时间**：${timeCN}`,
    ];
    if (detailUrl) mdLines.push(`\n[👉 查看详情](${detailUrl})`);

    const payload = { msgtype: "markdown", markdown: { title: "✅ 任务完成", text: mdLines.join("\n") } };

    // -------- 4) 发送到钉钉 --------
    const { ok, text } = await sendToDingTalk({ webhook, secret, payload });

    return json(ok ? 200 : 500, {
      ok,
      sid,
      unionid,
      dueTime,
      remark,
      timeCN,
      detailUrl,
      dingtalk: text,
    });
  } catch (e) {
    return json(500, { ok: false, error: String(e) });
  }
}
