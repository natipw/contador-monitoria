document.addEventListener('DOMContentLoaded', () => {

    // --- ELEMENTOS DA PÁGINA ---
    const reportFileInput = document.getElementById('report-file-input');
    const processReportBtn = document.getElementById('process-report-btn');
    
    // Divs de resultados
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
        'Institucional': 0
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
            transformHeader: header => header.trim(), // Limpa espaços em branco dos cabeçalhos
            complete: (results) => {
                processFullReport(results.data);
            }
        });
    });
    
    /**
     * FUNÇÃO DE AJUDA: Normaliza uma data de DD/MM/AAAA para um objeto Date.
     * @param {string} dateString - A data do CSV.
     * @returns {Date|null} - O objeto Date ou nulo se o formato for inválido.
     */
    function parseDate(dateString) {
        if (!dateString) return null;
        // Tenta formato AAAA-MM-DD ou AAAA/MM/DD
        if (dateString.match(/^\d{4}[-\/]\d{2}[-\/]\d{2}$/)) {
            return new Date(dateString + 'T00:00:00');
        }
        // Tenta formato DD/MM/AAAA ou DD-MM-AAAA
        if (dateString.match(/^\d{2}[-\/]\d{2}[-\/]\d{4}$/)) {
            const parts = dateString.split(/[-\/]/);
            // Formato para o construtor Date: AAAA, MÊS (0-11), DIA
            return new Date(parts[2], parts[1] - 1, parts[0]);
        }
        console.warn('Formato de data não reconhecido:', dateString);
        return null;
    }

    /**
     * FUNÇÃO DE AJUDA: Encontra um valor em um objeto 'row' usando múltiplas chaves possíveis.
     * @param {Object} row - A linha de dados do CSV.
     * @param {Array<string>} keys - Um array de possíveis nomes de coluna.
     * @returns {string|null} - O valor encontrado ou nulo.
     */
    function getValueFromRow(row, keys) {
        for (const key of keys) {
            if (row[key] !== undefined && row[key] !== null) {
                return row[key];
            }
        }
        // Tentativa extra com case-insensitive para robustez máxima
        const rowKeys = Object.keys(row);
        for (const key of keys) {
            const foundKey = rowKeys.find(rk => rk.toLowerCase() === key.toLowerCase());
            if (foundKey) {
                return row[foundKey];
            }
        }
        return null;
    }


    function processFullReport(reportData) {
        // Mapeia os nomes de coluna que vamos procurar
        const columnKeys = {
            name: ['NOME', 'ANALISTA', 'NALISTA'],
            date: ['DATA'],
            scale: ['ESCALA'],
            monitor: ['SUB OPERACÃO', 'SUB OPERAÇÃO', 'SubOperacao'],
            product: ['PRODUTO', 'ProdutoPrincipal']
        };

        const eligibleAnalystsData = findEligibleAnalysts(reportData, columnKeys);
        displayEligibleAnalysts(eligibleAnalystsData);

        if (eligibleAnalystsData.length > 0) {
            const analystsForDistribution = getUniqueEligibleAnalysts(reportData, eligibleAnalystsData.map(a => a.name), columnKeys);
            calculateAndDisplayDistribution(analystsForDistribution);
        } else {
            distributionSection.style.display = 'block';
            summaryTableDiv.innerHTML = '<p>Nenhum analista elegível encontrado para distribuir as monitorias.</p>';
            detailTableDiv.innerHTML = '';
        }
    }

    function findEligibleAnalysts(data, keys) {
        const analystsWorkDays = {};
        
        data.forEach(row => {
            const analystName = getValueFromRow(row, keys.name);
            const dateString = getValueFromRow(row, keys.date);
            const scaleStatus = (getValueFromRow(row, keys.scale) || '').toLowerCase();

            const parsedDate = parseDate(dateString);

            if (!analystName || !parsedDate || scaleStatus.includes('folga') || scaleStatus.includes('férias') || scaleStatus.includes('ferias')) {
                return;
            }

            if (!analystsWorkDays[analystName]) {
                analystsWorkDays[analystName] = new Set();
            }
            // Usar set.add para evitar datas duplicadas no mesmo dia
            analystsWorkDays[analystName].add(parsedDate.getTime());
        });

        const longStreakAnalysts = [];
        for (const name in analystsWorkDays) {
            if (analystsWorkDays[name].size <= 10) continue;

            const dates = Array.from(analystsWorkDays[name]).map(time => new Date(time)).sort((a, b) => a - b);
            
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

    function getUniqueEligibleAnalysts(allData, eligibleNames, keys) {
        const uniqueEligible = {};
        allData.forEach(row => {
            const analystName = getValueFromRow(row, keys.name);
            
            if (eligibleNames.includes(analystName)) {
                uniqueEligible[analystName] = {
                    name: analystName,
                    monitor: getValueFromRow(row, keys.monitor),
                    product: getValueFromRow(row, keys.product)
                };
            }
        });
        return Object.values(uniqueEligible);
    }

    function calculateAndDisplayDistribution(analysts) {
        let finalAllocation = [];

        const analystsByProduct = {};
        analysts.forEach(analyst => {
            if (!analyst.product) return;
            if (!analystsByProduct[analyst.product]) {
                analystsByProduct[analyst.product] = [];
            }
            analystsByProduct[analyst.product].push(analyst);
        });

        for (const productName in PRODUCT_ALLOCATION) {
            const totalMonitoriasProduto = PRODUCT_ALLOCATION[productName];
            const analystsForProduct = analystsByProduct[productName] || [];

            if (totalMonitoriasProduto === 0 || analystsForProduct.length === 0) continue;

            let baseMonitorias = Math.floor(totalMonitoriasProduto / analystsForProduct.length);
            let remainder = totalMonitoriasProduto % analystsForProduct.length;

            analystsForProduct.forEach((analyst) => {
                const allocated = baseMonitorias + (remainder-- > 0 ? 1 : 0);
                finalAllocation.push({ ...analyst, monitorias: allocated });
            });
        }
        displayDistributionResults(finalAllocation);
    }
    
    // --- FUNÇÕES DE EXIBIÇÃO NA TELA (sem alterações) ---

    function displayEligibleAnalysts(analysts) {
        eligibleAnalystsSection.style.display = 'block';
        if (analysts.length === 0) {
            eligibleAnalystsTable.innerHTML = '<p>Nenhum analista trabalhou mais de 10 dias consecutivos.</p>';
            return;
        }
        let tableHTML = `
            <table><thead><tr><th>Analista Elegível</th><th>Dias Consecutivos (Máx)</th></tr></thead><tbody>`;
        analysts.sort((a,b) => a.name.localeCompare(b.name));
        analysts.forEach(a => {
            tableHTML += `<tr><td>${a.name}</td><td><strong>${a.streak}</strong></td></tr>`;
        });
        tableHTML += '</tbody></table>';
        eligibleAnalystsTable.innerHTML = tableHTML;
    }

    function displayDistributionResults(allocation) {
        distributionSection.style.display = 'block';
        
        const summary = {};
        let totalGeral = 0;
        allocation.forEach(item => {
            if (!item.monitor) return; // Ignora se não houver monitor
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

        let detailHTML = `
            <table><thead><tr><th>Analista</th><th>Monitor</th><th>Produto</th><th>Qtd. Monitorias</th></tr></thead><tbody>`;
        allocation.sort((a, b) => (a.monitor || '').localeCompare(b.monitor || '') || a.name.localeCompare(b.name));
        allocation.forEach(item => {
            detailHTML += `<tr><td>${item.name}</td><td>${item.monitor || 'N/A'}</td><td>${item.product || 'N/A'}</td><td>${item.monitorias}</td></tr>`;
        });
        detailHTML += '</tbody></table>';
        detailTableDiv.innerHTML = detailHTML;
    }
});
