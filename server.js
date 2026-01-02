const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();

// Configuración para Render
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, "public")));

// Carpeta para guardar archivos
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuración de Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB límite
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes y PDFs'));
    }
  }
});

// Base de datos en memoria (en producción usarías una BD real)
let pedidos = [];

// ========== RUTAS PRINCIPALES ==========

// Ruta principal - redirige al landing page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Ruta para la tienda
app.get("/tienda", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "tienda.html"));
});

// Ruta para el panel admin
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

// ========== API ENDPOINTS ==========

// Recibir pedido con archivo
app.post("/pedido", upload.single("comprobante"), (req, res) => {
  try {
    const email = req.body.email;
    const comment = req.body.comment;
    const file = req.file;

    if (!email || !file) {
      return res.status(400).json({ 
        error: true, 
        message: "Faltan datos: email o comprobante" 
      });
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: true, 
        message: "Email inválido" 
      });
    }

    const id = Date.now();
    const nuevoPedido = {
      id,
      email,
      comment: comment || "",
      archivo: file.filename,
      originalName: file.originalname,
      tamaño: file.size,
      fecha: new Date().toISOString(),
      estado: "pendiente",
      ip: req.ip
    };

    pedidos.unshift(nuevoPedido); // Agregar al inicio

    console.log("📥 NUEVO PEDIDO RECIBIDO:");
    console.log("🆔 ID:", id);
    console.log("📧 Email:", email);
    console.log("💬 Comentario:", comment || "(Sin comentario)");
    console.log("🖼️ Archivo:", file.filename, `(${(file.size / 1024).toFixed(2)} KB)`);
    console.log("⏰ Fecha:", new Date().toLocaleString());
    console.log("-----------------------------------");

    res.json({ 
      success: true, 
      id,
      message: "✅ Comprobante recibido correctamente",
      data: {
        id,
        email,
        archivo: file.filename
      }
    });
    
  } catch (error) {
    console.error("❌ Error al procesar pedido:", error);
    res.status(500).json({ 
      error: true, 
      message: "Error interno del servidor",
      detail: error.message 
    });
  }
});

// Obtener todos los pedidos (para admin)
app.get("/pedidos", (req, res) => {
  res.json({
    success: true,
    total: pedidos.length,
    pendientes: pedidos.filter(p => p.estado === "pendiente").length,
    aprobados: pedidos.filter(p => p.estado === "aprobado").length,
    pedidos: pedidos
  });
});

// Obtener un pedido específico
app.get("/pedido/:id", (req, res) => {
  const id = Number(req.params.id);
  const pedido = pedidos.find(p => p.id === id);
  
  if (!pedido) {
    return res.status(404).json({ 
      error: true, 
      message: "Pedido no encontrado" 
    });
  }
  
  res.json({ success: true, pedido });
});

// Aprobar pedido
app.post("/aprobar/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const pedido = pedidos.find(p => p.id === id);
    
    if (!pedido) {
      return res.status(404).json({ 
        error: true, 
        message: "Pedido no encontrado" 
      });
    }

    if (pedido.estado === "aprobado") {
      return res.json({ 
        success: true, 
        message: "El pedido ya estaba aprobado" 
      });
    }

    // Actualizar estado
    pedido.estado = "aprobado";
    pedido.aprobadoPor = "admin";
    pedido.aprobadoEn = new Date().toISOString();

    console.log(`✅ Pedido ${id} aprobado para ${pedido.email}`);

    // Enviar email de confirmación
    let emailEnviado = false;
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER || "Streakxit@gmail.com",
          pass: process.env.GMAIL_PASS || "gqqu pitu jeoj advc",
        },
      });

      await transporter.sendMail({
        from: '"Streak.xit 🎮" <streakxit@gmail.com>',
        to: pedido.email,
        subject: "✅ Pago Aprobado - Streak.xit",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4CAF50;">¡Tu pago ha sido aprobado! 🎉</h2>
            <p>Hola,</p>
            <p>Tu comprobante de pago ha sido verificado y <strong>APROBADO</strong>.</p>
            
            <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>📋 Detalles del pedido:</strong></p>
              <p>🆔 ID: <strong>${pedido.id}</strong></p>
              <p>📅 Fecha de aprobación: ${new Date(pedido.aprobadoEn).toLocaleDateString('es-ES')}</p>
            </div>
            
            <p>Recibirás acceso a tu producto en las próximas horas.</p>
            <p>Si tienes alguna pregunta, responde a este email.</p>
            
            <br/>
            <p>¡Gracias por confiar en <strong>Streak.xit</strong>! 🎮</p>
            <p>Saludos,<br/>El equipo de Streak.xit</p>
          </div>
        `,
      });

      emailEnviado = true;
      console.log(`📧 Email enviado a ${pedido.email}`);
      
    } catch (emailError) {
      console.error("❌ Error al enviar email:", emailError);
      // Continuamos aunque falle el email
    }

    res.json({ 
      success: true, 
      message: "Pedido aprobado" + (emailEnviado ? " y email enviado" : " (email no enviado)"),
      pedido: {
        id: pedido.id,
        email: pedido.email,
        estado: pedido.estado,
        aprobadoEn: pedido.aprobadoEn,
        emailEnviado: emailEnviado
      }
    });
    
  } catch (error) {
    console.error("❌ Error al aprobar pedido:", error);
    res.status(500).json({ 
      error: true, 
      message: "Error interno al aprobar pedido" 
    });
  }
});

// Eliminar pedido (para admin)
app.delete("/pedido/:id", (req, res) => {
  const id = Number(req.params.id);
  const index = pedidos.findIndex(p => p.id === id);
  
  if (index === -1) {
    return res.status(404).json({ 
      error: true, 
      message: "Pedido no encontrado" 
    });
  }
  
  // Opcional: eliminar archivo físico
  const pedido = pedidos[index];
  const filePath = path.join(uploadsDir, pedido.archivo);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  
  pedidos.splice(index, 1);
  
  console.log(`🗑️ Pedido ${id} eliminado`);
  res.json({ 
    success: true, 
    message: "Pedido eliminado" 
  });
});

// Servir archivos subidos
app.use("/uploads", express.static(uploadsDir));

// Ruta de salud del servidor
app.get("/health", (req, res) => {
  res.json({
    status: "online",
    server: "Streak.xit Backend",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    pedidos: pedidos.length,
    uptime: process.uptime()
  });
});

// Manejo de errores 404
app.use((req, res) => {
  res.status(404).json({
    error: true,
    message: "Ruta no encontrada",
    path: req.path
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor Streak.xit iniciado`);
  console.log(`📍 Puerto: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🛒 Tienda: http://localhost:${PORT}/tienda`);
  console.log(`👨‍💼 Admin: http://localhost:${PORT}/admin`);
  console.log(`❤️  Health: http://localhost:${PORT}/health`);
  console.log(`📂 Uploads: ${uploadsDir}`);
  console.log(`===================================`);
});