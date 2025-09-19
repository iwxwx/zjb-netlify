// netlify/functions/feedback.js
import crypto from "crypto";

export async function handler(event) {
  const json = (code, obj) => ({
    statusCode: code,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  });

  try {
    // 1) 兼容 POST(JSON) 与 GET(query)
    let sid = "", unionid = "", dueTime = "", remark = "";
    if (event.httpMethod === "POST") {
      try {
        const b = JSON.parse(event.body || "{}");
        sid = b.sid || b.sourceId || "";
        unionid = b.unionid || "";
        dueTime = b.dueTime || "";
        remark = b.remark || "";
      } catch {}
    }
    if (!sid) {
      const q = event.queryStringParameters || {};
      sid = sid || q.sid || q.sourceId || "";
      unionid = unionid || q.unionid || "";
      dueTime = dueTime || q.dueTime || "";
      remark = remark || (q.remark ? decodeURIComponent(q.remark) : "");
    }

    const timeCN = new Date(Date.now() + 8 * 3600 * 1000)
      .toISOString().replace("T"," ").slice(0,19);

    // 2) 读取 webhook（兼容两种变量名）
    const baseWebhook =
      process.env.DING_WEBHOOK || process.env.DINGTALK_WEBHOOK || "";
    if (!baseWebhook) {
      return json(500, { ok:false, error:"Missing DING_WEBHOOK / DINGTALK_WEBHOOK env" });
    }

    // 3) 如有 SECRET，自动加签（兼容两种变量名）
    const secret = process.env.DING_SECRET || process.env.DINGTALK_SECRET || "";
    let webhook = baseWebhook;
    if (secret) {
      const timestamp = Date.now();
      const stringToSign = `${timestamp}\n${secret}`;
      const sign = crypto.createHmac("sha256", secret)
        .update(stringToSign)
        .digest("base64"); // URLSearchParams 会自动进行 URL 编码
      const u = new URL(baseWebhook);
      u.searchParams.set("timestamp", String(timestamp));
      u.searchParams.set("sign", sign);
      webhook = u.toString();
    }

    // 4) 发送 Markdown
    const payload = {
      msgtype: "markdown",
      markdown: {
        title: "✅ 任务完成",
        text:
          `### ✅ 任务完成\n` +
          `- **SID**：\`${sid}\`\n` +
          `- **备注**：${remark || "—"}\n` +
          `- **时间**：${timeCN}\n`,
      },
    };

    const resp = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
    const dingText = await resp.text();

    return json(200, { ok:true, sid, unionid, dueTime, remark, timeCN, dingtalk: dingText });
  } catch (e) {
    return json(500, { ok:false, error:String(e) });
  }
}
