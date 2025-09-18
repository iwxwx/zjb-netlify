// 最小闭环：收到 sid/remark → 如配置了 DINGTALK_WEBHOOK 就推送到钉钉群；否则直接返回 ok
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ ok:false, message:'Method Not Allowed' }) };
    }
    const { sid, remark = '' } = JSON.parse(event.body || '{}') || {};
    if (!sid) return { statusCode: 400, body: JSON.stringify({ ok:false, message:'missing sid' }) };

    const webhook = process.env.DINGTALK_WEBHOOK;
    if (webhook) {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: { title: '任务完成', text: `✅ 任务完成\n- sid: ${sid}\n- 备注: ${remark}\n- 时间: ${new Date().toISOString()}` }
        })
      });
    }
    return { statusCode: 200, body: JSON.stringify({ ok:true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, message:String(e.message||e) }) };
  }
};
