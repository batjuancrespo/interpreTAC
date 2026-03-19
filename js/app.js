/* ========================================
   RadioAssist — Main App Controller
   Orchestrates all modules, handles UI
   ======================================== */

const App = {
    isGenerating: false,
    isRulerActive: false,
    isDrawingRuler: false,
    rulerStart: null,
    rulerEnd: null,

    // ===== INITIALIZATION =====
    init() {
        DicomHandler.init();
        ReportEditor.init();
        this.bindEvents();
        this.loadConfig();

        // Check for API key on startup
        if (!Config.hasApiKey()) {
            setTimeout(() => {
                this.showToast('Configura tu API Key de Gemini para empezar (⚙️)', 'warning', 5000);
            }, 1000);
        }
    },

    // ===== EVENT BINDING =====
    bindEvents() {
        // File inputs
        document.getElementById('dicomFolderInput').addEventListener('change', (e) => this.handleDicomUpload(e));
        document.getElementById('imageFileInput').addEventListener('change', (e) => this.handleImageUpload(e));

        // Drag & drop on upload zone
        const uploadZone = document.getElementById('uploadZone');
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('drag-over');
        });
        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('drag-over');
        });
        uploadZone.addEventListener('drop', (e) => this.handleDrop(e));

        // Slice navigation
        document.getElementById('sliceSlider').addEventListener('input', (e) => {
            this.navigateToSlice(parseInt(e.target.value));
        });
        document.getElementById('btnPrevSlice').addEventListener('click', () => {
            const idx = DicomHandler.prevSlice();
            this.updateSliceUI(idx);
        });
        document.getElementById('btnNextSlice').addEventListener('click', () => {
            const idx = DicomHandler.nextSlice();
            this.updateSliceUI(idx);
        });

        // Mouse wheel on viewer for slice scrolling
        document.getElementById('viewerContainer').addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY > 0) {
                const idx = DicomHandler.nextSlice();
                this.updateSliceUI(idx);
            } else {
                const idx = DicomHandler.prevSlice();
                this.updateSliceUI(idx);
            }
        });

        // Window/Level presets
        document.querySelectorAll('.wl-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const wc = parseInt(btn.dataset.wc);
                const ww = parseInt(btn.dataset.ww);
                DicomHandler.setWindowLevel(wc, ww);
                document.querySelectorAll('.wl-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.updateOverlay();
                // Update thumbnails with new W/L
                this.refreshThumbnails();
            });
        });

        // Selection controls
        document.getElementById('btnToggleSelect').addEventListener('click', () => {
            const selected = DicomHandler.toggleSelection();
            this.updateSelectionUI();
            this.updateThumbnailSelection();
            this.showToast(selected ? 'Corte seleccionado ⭐' : 'Corte deseleccionado', 'info', 1500);
        });
        document.getElementById('btnAutoSelect').addEventListener('click', () => {
            const maxSlices = Config.get('maxSlices');
            const count = DicomHandler.autoSelectSlices(maxSlices);
            this.updateSelectionUI();
            this.updateThumbnailSelection();
            this.showToast(`${count} cortes seleccionados automáticamente`, 'success', 2000);
        });
        document.getElementById('btnClearSelection').addEventListener('click', () => {
            DicomHandler.clearSelection();
            this.updateSelectionUI();
            this.updateThumbnailSelection();
        });

        // Generate button
        document.getElementById('btnGenerate').addEventListener('click', () => this.generateReport());

        // Ruler tool
        document.getElementById('btnRuler').addEventListener('click', () => this.toggleRuler());

        // Ruler mouse events
        const canvas = document.getElementById('dicomCanvas');
        canvas.addEventListener('mousedown', (e) => this.handleRulerDown(e));
        window.addEventListener('mousemove', (e) => this.handleRulerMove(e));
        window.addEventListener('mouseup', () => this.handleRulerUp());

        // Regenerate section buttons
        document.querySelectorAll('.btn-regen').forEach(btn => {
            btn.addEventListener('click', () => this.regenerateSection(btn.dataset.section));
        });

        // Export
        document.getElementById('btnCopy').addEventListener('click', () => this.copyReport());
        document.getElementById('btnExport').addEventListener('click', () => this.exportReport());
        document.getElementById('btnClear').addEventListener('click', () => this.newStudy());

        // Report Tabs
        document.getElementById('tabSections').addEventListener('click', () => ReportEditor.switchTab('sections'));
        document.getElementById('tabRaw').addEventListener('click', () => ReportEditor.switchTab('raw'));

        // Config modal
        document.getElementById('btnConfig').addEventListener('click', () => this.openConfig());
        document.getElementById('btnCloseConfig').addEventListener('click', () => this.closeConfig());
        document.querySelector('.modal-backdrop').addEventListener('click', () => this.closeConfig());
        document.getElementById('btnSaveConfig').addEventListener('click', () => this.saveConfig());

        // Teach modal
        document.getElementById('btnTeach').addEventListener('click', () => this.openTeach());
        document.getElementById('btnCloseTeach').addEventListener('click', () => this.closeTeach());
        document.getElementById('btnSaveLesson').addEventListener('click', () => this.saveLesson());
        document.getElementById('teachType').addEventListener('change', (e) => this.handleTeachTypeChange(e));

        // Knowledge Management
        document.getElementById('btnExportKnowledge')?.addEventListener('click', () => this.exportKnowledge());
        document.getElementById('btnImportKnowledge')?.addEventListener('click', () => document.getElementById('importKnowledgeInput').click());
        document.getElementById('importKnowledgeInput')?.addEventListener('change', (e) => this.importKnowledge(e));
        document.getElementById('btnClearKnowledge')?.addEventListener('click', () => this.clearKnowledge());
        document.getElementById('btnResetPrompt').addEventListener('click', () => {
            const studyType = document.getElementById('studyType').value;
            document.getElementById('systemPrompt').value = Config.getDefaultPrompt(studyType);
        });
        document.getElementById('btnToggleKey').addEventListener('click', () => {
            const input = document.getElementById('apiKey');
            input.type = input.type === 'password' ? 'text' : 'password';
        });
        document.getElementById('temperature').addEventListener('input', (e) => {
            document.getElementById('tempValue').textContent = e.target.value;
        });

        // Analysis mode change
        document.getElementById('analysisMode').addEventListener('change', (e) => {
            const mode = e.target.value;
            let count;
            if (mode === 'absolute') count = Math.ceil(DicomHandler.getTotalSlices() / 2);
            else if (mode === 'ultrasmart') count = 150;
            else if (mode === 'full') count = Math.min(DicomHandler.getTotalSlices(), 400);
            else if (mode === 'smart') count = 50;
            else if (mode === 'total') count = 150;
            else if (mode === 'detailed') count = 60;
            else count = Config.get('maxSlices');

            if (DicomHandler.getTotalSlices() > 0) {
                DicomHandler.autoSelectSlices(count);
                this.updateSelectionUI();
                this.updateThumbnailSelection();

                let modeLabel = 'Rápido';
                if (mode === 'absolute') modeLabel = 'Análisis Absoluto';
                else if (mode === 'ultrasmart') modeLabel = 'Ultra Multi-Ventana';
                else if (mode === 'full') modeLabel = 'Estudio Completo (Fino)';
                else if (mode === 'smart') modeLabel = 'Inteligente (Multi-Ventana)';
                else if (mode === 'total') modeLabel = 'Total';
                else if (mode === 'detailed') modeLabel = 'Detallado';

                const unit = mode === 'absolute' ? '% del estudio' : 'cortes base';
                this.showToast(`Modo ${modeLabel} activado: ${count} ${unit}`, 'info');
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+Enter: Generate report
            if (e.ctrlKey && e.key === 'Enter' && !this.isGenerating) {
                e.preventDefault();
                this.generateReport();
            }
            // Ctrl+Shift+C: Copy report
            if (e.ctrlKey && e.shiftKey && e.key === 'C') {
                e.preventDefault();
                this.copyReport();
            }
            // Arrow keys for slice navigation (when not in textarea)
            if (!e.target.matches('textarea, input')) {
                if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const idx = DicomHandler.prevSlice();
                    this.updateSliceUI(idx);
                }
                if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    const idx = DicomHandler.nextSlice();
                    this.updateSliceUI(idx);
                }
                // Space to toggle selection
                if (e.key === ' ') {
                    e.preventDefault();
                    DicomHandler.toggleSelection();
                    this.updateSelectionUI();
                    this.updateThumbnailSelection();
                }
            }
        });
    },

    // ===== FILE HANDLING =====
    async handleDicomUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        await this.loadFiles(Array.from(files), 'dicom');
    },

    async handleImageUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        await this.loadFiles(Array.from(files), 'image');
    },

    async handleDrop(event) {
        event.preventDefault();
        document.getElementById('uploadZone').classList.remove('drag-over');

        const items = event.dataTransfer.items;
        const files = [];

        if (items) {
            // Try to get directory entries for folder drops
            const entries = [];
            for (const item of items) {
                const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
                if (entry) {
                    entries.push(entry);
                }
            }

            if (entries.length > 0) {
                // Recursively read directory entries
                for (const entry of entries) {
                    const entryFiles = await this.readEntry(entry);
                    files.push(...entryFiles);
                }
            } else {
                // Fallback to regular file list
                for (const file of event.dataTransfer.files) {
                    files.push(file);
                }
            }
        }

        if (files.length === 0) return;

        // Determine type
        const hasImages = files.some(f => f.type && f.type.startsWith('image/'));
        const hasDicom = files.some(f => {
            const name = f.name.toLowerCase();
            return name.endsWith('.dcm') || !name.includes('.') || name.endsWith('.ima');
        });

        await this.loadFiles(files, hasDicom ? 'dicom' : 'image');
    },

    readEntry(entry) {
        return new Promise((resolve) => {
            if (entry.isFile) {
                entry.file(file => resolve([file]), () => resolve([]));
            } else if (entry.isDirectory) {
                const reader = entry.createReader();
                const allFiles = [];
                const readBatch = () => {
                    reader.readEntries(async (entries) => {
                        if (entries.length === 0) {
                            resolve(allFiles);
                            return;
                        }
                        for (const e of entries) {
                            const files = await this.readEntry(e);
                            allFiles.push(...files);
                        }
                        readBatch(); // Continue reading
                    }, () => resolve(allFiles));
                };
                readBatch();
            } else {
                resolve([]);
            }
        });
    },

    async loadFiles(files, type) {
        this.showLoadingState();

        try {
            let sliceCount;
            if (type === 'dicom') {
                sliceCount = await DicomHandler.loadDicomFiles(files);
            } else {
                sliceCount = await DicomHandler.loadImageFiles(files);
            }

            this.showViewerState(sliceCount);
            this.generateThumbnails();

            // Auto-select slices based on mode
            const mode = document.getElementById('analysisMode').value;
            let maxSlices;
            if (mode === 'absolute') maxSlices = Math.ceil(DicomHandler.getTotalSlices() / 2);
            else if (mode === 'ultrasmart') maxSlices = 150;
            else if (mode === 'full') maxSlices = 400;
            else if (mode === 'smart') maxSlices = 50;
            else if (mode === 'total') maxSlices = 150;
            else if (mode === 'detailed') maxSlices = 60;
            else maxSlices = Config.get('maxSlices');

            DicomHandler.autoSelectSlices(maxSlices);
            this.updateSelectionUI();
            this.updateThumbnailSelection();

            this.showToast(`✅ ${sliceCount} ${type === 'dicom' ? 'cortes DICOM' : 'imágenes'} cargados`, 'success');

            // Enable generate button
            this.updateGenerateButton();

            // Auto-detect study type
            this.autoDetectStudyType();

        } catch (error) {
            this.showUploadState();
            this.showToast(`❌ ${error.message}`, 'error', 5000);
        }
    },

    autoDetectStudyType() {
        const info = DicomHandler.getPatientInfo();
        const textToSearch = (info.bodyPart + ' ' + info.studyDesc + ' ' + info.series).toLowerCase();

        let detectedType = 'tac-abdominal'; // Default

        if (textToSearch.includes('toraco') || (textToSearch.includes('tora') && textToSearch.includes('abdo')) || textToSearch.includes('t-a')) {
            detectedType = 'tac-toracoabdominal';
        } else if (textToSearch.includes('tora') || textToSearch.includes('chest') || textToSearch.includes('pulm') || textToSearch.includes('ctp')) {
            detectedType = 'tac-torax';
        } else if (textToSearch.includes('abdo') || textToSearch.includes('abd')) {
            detectedType = 'tac-abdominal';
        }

        const selector = document.getElementById('studyType');
        if (selector.value !== detectedType) {
            selector.value = detectedType;
            this.showToast(`Estudio detectado: ${selector.options[selector.selectedIndex].text}`, 'info');
        }
    },

    // ===== UI STATE MANAGEMENT =====
    showLoadingState() {
        document.getElementById('uploadZone').innerHTML = `
            <div class="upload-content">
                <div class="spinner" style="width:32px;height:32px;border-width:3px;margin:0 auto 16px;"></div>
                <h3>Cargando archivos...</h3>
                <p id="loadProgressText">0 archivos procesados</p>
            </div>
        `;
    },

    updateLoadProgress(current, total) {
        const el = document.getElementById('loadProgressText');
        if (el) {
            const pct = Math.round((current / total) * 100);
            el.textContent = `${current} / ${total} archivos (${pct}%)`;
        }
    },

    showUploadState() {
        // Re-create upload zone content
        location.reload(); // Simple reset
    },

    showViewerState(sliceCount) {
        document.getElementById('uploadZone').style.display = 'none';
        document.getElementById('viewerContainer').style.display = 'flex';
        document.getElementById('thumbnailStrip').style.display = 'block';
        document.getElementById('sliceControls').style.display = 'block';
        document.getElementById('selectionControls').style.display = 'flex';

        // Setup slider
        const slider = document.getElementById('sliceSlider');
        slider.max = sliceCount - 1;
        slider.value = 0;

        // Update counter
        document.getElementById('sliceCounter').textContent = `1 / ${sliceCount}`;
        document.getElementById('totalSlices').textContent = sliceCount;

        // Update patient info
        const info = DicomHandler.getPatientInfo();
        document.getElementById('patientInfo').textContent = info.name || 'Paciente';
        document.getElementById('sliceInfo').textContent = `${sliceCount} cortes`;

        // Update overlay
        this.updateOverlay();

        // Set default W/L button
        const studyType = document.getElementById('studyType').value;
        if (studyType.includes('torax') || studyType.includes('toraco')) {
            document.querySelector('.wl-btn[data-wc="-600"]')?.classList.add('active');
        } else {
            document.querySelector('.wl-btn[data-wc="40"]')?.classList.add('active');
        }
    },

    // ===== SLICE NAVIGATION =====
    navigateToSlice(index) {
        const idx = DicomHandler.goToSlice(index);
        this.updateSliceUI(idx);
    },

    updateSliceUI(index) {
        const total = DicomHandler.getTotalSlices();
        document.getElementById('sliceSlider').value = index;
        document.getElementById('sliceCounter').textContent = `${index + 1} / ${total}`;
        this.updateOverlay();

        // Highlight active thumbnail
        document.querySelectorAll('.thumbnail').forEach((th, i) => {
            th.classList.toggle('active', i === index);
        });

        // Scroll thumbnail into view
        const activeTh = document.querySelector('.thumbnail.active');
        if (activeTh) {
            activeTh.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }

        // Update toggle select button text
        const isSelected = DicomHandler.selectedIndices.has(index);
        document.getElementById('btnToggleSelect').textContent = isSelected ? '⭐ Deseleccionar' : '⭐ Seleccionar corte';

        // Redraw ruler if active
        if (this.rulerStart && this.rulerEnd) {
            this.drawRuler();
        }
    },

    updateOverlay() {
        const info = DicomHandler.getPatientInfo();
        document.getElementById('overlayPatient').textContent = info.name;
        document.getElementById('overlayStudy').textContent = info.series;
        document.getElementById('overlayWL').textContent = `WC: ${DicomHandler.windowCenter} | WW: ${DicomHandler.windowWidth}`;
        document.getElementById('overlaySlice').textContent = `Corte: ${DicomHandler.currentIndex + 1} / ${DicomHandler.getTotalSlices()}`;
        document.getElementById('overlayModality').textContent = info.modality;

        // Redraw ruler/overlay if active
        if (this.rulerStart && this.rulerEnd) {
            this.drawRuler();
        }
    },

    // ===== RULER TOOL =====
    toggleRuler() {
        this.isRulerActive = !this.isRulerActive;
        const btn = document.getElementById('btnRuler');
        const container = document.getElementById('viewerContainer');
        const overlay = document.getElementById('measurementOverlay');

        if (this.isRulerActive) {
            btn.classList.add('active');
            container.classList.add('ruler-active');
            this.showToast('Regla activada: haz clic y arrastra para medir', 'info');
        } else {
            btn.classList.remove('active');
            container.classList.remove('ruler-active');
            overlay.style.display = 'none';
            this.rulerStart = null;
            this.rulerEnd = null;
            this.updateOverlay(); // Force redraw of slice
        }
    },

    handleRulerDown(e) {
        if (!this.isRulerActive) return;
        e.preventDefault();
        this.isDrawingRuler = true;
        const canvas = document.getElementById('dicomCanvas');
        const rect = canvas.getBoundingClientRect();
        this.rulerStart = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        this.rulerEnd = { ...this.rulerStart };
    },

    handleRulerMove(e) {
        if (!this.isRulerActive || !this.isDrawingRuler || !this.rulerStart) return;
        e.preventDefault();
        const canvas = document.getElementById('dicomCanvas');
        const rect = canvas.getBoundingClientRect();
        this.rulerEnd = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        this.drawRuler();
    },

    handleRulerUp() {
        this.isDrawingRuler = false;
    },

    drawRuler() {
        if (!this.rulerStart || !this.rulerEnd) return;

        // First, re-render the slice to clear previous ruler
        DicomHandler.renderCurrentSlice();

        const canvas = document.getElementById('dicomCanvas');
        const ctx = canvas.getContext('2d');

        // Map UI coordinates to canvas coordinates
        const canvasRect = canvas.getBoundingClientRect();
        const uiScaleX = canvas.width / canvasRect.width;
        const uiScaleY = canvas.height / canvasRect.height;

        const startX = this.rulerStart.x * uiScaleX;
        const startY = this.rulerStart.y * uiScaleY;
        const endX = this.rulerEnd.x * uiScaleX;
        const endY = this.rulerEnd.y * uiScaleY;

        // Draw line
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = '#58a6ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();

        // Draw endpoints
        ctx.fillStyle = '#58a6ff';
        ctx.setLineDash([]); // Reset for circles
        ctx.beginPath();
        ctx.arc(startX, startY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(endX, endY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Calculate physical distance
        const dx = (endX - startX);
        const dy = (endY - startY);
        const canvasPixelDist = Math.sqrt(dx * dx + dy * dy);

        const slice = DicomHandler.slices[DicomHandler.currentIndex];
        let distanceText = '---';

        if (slice && slice.pixelSpacing) {
            // Factor in the scale used to draw the image on the canvas
            // DicomHandler uses slice.cols and slice.rows
            const imageScale = Math.min(canvas.width / slice.cols, canvas.height / slice.rows);
            const dicomPixelDist = canvasPixelDist / imageScale;

            const mmPerPixel = slice.pixelSpacing[0];
            const mmDist = dicomPixelDist * mmPerPixel;

            distanceText = mmDist > 10 ? `${(mmDist / 10).toFixed(2)} cm` : `${mmDist.toFixed(1)} mm`;
        } else {
            distanceText = `${Math.round(canvasPixelDist)} px`;
        }

        // Update overlay
        const overlay = document.getElementById('measurementOverlay');
        overlay.textContent = distanceText;
        overlay.style.display = 'block';
    },

    // ===== THUMBNAILS =====
    generateThumbnails() {
        const container = document.getElementById('thumbnailScroll');
        container.innerHTML = '';
        const total = DicomHandler.getTotalSlices();

        // For large studies, only generate every Nth thumbnail
        const maxThumbnails = 100;
        const step = total > maxThumbnails ? Math.ceil(total / maxThumbnails) : 1;

        for (let i = 0; i < total; i += step) {
            const div = document.createElement('div');
            div.className = 'thumbnail';
            div.dataset.index = i;

            if (DicomHandler.isDicomMode()) {
                const thumbCanvas = DicomHandler.generateThumbnail(i, 72);
                div.appendChild(thumbCanvas);
            } else {
                // For regular images, create mini preview
                const img = document.createElement('img');
                img.src = URL.createObjectURL(DicomHandler.imageFiles[i]);
                div.appendChild(img);
            }

            div.addEventListener('click', () => {
                this.navigateToSlice(i);
            });

            if (i === 0) div.classList.add('active');
            container.appendChild(div);
        }
    },

    refreshThumbnails() {
        // Regenerate thumbnails with new W/L (for DICOM mode)
        if (DicomHandler.isDicomMode()) {
            const thumbnails = document.querySelectorAll('.thumbnail');
            thumbnails.forEach(th => {
                const idx = parseInt(th.dataset.index);
                const oldCanvas = th.querySelector('canvas');
                if (oldCanvas) {
                    const newCanvas = DicomHandler.generateThumbnail(idx, 72);
                    th.replaceChild(newCanvas, oldCanvas);
                }
            });
        }
    },

    updateThumbnailSelection() {
        document.querySelectorAll('.thumbnail').forEach(th => {
            const idx = parseInt(th.dataset.index);
            th.classList.toggle('selected', DicomHandler.selectedIndices.has(idx));
        });
    },

    // ===== SELECTION =====
    updateSelectionUI() {
        document.getElementById('selectedCount').textContent = DicomHandler.selectedIndices.size;
        this.updateGenerateButton();
    },

    updateGenerateButton() {
        const btn = document.getElementById('btnGenerate');
        const hasImages = DicomHandler.getTotalSlices() > 0;
        const hasSelection = DicomHandler.selectedIndices.size > 0;
        btn.disabled = !hasImages || !hasSelection || this.isGenerating;
    },

    // ===== REPORT GENERATION =====
    async generateReport() {
        if (this.isGenerating) return;

        if (!Config.hasApiKey()) {
            this.openConfig();
            this.showToast('Configura tu API Key de Gemini primero', 'warning');
            return;
        }

        this.isGenerating = true;
        const btn = document.getElementById('btnGenerate');
        btn.querySelector('.btn-content').style.display = 'none';
        btn.querySelector('.btn-loading').style.display = 'inline-flex';
        btn.disabled = true;

        const aiStatus = document.getElementById('aiStatus');
        aiStatus.style.display = 'block';

        try {
            // Get mode for optimization
            const mode = document.getElementById('analysisMode').value;
            let maxSize = 0;
            if (mode === 'detailed' || mode === 'total' || mode === 'smart') maxSize = 512;
            if (mode === 'full' || mode === 'ultrasmart' || mode === 'absolute') maxSize = 448; // Balanced for large/absolute sets

            // Get images
            this.updateAIProgress('Extrayendo cortes seleccionados...', 5);
            let images;
            if (mode === 'smart' || mode === 'ultrasmart' || mode === 'absolute') {
                images = await DicomHandler.getMultiWindowImages(maxSize);
            } else {
                images = await DicomHandler.getSelectedImagesAsBase64(maxSize);
            }

            // Get study type
            const studyType = document.getElementById('studyType').value;

            // Call AI
            const report = await AIEngine.analyzeImages(
                images,
                studyType,
                (msg, pct) => this.updateAIProgress(msg, pct)
            );

            // Show report
            ReportEditor.showReport(report);
            this.showToast('✅ Pre-informe generado. ¡Revísalo antes de usarlo!', 'success', 4000);

        } catch (error) {
            this.showToast(`❌ ${error.message}`, 'error', 6000);
        } finally {
            this.isGenerating = false;
            btn.querySelector('.btn-content').style.display = 'inline-flex';
            btn.querySelector('.btn-loading').style.display = 'none';
            btn.disabled = false;
            this.updateGenerateButton();

            // Hide progress after delay
            setTimeout(() => {
                aiStatus.style.display = 'none';
            }, 2000);
        }
    },

    updateAIProgress(text, percent) {
        document.getElementById('aiStatusText').textContent = text;
        document.getElementById('aiProgressBar').style.width = percent + '%';
    },

    // ===== SECTION REGENERATION =====
    async regenerateSection(section) {
        if (this.isGenerating) return;

        const currentReport = ReportEditor.getCurrentReport();
        if (!currentReport.hallazgos && !currentReport.tecnica) {
            this.showToast('No hay informe para regenerar. Genera uno primero.', 'warning');
            return;
        }

        this.isGenerating = true;
        const btn = document.querySelector(`.btn-regen[data-section="${section}"]`);
        btn.style.animation = 'spin 0.8s linear infinite';

        try {
            const studyType = document.getElementById('studyType').value;
            const newText = await AIEngine.regenerateSection(section, currentReport, studyType);
            ReportEditor.updateSection(section, newText);
            this.showToast(`Sección regenerada`, 'success', 2000);
        } catch (error) {
            this.showToast(`❌ ${error.message}`, 'error');
        } finally {
            this.isGenerating = false;
            btn.style.animation = '';
        }
    },

    // ===== EXPORT =====
    async copyReport() {
        const success = await ReportEditor.copyToClipboard();
        const feedback = document.getElementById('copyFeedback');
        if (success) {
            feedback.textContent = '✅ Copiado';
            this.showToast('Informe copiado al portapapeles', 'success', 2000);
        } else {
            feedback.textContent = '❌ Error';
            this.showToast('No se pudo copiar', 'error');
        }
        setTimeout(() => { feedback.textContent = ''; }, 3000);
    },

    exportReport() {
        const success = ReportEditor.exportToPDF();
        if (success) {
            this.showToast('Generando vista de impresión...', 'success', 2000);
        } else {
            this.showToast('No hay informe para exportar', 'warning');
        }
    },

    newStudy() {
        if (this.isGenerating) return;
        DicomHandler.reset();
        ReportEditor.clear();

        // Reset UI
        document.getElementById('uploadZone').style.display = 'flex';
        document.getElementById('viewerContainer').style.display = 'none';
        document.getElementById('thumbnailStrip').style.display = 'none';
        document.getElementById('sliceControls').style.display = 'none';
        document.getElementById('selectionControls').style.display = 'none';
        document.getElementById('aiStatus').style.display = 'none';
        document.getElementById('patientInfo').textContent = '';
        document.getElementById('sliceInfo').textContent = '';

        // Re-create upload zone content
        document.getElementById('uploadZone').innerHTML = `
            <div class="upload-content">
                <div class="upload-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </div>
                <h3>Arrastra una carpeta DICOM aquí</h3>
                <p>o usa los botones de abajo</p>
                <div class="upload-buttons">
                    <label class="btn btn-primary" for="dicomFolderInput">
                        📁 Seleccionar Carpeta DICOM
                    </label>
                    <label class="btn btn-secondary" for="imageFileInput">
                        🖼️ Subir Imágenes (PNG/JPG)
                    </label>
                </div>
            </div>
        `;

        // Reset file inputs
        document.getElementById('dicomFolderInput').value = '';
        document.getElementById('imageFileInput').value = '';

        this.updateGenerateButton();
    },

    // ===== CONFIG MODAL =====
    openConfig() {
        const config = Config.load();
        document.getElementById('apiKey').value = config.apiKey || '';
        document.getElementById('modelSelect').value = config.model || 'gemini-2.5-flash';
        document.getElementById('maxSlices').value = config.maxSlices || 12;
        document.getElementById('temperature').value = config.temperature || 0.2;
        document.getElementById('tempValue').textContent = config.temperature || 0.2;

        const studyType = document.getElementById('studyType').value;
        document.getElementById('systemPrompt').value = config.systemPrompt || Config.getDefaultPrompt(studyType);

        document.getElementById('configModal').style.display = 'flex';
    },

    closeConfig() {
        document.getElementById('configModal').style.display = 'none';
    },

    saveConfig() {
        const config = {
            apiKey: document.getElementById('apiKey').value.trim(),
            model: document.getElementById('modelSelect').value,
            maxSlices: parseInt(document.getElementById('maxSlices').value),
            temperature: parseFloat(document.getElementById('temperature').value),
            systemPrompt: document.getElementById('systemPrompt').value.trim()
        };
        Config.save(config);
        this.closeConfig();
        this.showToast('✅ Configuración guardada', 'success');
        this.updateGenerateButton();
    },

    loadConfig() {
        // Config is loaded lazily from localStorage
    },

    // ===== KNOWLEDGE MANAGEMENT =====
    exportKnowledge() {
        const lessons = Config.getLearningLessons();
        if (lessons.length === 0) {
            this.showToast('No hay lecciones guardadas para exportar', 'warning');
            return;
        }

        const data = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            lessons: lessons
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `radioassist_knowledge_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast('✅ Conocimientos exportados correctamente', 'success');
    },

    async importKnowledge(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (!data.lessons || !Array.isArray(data.lessons)) {
                throw new Error('El archivo no tiene el formato correcto.');
            }

            if (confirm(`¿Deseas importar ${data.lessons.length} lecciones? Esto sobrescribirá tus lecciones actuales.`)) {
                // Clear and add new
                Config.set('learningLessons', data.lessons);
                this.showToast(`✅ Se han importado ${data.lessons.length} lecciones con éxito`, 'success');
            }
        } catch (error) {
            this.showToast(`❌ Error al importar: ${error.message}`, 'error');
        } finally {
            event.target.value = ''; // Reset input
        }
    },

    clearKnowledge() {
        if (confirm('¿Estás seguro de que quieres borrar TODA la memoria de la IA? Esta acción no se puede deshacer.')) {
            Config.clearLearningLessons();
            this.showToast('🗑️ Memoria de la IA borrada', 'info');
        }
    },

    // ===== TEACH MODAL =====
    openTeach() {
        document.getElementById('teachModal').style.display = 'flex';
    },

    closeTeach() {
        document.getElementById('teachModal').style.display = 'none';
        document.getElementById('teachFinding').value = '';
        document.getElementById('teachCorrection').value = '';
    },

    handleTeachTypeChange(e) {
        const label = document.getElementById('teachFindingLabel');
        const type = e.target.value;
        if (type === 'omission') {
            label.textContent = 'Hallazgo omitido/no detectado:';
        } else if (type === 'error') {
            label.textContent = 'Hallazgo mal interpretado:';
        } else {
            label.textContent = 'Elemento a corregir:';
        }
    },

    saveLesson() {
        const type = document.getElementById('teachType').value;
        const finding = document.getElementById('teachFinding').value;
        const correction = document.getElementById('teachCorrection').value;

        if (!finding || !correction) {
            this.showToast('Por favor, rellena todos los campos', 'warning');
            return;
        }

        Config.addLearningLesson({ type, finding, correction });
        this.showToast('🧠 Lección guardada. La IA aprenderá de esto en el próximo estudio.', 'success');
        this.closeTeach();
    },

    // ===== TOAST NOTIFICATIONS =====
    showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
};

// ===== STARTUP =====
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
