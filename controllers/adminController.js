const User = require("../models/User");
const bcrypt = require("bcryptjs");
const Like = require("../models/Like");
const Match = require("../models/Match");
const Chat = require("../models/Chat");
const Message = require("../models/Message");

const createNotification = require("../utils/createNotification");
const { getIO } = require("../socket/socketManager");
const { assignModerator } = require("../services/fakeAccountAssignmentService");

/**
 * Create Premium User
 * POST /api/admin/create-premium-user
 * Access: Admin Only
 */
exports.createPremiumUser = async (req, res) => {
  try {
    let {
      username,
      email,
      password,
      fullName,
      age,
      gender,
      lookingFor,
      phone,
      bio,
      badge,
      interests,
      state,
      region,
    } = req.body;

    // ===============================
    // Validate Required Fields
    // ===============================

    if (!username || !email || !password || !fullName || !age) {
      return res.status(400).json({
        success: false,
        message: "Please fill in all required fields.",
      });
    }

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required.",
      });
    }

    if (!gender) {
      return res.status(400).json({
        success: false,
        message: "Gender identity is required.",
      });
    }

    username = username.trim();
    email = email.toLowerCase().trim();
    fullName = fullName.trim();
    phone = phone.trim();
    gender = gender.toLowerCase().trim();
    state = state ? state.trim() : "";
    region = region ? region.trim() : "";

    if (!state) {
      return res.status(400).json({
        success: false,
        message: "State is required.",
      });
    }

    if (!region) {
      return res.status(400).json({
        success: false,
        message: "Region is required.",
      });
    }

    // ===============================
    // Normalize Interests
    // ===============================

    if (typeof interests === "string") {
      try {
        interests = JSON.parse(interests);
      } catch {
        interests = interests ? [interests] : [];
      }
    }

    if (!Array.isArray(interests)) {
      interests = [];
    }

    // ===============================
    // Normalize Looking For
    // ===============================

    if (typeof lookingFor === "string") {
      try {
        lookingFor = JSON.parse(lookingFor);
      } catch {
        lookingFor = [lookingFor];
      }
    }

    if (!Array.isArray(lookingFor)) {
      lookingFor = [];
    }

    lookingFor = lookingFor.map((item) => item.toLowerCase().trim());

    const allowedLookingFor = [
      "female",
      "male",
      "non-binary",
      "agender",
      "bigender",
      "genderfluid",
      "genderqueer",
      "transgender",
      "prefer not to say",
      "other",
    ];

    const isValid = lookingFor.every((item) =>
      allowedLookingFor.includes(item),
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid lookingFor value.",
      });
    }

    if (!lookingFor.length) {
      return res.status(400).json({
        success: false,
        message: "Please select who the user is looking for.",
      });
    }

    // ===============================
    // Password Validation
    // ===============================

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    // ===============================
    // Age Validation
    // ===============================

    if (age < 18 || age > 99) {
      return res.status(400).json({
        success: false,
        message: "Age must be between 18 and 99.",
      });
    }

    // ===============================
    // Check Existing Email
    // ===============================

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already exists.",
      });
    }

    // ===============================
    // Check Existing Username
    // ===============================

    const existingUsername = await User.findOne({ username });

    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: "Username already exists.",
      });
    }

    // ===============================
    // Hash Password
    // ===============================

    const hashedPassword = await bcrypt.hash(password, 10);

    // ===============================
    // Create Premium User
    // ===============================

    const premiumUser = await User.create({
      username,
      email,
      password: hashedPassword,
      fullName,
      phone,
      gender,
      lookingFor,
      age,
      state,
      region,
      bio: bio || "",
      badge: badge || "Love & Friends",
      interests,
      photo: req.file ? req.file.filename : "",
      role: "premium",
      accountType: "real",
      createdBy: "admin",
    });

    const safeUser = await User.findById(premiumUser._id).select("-password");

    return res.status(201).json({
      success: true,
      message: "Premium user created successfully.",
      user: safeUser,
    });
  } catch (error) {
    console.error("Create Premium User Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

//create fake account
exports.createFakeAccount = async (req, res) => {
  try {
    let {
      username,
      email,
      password,
      fullName,
      age,
      gender,
      lookingFor,
      phone,
      bio,
      badge,
      interests,
      state,
      region,
    } = req.body;

    // ===============================
    // Validate Required Fields
    // ===============================
    if (
      !username ||
      !email ||
      !password ||
      !fullName ||
      !age ||
      !gender ||
      !phone ||
      !state ||
      !region
    ) {
      return res.status(400).json({
        success: false,
        message: "Please fill in all required fields.",
      });
    }

    username = username.trim();
    email = email.toLowerCase().trim();
    fullName = fullName.trim();
    phone = phone.trim();
    gender = gender.toLowerCase().trim();
    state = state.trim();
    region = region.trim();

    // ===============================
    // Email Check
    // ===============================
    const existingEmail = await User.findOne({ email });

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already exists.",
      });
    }

    // ===============================
    // Username Check
    // ===============================
    const existingUsername = await User.findOne({ username });

    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: "Username already exists.",
      });
    }

    // ===============================
    // Password Validation
    // ===============================
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    // ===============================
    // Hash Password
    // ===============================
    const hashedPassword = await bcrypt.hash(password, 10);

    // ===============================
    // Normalize Interests
    // ===============================
    if (typeof interests === "string") {
      try {
        interests = JSON.parse(interests);
      } catch {
        interests = interests ? [interests] : [];
      }
    }

    if (!Array.isArray(interests)) {
      interests = [];
    }

    // ===============================
    // Normalize Looking For
    // ===============================
    if (typeof lookingFor === "string") {
      try {
        lookingFor = JSON.parse(lookingFor);
      } catch {
        lookingFor = [lookingFor];
      }
    }

    if (!Array.isArray(lookingFor)) {
      lookingFor = [];
    }

    // ===============================
    // Create Fake Account
    // ===============================
    const fakeAccount = await User.create({
      username,
      email,
      password: hashedPassword,
      fullName,
      phone,
      gender,
      lookingFor,
      age,
      state,
      region,
      bio: bio || "",
      badge: badge || "Love &Friends",
      interests,
      photo: req.file ? req.file.filename : "",
      verified: true,
      status: "offline",

      // IMPORTANT
      role: "user",
      accountType: "fake",
      createdBy: "admin",
    });

    const safeUser = await User.findById(fakeAccount._id).select("-password");

    res.status(201).json({
      success: true,
      message: "Fake account created successfully.",
      user: safeUser,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

//admin like user
exports.approveFakeLike = async (req, res) => {
  try {
    const { likeId } = req.params;

    // Find the pending like
    const like = await Like.findById(likeId);

    if (!like) {
      return res.status(404).json({
        success: false,
        message: "Like not found.",
      });
    }

    if (like.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "This like has already been processed.",
      });
    }

    const realUser = await User.findById(like.fromUser);
    const fakeUser = await User.findById(like.toUser);

    if (!realUser || !fakeUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (fakeUser.accountType !== "fake") {
      return res.status(400).json({
        success: false,
        message: "Target user is not a fake account.",
      });
    }

    // Prevent duplicate matches
    const existingMatch = await Match.findOne({
      users: {
        $all: [realUser._id, fakeUser._id],
        $size: 2,
      },
    });

    if (existingMatch) {
      return res.status(400).json({
        success: false,
        message: "Users are already matched.",
      });
    }

    // Create reverse like (fake -> real)
    await Like.create({
      fromUser: fakeUser._id,
      toUser: realUser._id,
      status: "matched",
    });

    // Update original like
    like.status = "matched";
    await like.save();

    // Create match
    const match = await Match.create({
      users: [realUser._id, fakeUser._id],
      status: "active",
    });

    // Create chat
    const chat = await Chat.create({
      participants: [realUser._id, fakeUser._id],
      match: match._id,
      isActive: true,
    });

    // Save chat on match
    match.chatId = chat._id;
    await match.save();

    // Assign moderator
    const assignment = await assignModerator({
      fakeUserId: fakeUser._id,
      realUserId: realUser._id,
      chatId: chat._id,
    });

    // ==============================
    // ADD THE SOCKET CODE HERE
    // ==============================
    const { getIO } = require("../socket/socketManager");

    const io = getIO();

    io.to(realUser._id.toString()).emit("new-match", {
      matchId: match._id,
      chatId: chat._id,
      user: fakeUser,
    });

    // Notify the real user
    await createNotification({
      receiver: realUser._id,
      sender: fakeUser._id,
      type: "match",
      title: "It's a Match! ❤️",
      message: `${fakeUser.fullName} matched with you.`,
      data: {
        matchId: match._id,
        chatId: chat._id,
      },
    });

    res.status(201).json({
      success: true,
      message: "Fake account approved successfully.",
      match,
      chat,
      assignment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.createModerator = async (req, res) => {
  try {
    const {
      fullName,
      username,
      email,
      password,
      phone,
      gender,
      age,
      state,
      region,
      bio,
      interests,
      badge,
      lookingFor,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already exists.",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create moderator
    const moderator = await User.create({
      fullName,
      username,
      email,
      password: hashedPassword,
      phone,
      gender,
      age,
      state,
      region,
      bio,
      interests,
      badge,
      lookingFor,
      role: "moderator",
      accountType: "real",
      createdBy: "admin",
      verified: true,
      status: "offline",
    });

    res.status(201).json({
      success: true,
      message: "Moderator created successfully.",
      moderator,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

//like user with fake account
exports.likeUserWithFakeAccount = async (req, res) => {
  try {
    const { fakeUserId } = req.params;
    const { realUserId } = req.body;

    if (!realUserId) {
      return res.status(400).json({
        success: false,
        message: "Real user ID is required.",
      });
    }

    const fakeUser = await User.findById(fakeUserId);
    const realUser = await User.findById(realUserId);

    if (!fakeUser || !realUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (fakeUser.accountType !== "fake") {
      return res.status(400).json({
        success: false,
        message: "Selected account is not a fake account.",
      });
    }

    if (realUser.accountType !== "real") {
      return res.status(400).json({
        success: false,
        message: "Target user must be a real account.",
      });
    }

    // ==========================================
    // Check if fake account already liked user
    // ==========================================

    const existingFakeLike = await Like.findOne({
      fromUser: fakeUser._id,
      toUser: realUser._id,
    });

    if (existingFakeLike) {
      return res.status(400).json({
        success: false,
        status: existingFakeLike.status,
        message: "Fake account already liked this user.",
      });
    }

    // ==========================================
    // Check if user already liked fake account
    // ==========================================

    const reverseLike = await Like.findOne({
      fromUser: realUser._id,
      toUser: fakeUser._id,
    });

    // ==========================================
    // NO EXISTING LIKE
    // ==========================================

    if (!reverseLike) {
      const like = await Like.create({
        fromUser: fakeUser._id,
        toUser: realUser._id,
        status: "pending",
      });

      await createNotification({
        receiver: realUser._id,
        sender: fakeUser._id,
        type: "like",
        title: "New Like ❤️",
        message: `${fakeUser.fullName} liked your profile.`,
        data: {
          likeId: like._id,
          userId: fakeUser._id,
        },
      });

      const io = getIO();

      io.to(realUser._id.toString()).emit("notification", {
        type: "like",
        title: "New Like ❤️",
        message: `${fakeUser.fullName} liked your profile.`,
        data: {
          likeId: like._id,
          userId: fakeUser._id,
        },
      });

      return res.status(201).json({
        success: true,
        status: "pending",
        message: "Fake account liked the user successfully.",
        like,
      });
    }

    // ==========================================
    // MUTUAL LIKE
    // ==========================================

    const existingMatch = await Match.findOne({
      users: {
        $all: [fakeUser._id, realUser._id],
        $size: 2,
      },
    });

    if (existingMatch) {
      return res.status(400).json({
        success: false,
        status: "already-matched",
        message: "Users are already matched.",
        matchId: existingMatch._id,
        chatId: existingMatch.chatId,
      });
    }

    // ==========================================
    // Mark both likes as matched
    // ==========================================

    reverseLike.status = "matched";
    await reverseLike.save();

    const fakeLike = await Like.create({
      fromUser: fakeUser._id,
      toUser: realUser._id,
      status: "matched",
    });

    // ==========================================
    // Create Match
    // ==========================================

    const match = await Match.create({
      users: [fakeUser._id, realUser._id],
      status: "active",
    });

    // ==========================================
    // Create Chat
    // ==========================================

    const chat = await Chat.create({
      participants: [fakeUser._id, realUser._id],
      match: match._id,
    });

    match.chatId = chat._id;
    await match.save();

    // ==========================================
    // Assign Moderator
    // ==========================================

    let assignment = null;

    try {
      assignment = await assignModerator({
        fakeUserId: fakeUser._id,
        realUserId: realUser._id,
        chatId: chat._id,
      });

      console.log(
        "✅ Fake account moderator assignment:",
        assignment._id.toString(),
      );
    } catch (error) {
      console.error("❌ Moderator assignment failed:", error.message);
    }

    // ==========================================
    // Match socket events
    // ==========================================

    const io = getIO();

    io.to(fakeUser._id.toString()).emit("new-match", {
      matchId: match._id,
      chatId: chat._id,
      user: realUser,
    });

    io.to(realUser._id.toString()).emit("new-match", {
      matchId: match._id,
      chatId: chat._id,
      user: fakeUser,
    });

    // ==========================================
    // MATCH NOTIFICATIONS
    // ==========================================

    await Promise.all([
      createNotification({
        receiver: realUser._id,
        sender: fakeUser._id,
        type: "match",
        title: "It's a Match! ❤️",
        message: `${fakeUser.fullName} matched with you.`,
        data: {
          matchId: match._id,
          chatId: chat._id,
          userId: fakeUser._id,
        },
      }),

      createNotification({
        receiver: fakeUser._id,
        sender: realUser._id,
        type: "match",
        title: "It's a Match! ❤️",
        message: `${realUser.fullName} matched with you.`,
        data: {
          matchId: match._id,
          chatId: chat._id,
          userId: realUser._id,
        },
      }),
    ]);

    return res.status(201).json({
      success: true,
      status: "matched",
      message: "Congratulations! It's a match.",
      matchId: match._id,
      chatId: chat._id,
      assignmentId: assignment?._id || null,
      match,
      chat,
    });
  } catch (error) {
    console.error("Fake Account Like Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

//admin poker user

exports.pokeMatchedUser = async (req, res) => {
  try {
    const { matchId } = req.params;

    const match = await Match.findById(matchId).populate(
      "users",
      "fullName username role accountType",
    );

    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found.",
      });
    }

    if (match.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "This match is no longer active.",
      });
    }

    if (!match.users || match.users.length !== 2) {
      return res.status(400).json({
        success: false,
        message: "Invalid match participants.",
      });
    }

    // Send the poke to real/premium users only.
    const recipients = match.users.filter(
      (user) => user.accountType === "real",
    );

    if (!recipients.length) {
      return res.status(400).json({
        success: false,
        message: "No real user found in this match.",
      });
    }

    const io = getIO();

    const notifications = [];

    for (const user of recipients) {
      const notification = await createNotification({
        receiver: user._id,
        sender: req.user._id,
        type: "match-reminder",
        title: "Your match is waiting ❤️",
        message: "You have a match waiting for you. Start a conversation now!",
        data: {
          matchId: match._id,
          chatId: match.chatId,
          type: "match-reminder",
        },
      });

      notifications.push(notification);

      io.to(user._id.toString()).emit("notification", {
        _id: notification._id,
        type: "match-reminder",
        title: "Your match is waiting ❤️",
        message: "You have a match waiting for you. Start a conversation now!",
        data: {
          matchId: match._id,
          chatId: match.chatId,
          type: "match-reminder",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Match reminder sent successfully.",
      matchId: match._id,
      chatId: match.chatId,
      notifications,
    });
  } catch (error) {
    console.error("Poke matched user error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getAllActiveMatches = async (req, res) => {
  try {
    const matches = await Match.find({
      status: "active",
    })
      .populate({
        path: "users",
        select: "fullName username email photo accountType role status",
      })
      .populate({
        path: "chatId",
        select: "_id lastMessage createdAt",
      })
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      total: matches.length,
      matches,
    });
  } catch (error) {
    console.error("Get all active matches error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getAdminChat = async (req, res) => {
  try {
    const { chatId } = req.params;

    if (!chatId) {
      return res.status(400).json({
        success: false,
        message: "Chat ID is required.",
      });
    }

    // Make sure the logged-in user is an admin
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required.",
      });
    }

    const chat = await Chat.findById(chatId).populate({
      path: "participants",
      select: "fullName username email photo role accountType badge status",
    });

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found.",
      });
    }

    const messages = await Message.find({
      chat: chatId,
    })
      .populate({
        path: "sender",
        select: "fullName username photo role accountType",
      })
      .sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      chat,
      messages,
      totalMessages: messages.length,
    });
  } catch (error) {
    console.error("Get admin chat error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.startAdminConversation = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { message } = req.body;

    // =========================================================
    // Validate message
    // =========================================================

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required.",
      });
    }

    // =========================================================
    // Admin protection
    // =========================================================

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required.",
      });
    }

    // =========================================================
    // Find match
    // =========================================================

    const match = await Match.findById(matchId).populate({
      path: "users",
      select: "fullName username email photo role accountType badge status",
    });

    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found.",
      });
    }

    if (match.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "This match is no longer active.",
      });
    }

    // =========================================================
    // Make sure the match has two users
    // =========================================================

    if (!match.users || match.users.length !== 2) {
      return res.status(400).json({
        success: false,
        message: "This match does not have two valid users.",
      });
    }

    const [userOne, userTwo] = match.users;

    // =========================================================
    // Find chat
    // =========================================================

    let chat = await Chat.findById(match.chatId);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found for this match.",
      });
    }

    // =========================================================
    // Make sure conversation is empty
    // =========================================================

    const existingMessages = await Message.countDocuments({
      chat: chat._id,
    });

    if (existingMessages > 0) {
      return res.status(400).json({
        success: false,
        message:
          "This conversation has already started. Admin outreach is only available for empty conversations.",
      });
    }

    // =========================================================
    // Determine recipients
    // =========================================================

    const recipient = match.users.find((user) => user.accountType !== "fake");

    if (!recipient) {
      return res.status(400).json({
        success: false,
        message: "No real or premium user was found in this match.",
      });
    }

    const fakeUser = match.users.find((user) => user.accountType === "fake");

    if (!fakeUser) {
      return res.status(400).json({
        success: false,
        message: "No fake account was found in this match.",
      });
    }

    // =========================================================
    // Create admin/platform message
    // =========================================================

    const senderId = req.user._id;
    const receiverId = recipient._id;
    const chatId = chat._id;

    const newMessage = await Message.create({
      // IMPORTANT:
      // This message is from the platform/admin,
      // not secretly from a fake account.
      chat: chatId,
      sender: senderId,
      receiver: receiverId,
      message: message.trim(),
      messageType: "text",
    });

    // =========================================================
    // Populate message sender
    // =========================================================

    await newMessage.populate({
      path: "sender",
      select: "fullName username photo role accountType",
    });

    // =========================================================
    // Create notification for recipients
    // =========================================================

    // =========================================================
    // Create notification for recipient
    // =========================================================

    await createNotification({
      receiver: recipient._id,
      sender: req.user._id,
      type: "message",
      title: `Message from ${fakeUser.fullName}`,
      message: message.trim(),
      data: {
        chatId: chat._id,
        matchId: match._id,
        messageId: newMessage._id,
        senderType: "fake",
      },
    });

    // =========================================================
    // Send real-time Socket.IO notification
    // =========================================================

    // =========================================================
    // Send real-time Socket.IO notification
    // =========================================================

    const io = getIO();

    io.to(recipient._id.toString()).emit("notification", {
      type: "message",
      title: "Message from LoveLink",
      message: message.trim(),
      data: {
        chatId: chat._id,
        matchId: match._id,
        messageId: newMessage._id,
        senderType: "admin",
      },
    });

    // Send the actual message to the user's chat
    io.to(recipient._id.toString()).emit("new-message", {
      ...newMessage.toObject(),
      chat: chat._id,
      senderType: "fake",
      sender: {
        _id: fakeUser._id,
        fullName: fakeUser.fullName,
        username: fakeUser.username,
        photo: fakeUser.photo,
        accountType: "fake",
      },
    });

    // =========================================================
    // Update chat
    // =========================================================

    chat.lastMessage = newMessage._id;
    chat.lastMessageAt = newMessage.createdAt;

    await chat.save();

    // =========================================================
    // Response
    // =========================================================

    return res.status(201).json({
      success: true,
      message: "Conversation started successfully.",
      data: {
        matchId: match._id,
        chatId: chat._id,
        message: newMessage,
        recipient: {
          _id: recipient._id,
          fullName: recipient.fullName,
          username: recipient.username,
          role: recipient.role,
          accountType: recipient.accountType,
        },
      },
    });
  } catch (error) {
    console.error("Start admin conversation error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
