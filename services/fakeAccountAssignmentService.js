const FakeAccountAssignment = require("../models/FakeAccountAssignment");
const User = require("../models/User");
// const { getOnlineModerators } = require("../socket/socketManager");

/**
 * Get online moderators excluding a specific moderator.
 */
const getAvailableModerators = async (excludeModeratorId = null) => {
  const moderators = await User.find({
    role: "moderator",
    status: "online",
  }).select("_id fullName username photo status role accountType");

  if (!excludeModeratorId) {
    return moderators;
  }

  return moderators.filter(
    (moderator) => moderator._id.toString() !== excludeModeratorId.toString(),
  );
};

/**
 * Create a fresh 5-minute assignment period.
 */
const getFiveMinuteExpiry = (assignedAt) => {
  return new Date(assignedAt.getTime() + 5 * 60 * 1000);
};

/**
 * Renew an existing assignment for the same moderator.
 */
const renewAssignment = async (assignment) => {
  const assignedAt = new Date();
  const expiresAt = getFiveMinuteExpiry(assignedAt);

  assignment.status = "active";
  assignment.assignedAt = assignedAt;
  assignment.expiresAt = expiresAt;
  assignment.respondedAt = null;
  assignment.releasedAt = null;

  await assignment.save();

  return await assignment.populate([
    {
      path: "moderator",
      select: "fullName username photo status",
    },
    {
      path: "fakeUser",
      select: "fullName username photo status accountType",
    },
    {
      path: "realUser",
      select: "fullName username photo status accountType",
    },
    {
      path: "chat",
    },
  ]);
};

/**
 * Assign a moderator to a fake account conversation.
 *
 * Rules:
 * - If active assignment has not expired and moderator is online,
 *   keep the current assignment.
 *
 * - If assignment expired and another moderator is online,
 *   transfer it.
 *
 * - If assignment expired but no other moderator is online,
 *   keep the current assignment so it can be renewed when a new
 *   real-user message arrives.
 */
const assignModerator = async (arg1, arg2, arg3) => {
  let fakeUserId;
  let realUserId;
  let chatId;

  if (
    arg1 &&
    typeof arg1 === "object" &&
    Object.prototype.hasOwnProperty.call(arg1, "fakeUserId")
  ) {
    ({ fakeUserId, realUserId, chatId } = arg1);
  } else {
    fakeUserId = arg1;
    realUserId = arg2;
    chatId = arg3;
  }

  if (!fakeUserId || !realUserId || !chatId) {
    throw new Error(
      "assignModerator requires fakeUserId, realUserId, and chatId",
    );
  }

  console.log("========== ASSIGN MODERATOR ==========");
  console.log("Fake User:", fakeUserId);
  console.log("Real User:", realUserId);
  console.log("Chat:", chatId);

  let assignment = await FakeAccountAssignment.findOne({
    chat: chatId,
    status: "active",
  }).populate("moderator");

  if (assignment) {
    const now = new Date();
    const isExpired =
      assignment.expiresAt && now >= new Date(assignment.expiresAt);

    const currentModeratorOnline = assignment.moderator?.status === "online";

    /**
     * Assignment is still valid and moderator is online.
     */
    if (!isExpired && currentModeratorOnline) {
      return assignment;
    }

    /**
     * Assignment expired.
     *
     * Check whether another moderator is actually online.
     */
    if (isExpired) {
      const availableModerators = await getAvailableModerators(
        assignment.moderator?._id,
      );

      console.log("Expired assignment:", assignment._id.toString());
      console.log("Other available moderators:", availableModerators.length);

      /**
       * Another moderator is available.
       * Transfer the existing assignment.
       */
      if (availableModerators.length > 0) {
        const randomModerator =
          availableModerators[
            Math.floor(Math.random() * availableModerators.length)
          ];

        const assignedAt = new Date();
        const expiresAt = getFiveMinuteExpiry(assignedAt);

        assignment.moderator = randomModerator._id;
        assignment.assignedAt = assignedAt;
        assignment.expiresAt = expiresAt;
        assignment.respondedAt = null;
        assignment.releasedAt = null;
        assignment.status = "active";

        await assignment.save();

        return await assignment.populate([
          {
            path: "moderator",
            select: "fullName username photo status",
          },
          {
            path: "fakeUser",
            select: "fullName username photo status accountType",
          },
          {
            path: "realUser",
            select: "fullName username photo status accountType",
          },
          {
            path: "chat",
          },
        ]);
      }

      /**
       * Nobody else is online.
       *
       * IMPORTANT:
       * Do not transfer or close the assignment.
       *
       * Keep it attached to the current moderator. The assignment
       * will be renewed when the real user sends another message.
       */
      console.log("No other moderator online. Keeping expired assignment.");

      return assignment;
    }

    /**
     * Assignment has not expired, but its moderator went offline.
     *
     * Try to find another online moderator.
     */
    const availableModerators = await getAvailableModerators(
      assignment.moderator?._id,
    );

    if (availableModerators.length > 0) {
      const randomModerator =
        availableModerators[
          Math.floor(Math.random() * availableModerators.length)
        ];

      const assignedAt = new Date();
      const expiresAt = getFiveMinuteExpiry(assignedAt);

      assignment.moderator = randomModerator._id;
      assignment.assignedAt = assignedAt;
      assignment.expiresAt = expiresAt;
      assignment.respondedAt = null;
      assignment.releasedAt = null;
      assignment.status = "active";

      await assignment.save();

      return await assignment.populate([
        {
          path: "moderator",
          select: "fullName username photo status",
        },
        {
          path: "fakeUser",
          select: "fullName username photo status accountType",
        },
        {
          path: "realUser",
          select: "fullName username photo status accountType",
        },
        {
          path: "chat",
        },
      ]);
    }

    /**
     * Nobody else is online.
     * Keep the assignment.
     */
    return assignment;
  }

  /**
   * No existing assignment.
   * Find an online moderator.
   */
  const moderators = await User.find({
  role: "moderator",
  status: "online",
}).select("_id fullName username photo status role accountType");

  console.log("========== ONLINE MODERATORS ==========");
  console.log("Count:", moderators.length);
  console.log("Moderators:", moderators);
  console.log("=======================================");

  if (!moderators.length) {
    throw new Error("No moderators are currently online.");
  }

  const randomModerator =
    moderators[Math.floor(Math.random() * moderators.length)];

  const assignedAt = new Date();
  const expiresAt = getFiveMinuteExpiry(assignedAt);

  assignment = await FakeAccountAssignment.create({
    chat: chatId,
    fakeUser: fakeUserId,
    realUser: realUserId,
    moderator: randomModerator._id,
    status: "active",
    assignedAt,
    expiresAt,
  });

  console.log("FAKE ACCOUNT ASSIGNMENT CREATED");
  console.log("Assignment ID:", assignment._id.toString());
  console.log("Moderator:", randomModerator._id.toString());
  console.log("Expires:", expiresAt);

  return await assignment.populate([
    {
      path: "moderator",
      select: "fullName username photo status",
    },
    {
      path: "fakeUser",
      select: "fullName username photo status accountType",
    },
    {
      path: "realUser",
      select: "fullName username photo status accountType",
    },
    {
      path: "chat",
    },
  ]);
};

