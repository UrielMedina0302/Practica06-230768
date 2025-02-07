import express from "express";
import session from "express-session";
import { v4 as uuidv4 } from "uuid";
import os from "os";
import moment from "moment-timezone";
import mongoose from "mongoose";

const app = express();
const PORT = 3100;
const MONGO_URL = "mongodb+srv://valienteua17:METU050302@cluster230768.uubu1.mongodb.net/SesionesBD?retryWrites=true&w=majority&appName=Cluster230768";

// Conectar a MongoDB
mongoose.connect(MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("Conectado a MongoDB"))
  .catch(err => console.error("Error al conectar a MongoDB:", err));

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
        email,
        nickname,
        macAddress,
        ip: getLocalIP(),
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
        finalizadaPor: session.endedBy || "activa"
    });
});

app.get("/sesiones", async (req, res) => {
    const sessions = await Session.find();
    if (sessions.length === 0) {
        return res.status(200).json({ message: "No hay sesiones activas", count: 0, sessions: [] });
    }
    res.status(200).json({ message: "Sesiones activas encontradas", count: sessions.length, sessions });
});
