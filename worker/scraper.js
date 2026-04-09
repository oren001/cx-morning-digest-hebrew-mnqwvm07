```javascript
const YNET_RSS_URL = 'https://www.ynet.co.il/Integration/StoryRss2.xml';
const USER_AGENT = 'Mozilla/5.0 (compatible; PersonalDigestBot/1.0)';
const RATE_LIMIT_MS = 2000;

let lastRequestTime = 0;

async function rateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
}

function parseRSSFeed(xmlText) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemContent = match[1];
    
    const title = extractTag(itemContent, 'title');
    const link = extractTag(itemContent, 'link');
    const description = extractTag(itemContent, 'description');
    const pubDate = extractTag(itemContent, 'pubDate');
    const category = extractTag(itemContent, 'category');
    const guid = extractTag(itemContent, 'guid');
    
    if (title && link) {
      items.push({
        id: guid || generateIdFromUrl(link),
        title: cleanHtmlEntities(title),
        link: link.trim(),
        description: cleanHtmlEntities(stripHtmlTags(description || '')),
        pubDate: pubDate ? new Date(pubDate) : new Date(),
        category: category || 'כללי',
        timestamp: Date.now()
      });
    }
  }
  
  return items;
}

function extractTag(content, tagName) {
  const regex = new RegExp(`<${tagName}(?:[^>]*)><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tagName}>|<${tagName}(?:[^>]*)>([\\s\\S]*?)<\/${tagName}>`, 'i');
  const match = content.match(regex);
  
  if (match) {
    return (match[1] || match[2] || '').trim();
  }
  
  return '';
}

function stripHtmlTags(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanHtmlEntities(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function generateIdFromUrl(url) {
  const match = url.match(/articles?[/\-](\d+)/i);
  if (match) {
    return `ynet-${match[1]}`;
  }
  
  const hash = simpleHash(url);
  return `ynet-${hash}`;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function extractKeywords(text, title) {
  const combined = `${title} ${text}`.toLowerCase();
  
  const commonWords = new Set([
    'של', 'את', 'על', 'אל', 'לא', 'כי', 'זה', 'עם', 'יש', 'כל',
    'אם', 'גם', 'או', 'הוא', 'היא', 'הם', 'אני', 'אנחנו', 'אתה',
    'מה', 'מי', 'איך', 'למה', 'כמה', 'היה', 'להיות', 'יכול',
    'צריך', 'רוצה', 'אחרי', 'לפני', 'בין', 'תחת', 'אצל', 'עד'
  ]);
  
  const words = combined
    .replace(/[^\u0590-\u05FFa-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2)
    .filter(word => !commonWords.has(word));
  
  const wordCounts = {};
  words.forEach(word => {
    wordCounts[word] = (wordCounts[word] || 0) + 1;
  });
  
  const sortedWords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
  
  return sortedWords;
}

function categorizeArticle(article) {
  const title = article.title.toLowerCase();
  const description = article.description.toLowerCase();
  const category = article.category.toLowerCase();
  
  const categories = {
    'פוליטיקה': ['ממשלה', 'כנסת', 'שר', 'ראש', 'מפלגה', 'בחירות', 'נתניהו', 'גנץ', 'לפיד'],
    'ביטחון': ['צהל', 'צבא', 'חמאס', 'חיזבאללה', 'איראן', 'מלחמה', 'טרור', 'שב"כ', 'מוסד', 'פיגוע'],
    'כלכלה': ['כסף', 'שקל', 'דולר', 'בורסה', 'מניות', 'בנק', 'משכורת', 'מס', 'כלכלה', 'עסקים'],
    'טכנולוגיה': ['טכנולוגיה', 'סטארטאפ', 'היי-טק', 'אפליקציה', 'אינטרנט', 'מחשב', 'סייבר', 'ai', 'בינה מלאכותית'],
    'בריאות': ['בריאות', 'רופא', 'בית חולים', 'תרופה', 'מחלה', 'קורונה', 'חולה', 'רפואה'],
    'ספורט': ['ספורט', 'כדורגל', 'כדורסל', 'מכבי', 'הפועל', 'ליגה', 'משחק', 'שחקן'],
    'תרבות': ['קולנוע', 'סרט', 'שיר', 'מוזיקה', 'תיאטרון', 'אמן', 'תערוכה', 'פסטיבל'],
    'מזג אויר': ['מזג אויר', 'טמפרטורה', 'גשם', 'שלג', 'חום', 'קור', 'תחזית']
  };
  
  for (const [cat, keywords] of Object.entries(categories)) {
    for (const keyword of keywords) {
      if (title.includes(keyword) || description.includes(keyword) || category.includes(keyword)) {
        return cat;
      }
    }
  }
  
  if (category && category !== 'כללי') {
    return article.category;
  }
  
  return 'כללי';
}

export async function scrapeYnetNews() {
  try {
    await rateLimit();
    
    const response = await fetch(YNET_RSS_URL, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/xml, text/xml, */*'
      }
    });
    
    if (!response.ok) {
      throw new Error(`RSS fetch failed: ${response.status} ${response.statusText}`);
    }
    
    const xmlText = await response.text();
    const articles = parseRSSFeed(xmlText);
    
    const enrichedArticles = articles.map(article => {
      const inferredCategory = categorizeArticle(article);
      const keywords = extractKeywords(article.description, article.title);
      
      return {
        ...article,
        inferredCategory,
        keywords,
        scrapedAt: new Date().toISOString()
      };
    });
    
    return {
      success: true,
      articles: enrichedArticles,
      count: enrichedArticles.length,
      scrapedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Scraping error:', error);
    
    return {
      success: false,
      articles: [],
      count: 0,
      error: error.message,
      scrapedAt: new Date().toISOString()
    };
  }
}

export async function fetchArticleContent(url) {
  try {
    await rateLimit();
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT
      }
    });
    
    if (!response.ok) {
      return null;
    }
    
    const html = await response.text();
    
    const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const title = titleMatch ? stripHtmlTags(titleMatch[1]) : '';
    
    const bodyMatch = html.match(/<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const body = bodyMatch ? stripHtmlTags(bodyMatch[1]) : '';
    
    return {
      title: cleanHtmlEntities(title),
      body: cleanHtmlEntities(body),
      url
    };
    
  } catch (error) {
    console.error(`Error fetching article content from ${url}:`, error);
    return null;
  }
}

export function validateArticles(articles) {
  if (!Array.isArray(articles)) {
    return [];
  }
  
  return articles.filter(article => {
    return article &&
           typeof article.id === 'string' &&
           typeof article.title === 'string' &&
           typeof article.link === 'string' &&
           article.title.length > 0 &&
           article.link.startsWith('http');
  });
}

export function deduplicateArticles(articles) {
  const seen = new Set();
  const unique = [];
  
  for (const article of articles) {
    if (!seen.has(article.id)) {
      seen.add(article.id);
      unique.push(article);
    }
  }
  
  return unique;
}

export function sortArticlesByDate(articles) {
  return [...articles].sort((a, b) => {
    const dateA = a.pubDate instanceof Date ? a.pubDate : new Date(a.pubDate);
    const dateB = b.pubDate instanceof Date ? b.pubDate : new Date(b.pubDate);
    return dateB.getTime() - dateA.getTime();
  });
}
```