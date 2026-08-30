const Package = require("../models/Package");

/**
 * @desc    Create a new package
 * @route   POST /api/packages
 * @access  Admin
 */
exports.createPackage = async (req, res) => {
  try {
    const {
      name,
      type,
      price,
      currency,
      points,
      duration,
      durationUnit,
      description,
    } = req.body;

    // Basic validation
    if (!name || !type || price === undefined) {
      return res.status(400).json({
        success: false,
        message: "Name, type, and price are required",
      });
    }

    // Validate package type
    if (!["points", "subscription"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Package type must be either points or subscription",
      });
    }

    // Validate price
    if (Number(price) < 0) {
      return res.status(400).json({
        success: false,
        message: "Price cannot be negative",
      });
    }

    // POINT PACKAGE VALIDATION
    if (type === "points") {
      if (!points || Number(points) <= 0) {
        return res.status(400).json({
          success: false,
          message: "Points package must have points greater than 0",
        });
      }
    }

    // SUBSCRIPTION PACKAGE VALIDATION
    if (type === "subscription") {
      if (!duration || Number(duration) <= 0) {
        return res.status(400).json({
          success: false,
          message: "Subscription package must have a valid duration",
        });
      }

      if (!["days", "months"].includes(durationUnit)) {
        return res.status(400).json({
          success: false,
          message: "Duration unit must be days or months",
        });
      }
    }

    const newPackage = await Package.create({
      name,
      type,
      price,
      currency: currency || "USD",

      // Only point packages use points
      points: type === "points" ? points : 0,

      // Only subscription packages use duration
      duration: type === "subscription" ? duration : null,
      durationUnit: type === "subscription" ? durationUnit : null,

      description: description || "",

      createdBy: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: "Package created successfully",
      package: newPackage,
    });
  } catch (error) {
    console.error("Create package error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create package",
      error: error.message,
    });
  }
};

/**
 * @desc    Get all packages
 * @route   GET /api/packages
 * @access  Public
 */
exports.getAllPackages = async (req, res) => {
  try {
    const packages = await Package.find()
      .populate("createdBy", "fullName email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: packages.length,
      packages,
    });
  } catch (error) {
    console.error("Get packages error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch packages",
      error: error.message,
    });
  }
};

/**
 * @desc    Get one package by ID
 * @route   GET /api/packages/:id
 * @access  Public
 */
exports.getPackageById = async (req, res) => {
  try {
    const { id } = req.params;

    const packageData = await Package.findById(id).populate(
      "createdBy",
      "fullName email"
    );

    if (!packageData) {
      return res.status(404).json({
        success: false,
        message: "Package not found",
      });
    }

    return res.status(200).json({
      success: true,
      package: packageData,
    });
  } catch (error) {
    console.error("Get package error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch package",
      error: error.message,
    });
  }
};

/**
 * @desc    Update a package
 * @route   PUT /api/packages/:id
 * @access  Admin
 */
exports.updatePackage = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      type,
      price,
      currency,
      points,
      duration,
      durationUnit,
      description,
    } = req.body;

    const packageData = await Package.findById(id);

    if (!packageData) {
      return res.status(404).json({
        success: false,
        message: "Package not found",
      });
    }

    // Determine the new type
    const newType = type || packageData.type;

    if (!["points", "subscription"].includes(newType)) {
      return res.status(400).json({
        success: false,
        message: "Package type must be either points or subscription",
      });
    }

    // Validate price
    if (price !== undefined && Number(price) < 0) {
      return res.status(400).json({
        success: false,
        message: "Price cannot be negative",
      });
    }

    // POINT PACKAGE
    if (newType === "points") {
      const newPoints =
        points !== undefined ? Number(points) : packageData.points;

      if (!newPoints || newPoints <= 0) {
        return res.status(400).json({
          success: false,
          message: "Points package must have points greater than 0",
        });
      }

      packageData.points = newPoints;
      packageData.duration = null;
      packageData.durationUnit = null;
    }

    // SUBSCRIPTION PACKAGE
    if (newType === "subscription") {
      const newDuration =
        duration !== undefined
          ? Number(duration)
          : packageData.duration;

      const newDurationUnit =
        durationUnit || packageData.durationUnit;

      if (!newDuration || newDuration <= 0) {
        return res.status(400).json({
          success: false,
          message: "Subscription package must have a valid duration",
        });
      }

      if (!["days", "months"].includes(newDurationUnit)) {
        return res.status(400).json({
          success: false,
          message: "Duration unit must be days or months",
        });
      }

      packageData.points = 0;
      packageData.duration = newDuration;
      packageData.durationUnit = newDurationUnit;
    }

    // Update common fields
    if (name !== undefined) packageData.name = name;
    if (type !== undefined) packageData.type = newType;
    if (price !== undefined) packageData.price = Number(price);
    if (currency !== undefined) packageData.currency = currency;
    if (description !== undefined) {
      packageData.description = description;
    }

    await packageData.save();

    return res.status(200).json({
      success: true,
      message: "Package updated successfully",
      package: packageData,
    });
  } catch (error) {
    console.error("Update package error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update package",
      error: error.message,
    });
  }
};

/**
 * @desc    Delete a package
 * @route   DELETE /api/packages/:id
 * @access  Admin
 */
exports.deletePackage = async (req, res) => {
  try {
    const { id } = req.params;

    const packageData = await Package.findById(id);

    if (!packageData) {
      return res.status(404).json({
        success: false,
        message: "Package not found",
      });
    }

    await Package.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Package deleted successfully",
    });
  } catch (error) {
    console.error("Delete package error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete package",
      error: error.message,
    });
  }
};

/**
 * @desc    Activate or deactivate a package
 * @route   PATCH /api/packages/:id/status
 * @access  Admin
 */
exports.togglePackageStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const packageData = await Package.findById(id);

    if (!packageData) {
      return res.status(404).json({
        success: false,
        message: "Package not found",
      });
    }

    packageData.isActive = !packageData.isActive;

    await packageData.save();

    return res.status(200).json({
      success: true,
      message: packageData.isActive
        ? "Package activated successfully"
        : "Package deactivated successfully",
      package: packageData,
    });
  } catch (error) {
    console.error("Toggle package status error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update package status",
      error: error.message,
    });
  }
};