const PastebinAPI = require('pastebin-js');
const pastebin = new PastebinAPI('EMWTMkQAVfJa9kM-MRUrxd5Oku1U7pgL');
const { makeid } = require('./id');
const express = require('express');
const fs = require('fs');
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    delay,
    makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys");

const router = express.Router();

// Helper function to remove files
function removeFile(filePath) {
    if (!fs.existsSync(filePath)) return false;
    fs.rmSync(filePath, { recursive: true, force: true });
}

// Custom pairing code generator
function generateCustomPairingCode() {
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let customCode = '';
    const codeLength = 8;
    
    for (let i = 0; i < codeLength; i++) {
        customCode += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    return customCode;
}

// Predefined custom codes (you can modify this array)
const predefinedCodes = [
    'xhpyherx', 'xhypher1', 'xhypher2', 'xhypher3', 'xhypher4',
    'xhypher5', 'xhypher6', 'xhypher7', 'xhypher8', 'xhypher9'
];

let currentCodeIndex = 0;

function getPredefinedCode() {
    const code = predefinedCodes[currentCodeIndex];
    currentCodeIndex = (currentCodeIndex + 1) % predefinedCodes.length;
    return code;
}

// Route handler
router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;
    const usePredefined = req.query.predefined === 'true'; // Optional parameter to use predefined codes

    async function RAVEN() {
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        try {
            const client = makeWASocket({
                printQRInTerminal: false,
                version,
                logger: pino({
                    level: 'silent',
                }),
                browser: ['Ubuntu', 'Chrome', '20.0.04'],
                auth: {
                    ...state,
                    creds: {
                        ...state.creds,
                        // Add any custom authentication properties here if needed
                    }
                },
            });

            if (!client.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                
                // Generate custom pairing code
                const customCode = usePredefined ? getPredefinedCode() : generateCustomPairingCode();
                
                console.log(`Generated custom pairing code: ${customCode}`);
                
                try {
                    // Request the actual pairing code from WhatsApp
                    const whatsappCode = await client.requestPairingCode(num);
                    console.log(`WhatsApp generated code: ${whatsappCode}`);
                    
                    // Send custom code to client instead of WhatsApp's code
                    if (!res.headersSent) {
                        await res.send({ 
                            code: customCode,
                            whatsapp_code: whatsappCode, // Optional: include actual code for reference
                            message: 'Use this custom code for pairing'
                        });
                    }
                } catch (error) {
                    console.log('Error requesting pairing code, using custom code only:', error);
                    if (!res.headersSent) {
                        await res.send({ 
                            code: customCode,
                            message: 'Custom pairing code generated'
                        });
                    }
                }
            }

            client.ev.on('creds.update', saveCreds);
            client.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect } = s;
                if (connection === 'open') {
                    await client.sendMessage(client.user.id, { text: `Generating your session_id, Wait . .` });
                    await delay(6000);
                    
                    const data = fs.readFileSync(__dirname + `/temp/${id}/creds.json`);
                    await delay(5000);
                    const b64data = Buffer.from(data).toString('base64');
                    const session = await client.sendMessage(client.user.id, { text: 'XHYPHER:~' + b64data });

                    // Send message after session
                    await client.sendMessage(client.user.id, {text: `
╔════════════════════
║ ◇ SESSION CONNECTED ◇
║ 🔹 BOT: XHYPHER 
║ 🔹 TYPE: BASE64
║ 🔹 OWNER: XHYPHER
║ 🔹️SUPPORT: https://t.me/xhypher2025
╚════════════════════` }, { quoted: session });
                    
                    await delay(100);
                    await client.ws.close();
                    removeFile('./temp/' + id);
                } else if (connection === 'close' && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
                    console.log('Connection closed, restarting...');
                    await delay(10000);
                    RAVEN();
                } else if (connection === 'connecting') {
                    console.log('Connecting to WhatsApp...');
                }
            });
        } catch (err) {
            console.log('Service error:', err);
            removeFile('./temp/' + id);
            if (!res.headersSent) {
                await res.send({ 
                    code: 'Service Currently Unavailable',
                    error: err.message 
                });
            }
        }
    }

    await RAVEN();
});

// Additional route to get custom codes only
router.get('/generate-code', async (req, res) => {
    const usePredefined = req.query.predefined === 'true';
    const customCode = usePredefined ? getPredefinedCode() : generateCustomPairingCode();
    
    res.send({
        custom_code: customCode,
        type: usePredefined ? 'predefined' : 'random',
        available_codes: predefinedCodes
    });
});

module.exports = router;
