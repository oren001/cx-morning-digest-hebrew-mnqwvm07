```javascript
export class Storage {
  constructor(env) {
    this.ARTICLES = env.ARTICLES;
    this.USERS = env.USERS;
    this.READING_HISTORY = env.READING_HISTORY;
  }

  async getArticles(date) {
    const key = `articles:${date}`;
    const data = await this.ARTICLES.get(key, { type: 'json' });
    return data || [];
  }

  async saveArticles(date, articles) {
    const key = `articles:${date}`;
    await this.ARTICLES.put(key, JSON.stringify(articles), {
      expirationTtl: 60 * 60 * 24 * 30
    });
  }

  async getLatestArticles() {
    const today = new Date().toISOString().split('T')[0];
    let articles = await this.getArticles(today);
    
    if (!articles || articles.length === 0) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      articles = await this.getArticles(yesterday);
    }
    
    return articles || [];
  }

  async getUser(userId) {
    const key = `user:${userId}`;
    const data = await this.USERS.get(key, { type: 'json' });
    
    if (!data) {
      return {
        userId,
        email: null,
        createdAt: new Date().toISOString(),
        preferences: {
          categories: {},
          keywords: {},
          sources: {},
          timeOfDay: []
        }
      };
    }
    
    return data;
  }

  async saveUser(userId, userData) {
    const key = `user:${userId}`;
    const existing = await this.getUser(userId);
    
    const merged = {
      ...existing,
      ...userData,
      userId,
      updatedAt: new Date().toISOString()
    };
    
    await this.USERS.put(key, JSON.stringify(merged));
    return merged;
  }

  async getUserByEmail(email) {
    const normalizedEmail = email.toLowerCase().trim();
    const key = `email:${normalizedEmail}`;
    const userId = await this.USERS.get(key);
    
    if (!userId) {
      return null;
    }
    
    return await this.getUser(userId);
  }

  async linkEmailToUser(email, userId) {
    const normalizedEmail = email.toLowerCase().trim();
    const key = `email:${normalizedEmail}`;
    await this.USERS.put(key, userId);
  }

  async getReadingHistory(userId, limit = 100) {
    const key = `history:${userId}`;
    const data = await this.READING_HISTORY.get(key, { type: 'json' });
    
    if (!data) {
      return [];
    }
    
    return data.slice(0, limit);
  }

  async addReadingEvent(userId, articleId, event) {
    const key = `history:${userId}`;
    const history = await this.getReadingHistory(userId, 500);
    
    const readingEvent = {
      articleId,
      timestamp: new Date().toISOString(),
      event,
      date: new Date().toISOString().split('T')[0]
    };
    
    history.unshift(readingEvent);
    
    const trimmed = history.slice(0, 500);
    
    await this.READING_HISTORY.put(key, JSON.stringify(trimmed), {
      expirationTtl: 60 * 60 * 24 * 90
    });
    
    return readingEvent;
  }

  async getArticleById(articleId) {
    const key = `article:${articleId}`;
    const data = await this.ARTICLES.get(key, { type: 'json' });
    
    if (data) {
      return data;
    }
    
    const articles = await this.getLatestArticles();
    const article = articles.find(a => a.id === articleId);
    
    if (article) {
      await this.ARTICLES.put(key, JSON.stringify(article), {
        expirationTtl: 60 * 60 * 24 * 30
      });
      return article;
    }
    
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const yesterdayArticles = await this.getArticles(yesterday);
    const oldArticle = yesterdayArticles.find(a => a.id === articleId);
    
    if (oldArticle) {
      await this.ARTICLES.put(key, JSON.stringify(oldArticle), {
        expirationTtl: 60 * 60 * 24 * 30
      });
      return oldArticle;
    }
    
    return null;
  }

  async getDigest(digestId) {
    const key = `digest:${digestId}`;
    const data = await this.ARTICLES.get(key, { type: 'json' });
    return data || null;
  }

  async saveDigest(digestId, digestData) {
    const key = `digest:${digestId}`;
    await this.ARTICLES.put(key, JSON.stringify(digestData), {
      expirationTtl: 60 * 60 * 24 * 7
    });
  }

  async getUserDigestForDate(userId, date) {
    const key = `userdigest:${userId}:${date}`;
    const digestId = await this.USERS.get(key);
    
    if (!digestId) {
      return null;
    }
    
    return await this.getDigest(digestId);
  }

  async saveUserDigestForDate(userId, date, digestId) {
    const key = `userdigest:${userId}:${date}`;
    await this.USERS.put(key, digestId, {
      expirationTtl: 60 * 60 * 24 * 7
    });
  }

  async getRecentDigests(userId, limit = 7) {
    const digests = [];
    const today = new Date();
    
    for (let i = 0; i < limit; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const digest = await this.getUserDigestForDate(userId, dateStr);
      if (digest) {
        digests.push({
          date: dateStr,
          digestId: digest.digestId,
          articleCount: digest.articles.length
        });
      }
    }
    
    return digests;
  }

  async updateUserPreferences(userId, preferences) {
    const user = await this.getUser(userId);
    
    user.preferences = {
      ...user.preferences,
      ...preferences
    };
    
    await this.saveUser(userId, user);
    return user;
  }

  async incrementCategoryPreference(userId, category, weight = 1) {
    const user = await this.getUser(userId);
    
    if (!user.preferences.categories) {
      user.preferences.categories = {};
    }
    
    user.preferences.categories[category] = 
      (user.preferences.categories[category] || 0) + weight;
    
    await this.saveUser(userId, user);
  }

  async incrementKeywordPreference(userId, keyword, weight = 1) {
    const user = await this.getUser(userId);
    
    if (!user.preferences.keywords) {
      user.preferences.keywords = {};
    }
    
    const normalizedKeyword = keyword.toLowerCase().trim();
    user.preferences.keywords[normalizedKeyword] = 
      (user.preferences.keywords[normalizedKeyword] || 0) + weight;
    
    await this.saveUser(userId, user);
  }

  async cleanupOldData() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];
    
    return {
      message: 'KV automatically expires old data based on TTL',
      cutoffDate: cutoffStr
    };
  }

  async getUserStats(userId) {
    const history = await this.getReadingHistory(userId, 1000);
    const user = await this.getUser(userId);
    
    const clicks = history.filter(e => e.event === 'click').length;
    const opens = history.filter(e => e.event === 'open').length;
    const reads = history.filter(e => e.event === 'read').length;
    
    const categoryStats = {};
    const last30Days = new Date(Date.now() - 30 * 86400000).toISOString();
    const recentHistory = history.filter(e => e.timestamp > last30Days);
    
    for (const event of recentHistory) {
      const article = await this.getArticleById(event.articleId);
      if (article && article.category) {
        categoryStats[article.category] = (categoryStats[article.category] || 0) + 1;
      }
    }
    
    return {
      userId,
      totalEvents: history.length,
      clicks,
      opens,
      reads,
      last30DaysEvents: recentHistory.length,
      topCategories: Object.entries(categoryStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([category, count]) => ({ category, count })),
      preferences: user.preferences,
      memberSince: user.createdAt
    };
  }
}
```