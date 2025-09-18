// netlify/functions/feedback.js
const crypto = require('crypto');

function withSign(baseUrl, secret) {
  if (!secret) return baseUrl; // 未开启加签就直接用
  const timestamp = Date.now();
  const strToSign = `${timestamp}\n${secret}`;
  const sign = encodeURIComponent(
    crypto.createHmac('sha256', secret).update(strToSign).digest('base64')
  );
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}timestamp=${timestamp}&sign=${sign}`;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ ok:false, message:'Method Not Allowed' }) };
    }
    const { sid, remark = '' } = JSON.parse(event.body || '{}') || {};
    if (!sid) return { statusCode: 400, body: JSON.stringify({ ok:false, message:'missing sid' }) };

    const baseWebhook = process.env.DINGTALK_WEBHOOK;   // 形如 https://oapi.dingtalk.com/robot/send?access_token=xxx
    const secret = process.env.DINGTALK_SECRET;         // 形如 SECxxxx（如果开启加签）
    const url = baseWebhook ? withSign(baseWebhook, secret) : null;

    if (url) {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: {
            title: '任务完成',
            text: `✅ **任务完成**\n- sid: ${sid}\n- 备注: ${remark}\n- 时间: ${new Date().toISOString()}`
          }
        })
      });
    }

    return { statusCode: 200, body: JSON.stringify({ ok:true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, message: String(e.message || e) }) };
  }
};
