const nodemailer = require("nodemailer"); 

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized:
      process.env.SMTP_REJECT_UNAUTHORIZED === undefined
        ? false
        : process.env.SMTP_REJECT_UNAUTHORIZED === "true",
  },
});

transporter.verify((error, success) => {
    if (error) {
        console.error("❌ SMTP CONNECTION FAILED:", error);
    } else {
        console.log("✅ SMTP SERVER READY");
    }
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

        <body style="
          margin: 0;
          padding: 0;
          background-color: #fbf6f0;
          font-family: Arial, Helvetica, sans-serif;
        ">

          <div style="
            max-width: 600px;
            margin: 40px auto;
            background: #ffffff;
            border-radius: 18px;
            overflow: hidden;
            box-shadow: 0 5px 25px rgba(0,0,0,0.08);
          ">

            <!-- Header -->
            <div style="
              background: linear-gradient(135deg, #801931, #ba7252);
              padding: 35px 25px;
              text-align: center;
            ">
              <h1 style="
                margin: 0;
                color: #ffffff;
                font-family: Georgia, serif;
                font-size: 32px;
              ">
                Enamora
              </h1>

              <p style="
                margin: 8px 0 0;
                color: rgba(255,255,255,0.9);
                font-size: 14px;
              ">
                Where meaningful connections begin
              </p>
            </div>

            <!-- Content -->
            <div style="padding: 35px 30px;">

              <h2 style="
                margin-top: 0;
                color: #333333;
                font-family: Georgia, serif;
              ">
                Verify your email
              </h2>

              <p style="
                color: #666666;
                font-size: 15px;
                line-height: 1.6;
              ">
                Hi ${fullName || "there"},
              </p>

              <p style="
                color: #666666;
                font-size: 15px;
                line-height: 1.6;
              ">
                Welcome to Enamora! Please use the verification code
                below to confirm your email address and continue discovering
                meaningful connections.
              </p>

              <!-- OTP -->
              <div style="
                margin: 30px 0;
                padding: 20px;
                background: #fbf6f0;
                border-radius: 12px;
                text-align: center;
              ">

                <p style="
                  margin: 0 0 10px;
                  color: #888888;
                  font-size: 12px;
                  text-transform: uppercase;
                  letter-spacing: 2px;
                  font-weight: bold;
                ">
                  Your verification code
                </p>

                <div style="
                  font-size: 34px;
                  font-weight: bold;
                  letter-spacing: 8px;
                  color: #801931;
                  font-family: Arial, Helvetica, sans-serif;
                ">
                  ${otp}
                </div>

              </div>

              <p style="
                color: #666666;
                font-size: 14px;
                line-height: 1.6;
              ">
                This verification code will expire in
                <strong>10 minutes</strong>.
              </p>

              <p style="
                color: #888888;
                font-size: 13px;
                line-height: 1.6;
              ">
                If you did not request this code, you can safely ignore
                this email. Never share your verification code with anyone.
              </p>

            </div>

            <!-- Footer -->
            <div style="
              padding: 20px 30px;
              background: #f7f3ee;
              text-align: center;
            ">

              <p style="
                margin: 0;
                color: #999999;
                font-size: 12px;
              ">
                © ${new Date().getFullYear()} Enamora. All rights reserved.
              </p>

              <p style="
                margin: 8px 0 0;
                color: #aaa;
                font-size: 11px;
              ">
                Made for meaningful connections ❤️
              </p>

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
    console.error("Email sending error:", error);

    throw new Error("Unable to send verification email");
  }
};

module.exports = {
  sendOTPEmail,
};