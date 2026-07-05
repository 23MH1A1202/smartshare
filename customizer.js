// customizer.js
import { db, doc, getDoc, setDoc } from './firebase.js';

const DEFAULTS = {
    accentColor: '#14b8a6',
    panelOpacity: 70, // 70% (reduced transparency as requested)
    panelBlur: 40,    // 40px
    inputOpacity: 75, // 75% (reduced transparency as requested)
    inputBlur: 20,    // 20px
    dropOpacity: 65,  // 65% (reduced transparency as requested)
    dropBlur: 15,     // 15px
    lightCardBase: '255, 255, 255', // White base
    darkCardBase: '27, 48, 34'      // Deep emerald base
};

let config = { ...DEFAULTS };

// 1. Core Preset Definitions
export const PRESETS = {
    teal: {
        accentColor: '#14b8a6',
        lightCardBase: '255, 255, 255',
        darkCardBase: '27, 48, 34'
    },
    emerald: {
        accentColor: '#10b981',
        lightCardBase: '240, 253, 250',
        darkCardBase: '6, 78, 59'
    },
    indigo: {
        accentColor: '#6366f1',
        lightCardBase: '240, 244, 255',
        darkCardBase: '30, 41, 59'
    },
    violet: {
        accentColor: '#8b5cf6',
        lightCardBase: '250, 245, 255',
        darkCardBase: '24, 24, 27'
    },
    amber: {
        accentColor: '#f59e0b',
        lightCardBase: '255, 251, 235',
        darkCardBase: '69, 26, 3'
    },
    rose: {
        accentColor: '#f43f5e',
        lightCardBase: '255, 241, 242',
        darkCardBase: '76, 5, 25'
    }
};

// Helper: Hex to RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

// Helper: Adjust Brightness
function adjustColorBrightness(hex, percent) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const r = Math.min(255, Math.max(0, rgb.r + percent));
    const g = Math.min(255, Math.max(0, rgb.g + percent));
    const b = Math.min(255, Math.max(0, rgb.b + percent));
    const toHex = (c) => {
        const h = c.toString(16);
        return h.length === 1 ? '0' + h : h;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// 2. Load stored theme configuration (Immediate from local storage, then fetch remote from Firestore)
export function loadAndApplyStyles() {
    const stored = localStorage.getItem('smartshare_custom_style');
    if (stored) {
        try {
            config = { ...DEFAULTS, ...JSON.parse(stored) };
        } catch (e) {
            console.error("Failed to parse stored styles:", e);
            config = { ...DEFAULTS };
        }
    } else {
        config = { ...DEFAULTS };
    }

    applyStylesToRoot();

    // Fetch the latest global settings from Firestore so they apply to all users globally
    fetchGlobalStyles();
}

async function fetchGlobalStyles() {
    try {
        const docRef = doc(db, 'settings', 'style');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const remoteConfig = docSnap.data();
            let updated = false;
            for (const key of Object.keys(DEFAULTS)) {
                if (remoteConfig[key] !== undefined && remoteConfig[key] !== config[key]) {
                    config[key] = remoteConfig[key];
                    updated = true;
                }
            }
            if (updated) {
                localStorage.setItem('smartshare_custom_style', JSON.stringify(config));
                applyStylesToRoot();
                
                // If the inputs of style panel exist, refresh them
                const picker = document.getElementById('custom-color-picker');
                if (picker) {
                    setupSlidersAndPickersFromConfig();
                }
            }
        } else {
            // First time loading - seed Firestore with current styling so it exists globally
            await setDoc(docRef, config);
        }
    } catch (err) {
        console.warn("Could not fetch global styles from database (normal when offline):", err);
    }
}

