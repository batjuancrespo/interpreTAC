/* ========================================
   RadioAssist — Config Manager
   ======================================== */

const Config = {
    STORAGE_KEY: 'radioassist_config',
    PROMPT_VERSION: '4.0.0', // Updated version to trigger reset

    DEFAULTS: {
        apiKey: '',
        model: 'gemini-2.5-flash',
        maxSlices: 12,
        temperature: 0.1,
        systemPrompt: '',
        promptVersion: '0.0.0'
    },

    getDefaultPrompt(studyType) {
        const basePrompt = `Eres un Médico Radiólogo Especialista. Tu misión es generar un pre-informe de ALTA PRECISIÓN y SEGURIDAD. 

⚠️ REGLAS INNEGOCIABLES DE CALIDAD ⚠️:
1. **REVISIÓN OBLIGATORIA DE HITOS (SI NO APARECEN, EL INFORME ES INCORRECTO):**
   - **ESTÓMAGO / UNIÓN ESOFAGOGÁSTRICA:** Debes buscar activamente el hiato diafragmático. Reporta siempre si hay Hernia de Hiato o si la unión es normoposicionada.
   - **DIFERENCIACIÓN RENAL/HEPÁTICA:** Un hallazgo en el polo superior renal derecho NO es hepático. Verifica el origen en cortes contiguos.
2. **FIDELIDAD MÉTRICA (CRÍTICO):** 
   - Se te proporciona el FOV (Campo de visión) en mm de cada imagen. 
   - Si el FOV es de 400mm y un quiste ocupa 1/4 de la imagen, mide 100mm (10cm).
   - ¡NO des medidas genéricas de 2cm! Mide con precisión usando los datos de escala. Un quiste de 9cm debe ser reportado como 9cm (90mm).
3. **TONO PROFESIONAL:** Informe estructurado, conciso y técnico.
4. **FORMATO RÍGIDO (CRÍTICO):** Utiliza exactamente los encabezados "TÉCNICA:", "HALLAZGOS:" y "CONCLUSIÓN:". No añadas introducciones como "Aquí tienes el informe" ni advertencias legales al final para evitar bloqueos de seguridad.

ESTRUCTURA DE RESPUESTA (SIGUE ESTE ORDEN EXACTO):

TÉCNICA:
...

HALLAZGOS:
- **Tórax y Mediastino (incluye Hiato):** (Específica: "Unión esofagogástrica normoposicionada" o "Hernia de hiato de X cm")
- **Abdomen Superior (Hígado/Bazo/Vesícula/Páncreas):** 
- **Cámara Gástrica:** (Morfología y contenido)
- **Riñones y Suprarrenales:** (Detallar quistes y su origen exacto. Diferenciar de hígado)
- **Retroperitoneo y Vasos:**
- **Tubo Digestivo y Pelvis:**
- **Esqueleto y Pared:**

CONCLUSIÓN:
(Resumen ejecutivo con los hallazgos más relevantes y sus medidas exactas)`;

        const abdominalFindings = `
- Hígado: parénquima, lesiones (distinguir de quistes renales exofíticos)
- Vesícula y Vía Biliar: contenido, calibre
- Páncreas y Bazo: normalidad o hallazgos
- Riñones: quistes (Bosniak), litiasis, masas. ¡Mide con precisión!
- Estómago: hernia de hiato, paredes
- Retroperitoneo: adenopatías, aorta
- Pelvis: vejiga, próstata/útero
- Esqueleto: cambios degenerativos, lesiones óseas`;

        const thoracicFindings = `
- Pulmones: nódulos, infiltrados
- Mediastino: **Valorar Hiato Esofágico**, corazón, vasos especializados
- Pleura y Pared torácica`;

        let findings = '';
        switch (studyType) {
            case 'tac-abdominal':
            case 'tac-abdominal-sin':
                findings = abdominalFindings;
                break;
            case 'tac-toracoabdominal':
                findings = `\n\n(Revisión toracoabdominal completa: pulmones + abdomen superior e inferior)`;
                break;
            case 'tac-torax':
                findings = thoracicFindings;
                break;
            default:
                findings = abdominalFindings;
        }

        return basePrompt + findings;
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
    }
};
