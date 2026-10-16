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

const sanitizeFlutterwaveResponse = (body) => {
  if (!body || typeof body !== "object") {
    return undefined;
  }

  const sanitized = {};

  for (const key of ["status", "code", "message"]) {
    const value = body[key];

    if (typeof value === "string" || typeof value === "number") {
      sanitized[key] =
        key === "message"
          ? String(value)
              .replace(
                /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
                "[redacted email]",
              )
              .replace(/\+?\d[\d\s().-]{6,}\d/g, "[redacted number]")
              .slice(0, 500)
          : value;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
};

/**
 * Initialize Payment (returns a hosted checkout link)
 */
const initializePayment = async (paymentData, diagnosticContext) => {
  validateConfig();

  try {
    const response = await api.post("/payments", paymentData);

    const { data } = response;

    if (data?.status !== "success") {
      console.error("[Flutterwave] Checkout initialization returned an error", {
        ...diagnosticContext,
        httpStatus: response.status,
        errorResponse: sanitizeFlutterwaveResponse(data),
      });
    } else {
      console.info("[Flutterwave] Checkout initialization response", {
        ...diagnosticContext,
        httpStatus: response.status,
      });
    }

    return data;
  } catch (error) {
    console.error("[Flutterwave] Checkout initialization failed", {
      ...diagnosticContext,
      httpStatus: error.response?.status || null,
      errorResponse: sanitizeFlutterwaveResponse(error.response?.data),
      errorCode: error.code,
    });

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
    console.error("[Flutterwave] Transaction verification failed", {
      transactionId,
      httpStatus: error.response?.status || null,
      errorResponse: sanitizeFlutterwaveResponse(error.response?.data),
      errorCode: error.code,
    });

    throw new Error(
      error.response?.data?.message || "Unable to verify transaction."
    );
  }
};

module.exports = {
  initializePayment,
  verifyTransaction,
};