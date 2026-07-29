const axios = require("axios");

const FLW_BASE_URL =
  process.env.FLW_BASE_URL ||
  "https://developersandbox-api.flutterwave.com";

const FLW_TOKEN_URL =
  process.env.FLW_TOKEN_URL ||
  "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token";

let accessToken = null;
let tokenExpiresAt = 0;

const api = axios.create({
  baseURL: FLW_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Validate Flutterwave configuration
 */
const validateConfig = () => {
  if (!process.env.FLW_CLIENT_ID) {
    throw new Error("FLW_CLIENT_ID is missing.");
  }

  if (!process.env.FLW_CLIENT_SECRET) {
    throw new Error("FLW_CLIENT_SECRET is missing.");
  }
};

/**
 * Get OAuth Access Token
 */
const getAccessToken = async () => {
  validateConfig();

  if (accessToken && Date.now() < tokenExpiresAt) {
    return accessToken;
  }

  try {
    const { data } = await axios.post(
      FLW_TOKEN_URL,
      {
        client_id: process.env.FLW_CLIENT_ID,
        client_secret: process.env.FLW_CLIENT_SECRET,
        grant_type: "client_credentials",
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    accessToken = data.access_token;

    // Refresh one minute before expiry
    tokenExpiresAt =
      Date.now() + ((data.expires_in || 600) - 60) * 1000;

    return accessToken;
  } catch (error) {
    console.error("Flutterwave OAuth Error:", error.response?.data);

    throw new Error(
      error.response?.data?.message ||
        "Unable to authenticate with Flutterwave."
    );
  }
};

/**
 * Send authenticated request
 */
const request = async (config) => {
  let token = await getAccessToken();

  try {
    return await api({
      ...config,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(config.headers || {}),
      },
    });
  } catch (error) {
    // Retry once if token expired
    if (error.response?.status === 401) {
      accessToken = null;
      tokenExpiresAt = 0;

      token = await getAccessToken();

      return await api({
        ...config,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(config.headers || {}),
        },
      });
    }

    throw error;
  }
};

/**
 * Initialize Payment
 */
const initializePayment = async (paymentData) => {
  try {
    const { data } = await request({
      method: "POST",
      url: "/payments",
      data: paymentData,
    });

    return data;
  } catch (error) {
    console.error(
      "Flutterwave Payment Error:",
      error.response?.data || error.message
    );

    throw new Error(
      error.response?.data?.message ||
        "Unable to initialize payment."
    );
  }
};

/**
 * Verify Transaction
 */
const verifyTransaction = async (transactionId) => {
  try {
    const { data } = await request({
      method: "GET",
      url: `/transactions/${transactionId}/verify`,
    });

    return data;
  } catch (error) {
    console.error(
      "Flutterwave Verification Error:",
      error.response?.data || error.message
    );

    throw new Error(
      error.response?.data?.message ||
        "Unable to verify transaction."
    );
  }
};

module.exports = {
  getAccessToken,
  initializePayment,
  verifyTransaction,
};