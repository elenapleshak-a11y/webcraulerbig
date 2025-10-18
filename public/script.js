class CrawlerClient {
    constructor() {
        this.apiBase = '/api/crawl';
        this.currentCrawlId = null;
        this.statusInterval = null;
    }

    async startCrawling(url, maxPages = 1000) {
        try {
            this.log('🚀 Запуск краулинга...');
            
            const response = await fetch(this.apiBase, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, maxPages })
            });

            const data = await response.json();
            
            if (data.success) {
                this.currentCrawlId = data.crawlId;
                this.startStatusUpdates();
                return true;
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            this.showError('Ошибка запуска: ' + error.message);
            return false;
        }
    }

    async stopCrawling() {
        if (!this.currentCrawlId) return;
        
        try {
            await fetch(`${this.apiBase}/${this.currentCrawlId}`, {
                method: 'DELETE'
            });
            
            this.stopStatusUpdates();
            this.log('⏹️ Краулинг остановлен');
        } catch (error) {
            console.error('Error stopping crawl:', error);
        }
    }

    startStatusUpdates() {
        this.statusInterval = setInterval(async () => {
            if (!this.currentCrawlId) return;
            
            try {
                const response = await fetch(`${this.apiBase}/${this.currentCrawlId}/status`);
                const status = await response.json();
                
                this.updateProgress(status);
                
                // Если краулинг завершен
                if (status.crawled >= status.discovered && status.discovered > 0) {
                    this.stopStatusUpdates();
                    this.showResults();
                }
            } catch (error) {
                console.error('Error fetching status:', error);
            }
        }, 2000);
    }

    stopStatusUpdates() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
            this.statusInterval = null;
        }
    }

    updateProgress(status) {
        const progressFill = document.getElementById('progressFill');
        const progressInfo = document.getElementById('progressInfo');
        
        const progress = (status.crawled / Math.max(status.discovered, 1)) * 100;
        progressFill.style.width = Math.min(progress, 100) + '%';
        
        progressInfo.innerHTML = `
            Обработано: <strong>${status.crawled}</strong> | 
            Найдено: <strong>${status.discovered}</strong> | 
            Ошибки: <strong>${status.failed}</strong>
        `;
        
        // Обновляем статистику
        this.updateStats(status);
        
        // Логируем прогресс
        this.log(`📊 Прогресс: ${status.crawled}/${status.discovered} страниц`);
    }

    updateStats(status) {
        const statsGrid = document.getElementById('statsGrid');
        statsGrid.style.display = 'grid';
        
        statsGrid.innerHTML = `
            <div class="stat-card success">
                <span class="stat-number">${status.crawled}</span>
                <span class="stat-label">Успешно обработано</span>
            </div>
            <div class="stat-card warning">
                <span class="stat-number">${status.discovered - status.crawled}</span>
                <span class="stat-label">В очереди</span>
            </div>
            <div class="stat-card danger">
                <span class="stat-number">${status.failed}</span>
                <span class="stat-label">Ошибки</span>
            </div>
            <div class="stat-card">
                <span class="stat-number">${status.stats?.duplicates || 0}</span>
                <span class="stat-label">Дубликатов</span>
            </div>
        `;
    }

    async showResults() {
        if (!this.currentCrawlId) return;
        
        try {
            const response = await fetch(`${this.apiBase}/${this.currentCrawlId}/results`);
            const results = await response.json();
            
            document.getElementById('result').style.display = 'block';
            this.log('✅ Краулинг завершен!');
            this.log(`📊 Итоги: ${results.urls.length} страниц собрано`);
            
        } catch (error) {
            this.showError('Ошибка получения результатов: ' + error.message);
        }
    }

    async downloadCSV() {
        if (!this.currentCrawlId) return;
        
        try {
            const response = await fetch(`${this.apiBase}/${this.currentCrawlId}/results?format=csv`);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `crawled_pages_${this.currentCrawlId}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            this.log('📥 CSV файл скачивается...');
        } catch (error) {
            this.showError('Ошибка скачивания: ' + error.message);
        }
    }

    log(message) {
        const logContent = document.getElementById('logContent');
        const timestamp = new Date().toLocaleTimeString();
        logContent.innerHTML += `[${timestamp}] ${message}<br>`;
        logContent.scrollTop = logContent.scrollHeight;
        
        document.getElementById('logContainer').style.display = 'block';
    }

    showError(message) {
        document.getElementById('error').textContent = message;
        this.log(`❌ Ошибка: ${message}`);
    }
}

const crawlerClient = new CrawlerClient();

function startCrawling() {
    const url = document.getElementById('urlInput').value.trim();
    const maxPages = parseInt(document.getElementById('maxPages').value) || 1000;
    
    if (!url) {
        alert('Пожалуйста, введите URL');
        return;
    }

    // Сброс интерфейса
    document.getElementById('progressContainer').style.display = 'block';
    document.getElementById('result').style.display = 'none';
    document.getElementById('error').textContent = '';
    document.getElementById('crawlBtn').disabled = true;
    document.getElementById('stopBtn').style.display = 'inline-block';
    
    // Запуск краулинга
    crawlerClient.startCrawling(url, maxPages);
}

function stopCrawling() {
    crawlerClient.stopCrawling();
    document.getElementById('crawlBtn').disabled = false;
    document.getElementById('stopBtn').style.display = 'none';
}

function downloadCSV() {
    crawlerClient.downloadCSV();
}

function viewResults() {
    crawlerClient.showResults();
}

// Обработчики событий
document.getElementById('urlInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') startCrawling();
});