/**
 * Get the active assignment for a conversation.
 */
const getAssignment = async (chatId) => {
  return await FakeAccountAssignment.findOne({
    chat: chatId,
    status: "active",
  })
    .populate("moderator")
    .populate("fakeUser")
    .populate("realUser");
};

/**
 * Renew an expired assignment only when the current moderator
 * is still online and no other moderator is available.
 */
const renewAssignmentIfPossible = async (assignmentId) => {
  const assignment = await FakeAccountAssignment.findById(assignmentId);

  if (!assignment) {
    throw new Error("Assignment not found.");
  }

  if (assignment.status !== "active") {
    return null;
  }

  const moderator = await User.findById(assignment.moderator);

  if (!moderator) {
    return null;
  }

  const onlineModerators = await User.find({
  role: "moderator",
  status: "online",
}).select("_id fullName username photo status role accountType");

  const currentModeratorOnline = onlineModerators.some(
    (mod) => mod._id.toString() === moderator._id.toString(),
  );

  if (!currentModeratorOnline) {
    return null;
  }

  const otherOnlineModerators = onlineModerators.filter(
    (mod) => mod._id.toString() !== moderator._id.toString(),
  );

  /**
   * If another moderator is online, do not renew this moderator.
   * The caller should transfer the assignment instead.
   */
  if (otherOnlineModerators.length > 0) {
    return null;
  }

  return await renewAssignment(assignment);
};

/**
 * Close an assignment.
 */
const closeAssignment = async (assignmentId) => {
  return await FakeAccountAssignment.findByIdAndUpdate(
    assignmentId,
    {
      status: "closed",
      releasedAt: new Date(),
    },
    { new: true },
  );
};

/**
 * Transfer an assignment to another moderator.
 */
