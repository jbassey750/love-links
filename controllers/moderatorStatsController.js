const Message = require("../models/Message");
const FakeAccountAssignment = require("../models/FakeAccountAssignment");

/**

* Convert milliseconds into readable response time. 
  */
const formatDuration = (milliseconds) => {
  if (!milliseconds || milliseconds < 0) {
    return "0s";
  }

  const totalSeconds = Math.round(milliseconds / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
};

/**

* Start of local calendar day.
  */
const startOfDay = (date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

/**

* End of local calendar day.
  */
const endOfDay = (date) => {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
};

/**

* Monday of current week.
  */
const startOfWeek = (date) => {
  const result = startOfDay(date);

  const day = result.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;

  result.setDate(result.getDate() - daysFromMonday);

  return result;
};

/**

* First day of current month.
  */
const startOfMonth = (date) => {
  const result = startOfDay(date);
  result.setDate(1);
  return result;
};

/**

* Selected frontend range.
  */
const getDateRange = (range) => {
  const now = new Date();

  switch (range) {
    case "Yesterday": {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      return {
        start: startOfDay(yesterday),
        end: endOfDay(yesterday),
      };
    }

    case "Last 7 Days": {
      const start = startOfDay(now);
      start.setDate(start.getDate() - 6);

      return {
        start,
        end: now,
      };
    }

    case "Last 30 Days": {
      const start = startOfDay(now);
      start.setDate(start.getDate() - 29);

      return {
        start,
        end: now,
      };
    }

    case "Today":
    default:
      return {
        start: startOfDay(now),
        end: now,
      };
  }
};

/**

* Count unique conversations.
  */
const getUniqueChatCount = (messages) => {
  const chatIds = new Set();

  messages.forEach((message) => {
    if (message.chat) {
      chatIds.add(message.chat.toString());
    }
  });

  return chatIds.size;
};

/**

* Calculate average response time from assignments.
  */
const calculateAverageResponseTime = (assignments) => {
  const responseTimes = assignments
    .filter(
      (assignment) =>
        assignment.assignedAt &&
        assignment.respondedAt &&
        new Date(assignment.respondedAt) >= new Date(assignment.assignedAt),
    )
    .map(
      (assignment) =>
        new Date(assignment.respondedAt).getTime() -
        new Date(assignment.assignedAt).getTime(),
    )
    .filter((time) => time >= 0);

  if (!responseTimes.length) {
    return {
      milliseconds: 0,
      formatted: "0s",
    };
  }

  const total = responseTimes.reduce((sum, time) => sum + time, 0);

  const average = total / responseTimes.length;

  return {
    milliseconds: average,
    formatted: formatDuration(average),
  };
};

/**

* Calculate active hours from assignment periods.
  */
const calculateActiveHours = (periods) => {
  if (!periods.length) {
    return 0;
  }

  const sortedPeriods = [...periods].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );

  const merged = [];

  for (const period of sortedPeriods) {
    if (!merged.length) {
      merged.push({
        start: period.start,
        end: period.end,
      });

      continue;
    }

    const last = merged[merged.length - 1];

    if (period.start.getTime() <= last.end.getTime()) {
      if (period.end.getTime() > last.end.getTime()) {
        last.end = period.end;
      }
    } else {
      merged.push({
        start: period.start,
        end: period.end,
      });
    }
  }

  const milliseconds = merged.reduce(
    (total, period) => total + (period.end.getTime() - period.start.getTime()),
    0,
  );

  return milliseconds / 3600000;
};

/**

* GET /api/moderator/stats
  */
const getModeratorStats = async (req, res) => {
  try {
    const range = req.query.range || "Today";

    const allowedRanges = ["Today", "Yesterday", "Last 7 Days", "Last 30 Days"];

    if (!allowedRanges.includes(range)) {
      return res.status(400).json({
        success: false,
        message: "Invalid statistics range.",
      });
    }

    const now = new Date();

    /*

  * ---
  * DATE RANGES
  * ---

  */

    const selectedRange = getDateRange(range);

    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const yesterdayStart = startOfDay(yesterday);
    const yesterdayEnd = endOfDay(yesterday);

    const weekStart = startOfWeek(now);
    weekStart.setDate(weekStart.getDate() - 6);

    const monthStart = startOfMonth(now);

    /*

  * ---
  * LOAD ASSIGNMENTS
  * ---

  */

    const assignments = await FakeAccountAssignment.find({})
      .populate("moderator", "fullName username role")
      .populate("fakeUser", "fullName username age accountType photo")
      .populate("realUser", "fullName username role")
      .lean();

    /*

  * ---
  * LOAD ALL MESSAGES
  * ---

  */

    const allMessages = await Message.find({})
      .select("chat sender receiver moderator createdAt messageType")
      .populate("sender", "fullName username age accountType photo")
      .populate("moderator", "fullName username role")
      .lean();

    /*

  * ---
  * DATE FILTER HELPER
  * ---

  */

    const messagesBetween = (start, end) => {
      return allMessages.filter((message) => {
        if (!message.createdAt) {
          return false;
        }

        const date = new Date(message.createdAt);

        return date >= start && date <= end;
      });
    };

    /*

  * ---
  * MESSAGE ACTIVITY
  * ---

  */

    const todayMessages = messagesBetween(todayStart, todayEnd);

    const yesterdayMessages = messagesBetween(yesterdayStart, yesterdayEnd);

    const weekMessages = messagesBetween(weekStart, now);

    const monthMessages = messagesBetween(monthStart, now);

    const selectedMessages = messagesBetween(
      selectedRange.start,
      selectedRange.end,
    );

    /*

  * ---
  * SUMMARY
  * ---

  */

    const todayChats = getUniqueChatCount(todayMessages);

    const yesterdayChats = getUniqueChatCount(yesterdayMessages);

    const thisWeekChats = getUniqueChatCount(weekMessages);

    const thisMonthChats = getUniqueChatCount(monthMessages);

    const totalChats = getUniqueChatCount(allMessages);

    // Message counts
    const todayMessageCount = todayMessages.length;

    const yesterdayMessageCount = yesterdayMessages.length;

    const thisWeekMessageCount = weekMessages.length;

    const thisMonthMessageCount = monthMessages.length;

    const totalMessageCount = allMessages.length;

    /*

  * ---
  * RESPONSE TIME
  * ---
  *
  * Use respondedAt for the selected period.
  *
  * Example:
  *
  * assignedAt  = August 7
  * respondedAt = September 6
  *
  * This response belongs to September 6.
    */

    const rangeAssignments = assignments.filter((assignment) => {
      if (!assignment.respondedAt) {
        return false;
      }

      const respondedAt = new Date(assignment.respondedAt);

      return (
        respondedAt >= selectedRange.start && respondedAt <= selectedRange.end
      );
    });

    const averageResponse = calculateAverageResponseTime(rangeAssignments);

    /*

  * ---
  * ACTIVE / CLOSED CONVERSATIONS
  * ---

  */

    const activeAssignments = assignments.filter(
      (assignment) => assignment.status === "active",
    );

    const closedAssignments = assignments.filter(
      (assignment) => assignment.status === "closed",
    );

    const activeChatIds = new Set();

    activeAssignments.forEach((assignment) => {
      if (assignment.chat) {
        activeChatIds.add(assignment.chat.toString());
      }
    });

    const closedChatIds = new Set();

    closedAssignments.forEach((assignment) => {
      if (assignment.chat) {
        closedChatIds.add(assignment.chat.toString());
      }
    });

    /*

  * If a chat exists in both lists,
  * active takes priority.
    */

    closedChatIds.forEach((chatId) => {
      if (activeChatIds.has(chatId)) {
        closedChatIds.delete(chatId);
      }
    });

    /*

  * ---
  * CHATS PER DAY
  * ---

  */

    // const chatsPerDay = [];

    // let chartDays = 1;

    // if (range === "Last 7 Days") {
      // chartDays = 7;
    // }

    // if (range === "Last 30 Days") {
      // chartDays = 30;
    // }

    // for (let i = chartDays - 1; i >= 0; i--) {
      // const date = new Date(now);

      // date.setDate(date.getDate() - i);

      // const dayStart = startOfDay(date);
      // const dayEnd = endOfDay(date);

      // const dayMessages = messagesBetween(dayStart, dayEnd);

      // chatsPerDay.push({
        // date: dayStart.toISOString(),

        // label:
          // chartDays === 30
            // ? `${dayStart.getDate()}/${dayStart.getMonth() + 1}`
            // : dayStart.toLocaleDateString("en-US", {
                // weekday: "short",
              // }),

        // chats: getUniqueChatCount(dayMessages),
      // });
    // }

    /*
     * ---
     * MESSAGES PER DAY + CHATS PER DAY
     * ---
     */

    const messagesPerDay = [];
    const chatsPerDay = [];

    let chartStart = new Date(selectedRange.start);
    let chartEnd = new Date(selectedRange.end);

    // Build one point for every day in the selected range
    let currentDay = startOfDay(chartStart);

    while (currentDay <= chartEnd) {
      const dayStart = startOfDay(currentDay);
      const dayEnd = endOfDay(currentDay);

      // Don't go beyond the selected range
      const effectiveStart =
        dayStart < selectedRange.start ? selectedRange.start : dayStart;

      const effectiveEnd =
        dayEnd > selectedRange.end ? selectedRange.end : dayEnd;

      const dayMessages = messagesBetween(effectiveStart, effectiveEnd);
      const uniqueChatsForDay = new Set(
        dayMessages
          .filter((message) => message.chat)
          .map((message) => message.chat.toString()),
      );

      const label =
        range === "Last 30 Days"
          ? `${dayStart.getDate()}/${dayStart.getMonth() + 1}`
          : dayStart.toLocaleDateString("en-US", {
              weekday: "short",
            });

      messagesPerDay.push({
        date: dayStart.toISOString(),
        label,
        messages: dayMessages.length,
      });

      chatsPerDay.push({
        date: dayStart.toISOString(),
        label,
        chats: uniqueChatsForDay.size,
      });

      currentDay.setDate(currentDay.getDate() + 1);
    }

    /*

  * ---
  * FAKE ACCOUNT PERFORMANCE
  * ---
  *
  * We use actual messages from the selected
  * period.
  *
  * Fake account:
  *
  * sender.accountType === "fake"
  *
  * Moderator reply:
  *
  * moderator !== null
    */

    const fakeAccountMap = new Map();

    selectedMessages.forEach((message) => {
      if (!message.sender) {
        return;
      }

      const sender = message.sender;

      if (sender.accountType !== "fake") {
        return;
      }

      const fakeId = sender._id.toString();

      if (!fakeAccountMap.has(fakeId)) {
        fakeAccountMap.set(fakeId, {
          id: fakeId,
          name: sender.fullName || sender.username || "Unknown",
          age: sender.age || null,
          chatIds: new Set(),
          replies: 0,
          responseTimes: [],
        });
      }

      const fakeAccount = fakeAccountMap.get(fakeId);

      if (message.chat) {
        fakeAccount.chatIds.add(message.chat.toString());
      }

      if (message.moderator) {
        fakeAccount.replies += 1;
      }
    });

    /*

  * Add response time to fake accounts.
    */

    rangeAssignments.forEach((assignment) => {
      if (!assignment.fakeUser) {
        return;
      }

      const fakeId = assignment.fakeUser._id.toString();

      if (!fakeAccountMap.has(fakeId)) {
        fakeAccountMap.set(fakeId, {
          id: fakeId,
          name:
            assignment.fakeUser.fullName ||
            assignment.fakeUser.username ||
            "Unknown",
          age: assignment.fakeUser.age || null,
          chatIds: new Set(),
          replies: 0,
          responseTimes: [],
        });
      }

      const fakeAccount = fakeAccountMap.get(fakeId);

      if (assignment.assignedAt && assignment.respondedAt) {
        const responseTime =
          new Date(assignment.respondedAt).getTime() -
          new Date(assignment.assignedAt).getTime();

        if (responseTime >= 0) {
          fakeAccount.responseTimes.push(responseTime);
        }
      }
    });

    const fakeAccounts = Array.from(fakeAccountMap.values()).map(
      (fakeAccount) => {
        const responseTimes = fakeAccount.responseTimes;

        const average =
          responseTimes.length > 0
            ? responseTimes.reduce((sum, time) => sum + time, 0) /
              responseTimes.length
            : 0;

        return {
          id: fakeAccount.id,

          name: fakeAccount.age
            ? `${fakeAccount.name}, ${fakeAccount.age}`
            : fakeAccount.name,

          chats: fakeAccount.chatIds.size,

          replies: fakeAccount.replies,

          respTime: formatDuration(average),
        };
      },
    );

    fakeAccounts.sort((a, b) => {
      if (b.replies !== a.replies) {
        return b.replies - a.replies;
      }

      return b.chats - a.chats;
    });

    /*

  * ---
  * MODERATOR PERFORMANCE
  * ---

  */

    const moderatorMap = new Map();

    /*

  * First add moderators from actual messages.
  *
  * This is important because the assignment could
  * have started before the selected date.
    */

    const rangeModeratorMessages = selectedMessages.filter(
      (message) => message.moderator,
    );

    rangeModeratorMessages.forEach((message) => {
      const moderator = message.moderator;

      if (!moderator) {
        return;
      }

      const moderatorId = moderator._id.toString();

      if (!moderatorMap.has(moderatorId)) {
        moderatorMap.set(moderatorId, {
          id: moderatorId,

          name: moderator.fullName || moderator.username || "Unknown",

          chats: new Set(),

          replies: 0,

          responseTimes: [],

          activePeriods: [],
        });
      }

      const moderatorRecord = moderatorMap.get(moderatorId);

      if (message.chat) {
        moderatorRecord.chats.add(message.chat.toString());
      }

      moderatorRecord.replies += 1;
    });

    /*

  * Add assignment information.
    */

    rangeAssignments.forEach((assignment) => {
      if (!assignment.moderator) {
        return;
      }

      const moderatorId = assignment.moderator._id.toString();

      if (!moderatorMap.has(moderatorId)) {
        moderatorMap.set(moderatorId, {
          id: moderatorId,

          name:
            assignment.moderator.fullName ||
            assignment.moderator.username ||
            "Unknown",

          chats: new Set(),

          replies: 0,

          responseTimes: [],

          activePeriods: [],
        });
      }

      const moderator = moderatorMap.get(moderatorId);

      if (assignment.chat) {
        moderator.chats.add(assignment.chat.toString());
      }

      if (assignment.assignedAt && assignment.respondedAt) {
        const responseTime =
          new Date(assignment.respondedAt).getTime() -
          new Date(assignment.assignedAt).getTime();

        if (responseTime >= 0) {
          moderator.responseTimes.push(responseTime);
        }
      }

      /*
       * Calculate assignment active period.
       */

      if (assignment.assignedAt) {
        const start = new Date(assignment.assignedAt);

        const end = assignment.releasedAt
          ? new Date(assignment.releasedAt)
          : assignment.respondedAt
            ? new Date(assignment.respondedAt)
            : now;

        if (end > start) {
          moderator.activePeriods.push({
            start,
            end,
          });
        }
      }
    });

    /*

  * ---
  * BUILD MODERATOR RESULTS
  * ---

  */

    const moderators = Array.from(moderatorMap.values()).map((moderator) => {
      const responseTimes = moderator.responseTimes;

      const average =
        responseTimes.length > 0
          ? responseTimes.reduce((sum, time) => sum + time, 0) /
            responseTimes.length
          : 0;

      const activeHours = calculateActiveHours(moderator.activePeriods);

      return {
        id: moderator.id,

        name: moderator.name,

        chats: moderator.chats.size,

        replies: moderator.replies,

        respTime: formatDuration(average),

        activeHours: activeHours > 0 ? `${activeHours.toFixed(1)}h` : "0h",
      };
    });

    /*

  * ---
  * MARK CURRENT MODERATOR
  * ---

  */

    const currentModeratorId = req.user?._id ? req.user._id.toString() : null;

    moderators.forEach((moderator) => {
      if (currentModeratorId && moderator.id === currentModeratorId) {
        moderator.name += " (You)";
      }
    });

    /*

  * ---
  * SORT MODERATORS
  * ---

  */

    moderators.sort((a, b) => {
      if (b.chats !== a.chats) {
        return b.chats - a.chats;
      }

      return a.name.localeCompare(b.name);
    });

    /*

  * ---
  * RESPONSE
  * ---

  */

    return res.status(200).json({
      success: true,

      range,

      summary: {
        // Chat statistics
        today: todayChats,
        yesterday: yesterdayChats,
        thisWeek: thisWeekChats,
        thisMonth: thisMonthChats,
        total: totalChats,

        // Message statistics
        todayMessages: todayMessageCount,
        yesterdayMessages: yesterdayMessageCount,
        thisWeekMessages: thisWeekMessageCount,
        thisMonthMessages: thisMonthMessageCount,
        totalMessages: totalMessageCount,

        // Other statistics
        avgResponseTime: averageResponse.formatted,

        activeConvos: activeChatIds.size,

        closedConvos: closedChatIds.size,
      },

      charts: {
        messagesPerDay,
        chatsPerDay,

        conversationStatus: [
          {
            label: "Active",
            value: activeChatIds.size,
          },

          {
            label: "Closed",
            value: closedChatIds.size,
          },
        ],
      },

      fakeAccounts,

      moderators,
    });
  } catch (error) {
    console.error("❌ Get moderator statistics error:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to load moderator statistics.",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = {
  getModeratorStats,
};