// 3. Apply settings to document root CSS properties
function applyStylesToRoot() {
    const root = document.documentElement;
    const accent = config.accentColor;
    const hoverColor = adjustColorBrightness(accent, -25);
    const rgbAccent = hexToRgb(accent) || { r: 20, g: 184, b: 166 };

    // Accent Properties
    root.style.setProperty('--theme-accent-color', accent);
    root.style.setProperty('--theme-accent-color-hover', hoverColor);
    root.style.setProperty('--theme-accent-glow', `rgba(${rgbAccent.r}, ${rgbAccent.g}, ${rgbAccent.b}, 0.25)`);

    // Glass Panels
    root.style.setProperty('--panel-bg-light', `rgba(${config.lightCardBase}, ${config.panelOpacity / 100})`);
    root.style.setProperty('--panel-blur-light', `${config.panelBlur}px`);
    root.style.setProperty('--panel-bg-dark', `rgba(${config.darkCardBase}, ${config.panelOpacity / 100})`);
    root.style.setProperty('--panel-blur-dark', `${config.panelBlur}px`);

    // Inputs
    root.style.setProperty('--input-bg-light', `rgba(${config.lightCardBase}, ${config.inputOpacity / 100})`);
    root.style.setProperty('--input-blur-light', `${config.inputBlur}px`);
    root.style.setProperty('--input-bg-dark', `rgba(${config.darkCardBase}, ${config.inputOpacity / 100})`);
    root.style.setProperty('--input-blur-dark', `${config.inputBlur}px`);

    // Drop Zone
    root.style.setProperty('--drop-bg-light', `rgba(${config.lightCardBase}, ${config.dropOpacity / 100})`);
    root.style.setProperty('--drop-blur-light', `${config.dropBlur}px`);
    root.style.setProperty('--drop-bg-dark', `rgba(${config.darkCardBase}, ${config.dropOpacity / 100})`);
    root.style.setProperty('--drop-blur-dark', `${config.dropBlur}px`);
}

