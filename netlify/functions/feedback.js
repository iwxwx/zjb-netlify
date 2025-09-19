// netlify/functions/feedback.js
export async function handler(event) {
  try {
    const q = event.queryStringParameters || {};
    const sid     = q.sid || q.sourceId || "";
    const unionid = q.unionid || "";
    const dueTime = q.dueTime || "";
    const remark  = q.remark ? decodeURIComponent(q.remark) : ""; // 关键：中文解码

    // 东八区时间字符串
    const timeCN = new Date(Date.now() + 8 * 3600 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);

    // 组装钉钉 Markdown（UTF-8）
    const body = {
      msgtype: "markdown",
      markdown: {
        title: "✅ 任务完成",
        text:
          `### ✅ 任务完成\n` +
          `- **SID**：\`${sid}\`\n` +
          `- **备注**：${remark || "—"}\n` +
          `- **时间**：${timeCN}\n`
      }
    };

    const webhook = process.env.DING_WEBHOOK; // 在 Netlify 环境变量里设置
    if (!webhook) {
      return { statusCode: 500, body: "Missing DING_WEBHOOK env" };
    }

    const resp = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body)
    });
    const resultText = await resp.text();

    // 回显一个简洁成功页
    const html = `
<!doctype html><meta charset="utf-8">
<title>完成反馈</title>
<style>body{font-family:system-ui,Segoe UI,Arial;padding:24px;}</style>
<h2>提交成功</h2>
<p>SID：<code>${sid}</code></p>
<p>备注：${remark || "—"}</p>
<p>时间：${timeCN}</p>
<p>钉钉返回：${resultText}</p>
`;
    return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8" }, body: html };
  } catch (e) {
    return { statusCode: 500, body: String(e) };
  }
}
