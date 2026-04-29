const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

// ============================================
// CONFIGURATION
// ============================================
const HARDCODED_APP_ID = '27WE8LXU98';

let configAppId = null;
try {
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    configAppId = config.wolframAppId;
  }
} catch (e) {}

const envAppId = process.env.WOLFRAM_APP_ID;
const WOLFRAM_APP_ID = envAppId || configAppId || HARDCODED_APP_ID;
const PORT = process.env.PORT || 3000;

// ============================================
// LOCAL MATH SOLVER (Fast fallback)
// ============================================
function solveLocally(query) {
  const q = query.toLowerCase().trim();

  // Simple arithmetic: 2+2, 5*3, etc.
  const arithmeticMatch = q.match(/^([\d\.\s\+\-\*\/\^\(\)]+)$/);
  if (arithmeticMatch) {
    try {
      let expr = arithmeticMatch[1].replace(/\^/g, '**');
      // eslint-disable-next-line no-new-func
      const result = new Function('return ' + expr)();
      if (isFinite(result)) {
        return {
          result: String(result),
          source: 'local',
          query: query,
          success: true
        };
      }
    } catch (e) {}
  }

  // Solve linear equations: "2x + 4 = 9" or "solve 2x+4=9"
  const linearMatch = q.match(/(?:solve\s+)?([\d\.]*)(x)\s*([\+\-])\s*([\d\.]+)\s*=\s*([\d\.]+)/);
  if (linearMatch) {
    const coeff = linearMatch[1] === '' ? 1 : parseFloat(linearMatch[1]);
    const sign = linearMatch[3] === '+' ? 1 : -1;
    const constant = parseFloat(linearMatch[4]) * sign;
    const rhs = parseFloat(linearMatch[5]);
    const solution = (rhs - constant) / coeff;
    return {
      result: `x = ${solution}`,
      source: 'local',
      query: query,
      success: true
    };
  }

  // Quadratic equations: "x^2 - 4 = 0" or "solve x^2-4=0"
  const quadMatch = q.match(/(?:solve\s+)?x\^2\s*([\+\-])\s*([\d\.]+)\s*=\s*0/);
  if (quadMatch) {
    const val = parseFloat(quadMatch[2]);
    const solutions = quadMatch[1] === '-' 
      ? [`x = ${Math.sqrt(val)}`, `x = -${Math.sqrt(val)}`]
      : ['No real solutions'];
    return {
      result: solutions.join(', '),
      source: 'local',
      query: query,
      success: true
    };
  }

  // Derivative of x^n
  const derivMatch = q.match(/(?:derivative|deriv|diff)\s+of\s+x\^([\d\.]+)/);
  if (derivMatch) {
    const n = parseFloat(derivMatch[1]);
    return {
      result: `${n}x^${n-1}`,
      source: 'local',
      query: query,
      success: true
    };
  }

  // Derivative of x^2
  if (q.includes('derivative') && q.includes('x^2')) {
    return { result: '2x', source: 'local', query: query, success: true };
  }
  if (q.includes('derivative') && q.includes('x^3')) {
    return { result: '3x^2', source: 'local', query: query, success: true };
  }

  // Integral of basic functions
  if (q.includes('integral') && q.includes('sin(x)')) {
    return { result: '-cos(x) + C', source: 'local', query: query, success: true };
  }
  if (q.includes('integral') && q.includes('cos(x)')) {
    return { result: 'sin(x) + C', source: 'local', query: query, success: true };
  }
  if (q.includes('integral') && q.includes('x^2')) {
    return { result: 'x^3/3 + C', source: 'local', query: query, success: true };
  }

  // Factor simple expressions
  if (q.includes('factor') && q.includes('x^2 - 9')) {
    return { result: '(x - 3)(x + 3)', source: 'local', query: query, success: true };
  }
  if (q.includes('factor') && q.includes('x^2 - 4')) {
    return { result: '(x - 2)(x + 2)', source: 'local', query: query, success: true };
  }

  // Limits
  if (q.includes('limit') && q.includes('sin(x)/x') && q.includes('0')) {
    return { result: '1', source: 'local', query: query, success: true };
  }

  return null;
}

