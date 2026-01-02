const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();

// ================= CONFIG =================
const PORT = process.env.PORT || 3000;

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir frontend desde /public
app.use(express.static(path.join(__dirname, "public")));

// ================= UPLOADS =================
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|pdf|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error("Solo imágenes o PDFs"));
  }
});

// ================= DB EN MEMORIA =================
let pedidos = [];

// ================= RUTAS FRONTEND =================

// Landing
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Tienda (si la usás)
app.get("/tienda", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "tienda.html"));
});

// ✅ PANEL ADMIN (ESTO ERA EL ERROR)
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// ================= API =================

// Crear pedido
app.post("/pedido", upload.single("comprobante"), (req, res) => {
  try {
    const { email, comment } = req.body;
    const file = req.file;

    if (!email || !file) {
      return res.status(400).json({ error: true, message: "Faltan datos" });
    }

    const id = Date.now();
    const pedido = {
      id,
      email,
      comentario: comment || "",
      archivo: file.filename,
      fecha: new Date().toISOString(),
      estado: "pendiente"
    };

    pedidos.unshift(pedido);

    res.json({
      success: true,
      message: "Pedido recibido",
      pedido
    });

  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Obtener pedidos
app.get("/pedidos", (req, res) => {
  res.json({
    success: true,
    pedidos
  });
});

// Aprobar pedido
app.post("/aprobar/:id", async (req, res) => {
  const id = Number(req.params.id);
  const pedido = pedidos.find(p => p.id === id);

  if (!pedido) {
    return res.status(404).json({ error: true, message: "No encontrado" });
  }

  pedido.estado = "aprobado";
  pedido.aprobadoEn = new Date().toISOString();

  // Email (opcional)
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: '"Streak.xit" <streakxit@gmail.com>',
      to: pedido.email,
      subject: "Pago aprobado",
      html: `<h2>Pago aprobado ✅</h2><p>ID: ${pedido.id}</p>`
    });

  } catch (e) {
    console.log("Email no enviado");
  }

  res.json({ success: true, pedido });
});

// Eliminar pedido
app.delete("/pedido/:id", (req, res) => {
  const id = Number(req.params.id);
  pedidos = pedidos.filter(p => p.id !== id);
  res.json({ success: true });
});

// ================= ESTÁTICOS =================
app.use("/uploads", express.static(uploadsDir));

// ================= HEALTH =================
app.get("/health", (req, res) => {
  res.json({
    status: "online",
    pedidos: pedidos.length,
    uptime: process.uptime()
  });
});

// ================= 404 =================
app.use((req, res) => {
  res.status(404).json({ error: true, message: "Ruta no encontrada" });
});

// ================= START =================
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
