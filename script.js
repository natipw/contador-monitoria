document.addEventListener('DOMContentLoaded', () => {

    // --- ELEMENTOS DA PÁGINA ---
    const reportFileInput = document.getElementById('report-file-input');
    const processReportBtn = document.getElementById('process-report-btn');
    
    // Divs de resultados
    const resultsArea = document.getElementById('results-area');
    const eligibleAnalystsSection = document.getElementById('eligible-analysts-section');
    const distributionSection = document.getElementById('distribution-section');
    const eligibleAnalystsTable = document.getElementById('eligible-analysts-table');
    const summaryTableDiv = document.getElementById('allocation-summary-table');
    const detailTableDiv = document.getElementById('allocation-detail-table');

    // --- CONFIGURAÇÕES GLOBAIS ---
    const TOTAL_MONITORIAS = 800;
    const PRODUCT_ALLOCATION = {
        'Auto': 20,
        'Check': 640,
        'Doc': 20,
        'ID Pay': 50,
        'ID Unico': 20,
        'IDCloud': 20,
        'B2C': 30,
        'Privacidade': 0,
        'Institucional': 0 // Adicionando outros produtos se necessário
    };

    // --- EVENTO PRINCIPAL ---
    processReportBtn.addEventListener('click', () => {
        if (reportFileInput.files.length === 0) {
            alert('Por favor, selecione o relatório mensal em CSV.');
            return;
        }
        
        Papa.parse(reportFileInput.files[0], {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                // A mágica acontece aqui!
                processFullReport(results.data);
            }
        });
    });

    /**
     * Função principal que orquestra todo o processo.
     * @param {Array} reportData - Os dados completos do CSV.
     */
    function processFullReport(reportData) {
        // 1. Encontrar os analistas que trabalharam > 10 dias seguidos.
        const eligibleAnalystsData = findEligibleAnalysts(reportData);

        // 2. Mostrar a tabela de analistas elegíveis.
        displayEligibleAnalysts(eligibleAnalystsData);

        // 3. Pegar apenas os dados únicos dos analistas elegíveis para a distribuição.
        const analystsForDistribution = getUniqueEligibleAnalysts(reportData, eligibleAnalystsData.map(a => a.name));
        
        // 4. Calcular e exibir a distribuição das 800 monitorias.
        if (analystsForDistribution.length > 0) {
            calculateAndDisplayDistribution(analystsForDistribution);
        } else {
            distributionSection.style.display = 'block';
            summaryTableDiv.innerHTML = '<p>Nenhum analista elegível encontrado para distribuir as monitorias.</p>';
            detailTableDiv.innerHTML = '';
        }
    }

    /**
     * Parte 1: Encontra analistas com mais de 10 dias de trabalho consecutivos.
     * @param {Array} data - Todos os registros do relatório.
     * @returns {Array} - Uma lista de objetos { name, streak } para os elegíveis.
     */
    function findEligibleAnalysts(data) {
        const analystsWorkDays = {};
        
        data.forEach(row => {
            const analystName = row.NOME || row.ANALISTA || row.NALISTA;
            const dateValue = row.DATA;
            const scaleStatus = (row.ESCALA || '').toLowerCase();

            if (!analystName || !dateValue || scaleStatus.includes('folga') || scaleStatus.includes('férias') || scaleStatus.includes('ferias')) {
                return;
            }

            if (!analystsWorkDays[analystName]) {
                analystsWorkDays[analystName] = [];
            }
            analystsWorkDays[analystName].push(new Date(dateValue + 'T00:00:00'));
        });

        const longStreakAnalysts = [];
        for (const name in analystsWorkDays) {
            if (analystsWorkDays[name].length <= 10) continue;

            const dates = [...new Set(analystsWorkDays[name])].sort((a, b) => a - b);
            let currentStreak = 1;
            let maxStreak = 1;

            for (let i = 1; i < dates.length; i++) {
                const diffDays = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
                if (diffDays === 1) {
                    currentStreak++;
                } else {
                    maxStreak = Math.max(maxStreak, currentStreak);
                    currentStreak = 1;
                }
            }
            maxStreak = Math.max(maxStreak, currentStreak);

            if (maxStreak > 10) {
                longStreakAnalysts.push({ name, streak: maxStreak });
            }
        }
        return longStreakAnalysts;
    }

    /**
     * Extrai os dados únicos (nome, monitor, produto) apenas dos analistas que foram considerados elegíveis.
     * @param {Array} allData - Todos os registros do relatório.
     * @param {Array} eligibleNames - Array com os nomes dos analistas elegíveis.
     * @returns {Array} - Lista de objetos únicos { name, monitor, product } para distribuição.
     */
    function getUniqueEligibleAnalysts(allData, eligibleNames) {
        const uniqueEligible = {};
        allData.forEach(row => {
            const analystName = row.NOME || row.ANALISTA || row.NALISTA;
            
            // Se o analista da linha atual está na nossa lista de elegíveis...
            if (eligibleNames.includes(analystName)) {
                // ...armazenamos/atualizamos suas informações.
                // Isso garante que pegaremos a última informação de monitor/produto do mês.
                uniqueEligible[analystName] = {
                    name: analystName,
                    monitor: row['SUB OPERACÃO'] || row.SubOperacao, // Flexibilidade nos nomes de coluna
                    product: row.PRODUTO || row.ProdutoPrincipal
                };
            }
        });
        return Object.values(uniqueEligible);
    }

    /**
     * Parte 2: Calcula a distribuição das monitorias e exibe os resultados.
     * @param {Array} analysts - A lista filtrada e única de analistas elegíveis.
     */
    function calculateAndDisplayDistribution(analysts) {
        let finalAllocation = [];
        const monitors = {
            'Bru': { analysts: {}, totalMonitorias: 0 },
            'Nati': { analysts: {}, totalMonitorias: 0 },
            'Will': { analysts: {}, totalMonitorias: 0 }
        };

        // Agrupar os analistas elegíveis por produto
        const analystsByProduct = {};
        analysts.forEach(analyst => {
            if (!analyst.product) return;
            if (!analystsByProduct[analyst.product]) {
                analystsByProduct[analyst.product] = [];
            }
            analystsByProduct[analyst.product].push(analyst);
        });

        // Distribuir as monitorias por produto
        for (const productName in PRODUCT_ALLOCATION) {
            const totalMonitoriasProduto = PRODUCT_ALLOCATION[productName];
            const analystsForProduct = analystsByProduct[productName] || [];

            if (totalMonitoriasProduto === 0 || analystsForProduct.length === 0) continue;

            let baseMonitorias = Math.floor(totalMonitoriasProduto / analystsForProduct.length);
            let remainder = totalMonitoriasProduto % analystsForProduct.length;

            analystsForProduct.forEach((analyst, index) => {
                const allocated = baseMonitorias + (remainder-- > 0 ? 1 : 0);
                finalAllocation.push({ ...analyst, monitorias: allocated });
            });
        }
        displayDistributionResults(finalAllocation);
    }
    
    // --- FUNÇÕES DE EXIBIÇÃO NA TELA ---

    function displayEligibleAnalysts(analysts) {
        eligibleAnalystsSection.style.display = 'block';
        if (analysts.length === 0) {
            eligibleAnalystsTable.innerHTML = '<p>Nenhum analista trabalhou mais de 10 dias consecutivos.</p>';
            return;
        }
        let tableHTML = `
            <table>
                <thead>
                    <tr><th>Analista Elegível</th><th>Dias Consecutivos (Máx)</th></tr>
                </thead>
                <tbody>
        `;
        analysts.forEach(a => {
            tableHTML += `<tr><td>${a.name}</td><td><strong>${a.streak}</strong></td></tr>`;
        });
        tableHTML += '</tbody></table>';
        eligibleAnalystsTable.innerHTML = tableHTML;
    }

    function displayDistributionResults(allocation) {
        distributionSection.style.display = 'block';
        
        // --- Gerar tabela de resumo por monitor ---
        const summary = {};
        let totalGeral = 0;
        allocation.forEach(item => {
            if (!summary[item.monitor]) {
                summary[item.monitor] = { total: 0, products: {} };
            }
            if (!summary[item.monitor].products[item.product]) {
                summary[item.monitor].products[item.product] = 0;
            }
            summary[item.monitor].products[item.product] += item.monitorias;
            summary[item.monitor].total += item.monitorias;
            totalGeral += item.monitorias;
        });

        let summaryHTML = `
            <table><thead><tr><th>Responsável</th><th>Produto</th><th>Qtd. Monitorias</th></tr></thead><tbody>`;
        for (const monitor in summary) {
            let first = true;
            for(const product in summary[monitor].products) {
                 summaryHTML += `<tr>${first ? `<td rowspan="${Object.keys(summary[monitor].products).length}">${monitor}</td>` : ''}<td>${product}</td><td>${summary[monitor].products[product]}</td></tr>`;
                first = false;
            }
             summaryHTML += `<tr style="background-color: #d1e7dd;"><td colspan="2"><strong>Total ${monitor}</strong></td><td><strong>${summary[monitor].total}</strong></td></tr>`;
        }
        summaryHTML += `<tr style="background-color: #343a40; color: white;"><td colspan="2"><strong>TOTAL GERAL DISTRIBUÍDO</strong></td><td><strong>${totalGeral}</strong></td></tr>`;
        summaryHTML += '</tbody></table>';
        summaryTableDiv.innerHTML = summaryHTML;

        // --- Gerar tabela detalhada por analista ---
        let detailHTML = `
            <table><thead><tr><th>Analista</th><th>Monitor</th><th>Produto</th><th>Qtd. Monitorias</th></tr></thead><tbody>`;
        allocation.sort((a, b) => (a.monitor || '').localeCompare(b.monitor || '') || a.name.localeCompare(b.name));
        allocation.forEach(item => {
            detailHTML += `<tr><td>${item.name}</td><td>${item.monitor}</td><td>${item.product}</td><td>${item.monitorias}</td></tr>`;
        });
        detailHTML += '</tbody></table>';
        detailTableDiv.innerHTML = detailHTML;
    }
});
