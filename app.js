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

mongoose.connect(MONGO_URL).then(() => console.log("Conectado a MongoDB"))
  .catch(err => console.error("Error al conectar a MongoDB:", err));

const encryptionKey = crypto.randomBytes(32);
const iv = crypto.randomBytes(16);

app.get('/', (req, res)=>{
    return res.status(200).json({
        message: "Bienvenid@ a la API de sesiones HTTP con Express y MongoDB",
        author: "Uriel Abdallah Medina Torres"
    })
})

const encrypt = (text) => {
    const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
};

const decrypt = (encryptedText) => {
    if (!encryptedText || typeof encryptedText !== "string") {
        console.error("Error: Valor inválido en decrypt ->", encryptedText);
        return "Valor no disponible";  
    }

    const parts = encryptedText.split(":");
    if (parts.length !== 2) {
        console.error("Error: Formato incorrecto en decrypt ->", encryptedText);
        return "Error en desencriptado";
    }

    const [ivHex, encryptedData] = parts;
    const decipher = crypto.createDecipheriv('aes-256-cbc', encryptionKey, Buffer.from(ivHex, 'hex'));
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

const sessionSchema = new mongoose.Schema({
    sessionID: String,
    email: String,
    nickname: String,
    clientData: {
        clientIp: String,
        clientMac: String
    },
    serverData: {
        serverIp: String,
        serverMac: String
    },
    createdAt: Date,
    lastAccessed: Date,
    endedAt: Date,
    endedBy: String,
    activo: { type: Boolean, default: true }
});

const Session = mongoose.model("Session", sessionSchema);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'P4-UAMT#Sung_jin-Woo-SesionesHTTP-VariablesDeSesion',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 5 * 60 * 1000 }
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

const getServerMac = () => {
    const networkInterfaces = os.networkInterfaces();
    for (const interfaceName in networkInterfaces) {
        const interfaces = networkInterfaces[interfaceName];
        for (const iface of interfaces) {
            if (iface.mac && iface.mac !== "00:00:00:00:00:00") {
                return iface.mac;
            }
        }
    }
    return "No disponible";
};

app.post('/login', async (req, res) => {
    const { email, nickname, macAddress } = req.body;
    if (!email || !nickname || !macAddress) {
        return res.status(400).json({ message: "Se esperan campos requeridos" });
    }

    const sessionID = uuidv4();
    const now = moment().tz('America/Mexico_City').toDate();

    const newSession = new Session({
        sessionID,
        email: encrypt(email),
        nickname,
        clientData: {
            clientIp: req.ip,
            clientMac: encrypt(macAddress)
        },
        serverData: {
            serverIp: getLocalIP(),
            serverMac: encrypt(getServerMac())
        },
        createdAt: now,
        lastAccessed: now,
        activo: true
    });

    await newSession.save();
    res.status(200).json({ message: "Se ha logeado de manera exitosa", sessionID });
});

app.post('/logout', async (req, res) => {
    const { sessionID } = req.body;
    const now = moment().tz('America/Mexico_City').toDate();
    const session = await Session.findOneAndUpdate({ sessionID }, { endedAt: now, endedBy: "usuario", activo: false }, { new: true });

    if (!session) {
        return res.status(404).json({ message: "No se ha encontrado una sesión activa" });
    }
    res.status(200).json({ message: "Logout exitoso" });
});