const transferAssignment = async (assignmentId) => {
  const assignment = await FakeAccountAssignment.findById(assignmentId);

  if (!assignment) {
    throw new Error("Assignment not found.");
  }

  const moderators = await User.find({
  role: "moderator",
  status: "online",
}).select("_id fullName username photo status role accountType");

  if (!moderators.length) {
    throw new Error("No moderators are currently online.");
  }

  const availableModerators = moderators.filter(
    (mod) => mod._id.toString() !== assignment.moderator.toString(),
  );

  /**
   * No other moderator is online.
   * Keep the current assignment instead of closing it.
   */
  if (!availableModerators.length) {
    return assignment.populate([
      {
        path: "moderator",
        select: "fullName username photo status",
      },
      {
        path: "fakeUser",
        select: "fullName username photo status accountType",
      },
      {
        path: "realUser",
        select: "fullName username photo status accountType",
      },
      {
        path: "chat",
      },
    ]);
  }

  const randomModerator =
    availableModerators[Math.floor(Math.random() * availableModerators.length)];

  const assignedAt = new Date();
  const expiresAt = getFiveMinuteExpiry(assignedAt);

  assignment.moderator = randomModerator._id;
  assignment.assignedAt = assignedAt;
  assignment.expiresAt = expiresAt;
  assignment.respondedAt = null;
  assignment.releasedAt = null;
  assignment.status = "active";

  await assignment.save();

  return await assignment.populate([
    {
      path: "moderator",
      select: "fullName username photo status",
    },
    {
      path: "fakeUser",
      select: "fullName username photo status accountType",
    },
    {
      path: "realUser",
      select: "fullName username photo status accountType",
    },
    {
      path: "chat",
    },
  ]);
};

/**
 * Process assignments whose 5-minute session has expired.
 *
 * This is the ONLY place that decides what happens when
 * an assignment expires.
 */
const processExpiredAssignments = async () => {
  const now = new Date();

  const expiredAssignments = await FakeAccountAssignment.find({
    status: "active",
    expiresAt: { $lte: now },
  });

  if (!expiredAssignments.length) {
    return;
  }

  console.log(`Found ${expiredAssignments.length} expired assignment(s).`);

  for (const assignment of expiredAssignments) {
    try {
      /**
       * Get online moderators excluding the moderator who
       * currently owns this assignment.
       */
      const availableModerators = await getAvailableModerators(
        assignment.moderator,
      );

      /**
       * ANOTHER MODERATOR IS ONLINE
       *
       * Transfer the conversation.
       */
      if (availableModerators.length > 0) {
        const randomModerator =
          availableModerators[
            Math.floor(Math.random() * availableModerators.length)
          ];

        const oldModeratorId = assignment.moderator;
        const assignedAt = new Date();
        const expiresAt = getFiveMinuteExpiry(assignedAt);

        assignment.moderator = randomModerator._id;
        assignment.assignedAt = assignedAt;
        assignment.expiresAt = expiresAt;
        assignment.respondedAt = null;
        assignment.releasedAt = null;
        assignment.status = "active";

        await assignment.save();

        const populatedAssignment = await assignment.populate([
          {
            path: "moderator",
            select: "fullName username photo status",
          },
          {
            path: "fakeUser",
            select: "fullName username photo status accountType",
          },
          {
            path: "realUser",
            select: "fullName username photo status accountType",
          },
          {
            path: "chat",
          },
        ]);

        console.log("ASSIGNMENT TRANSFERRED");
        console.log("Assignment:", assignment._id.toString());
        console.log("Old moderator:", oldModeratorId.toString());
        console.log("New moderator:", randomModerator._id.toString());
        console.log("New expiry:", expiresAt);

        /**
         * Emit socket events.
         *
         * The old moderator is told that the conversation
         * has been reassigned.
         *
         * The new moderator receives the conversation.
         */
        const io = require("../socket/socketManager").getIO();

        io.to(oldModeratorId.toString()).emit("assignment-expired", {
          assignmentId: assignment._id,
          chatId: assignment.chat,
          reassigned: true,
          message:
            "Your chat session has expired. This conversation has been reassigned to another moderator.",
        });

        io.to(randomModerator._id.toString()).emit("assignment-transferred", {
          assignmentId: populatedAssignment._id,
          chatId: populatedAssignment.chat?._id || populatedAssignment.chat,
          fakeUser: populatedAssignment.fakeUser,
          realUser: populatedAssignment.realUser,
          assignedAt,
          expiresAt,
        });

        continue;
      }

      /**
       * NOBODY ELSE IS ONLINE
       *
       * IMPORTANT:
       *
       * Do NOT transfer.
       * Do NOT close the assignment.
       * Do NOT mark it as transferred.
       *
       * The current moderator keeps ownership.
       *
       * When the real user sends another message,
       * messageController.js will renew the assignment.
       */
      console.log("Assignment expired, but no other moderator is online.");

      console.log("Keeping assignment:", assignment._id.toString());

      /**
       * We deliberately do not modify the assignment here.
       */
    } catch (error) {
      console.error(
        "Error processing expired assignment:",
        assignment._id?.toString(),
        error,
      );
    }
  }
};

module.exports = {
  assignModerator,
  getAssignment,
  closeAssignment,
  transferAssignment,
  renewAssignmentIfPossible,
  processExpiredAssignments,
};
