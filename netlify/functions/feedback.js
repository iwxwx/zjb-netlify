export async function handler(event) {
  const json = (code, obj) => ({
    statusCode: code,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  });

  try {
    const q = event.queryStringParameters || {};
    const sid     = q.sid || q.sourceId || "";
    const unionid = q.unionid || "";
    const dueTime = q.dueTime || "";
    const remark  = q.remark ? decodeURIComponent(q.remark) : "";

    const timeCN = new Date(Date.now() + 8*3600*1000)
      .toISOString().replace("T"," ").slice(0,19);

    const webhook = process.env.DING_WEBHOOK; // 必须存在
    if (!webhook) {
      return json(500, { ok:false, error:"Missing DING_WEBHOOK env" });
    }

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
