const nodemailer = require('nodemailer');

function createTransporter() {
  const user = process.env.BREVO_SMTP_USER;
  const pass = process.env.BREVO_SMTP_KEY;

  if (!user || !pass) {
    console.warn('[Mailer Warning] BREVO_SMTP_USER or BREVO_SMTP_KEY missing in environment variables!');
  }

  return nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false, // TLS
    auth: {
      user: user || 'smtp-user-placeholder',
      pass: pass || 'smtp-key-placeholder',
    },
  });
}

/**
 * Dispatch 6-digit Security OTP strictly to ADMIN_OWNER_EMAIL using Brevo SMTP
 */
async function sendSecurityOtpEmail(otpCode, type = 'PROCTOR_ACCESS') {
  const recipient = process.env.ADMIN_OWNER_EMAIL || '2024bit020@sggs.ac.in';

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

  // If Brevo keys missing, return local dev success (OTP printed in terminal)
  if (!process.env.BREVO_SMTP_USER || !process.env.BREVO_SMTP_KEY) {
    console.warn('[Brevo SMTP Warning] BREVO_SMTP_USER or BREVO_SMTP_KEY missing. Use terminal OTP above for testing.');
    return { messageId: 'local-console-fallback' };
  }

  const transporter = createTransporter();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #030712; color: #f8fafc; margin: 0; padding: 40px 20px; }
        .container { max-width: 500px; margin: 0 auto; background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(6, 182, 212, 0.4); border-radius: 24px; padding: 32px; box-shadow: 0 0 50px rgba(6, 182, 212, 0.2); }
        .logo { font-size: 24px; font-weight: 800; color: #38bdf8; text-align: center; margin-bottom: 8px; letter-spacing: -0.5px; }
        .subtitle { font-size: 12px; color: #94a3b8; text-align: center; font-family: monospace; margin-bottom: 24px; letter-spacing: 1px; }
        .otp-box { background: rgba(15, 23, 42, 0.9); border-radius: 16px; padding: 20px; text-align: center; margin: 24px 0; border: 1px solid rgba(6, 182, 212, 0.4); }
        .otp-code { font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #22d3ee; font-family: monospace; }
        .badge { display: inline-block; background: rgba(16, 185, 129, 0.15); color: #34d399; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 20px; border: 1px solid rgba(16, 185, 129, 0.3); margin-top: 8px; }
        .footer { font-size: 11px; color: #64748b; text-align: center; margin-top: 24px; font-family: monospace; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">ProxyQr Admin Console</div>
        <div class="subtitle">${title}</div>
        
        <p style="font-size: 14px; color: #cbd5e1; text-align: center;">${actionText}</p>
        
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

  const mailOptions = {
    from: `"ProxyQr Admin Security" <${process.env.BREVO_SMTP_USER || 'no-reply@proxyqr.com'}>`,
    to: recipient,
    subject: subjectText,
    html: htmlContent,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`[Brevo SMTP Mailer] OTP dispatched to ${recipient}. MessageId: ${info.messageId}`);
  return info;
}

async function sendProctorOtpEmail(otpCode) {
  return sendSecurityOtpEmail(otpCode, 'PROCTOR_ACCESS');
}

module.exports = {
  sendProctorOtpEmail,
  sendSecurityOtpEmail,
};
