const axios = require("axios");

const FLW_BASE_URL = "https://api.flutterwave.com/v3";

const api = axios.create({
  baseURL: FLW_BASE_URL,
  timeout: 30000,
  headers: {
    Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
});

/**
 * Validate Flutterwave configuration
 */
const validateConfig = () => {
  if (!process.env.FLW_SECRET_KEY) {
    throw new Error("FLW_SECRET_KEY is missing.");
  }
};

/**
 * Initialize Payment (returns a hosted checkout link)
 */
const initializePayment = async (paymentData) => {
  validateConfig();

  try {
    const { data } = await api.post("/payments", paymentData);
    return data;
  } catch (error) {
    console.error(
      "Flutterwave Payment Error:",
      error.response?.data || error.message
    );

    throw new Error(
      error.response?.data?.message || "Unable to initialize payment."
    );
  }
};

/**
 * Verify Transaction
 */
const verifyTransaction = async (transactionId) => {
  validateConfig();

  try {
    const { data } = await api.get(`/transactions/${transactionId}/verify`);
    return data;
  } catch (error) {
    console.error(
      "Flutterwave Verification Error:",
      error.response?.data || error.message
    );

    throw new Error(
      error.response?.data?.message || "Unable to verify transaction."
    );
  }
};

module.exports = {
  initializePayment,
  verifyTransaction,
};