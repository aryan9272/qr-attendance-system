const nodemailer = require('nodemailer');
const dns = require('dns');

// Force Node.js to resolve IPv4 addresses first (fixes ENETUNREACH IPv6 errors on cloud hosts like Render)
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const customIpv4Lookup = (hostname, options, callback) => {
  return dns.lookup(hostname, { family: 4 }, callback);
};

function createTransporter() {
  const user = (process.env.EMAIL_HOST_USER || process.env.ADMIN_OWNER_EMAIL || process.env.BREVO_SMTP_USER || '').trim();
  const rawPass = process.env.EMAIL_HOST_PASSWORD || process.env.BREVO_SMTP_KEY || '';
  const pass = rawPass.trim().replace(/\s+/g, '');

  if (!user || !pass) {
    console.warn('[Mailer Warning] Email user or password missing in environment variables. Falling back to Console Email backend.');
    return null;
  }

  const isGmail = user.toLowerCase().endsWith('@gmail.com') || process.env.EMAIL_HOST === 'smtp.gmail.com';

  if (isGmail) {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // Port 587 uses STARTTLS
      auth: {
        user,
        pass,
      },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false,
      },
      family: 4, // Force IPv4 resolution to bypass ENETUNREACH
      lookup: customIpv4Lookup, // Guarantee strict IPv4 resolution
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
  }

  const host = process.env.EMAIL_HOST || (process.env.BREVO_SMTP_USER ? 'smtp-relay.brevo.com' : 'smtp.gmail.com');
  const port = parseInt(process.env.EMAIL_PORT || '587', 10);
  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      ciphers: 'SSLv3',
      rejectUnauthorized: false,
    },
    family: 4, // Force IPv4 resolution
    lookup: customIpv4Lookup,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
}

async function sendViaBrevoHttpApi(recipient, subjectText, htmlContent) {
  const apiKey = (process.env.BREVO_API_KEY || process.env.BREVO_SMTP_KEY || '').trim();
  if (!apiKey) return null;

  const senderUser = (process.env.DEFAULT_FROM_EMAIL || process.env.EMAIL_HOST_USER || process.env.BREVO_SMTP_USER || 'no-reply@proxyqr.com').trim();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'ProxyQr Admin Security', email: senderUser },
        to: [{ email: recipient }],
        subject: subjectText,
        htmlContent: htmlContent,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      console.log(`[Brevo HTTPS API] OTP dispatched to ${recipient}. MessageId: ${data.messageId || 'http-api'}`);
      return { messageId: data.messageId || 'http-api', isDevConsole: false };
    }
  } catch (e) {
    clearTimeout(timeoutId);
    console.warn(`[Brevo HTTPS API Warning] ${e.message}`);
  }
  return null;
}

/**
 * Dispatch 6-digit Security OTP strictly to ADMIN_OWNER_EMAIL
 */
async function sendSecurityOtpEmail(otpCode, type = 'PROCTOR_ACCESS') {
  const recipient = (process.env.ADMIN_OWNER_EMAIL || process.env.EMAIL_HOST_USER || 'voyager9579@gmail.com').trim();

  let title = 'DELEGATED PROCTOR OTP VERIFICATION';
  let subjectText = `🔐 ProxyQr Proctor Access OTP: ${otpCode}`;
  let actionText = 'A temporary proctor access code has been requested for the ProxyQr Admin Console.';

  if (type === 'CHANGE_PASSWORD') {
    title = 'MASTER PASSWORD CHANGE VERIFICATION';
    subjectText = `🔑 ProxyQr Security: Password Change OTP: ${otpCode}`;
    actionText = 'A request was made to update the ProxyQr Master Admin Password.';
  } else if (type === 'RESET_PASSWORD') {
    title = 'MASTER PASSWORD RESET REQUEST';
    subjectText = `🚨 ProxyQr Security: Account Recovery OTP: ${otpCode}`;
    actionText = 'A password recovery reset code was requested for your ProxyQr Admin Account.';
  }

  console.log(`====================================================`);
  console.log(`🔐 [SECURITY OTP GENERATED (${type})]: ${otpCode}`);
  console.log(`📩 Target Recipient Email: ${recipient}`);
  console.log(`====================================================`);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #090d16; color: #f8fafc; margin: 0; padding: 20px; }
        .card { max-width: 480px; margin: 0 auto; background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        .title { color: #38bdf8; font-size: 20px; font-weight: 700; text-align: center; margin-bottom: 8px; letter-spacing: 0.5px; }
        .subtitle { color: #94a3b8; font-size: 11px; text-align: center; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 24px; }
        .otp-box { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
        .otp-code { font-size: 36px; font-weight: 800; color: #38bdf8; letter-spacing: 8px; font-family: monospace; }
        .badge { display: inline-block; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); color: #38bdf8; font-size: 11px; padding: 4px 12px; border-radius: 9999px; margin-top: 10px; font-weight: 600; }
        .footer { font-size: 11px; color: #64748b; text-align: center; margin-top: 24px; border-top: 1px solid #1e293b; padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="title">ProxyQr Admin Console</div>
        <div class="subtitle">${title}</div>

        <p style="font-size: 14px; color: #cbd5e1; line-height: 1.5;">
          ${actionText}
        </p>

        <div class="otp-box">
          <div class="otp-code">${otpCode}</div>
          <div class="badge">VALID FOR 5 MINUTES</div>
        </div>

        <p style="font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.6;">
          If you did not initiate this request, your account is safe. Do not share this code with anyone.
        </p>

        <div class="footer">
          ProxyQr Security Sentinel • Multi-Lab Attendance System
        </div>
      </div>
    </body>
    </html>
  `;

  // 1. Try Brevo HTTPS API over port 443 first if key available
  if (process.env.BREVO_API_KEY || process.env.BREVO_SMTP_KEY) {
    const httpResult = await sendViaBrevoHttpApi(recipient, subjectText, htmlContent);
    if (httpResult) return httpResult;
  }

  // 2. Try Standard SMTP Transporter (Port 587 STARTTLS / Port 465 SSL)
  const transporter = createTransporter();
  if (transporter) {
    const senderUser = process.env.DEFAULT_FROM_EMAIL || process.env.EMAIL_HOST_USER || process.env.BREVO_SMTP_USER || 'no-reply@proxyqr.com';
    const mailOptions = {
      from: `"ProxyQr Admin Security" <${senderUser}>`,
      to: recipient,
      subject: subjectText,
      html: htmlContent,
    };

    try {
      const sendMailPromise = transporter.sendMail(mailOptions);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SMTP dispatch timed out (8s limit).')), 8000)
      );
      const info = await Promise.race([sendMailPromise, timeoutPromise]);
      console.log(`[SMTP Mailer] OTP dispatched to ${recipient}. MessageId: ${info.messageId}`);
      return { messageId: info.messageId, isDevConsole: false };
    } catch (err) {
      console.warn(`[SMTP Warning] SMTP dispatch failed (${err.message}). Activating Cloud Console Fallback.`);
    }
  }

  // 3. Fallback / Bypass Mode: Log OTP to server logs and return devConsole status (bypasses ENETUNREACH cloud block)
  console.log(`====================================================`);
  console.log(`[ADMIN OTP BYPASS]: The OTP code is ${otpCode}`);
  console.log(`====================================================`);
  return { messageId: 'cloud-console-fallback', isDevConsole: true };
}

async function sendProctorOtpEmail(otpCode) {
  return sendSecurityOtpEmail(otpCode, 'PROCTOR_ACCESS');
}

module.exports = {
  sendProctorOtpEmail,
  sendSecurityOtpEmail,
};

