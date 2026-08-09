const FakeAccountAssignment = require("../models/FakeAccountAssignment");
const User = require("../models/User");
const { getOnlineModerators } = require("../socket/socketManager");

/**
 * Assign a moderator to a fake account conversation.
 * If an active assignment already exists, return it.
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
  // Check for an existing active assignment
  let assignment = await FakeAccountAssignment.findOne({
    chat: chatId,
    status: "active",
  }).populate("moderator");

  if (assignment) {
    // If the assigned moderator is still online, keep using them
    if (assignment.moderator.status === "online") {
      return assignment;
    }

    // Otherwise mark the assignment as transferred
    assignment.status = "transferred";
    assignment.releasedAt = new Date();
    await assignment.save();
  }

  // Get all online moderators
  const moderators = await getOnlineModerators();
  console.log("========== ONLINE MODERATORS ==========");
  console.log("Count:", moderators.length);
  console.log("Moderators:", moderators);
  console.log("=======================================");

  if (!moderators.length) {
    throw new Error("No moderators are currently online.");
  }

  // Pick one at random
  const randomModerator =
    moderators[Math.floor(Math.random() * moderators.length)];

  // Create a new assignment
  assignment = await FakeAccountAssignment.create({
    chat: chatId,
    fakeUser: fakeUserId,
    realUser: realUserId,
    moderator: randomModerator._id,
    status: "active",
  });

  console.log("✅ FAKE ACCOUNT ASSIGNMENT CREATED");
  console.log("Assignment ID:", assignment._id);

  return await assignment.populate([
    {
      path: "moderator",
      select: "fullName username photo status",
    },
    {
      path: "fakeUser",
      select: "fullName username photo",
    },
    {
      path: "realUser",
      select: "fullName username photo",
    },
  ]);
};

/**
 * Get the active assignment for a conversation
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
 * Close an assignment
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
 * Transfer an assignment to another moderator
 */
const transferAssignment = async (assignmentId) => {
  const assignment = await FakeAccountAssignment.findById(assignmentId);

  if (!assignment) {
    throw new Error("Assignment not found.");
  }

  const moderators = await getOnlineModerators();

  if (!moderators.length) {
    throw new Error("No moderators are currently online.");
  }

  const availableModerators = moderators.filter(
    (mod) => mod._id.toString() !== assignment.moderator.toString(),
  );

  if (!availableModerators.length) {
    return assignment;
  }

  const randomModerator =
    availableModerators[Math.floor(Math.random() * availableModerators.length)];

  assignment.moderator = randomModerator._id;
  assignment.assignedAt = new Date();

  await assignment.save();

  return await assignment.populate([
    {
      path: "moderator",
      select: "fullName username photo status",
    },
    {
      path: "fakeUser",
      select: "fullName username photo",
    },
    {
      path: "realUser",
      select: "fullName username photo",
    },
    {
      path: "chat",
    },
  ]);
};

module.exports = {
  assignModerator,
  getAssignment,
  closeAssignment,
  transferAssignment,
};
