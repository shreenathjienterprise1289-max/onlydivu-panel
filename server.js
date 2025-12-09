// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// 👉 Yaha apna MongoDB connection string daalo
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://divuweb:divuweb@divu.knr0qmd.mongodb.net/?appName=Divu";

app.use(cors());
app.use(express.json());

// Static files serve karne ke liye (index.html, CSS, JS, etc.)
app.use(express.static(path.join(__dirname)));

// ----- MongoDB Connect -----
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ----- Schemas -----
const shopSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now },
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  mrp: { type: Number, required: true },
  price: { type: Number, required: true }, // Naye products ke liye
  createdAt: { type: Date, default: Date.now },
});

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  productName: String,
  mrp: Number,
  price: Number,
  qty: Number,
  lineTotal: Number,
  note: String,
});

const orderSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: "Shop", required: true },
  shopName: String,
  items: [orderItemSchema],
  totalAmount: Number,
  status: {
    type: String,
    enum: ["Pending", "Delivered", "Cancelled"],
    default: "Pending",
  },
  createdAt: { type: Date, default: Date.now },
});

const Shop = mongoose.model("Shop", shopSchema);
const Product = mongoose.model("Product", productSchema);
const Order = mongoose.model("Order", orderSchema);

// ---------- SHOP ROUTES ----------

// Get all shops
app.get("/api/shops", async (req, res) => {
  try {
    const shops = await Shop.find().sort({ name: 1 });
    res.json(shops);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching shops" });
  }
});

// Add shop
app.post("/api/shops", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Shop name is required" });
    }
    const shop = new Shop({ name: name.trim() });
    await shop.save();
    res.status(201).json(shop);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating shop" });
  }
});

// ---------- PRODUCT ROUTES ----------

// Get all products
app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find().sort({ name: 1 });
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching products" });
  }
});

// Add product
app.post("/api/products", async (req, res) => {
  try {
    const { name, mrp, price } = req.body;
    if (!name || mrp == null || price == null) {
      return res
        .status(400)
        .json({ message: "Name, MRP and price are required" });
    }

    const product = new Product({
      name: name.trim(),
      mrp: Number(mrp),
      price: Number(price),
    });

    await product.save();
    res.status(201).json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating product" });
  }
});

// ---------- ORDER HELP ----------

function buildParsedItems(items = []) {
  const parsedItems = items.map((item) => {
    const qty = Number(item.qty) || 1;
    const price = Number(item.price) || 0;
    return {
      productId: item.productId || null,
      productName: item.productName,
      mrp: Number(item.mrp) || 0,
      price,
      qty,
      lineTotal: price * qty,
      note: item.note || "",
    };
  });

  const totalAmount = parsedItems.reduce(
    (sum, it) => sum + (it.lineTotal || 0),
    0
  );

  return { parsedItems, totalAmount };
}

// ---------- ORDER ROUTES ----------

// Create order
app.post("/api/orders", async (req, res) => {
  try {
    const { shopId, shopName, items } = req.body;

    if (!shopId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Shop and items are required" });
    }

    const { parsedItems, totalAmount } = buildParsedItems(items);

    const order = new Order({
      shopId,
      shopName,
      items: parsedItems,
      totalAmount,
    });

    await order.save();
    res.status(201).json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating order" });
  }
});

// Update entire order (Edit)
app.put("/api/orders/:id", async (req, res) => {
  try {
    const { shopId, shopName, items } = req.body;

    if (!shopId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Shop and items are required" });
    }

    const { parsedItems, totalAmount } = buildParsedItems(items);

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        shopId,
        shopName,
        items: parsedItems,
        totalAmount,
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating order" });
  }
});

// Get all orders (optional filters: ?shopId=&status=)
app.get("/api/orders", async (req, res) => {
  try {
    const { shopId, status } = req.query;
    const filter = {};
    if (shopId) filter.shopId = shopId;
    if (status) filter.status = status;

    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching orders" });
  }
});

// Update order status only
app.patch("/api/orders/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!["Pending", "Delivered", "Cancelled"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating status" });
  }
});

// ✅ Delete order (error aaya to bhi 200 bhejenge taaki front-end fail na ho)
app.delete("/api/orders/:id", async (req, res) => {
  const id = String(req.params.id || "").trim();
  console.log("🗑️ Delete request for order:", id);

  try {
    const result = await Order.deleteOne({ _id: id });
    console.log("Delete result:", result);
    // result.deletedCount === 0 ho to bhi 200 hi bhej rahe
    return res.json({
      message:
        result.deletedCount > 0
          ? "Order deleted"
          : "Order not found or already deleted",
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.error("Delete error:", err);
    // Yaha bhi 200 hi bhejenge, sirf message alag
    return res.json({
      message: "Error while deleting, but request received",
      error: String(err),
    });
  }
});

// ---------- FRONTEND ROUTES ----------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/index.html", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ---------- START SERVER ----------
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