app.get('/Allsessions', async (req, res) => {
    try {
        const sessions = await Session.find({}); // Obtener todas las sesiones de la BD

        res.status(200).json(sessions); // Devolver las sesiones tal cual están en la base de datos
    } catch (error) {
        console.error("Error al obtener las sesiones:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
});

app.get('/status', async (req, res) => {
    const { sessionID } = req.body;
    const session = await Session.findOne({ sessionID });

    if (!session) {
        return res.status(404).json({ message: "No hay sesiones activas" });
    }

    const now = moment().tz('America/Mexico_City');
    const createdAt_MX = moment.utc(session.createdAt).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss');
    const lastAccessed_MX = moment.utc(session.lastAccessed).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss');
    const endedAt_MX = session.endedAt ? moment.utc(session.endedAt).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss') : "Aún activa";

    const sessionAgeMs = now.diff(moment.utc(session.createdAt));
    const hours = Math.floor(sessionAgeMs / (1000 * 60 * 60));
    const minutes = Math.floor((sessionAgeMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((sessionAgeMs % (1000 * 60)) / 1000);

    res.json({
        mensaje: 'Estado de la sesión',
        SessionId: sessionID,
        Usuario: session.nickname,
        estado: session.activo ? "Activa" : "Inactiva",
        inicio: createdAt_MX,
        ultimoAcceso: lastAccessed_MX,
        finalizado: endedAt_MX,
        duracion: session.activo ? `${hours} horas, ${minutes} minutos y ${seconds} segundos` : "Finalizada",
        clientData: {
            clientIp: session.clientData.clientIp,
            clientMac: decrypt(session.clientData.clientMac)
        },
        serverData: {
            serverIp: session.serverData.serverIp,
            serverMac: decrypt(session.serverData.serverMac)
        }
    });
});

app.put('/update', async (req, res) => {
    const { sessionID } = req.body;
    const now = moment().tz('America/Mexico_City');

    // Buscar la sesión en la base de datos
    const session = await Session.findOneAndUpdate(
        { sessionID, activo: true },
        { lastAccessed: now.toDate() }, // Se actualiza lastAccessed en la base de datos
        { new: true }
    );

    if (!session) {
        return res.status(404).json({ message: "No se ha encontrado una sesión activa" });
    }

    const createdAt = moment.utc(session.createdAt).tz('America/Mexico_City');
    const lastAccessed = moment.utc(session.lastAccessed).tz('America/Mexico_City');

    // Calcular duración total de la sesión desde su creación
    const sessionAgeMs = now.diff(createdAt);
    const sessionDuration = moment.duration(sessionAgeMs);
    const sessionDurationFormatted = `${sessionDuration.hours()} horas, ${sessionDuration.minutes()} minutos y ${sessionDuration.seconds()} segundos`;

    // Calcular tiempo de inactividad desde el último acceso antes de actualizar
    const inactivityMs = now.diff(lastAccessed);
    const inactivityDuration = moment.duration(inactivityMs);
    const inactivityFormatted = `${inactivityDuration.hours()} horas, ${inactivityDuration.minutes()} minutos y ${inactivityDuration.seconds()} segundos`;

    res.json({
        message: "Sesión actualizada en la base de datos",
        sessionID: session.sessionID,
        usuario: session.nickname,
        email: session.email,
        estado: session.activo ? "Activa" : "Inactiva",
        clientData: {
            clientIp: session.clientData.clientIp,
            clientMac: session.clientData.clientMac
        },
        serverData: {
            serverIp: session.serverData.serverIp,
            serverMac:session.serverData.serverMac
        },
        duracionSesion: sessionDurationFormatted,
        tiempoInactividad: inactivityFormatted,
        ultimoAcceso: lastAccessed.format('YYYY-MM-DD HH:mm:ss'),
        nuevoUltimoAcceso: now.format('YYYY-MM-DD HH:mm:ss')
    });
});

app.get('/sesiones', async (req, res) => {
    // Solo obtener sesiones activas
    const sessions = await Session.find({ activo: true });

    const sessionData = sessions.map(session => ({
        sessionID: session.sessionID,
        usuario: session.nickname,
        estado: session.activo ? "Activa" : "Inactiva",
        creado: moment.utc(session.createdAt).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
        ultimoAcceso: moment.utc(session.lastAccessed).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
        clientData: {
            clientIp: session.clientData.clientIp,
            clientMac: decrypt(session.clientData.clientMac)
        },
        serverData: {
            serverIp: session.serverData.serverIp,
            serverMac: decrypt(session.serverData.serverMac)
        }
    }));

    res.status(200).json(sessionData);
});

setInterval(async () => {
    const expiredSessions = await Session.find({ activo: true });
    const now = moment().tz('America/Mexico_City').toDate();
    for (const session of expiredSessions) {
        if (now - session.lastAccessed > 5 * 60 * 1000) {
            await Session.findOneAndUpdate({ sessionID: session.sessionID }, { endedAt: now, endedBy: "sistema", activo: false });
            console.log(`Sesión ${session.sessionID} finalizada por el sistema`);
        }
    }
}, 60 * 1000);
