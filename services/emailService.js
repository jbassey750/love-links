const nodemailer = require("nodemailer");

const safeEmailError = (error) => {
  const safeMessage = String(error?.message || "Email provider request failed")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(?:otp|code)\s*[:=]\s*\d{6}/gi, "[redacted-code]");

  const configuredSecrets = [
    process.env.SMTP_PASS,
    process.env.SMTP_USER,
    process.env.JWT_SECRET,
  ].filter(Boolean);

  const message = configuredSecrets.reduce(
    (result, secret) => result.split(secret).join("[redacted]"),
    safeMessage,
  );

  return {
    name: error?.name || "Error",
    message,
    code: typeof error?.code === "string" ? error.code : undefined,
    responseCode: Number.isInteger(error?.responseCode)
      ? error.responseCode
      : undefined,
    command: typeof error?.command === "string" ? error.command : undefined,
    syscall: typeof error?.syscall === "string" ? error.syscall : undefined,
  };
};

const getEmailFailureStage = (error) => {
  const code = String(error?.code || "").toUpperCase();
  const command = String(error?.command || "").toUpperCase();
  const message = String(error?.message || "");

  if (/TLS|SSL|CERT/.test(code) || /TLS|SSL|certificate/i.test(message)) {
    return "TLS";
  }

  if (code === "EAUTH" || command === "AUTH" || error?.responseCode === 535) {
    return "authentication";
  }

  if (
    command === "CONN" ||
    /^(ECONNECTION|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH)$/.test(
      code,
    )
  ) {
    return "connection";
  }

  return "email delivery";
};

const logEmailFailure = (operation, error) => {
  console.error(
    `${operation} failed (${getEmailFailureStage(error)})`,
    safeEmailError(error),
  );
};

const smtpSecure = process.env.SMTP_SECURE === "true";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: smtpSecure,
  requireTLS: !smtpSecure,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
  tls: {
    rejectUnauthorized: true,
  },
});

transporter
  .verify()
  .then(() => {
    console.log("SMTP connection and authentication successful");
  })
  .catch((error) => {
    logEmailFailure("SMTP verification", error);
  });

/**
 * Send Enamora OTP email
 */
const sendOTPEmail = async ({ email, otp, fullName }) => {
  try {
    const mailOptions = {
      from: `"Enamora" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: "Your Enamora Verification Code ❤️",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Enamora Verification</title>
        </head>
        <body style="margin:0;padding:0;background-color:#fbf6f0;font-family:Arial,Helvetica,sans-serif;">
          <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 5px 25px rgba(0,0,0,0.08);">
            <div style="background:linear-gradient(135deg,#801931,#ba7252);padding:35px 25px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-family:Georgia,serif;font-size:32px;">Enamora</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Where meaningful connections begin</p>
            </div>
            <div style="padding:35px 30px;">
              <h2 style="margin-top:0;color:#333333;font-family:Georgia,serif;">Verify your email</h2>
              <p style="color:#666666;font-size:15px;line-height:1.6;">Hi ${fullName || "there"},</p>
              <p style="color:#666666;font-size:15px;line-height:1.6;">
                Welcome to Enamora! Please use the verification code below to confirm your email address and continue discovering meaningful connections.
              </p>
              <div style="margin:30px 0;padding:20px;background:#fbf6f0;border-radius:12px;text-align:center;">
                <p style="margin:0 0 10px;color:#888888;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Your verification code</p>
                <div style="font-size:34px;font-weight:bold;letter-spacing:8px;color:#801931;font-family:Arial,Helvetica,sans-serif;">${otp}</div>
              </div>
              <p style="color:#666666;font-size:14px;line-height:1.6;">This verification code will expire in <strong>10 minutes</strong>.</p>
              <p style="color:#888888;font-size:13px;line-height:1.6;">If you did not request this code, you can safely ignore this email. Never share your verification code with anyone.</p>
            </div>
            <div style="padding:20px 30px;background:#f7f3ee;text-align:center;">
              <p style="margin:0;color:#999999;font-size:12px;">© ${new Date().getFullYear()} Enamora. All rights reserved.</p>
              <p style="margin:8px 0 0;color:#aaa;font-size:11px;">Made for meaningful connections ❤️</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log("OTP email sent:", info.messageId);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    logEmailFailure("OTP email", error);

    const deliveryError = new Error("Unable to send verification email");
    Object.assign(deliveryError, {
      code: error?.code,
      responseCode: error?.responseCode,
      command: error?.command,
    });

    throw deliveryError;
  }
};

/**
 * Send Enamora password-reset email
 */
const sendPasswordResetEmail = async ({ email, resetUrl, fullName }) => {
  try {
    const safeName = String(fullName || "there").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );

    const mailOptions = {
      from: `"Enamora" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: "Reset Your Enamora Password",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Reset Your Enamora Password</title>
        </head>
        <body style="margin:0;padding:0;background-color:#fbf6f0;font-family:Arial,Helvetica,sans-serif;">
          <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 5px 25px rgba(0,0,0,0.08);">
            <div style="background:linear-gradient(135deg,#801931,#ba7252);padding:35px 25px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-family:Georgia,serif;font-size:32px;">Enamora</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Where meaningful connections begin</p>
            </div>
            <div style="padding:35px 30px;">
              <h2 style="margin-top:0;color:#333333;font-family:Georgia,serif;">Reset your password</h2>
              <p style="color:#666666;font-size:15px;line-height:1.6;">Hi ${safeName},</p>
              <p style="color:#666666;font-size:15px;line-height:1.6;">
                We received a request to reset the password for your Enamora account. Click the button below to choose a new password.
              </p>
              <div style="text-align:center;margin:30px 0;">
                <a href="${resetUrl}" style="display:inline-block;background:#801931;color:#ffffff;padding:15px 28px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:bold;">Reset My Password</a>
              </div>
              <p style="color:#666666;font-size:14px;line-height:1.6;">
                This link will expire in <strong>20 minutes</strong> and can only be used once.
              </p>
              <p style="color:#666666;font-size:13px;line-height:1.6;">If the button does not work, copy and paste this link into your browser:</p>
              <p style="color:#801931;font-size:13px;line-height:1.6;word-break:break-all;">${resetUrl}</p>
              <p style="color:#888888;font-size:13px;line-height:1.6;">
                If you did not request a password reset, you can safely ignore this email. Your password will not change unless the reset link is used.
              </p>
            </div>
            <div style="padding:20px 30px;background:#f7f3ee;text-align:center;">
              <p style="margin:0;color:#999999;font-size:12px;">© ${new Date().getFullYear()} Enamora. All rights reserved.</p>
              <p style="margin:8px 0 0;color:#aaa;font-size:11px;">Made for meaningful connections ❤️</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log("Password-reset email sent:", info.messageId);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    logEmailFailure("Password-reset email", error);

    const deliveryError = new Error("Unable to send password-reset email");
    Object.assign(deliveryError, {
      code: error?.code,
      responseCode: error?.responseCode,
      command: error?.command,
    });

    throw deliveryError;
  }
};

module.exports = {
  safeEmailError,
  sendOTPEmail,
  sendPasswordResetEmail,
};
