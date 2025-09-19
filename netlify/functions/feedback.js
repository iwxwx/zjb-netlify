// netlify/functions/feedback.js
import crypto from "crypto";
import { getStore } from "@netlify/blobs";

const json = (code, obj) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(obj),
});

function makeStore() {
  try {
    return getStore("todo-status");
  } catch {
    const siteID = process.env.BLOBS_SITE_ID;
    const token = process.env.BLOBS_TOKEN;
    if (!siteID || !token) {
      throw new Error("Missing BLOBS_SITE_ID or BLOBS_TOKEN");
    }
    return getStore({ name: "todo-status", siteID, token });
  }
}

// 封装 JSON 存取
async function storeGetJSON(store, key) {
  const val = await store.get(key);
  return val ? JSON.parse(val) : null;
}
async function storeSetJSON(store, key, obj) {
  await store.set(key, JSON.stringify(obj));
}

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

    // 查询状态
    if (event.httpMethod === "GET" && op === "status") {
      const record = await storeGetJSON(store, sid);
      return json(200, { ok: true, done: !!record, record: record || null });
    }

    // 已提交过
    const existed = await storeGetJSON(store, sid);
    if (existed) {
      return json(409, { ok: false, error: "already_submitted", record: existed });
    }

    // 时间（东八区）
    const timeCN = new Date(Date.now() + 8 * 3600 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);

    const webhook = process.env.DING_WEBHOOK || process.env.DINGTALK_WEBHOOK;
    const secret = process.env.DING_SECRET || process.env.DINGTALK_SECRET;
    if (!webhook) {
      return json(500, { ok: false, error: "Missing DING_WEBHOOK / DINGTALK_WEBHOOK env" });
    }

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

    const { ok, text } = await sendToDingTalk({ webhook, secret, payload });
    if (!ok) return json(502, { ok: false, error: "push_failed", detail: text });

    const record = { sid, unionid, dueTime, remark, timeCN, detailUrl, done: true };
    await storeSetJSON(store, sid, record);

    return json(200, { ok: true, ...record, dingtalk: text });
  } catch (e) {
    return json(500, { ok: false, error: String(e) });
  }
}
