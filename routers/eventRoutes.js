const express = require("express");
const protect = require("../middleware/auth");
const {
  subscribeUser,
  unsubscribeUser,
} = require("../services/realtimeEventService"); 
const {
  connectPresence,
  disconnectPresence,
  heartbeatPresence,
} = require("../services/realtimePresenceService");

const router = express.Router();
const HEARTBEAT_INTERVAL_MS = 25 * 1000;

router.get("/stream", protect, async (req, res) => {
  const lastEventId = req.get("Last-Event-ID");
  if (lastEventId && !/^[a-f\d]{24}$/i.test(lastEventId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid Last-Event-ID header.",
    });
  }

  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let unsubscribe;
  let presence;
  let heartbeat;
  let tokenExpiryInterval;
  let closed = false;

  const cleanup = async () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearInterval(tokenExpiryInterval);
    if (typeof unsubscribe === "function") {
      try {
        unsubscribe();
      } catch (err) {
        console.warn("[SSE] Error during unsubscribe:", err.message);
      }
    }
    if (presence) {
      try {
        await disconnectPresence(presence._id, req.user._id);
      } catch (error) {
        console.error("[SSE] Presence cleanup failed:", error.message);
      }
    }
  };

  res.on("close", cleanup);
  res.on("error", (err) => {
    console.warn("[SSE] Stream response error:", err.message);
    void cleanup();
  });
  req.on("error", (err) => {
    console.warn("[SSE] Stream request error:", err.message);
    void cleanup();
  });

  try {
    unsubscribe = await subscribeUser(req.user._id, res, lastEventId);
    if (!unsubscribe) {
      res.removeListener("close", cleanup);
      return res.status(429).json({
        success: false,
        message: "Too many active real-time connections.",
      });
    }

    presence = await connectPresence(req.user);
    if (closed || res.destroyed || res.writableEnded) {
      await disconnectPresence(presence._id, req.user._id);
      return;
    }
    try {
      res.write(": connected\n\n");
    } catch {
      void cleanup();
      return;
    }

    if (req.tokenExpiresAt) {
      tokenExpiryInterval = setInterval(() => {
        if (Date.now() >= req.tokenExpiresAt) {
          try {
            res.end();
          } catch {
            // ignore
          }
        }
      }, 60 * 1000);
      tokenExpiryInterval.unref?.();
    }

    heartbeat = setInterval(() => {
      if (closed || res.destroyed || res.writableEnded) return;
      try {
        res.write(": heartbeat\n\n");
      } catch (err) {
        console.warn("[SSE] Heartbeat write failed:", err.message);
        void cleanup();
        return;
      }
      void heartbeatPresence(presence._id, req.user._id).catch((error) => {
        console.error("[SSE] Presence heartbeat failed:", error.message);
      });
    }, HEARTBEAT_INTERVAL_MS);
    heartbeat.unref?.();
  } catch (error) {
    console.error("[SSE] Stream setup failed:", error.message);
    await cleanup();
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Unable to establish real-time stream.",
      });
    } else {
      try {
        res.end();
      } catch {
        // ignore
      }
    }
  }
});

module.exports = router;
