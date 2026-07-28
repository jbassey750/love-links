const Notification = require("../models/Notification");

const createNotification = async ({
  receiver,
  sender = null,
  type,
  title,
  message,
  body,
  data = {},
}) => {
  const notificationBody = body || message || title;

  return await Notification.create({
    receiver,
    sender,
    type,
    title,
    body: notificationBody,
    data,
  });
};

module.exports = createNotification;