// IP Logger v1 - Replit Server
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

const LOG_FILE = 'ip_logs.json';
const PORT = process.env.PORT || 3000;

// Initialize log file
if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, JSON.stringify({ logs: [], totalHits: 0 }, null, 2));
}

app.use(express.json());
app.use(express.static('public'));

// CORE MIDDLEWARE - CAPTURES REAL IP
app.use((req, res, next) => {
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || 
                     req.headers['cf-connecting-ip'] ||
                     req.headers['x-real-ip'] || 
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
    
    const logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    logs.logs.push(logEntry);
    logs.totalHits++;
    
    // Keep last 500 entries
    if (logs.logs.length > 500) {
        logs.logs = logs.logs.slice(-500);
    }
    
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
    
    console.log(`[${timestamp}] ${clientIP} | ${method} ${url}`);
    next();
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Get stats
app.get('/api/stats', (req, res) => {
    const logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    const uniqueIPs = new Set(logs.logs.map(l => l.ip));
    
    res.json({
        totalRequests: logs.totalHits,
        uniqueIPs: uniqueIPs.size,
        recentIPs: logs.logs.slice(-20).reverse()
    });
});

// API: Get all logs
app.get('/api/logs', (req, res) => {
    const logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    res.json(logs);
});

// API: Clear logs
app.delete('/api/logs', (req, res) => {
    fs.writeFileSync(LOG_FILE, JSON.stringify({ logs: [], totalHits: 0 }, null, 2));
    res.json({ message: 'Logs cleared, boss man' });
});

app.listen(PORT, () => {
    console.log(`Fuck yeah, logger live on port ${PORT}, boss man`);
    console.log(`Access your Replit URL from your iPhone`);
});
