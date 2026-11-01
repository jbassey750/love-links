const FakeAccountAssignment = require("../models/FakeAccountAssignment");
const User = require("../models/User");
const { publishToUser } = require("./realtimeEventService");

const getOnlineModerators = () =>
  User.find({
    role: "moderator",
    status: "online",
  }).select("_id fullName username photo status role accountType");

/**
 * Check for expired moderator assignments
 * and automatically transfer them to another online moderator.
 */
const checkExpiredAssignments = async () => {
  try {
    const now = new Date();

    const expiredAssignments = await FakeAccountAssignment.find({
      status: "active",
      respondedAt: null,
      expiresAt: { $lte: now },
    });

    if (!expiredAssignments.length) {
      return;
    }

    console.log(`⏰ Found ${expiredAssignments.length} expired assignment(s).`);

    for (const assignment of expiredAssignments) {
      try {
        const currentModId = assignment.moderator?.toString() || null;
        const moderators = await getOnlineModerators();

        // Find moderators other than the current moderator
        const otherModerators = moderators.filter(
          (moderator) =>
            moderator?._id &&
            (!currentModId || moderator._id.toString() !== currentModId),
        );

        let selectedModerator = null;

        // ---------------------------------------------------
        // CASE 1: Another moderator is online
        // ---------------------------------------------------
        if (otherModerators.length > 0) {
          selectedModerator =
            otherModerators[Math.floor(Math.random() * otherModerators.length)];
        } else if (currentModId) {
          // ---------------------------------------------------
          // CASE 2: No other moderator is online
          // Try to give it back to the current moderator
          // ---------------------------------------------------
          const currentModerator = moderators.find(
            (moderator) =>
              moderator?._id &&
              moderator._id.toString() === currentModId,
          );

          if (currentModerator) {
            selectedModerator = currentModerator;
          }
        }

        // ---------------------------------------------------
        // CASE 3: Nobody is online
        // ---------------------------------------------------
        if (!selectedModerator) {
          console.log(
            "⚠️ No moderator available for assignment:",
            assignment._id.toString(),
          );

          // Mark it as transferred/waiting.
          assignment.status = "transferred";
          assignment.releasedAt = new Date();

          await assignment.save();

          continue;
        }

        const previousModeratorId = assignment.moderator;
        const assignedAt = new Date();

        // Give the newly assigned moderator another 5 minutes
        const expiresAt = new Date(assignedAt.getTime() + 5 * 60 * 1000);

        assignment.moderator = selectedModerator._id;
        assignment.assignedAt = assignedAt;
        assignment.expiresAt = expiresAt;
        assignment.respondedAt = null;
        assignment.releasedAt = null;
        assignment.status = "active";

        await assignment.save();

        console.log("🔄 ASSIGNMENT REASSIGNED");
        console.log("Assignment:", assignment._id.toString());
        console.log("Previous moderator:", previousModeratorId ? previousModeratorId.toString() : "none");
        console.log("New moderator:", selectedModerator._id.toString());
        console.log("New expiry:", expiresAt);

        const previousModeratorIdString = previousModeratorId ? previousModeratorId.toString() : null;
        const selectedModeratorIdString = selectedModerator._id.toString();

        // =====================================================
        // ANOTHER MODERATOR RECEIVED THE CHAT
        // =====================================================
        if (previousModeratorIdString !== selectedModeratorIdString) {
          // Tell previous moderator that their assignment expired
          if (previousModeratorIdString) {
            await publishToUser(previousModeratorIdString, "assignment-expired", {
              assignmentId: assignment._id,
              chatId: assignment.chat,
              message:
                "Your chat response time has expired and this conversation has been reassigned.",
            }).catch((err) => {
              console.warn("[Expiry] Failed to notify expired moderator:", err.message);
            });
          }

          // Tell new moderator about the assignment
          await publishToUser(selectedModeratorIdString, "assignment-transferred", {
            assignmentId: assignment._id,
            chatId: assignment.chat,
            fakeUser: assignment.fakeUser,
            realUser: assignment.realUser,
            assignedAt,
            expiresAt,
          }).catch((err) => {
            console.warn("[Expiry] Failed to notify new moderator:", err.message);
          });
        }
        // =====================================================
        // SAME MODERATOR RECEIVED THE CHAT AGAIN
        // =====================================================
        else {
          await publishToUser(selectedModeratorIdString, "assignment-transferred", {
            assignmentId: assignment._id,
            chatId: assignment.chat,
            fakeUser: assignment.fakeUser,
            realUser: assignment.realUser,
            assignedAt,
            expiresAt,
            sameModerator: true,
          }).catch((err) => {
            console.warn("[Expiry] Failed to notify reassigned moderator:", err.message);
          });
        }
      } catch (assignmentError) {
        console.error(
          "❌ Error transferring expired assignment:",
          assignmentError,
        );
      }
    }
  } catch (error) {
    console.error("❌ Error checking expired assignments:", error);
  }
};

/**
 * Start the automatic assignment expiry checker.
 *
 * Runs every 10 seconds.
 */
const startAssignmentExpiryChecker = () => {
  console.log("⏱️ Assignment expiry checker started.");

  setInterval(async () => {
    try {
      await checkExpiredAssignments();
    } catch (err) {
      console.error("❌ Unexpected error in assignment expiry interval:", err.message);
    }
  }, 10 * 1000);
};

module.exports = {
  checkExpiredAssignments,
  startAssignmentExpiryChecker,
};
