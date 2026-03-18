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
    }
};
