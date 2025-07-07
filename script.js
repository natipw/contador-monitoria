document.addEventListener('DOMContentLoaded', () => {

    const reportFileInput = document.getElementById('report-file-input');
    const processReportBtn = document.getElementById('process-report-btn');
    const eligibleAnalystsSection = document.getElementById('eligible-analysts-section');
    const distributionSection = document.getElementById('distribution-section');
    const eligibleAnalystsTable = document.getElementById('eligible-analysts-table');
    const detailTableDiv = document.getElementById('allocation-detail-table');

    const PRODUCT_ALLOCATION = { 'Auto': 20, 'Check': 640, 'Doc': 20, 'ID Pay': 50, 'ID Unico': 20, 'IDCloud': 20, 'B2C': 30, 'Privacidade': 0, 'Institucional': 0 };

    processReportBtn.addEventListener('click', () => {
        if (reportFileInput.files.length === 0) {
            alert('Por favor, selecione o relatório mensal em CSV.');
            return;
        }
        Papa.parse(reportFileInput.files[0], {
            header: true,
            skipEmptyLines: true,
            // *** MUDANÇA CRÍTICA: Limpa os cabeçalhos para evitar erros com acentos ou espaços ***
            transformHeader: header => header.trim().toLowerCase().replace(/[^a-zA-Z0-9]/g, ''),
            complete: (results) => {
                console.log("--- INÍCIO DO DIAGNÓSTICO ---");
                if (results.errors.length > 0) {
                    console.error("Erros de parse:", results.errors);
                }
                console.log("Cabeçalhos transformados:", Object.keys(results.data[0]));
                console.log("Exemplo da primeira linha de dados lida:", results.data[0]);
                processFullReport(results.data);
            }
        });
    });

    function parseDate(dateString) {
        if (!dateString) return null;
        if (dateString.match(/^\d{2}[\/-]\d{2}[\/-]\d{4}$/)) {
            const parts = dateString.split(/[\/-]/);
            return new Date(parts[2], parts[1] - 1, parts[0]);
        }
        if (dateString.match(/^\d{4}[\/-]\d{2}[\/-]\d{2}$/)) {
            return new Date(dateString.replace(/\//g, '-') + 'T00:00:00');
        }
        return null;
    }

    function mapTeamToProduct(teamName) {
        if (!teamName) return null;
        const lowerTeamName = teamName.toLowerCase();
        if (lowerTeamName.includes('auto')) return 'Auto';
        if (lowerTeamName.includes('safedoc')) return 'Doc';
        if (lowerTeamName.includes('id - n1') || lowerTeamName.includes('id - n2')) return 'Check';
        if (lowerTeamName.includes('special channels') || lowerTeamName.includes('institucional')) return 'Institucional';
        if (lowerTeamName.includes('b2c')) return 'B2C';
        return null;
    }

    function findEligibleAnalysts(data) {
        const analystsWorkDays = {};
        data.forEach(row => {
            // Usa os nomes de coluna já limpos e em minúsculo
            const analystName = row.nome || row.analista;
            const dateString = row.data;
            const scaleStatus = (row.escala || '').toLowerCase();
            const parsedDate = parseDate(dateString);

            if (!analystName || !parsedDate) return;
            if (scaleStatus !== 'escalado') return;
            
            if (!analystsWorkDays[analystName]) {
                analystsWorkDays[analystName] = new Set();
            }
            analystsWorkDays[analystName].add(parsedDate.getTime());
        });

        // --- PARTE DO DIAGNÓSTICO ---
        if (Object.keys(analystsWorkDays).length === 0) {
            alert("ERRO DE LEITURA: Nenhum dia de trabalho foi contabilizado. Verifique o Console (F12) para detalhes.");
            console.error("FALHA: O objeto 'analystsWorkDays' está vazio. Isso significa que a condição 'scaleStatus === 'escalado'' nunca foi verdadeira, ou os nomes das colunas 'nome'/'data'/'escala' não foram encontrados. Verifique os cabeçalhos transformados acima.");
        } else {
            console.log("SUCESSO: Dias de trabalho foram contados para", Object.keys(analystsWorkDays).length, "analistas.");
        }
        
        const longStreakAnalysts = [];
        for (const name in analystsWorkDays) {
            if (analystsWorkDays[name].size <= 10) continue;
            const dates = Array.from(analystsWorkDays[name]).map(time => new Date(time)).sort((a, b) => a - b);
            let currentStreak = 1, maxStreak = 1;
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

    function getUniqueEligibleAnalysts(allData, eligibleNames) {
        const uniqueEligible = {};
        allData.forEach(row => {
            const analystName = row.nome || row.analista;
            if (eligibleNames.includes(analystName)) {
                const teamName = row.suboperacao; // Usa o nome de coluna limpo
                uniqueEligible[analystName] = { name: analystName, product: mapTeamToProduct(teamName) };
            }
        });
        return Object.values(uniqueEligible);
    }
    
    // As funções abaixo não precisam de alteração
    function processFullReport(reportData) {
        const eligibleAnalystsData = findEligibleAnalysts(reportData);
        displayEligibleAnalysts(eligibleAnalystsData);
        if (eligibleAnalystsData.length > 0) {
            const analystsForDistribution = getUniqueEligibleAnalysts(reportData, eligibleAnalystsData.map(a => a.name));
            calculateAndDisplayDistribution(analystsForDistribution);
        } else {
            distributionSection.style.display = 'block';
            detailTableDiv.innerHTML = '<p>Nenhum analista elegível encontrado para distribuir as monitorias.</p>';
        }
    }
    function calculateAndDisplayDistribution(analysts) { /* ...código sem alteração... */
        let finalAllocation = [];
        const analystsByProduct = {};
        analysts.forEach(analyst => {
            if (analyst.product) {
                if (!analystsByProduct[analyst.product]) {
                    analystsByProduct[analyst.product] = [];
                }
                analystsByProduct[analyst.product].push(analyst);
            }
        });
        for (const productName in PRODUCT_ALLOCATION) {
            const totalMonitoriasProduto = PRODUCT_ALLOCATION[productName];
            const analystsForProduct = analystsByProduct[productName] || [];
            if (totalMonitoriasProduto === 0 || analystsForProduct.length === 0) continue;
            let baseMonitorias = Math.floor(totalMonitoriasProduto / analystsForProduct.length);
            let remainder = totalMonitoriasProduto % analystsForProduct.length;
            analystsForProduct.forEach((analyst) => {
                const allocated = baseMonitorias + (remainder-- > 0 ? 1 : 0);
                if (allocated > 0) {
                   finalAllocation.push({ ...analyst, monitorias: allocated });
                }
            });
        }
        displayDistributionResults(finalAllocation);
    }
    function displayEligibleAnalysts(analysts) { /* ...código sem alteração... */
        eligibleAnalystsSection.style.display = 'block';
        if (analysts.length === 0) {
            eligibleAnalystsTable.innerHTML = '<p>Nenhum analista trabalhou mais de 10 dias consecutivos.</p>';
            return;
        }
        let tableHTML = `<table><thead><tr><th>Analista Elegível</th><th>Dias Consecutivos (Máx)</th></tr></thead><tbody>`;
        analysts.sort((a,b) => a.name.localeCompare(b.name));
        analysts.forEach(a => {
            tableHTML += `<tr><td>${a.name}</td><td><strong>${a.streak}</strong></td></tr>`;
        });
        tableHTML += '</tbody></table>';
        eligibleAnalystsTable.innerHTML = tableHTML;
    }
    function displayDistributionResults(allocation) { /* ...código sem alteração... */
        distributionSection.style.display = 'block';
        if (allocation.length === 0) {
            detailTableDiv.innerHTML = '<p>Não foi possível distribuir monitorias. Verifique se os times no CSV correspondem aos produtos configurados.</p>';
            return;
        }
        let detailHTML = `<table><thead><tr><th>Analista</th><th>Produto Mapeado</th><th>Qtd. Monitorias</th></tr></thead><tbody>`;
        allocation.sort((a, b) => (a.product || '').localeCompare(b.product || '') || a.name.localeCompare(b.name));
        let totalGeral = 0;
        allocation.forEach(item => {
            detailHTML += `<tr><td>${item.name}</td><td>${item.product}</td><td>${item.monitorias}</td></tr>`;
            totalGeral += item.monitorias;
        });
        detailHTML += `<tr style="background-color: #343a40; color: white;"><td colspan="2"><strong>TOTAL GERAL DISTRIBUÍDO</strong></td><td><strong>${totalGeral}</strong></td></tr>`;
        detailHTML += '</tbody></table>';
        detailTableDiv.innerHTML = detailHTML;
    }
});
