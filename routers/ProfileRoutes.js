router.get("/me", protect, getMyProfile);

router.put("/me", protect, updateProfile);

router.post("/upload-photo", protect, uploadPhoto);