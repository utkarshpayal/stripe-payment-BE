const cors = require("cors");
const express = require("express");
const stripe = require("stripe")(
  "sk_test_51QpYu7PmSytApPrPlWLAYhdIwl6fiqRtxtBdumuW3uDzRmZZh8cEsHiS6xMDuFVLR0moqcHgyJMgsUK1R4FVADWW00oDykONU9"
);
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const jwtDecode = require("jwt-decode");

const decoded= '';

// Connect to MongoDB
mongoose.connect("mongodb+srv://utkarsh12march2004:n3uaJlnoyOQOdWH3@cluster0.luhepax.mongodb.net/auth-db?retryWrites=true&w=majority&appName=Cluster0/payments", {});
//payment schema
const PaymentSchema = new mongoose.Schema({
  paymentId: String,
  sessionId: String,
  status: String,
  createdAt: { type: Date, default: Date.now },
  amount: Number,
  Product: String,
  id: String,
});

//gpu schema
const GPUSchema = new mongoose.Schema({
  id: { type: String, required: true },
  gpuName: { type: String, required: true },
  host: { type: String, required: true },
  vcpu: { type: String, required: true },
  ram: { type: String, required: true },
  network: { type: String, required: true },
  storage: { type: String, required: true },
  price: { type: String, required: true },
  time: { type: String, required: true },
  key: { type: String, required: true, minlength: 16, maxlength: 64 },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, default: "pending" },
  isActive: { type: Boolean, default: true },
  connectionTimes: [
    {
      peerId: { type: String, required: true },
      connectionTime: { type: Date, default: Date.now },
    },
  ],
});

const Gpu = mongoose.model("GPU", GPUSchema);
const Payment = mongoose.model("Payment", PaymentSchema);

const app = express();

// Middleware
app.use(cors());
app.use("/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// Test Route
app.get("/", (req, res) => {
  res.send("Stripe Elements Payment API is working");
});

//webhook route
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        "whsec_6e5f97f640cc2347ac083c99e0bcb712dd099310f0fe03ab238f414dd6601f9d"
      );
    } catch (err) {
      console.error("Webhook signature verification failed.", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle checkout.session.completed event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // Retrieve the paymentId from the session's metadata or custom parameters
      const paymentId = session.client_reference_id || session.payment_intent;

      // Check the payment status
      if (session.payment_status === "paid") {
        try {
          // Update payment status to 'success' in DB
          const updatedPayment = await Payment.updateOne(
            { paymentId: paymentId },
            { $set: { status: "success", sessionId: session.id } }
          );

          const payment = await Payment.findOne({ paymentId: paymentId });
          const gpu = await Gpu.findOne({ id: payment.id });
          if (!gpu) {
            throw new Error("GPU not found");
          }

          // Update the GPU document's status to 'success'
          gpu.status = "success";
          gpu.isActive = false;
          // Save the updated GPU document
          await gpu.save();

          if (updatedPayment.modifiedCount === 0) {
            console.error("Payment not found or not updated.");
          } else {
            console.log("Payment status updated to success.");
          }
        } catch (error) {
          console.error("Error updating payment status:", error.message);
        }
      } else {
        console.log("Payment is not successful or still in progress.");
      }
    }

    res.json({ received: true });
  }
);

