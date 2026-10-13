const requireModerator = (req, res, next) => {
  if (req.user.role !== "moderator") {
    return res.status(403).json({
      success: false,
      message: "Moderator access required.",
    });
  }

  next();
};

module.exports = requireModerator;