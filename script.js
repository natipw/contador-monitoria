document.addEventListener('DOMContentLoaded', () => {

    // --- ELEMENTOS DA PÁGINA ---
    const reportFileInput = document.getElementById('report-file-input');
    const processReportBtn = document.getElementById('process-report-btn');
    const eligibleAnalystsSection = document.getElementById('eligible-analysts-section');
    const distributionSection = document.getElementById('distribution-section');
    const eligibleAnalystsTable = document.getElementById('eligible-analysts-table');
    const detailTableDiv = document.getElementById('allocation-detail-table');

    // --- CONFIGURAÇÕES GLOBAIS ---
    const PRODUCT_ALLOCATION = { 'Auto': 20, 'Check': 640, 'Doc': 20, 'ID Pay': 50, 'ID Unico': 20, 'IDCloud': 20, 'B2C': 30, 'Privacidade': 0, 'Institucional': 0 };

    // --- EVENTO PRINCIPAL ---
    processReportBtn.addEventListener('click', () => {
        if (reportFileInput.files.length === 0) {
            alert('Por favor, selecione o relatório mensal em CSV.');
            return;
        }
        Papa.parse(reportFileInput.files[0], {
            header: true,
            skipEmptyLines: true,
            bom: true, // Adicionado para remover caracteres invisíveis (BOM) do início do arquivo
            complete: (results) => {
                console.log("Arquivo lido. Total de linhas:", results.data.length);
                console.log("Exemplo da primeira linha de dados:", results.data[0]);
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

    function findEligibleAnalysts(data) {
        const analystsWorkDays = {};
        
        data.forEach(row => {
            const analystName = row.NOME || row.ANALISTA;
            const dateString = row.DATA;
            const scaleStatus = (row.ESCALA || '').toLowerCase();
            const parsedDate = parseDate(dateString);

            // Pula a linha se não tiver nome ou data
            if (!analystName || !parsedDate) {
                return;
            }

            // *** MUDANÇA CRÍTICA AQUI ***
            // Agora, só contamos o dia se a escala for EXATAMENTE "escalado".
            if (scaleStatus !== 'escalado') {
                return; // Ignora folgas, férias, "não escalado", etc.
            }
            
            // Se chegou até aqui, é um dia de trabalho válido.
            if (!analystsWorkDays[analystName]) {
                analystsWorkDays[analystName] = new Set();
            }
            analystsWorkDays[analystName].add(parsedDate.getTime());
        });

        console.log("Analistas e seus dias de trabalho contados:", analystsWorkDays);

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
        console.log("Analistas encontrados com mais de 10 dias de trabalho:", longStreakAnalysts);
        return longStreakAnalysts;
    }

    function getUniqueEligibleAnalysts(allData, eligibleNames) {
        const uniqueEligible = {};
        allData.forEach(row => {
            const analystName = row.NOME || row.ANALISTA;
            if (eligibleNames.includes(analystName)) {
                const teamName = row['SUB OPERACÃO'] || row['SUB OPERAÇÃO']; // Trata os dois nomes de coluna
                uniqueEligible[analystName] = {
                    name: analystName,
                    product: mapTeamToProduct(teamName)
                };
            }
        });
        return Object.values(uniqueEligible);
    }

    function calculateAndDisplayDistribution(analysts) {
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
    
    function displayEligibleAnalysts(analysts) {
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

    function displayDistributionResults(allocation) {
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
