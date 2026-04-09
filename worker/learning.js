```javascript
export class PreferenceLearner {
  constructor(storage) {
    this.storage = storage;
  }

  async scoreArticles(userId, articles) {
    const history = await this.storage.getReadingHistory(userId);
    const preferences = await this.storage.getUserPreferences(userId);

    if (!history || history.length === 0) {
      return this.scoreNewUser(articles);
    }

    const scoredArticles = articles.map(article => ({
      ...article,
      score: this.calculateScore(article, history, preferences)
    }));

    scoredArticles.sort((a, b) => b.score - a.score);

    return scoredArticles;
  }

  calculateScore(article, history, preferences) {
    let score = 0;

    score += this.categoryScore(article, history) * 0.35;
    score += this.keywordScore(article, history) * 0.30;
    score += this.recencyBoost(article) * 0.15;
    score += this.diversityPenalty(article, history) * 0.10;
    score += this.engagementScore(article, history) * 0.10;

    if (preferences && preferences.blockedCategories) {
      if (preferences.blockedCategories.includes(article.category)) {
        score *= 0.1;
      }
    }

    if (preferences && preferences.favoriteCategories) {
      if (preferences.favoriteCategories.includes(article.category)) {
        score *= 1.5;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  categoryScore(article, history) {
    const categoryReads = {};
    let totalReads = 0;

    history.forEach(item => {
      if (item.category) {
        categoryReads[item.category] = (categoryReads[item.category] || 0) + 1;
        totalReads++;
      }
    });

    if (totalReads === 0) return 50;

    const categoryFrequency = categoryReads[article.category] || 0;
    return (categoryFrequency / totalReads) * 100;
  }

  keywordScore(article, history) {
    const keywords = this.extractKeywords(article.title + ' ' + (article.summary || ''));
    const historicalKeywords = this.buildKeywordMap(history);

    if (Object.keys(historicalKeywords).length === 0) return 50;

    let matchScore = 0;
    let totalWeight = 0;

    keywords.forEach(keyword => {
      const weight = historicalKeywords[keyword] || 0;
      matchScore += weight;
      totalWeight += 1;
    });

    if (totalWeight === 0) return 30;

    const avgScore = (matchScore / totalWeight) * 10;
    return Math.min(100, avgScore);
  }

  recencyBoost(article) {
    if (!article.publishedAt) return 50;

    const now = Date.now();
    const articleTime = new Date(article.publishedAt).getTime();
    const hoursSincePublished = (now - articleTime) / (1000 * 60 * 60);

    if (hoursSincePublished < 2) return 100;
    if (hoursSincePublished < 6) return 80;
    if (hoursSincePublished < 12) return 60;
    if (hoursSincePublished < 24) return 40;
    return 20;
  }

  diversityPenalty(article, history) {
    const recentArticles = history.slice(-20);
    
    const sameCategory = recentArticles.filter(h => h.category === article.category).length;
    const sameCategoryRatio = sameCategory / Math.max(recentArticles.length, 1);

    if (sameCategoryRatio > 0.6) return 30;
    if (sameCategoryRatio > 0.4) return 60;
    return 100;
  }

  engagementScore(article, history) {
    const recentEngagements = history.slice(-50);

    let totalTimeSpent = 0;
    let engagedArticles = 0;

    recentEngagements.forEach(item => {
      if (item.timeSpent && item.timeSpent > 30) {
        totalTimeSpent += item.timeSpent;
        engagedArticles++;
      }
    });

    if (engagedArticles === 0) return 50;

    const avgTimeSpent = totalTimeSpent / engagedArticles;

    if (avgTimeSpent > 120) return 100;
    if (avgTimeSpent > 60) return 80;
    if (avgTimeSpent > 30) return 60;
    return 40;
  }

  scoreNewUser(articles) {
    return articles.map(article => ({
      ...article,
      score: this.newUserScore(article)
    })).sort((a, b) => b.score - a.score);
  }

  newUserScore(article) {
    let score = 50;

    score += this.recencyBoost(article) * 0.4;

    const popularCategories = ['חדשות', 'כלכלה', 'ספורט', 'טכנולוגיה'];
    if (popularCategories.includes(article.category)) {
      score += 20;
    }

    const titleLength = (article.title || '').length;
    if (titleLength > 20 && titleLength < 100) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  extractKeywords(text) {
    if (!text) return [];

    const stopwords = [
      'של', 'על', 'את', 'עם', 'אל', 'כי', 'זה', 'היה', 'הוא', 'היא', 'אני',
      'אתה', 'הם', 'אנחנו', 'או', 'גם', 'רק', 'כל', 'עוד', 'אין', 'לא', 'מה',
      'למה', 'איך', 'כמה', 'מי', 'פה', 'שם', 'הזה', 'הזאת', 'אחד', 'אחת', 'שני',
      'ב', 'ל', 'מ', 'ה', 'ו', 'כ', 'ש'
    ];

    const words = text
      .replace(/[^\u0590-\u05FFa-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length > 2)
      .filter(w => !stopwords.includes(w));

    const wordFreq = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word]) => word);
  }

  buildKeywordMap(history) {
    const keywordWeights = {};

    history.forEach((item, index) => {
      const recencyWeight = Math.exp(-index / 20);
      const engagementWeight = item.timeSpent ? Math.min(item.timeSpent / 60, 3) : 1;
      
      const text = (item.title || '') + ' ' + (item.summary || '');
      const keywords = this.extractKeywords(text);

      keywords.forEach(keyword => {
        const weight = recencyWeight * engagementWeight;
        keywordWeights[keyword] = (keywordWeights[keyword] || 0) + weight;
      });
    });

    return keywordWeights;
  }

  async updatePreferencesFromClick(userId, article, timeSpent) {
    const history = await this.storage.getReadingHistory(userId);
    
    const newEntry = {
      articleId: article.id,
      title: article.title,
      category: article.category,
      summary: article.summary,
      timestamp: Date.now(),
      timeSpent: timeSpent || 0
    };

    const updatedHistory = [newEntry, ...(history || [])].slice(0, 200);

    await this.storage.saveReadingHistory(userId, updatedHistory);

    const preferences = await this.storage.getUserPreferences(userId) || {};
    
    if (!preferences.categoryStats) {
      preferences.categoryStats = {};
    }
    
    preferences.categoryStats[article.category] = 
      (preferences.categoryStats[article.category] || 0) + 1;

    preferences.lastUpdated = Date.now();
    preferences.totalReads = (preferences.totalReads || 0) + 1;

    await this.storage.saveUserPreferences(userId, preferences);

    return updatedHistory;
  }

  async getUserInsights(userId) {
    const history = await this.storage.getReadingHistory(userId);
    const preferences = await this.storage.getUserPreferences(userId);

    if (!history || history.length === 0) {
      return {
        topCategories: [],
        topKeywords: [],
        readingPatterns: {},
        totalReads: 0
      };
    }

    const categoryStats = {};
    let totalTimeSpent = 0;

    history.forEach(item => {
      if (item.category) {
        categoryStats[item.category] = (categoryStats[item.category] || 0) + 1;
      }
      if (item.timeSpent) {
        totalTimeSpent += item.timeSpent;
      }
    });

    const topCategories = Object.entries(categoryStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }));

    const keywordMap = this.buildKeywordMap(history);
    const topKeywords = Object.entries(keywordMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword, weight]) => ({ keyword, weight: Math.round(weight * 100) / 100 }));

    return {
      topCategories,
      topKeywords,
      readingPatterns: {
        avgTimePerArticle: Math.round(totalTimeSpent / history.length),
        totalArticlesRead: history.length,
        totalTimeSpent: Math.round(totalTimeSpent)
      },
      totalReads: preferences?.totalReads || history.length
    };
  }
}
```