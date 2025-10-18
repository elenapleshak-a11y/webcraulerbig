const express = require('express');
const cors = require('cors');
const path = require('path');
const AdvancedCrawler = require('./crawler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Хранилище активных краулингов
const activeCrawls = new Map();

app.post('/api/crawl', async (req, res) => {
    const { url, maxPages = 1000 } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const crawlId = Date.now().toString();
        const crawler = new AdvancedCrawler();
        
        await crawler.init();
        activeCrawls.set(crawlId, crawler);

        // Запускаем краулинг в фоне
        crawler.crawlWebsite(url, (progress) => {
            // Здесь можно реализовать WebSocket для реального времени
            console.log('Progress:', progress);
        })
        .then(results => {
            activeCrawls.delete(crawlId);
            crawler.close();
            
            console.log(`Crawl ${crawlId} completed:`, results.stats);
        })
        .catch(error => {
            activeCrawls.delete(crawlId);
            crawler.close();
            console.error(`Crawl ${crawlId} failed:`, error);
        });

        res.json({ 
            success: true, 
            crawlId,
            message: 'Crawling started successfully' 
        });

    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to start crawling: ' + error.message 
        });
    }
});

app.get('/api/crawl/:crawlId/status', async (req, res) => {
    const { crawlId } = req.params;
    const crawler = activeCrawls.get(crawlId);
    
    if (!crawler) {
        return res.status(404).json({ error: 'Crawl not found' });
    }

    res.json({
        crawled: crawler.visitedUrls.size,
        discovered: crawler.discoveredUrls.size,
        failed: crawler.failedUrls.size,
        stats: crawler.stats
    });
});

app.get('/api/crawl/:crawlId/results', async (req, res) => {
    const { crawlId } = req.params;
    const crawler = activeCrawls.get(crawlId);
    
    if (!crawler) {
        return res.status(404).json({ error: 'Crawl not found or completed' });
    }

    const results = crawler.getResults();
    
    // Форматируем для CSV
    if (req.query.format === 'csv') {
        const csvContent = ['URL', ...results.urls].join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="crawled_pages_${crawlId}.csv"`);
        return res.send(csvContent);
    }

    res.json(results);
});

app.delete('/api/crawl/:crawlId', async (req, res) => {
    const { crawlId } = req.params;
    const crawler = activeCrawls.get(crawlId);
    
    if (crawler) {
        await crawler.close();
        activeCrawls.delete(crawlId);
    }
    
    res.json({ success: true, message: 'Crawl stopped' });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Web Crawler Server running on http://localhost:${PORT}`);
    console.log(`📊 API endpoints:`);
    console.log(`   POST /api/crawl - Start new crawl`);
    console.log(`   GET /api/crawl/:id/status - Get crawl status`);
    console.log(`   GET /api/crawl/:id/results - Get crawl results`);
    console.log(`   DELETE /api/crawl/:id - Stop crawl`);
});
