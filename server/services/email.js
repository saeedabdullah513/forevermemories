const nodemailer = require('nodemailer');
const path = require('path');
const { readJson, writeJson } = require('./storage');

function configured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.ADMIN_NOTIFICATION_EMAIL);
}

// Show value or italic "null" for empty optional fields
const v = (val) => (val && String(val).trim()) ? String(val).trim() : '<em style="color:#aaa">null</em>';

function row(label, value) {
  return `<tr>
    <td style="padding:7px 12px;font-weight:600;color:#444;background:#f9f9f7;white-space:nowrap;border-bottom:1px solid #eee;width:220px">${label}</td>
    <td style="padding:7px 12px;color:#111;border-bottom:1px solid #eee">${v(value)}</td>
  </tr>`;
}

function section(title, rows) {
  return `
    <h3 style="margin:28px 0 0;padding:8px 14px;background:#F05A40;color:#fff;font-size:13px;letter-spacing:.06em;text-transform:uppercase;border-radius:6px 6px 0 0">${title}</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-top:none;border-radius:0 0 6px 6px;overflow:hidden">
      ${rows}
    </table>`;
}

function orderSummaryHtml(order) {
  const inp  = order.input  || {};
  const ship = order.shippingAddress || {};
  const cust = order.customer || {};
  const prefs = order.futurePreferences || {};
  const toc  = order.toc || {};

  const email    = cust.email    || ship.email    || '';
  const name     = cust.name     || ship.name     || '';
  const phone    = cust.phone    || ship.phone_number || '';
  const linkedin = cust.linkedinUrl || '';

  const chapters = (toc.chapters || [])
    .map(ch => `<li style="margin-bottom:6px"><strong>Chapter ${ch.chapter}: ${ch.title}</strong><br><span style="color:#666;font-size:12px">${ch.summary || ''}</span></li>`)
    .join('');

  return `
  <div style="font-family:'Inter',Arial,sans-serif;max-width:700px;margin:0 auto;color:#111">

    <div style="background:#111;padding:24px 28px;border-radius:8px 8px 0 0">
      <h2 style="margin:0;color:#fff;font-size:20px">New Order — Forever Memories</h2>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.55);font-size:13px">Order ID: ${order.id || ''} &nbsp;|&nbsp; ${new Date().toLocaleString()}</p>
    </div>

    <div style="padding:0 0 32px;background:#fff">

      ${section('Customer Details',
        row('Email',        `<a href="mailto:${email}" style="color:#F05A40">${email || 'null'}</a>`) +
        row('Full Name',    name) +
        row('Phone',        phone) +
        row('LinkedIn URL', linkedin || null)
      )}

      ${section('Shipping Address',
        row('Street',   ship.street1) +
        row('City',     ship.city) +
        row('State',    ship.state_code) +
        row('Postcode', ship.postcode) +
        row('Country',  ship.country_code)
      )}

      ${section('Book & Recipient Details',
        row('Genre',         inp.genre) +
        row('Recipient Name',inp.recipientName) +
        row('Relationship',  inp.relationship) +
        row('Occasion',      inp.occasion) +
        row('Tone',          inp.tone) +
        row('Preferred Title',   inp.customTitle) +
        row('Preferred Subtitle',inp.customSubtitle) +
        row('Final Title',   toc.title) +
        row('Final Subtitle',toc.subtitle)
      )}

      ${section('Story Questions',
        row('Three words describing them', inp.answers?.[0]) +
        row('Memory to inspire the book',  inp.answers?.[1]) +
        row('Challenge / dream / theme',   inp.answers?.[2]) +
        row('Names, places, inside jokes', inp.answers?.[3])
      )}

      ${section('Story / Life Notes',
        row('Life notes / career notes', inp.lifeNotes) +
        row('Story file uploaded', inp.storyUpload ? `<a href="${inp.storyUpload.publicUrl}" style="color:#F05A40">${inp.storyUpload.originalName || inp.storyUpload.fileName || 'file'}</a>` : null)
      )}

      ${section('Order Details',
        row('Order ID',  order.id) +
        row('Status',    order.status) +
        row('Product',   order.product?.label) +
        row('Total',     order.totalCents != null ? '$' + (order.totalCents / 100).toFixed(2) : null) +
        row('Discount Code', order.discountCode)
      )}

      ${section('Future Preferences',
        row('Wants future promotion',        prefs.wantsPromotion   ? 'Yes' : 'No') +
        row('Wants future ghostwriting',     prefs.wantsGhostwriting ? 'Yes' : 'No') +
        row('Wants future publishing',       prefs.wantsPublishing   ? 'Yes' : 'No') +
        row('Wants custom cover design',     prefs.wantsCustomCover  ? 'Yes' : 'No')
      )}

      <h3 style="margin:28px 0 0;padding:8px 14px;background:#F05A40;color:#fff;font-size:13px;letter-spacing:.06em;text-transform:uppercase;border-radius:6px 6px 0 0">Table of Contents</h3>
      <div style="border:1px solid #eee;border-top:none;padding:16px 20px">
        ${chapters ? `<ol style="margin:0;padding-left:20px;line-height:1.8">${chapters}</ol>` : '<em style="color:#aaa">null</em>'}
      </div>

    </div>

    <div style="background:#111;padding:14px 20px;border-radius:0 0 8px 8px;text-align:center">
      <p style="margin:0;color:rgba(255,255,255,.4);font-size:11px">Forever Memories &mdash; Internal Order Notification</p>
    </div>

  </div>`;
}

async function sendOrderNotification(order) {
  const recipients = process.env.ADMIN_NOTIFICATION_EMAIL || 'not-configured';
  const notification = {
    id: order.id,
    createdAt: new Date().toISOString(),
    to: recipients,
    subject: `New Order: ${order.toc?.title || order.id}`,
    orderId: order.id,
    status: configured() ? 'pending-email' : 'saved-locally-no-smtp'
  };

  if (!configured()) {
    const log = readJson('notifications.json', []);
    log.unshift({ ...notification, html: orderSummaryHtml(order) });
    writeJson('notifications.json', log.slice(0, 200));
    return { sent: false, savedLocally: true, message: 'SMTP not configured — notification saved to server/data/notifications.json.' };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls: { rejectUnauthorized: false }
  });

  await transporter.verify();
  const attachments = [];
  if (order.input?.storyUpload?.fileName) attachments.push({ filename: order.input.storyUpload.originalName || order.input.storyUpload.fileName, path: path.join(__dirname, '..', 'uploads', order.input.storyUpload.fileName) });
  if (order.input?.recipientPhoto?.fileName) attachments.push({ filename: order.input.recipientPhoto.originalName || order.input.recipientPhoto.fileName, path: path.join(__dirname, '..', 'uploads', order.input.recipientPhoto.fileName) });
  await transporter.sendMail({
    from: `"Forever Memories" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: recipients,
    subject: notification.subject,
    html: orderSummaryHtml(order),
    attachments
  });

  const log = readJson('notifications.json', []);
  log.unshift({ ...notification, status: 'sent' });
  writeJson('notifications.json', log.slice(0, 200));
  return { sent: true, savedLocally: true, message: 'Order notification email sent.' };
}

module.exports = { sendOrderNotification };
