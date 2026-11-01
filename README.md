# love-links

## OTP email configuration

Configure the backend email environment with the SMTP host and credentials
provided by the existing email provider. For Resend SMTP, use implicit TLS:

```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASS=<Resend SMTP API key>
SMTP_FROM=<verified sender address>
```

Set these variables in the deployed backend environment and restart or redeploy
the service after changing them. Do not commit credentials.