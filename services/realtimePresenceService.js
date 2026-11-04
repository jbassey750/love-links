const Chat = require("../models/Chat"); 
const FakeAccountAssignment = require("../models/FakeAccountAssignment");
const RealtimeConnection = require("../models/RealtimeConnection");
const User = require("../models/User");
const { publishToUser } = require("./realtimeEventService");
const {
  reserveModerator,
  releaseModeratorReservation,
} = require("./assignmentExpiryService");

const PRESENCE_TTL_MS = 70 * 1000;

const publishPresence = async (userId, status) => {
  if (!userId) return;
  try {
    const chats = await Chat.find({ participants: userId }).select("participants").lean();
    const recipientIds = new Set();
    const userIdStr = userId.toString();

    for (const chat of chats) {
      if (Array.isArray(chat?.participants)) {
        for (const participantId of chat.participants) {
          if (!participantId) continue;
          const id = participantId.toString();
          if (id !== userIdStr) recipientIds.add(id);
        }
      }
    }

    await Promise.all(
      [...recipientIds].map((recipientId) =>
        publishToUser(recipientId, "user-status-changed", {
          userId: userIdStr,
          status,
        }).catch((err) => {
          console.warn(`[Presence] Could not notify user ${recipientId}:`, err.message);
        }),
      ),
    );
  } catch (error) {
    console.error("[Presence] publishPresence failed:", error.message);
  }
};

const assignWaitingChats = async (moderatorId) => {
  let reservation;
  try {
    reservation = await reserveModerator(moderatorId);
    if (!reservation) return;

    const assignedAt = new Date();
    const hasActiveAssignment = await FakeAccountAssignment.exists({
      moderator: moderatorId,
      status: "active",
      expiresAt: { $gt: assignedAt },
    });
    if (hasActiveAssignment) return;

    const expiresAt = new Date(assignedAt.getTime() + 5 * 60 * 1000);
    const assignment = await FakeAccountAssignment.findOneAndUpdate(
      { status: "transferred", respondedAt: null },
      {
        $set: {
          moderator: moderatorId,
          status: "active",
          assignedAt,
          expiresAt,
          respondedAt: null,
          releasedAt: null,
          replyClaimedAt: null,
        },
      },
      { new: true, sort: { releasedAt: 1 } },
    );
    if (!assignment) return;

    await publishToUser(moderatorId, "assignment-transferred", {
      assignmentId: assignment._id,
      chatId: assignment.chat,
      fakeUser: assignment.fakeUser,
      realUser: assignment.realUser,
      assignedAt,
      expiresAt,
    }).catch((err) => {
      console.warn("[Presence] Failed to send assignment to moderator:", err.message);
    });
  } catch (error) {
    console.error("[Presence] assignWaitingChats failed:", error.message);
  } finally {
    await releaseModeratorReservation(moderatorId, reservation);
  }
};

const connectPresence = async (user) => {
  if (!user || !user._id) return null;

  const activeCount = await RealtimeConnection.countDocuments({
    user: user._id,
    expiresAt: { $gt: new Date() },
  });
  const connection = await RealtimeConnection.create({
    user: user._id,
    expiresAt: new Date(Date.now() + PRESENCE_TTL_MS),
  });

  await User.findByIdAndUpdate(user._id, {
    status: "online",
    lastSeen: new Date(),
  });

  if (!activeCount) {
    await publishPresence(user._id, "online");
    if (user.role === "moderator") {
      await assignWaitingChats(user._id);
    }
  }

  return connection;
};

const heartbeatPresence = async (connectionId, userId) => {
  if (!connectionId || !userId) return;
  await RealtimeConnection.updateOne(
    { _id: connectionId, user: userId },
    { $set: { expiresAt: new Date(Date.now() + PRESENCE_TTL_MS) } },
  );
};

const disconnectPresence = async (connectionId, userId) => {
  if (!connectionId || !userId) return;
  await RealtimeConnection.deleteOne({ _id: connectionId, user: userId });
  const activeCount = await RealtimeConnection.countDocuments({
    user: userId,
    expiresAt: { $gt: new Date() },
  });
  if (activeCount) return;

  await User.findByIdAndUpdate(userId, {
    status: "offline",
    lastSeen: new Date(),
  });
  await publishPresence(userId, "offline");
};

const clearExpiredPresence = async () => {
  const expiredUsers = await RealtimeConnection.distinct("user", {
    expiresAt: { $lte: new Date() },
  });
  if (!expiredUsers.length) return;

  await RealtimeConnection.deleteMany({ expiresAt: { $lte: new Date() } });
  for (const userId of expiredUsers) {
    if (!userId) continue;
    const activeCount = await RealtimeConnection.countDocuments({
      user: userId,
      expiresAt: { $gt: new Date() },
    });
    if (activeCount) continue;

    const user = await User.findOneAndUpdate(
      { _id: userId, status: "online" },
      { $set: { status: "offline", lastSeen: new Date() } },
      { new: false },
    ).select("_id");
    if (user) await publishPresence(userId, "offline");
  }
};

module.exports = {
  connectPresence,
  heartbeatPresence,
  disconnectPresence,
  clearExpiredPresence,
};
