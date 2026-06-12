// IP Logger v1 - Fixed & Optimized
const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const app = express();

const LOG_FILE = 'ip_logs.json';
const PORT = process.env.PORT || 3000;

// In-memory cache to reduce file I/O
let logCache = { logs: [], totalHits: 0 };
let writePending = false;

// Debounced async write to prevent race conditions
const debouncedWrite = (() => {
    let timeout;
    return () => {
        clearTimeout(timeout);
        timeout = setTimeout(async () => {
            if (writePending) {
                try {
                    await fs.writeFile(LOG_FILE, JSON.stringify(logCache, null, 2), 'utf8');
                    writePending = false;
                } catch (err) {
                    console.error('Write error:', err);
                }
            }
        }, 100);
    };
})();

// Initialize log file
(async () => {
    try {
        if (!fsSync.existsSync(LOG_FILE)) {
            await fs.writeFile(LOG_FILE, JSON.stringify({ logs: [], totalHits: 0 }, null, 2));
        } else {
            const data = await fs.readFile(LOG_FILE, 'utf8');
            logCache = JSON.parse(data);
        }
    } catch (err) {
        console.error('Init error:', err);
        logCache = { logs: [], totalHits: 0 };
    }
})();

app.use(express.json());
app.use(express.static('public'));

// CORE MIDDLEWARE - CAPTURES REAL IP (optimized)
app.use((req, res, next) => {
    // Skip logging for API calls and static assets
    if (req.path.startsWith('/api/')) {
        return next();
    }

    const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || 
                     req.headers['cf-connecting-ip'] ||
                     req.headers['x-real-ip'] || 
                     req.connection.remoteAddress ||
                     req.socket.remoteAddress ||
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
    
    // Update cache
    logCache.logs.push(logEntry);
    logCache.totalHits++;
    
    // Keep last 500 entries
    if (logCache.logs.length > 500) {
        logCache.logs = logCache.logs.slice(-500);
    }
    
    writePending = true;
    debouncedWrite();
    
    console.log(`[${timestamp}] ${clientIP} | ${method} ${url}`);
    next();
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Get stats (from cache, fast as hell)
app.get('/api/stats', (req, res) => {
    try {
        const uniqueIPs = new Set(logCache.logs.map(l => l.ip));
        
        res.json({
            totalRequests: logCache.totalHits,
            uniqueIPs: uniqueIPs.size,
            recentIPs: logCache.logs.slice(-20).reverse()
        });
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ error: 'Failed to fetch stats', message: err.message });
    }
});

// API: Get all logs
app.get('/api/logs', (req, res) => {
    try {
        res.json(logCache);
    } catch (err) {
        console.error('Logs error:', err);
        res.status(500).json({ error: 'Failed to fetch logs', message: err.message });
    }
});

// API: Clear logs
app.delete('/api/logs', (req, res) => {
    try {
        logCache = { logs: [], totalHits: 0 };
        writePending = true;
        debouncedWrite();
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
    console.log(`Access your Replit URL from your iPhone`);
});
