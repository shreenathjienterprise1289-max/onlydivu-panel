// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://divuweb:divuweb@divu.knr0qmd.mongodb.net/?appName=Divu";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

/* ===================== SCHEMAS ===================== */

const shopSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now },
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  mrp: { type: Number, required: true },
  price: { type: Number },
  salePrice: { type: Number },
  createdAt: { type: Date, default: Date.now },
});

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  productName: String,
  mrp: Number,
  price: Number,
  qty: Number,
  lineTotal: Number,
  note: { type: String, default: "" },
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

/* ===================== SHOP ROUTES ===================== */

app.get("/api/shops", async (req, res) => {
  try {
    const shops = await Shop.find().sort({ name: 1 });
    res.json(shops);
  } catch {
    res.status(500).json({ message: "Error fetching shops" });
  }
});

app.post("/api/shops", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim())
      return res.status(400).json({ message: "Shop name required" });

    const shop = new Shop({ name: name.trim() });
    await shop.save();
    res.status(201).json(shop);
  } catch {
    res.status(500).json({ message: "Error creating shop" });
  }
});

/* ===================== PRODUCT ROUTES ===================== */

app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find().sort({ name: 1 });
    res.json(products);
  } catch {
    res.status(500).json({ message: "Error fetching products" });
  }
});

app.post("/api/products", async (req, res) => {
  try {
    const { name, mrp, price, salePrice } = req.body;
    if (!name || mrp == null)
      return res.status(400).json({ message: "Name and MRP required" });

    const product = new Product({
      name: name.trim(),
      mrp: Number(mrp),
      price: price != null ? Number(price) : undefined,
      salePrice: salePrice != null ? Number(salePrice) : undefined,
    });

    await product.save();
    res.status(201).json(product);
  } catch {
    res.status(500).json({ message: "Error creating product" });
  }
});

/* ===================== ORDER HELP ===================== */

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
    (sum, it) => sum + it.lineTotal,
    0
  );

  return { parsedItems, totalAmount };
}

/* ===================== ORDER ROUTES ===================== */

app.post("/api/orders", async (req, res) => {
  try {
    const { shopId, shopName, items } = req.body;
    if (!shopId || !items?.length)
      return res.status(400).json({ message: "Shop & items required" });

    const { parsedItems, totalAmount } = buildParsedItems(items);

    const order = new Order({
      shopId,
      shopName,
      items: parsedItems,
      totalAmount,
    });

    await order.save();
    res.status(201).json(order);
  } catch {
    res.status(500).json({ message: "Error creating order" });
  }
});

app.put("/api/orders/:id", async (req, res) => {
  try {
    const { shopId, shopName, items } = req.body;
    if (!shopId || !items?.length)
      return res.status(400).json({ message: "Shop & items required" });

    const { parsedItems, totalAmount } = buildParsedItems(items);

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { shopId, shopName, items: parsedItems, totalAmount },
      { new: true }
    );

    if (!order) return res.status(404).json({ message: "Order not found" });

    res.json(order);
  } catch {
    res.status(500).json({ message: "Error updating order" });
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const { shopId, status } = req.query;
    const filter = {};
    if (shopId) filter.shopId = shopId;
    if (status) filter.status = status;

    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch {
    res.status(500).json({ message: "Error fetching orders" });
  }
});

app.patch("/api/orders/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!["Pending", "Delivered", "Cancelled"].includes(status))
      return res.status(400).json({ message: "Invalid status" });

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!order) return res.status(404).json({ message: "Order not found" });

    res.json(order);
  } catch {
    res.status(500).json({ message: "Error updating status" });
  }
});

app.delete("/api/orders/:id", async (req, res) => {
  try {
    const result = await Order.deleteOne({ _id: req.params.id });
    if (result.deletedCount === 0)
      return res.status(404).json({ message: "Order not found" });

    res.json({ message: "Order deleted" });
  } catch {
    res.status(500).json({ message: "Error deleting order" });
  }
});

/* ✅ NEW: CLEAR ALL ORDERS */
app.delete("/api/orders", async (req, res) => {
  try {
    const result = await Order.deleteMany({});
    res.json({
      message: "All orders deleted successfully",
      deletedCount: result.deletedCount,
    });
  } catch {
    res.status(500).json({ message: "Error clearing all orders" });
  }
});

/* ===================== FRONTEND ===================== */

app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "index.html"))
);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
