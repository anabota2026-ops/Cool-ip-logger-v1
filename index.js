// IP Logger v1 - Vercel KV Edition (Persistent + Serverless)
const express = require('express');
const path = require('path');
const { kv } = require('@vercel/kv');
const app = express();

const PORT = process.env.PORT || 3000;
const LOGS_KEY = 'ip_logger:logs';
const HITS_KEY = 'ip_logger:hits';

// Memory cache for this instance
let localCache = { logs: [], totalHits: 0 };
let cacheValid = false;

// Load cache from KV on startup
const initCache = async () => {
    try {
        const [logsData, totalHits] = await Promise.all([
            kv.get(LOGS_KEY),
            kv.get(HITS_KEY)
        ]);
        
        localCache = {
            logs: logsData || [],
            totalHits: totalHits || 0
        };
        cacheValid = true;
        console.log(`Loaded ${localCache.logs.length} logs from KV, boss man`);
    } catch (err) {
        console.error('KV init error:', err);
        localCache = { logs: [], totalHits: 0 };
        cacheValid = false;
    }
};

initCache();

app.use(express.json());
app.use(express.static('public'));

// CORE MIDDLEWARE - CAPTURES REAL IP
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return next();
    }

    const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || 
                     req.headers['cf-connecting-ip'] ||
                     req.headers['x-real-ip'] || 
                     req.connection?.remoteAddress ||
                     req.socket?.remoteAddress ||
                     'UNKNOWN';
    
    const timestamp = new Date().toISOString();
    const userAgent = req.get('user-agent') || 'Unknown';
    const method = req.method;
    const url = req.originalUrl;
    
    const logEntry = {
        ip: clientIP,
        timestamp,
        userAgent,
        method,
        url,
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        date: new Date().toLocaleDateString('en-US')
    };
    
    // Update local cache
    localCache.logs.push(logEntry);
    localCache.totalHits++;
    
    // Keep last 500 entries
    if (localCache.logs.length > 500) {
        localCache.logs = localCache.logs.slice(-500);
    }
    
    // Async write to KV (don't block response)
    (async () => {
        try {
            await Promise.all([
                kv.set(LOGS_KEY, localCache.logs),
                kv.set(HITS_KEY, localCache.totalHits)
            ]);
        } catch (err) {
            console.error('KV write error:', err);
        }
    })();
    
    console.log(`[${timestamp}] ${clientIP} | ${method} ${url}`);
    next();
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Get stats
app.get('/api/stats', async (req, res) => {
    try {
        const logsData = await kv.get(LOGS_KEY) || [];
        const totalHits = await kv.get(HITS_KEY) || 0;
        
        const uniqueIPs = new Set(logsData.map(l => l.ip));
        
        res.json({
            totalRequests: totalHits,
            uniqueIPs: uniqueIPs.size,
            recentIPs: logsData.slice(-20).reverse()
        });
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ 
            error: 'Failed to fetch stats', 
            totalRequests: localCache.totalHits,
            uniqueIPs: new Set(localCache.logs.map(l => l.ip)).size,
            recentIPs: localCache.logs.slice(-20).reverse(),
            cached: true
        });
    }
});

// API: Get all logs
app.get('/api/logs', async (req, res) => {
    try {
        const logsData = await kv.get(LOGS_KEY) || [];
        const totalHits = await kv.get(HITS_KEY) || 0;
        
        res.json({ logs: logsData, totalHits });
    } catch (err) {
        console.error('Logs error:', err);
        res.status(500).json({ logs: localCache.logs, totalHits: localCache.totalHits, cached: true });
    }
});

// API: Clear logs
app.delete('/api/logs', async (req, res) => {
    try {
        await Promise.all([
            kv.set(LOGS_KEY, []),
            kv.set(HITS_KEY, 0)
        ]);
        
        localCache = { logs: [], totalHits: 0 };
        res.json({ message: 'Logs cleared, boss man', success: true });
    } catch (err) {
        console.error('Clear error:', err);
        res.status(500).json({ error: 'Failed to clear logs' });
    }
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Express error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`Fuck yeah, logger live on port ${PORT}, boss man`);
    console.log(`Connected to Vercel KV`);
});
