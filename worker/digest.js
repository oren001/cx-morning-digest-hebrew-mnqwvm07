```javascript
import { scoreArticle } from './learning.js';
import { getUserPreferences, saveDigest, getArticles } from './storage.js';

export async function generateDigest(userId, env) {
  const preferences = await getUserPreferences(userId, env);
  const articles = await getArticles(env);
  
  if (!articles || articles.length === 0) {
    return null;
  }

  const scoredArticles = articles.map(article => {
    const score = scoreArticle(article, preferences);
    return { ...article, score };
  });

  scoredArticles.sort((a, b) => b.score - a.score);

  const topArticles = scoredArticles.slice(0, 15);

  const digestId = await createDigestId(userId, env);
  const digest = {
    id: digestId,
    userId,
    articles: topArticles,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };

  await saveDigest(digest, env);

  return digest;
}

async function createDigestId(userId, env) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const secret = env.DIGEST_SECRET || 'default-secret-change-me';
  
  const data = `${userId}-${timestamp}-${random}-${secret}`;
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex.substring(0, 16);
}

export function formatDigestForDisplay(digest) {
  const now = new Date();
  const created = new Date(digest.createdAt);
  
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jerusalem'
  };
  
  const hebrewDate = created.toLocaleDateString('he-IL', options);

  return {
    id: digest.id,
    title: `סיכום הבוקר - ${hebrewDate}`,
    date: hebrewDate,
    articles: digest.articles.map(article => ({
      id: article.id,
      title: article.title,
      description: article.description,
      url: article.url,
      category: article.category,
      pubDate: article.pubDate,
      imageUrl: article.imageUrl,
      score: Math.round(article.score * 100) / 100
    })),
    createdAt: digest.createdAt,
    expiresAt: digest.expiresAt
  };
}

export function generateDigestLink(digestId, env) {
  const baseUrl = env.PUBLIC_URL || 'https://morning-digest.pages.dev';
  return `${baseUrl}/digest.html?id=${digestId}`;
}

export function categorizeArticles(articles) {
  const categories = {
    'חדשות': [],
    'כלכלה': [],
    'ספורט': [],
    'תרבות': [],
    'טכנולוגיה': [],
    'בריאות': [],
    'אחר': []
  };

  articles.forEach(article => {
    const category = article.category || 'אחר';
    if (categories[category]) {
      categories[category].push(article);
    } else {
      categories['אחר'].push(article);
    }
  });

  return Object.entries(categories)
    .filter(([_, arts]) => arts.length > 0)
    .map(([name, arts]) => ({ name, articles: arts }));
}

export function generateDigestSummary(digest) {
  const categories = categorizeArticles(digest.articles);
  const totalArticles = digest.articles.length;
  
  const categoryCounts = categories.map(cat => 
    `${cat.name}: ${cat.articles.length}`
  ).join(', ');

  return {
    totalArticles,
    categories: categories.map(c => c.name),
    categoryCounts,
    topScore: digest.articles[0]?.score || 0,
    avgScore: digest.articles.reduce((sum, a) => sum + a.score, 0) / totalArticles
  };
}

export async function getDigestById(digestId, env) {
  return await env.DIGEST_KV.get(`digest:${digestId}`, { type: 'json' });
}

export async function scheduleDigestGeneration(userId, scheduleTime, env) {
  const schedule = {
    userId,
    scheduleTime,
    timezone: 'Asia/Jerusalem',
    enabled: true,
    createdAt: new Date().toISOString()
  };

  await env.DIGEST_KV.put(
    `schedule:${userId}`,
    JSON.stringify(schedule),
    { expirationTtl: 365 * 24 * 60 * 60 }
  );

  return schedule;
}

export async function getUserSchedule(userId, env) {
  const schedule = await env.DIGEST_KV.get(`schedule:${userId}`, { type: 'json' });
  return schedule || { enabled: false, scheduleTime: '06:00' };
}

export function shouldGenerateDigest(schedule) {
  if (!schedule || !schedule.enabled) {
    return false;
  }

  const now = new Date();
  const nowUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
  
  const [hours, minutes] = schedule.scheduleTime.split(':').map(Number);
  const israelOffset = 2;
  const utcHours = (hours - israelOffset + 24) % 24;
  const scheduledUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), utcHours, minutes);

  const diffMinutes = Math.abs((nowUTC - scheduledUTC) / (1000 * 60));
  
  return diffMinutes < 5;
}

export async function getOrGenerateDigest(userId, env, forceNew = false) {
  if (!forceNew) {
    const todayKey = new Date().toISOString().split('T')[0];
    const existingDigest = await env.DIGEST_KV.get(`daily:${userId}:${todayKey}`, { type: 'json' });
    
    if (existingDigest) {
      return existingDigest;
    }
  }

  const digest = await generateDigest(userId, env);
  
  if (digest) {
    const todayKey = new Date().toISOString().split('T')[0];
    await env.DIGEST_KV.put(
      `daily:${userId}:${todayKey}`,
      JSON.stringify(digest),
      { expirationTtl: 24 * 60 * 60 }
    );
  }

  return digest;
}
```