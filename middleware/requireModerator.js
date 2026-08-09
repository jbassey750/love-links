const requireModerator = (req, res, next) => {
  console.log("========== MODERATOR CHECK ==========");
  console.log("User ID:", req.user?._id);
  console.log("User email:", req.user?.email);
  console.log("User role:", req.user?.role);
  console.log("Account type:", req.user?.accountType);
  console.log("=====================================");

  if (req.user.role !== "moderator") {
    return res.status(403).json({
      success: false,
      message: "Moderator access required.",
    });
  }

  next();
};

module.exports = requireModerator;