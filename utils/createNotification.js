const Notification = require("../models/Notification");
const { publishToUser } = require("../services/realtimeEventService");

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

  const notification = await Notification.create({
    receiver,
    sender,
    type,
    title,
    body: notificationBody,
    data,
  });

  await publishToUser(receiver, "new-notification", notification);

  return notification;
};

module.exports = createNotification;