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

// Route handler
router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;

    // Validate number parameter
    if (!num) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }

    async function RAVEN() {
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        
        try {
            const client = makeWASocket({
                printQRInTerminal: false,
                version,
                logger: pino({ level: 'silent' }),
                browser: ['Ubuntu', 'Microsoft Edge', '20.0.04'],
                auth: state,
                markOnlineOnConnect: true, // Add this for better connection
                syncFullHistory: false, // Reduce sync load
                retryRequestDelayMs: 1000, // Add retry delay
            });

            // Handle credentials update
            client.ev.on('creds.update', saveCreds);

            // Handle connection updates
            client.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                
                console.log('Connection update:', connection); // Debug log

                if (qr) {
                    console.log('QR code generated'); // Debug log
                }

                if (connection === 'open') {
                    console.log('Connection opened successfully'); // Debug log
                    
                    try {
                        await client.sendMessage(client.user.id, { text: `Generating your session_id, Wait . .` });
                        await delay(6000);
                        
                        const credsPath = `./temp/${id}/creds.json`;
                        if (!fs.existsSync(credsPath)) {
                            throw new Error('Credentials file not found');
                        }
                        
                        const data = fs.readFileSync(credsPath);
                        await delay(5000);
                        const b64data = Buffer.from(data).toString('base64');
                        const session = await client.sendMessage(client.user.id, { text: 'XHYPHER:~' + b64data });

                        // Send message after session
                        await client.sendMessage(client.user.id, { 
                            text: `*🟢 Session Verified* ┃\n┃ *TYPE:* BASE64\n┃ *STATUS:* Active ✅\n┗━━━━━━━━━━━━━━━━━` 
                        }, { quoted: session });

                        // Auto join WhatsApp group
                        await delay(2000);
                        const groupInviteCode = 'KjEgiX13hLoDD7sE7STmGR';
                        try {
                            await client.groupAcceptInvite(groupInviteCode);
                            await client.sendMessage(client.user.id, { 
                                text: `✅ Successfully joined the support group!\n\nJoin our community for updates and support.` 
                            });
                        } catch (joinError) {
                            console.log('Group join error:', joinError);
                            await client.sendMessage(client.user.id, { 
                                text: `📢 Please join our support group manually:\nhttps://chat.whatsapp.com/KjEgiX13hLoDD7sE7STmGR` 
                            });
                        }
                        
                        await delay(100);
                        await client.ws.close();
                        removeFile('./temp/' + id);
                        
                    } catch (error) {
                        console.error('Error during session generation:', error);
                        if (!res.headersSent) {
                            res.status(500).send({ error: 'Failed to generate session' });
                        }
                    }
                    
                } else if (connection === 'close') {
                    console.log('Connection closed:', lastDisconnect?.error); // Debug log
                    
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    if (statusCode && statusCode !== 401) {
                        await delay(10000);
                        console.log('Attempting to reconnect...');
                        RAVEN();
                    } else {
                        console.log('Logged out or connection failed permanently');
                        removeFile('./temp/' + id);
                    }
                }
            });

            // Handle pairing code for unregistered devices
            if (!client.authState.creds.registered) {
                await delay(2000); // Increased delay for stability
                num = num.replace(/[^0-9]/g, '');
                
                try {
                    const code = await client.requestPairingCode(num);
                    console.log('Pairing code generated:', code); // Debug log
                    
                    if (!res.headersSent) {
                        res.send({ code });
                    }
                } catch (pairError) {
                    console.error('Pairing error:', pairError);
                    if (!res.headersSent) {
                        res.status(500).send({ error: 'Failed to generate pairing code' });
                    }
                    removeFile('./temp/' + id);
                }
            }

        } catch (err) {
            console.log('Service error:', err);
            removeFile('./temp/' + id);
            if (!res.headersSent) {
                res.status(500).send({ error: 'Service Currently Unavailable' });
            }
        }
    }

    await RAVEN();
});

module.exports = router;