app.post("/add-gpu", async (req, res) => {
  try {
    const { hexcode } = req.body;
    console.log(hexcode);

    try {
      console.log("Inside JWT verification");
      const decodedKey = jwt.verify(hexcode, "secret");
      console.log("Decoded Key:", decodedKey);

      // Send the URL as a JSON response
      res.json({ url: `http://localhost:5173/add-gpus/${hexcode}` });
    } catch (e) {
      console.error("JWT verification failed:", e);
      res.status(400).json({ error: "Invalid token" });
    }
  } catch (e) {
    console.error("Server error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// Get Payment Status
app.get("/status/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;

    // Find payment record in the database
    const payment = await Payment.findOne({ paymentId });

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    // Check if payment is successful
    const isPaid = payment.status === "success";

    if (!isPaid) {
      return res.json({ isPaid: false });
    }

    // Find GPU record only if payment is successful
    const gpuRecord = await Gpu.findOne({ id: payment.id });

    if (!gpuRecord) {
      return res.status(404).json({ message: "GPU record not found" });
    }

    return res.json({
      isPaid: true,
      objectId: payment._id,
      key: gpuRecord.key,
      id: gpuRecord.id,
    });
  } catch (error) {
    console.error("Error checking payment status:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Get all GPUs route
app.get("/gpus", async (req, res) => {
  try {
        const gpus = await Gpu.find();
    // const gpus = await Gpu.find({ isActive: true });

    if (!gpus.length) {
      return res.status(404).json({ message: "No GPUs found" });
    }

    res.status(200).json(gpus);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error retrieving GPUs" });
  }
});

// Create Payment Intent
app.post("/create-payment-intent", async (req, res) => {
  try {
    const { productData, priceData, gpuId } = req.body;

    const paymentId = uuidv4();

    const product = await stripe.products.create(productData);
    const price = await stripe.prices.create(priceData);

    if (!product || !price) {
      return res
        .status(400)
        .json({ success: false, message: "Failed to create product or price" });
    }
    // Save the paymentId to database first (with a "pending" status)
    const payment = await Payment.create({
      paymentId: paymentId,
      sessionId: null,
      status: "pending",
      amount: priceData.unit_amount,
      Product: product.name,
      id: gpuId,
    });

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: price.id, quantity: 1 }],
      mode: "payment",
      success_url: `http://localhost:5173/buy-gpu?paymentId=${paymentId}`,
      cancel_url: "http://localhost:8282/cancel",
      customer_email: "example@example.com",
      client_reference_id: paymentId,
    });

    if (!session) {
      return res
        .status(400)
        .json({ success: false, message: "Failed to create checkout session" });
    }

    // Update the payment in the database with the sessionId after creating the session
    await Payment.updateOne(
      { paymentId: paymentId },
      { $set: { sessionId: session.id } }
    );

    return res.status(200).json({
      success: true,
      message: "Payment session created successfully",
      checkoutUrl: session.url,
    });
  } catch (error) {
    if (error.message == "Product already exists.") {
      return res.status(400).json({
        success: false,
        message: "Product already exists",
        error: error.message,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }
});

// Add Connection Time and peer id in DB
app.post("/gpus/:id/connection-time", async (req, res) => {
  const { id } = req.params;
  const { peerId, connectionTime } = req.body;

  try {
    // Find the GPU by ID
    const gpu = await Gpu.findById(id);
    if (!gpu) {
      return res.status(404).json({ message: "GPU not found" });
    }

    if (!gpu.connectionTimes) {
      gpu.connectionTimes = [];
    }

    gpu.connectionTimes.push({ peerId, connectionTime });
    await gpu.save();

    res.status(200).json(gpu);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error adding connection time" });
  }
});

// Retrieve Payment by ID
app.get("/payment/:id", async (req, res) => {
  try {
    const payment = await Payment.findOne({ paymentId: req.params.id });
    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    }
    res.status(200).json({ success: true, payment });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// Add a new GPU
app.post("/add-gpus/:key", async (req, res) => {
  try {
    const { key } = req.params;
    const decodedKey = jwt.verify(key, "secret");
    console.log("Decoded Key:", decodedKey.key), decodedKey.timeInSeconds;
    const { host, gpu, vcpu, ram, network, storage, price, time } =
      req.body;

    if (
      !host ||
      !gpu ||
      !vcpu ||
      !ram ||
      !network ||
      !storage ||
      !price 
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }
console.log(decoded)
    // Create a new GPU entry
    const newGpu = new Gpu({
      id: uuidv4(),
      host,
      gpuName: gpu,
      vcpu,
      ram,
      network,
      storage,
      price,
      time: decodedKey.timeInSeconds,
      key: decodedKey.key,
      isActive: true,
      createdAt: new Date(),
    });

    await newGpu.save();

    res.status(201).json({ message: "GPU added successfully", gpu: newGpu });
  } catch (error) {
    console.error("Error adding GPU:", error);
    res.status(500).json({ message: "Error adding GPU" });
  }
});

// Start server
app.listen(8282, () => console.log("Server is running on port 8282"));
