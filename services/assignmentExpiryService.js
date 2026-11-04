const FakeAccountAssignment = require("../models/FakeAccountAssignment");
const User = require("../models/User");
const { publishToUser } = require("./realtimeEventService");

const REPLY_CLAIM_TIMEOUT_MS = 5 * 60 * 1000;
const MODERATOR_CLAIM_TIMEOUT_MS = 60 * 1000;

const reserveModerator = async (moderatorId) => {
  const reservedAt = new Date();
  const staleReservationBefore = new Date(
    reservedAt.getTime() - MODERATOR_CLAIM_TIMEOUT_MS,
  );
  const moderator = await User.findOneAndUpdate(
    {
      _id: moderatorId,
      role: "moderator",
      status: "online",
      $or: [
        { assignmentClaimedAt: null },
        { assignmentClaimedAt: { $lte: staleReservationBefore } },
      ],
    },
    { $set: { assignmentClaimedAt: reservedAt } },
    { new: true },
  ).select("_id");

  return moderator ? reservedAt : null;
};

const releaseModeratorReservation = async (moderatorId, reservedAt) => {
  if (!moderatorId || !reservedAt) return;
  await User.updateOne(
    { _id: moderatorId, assignmentClaimedAt: reservedAt },
    { $set: { assignmentClaimedAt: null } },
  );
};

const getOnlineModerators = () =>
  User.find({
    role: "moderator",
    status: "online",
  }).select("_id fullName username photo status role accountType");

const expiredAssignmentFilter = (assignment, now) => ({
  _id: assignment._id,
  status: "active",
  respondedAt: null,
  expiresAt: { $lte: now },
  $or: [
    { replyClaimedAt: null },
    { replyClaimedAt: { $lte: new Date(now.getTime() - REPLY_CLAIM_TIMEOUT_MS) } },
  ],
});

/**
 * Reassign only expired, still-active assignments. Atomic status/owner filters
 * prevent concurrent expiry workers from transferring the same assignment.
 */
const checkExpiredAssignments = async () => {
  try {
    const now = new Date();
    const repliedAssignments = await FakeAccountAssignment.find({
      status: "active",
      respondedAt: { $ne: null },
    }).select("_id respondedAt");

    await Promise.all(
      repliedAssignments.map((assignment) =>
        FakeAccountAssignment.updateOne(
          {
            _id: assignment._id,
            status: "active",
            respondedAt: { $ne: null },
          },
          {
            $set: {
              status: "closed",
              releasedAt: assignment.respondedAt,
              replyClaimedAt: null,
            },
          },
        ),
      ),
    );

    const expiredAssignments = await FakeAccountAssignment.find({
      status: "active",
      respondedAt: null,
      expiresAt: { $lte: now },
      $or: [
        { replyClaimedAt: null },
        {
          replyClaimedAt: {
            $lte: new Date(now.getTime() - REPLY_CLAIM_TIMEOUT_MS),
          },
        },
      ],
    });

    for (const assignment of expiredAssignments) {
      try {
        const previousModeratorId = assignment.moderator;
        const onlineModerators = await getOnlineModerators();
        const assignedModeratorIds =
          await FakeAccountAssignment.distinct("moderator", {
            status: "active",
            expiresAt: { $gt: now },
          });
        const assignedModeratorIdSet = new Set(
          assignedModeratorIds.map((id) => id.toString()),
        );
        const availableModerators = onlineModerators.filter(
          (moderator) =>
            moderator._id.toString() !== previousModeratorId.toString() &&
            !assignedModeratorIdSet.has(moderator._id.toString()),
        );
        const shuffledModerators = availableModerators.sort(
          () => Math.random() - 0.5,
        );
        let selectedModerator = null;
        let moderatorReservation = null;
        for (const moderator of shuffledModerators) {
          const reservation = await reserveModerator(moderator._id);
          if (!reservation) continue;

          const hasActiveAssignment = await FakeAccountAssignment.exists({
            moderator: moderator._id,
            status: "active",
            expiresAt: { $gt: new Date() },
          });
          if (hasActiveAssignment) {
            await releaseModeratorReservation(moderator._id, reservation);
            continue;
          }

          selectedModerator = moderator;
          moderatorReservation = reservation;
          break;
        }

        if (!selectedModerator) {
          const releasedAt = new Date();
          const waitingAssignment =
            await FakeAccountAssignment.findOneAndUpdate(
              expiredAssignmentFilter(assignment, releasedAt),
              {
                $set: {
                  status: "transferred",
                  releasedAt,
                  replyClaimedAt: null,
                },
              },
              { new: true },
            );

          if (waitingAssignment && previousModeratorId) {
            await publishToUser(previousModeratorId, "assignment-expired", {
              assignmentId: assignment._id,
              chatId: assignment.chat,
              reassigned: true,
              message:
                "Your chat session has expired. This conversation is waiting for another moderator.",
            }).catch((error) => {
              console.warn(
                "[Expiry] Failed to notify expired moderator:",
                error.message,
              );
            });
          }
          continue;
        }

        let reassigned;
        const assignedAt = new Date();
        const expiresAt = new Date(assignedAt.getTime() + 5 * 60 * 1000);
        try {
          reassigned = await FakeAccountAssignment.findOneAndUpdate(
            expiredAssignmentFilter(assignment, assignedAt),
            {
              $set: {
                moderator: selectedModerator._id,
                status: "active",
                assignedAt,
                expiresAt,
                respondedAt: null,
                releasedAt: null,
                replyClaimedAt: null,
              },
            },
            { new: true },
          );
        } finally {
          await releaseModeratorReservation(
            selectedModerator._id,
            moderatorReservation,
          );
        }

        if (!reassigned) continue;

        if (previousModeratorId) {
          await publishToUser(previousModeratorId, "assignment-expired", {
            assignmentId: assignment._id,
            chatId: assignment.chat,
            reassigned: true,
            message:
              "Your chat response time has expired and this conversation has been reassigned to another moderator.",
          }).catch((error) => {
            console.warn(
              "[Expiry] Failed to notify expired moderator:",
              error.message,
            );
          });
        }

        await publishToUser(selectedModerator._id, "assignment-transferred", {
          assignmentId: reassigned._id,
          chatId: reassigned.chat,
          fakeUser: reassigned.fakeUser,
          realUser: reassigned.realUser,
          assignedAt,
          expiresAt,
        }).catch((error) => {
          console.warn(
            "[Expiry] Failed to notify new moderator:",
            error.message,
          );
        });
      } catch (assignmentError) {
        console.error(
          "[Expiry] Error transferring expired assignment:",
          assignmentError,
        );
      }
    }
  } catch (error) {
    console.error("[Expiry] Error checking expired assignments:", error);
  }
};

const startAssignmentExpiryChecker = () => {
  console.log("⏱️ Assignment expiry checker started.");

  setInterval(async () => {
    try {
      await checkExpiredAssignments();
    } catch (error) {
      console.error(
        "[Expiry] Unexpected error in assignment expiry interval:",
        error.message,
      );
    }
  }, 10 * 1000);
};

module.exports = {
  checkExpiredAssignments,
  startAssignmentExpiryChecker,
  reserveModerator,
  releaseModeratorReservation,
};
