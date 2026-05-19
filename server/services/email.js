const nodemailer = require('nodemailer');
const { readJson, writeJson } = require('./storage');

function configured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.ADMIN_NOTIFICATION_EMAIL);
}

function orderSummaryHtml(order) {
  const chapters = (order.toc?.chapters || []).map(ch => `<li><strong>Chapter ${ch.chapter}: ${ch.title}</strong><br>${ch.summary || ''}</li>`).join('');
  const prefs = order.futurePreferences || {};
  const email = order.customer?.email || order.shippingAddress?.email || '';
  const name = order.customer?.name || order.shippingAddress?.name || '';
  const phone = order.customer?.phone || order.shippingAddress?.phone_number || '';
  const linkedin = order.customer?.linkedinUrl || '';
  return `
    <h2>New Order — Forever Memories</h2>

    <h3 style="border-bottom:2px solid #F05A40;padding-bottom:6px;color:#F05A40;">Customer Details</h3>
    <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
    <p><strong>Full Name:</strong> ${name}</p>
    <p><strong>Phone:</strong> ${phone}</p>
    ${linkedin ? `<p><strong>LinkedIn:</strong> <a href="${linkedin}">${linkedin}</a></p>` : ''}

    <h3 style="border-bottom:2px solid #F05A40;padding-bottom:6px;color:#F05A40;">Order Details</h3>
    <p><strong>Order ID:</strong> ${order.id}</p>
    <p><strong>Status:</strong> ${order.status}</p>
    <p><strong>Product:</strong> ${order.product?.label || ''}</p>
    <p><strong>Total:</strong> $${((order.totalCents || 0) / 100).toFixed(2)}</p>

    <h3 style="border-bottom:2px solid #F05A40;padding-bottom:6px;color:#F05A40;">Book Details</h3>
    <p><strong>Title:</strong> ${order.toc?.title || ''}</p>
    <p><strong>Subtitle:</strong> ${order.toc?.subtitle || ''}</p>
    <p><strong>Genre:</strong> ${order.input?.genre || ''}</p>
    <p><strong>Recipient:</strong> ${order.input?.recipientName || ''}</p>

    <h3 style="border-bottom:2px solid #F05A40;padding-bottom:6px;color:#F05A40;">Future Preferences</h3>
    <p><strong>Future promotion:</strong> ${prefs.wantsPromotion ? 'Yes' : 'No'}</p>
    <p><strong>Future ghostwriting:</strong> ${prefs.wantsGhostwriting ? 'Yes' : 'No'}</p>
    <p><strong>Future publishing:</strong> ${prefs.wantsPublishing ? 'Yes' : 'No'}</p>

    <h3 style="border-bottom:2px solid #F05A40;padding-bottom:6px;color:#F05A40;">Table of Contents</h3>
    <ol>${chapters}</ol>
  `;
}

async function sendOrderNotification(order) {
  const notification = {
    id: order.id,
    createdAt: new Date().toISOString(),
    to: process.env.ADMIN_NOTIFICATION_EMAIL || 'not-configured',
    subject: `New Book As A Gift order: ${order.toc?.title || order.id}`,
    orderId: order.id,
    status: configured() ? 'pending-email' : 'saved-locally-no-smtp'
  };
  if (!configured()) {
    const log = readJson('notifications.json', []);
    log.unshift({ ...notification, html: orderSummaryHtml(order) });
    writeJson('notifications.json', log.slice(0, 200));
    return { sent: false, savedLocally: true, message: 'SMTP is not configured, so the notification was saved locally in server/data/notifications.json.' };
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.ADMIN_NOTIFICATION_EMAIL,
    subject: notification.subject,
    html: orderSummaryHtml(order)
  });
  const log = readJson('notifications.json', []);
  log.unshift({ ...notification, status: 'sent' });
  writeJson('notifications.json', log.slice(0, 200));
  return { sent: true, savedLocally: true, message: 'Order notification email sent.' };
}

module.exports = { sendOrderNotification };
