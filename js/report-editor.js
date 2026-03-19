/* ========================================
   RadioAssist — Report Editor
   Handles report display, editing, export
   ======================================== */

const ReportEditor = {
    currentReport: null,

    // ===== SHOW REPORT =====
    showReport(report) {
        this.currentReport = report;

        document.getElementById('sectionTecnica').value = report.tecnica || '';
        document.getElementById('sectionHallazgos').value = report.hallazgos || '';
        document.getElementById('sectionConclusion').value = report.conclusion || '';

        // Auto-resize textareas
        this.autoResizeAll();

        // Show report sections, hide placeholder
        document.querySelector('.report-placeholder').style.display = 'none';
        document.getElementById('reportSections').style.display = 'flex';
        document.getElementById('exportBar').style.display = 'flex';
    },

    // ===== GET CURRENT REPORT =====
    getCurrentReport() {
        return {
            tecnica: document.getElementById('sectionTecnica').value,
            hallazgos: document.getElementById('sectionHallazgos').value,
            conclusion: document.getElementById('sectionConclusion').value
        };
    },

    // ===== FORMAT FOR CLIPBOARD =====
    getFormattedReport() {
        const r = this.getCurrentReport();
        let text = '';

        if (r.tecnica) {
            text += 'TÉCNICA:\n' + r.tecnica + '\n\n';
        }
        if (r.hallazgos) {
            text += 'HALLAZGOS:\n' + r.hallazgos + '\n\n';
        }
        if (r.conclusion) {
            text += 'CONCLUSIÓN:\n' + r.conclusion;
        }

        return text.trim();
    },

    // ===== COPY TO CLIPBOARD =====
    async copyToClipboard() {
        const text = this.getFormattedReport();
        if (!text) return false;

        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(textarea);
            return ok;
        }
    },

    // ===== UPDATE SECTION =====
    updateSection(section, text) {
        const elementId = {
            'tecnica': 'sectionTecnica',
            'hallazgos': 'sectionHallazgos',
            'conclusion': 'sectionConclusion'
        }[section];

        if (elementId) {
            document.getElementById(elementId).value = text;
            this.autoResize(document.getElementById(elementId));
        }
    },

    // ===== CLEAR =====
    clear() {
        this.currentReport = null;
        document.getElementById('sectionTecnica').value = '';
        document.getElementById('sectionHallazgos').value = '';
        document.getElementById('sectionConclusion').value = '';
        document.getElementById('reportSections').style.display = 'none';
        document.getElementById('exportBar').style.display = 'none';
        document.querySelector('.report-placeholder').style.display = 'flex';
    },

    // ===== AUTO-RESIZE TEXTAREA =====
    autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    },

    autoResizeAll() {
        ['sectionTecnica', 'sectionHallazgos', 'sectionConclusion'].forEach(id => {
            const el = document.getElementById(id);
            if (el) this.autoResize(el);
        });
    },

    // ===== INIT =====
    init() {
        // Auto-resize on input
        ['sectionTecnica', 'sectionHallazgos', 'sectionConclusion'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => this.autoResize(el));
            }
        });
    },

    // ===== EXPORT =====
    exportToPDF() {
        const report = this.getCurrentReport();
        const patient = DicomHandler.getPatientInfo();
        
        if (!report.hallazgos && !report.tecnica) {
            return false;
        }

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>Informe Radiológico - ${patient.name}</title>
                <style>
                    body { font-family: 'Inter', sans-serif; padding: 40px; color: #333; line-height: 1.6; }
                    .header { border-bottom: 2px solid #333; margin-bottom: 30px; padding-bottom: 10px; }
                    .header h1 { margin: 0; font-size: 24px; }
                    .patient-info { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 30px; font-size: 14px; }
                    .section { margin-bottom: 25px; }
                    .section h3 { font-size: 16px; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 10px; color: #0056b3; }
                    .content { white-space: pre-wrap; font-size: 14px; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>RadioAssist — Informe Radiológico</h1>
                </div>
                <div class="patient-info">
                    <div><strong>Paciente:</strong> ${patient.name}</div>
                    <div><strong>ID:</strong> ${patient.id}</div>
                    <div><strong>Estudio:</strong> ${patient.series}</div>
                    <div><strong>Modalidad:</strong> ${patient.modality}</div>
                    <div><strong>Fecha:</strong> ${new Date().toLocaleDateString()}</div>
                </div>
                <div class="section">
                    <h3>TÉCNICA</h3>
                    <div class="content">${report.tecnica || 'No especificada'}</div>
                </div>
                <div class="section">
                    <h3>HALLAZGOS</h3>
                    <div class="content">${report.hallazgos || 'No especificados'}</div>
                </div>
                <div class="section">
                    <h3>CONCLUSIÓN</h3>
                    <div class="content">${report.conclusion || 'No especificada'}</div>
                </div>
                <div class="no-print" style="margin-top: 50px; text-align: center;">
                    <button onclick="window.print()" style="padding: 10px 20px; cursor: pointer;">Imprimir / Guardar PDF</button>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
        return true;
    }
};
