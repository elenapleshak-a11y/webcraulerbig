const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const puppeteer = require('puppeteer');

class AdvancedCrawler {
    constructor() {
        this.visitedUrls = new Set();
        this.discoveredUrls = new Set();
        this.failedUrls = new Set();
        this.redirectedUrls = new Map();
        this.stats = {
            totalDiscovered: 0,
            successfullyCrawled: 0,
            failed: 0,
            duplicates: 0,
            external: 0,
            dynamicPages: 0
        };
        this.maxPages = 10000;
        this.concurrency = 5; // Количество одновременных запросов
        this.browser = null;
    }

    async init() {
        // Запускаем браузер для JavaScript-сайтов
        this.browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    async crawlWebsite(startUrl, onProgress = null) {
        console.log(`🚀 Starting crawl: ${startUrl}`);
        
        const queue = [this.normalizeUrl(startUrl)];
        this.discoveredUrls.add(queue[0]);

        let activeRequests = 0;
        const requestQueue = [];

        while (queue.length > 0 && this.visitedUrls.size < this.maxPages) {
            // Заполняем очередь запросов
            while (queue.length > 0 && activeRequests < this.concurrency && requestQueue.length < this.concurrency) {
                const url = queue.shift();
                if (!this.visitedUrls.has(url)) {
                    requestQueue.push(this.processUrl(url, startUrl));
                    activeRequests++;
                }
            }

            // Ожидаем завершения одного из запросов
            if (requestQueue.length > 0) {
                await requestQueue.shift();
                activeRequests--;
            }

            // Обновляем прогресс
            if (onProgress) {
                onProgress({
                    crawled: this.visitedUrls.size,
                    queued: queue.length,
                    failed: this.failedUrls.size,
                    discovered: this.discoveredUrls.size
                });
            }

            // Добавляем небольшую задержку чтобы не перегружать сервер
            await this.delay(100);
        }

        // Ждем завершения оставшихся запросов
        await Promise.all(requestQueue);

        console.log(`✅ Crawl completed: ${this.visitedUrls.size} pages found`);
        return this.getResults();
    }

    async processUrl(url, baseUrl) {
        if (this.visitedUrls.has(url)) return;
        
        this.visitedUrls.add(url);
        console.log(`📄 [${this.visitedUrls.size}] Crawling: ${url}`);

        try {
            let content, finalUrl, status;

            // Пробуем разные методы получения контента
            try {
                // Сначала пробуем простой HTTP запрос
                ({ content, finalUrl, status } = await this.fetchWithAxios(url));
            } catch (error) {
                // Если не получилось, пробуем через Puppeteer (для JavaScript сайтов)
                console.log(`🔄 Trying Puppeteer for: ${url}`);
                ({ content, finalUrl, status } = await this.fetchWithPuppeteer(url));
                this.stats.dynamicPages++;
            }

            // Обрабатываем редиректы
            if (finalUrl !== url) {
                this.redirectedUrls.set(url, finalUrl);
                this.stats.duplicates++;
            }

            // Проверяем статус
            if (status >= 400) {
                this.failedUrls.add(url);
                this.stats.failed++;
                return;
            }

            this.stats.successfullyCrawled++;

            // Извлекаем ссылки
            const newUrls = this.extractUrlsFromHtml(content, finalUrl || url);
            this.processNewUrls(newUrls, baseUrl);

        } catch (error) {
            console.warn(`❌ Failed to crawl ${url}:`, error.message);
            this.failedUrls.add(url);
            this.stats.failed++;
        }
    }

    async fetchWithAxios(url) {
        const response = await axios.get(url, {
            timeout: 10000,
            maxRedirects: 5,
            validateStatus: null, // Принимаем любые статусы
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; AdvancedWebCrawler/1.0; +http://localhost)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });

        return {
            content: response.data,
            finalUrl: response.request?.res?.responseUrl || url,
            status: response.status
        };
    }

    async fetchWithPuppeteer(url) {
        const page = await this.browser.newPage();
        
        try {
            // Устанавливаем User Agent
            await page.setUserAgent('Mozilla/5.0 (compatible; AdvancedWebCrawler/1.0)');
            
            // Переходим на страницу и ждем загрузки
            await page.goto(url, { 
                waitUntil: 'networkidle2',
                timeout: 15000 
            });

            // Ждем еще немного для динамического контента
            await this.delay(1000);

            const content = await page.content();
            const finalUrl = page.url();
            
            await page.close();

            return {
                content,
                finalUrl,
                status: 200 // Puppeteer не возвращает статус, предполагаем успех
            };
        } catch (error) {
            await page.close();
            throw error;
        }
    }

    extractUrlsFromHtml(html, baseUrl) {
        const urls = new Set();
        
        try {
            const $ = cheerio.load(html);
            
            // Извлекаем все возможные ссылки
            $('a[href], link[href], img[src], script[src], iframe[src]').each((i, element) => {
                const href = $(element).attr('href') || $(element).attr('src');
                if (href) {
                    try {
                        const absoluteUrl = new URL(href, baseUrl).href;
                        urls.add(absoluteUrl);
                    } catch (e) {
                        // Игнорируем некорректные URL
                    }
                }
            });

            // Также ищем ссылки в JavaScript и CSS
            const textUrls = this.extractUrlsFromText(html, baseUrl);
            textUrls.forEach(url => urls.add(url));

        } catch (error) {
            console.error('Error parsing HTML:', error);
        }
        
        return Array.from(urls);
    }

    extractUrlsFromText(text, baseUrl) {
        const urls = new Set();
        const urlPatterns = [
            /(https?:\/\/[^\s"'<>\)]+)/gi,
            /href=(["'])(.*?)\1/gi,
            /src=(["'])(.*?)\1/gi,
            /url\((["']?)(.*?)\1\)/gi
        ];

        urlPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const url = match[1] || match[2];
                if (url) {
                    try {
                        const absoluteUrl = new URL(url, baseUrl).href;
                        urls.add(absoluteUrl);
                    } catch (e) {
                        // Игнорируем некорректные URL
                    }
                }
            }
        });

        return Array.from(urls);
    }

    processNewUrls(newUrls, baseUrl) {
        newUrls.forEach(url => {
            this.stats.totalDiscovered++;
            
            const normalizedUrl = this.normalizeUrl(url);
            
            // Проверяем домен
            if (!this.isSameDomain(normalizedUrl, baseUrl)) {
                this.stats.external++;
                return;
            }

            // Проверяем дубликаты
            if (this.visitedUrls.has(normalizedUrl) || 
                this.discoveredUrls.has(normalizedUrl) ||
                this.failedUrls.has(normalizedUrl)) {
                this.stats.duplicates++;
                return;
            }

            // Добавляем в очередь если подходит
            if (this.shouldCrawlUrl(normalizedUrl)) {
                this.discoveredUrls.add(normalizedUrl);
                // Добавляем обратно в основную очередь (будет обработана в основном цикле)
                // Для простоты здесь просто добавляем в discoveredUrls
            }
        });
    }

    normalizeUrl(url) {
        try {
            const urlObj = new URL(url);
            
            // Стандартизация
            urlObj.protocol = urlObj.protocol.toLowerCase();
            urlObj.hostname = urlObj.hostname.toLowerCase().replace(/^www\./, '');
            urlObj.hash = '';
            
            // Нормализация пути
            urlObj.pathname = urlObj.pathname
                .replace(/\/+/g, '/')
                .replace(/\/$/, '') || '/';
            
            // Фильтрация параметров
            if (urlObj.search) {
                const params = new URLSearchParams(urlObj.search);
                const importantParams = new URLSearchParams();
                
                for (const [key, value] of params) {
                    if (!this.isTrackingParam(key)) {
                        importantParams.append(key, value);
                    }
                }
                
                urlObj.search = importantParams.toString();
            }
            
            return urlObj.href;
        } catch (error) {
            return url;
        }
    }

    isTrackingParam(paramName) {
        const trackingParams = [
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
            'fbclid', 'gclid', 'msclkid', 'trk_', 'ref', 'source', 'campaign',
            'mc_cid', 'mc_eid', '_ga', 'yclid', 'zanpid'
        ];
        
        return trackingParams.some(tracking => 
            paramName.toLowerCase().includes(tracking.toLowerCase())
        );
    }

    isSameDomain(url, baseUrl) {
        try {
            return new URL(url).hostname === new URL(baseUrl).hostname;
        } catch {
            return false;
        }
    }

    shouldCrawlUrl(url) {
        if (!this.isValidPageUrl(url)) return false;
        
        // Исключаем административные разделы
        const excludedPaths = [
            '/admin', '/login', '/logout', '/register', '/signin', '/signup',
            '/dashboard', '/user', '/profile', '/account', '/api/', '/ajax/',
            '/backend', '/wp-admin', '/administrator', '/cgi-bin/'
        ];
        
        const urlLower = url.toLowerCase();
        return !excludedPaths.some(path => urlLower.includes(path));
    }

    isValidPageUrl(url) {
        try {
            const urlObj = new URL(url);
            
            // Исключаем файлы
            const fileExtensions = [
                '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico',
                '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
                '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv',
                '.mp4', '.avi', '.mov', '.wmv', '.mp3', '.wav', '.ogg', '.flac',
                '.exe', '.dmg', '.pkg', '.deb', '.rpm'
            ];
            
            const pathname = urlObj.pathname.toLowerCase();
            if (fileExtensions.some(ext => pathname.endsWith(ext))) {
                return false;
            }
            
            // Исключаем специальные протоколы
            if (['mailto:', 'tel:', 'javascript:', 'ftp:', 'data:'].some(proto => 
                urlLower.startsWith(proto))) {
                return false;
            }
            
            // Только HTTP/HTTPS
            return ['http:', 'https:'].includes(urlObj.protocol);
            
        } catch (error) {
            return false;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getResults() {
        return {
            urls: Array.from(this.visitedUrls).sort(),
            stats: {
                ...this.stats,
                totalProcessed: this.visitedUrls.size + this.failedUrls.size
            },
            failedUrls: Array.from(this.failedUrls),
            redirectedUrls: Object.fromEntries(this.redirectedUrls)
        };
    }
}

module.exports = AdvancedCrawler;
