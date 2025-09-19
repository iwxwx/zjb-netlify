// netlify/functions/feedback.js
import crypto from "crypto";
import { getStore } from "@netlify/blobs";

/** 统一 JSON 返回 */
const json = (code, obj) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(obj),
});

/** 自动/手动双模式获取 store */
function makeStore() {
  try {
    // 自动模式（如果 Netlify 已注入 Blobs 环境）
    return getStore("todo-status");
  } catch {
    // 手动模式（需要 BLOBS_SITE_ID 和 BLOBS_TOKEN）
    const siteID = process.env.BLOBS_SITE_ID;
    const token = process.env.BLOBS_TOKEN;
    if (!siteID || !token) {
      throw new Error("Missing BLOBS_SITE_ID or BLOBS_TOKEN");
    }
    return getStore({ name: "todo-status", siteID, token });
  }
}

/** 发送到钉钉 */
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
    const store = makeStore();

    // 取参数（POST 优先）
    let sid = "",
      unionid = "",
      dueTime = "",
      remark = "",
      detailUrl = "",
      op = "";

    if (event.httpMethod === "POST") {
      try {
        const b = JSON.parse(event.body || "{}");
        sid = b.sid || b.sourceId || "";
        unionid = b.unionid || "";
        dueTime = b.dueTime || "";
        remark = b.remark || "";
        detailUrl = b.detailUrl || "";
        op = b.op || "";
      } catch {}
    }

    const q = event.queryStringParameters || {};
    sid = sid || q.sid || q.sourceId || "";
    unionid = unionid || q.unionid || "";
    dueTime = dueTime || q.dueTime || "";
    remark = remark || (q.remark ? decodeURIComponent(q.remark) : "");
    detailUrl = detailUrl || q.detailUrl || "";
    op = op || q.op || "";

    if (!sid) return json(400, { ok: false, error: "missing sid" });

    // 查询状态：GET ?op=status&sid=xxx
    if (event.httpMethod === "GET" && op === "status") {
      const record = await store.getJSON(sid);
      return json(200, { ok: true, done: !!record, record: record || null });
    }

    // 检查是否已经提交过
    const existed = await store.getJSON(sid);
    if (existed) {
      return json(409, { ok: false, error: "already_submitted", record: existed });
    }

    // 时间（东八区）
    const timeCN = new Date(Date.now() + 8 * 3600 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);

    // 钉钉配置
    const webhook = process.env.DING_WEBHOOK || process.env.DINGTALK_WEBHOOK;
    const secret = process.env.DING_SECRET || process.env.DINGTALK_SECRET;
    if (!webhook) {
      return json(500, { ok: false, error: "Missing DING_WEBHOOK / DINGTALK_WEBHOOK env" });
    }

    // 组织钉钉 Markdown 消息
    const lines = [
      "### ✅ 任务完成",
      `> **SID**：\`${sid}\``,
      `> **备注**：${remark || "—"}`,
      `> **时间**：${timeCN}`,
    ];
    if (detailUrl) {
      lines.push(`\n[👉 查看详情](${detailUrl})`);
    }
    const payload = {
      msgtype: "markdown",
      markdown: { title: "✅ 任务完成", text: lines.join("\n") },
    };

    // 推送钉钉
    const { ok, text } = await sendToDingTalk({ webhook, secret, payload });
    if (!ok) return json(502, { ok: false, error: "push_failed", detail: text });

    // 写入状态（防止重复提交）
    const record = { sid, unionid, dueTime, remark, timeCN, detailUrl, done: true };
    await store.setJSON(sid, record);

    return json(200, { ok: true, ...record, dingtalk: text });
  } catch (e) {
    return json(500, { ok: false, error: String(e) });
  }
}
