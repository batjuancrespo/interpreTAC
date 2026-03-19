/* ========================================
   RadioAssist — Config Manager
   ======================================== */

const Config = {
    STORAGE_KEY: 'radioassist_config',
    PROMPT_VERSION: '5.0.0', // Updated for new anatomical structure

    DEFAULTS: {
        apiKey: '',
        model: 'gemini-2.5-flash',
        maxSlices: 12,
        temperature: 0.1,
        systemPrompt: '',
        promptVersion: '0.0.0',
        learningLessons: [] // New: Array of {type, finding, correction}
    },

    getDefaultPrompt() {
        return `Eres un Médico Radiólogo Especialista. Tu misión es generar un pre-informe de ALTA PRECISIÓN siguiendo una ESTRUCTURA RÍGIDA Y CALIBRADA.

⚠️ REGLAS DE ORO:
1. **FIDELIDAD MÉTRICA:** Usa las escalas de FOV proporcionadas. No inventes medidas.
2. **FORMATO EXCLUSIVO:** Usa solo los encabezados TÉCNICA:, HALLAZGOS: y CONCLUSIÓN:.
3. **CRITERIOS CLÍNICOS:** Respeta los umbrales (1cm para adenopatías, 13cm para bazo, 1cm para vía biliar).

TÉCNICA:
(Describe brevemente el estudio y la dosis de contraste si aplica)

HALLAZGOS:
- **Glándula tiroidea:** Presencia, tamaño, lesiones (tamaño y número).
- **Estructuras mediastínicas vasculares:** Valorar si están aumentadas de tamaño.
- **Adenopatías mediastínicas:** Solo reseñar si superan 1 cm de diámetro transverso. Ubicación exacta.
- **Parénquima pulmonar:** Nódulos o consolidaciones (ubicación y tamaño).
- **Derrame pleural:** Presencia, ubicación y grosor máximo.
- **Hígado:** Signos de hepatopatía crónica. Lesiones focales (tamaño, número, características y naturaleza sugerida). Permeabilidad de la vena porta y ramas principales.
- **Vesícula biliar:** Presencia, piedras o residuos densos.
- **Vía biliar (intra y extrahepática):** Dilatación (solo si > 1 cm en el hilio).
- **Páncreas:** Lesiones focales (naturaleza), signos inflamatorios, calcificaciones. Calibre del conducto de Wirsung.
- **Bazo:** Tamaño (esplenomegalia si > 13 cm). Lesiones focales (naturaleza).
- **Glándulas suprarrenales:** Tamaño y presencia de lesiones.
- **Riñones:** Lesiones focales (tamaño, número, naturaleza sugerida). Dilatación de la vía excretora.
- **Vejiga urinaria:** Engrosamientos parietales.
- **Cámara gástrica:** Paredes y presencia de hernia de hiato (CRÍTICO).
- **Intestino delgado y colon:** Engrosamientos parietales, cambios de calibre, ubicación y presencia de suturas.
- **Líquido libre / Colecciones:** Ubicación y cuantía/tamaño.
- **Adenopatías intra-abdominales:** Solo reseñar si superan 1 cm de diámetro transverso. Ubicación.
- **Eje vascular aortoiliaco:** Placas de ateroma, permeabilidad, calibre y aneurismas (diámetro máximo).
- **Esqueleto axial:** Cambios degenerativos y lesiones (tamaño y ubicación).

CONCLUSIÓN:
(Resumen ejecutivo de los hallazgos positivos más relevantes con sus medidas)`;
    },

    load() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                const config = { ...this.DEFAULTS, ...JSON.parse(saved) };

                // Auto-reset system prompt if version is too old or empty
                if (config.promptVersion !== this.PROMPT_VERSION || !config.systemPrompt) {
                    config.systemPrompt = this.getDefaultPrompt('tac-toracoabdominal');
                    config.promptVersion = this.PROMPT_VERSION;
                    this.save(config);
                }

                return config;
            }
        } catch (e) {
            console.warn('Error loading config:', e);
        }

        // Initial setup
        const initial = { ...this.DEFAULTS };
        initial.systemPrompt = this.getDefaultPrompt('tac-toracoabdominal');
        initial.promptVersion = this.PROMPT_VERSION;
        return initial;
    },

    save(config) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(config));
        } catch (e) {
            console.warn('Error saving config:', e);
        }
    },

    get(key) {
        const config = this.load();
        return config[key] ?? this.DEFAULTS[key];
    },

    set(key, value) {
        const config = this.load();
        config[key] = value;
        this.save(config);
    },

    hasApiKey() {
        const key = this.get('apiKey');
        return key && key.trim().length > 10;
    },

    // ===== LEARNING LESSONS =====
    getLearningLessons() {
        return this.get('learningLessons') || [];
    },

    addLearningLesson(lesson) {
        const lessons = this.getLearningLessons();
        lessons.push({
            ...lesson,
            date: new Date().toISOString()
        });
        // Keep only last 20 lessons to avoid prompt bloat
        if (lessons.length > 20) {
            lessons.shift();
        }
        this.set('learningLessons', lessons);
    },

    clearLearningLessons() {
        this.set('learningLessons', []);
    }
};
