/* ========================================
   RadioAssist — DICOM Handler
   Parses DICOM files, renders to canvas,
   manages slice navigation and selection
   ======================================== */

const DicomHandler = {
    slices: [],          // Array of parsed slice objects
    currentIndex: 0,
    selectedIndices: new Set(),
    canvas: null,
    ctx: null,
    windowCenter: 40,
    windowWidth: 400,
    patientName: '',
    patientId: '',
    modality: '',
    seriesDesc: '',
    imageFiles: [],      // For regular image mode

    init() {
        this.canvas = document.getElementById('dicomCanvas');
        this.ctx = this.canvas.getContext('2d');
    },

    reset() {
        this.slices = [];
        this.currentIndex = 0;
        this.selectedIndices.clear();
        this.patientName = '';
        this.patientId = '';
        this.modality = '';
        this.seriesDesc = '';
        this.imageFiles = [];
    },

    // ===== DICOM FILE LOADING =====
    async loadDicomFiles(files) {
        this.reset();
        const dicomFiles = [];

        // Filter for DICOM files (no extension or .dcm)
        for (const file of files) {
            const name = file.name.toLowerCase();
            // Accept .dcm files, files without extension, or any file that might be DICOM
            if (name.endsWith('.dcm') || !name.includes('.') ||
                name.endsWith('.ima') || name.endsWith('.dicom')) {
                dicomFiles.push(file);
            }
        }

        // If no obvious DICOM files found, try all files
        const filesToParse = dicomFiles.length > 0 ? dicomFiles : Array.from(files);

        let parsed = 0;
        const total = filesToParse.length;

        for (const file of filesToParse) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const byteArray = new Uint8Array(arrayBuffer);
                const dataSet = dicomParser.parseDicom(byteArray);
                const slice = this.extractSliceData(dataSet, byteArray);
                if (slice) {
                    this.slices.push(slice);
                }
            } catch (e) {
                // Not a valid DICOM file, skip silently
            }
            parsed++;
            if (parsed % 10 === 0 || parsed === total) {
                App.updateLoadProgress(parsed, total);
            }
        }

        if (this.slices.length === 0) {
            throw new Error('No se encontraron archivos DICOM válidos en la carpeta seleccionada.');
        }

        // Sort slices by instance number or image position
        this.slices.sort((a, b) => {
            if (a.sliceLocation !== null && b.sliceLocation !== null) {
                return a.sliceLocation - b.sliceLocation;
            }
            return a.instanceNumber - b.instanceNumber;
        });

        // Extract patient info from first slice
        const first = this.slices[0];
        this.patientName = first.patientName || 'Desconocido';
        this.patientId = first.patientId || '';
        this.modality = first.modality || 'CT';
        this.seriesDesc = first.seriesDesc || '';
        this.windowCenter = first.windowCenter || 40;
        this.windowWidth = first.windowWidth || 400;

        // Render first slice
        this.currentIndex = 0;
        this.renderCurrentSlice();

        return this.slices.length;
    },

    extractSliceData(dataSet, byteArray) {
        try {
            const rows = dataSet.uint16('x00280010');
            const cols = dataSet.uint16('x00280011');

            if (!rows || !cols) return null;

            const bitsAllocated = dataSet.uint16('x00280100') || 16;
            const bitsStored = dataSet.uint16('x00280101') || bitsAllocated;
            const pixelRep = dataSet.uint16('x00280103') || 0;
            const samplesPerPixel = dataSet.uint16('x00280002') || 1;
            const rescaleIntercept = parseFloat(dataSet.string('x00281052')) || 0;
            const rescaleSlope = parseFloat(dataSet.string('x00281053')) || 1;
            const windowCenter = parseFloat(dataSet.string('x00281050')) || 40;
            const windowWidth = parseFloat(dataSet.string('x00281051')) || 400;
            const instanceNumber = dataSet.intString('x00200013') || 0;

            // Slice location for sorting
            let sliceLocation = null;
            const sliceLocStr = dataSet.string('x00201041');
            if (sliceLocStr) {
                sliceLocation = parseFloat(sliceLocStr);
            } else {
                const imgPosStr = dataSet.string('x00200032');
                if (imgPosStr) {
                    const parts = imgPosStr.split('\\');
                    if (parts.length >= 3) {
                        sliceLocation = parseFloat(parts[2]);
                    }
                }
            }

            // Patient info
            const patientName = dataSet.string('x00100010') || '';
            const patientId = dataSet.string('x00100020') || '';
            const modality = dataSet.string('x00080060') || 'CT';
            const seriesDesc = dataSet.string('x0008103e') || '';
            const bodyPart = dataSet.string('x00180015') || '';
            const studyDesc = dataSet.string('x00081030') || '';

            // Calibration metadata
            let pixelSpacing = null;
            const spacingStr = dataSet.string('x00280030');
            if (spacingStr) {
                const parts = spacingStr.split('\\');
                if (parts.length >= 2) {
                    pixelSpacing = [parseFloat(parts[0]), parseFloat(parts[1])];
                }
            }
            const sliceThickness = parseFloat(dataSet.string('x00180050')) || null;

            // Extract pixel data
            const pixelDataElement = dataSet.elements.x7fe00010;
            if (!pixelDataElement) return null;

            let pixelData;
            if (bitsAllocated === 16) {
                if (pixelRep === 1) {
                    // Signed
                    pixelData = new Int16Array(
                        byteArray.buffer,
                        pixelDataElement.dataOffset,
                        pixelDataElement.length / 2
                    );
                } else {
                    // Unsigned
                    pixelData = new Uint16Array(
                        byteArray.buffer,
                        pixelDataElement.dataOffset,
                        pixelDataElement.length / 2
                    );
                }
            } else if (bitsAllocated === 8) {
                pixelData = new Uint8Array(
                    byteArray.buffer,
                    pixelDataElement.dataOffset,
                    pixelDataElement.length
                );
            } else {
                return null; // Unsupported bit depth
            }

            return {
                rows, cols, pixelData, bitsAllocated, bitsStored,
                rescaleIntercept, rescaleSlope, windowCenter, windowWidth,
                instanceNumber, sliceLocation, samplesPerPixel,
                patientName, patientId, modality, seriesDesc,
                pixelSpacing, sliceThickness, bodyPart, studyDesc
            };
        } catch (e) {
            return null;
        }
    },

    // ===== REGULAR IMAGE LOADING =====
    async loadImageFiles(files) {
        this.reset();
        this.imageFiles = [];

        for (const file of files) {
            if (file.type.startsWith('image/')) {
                this.imageFiles.push(file);
            }
        }

        if (this.imageFiles.length === 0) {
            throw new Error('No se encontraron archivos de imagen válidos.');
        }

        // Load first image
        this.currentIndex = 0;
        await this.renderImageFile(0);

        return this.imageFiles.length;
    },

    async renderImageFile(index) {
        return new Promise((resolve, reject) => {
            const file = this.imageFiles[index];
            const img = new Image();
            img.onload = () => {
                this.canvas.width = img.naturalWidth;
                this.canvas.height = img.naturalHeight;
                this.ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(img.src);
                resolve();
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    },

    // ===== RENDERING =====
    renderCurrentSlice() {
        if (this.isDicomMode()) {
            this.renderDicomSlice(this.currentIndex);
        } else if (this.imageFiles.length > 0) {
            this.renderImageFile(this.currentIndex);
        }
    },

    renderDicomSlice(index) {
        const slice = this.slices[index];
        if (!slice) return;

        this.canvas.width = slice.cols;
        this.canvas.height = slice.rows;
        const imageData = this.ctx.createImageData(slice.cols, slice.rows);

        const wc = this.windowCenter;
        const ww = this.windowWidth;
        const minVal = wc - ww / 2;
        const maxVal = wc + ww / 2;
        const slope = slice.rescaleSlope;
        const intercept = slice.rescaleIntercept;

        const pixels = slice.pixelData;
        const data = imageData.data;

        if (slice.samplesPerPixel === 1) {
            // Grayscale
            for (let i = 0; i < pixels.length; i++) {
                // Apply rescale to get Hounsfield units
                let hu = pixels[i] * slope + intercept;

                // Apply window/level
                let normalized;
                if (hu <= minVal) normalized = 0;
                else if (hu >= maxVal) normalized = 255;
                else normalized = ((hu - minVal) / ww) * 255;

                const byte = Math.round(normalized);
                const j = i * 4;
                data[j] = byte;     // R
                data[j + 1] = byte; // G
                data[j + 2] = byte; // B
                data[j + 3] = 255;  // A
            }
        } else {
            // RGB or similar - just copy
            const expectedPixels = slice.rows * slice.cols;
            for (let i = 0; i < expectedPixels; i++) {
                const si = i * slice.samplesPerPixel;
                const j = i * 4;
                data[j] = pixels[si] || 0;
                data[j + 1] = pixels[si + 1] || 0;
                data[j + 2] = pixels[si + 2] || 0;
                data[j + 3] = 255;
            }
        }

        this.ctx.putImageData(imageData, 0, 0);
    },

    // ===== NAVIGATION =====
    goToSlice(index) {
        const max = this.getTotalSlices() - 1;
        this.currentIndex = Math.max(0, Math.min(index, max));
        this.renderCurrentSlice();
        return this.currentIndex;
    },

    nextSlice() {
        return this.goToSlice(this.currentIndex + 1);
    },

    prevSlice() {
        return this.goToSlice(this.currentIndex - 1);
    },

    // ===== WINDOW/LEVEL =====
    setWindowLevel(wc, ww) {
        this.windowCenter = wc;
        this.windowWidth = ww;
        if (this.isDicomMode()) {
            this.renderCurrentSlice();
        }
    },

    // ===== SELECTION =====
    toggleSelection(index) {
        if (index === undefined) index = this.currentIndex;
        if (this.selectedIndices.has(index)) {
            this.selectedIndices.delete(index);
        } else {
            this.selectedIndices.add(index);
        }
        return this.selectedIndices.has(index);
    },

    autoSelectSlices(maxSlices) {
        this.selectedIndices.clear();
        const total = this.getTotalSlices();
        const count = Math.min(maxSlices || 12, total);

        if (total <= count) {
            // Select all
            for (let i = 0; i < total; i++) {
                this.selectedIndices.add(i);
            }
        } else {
            // Evenly distributed selection, always include first and last
            this.selectedIndices.add(0);
            this.selectedIndices.add(total - 1);

            const step = (total - 1) / (count - 1);
            for (let i = 1; i < count - 1; i++) {
                this.selectedIndices.add(Math.round(i * step));
            }
        }

        return this.selectedIndices.size;
    },

    clearSelection() {
        this.selectedIndices.clear();
    },

    // ===== EXPORT FOR AI =====
    async getSelectedImagesAsBase64(maxSize = 0) {
        const images = [];
        const indices = this.selectedIndices.size > 0
            ? Array.from(this.selectedIndices).sort((a, b) => a - b)
            : [this.currentIndex]; // If no selection, use current slice

        for (const idx of indices) {
            // Render the slice to canvas
            const prevIndex = this.currentIndex;
            this.currentIndex = idx;
            this.renderCurrentSlice();

            // Wait a tick for rendering
            await new Promise(r => setTimeout(r, 10));

            let dataUrl;

            // Resize if needed
            if (maxSize > 0 && (this.canvas.width > maxSize || this.canvas.height > maxSize)) {
                const scale = Math.min(maxSize / this.canvas.width, maxSize / this.canvas.height);
                const w = Math.floor(this.canvas.width * scale);
                const h = Math.floor(this.canvas.height * scale);

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = w;
                tempCanvas.height = h;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(this.canvas, 0, 0, w, h);

                // Use lower quality if we are sending many images
                let quality = 0.8;
                if (indices.length > 600) quality = 0.3; // Very aggressive for massive loads
                else if (indices.length > 300) quality = 0.5;
                else if (indices.length > 150) quality = 0.6;
                else if (indices.length > 80) quality = 0.7;

                dataUrl = tempCanvas.toDataURL('image/jpeg', quality);
            } else {
                dataUrl = this.canvas.toDataURL('image/png');
            }

            const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');

            // Calculate real-world scale if possible
            let calibration = null;
            const slice = this.slices[idx];
            if (slice && slice.pixelSpacing) {
                const drawScale = maxSize > 0
                    ? Math.min(maxSize / this.canvas.width, maxSize / this.canvas.height)
                    : 1;

                calibration = {
                    mmPerPixel: [
                        slice.pixelSpacing[0] / drawScale,
                        slice.pixelSpacing[1] / drawScale
                    ],
                    sliceThickness: slice.sliceThickness
                };
            }

            images.push({
                index: idx,
                base64: base64,
                mimeType: maxSize > 0 ? 'image/jpeg' : 'image/png',
                calibration: calibration,
                width: maxSize > 0 ? Math.floor(this.canvas.width * (maxSize / Math.max(this.canvas.width, this.canvas.height))) : this.canvas.width,
                height: maxSize > 0 ? Math.floor(this.canvas.height * (maxSize / Math.max(this.canvas.width, this.canvas.height))) : this.canvas.height
            });
        }

        // Restore current view
        this.currentIndex = this.slices.length > 0 ? this.currentIndex : 0;
        return images;
    },

    // ===== MULTI-WINDOW EXPORT =====
    async getMultiWindowImages(maxSize = 512) {
        const images = [];
        const indices = this.selectedIndices.size > 0
            ? Array.from(this.selectedIndices).sort((a, b) => a - b)
            : [this.currentIndex];

        // Preservation of original settings
        const origWC = this.windowCenter;
        const origWW = this.windowWidth;

        const windows = [
            { name: 'Abdomen', wc: 40, ww: 400 },
            { name: 'Pulmón', wc: -600, ww: 1500 },
            { name: 'Hueso', wc: 300, ww: 1500 }
        ];

        for (const idx of indices) {
            this.currentIndex = idx;

            for (const win of windows) {
                // Apply window
                this.windowCenter = win.wc;
                this.windowWidth = win.ww;
                this.renderCurrentSlice();

                // Wait a tick for rendering
                await new Promise(r => setTimeout(r, 10));

                let dataUrl;
                const scale = Math.min(maxSize / this.canvas.width, maxSize / this.canvas.height);
                const w = Math.floor(this.canvas.width * scale);
                const h = Math.floor(this.canvas.height * scale);

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = w;
                tempCanvas.height = h;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(this.canvas, 0, 0, w, h);

                // JPEG with decent compression for large multi-window sets
                dataUrl = tempCanvas.toDataURL('image/jpeg', 0.7);

                const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');

                // Calculate real-world scale if possible
                let calibration = null;
                const slice = this.slices[idx];
                if (slice && slice.pixelSpacing) {
                    const drawScale = Math.min(maxSize / this.canvas.width, maxSize / this.canvas.height);
                    calibration = {
                        mmPerPixel: [
                            slice.pixelSpacing[0] / drawScale,
                            slice.pixelSpacing[1] / drawScale
                        ],
                        sliceThickness: slice.sliceThickness
                    };
                }

                images.push({
                    index: idx,
                    window: win.name,
                    base64: base64,
                    mimeType: 'image/jpeg',
                    calibration: calibration,
                    width: w,
                    height: h
                });
            }
        }

        // Restore original settings
        this.windowCenter = origWC;
        this.windowWidth = origWW;
        this.renderCurrentSlice();

        return images;
    },

    // ===== THUMBNAIL GENERATION =====
    generateThumbnail(index, size = 72) {
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = size;
        thumbCanvas.height = size;
        const thumbCtx = thumbCanvas.getContext('2d');

        if (this.isDicomMode()) {
            // Render slice to a temp canvas, then scale
            const slice = this.slices[index];
            if (!slice) return thumbCanvas;

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = slice.cols;
            tempCanvas.height = slice.rows;
            const tempCtx = tempCanvas.getContext('2d');
            const imageData = tempCtx.createImageData(slice.cols, slice.rows);

            const wc = this.windowCenter;
            const ww = this.windowWidth;
            const minVal = wc - ww / 2;
            const maxVal = wc + ww / 2;

            for (let i = 0; i < slice.pixelData.length; i++) {
                let hu = slice.pixelData[i] * slice.rescaleSlope + slice.rescaleIntercept;
                let normalized;
                if (hu <= minVal) normalized = 0;
                else if (hu >= maxVal) normalized = 255;
                else normalized = ((hu - minVal) / ww) * 255;

                const j = i * 4;
                const byte = Math.round(normalized);
                imageData.data[j] = byte;
                imageData.data[j + 1] = byte;
                imageData.data[j + 2] = byte;
                imageData.data[j + 3] = 255;
            }

            tempCtx.putImageData(imageData, 0, 0);

            // Scale to thumbnail
            const scale = Math.min(size / slice.cols, size / slice.rows);
            const sw = slice.cols * scale;
            const sh = slice.rows * scale;
            thumbCtx.drawImage(tempCanvas, (size - sw) / 2, (size - sh) / 2, sw, sh);
        }

        return thumbCanvas;
    },

    // ===== HELPERS =====
    isDicomMode() {
        return this.slices.length > 0;
    },

    getTotalSlices() {
        return this.isDicomMode() ? this.slices.length : this.imageFiles.length;
    },

    getPatientInfo() {
        return {
            name: this.patientName,
            id: this.patientId,
            modality: this.modality,
            series: this.seriesDesc,
            bodyPart: this.slices[0]?.bodyPart || '',
            studyDesc: this.slices[0]?.studyDesc || ''
        };
    }
};
