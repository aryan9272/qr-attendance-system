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

async function sendViaResendHttpApi(recipient, subjectText, htmlContent, isReroute = false) {
  const apiKey = (process.env.RESEND_API_KEY || '').trim().replace(/['"]/g, '');
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'ProxyQr Admin Security <onboarding@resend.dev>',
        to: [recipient],
        subject: subjectText,
        html: htmlContent,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      console.log(`[Resend HTTPS API Success] OTP dispatched to ${recipient}. MessageId: ${data.id}`);
      return { success: true, messageId: data.id, isDevConsole: false, recipient };
    } else {
      const errData = await res.json().catch(() => ({}));
      const msg = errData.message || '';

      // Auto-reroute if Resend testing mode requires sending to registered Resend account owner email
      if (!isReroute && msg.includes('testing emails to your own email address')) {
        const match = msg.match(/\(([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\)/);
        const ownerEmail = match ? match[1] : (process.env.ADMIN_OWNER_EMAIL || 'aryankale9272@gmail.com');
        console.log(`[Resend Testing Mode Auto-Reroute] Rerouting email dispatch to verified Resend owner: ${ownerEmail}`);
        return sendViaResendHttpApi(ownerEmail, subjectText, htmlContent, true);
      }

      console.warn(`[Resend HTTPS API Failed] HTTP ${res.status}:`, msg || JSON.stringify(errData));
      return { success: false, status: res.status, errData };
    }
  } catch (e) {
    clearTimeout(timeoutId);
    console.warn(`[Resend HTTPS API Warning] ${e.message}`);
    return { success: false, error: e.message };
  }
}

async function sendViaBrevoHttpApi(targetRecipientEmail, otpCode) {
  const apiKey = (process.env.BREVO_API_KEY || process.env.BREVO_SMTP_KEY || process.env.BREVO_KEY || '').trim().replace(/['"]/g, '');
  if (!apiKey) return null;

  const senderEmail = (process.env.BREVO_SENDER_EMAIL || process.env.ADMIN_OWNER_EMAIL || process.env.EMAIL_HOST_USER || 'voyager9579@gmail.com').trim();
  const senderName = 'Attendance System';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: senderName,
          email: senderEmail,
        },
        to: [
          {
            email: targetRecipientEmail,
          },
        ],
        subject: 'Admin Security OTP Code',
        htmlContent: `<p>Your 6-digit OTP code is: <strong>${otpCode}</strong></p><p>This code expires in 5 minutes.</p>`,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 201 || response.status === 200 || response.ok) {
      const data = await response.json();
      console.log(`[Brevo HTTPS API Success] HTTP ${response.status}. MessageId: ${data.messageId || 'http-api'}`);
      return {
        success: true,
        devMode: false,
        isDevConsole: false,
        message: 'OTP sent successfully to your email.',
        messageId: data.messageId || 'http-api',
      };
    } else {
      const responseData = await response.json().catch(() => ({}));
      console.error(`[Brevo HTTPS API Error] Status Code ${response.status}:`, JSON.stringify(responseData));
      return { success: false, status: response.status, responseData };
    }
  } catch (e) {
    clearTimeout(timeoutId);
    console.error(`[Brevo HTTPS API Exception] Network/Fetch Error:`, e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Dispatch 6-digit Security OTP strictly to ADMIN_OWNER_EMAIL
 */
async function sendSecurityOtpEmail(otpCode, type = 'PROCTOR_ACCESS') {
  const targetRecipientEmail = (process.env.ADMIN_OWNER_EMAIL || process.env.EMAIL_HOST_USER || 'voyager9579@gmail.com').trim();

  console.log(`====================================================`);
  console.log(`🔐 [SECURITY OTP GENERATED (${type})]: ${otpCode}`);
  console.log(`📩 Target Recipient Email: ${targetRecipientEmail}`);
  console.log(`====================================================`);

  // 1. Try Resend HTTPS API if RESEND_API_KEY is configured (Instant 0-setup option)
  let resendErrorMsg = '';
  if (process.env.RESEND_API_KEY) {
    const resendResult = await sendViaResendHttpApi(targetRecipientEmail, 'Admin Security OTP Code', `<p>Your 6-digit OTP code is: <strong>${otpCode}</strong></p><p>This code expires in 5 minutes.</p>`);
    if (resendResult && resendResult.success) {
      return {
        messageId: resendResult.messageId,
        isDevConsole: false,
        devMode: false,
        message: 'OTP sent successfully to your email.',
      };
    } else if (resendResult && resendResult.errData) {
      resendErrorMsg = resendResult.errData.message || `HTTP ${resendResult.status}`;
    }
  }

  // 2. Try Brevo HTTPS API if BREVO_API_KEY is configured
  let brevoErrorMsg = '';
  const apiKey = (process.env.BREVO_API_KEY || process.env.BREVO_SMTP_KEY || process.env.BREVO_KEY || '').trim().replace(/['"]/g, '');
  if (apiKey) {
    const brevoResult = await sendViaBrevoHttpApi(targetRecipientEmail, otpCode);
    if (brevoResult && brevoResult.success) {
      return {
        messageId: brevoResult.messageId,
        isDevConsole: false,
        devMode: false,
        message: 'OTP sent successfully to your email.',
      };
    } else if (brevoResult && brevoResult.responseData) {
      brevoErrorMsg = brevoResult.responseData.message || brevoResult.responseData.code || `HTTP ${brevoResult.status}`;
      console.warn(`[Brevo API Error Detail]: ${brevoErrorMsg}`);
    }
  }

  // 3. Try Standard SMTP Transporter (Port 587 STARTTLS / Port 465 SSL)
  const transporter = createTransporter();
  if (transporter) {
    const senderUser = process.env.DEFAULT_FROM_EMAIL || process.env.EMAIL_HOST_USER || process.env.BREVO_SMTP_USER || 'no-reply@proxyqr.com';
    const mailOptions = {
      from: `"Attendance System" <${senderUser}>`,
      to: targetRecipientEmail,
      subject: 'Admin Security OTP Code',
      html: `<p>Your 6-digit OTP code is: <strong>${otpCode}</strong></p><p>This code expires in 5 minutes.</p>`,
    };

    try {
      const sendMailPromise = transporter.sendMail(mailOptions);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SMTP dispatch timed out (8s limit).')), 8000)
      );
      const info = await Promise.race([sendMailPromise, timeoutPromise]);
      console.log(`[SMTP Mailer] OTP dispatched to ${targetRecipientEmail}. MessageId: ${info.messageId}`);
      return {
        messageId: info.messageId,
        isDevConsole: false,
        devMode: false,
        message: 'OTP sent successfully to your email.',
      };
    } catch (err) {
      console.warn(`[SMTP Warning] SMTP dispatch failed (${err.message}).`);
    }
  }

  if (resendErrorMsg) {
    throw new Error(`Resend Email API Error: ${resendErrorMsg}. Please check your RESEND_API_KEY in Render.`);
  }

  if (brevoErrorMsg) {
    throw new Error(`Brevo Email API Error: ${brevoErrorMsg}. Please request activation at contact@brevo.com or switch to Resend.com.`);
  }

  throw new Error('Email delivery failed. Please add RESEND_API_KEY or verify your Gmail App Password in Render.');
}

async function sendProctorOtpEmail(otpCode) {
  return sendSecurityOtpEmail(otpCode, 'PROCTOR_ACCESS');
}

module.exports = {
  sendProctorOtpEmail,
  sendSecurityOtpEmail,
};

