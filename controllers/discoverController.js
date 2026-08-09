const User = require("../models/User");
const Match = require("../models/Match");
const Like = require("../models/Like");

/**
 * Get users for Discover page
 */

exports.getDiscoverUsers = async (req, res) => {
  try {
    const currentUserId = req.user._id;

    // Get the logged-in user's preferences
    const currentUser = await User.findById(currentUserId).select("lookingFor");

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Users already liked by the current user
    const likes = await Like.find({
      fromUser: currentUserId,
    }).select("toUser");

    const likedUserIds = likes.map((like) => like.toUser);

    // Users already matched
    const matches = await Match.find({
      users: currentUserId,
      status: "active",
    });

    const matchedUserIds = matches.flatMap((match) =>
      match.users.filter((id) => id.toString() !== currentUserId.toString()),
    );

    const excludedUsers = [currentUserId, ...likedUserIds, ...matchedUserIds];

    // 👇 Replace your old User.find() with this one
    const users = await User.find({
      _id: {
        $nin: excludedUsers,
      },
      gender: {
        $in: currentUser.lookingFor,
      },
    })
      .select(
        "fullName age gender location photo bio badge interests status verified",
      )
      .sort({
        createdAt: -1,
      });

    res.status(200).json({
      success: true,
      total: users.length,
      users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Search Discover Users
 */
exports.searchDiscoverUsers = async (req, res) => {
  try {
    const { search } = req.query;

    const query = {};

    if (search) {
      query.fullName = {
        $regex: search,
        $options: "i",
      };
    }

    query._id = {
      $ne: req.user._id,
    };

    const users = await User.find(query).select(
      "fullName age location photo bio badge interests status verified",
    );

    res.status(200).json({
      success: true,
      total: users.length,
      users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Filter Discover Users
 */
exports.filterDiscoverUsers = async (req, res) => {
  try {
    const { minAge, maxAge, location, badge } = req.query;

    const filter = {
      _id: {
        $ne: req.user._id,
      },
    };

    if (minAge || maxAge) {
      filter.age = {};

      if (minAge) filter.age.$gte = Number(minAge);

      if (maxAge) filter.age.$lte = Number(maxAge);
    }

    if (location) {
      filter.location = {
        $regex: location,
        $options: "i",
      };
    }

    if (badge) {
      filter.badge = badge;
    }

    const users = await User.find(filter).select(
      "fullName age location photo bio badge interests status verified",
    );

    res.status(200).json({
      success: true,
      total: users.length,
      users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Get Public User Profile
 */
exports.getDiscoverProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select(
      "fullName age location photo bio badge interests status verified createdAt",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
