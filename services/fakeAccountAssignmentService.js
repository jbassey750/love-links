const FakeAccountAssignment = require("../models/FakeAccountAssignment");
const User = require("../models/User");
const {
  reserveModerator,
  releaseModeratorReservation,
} = require("./assignmentExpiryService");

/**
 * Get online moderators excluding a specific moderator.
 */
const getAvailableModerators = async (excludeModeratorId = null) => {
  const moderators = await User.find({
    role: "moderator",
    status: "online",
  }).select("_id fullName username photo status role accountType");
  const activeModeratorIds = await FakeAccountAssignment.distinct("moderator", {
    status: "active",
    expiresAt: { $gt: new Date() },
  });
  const activeModeratorIdSet = new Set(
    activeModeratorIds.map((id) => id.toString()),
  );

  return moderators.filter(
    (moderator) =>
      (!excludeModeratorId ||
        moderator._id.toString() !== excludeModeratorId.toString()) &&
      !activeModeratorIdSet.has(moderator._id.toString()),
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
  const staleClaimBefore = new Date(assignedAt.getTime() - 5 * 60 * 1000);
  const renewedAssignment = await FakeAccountAssignment.findOneAndUpdate(
    {
      _id: assignment._id,
      moderator: assignment.moderator?._id || assignment.moderator,
      status: "active",
      respondedAt: null,
      expiresAt: { $lte: assignedAt },
      $or: [
        { replyClaimedAt: null },
        { replyClaimedAt: { $lte: staleClaimBefore } },
      ],
    },
    {
      $set: {
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
  if (!renewedAssignment) return null;

  return renewedAssignment.populate([
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
 * - If assignment expired but no other moderator is eligible,
 *   the shared expiry workflow leaves it in the waiting queue.
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
     * Use the shared atomic expiry workflow rather than transferring this
     * assignment from a request handler.
     */
    if (isExpired) {
      const { checkExpiredAssignments } = require("./assignmentExpiryService");
      await checkExpiredAssignments();
      return FakeAccountAssignment.findOne({
        chat: chatId,
        status: "active",
        expiresAt: { $gt: new Date() },
      })
        .populate("moderator")
        .populate("fakeUser")
        .populate("realUser")
        .populate("chat");
    }

    /**
     * Assignment has not expired, but its moderator went offline.
     *
     * Try to find another online moderator.
     */
    const availableModerators = await getAvailableModerators(
      assignment.moderator?._id,
    );

    let selectedModerator = null;
    let moderatorReservation = null;
    for (const moderator of availableModerators.sort(
      () => Math.random() - 0.5,
    )) {
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

    if (selectedModerator) {
      const assignedAt = new Date();
      const expiresAt = getFiveMinuteExpiry(assignedAt);
      let transferredAssignment;
      try {
        transferredAssignment =
          await FakeAccountAssignment.findOneAndUpdate(
            {
              _id: assignment._id,
              moderator: assignment.moderator?._id || assignment.moderator,
              status: "active",
              respondedAt: null,
              expiresAt: { $gt: assignedAt },
              replyClaimedAt: null,
            },
            {
              $set: {
                moderator: selectedModerator._id,
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

      if (transferredAssignment) {
        return transferredAssignment.populate([
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
  const waitingAssignment = await FakeAccountAssignment.findOne({
    chat: chatId,
    status: "transferred",
    respondedAt: null,
  }).sort({ releasedAt: 1 });
  const moderators = await getAvailableModerators();

  console.log("========== ONLINE MODERATORS ==========");
  console.log("Count:", moderators.length);
  console.log("Moderators:", moderators);
  console.log("=======================================");

  if (!moderators.length) {
    throw new Error("No moderators are currently online.");
  }

  let randomModerator = null;
  let moderatorReservation = null;
  for (const moderator of moderators.sort(() => Math.random() - 0.5)) {
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

    randomModerator = moderator;
    moderatorReservation = reservation;
    break;
  }

  if (!randomModerator) {
    throw new Error("No moderators are currently available.");
  }

  const assignedAt = new Date();
  const expiresAt = getFiveMinuteExpiry(assignedAt);
  try {
    if (waitingAssignment) {
      assignment = await FakeAccountAssignment.findOneAndUpdate(
        {
          _id: waitingAssignment._id,
          status: "transferred",
          respondedAt: null,
        },
        {
          $set: {
            moderator: randomModerator._id,
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
    } else {
      assignment = await FakeAccountAssignment.create({
        chat: chatId,
        fakeUser: fakeUserId,
        realUser: realUserId,
        moderator: randomModerator._id,
        status: "active",
        assignedAt,
        expiresAt,
      });
    }
  } finally {
    await releaseModeratorReservation(
      randomModerator._id,
      moderatorReservation,
    );
  }
  if (!assignment) return null;

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

  const reservation = await reserveModerator(moderator._id);
  if (!reservation) return null;
  try {
    const hasActiveAssignment = await FakeAccountAssignment.exists({
      moderator: moderator._id,
      status: "active",
      expiresAt: { $gt: new Date() },
    });
    if (hasActiveAssignment) return null;
    return await renewAssignment(assignment);
  } finally {
    await releaseModeratorReservation(moderator._id, reservation);
  }
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

  const previousModeratorId = assignment.moderator?._id || assignment.moderator;
  const availableModerators = await getAvailableModerators(previousModeratorId);
  let selectedModerator = null;
  let moderatorReservation = null;

  for (const moderator of availableModerators.sort(
    () => Math.random() - 0.5,
  )) {
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

  const assignedAt = new Date();
  const staleClaimBefore = new Date(assignedAt.getTime() - 5 * 60 * 1000);
  let updatedAssignment;
  if (!selectedModerator) {
    updatedAssignment = await FakeAccountAssignment.findOneAndUpdate(
      {
        _id: assignment._id,
        moderator: previousModeratorId,
        status: "active",
        respondedAt: null,
        expiresAt: { $lte: assignedAt },
        $or: [
          { replyClaimedAt: null },
          { replyClaimedAt: { $lte: staleClaimBefore } },
        ],
      },
      {
        $set: {
          status: "transferred",
          releasedAt: assignedAt,
          replyClaimedAt: null,
        },
      },
      { new: true },
    );
    if (!updatedAssignment) return null;
  } else {
    const expiresAt = getFiveMinuteExpiry(assignedAt);
    try {
      updatedAssignment = await FakeAccountAssignment.findOneAndUpdate(
        {
          _id: assignment._id,
          moderator: previousModeratorId,
          status: "active",
          respondedAt: null,
          expiresAt: { $lte: assignedAt },
          $or: [
            { replyClaimedAt: null },
            { replyClaimedAt: { $lte: staleClaimBefore } },
          ],
        },
        {
          $set: {
            moderator: selectedModerator._id,
            assignedAt,
            expiresAt,
            respondedAt: null,
            releasedAt: null,
            status: "active",
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
    if (!updatedAssignment) return null;
  }

  return updatedAssignment.populate([
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
  const { checkExpiredAssignments } = require("./assignmentExpiryService");
  return checkExpiredAssignments();
};

module.exports = {
  assignModerator,
  getAssignment,
  closeAssignment,
  transferAssignment,
  renewAssignmentIfPossible,
  processExpiredAssignments,
};
