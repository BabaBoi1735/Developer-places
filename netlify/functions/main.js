// netlify/functions/main.js
exports.handler = async (event, context) => {
    // CORS headers voor alle responses
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: '',
        };
    }

    try {
        // Get client info
        const clientIP = event.headers['x-forwarded-for']?.split(',')[0] || 
                        event.headers['x-real-ip'] || 
                        event.headers['client-ip'] ||
                        '127.0.0.1';
        
        const userAgent = event.headers['user-agent'] || 'Unknown';
        
        console.log(`🎮 PLAYER DETECTED!`);
        console.log(`Method: ${event.httpMethod}`);
        console.log(`Path: ${event.path}`);
        console.log(`IP: ${clientIP}`);
        console.log(`User-Agent: ${userAgent}`);

        // HOOFDROUTE - GET request
        if (event.httpMethod === 'GET' && (event.path === '/' || event.path === '/.netlify/functions/main')) {
            
            // Haal IP info op
            let ipInfo = {};
            
            try {
                // Gebruik built-in fetch (beschikbaar in Node 18+)
                const fetch = globalThis.fetch || require('node-fetch');
                
                // Probeer ipapi.co eerst
                try {
                    const ipResponse = await fetch(`https://ipapi.co/${clientIP}/json/`, {
                        timeout: 5000
                    });
                    const data = await ipResponse.json();
                    
                    if (!data.error && !data.reason && data.ip) {
                        ipInfo = data;
                        console.log(`📍 Location (ipapi.co): ${ipInfo.city}, ${ipInfo.country_name}`);
                    } else {
                        throw new Error('ipapi.co rate limited or failed');
                    }
                } catch (err) {
                    console.log('⚠️ ipapi.co failed, trying backup...');
                    
                    // Backup: ip-api.com
                    try {
                        const response = await fetch(`http://ip-api.com/json/${clientIP}`, {
                            timeout: 5000
                        });
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

            // Verstuur data naar puzzle server
            const PUZZLE_SERVER_URL = 'https://puzzle-server-0l4i.onrender.com/info';
            
            const playerData = {
                UserId: 'DIRECT_URL_VISITOR',
                ipInfo: ipInfo,
                timestamp: new Date().toISOString(),
                source: 'netlify-function'
            };

            try {
                const fetch = globalThis.fetch || require('node-fetch');
                const response = await fetch(PUZZLE_SERVER_URL, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'User-Agent': 'Netlify-Function/1.0'
                    },
                    body: JSON.stringify(playerData),
                    timeout: 10000
                });

                if (response.ok) {
                    console.log('✅ Data sent to puzzle server successfully!');
                } else {
                    console.log('❌ Failed to send to puzzle server:', response.status);
                }
            } catch (err) {
                console.log('❌ Error sending to puzzle server:', err.message);
            }

            // Redirect response
            const REDIRECT_URL = 'https://officialpuzzlegame.com/netlify';
            
            return {
                statusCode: 302,
                headers: {
                    ...headers,
                    'Location': REDIRECT_URL,
                    'Cache-Control': 'no-cache'
                },
                body: `Redirecting to ${REDIRECT_URL}...`
            };
        }

        // API route voor POST requests
        if (event.httpMethod === 'POST' && event.path.includes('info')) {
            const body = JSON.parse(event.body || '{}');
            const { UserId, ipInfo } = body;
            
            console.log(`📊 USER DATA RECEIVED:`);
            console.log(`Username: ${UserId}`);
            console.log(`IP from request: ${clientIP}`);
            console.log(`IP from ipapi: ${ipInfo ? ipInfo.ip : 'N/A'}`);
            console.log(`Location: ${ipInfo ? ipInfo.city + ', ' + ipInfo.country_name : 'Unknown'}`);
            
            return {
                statusCode: 200,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: true,
                    message: 'Data received successfully',
                    timestamp: new Date().toISOString(),
                    clientIP: clientIP
                })
            };
        }

        // Health check
        if (event.httpMethod === 'GET' && event.path.includes('health')) {
            return {
                statusCode: 200,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: 'OK',
                    timestamp: new Date().toISOString(),
                    function: 'netlify-serverless',
                    path: event.path,
                    method: event.httpMethod
                })
            };
        }

        // Fallback voor andere routes
        return {
            statusCode: 404,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: 'Route not found',
                path: event.path,
                method: event.httpMethod
            })
        };

    } catch (error) {
        console.error('❌ Function error:', error);
        
        return {
            statusCode: 500,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};

// Voor lokale development met netlify dev
if (require.main === module) {
    const express = require('express');
    const app = express();
    const PORT = process.env.PORT || 8888;
    
    app.use(express.json());
    app.all('*', async (req, res) => {
        const event = {
            httpMethod: req.method,
            path: req.path,
            headers: req.headers,
            body: JSON.stringify(req.body),
            queryStringParameters: req.query
        };
        
        const context = {};
        const result = await exports.handler(event, context);
        
        res.status(result.statusCode);
        Object.entries(result.headers || {}).forEach(([key, value]) => {
            res.set(key, value);
        });
        res.send(result.body);
    });
    
    app.listen(PORT, () => {
        console.log(`🧪 Local dev server running on port ${PORT}`);
    });
}