// 4. Initialize Admin Controls panel events
export function initAdminStyleControls() {
    const selectPreset = (presetName) => {
        const preset = PRESETS[presetName];
        if (!preset) return;

        config.accentColor = preset.accentColor;
        config.lightCardBase = preset.lightCardBase;
        config.darkCardBase = preset.darkCardBase;

        // Sync inputs
        const colorPicker = document.getElementById('custom-color-picker');
        const colorText = document.getElementById('custom-color-text');
        if (colorPicker) colorPicker.value = preset.accentColor;
        if (colorText) colorText.value = preset.accentColor;

        // Update active class on preset buttons
        document.querySelectorAll('.preset-btn').forEach(btn => {
            if (btn.dataset.preset === presetName) {
                btn.classList.add('border-teal-500', 'bg-teal-500/10', 'scale-[1.02]');
            } else {
                btn.classList.remove('border-teal-500', 'bg-teal-500/10', 'scale-[1.02]');
            }
        });

        applyStylesToRoot();
        updateDemoPreview();
    };

    // Attach presets events
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectPreset(btn.dataset.preset);
        });
    });

    // Color picker events
    const picker = document.getElementById('custom-color-picker');
    const colorText = document.getElementById('custom-color-text');

    if (picker) {
        picker.addEventListener('input', (e) => {
            const hex = e.target.value;
            config.accentColor = hex;
            if (colorText) colorText.value = hex;
            
            // Remove preset active classes since custom is chosen
            document.querySelectorAll('.preset-btn').forEach(b => {
                b.classList.remove('border-teal-500', 'bg-teal-500/10', 'scale-[1.02]');
            });

            applyStylesToRoot();
            updateDemoPreview();
        });
    }

    if (colorText) {
        colorText.addEventListener('input', (e) => {
            let val = e.target.value.trim();
            if (val.length === 7 && val.startsWith('#')) {
                config.accentColor = val;
                if (picker) picker.value = val;
                applyStylesToRoot();
                updateDemoPreview();
            }
        });
    }

    // Slider Event Helper
    const setupSlider = (sliderId, configKey, labelId, suffix = '') => {
        const slider = document.getElementById(sliderId);
        const label = document.getElementById(labelId);
        if (!slider) return;

        // Init values
        slider.value = config[configKey];
        if (label) label.innerText = config[configKey] + suffix;

        slider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            config[configKey] = val;
            if (label) label.innerText = val + suffix;
            applyStylesToRoot();
            updateDemoPreview();
        });
    };

    setupSlider('slider-panel-opacity', 'panelOpacity', 'label-panel-opacity', '%');
    setupSlider('slider-input-opacity', 'inputOpacity', 'label-input-opacity', '%');
    setupSlider('slider-drop-opacity', 'dropOpacity', 'label-drop-opacity', '%');

    setupSlider('slider-panel-blur', 'panelBlur', 'label-panel-blur', 'px');
    setupSlider('slider-input-blur', 'inputBlur', 'label-input-blur', 'px');
    setupSlider('slider-drop-blur', 'dropBlur', 'label-drop-blur', 'px');

    // --- Admin Authentication Panel logic ---
    const authContainer = document.getElementById('admin-auth-container');
    const controlsContainer = document.getElementById('admin-customizer-controls');
    const passwordInput = document.getElementById('admin-password-input');
    const loginBtn = document.getElementById('admin-login-btn');

    const checkAuthenticationState = () => {
        if (!authContainer || !controlsContainer) return;
        const isAuth = sessionStorage.getItem('smartshare_admin_authenticated') === 'true';
        if (isAuth) {
            authContainer.classList.add('hidden');
            controlsContainer.classList.remove('hidden');
            setupSlidersAndPickersFromConfig();
        } else {
            authContainer.classList.remove('hidden');
            controlsContainer.classList.add('hidden');
        }
    };

    const attemptUnlock = () => {
        if (!passwordInput) return;
        const password = passwordInput.value.trim();
        if (password === 'Sagar@2026') {
            sessionStorage.setItem('smartshare_admin_authenticated', 'true');
            checkAuthenticationState();
            import('./ui.js').then(module => {
                module.showToast("Admin access granted successfully!", "success");
            });
        } else {
            import('./ui.js').then(module => {
                module.showToast("Invalid admin password. Please try again.", "error");
            });
            passwordInput.value = '';
            passwordInput.focus();
        }
    };

    if (loginBtn) {
        loginBtn.addEventListener('click', attemptUnlock);
    }
    if (passwordInput) {
        passwordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                attemptUnlock();
            }
        });
    }

    // Call check initial state immediately
    checkAuthenticationState();

    // Action buttons
    const btnSave = document.getElementById('btn-save-style');
    const btnReset = document.getElementById('btn-reset-style');

    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            btnSave.disabled = true;
            const originalHTML = btnSave.innerHTML;
            btnSave.innerHTML = `
                <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Publishing...
            `;
            try {
                // 1. Save locally
                localStorage.setItem('smartshare_custom_style', JSON.stringify(config));
                
                // 2. Publish to Firestore for all users
                const docRef = doc(db, 'settings', 'style');
                await setDoc(docRef, config);

                import('./ui.js').then(module => {
                    module.showToast("Styles published globally to all visitors successfully!", "success");
                }).catch(() => {
                    alert("Styles published globally successfully!");
                });
            } catch (err) {
                console.error("Failed to save styles globally to Firestore:", err);
                import('./ui.js').then(module => {
                    module.showToast("Saved locally, but database publish failed: " + err.message, "error");
                });
            } finally {
                btnSave.disabled = false;
                btnSave.innerHTML = originalHTML;
            }
        });
    }

    if (btnReset) {
        btnReset.addEventListener('click', async () => {
            if (confirm("Are you sure you want to restore all style settings to defaults globally?")) {
                btnReset.disabled = true;
                const originalHTML = btnReset.innerHTML;
                btnReset.innerHTML = "Restoring...";
                try {
                    localStorage.removeItem('smartshare_custom_style');
                    config = { ...DEFAULTS };
                    applyStylesToRoot();
                    
                    // Reset inputs UI
                    setupSlidersAndPickersFromConfig();
                    
                    // Clear active presets
                    document.querySelectorAll('.preset-btn').forEach(b => {
                        b.classList.remove('border-teal-500', 'bg-teal-500/10', 'scale-[1.02]');
                    });
                    
                    // Select default teal
                    selectPreset('teal');

                    // Publish default back to Firestore
                    const docRef = doc(db, 'settings', 'style');
                    await setDoc(docRef, DEFAULTS);

                    import('./ui.js').then(module => {
                        module.showToast("Restored all styles to defaults globally.", "success");
                    });
                } catch (err) {
                    console.error("Failed to reset style globally:", err);
                    import('./ui.js').then(module => {
                        module.showToast("Failed to reset global style: " + err.message, "error");
                    });
                } finally {
                    btnReset.disabled = false;
                    btnReset.innerHTML = originalHTML;
                }
            }
        });
    }

    // Set initial UI state matching loaded config
    setupSlidersAndPickersFromConfig();
}

