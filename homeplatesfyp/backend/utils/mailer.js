const nodemailer = require('nodemailer');

const sendEmail = async (to, subject, html) => {
  console.log(`✉️ [Email Sent] To: ${to} | Subject: ${subject}`);
  // Strip HTML tags for clean console logging
  const plainText = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log(`Body preview: ${plainText}`);
  console.log(`----------------------------------------`);

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log("⚠️ Nodemailer credentials missing in .env. Email logging to console only.");
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: `"HomePlates" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });
  } catch (error) {
    console.error("❌ Failed to send email via SMTP:", error.message);
  }
};

module.exports = sendEmail;
