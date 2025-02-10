import express from "express";
import session from "express-session";
import { v4 as uuidv4 } from "uuid";
import os from "os";
import moment from "moment-timezone";
import mongoose from "mongoose";
import crypto from "crypto";

const app = express();
const PORT = 3100;
const MONGO_URL = "mongodb+srv://valienteua17:METU050302@cluster230768.uubu1.mongodb.net/SesionesBD?retryWrites=true&w=majority&appName=Cluster230768";

// Conectar a MongoDB
mongoose.connect(MONGO_URL).then(() => console.log("Conectado a MongoDB"))
  .catch(err => console.error("Error al conectar a MongoDB:", err));

// Clave y IV para encriptación
const encryptionKey = crypto.randomBytes(32);
const iv = crypto.randomBytes(16);

// Función para encriptar datos sensibles
const encrypt = (text) => {
    const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
};

// Función para desencriptar datos
const decrypt = (encryptedText) => {
    const [ivHex, encryptedData] = encryptedText.split(":");
    const decipher = crypto.createDecipheriv('aes-256-cbc', encryptionKey, Buffer.from(ivHex, 'hex'));
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

// Definir esquema de sesión
const sessionSchema = new mongoose.Schema({
    sessionID: String,
    email: String,
    nickname: String,
    macAddress: String,
    ip: String,
    createdAt: Date,
    lastAccessed: Date,
    endedAt: Date,
    endedBy: String // "usuario" o "sistema"
});

const Session = mongoose.model("Session", sessionSchema);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'P4-UAMT#Sung_jin-Woo-SesionesHTTP-VariablesDeSesion',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 2 * 60 * 1000 }
}));

app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});

const getLocalIP = () => {
    const networkInterfaces = os.networkInterfaces();
    for (const interfaceName in networkInterfaces) {
        const interfaces = networkInterfaces[interfaceName];
        for (const iface of interfaces) {
            if (iface.family === "IPv4" && !iface.internal) {
                return iface.address;
            }
        }
    }
    return null;
};

app.post('/login', async (req, res) => {
    const { email, nickname, macAddress } = req.body;
    if (!email || !nickname || !macAddress) {
        return res.status(400).json({ message: "Se esperan campos requeridos" });
    }

    const sessionID = uuidv4();
    const now = new Date();
    const newSession = new Session({
        sessionID,
        email: encrypt(email),
        nickname,
        macAddress: encrypt(macAddress),
        ip: encrypt(getLocalIP() || ""),
        createdAt: now,
        lastAccessed: now
    });
    await newSession.save();
    res.status(200).json({ message: "Se ha logeado de manera exitosa", sessionID });
});

app.post('/logout', async (req, res) => {
    const { sessionID } = req.body;
    const session = await Session.findOneAndUpdate({ sessionID }, { endedAt: new Date(), endedBy: "usuario" }, { new: true });
    if (!session) {
        return res.status(404).json({ message: "No se ha encontrado una sesión activa" });
    }
    res.status(200).json({ message: "Logout exitoso" });
});

app.put('/update', async (req, res) => {
    const { sessionID } = req.body;
    const session = await Session.findOneAndUpdate({ sessionID }, { lastAccessed: new Date() }, { new: true });
    if (!session) {
        return res.status(404).json({ message: "No se ha encontrado una sesión activa" });
    }
    res.json({ message: "Sesión actualizada", session });
});

app.get('/status', async (req, res) => {
    const { sessionID } = req.body;
    const session = await Session.findOne({ sessionID });
    if (!session) {
        return res.status(404).json({ message: "No hay sesiones activas" });
    }
    const now = new Date();
    const createdAt_MX = moment(session.createdAt).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss');
    const lastAccessed_MX = moment(session.lastAccessed).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss');
    const sessionAgeMs = now - session.createdAt;
    const hours = Math.floor(sessionAgeMs / (1000 * 60 * 60));
    const minutes = Math.floor((sessionAgeMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((sessionAgeMs % (1000 * 60)) / 1000);
    res.json({
        mensaje: 'Estado de la sesión',
        SessionId: sessionID,
        Usuario: session.nickname,
        inicio: createdAt_MX,
        ultimoAcceso: lastAccessed_MX,
        antiguedad: `${hours} horas, ${minutes} minutos y ${seconds} segundos`,
        finalizadaPor: session.endedBy || "activa",
        estado: session.endedAt ? "inactiva" : "activa"
    });
});

app.delete('/delete-all-sessions', async (req, res) => {
    await Session.deleteMany({});
    res.json({ message: "Todas las sesiones han sido eliminadas" });
});

// Middleware para finalizar sesiones expiradas
setInterval(async () => {
    const expiredSessions = await Session.find({ endedAt: null });
    const now = new Date();
    for (const session of expiredSessions) {
        if (now - session.lastAccessed > 2 * 60 * 1000) { // 2 minutos
            await Session.findOneAndUpdate({ sessionID: session.sessionID }, { endedAt: now, endedBy: "sistema" });
            console.log(`Sesión ${session.sessionID} finalizada por el sistema`);
        }
    }
}, 60 * 1000); // Verifica cada minuto
