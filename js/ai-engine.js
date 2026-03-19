/* ========================================
   RadioAssist — AI Engine
   Communicates with Gemini API to analyze
   CT images and generate pre-reports
   ======================================== */

const AIEngine = {

    // ===== MAIN ANALYSIS =====
    async analyzeImages(images, studyType, onProgress) {
        const apiKey = Config.get('apiKey');
        if (!apiKey) {
            throw new Error('No se ha configurado la API Key de Gemini. Ve a Configuración (⚙️) para añadirla.');
        }

        const model = Config.get('model');
        const temperature = Config.get('temperature');
        const customPrompt = Config.get('systemPrompt');
        const systemPrompt = customPrompt || Config.getDefaultPrompt(studyType);

        if (onProgress) onProgress('Preparando imágenes para el análisis...', 10);

        // Build study type description
        const studyNames = {
            'tac-abdominal': 'TAC Abdominal con contraste intravenoso',
            'tac-toracoabdominal': 'TAC Toraco-Abdominal con contraste intravenoso',
            'tac-abdominal-sin': 'TAC Abdominal sin contraste',
            'tac-torax': 'TAC de Tórax con contraste intravenoso'
        };
        const studyName = studyNames[studyType] || 'TAC';

        // Build request parts
        const parts = [
            {
                text: systemPrompt + `\n\nTipo de estudio: ${studyName}\nSe proporcionan ${images.length} cortes representativos del estudio.\nGenera el pre-informe ahora:`
            }
        ];

        // Add images
        for (const img of images) {
            let metadata = `Corte #${img.index}`;
            if (img.window) metadata += ` - Ventana: ${img.window}`;

            if (img.calibration) {
                const sp = img.calibration.mmPerPixel;
                // AI understands FOV better than mm/px for absolute measurement
                const fovX = (sp[0] * img.width).toFixed(0);
                const fovY = (sp[1] * img.height).toFixed(0);
                metadata += ` - FOV (Campo de visión): ${fovX}x${fovY} mm`;

                if (img.calibration.sliceThickness) {
                    metadata += ` - Grosor: ${img.calibration.sliceThickness} mm`;
                }
            }
            parts.push({ text: metadata });

            parts.push({
                inlineData: {
                    mimeType: img.mimeType || 'image/png',
                    data: img.base64
                }
            });
        }

        if (onProgress) onProgress('Enviando al modelo de IA...', 30);

        // Call Gemini API
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: parts
                    }],
                    generationConfig: {
                        temperature: temperature,
                        maxOutputTokens: 4096,
                        topP: 0.95,
                        topK: 40
                    },
                    safetySettings: [
                        {
                            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                            threshold: "BLOCK_NONE"
                        },
                        {
                            category: "HARM_CATEGORY_HARASSMENT",
                            threshold: "BLOCK_NONE"
                        },
                        {
                            category: "HARM_CATEGORY_HATE_SPEECH",
                            threshold: "BLOCK_NONE"
                        },
                        {
                            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                            threshold: "BLOCK_NONE"
                        }
                    ]
                })
            });

            if (onProgress) onProgress('Analizando imágenes con IA...', 60);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMsg = errorData?.error?.message || `Error HTTP ${response.status}`;

                if (response.status === 429) {
                    throw new Error('Has superado el límite de solicitudes de la API. Espera unos minutos e inténtalo de nuevo.');
                } else if (response.status === 403) {
                    throw new Error('API Key inválida o sin permisos. Comprueba tu clave en Configuración.');
                } else if (response.status === 400) {
                    throw new Error(`Error en la solicitud: ${errorMsg}. Prueba con menos imágenes.`);
                }
                throw new Error(`Error de la API: ${errorMsg}`);
            }

            const data = await response.json();

            if (onProgress) onProgress('Procesando respuesta...', 90);

            // Extract text from response
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
                const blockReason = data?.candidates?.[0]?.finishReason;
                if (blockReason === 'SAFETY') {
                    throw new Error('La respuesta fue bloqueada por los filtros de seguridad. Intenta de nuevo o modifica el prompt.');
                }
                throw new Error('La IA no generó respuesta. Intenta de nuevo con cortes diferentes.');
            }

            if (onProgress) onProgress('¡Pre-informe generado!', 100);

            return this.parseReport(text);
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Error de conexión. Verifica tu conexión a internet.');
            }
            throw error;
        }
    },

    // ===== PARSE REPORT INTO SECTIONS =====
    parseReport(rawText) {
        const result = {
            raw: rawText,
            tecnica: '',
            hallazgos: '',
            conclusion: ''
        };

        if (!rawText) return result;
        const text = rawText.trim();

        // More robust parsing using flexible regex
        // Support for: **TÉCNICA**, TÉCNICA:, Técnica, etc.
        const tecnicaRegex = /^\s*(?:#+\s*)?(?:\*\*|__)?T[ÉE]CNICA[:\-]?\s*(?:\*\*|__)?\s*\n?([\s\S]*?)(?=\n\s*(?:#+\s*)?(?:\*\*|__)?(?:HALLAZGOS|CONCLUSI[OÓ]N|IMPRESI[OÓ]N)[:\-]?)/i;
        const hallazgosRegex = /(?:#+\s*)?(?:\*\*|__)?HALLAZGOS[:\-]?\s*(?:\*\*|__)?\s*\n?([\s\S]*?)(?=\n\s*(?:#+\s*)?(?:\*\*|__)?(?:CONCLUSI[OÓ]N|IMPRESI[OÓ]N)[:\-]?|$)/i;
        const conclusionRegex = /(?:#+\s*)?(?:\*\*|__)?(?:CONCLUSI[OÓ]N|IMPRESI[OÓ]N)[:\-]?\s*(?:\*\*|__)?\s*\n?([\s\S]*?)$/i;

        const tecnicaMatch = text.match(tecnicaRegex);
        const hallazgosMatch = text.match(hallazgosRegex);
        const conclusionMatch = text.match(conclusionRegex);

        if (tecnicaMatch) result.tecnica = tecnicaMatch[1].trim();
        if (hallazgosMatch) result.hallazgos = hallazgosMatch[1].trim();
        if (conclusionMatch) result.conclusion = conclusionMatch[1].trim();

        // If no sections found, or if we have a lot of text but no sections, 
        // fallback to putting everything in hallazgos to avoid data loss
        if (!result.tecnica && !result.hallazgos && !result.conclusion) {
            result.hallazgos = text;
        }

        return result;
    },

    // ===== REGENERATE SECTION =====
    async regenerateSection(section, currentReport, studyType) {
        const apiKey = Config.get('apiKey');
        if (!apiKey) throw new Error('No se ha configurado la API Key.');

        const model = Config.get('model');
        const temperature = Config.get('temperature');

        const sectionNames = {
            'tecnica': 'TÉCNICA',
            'hallazgos': 'HALLAZGOS',
            'conclusion': 'CONCLUSIÓN'
        };

        const prompt = `Dado el siguiente informe radiológico parcial, regenera SOLO la sección "${sectionNames[section]}".

Informe actual:
TÉCNICA: ${currentReport.tecnica || '(no disponible)'}
HALLAZGOS: ${currentReport.hallazgos || '(no disponible)'}
CONCLUSIÓN: ${currentReport.conclusion || '(no disponible)'}

Genera SOLO el texto de la sección ${sectionNames[section]}, sin incluir el encabezado. Sé preciso y conciso en español de España. Evita cualquier advertencia legal o médica introductoria para no disparar filtros de seguridad.`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: temperature,
                    maxOutputTokens: 2048
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Error al regenerar sección: HTTP ${response.status}`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('No se obtuvo respuesta de la IA.');

        return text.trim();
    }
};
