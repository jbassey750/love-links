const Notification = require("../models/Notification");
const { getIO } = require("../socket/socketManager");

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

  // Emit notification in real time 
  const io = getIO();

  io.to(receiver.toString()).emit("new-notification", notification);

  return notification;
};

module.exports = createNotification;