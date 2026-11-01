const mongoose = require("mongoose");
const RealtimeEvent = require("../models/RealtimeEvent");

const subscribers = new Map();
let pollCursor = null;
let pollTimer = null;
let pollRunning = false;
let totalSubscribers = 0;

const MAX_CONNECTIONS = 10000;
const MAX_CONNECTIONS_PER_USER = 5;
const MAX_PENDING_EVENTS = 1000;
const MAX_BUFFERED_BYTES = 1024 * 1024;
const POLL_INTERVAL_MS = 500;

const sendEvent = (subscriber, event) => {
  if (
    !subscriber ||
    subscriber.closed ||
    !subscriber.res ||
    subscriber.res.destroyed ||
    subscriber.res.writableEnded
  ) {
    return;
  }

  const eventId = (event._id || event.id)?.toString();
  if (!eventId) return;

  if (subscriber.lastSentId && eventId <= subscriber.lastSentId) {
    return;
  }

  if (subscriber.res.writableLength > MAX_BUFFERED_BYTES) {
    try {
      subscriber.res.end();
    } catch {
      // ignore
    }
    return;
  }

  let payload;
  try {
    payload = JSON.stringify({
      id: eventId,
      type: event.type,
      data: event.data,
    });
  } catch (jsonError) {
    console.error("[SSE] Failed to serialize event payload:", jsonError.message);
    return;
  }

  try {
    subscriber.res.write(
      `id: ${eventId}\nevent: ${event.type}\ndata: ${payload}\n\n`,
    );
    subscriber.lastSentId = eventId;
  } catch (error) {
    console.error("[SSE] Failed to write event:", error.message);
    try {
      subscriber.res.end();
    } catch {
      // ignore
    }
  }
};

const deliverEvent = (event) => {
  if (!event || !event.recipient) return;
  const recipientId = event.recipient.toString();
  const userSubscribers = subscribers.get(recipientId);
  if (!userSubscribers || !userSubscribers.size) return;

  for (const subscriber of Array.from(userSubscribers)) {
    if (
      subscriber.closed ||
      subscriber.res?.destroyed ||
      subscriber.res?.writableEnded
    ) {
      userSubscribers.delete(subscriber);
      continue;
    }

    if (subscriber.ready) {
      sendEvent(subscriber, event);
    } else {
      if (subscriber.pending.length >= MAX_PENDING_EVENTS) {
        try {
          subscriber.res.end();
        } catch {
          // ignore
        }
        userSubscribers.delete(subscriber);
        continue;
      }
      subscriber.pending.push(event);
    }
  }
};

const pollEvents = async () => {
  if (pollRunning) return;
  pollRunning = true;

  try {
    const query = pollCursor ? { _id: { $gt: pollCursor } } : {};
    const events = await RealtimeEvent.find(query)
      .sort({ _id: 1 })
      .limit(500)
      .lean();

    for (const event of events) {
      pollCursor = event._id;
      deliverEvent(event);
    }
  } catch (error) {
    console.error("[SSE] Event polling failed:", error.message);
  } finally {
    pollRunning = false;
  }
};

const initializeRealtimeEvents = async () => {
  try {
    const latestEvent = await RealtimeEvent.findOne()
      .sort({ _id: -1 })
      .select("_id")
      .lean();
    pollCursor = latestEvent?._id || null;
  } catch (initErr) {
    console.warn("[SSE] Notice: Could not read latest realtime event:", initErr.message);
    pollCursor = null;
  }

  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollEvents, POLL_INTERVAL_MS);
  pollTimer.unref?.();
};

const publishToUser = async (userId, type, data) => {
  if (!userId || !type) {
    throw new Error("An SSE event requires a recipient and event type.");
  }

  const event = await RealtimeEvent.create({
    recipient: userId,
    type,
    data,
  });
  deliverEvent(event.toObject());
  return event;
};

const subscribeUser = async (userId, res, lastEventId) => {
  const normalizedUserId = userId.toString();
  const userSubscribers = subscribers.get(normalizedUserId) || new Set();
  if (
    totalSubscribers >= MAX_CONNECTIONS ||
    userSubscribers.size >= MAX_CONNECTIONS_PER_USER
  ) {
    return null;
  }

  let baselineId = lastEventId || null;
  if (!baselineId) {
    try {
      const latest = await RealtimeEvent.findOne()
        .sort({ _id: -1 })
        .select("_id")
        .lean();
      baselineId = latest?._id?.toString() || null;
    } catch {
      baselineId = null;
    }
  }

  const subscriber = {
    res,
    ready: false,
    closed: false,
    pending: [],
    lastSentId: baselineId,
  };
  userSubscribers.add(subscriber);
  subscribers.set(normalizedUserId, userSubscribers);
  totalSubscribers += 1;

  res.on("error", () => {
    unsubscribeUser(normalizedUserId, subscriber);
  });

  try {
    if (baselineId && mongoose.Types.ObjectId.isValid(baselineId)) {
      const replay = await RealtimeEvent.find({
        recipient: userId,
        _id: { $gt: new mongoose.Types.ObjectId(baselineId) },
      })
        .sort({ _id: 1 })
        .limit(MAX_PENDING_EVENTS + 1)
        .lean();

      if (replay.length > MAX_PENDING_EVENTS) {
        const latest = await RealtimeEvent.findOne({ recipient: userId })
          .sort({ _id: -1 })
          .select("_id")
          .lean();
        sendEvent(subscriber, {
          _id: latest?._id || new mongoose.Types.ObjectId(),
          type: "sync-required",
          data: {},
        });
      } else {
        replay.forEach((event) => sendEvent(subscriber, event));
      }
    }

    subscriber.pending
      .sort((a, b) => a._id.toString().localeCompare(b._id.toString()))
      .forEach((event) => sendEvent(subscriber, event));
    subscriber.pending = [];
    subscriber.ready = true;
  } catch (error) {
    unsubscribeUser(normalizedUserId, subscriber);
    throw error;
  }

  return () => unsubscribeUser(normalizedUserId, subscriber);
};

const unsubscribeUser = (userId, subscriber) => {
  if (!subscriber || subscriber.closed) return;
  subscriber.closed = true;
  totalSubscribers = Math.max(0, totalSubscribers - 1);
  const userSubscribers = subscribers.get(userId);
  if (userSubscribers) {
    userSubscribers.delete(subscriber);
    if (userSubscribers.size === 0) subscribers.delete(userId);
  }
};

module.exports = {
  initializeRealtimeEvents,
  publishToUser,
  subscribeUser,
  unsubscribeUser,
};
