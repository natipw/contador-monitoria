document.addEventListener('DOMContentLoaded', () => {

    // --- LÓGICA DA PARTE 1: ANÁLISE DE ESCALA ---
    const scheduleFileInput = document.getElementById('schedule-file-input');
    const processScheduleBtn = document.getElementById('process-schedule-btn');
    const scheduleResultsTable = document.getElementById('schedule-results-table');

    processScheduleBtn.addEventListener('click', () => {
        if (scheduleFileInput.files.length === 0) {
            alert('Por favor, selecione um arquivo de escala.');
            return;
        }
        
        Papa.parse(scheduleFileInput.files[0], {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                processScheduleData(results.data);
            }
        });
    });

    function processScheduleData(data) {
        // Agrupa as datas por analista
        const analysts = {};
        data.forEach(row => {
            if (!row.Analista || !row.Data) return;
            if (!analysts[row.Analista]) {
                analysts[row.Analista] = [];
            }
            // Adiciona a data como um objeto Date para facilitar a ordenação
            analysts[row.Analista].push(new Date(row.Data + 'T00:00:00'));
        });

        const longStreakAnalysts = [];
        // Para cada analista, verifica os dias consecutivos
        for (const name in analysts) {
            const dates = analysts[name].sort((a, b) => a - b);
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
            maxStreak = Math.max(maxStreak, currentStreak); // Final check

            if (maxStreak > 10) {
                longStreakAnalysts.push({ name, streak: maxStreak });
            }
        }
        
        displayScheduleResults(longStreakAnalysts);
    }
    
    function displayScheduleResults(analysts) {
        if (analysts.length === 0) {
            scheduleResultsTable.innerHTML = '<p>Nenhum analista trabalhou mais de 10 dias consecutivos.</p>';
            return;
        }
        let tableHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Analista</th>
                        <th>Dias Consecutivos (Máx)</th>
                    </tr>
                </thead>
                <tbody>
        `;
        analysts.forEach(analyst => {
            tableHTML += `
                <tr>
                    <td>${analyst.name}</td>
                    <td><strong>${analyst.streak}</strong></td>
                </tr>
            `;
        });
        tableHTML += '</tbody></table>';
        scheduleResultsTable.innerHTML = tableHTML;
    }


    // --- LÓGICA DA PARTE 2: DISTRIBUIÇÃO DE MONITORIAS ---
    const allocationFileInput = document.getElementById('allocation-file-input');
    const processAllocationBtn = document.getElementById('process-allocation-btn');
    const summaryTableDiv = document.getElementById('allocation-summary-table');
    const detailTableDiv = document.getElementById('allocation-detail-table');

    // CONFIGURAÇÕES BASEADAS NA SUA IMAGEM
    const TOTAL_MONITORIAS = 800;
    // Quantidade de monitorias por produto (coluna "QTDE Por produto" da sua imagem)
    const PRODUCT_ALLOCATION = {
        'Auto': 20,
        'Check': 640,
        'Doc': 20,
        'ID Pay': 50,
        'ID Unico': 20,
        'IDCloud': 20,
        'B2C': 30,
        'Privacidade': 0 // O total da imagem é 800, ajustando este para zerar se não tiver
    };
    
    // Adicionei os produtos faltantes da tabela da direita (Institucional)
    // Se um produto não estiver aqui, não receberá monitorias.
    // Verifique se a soma está correta! 20+640+20+50+20+20+30 = 800. Perfeito.

    processAllocationBtn.addEventListener('click', () => {
         if (allocationFileInput.files.length === 0) {
            alert('Por favor, selecione um arquivo de alocação.');
            return;
        }
        
        Papa.parse(allocationFileInput.files[0], {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                calculateDistribution(results.data);
            }
        });
    });

    function calculateDistribution(analystsData) {
        // 1. Agrupar analistas por "SubOperacao" (Monitor) e por produto
        const monitors = {
            'Bru': { analysts: {}, totalMonitorias: 0 },
            'Nati': { analysts: {}, totalMonitorias: 0 },
            'Will': { analysts: {}, totalMonitorias: 0 }
        };

        analystsData.forEach(analyst => {
            const monitorName = analyst.SubOperacao;
            const productName = analyst.ProdutoPrincipal;

            if (monitors[monitorName] && productName) {
                if (!monitors[monitorName].analysts[productName]) {
                    monitors[monitorName].analysts[productName] = [];
                }
                monitors[monitorName].analysts[productName].push({ name: analyst.Analista, monitorias: 0 });
            }
        });

        let finalAllocation = [];

        // 2. Distribuir as monitorias por produto
        for (const productName in PRODUCT_ALLOCATION) {
            let totalMonitoriasProduto = PRODUCT_ALLOCATION[productName];
            if (totalMonitoriasProduto === 0) continue;

            // Encontra os monitores e analistas envolvidos com este produto
            let analystsForProduct = [];
            for (const monitorName in monitors) {
                if (monitors[monitorName].analysts[productName]) {
                   monitors[monitorName].analysts[productName].forEach(analyst => {
                       analystsForProduct.push({ ...analyst, monitor: monitorName, product: productName });
                   });
                }
            }

            if (analystsForProduct.length === 0) continue;

            // Distribui as monitorias entre os analistas do produto
            let baseMonitorias = Math.floor(totalMonitoriasProduto / analystsForProduct.length);
            let remainder = totalMonitoriasProduto % analystsForProduct.length;

            analystsForProduct.forEach((analyst, index) => {
                analyst.monitorias = baseMonitorias;
                if (remainder > 0) {
                    analyst.monitorias++;
                    remainder--;
                }
            });

            finalAllocation.push(...analystsForProduct);
        }

        displayAllocationResults(finalAllocation);
    }

    function displayAllocationResults(allocation) {
        // --- Gerar tabela de resumo por monitor ---
        const summary = {};
        allocation.forEach(item => {
            if (!summary[item.monitor]) {
                summary[item.monitor] = { total: 0, products: {} };
            }
            if (!summary[item.monitor].products[item.product]) {
                summary[item.monitor].products[item.product] = 0;
            }
            summary[item.monitor].products[item.product] += item.monitorias;
            summary[item.monitor].total += item.monitorias;
        });

        let summaryHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Responsável</th>
                        <th>Produto</th>
                        <th>Qtd. Monitorias</th>
                    </tr>
                </thead>
                <tbody>
        `;
        let totalGeral = 0;
        for (const monitor in summary) {
            let first = true;
            for(const product in summary[monitor].products) {
                 summaryHTML += `
                    <tr>
                        ${first ? `<td rowspan="${Object.keys(summary[monitor].products).length}">${monitor}</td>` : ''}
                        <td>${product}</td>
                        <td>${summary[monitor].products[product]}</td>
                    </tr>
                `;
                first = false;
            }
             summaryHTML += `
                <tr style="background-color: #d1e7dd;">
                    <td colspan="2"><strong>Total ${monitor}</strong></td>
                    <td><strong>${summary[monitor].total}</strong></td>
                </tr>
            `;
            totalGeral += summary[monitor].total;
        }
        summaryHTML += `
            <tr style="background-color: #343a40; color: white;">
                <td colspan="2"><strong>TOTAL GERAL</strong></td>
                <td><strong>${totalGeral}</strong></td>
            </tr>
        `;
        summaryHTML += '</tbody></table>';
        summaryTableDiv.innerHTML = summaryHTML;

        // --- Gerar tabela detalhada por analista ---
        let detailHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Analista</th>
                        <th>Monitor Responsável</th>
                        <th>Produto</th>
                        <th>Qtd. Monitorias</th>
                    </tr>
                </thead>
                <tbody>
        `;
        allocation.sort((a, b) => a.monitor.localeCompare(b.monitor) || a.name.localeCompare(b.name));
        allocation.forEach(item => {
            detailHTML += `
                <tr>
                    <td>${item.name}</td>
                    <td>${item.monitor}</td>
                    <td>${item.product}</td>
                    <td>${item.monitorias}</td>
                </tr>
            `;
        });
        detailHTML += '</tbody></table>';
        detailTableDiv.innerHTML = detailHTML;
    }
});