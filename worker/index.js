```javascript
import { scrapeYnetNews } from './scraper.js';
import { calculateArticleScores } from './learning.js';
import { generateDigest, createDigestLink } from './digest.js';
import { getUserPreferences, saveUserPreferences, getReadingHistory, addReadingHistory, getCachedArticles, cacheArticles, getUserByDigestToken, saveDigestToken } from './storage.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      if (url.pathname === '/api/register') {
        return await handleRegister(request, env);
      }

      if (url.pathname === '/api/login') {
        return await handleLogin(request, env);
      }

      if (url.pathname === '/api/digest') {
        return await handleGetDigest(request, env);
      }

      if (url.pathname === '/api/track-read') {
        return await handleTrackRead(request, env);
      }

      if (url.pathname === '/api/refresh-digest') {
        return await handleRefreshDigest(request, env);
      }

      if (url.pathname.startsWith('/d/')) {
        return await handleDigestView(url.pathname, env);
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  },

  async scheduled(event, env, ctx) {
    console.log('Cron triggered at:', new Date(event.scheduledTime).toISOString());
    
    try {
      const articles = await scrapeYnetNews(env);
      
      if (!articles || articles.length === 0) {
        console.log('No articles scraped');
        return;
      }

      await cacheArticles(env, articles);
      console.log(`Cached ${articles.length} articles`);

      const userKeys = await env.DIGEST_KV.list({ prefix: 'user:' });
      
      for (const key of userKeys.keys) {
        const userId = key.name.split(':')[1];
        
        try {
          const preferences = await getUserPreferences(env, userId);
          const readingHistory = await getReadingHistory(env, userId);
          
          const scoredArticles = calculateArticleScores(articles, preferences, readingHistory);
          const digest = generateDigest(scoredArticles, preferences);
          
          const digestToken = await createDigestLink(env, userId, digest);
          await saveDigestToken(env, userId, digestToken);
          
          console.log(`Generated digest for user ${userId}: ${digestToken}`);
        } catch (userError) {
          console.error(`Error generating digest for user ${userId}:`, userError);
        }
      }
      
      console.log('Cron job completed successfully');
    } catch (error) {
      console.error('Cron job error:', error);
      throw error;
    }
  },
};

async function handleRegister(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const body = await request.json();
  const { email, name } = body;

  if (!email || !name) {
    return new Response(JSON.stringify({ error: 'Email and name required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const userId = await hashString(email + (env.USER_ID_SALT || 'default-salt'));
  
  const existingUser = await env.DIGEST_KV.get(`user:${userId}`);
  if (existingUser) {
    return new Response(JSON.stringify({ error: 'User already exists' }), {
      status: 409,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const user = {
    userId,
    email,
    name,
    createdAt: Date.now(),
  };

  await env.DIGEST_KV.put(`user:${userId}`, JSON.stringify(user));
  
  const defaultPreferences = {
    categories: {},
    keywords: {},
    lastUpdated: Date.now(),
  };
  await saveUserPreferences(env, userId, defaultPreferences);

  return new Response(JSON.stringify({ userId, message: 'User registered successfully' }), {
    status: 201,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function handleLogin(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const body = await request.json();
  const { email } = body;

  if (!email) {
    return new Response(JSON.stringify({ error: 'Email required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const userId = await hashString(email + (env.USER_ID_SALT || 'default-salt'));
  const userStr = await env.DIGEST_KV.get(`user:${userId}`);

  if (!userStr) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const user = JSON.parse(userStr);

  return new Response(JSON.stringify({ userId, name: user.name }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function handleGetDigest(request, env) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');

  if (!userId) {
    return new Response(JSON.stringify({ error: 'userId required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const digestTokenStr = await env.DIGEST_KV.get(`digest_token:${userId}`);
  
  if (!digestTokenStr) {
    return new Response(JSON.stringify({ error: 'No digest available yet' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const { token, createdAt } = JSON.parse(digestTokenStr);
  const digestUrl = `${url.origin}/d/${token}`;

  return new Response(JSON.stringify({ 
    digestUrl,
    createdAt,
    message: 'Digest link ready'
  }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function handleDigestView(pathname, env) {
  const token = pathname.split('/d/')[1];
  
  if (!token) {
    return new Response('Invalid digest link', { status: 400 });
  }

  const digestStr = await env.DIGEST_KV.get(`digest:${token}`);
  
  if (!digestStr) {
    return new Response('Digest not found or expired', { status: 404 });
  }

  const digestData = JSON.parse(digestStr);

  return new Response(JSON.stringify(digestData), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function handleTrackRead(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const body = await request.json();
  const { userId, articleId, articleUrl, title, category, keywords, readDuration } = body;

  if (!userId || !articleId) {
    return new Response(JSON.stringify({ error: 'userId and articleId required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const readEntry = {
    articleId,
    articleUrl: articleUrl || '',
    title: title || '',
    category: category || 'unknown',
    keywords: keywords || [],
    readDuration: readDuration || 0,
    timestamp: Date.now(),
  };

  await addReadingHistory(env, userId, readEntry);

  const preferences = await getUserPreferences(env, userId);
  
  if (category) {
    preferences.categories[category] = (preferences.categories[category] || 0) + 1;
  }

  if (keywords && Array.isArray(keywords)) {
    keywords.forEach(keyword => {
      preferences.keywords[keyword] = (preferences.keywords[keyword] || 0) + 1;
    });
  }

  preferences.lastUpdated = Date.now();
  await saveUserPreferences(env, userId, preferences);

  return new Response(JSON.stringify({ message: 'Reading tracked successfully' }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function handleRefreshDigest(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const body = await request.json();
  const { userId } = body;

  if (!userId) {
    return new Response(JSON.stringify({ error: 'userId required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const articles = await getCachedArticles(env);
  
  if (!articles || articles.length === 0) {
    return new Response(JSON.stringify({ error: 'No articles available' }), {
      status: 503,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const preferences = await getUserPreferences(env, userId);
  const readingHistory = await getReadingHistory(env, userId);
  
  const scoredArticles = calculateArticleScores(articles, preferences, readingHistory);
  const digest = generateDigest(scoredArticles, preferences);
  
  const digestToken = await createDigestLink(env, userId, digest);
  await saveDigestToken(env, userId, digestToken);

  const url = new URL(request.url);
  const digestUrl = `${url.origin}/d/${digestToken}`;

  return new Response(JSON.stringify({ 
    digestUrl,
    createdAt: Date.now(),
    message: 'Digest refreshed successfully'
  }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```