// ============================================
// SERVER SETUP
// ============================================
const cache = new Map();
const CACHE_DURATION = 1000 * 60 * 60;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString()} - ${req.method} ${req.path}`);
  next();
});

app.use(express.static(path.join(__dirname, 'dist')));

const getCacheKey = (query) => query.toLowerCase().trim();

const getCached = (key) => {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > CACHE_DURATION) {
    cache.delete(key);
    return null;
  }
  return item.data;
};

const setCached = (key, data) => {
  cache.set(key, { data, timestamp: Date.now() });
  if (cache.size > 100) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
};

// ============================================
// API ENDPOINTS
// ============================================

app.post('/api/solve', async (req, res) => {
  const startTime = Date.now();

  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ 
        error: 'Query is required',
        example: 'Try: 2+2, derivative of x^2, solve x+5=10'
      });
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      return res.status(400).json({ error: 'Query cannot be empty' });
    }

    // Check cache first
    const cacheKey = getCacheKey(trimmedQuery);
    const cached = getCached(cacheKey);
    if (cached) {
      console.log(`⚡ Cache hit (${Date.now() - startTime}ms)`);
      return res.json({ ...cached, cached: true, responseTime: Date.now() - startTime });
    }

    // Try local solver FIRST (instant response)
    const localResult = solveLocally(trimmedQuery);
    if (localResult) {
      console.log(`⚡ Local solve (${Date.now() - startTime}ms):`, trimmedQuery);
      setCached(cacheKey, localResult);
      return res.json({ ...localResult, responseTime: Date.now() - startTime });
    }

    // Validate API key
    if (!WOLFRAM_APP_ID || WOLFRAM_APP_ID === 'your_app_id_here' || WOLFRAM_APP_ID === '27WE8LXU98' && WOLFRAM_APP_ID.length < 10) {
      return res.status(500).json({ 
        error: 'Wolfram Alpha API key not properly configured',
        fix: 'Check that your AppID is correct in server.js or config.json'
      });
    }

    // Call Wolfram Alpha with SHORT timeout
    const params = new URLSearchParams({
      appid: WOLFRAM_APP_ID,
      input: trimmedQuery,
      format: 'plaintext',
      output: 'json',
      reinterpret: 'true'
    });

    const waUrl = `https://api.wolframalpha.com/v2/query?${params.toString()}`;

    console.log(`🔍 Wolfram query (${Date.now() - startTime}ms):`, trimmedQuery);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    const response = await fetch(waUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      if (response.status === 403) {
        return res.status(403).json({ 
          error: 'Invalid Wolfram Alpha AppID. Please verify your API key at developer.wolframalpha.com'
        });
      }
      throw new Error(`Wolfram API ${response.status}`);
    }

    const data = await response.json();

    if (!data.queryresult || data.queryresult.error || data.queryresult.numpods === 0) {
      return res.json({ 
        error: 'Wolfram Alpha could not solve this. Try a simpler query.',
        tip: 'Examples: "2+2", "derivative of x^2", "solve x=5"'
      });
    }

    const pods = data.queryresult.pods || [];
    let resultText = '';

    const resultPod = pods.find(p => p.primary) || pods[0];
    if (resultPod?.subpods?.[0]?.plaintext) {
      resultText = resultPod.subpods[0].plaintext;
    }

    if (!resultText) {
      return res.json({ error: 'Could not extract result from Wolfram Alpha' });
    }

    const responseData = {
      result: resultText,
      query: trimmedQuery,
      source: 'wolfram',
      success: true
    };

    setCached(cacheKey, responseData);
    console.log(`✅ Wolfram result (${Date.now() - startTime}ms)`);

    res.json({ ...responseData, responseTime: Date.now() - startTime });

  } catch (error) {
    console.error(`❌ Error after ${Date.now() - startTime}ms:`, error.message);

    if (error.name === 'AbortError') {
      return res.status(504).json({ 
        error: 'Wolfram Alpha timed out (8s). The query may be too complex.',
        tip: 'Try simpler queries like "2+2" or "derivative of x^2"'
      });
    }

    res.status(500).json({ 
      error: 'Failed to solve. Please try again.',
      details: error.message
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    cacheSize: cache.size,
    apiConfigured: !!WOLFRAM_APP_ID && WOLFRAM_APP_ID.length > 10,
    appIdPrefix: WOLFRAM_APP_ID ? WOLFRAM_APP_ID.substring(0, 4) + '...' : 'none'
  });
});

app.post('/api/clear-cache', (req, res) => {
  cache.clear();
  res.json({ message: 'Cache cleared' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log('');
  console.log('==========================================');
  console.log('  ✅ Calculator API Server Running');
  console.log('==========================================');
  console.log(`  🌐 URL: http://localhost:${PORT}`);
  console.log(`  📊 Health: http://localhost:${PORT}/api/health`);
  console.log(`  🔑 Wolfram API: ${WOLFRAM_APP_ID && WOLFRAM_APP_ID.length > 10 ? '✅ ' + WOLFRAM_APP_ID.substring(0, 6) + '...' : '❌ NOT SET'}`);
  console.log(`  ⚡ Local solver: Active (instant for simple math)`);
  console.log('');
});