function setupSlidersAndPickersFromConfig() {
    const picker = document.getElementById('custom-color-picker');
    const colorText = document.getElementById('custom-color-text');
    if (picker) picker.value = config.accentColor;
    if (colorText) colorText.value = config.accentColor;

    const setSliderVal = (sliderId, labelId, val, suffix = '') => {
        const slider = document.getElementById(sliderId);
        const label = document.getElementById(labelId);
        if (slider) slider.value = val;
        if (label) label.innerText = val + suffix;
    };

    setSliderVal('slider-panel-opacity', 'label-panel-opacity', config.panelOpacity, '%');
    setSliderVal('slider-input-opacity', 'label-input-opacity', config.inputOpacity, '%');
    setSliderVal('slider-drop-opacity', 'label-drop-opacity', config.dropOpacity, '%');

    setSliderVal('slider-panel-blur', 'label-panel-blur', config.panelBlur, 'px');
    setSliderVal('slider-input-blur', 'label-input-blur', config.inputBlur, 'px');
    setSliderVal('slider-drop-blur', 'label-drop-blur', config.dropBlur, 'px');

    // Highlight preset if matching
    let matchedPreset = null;
    for (const [name, preset] of Object.entries(PRESETS)) {
        if (preset.accentColor.toLowerCase() === config.accentColor.toLowerCase()) {
            matchedPreset = name;
            break;
        }
    }

    document.querySelectorAll('.preset-btn').forEach(b => {
        if (matchedPreset && b.dataset.preset === matchedPreset) {
            b.classList.add('border-teal-500', 'bg-teal-500/10', 'scale-[1.02]');
        } else {
            b.classList.remove('border-teal-500', 'bg-teal-500/10', 'scale-[1.02]');
        }
    });

    updateDemoPreview();
}

// 5. Update Sandbox demo elements visually to show precise feedback
function updateDemoPreview() {
    const card = document.getElementById('demo-card-preview');
    const input = document.getElementById('demo-input-preview');
    const drop = document.getElementById('demo-drop-preview');
    const btn = document.getElementById('demo-btn-preview');
    const accIcon = document.getElementById('demo-accent-icon');
    const accBlob = document.getElementById('demo-accent-blob');
    const dropIcon = document.getElementById('demo-drop-icon');

    if (!card) return;

    // Apply color accent to buttons & preview items
    const accent = config.accentColor;
    const hoverAccent = adjustColorBrightness(accent, -25);

    if (btn) {
        btn.style.backgroundColor = accent;
        btn.style.boxShadow = `0 4px 12px rgba(${hexToRgb(accent)?.r || 20}, ${hexToRgb(accent)?.g || 184}, ${hexToRgb(accent)?.b || 166}, 0.2)`;
    }

    if (accIcon) {
        accIcon.style.color = accent;
    }

    if (accBlob) {
        accBlob.style.backgroundColor = accent;
    }

    if (dropIcon) {
        dropIcon.style.color = accent;
    }
}
