// customizer.js
import { db, doc, getDoc, setDoc } from './firebase.js';

const DEFAULTS = {
    accentColor: '#0d9488',
    secondaryColor: '#2dd4bf',
    panelOpacity: 70, // 70%
    panelBlur: 40,    // 40px
    inputOpacity: 75, // 75%
    inputBlur: 20,    // 20px
    dropOpacity: 65,  // 65%
    dropBlur: 15,     // 15px
    lightCardBase: '255, 255, 255', // White base
    darkCardBase: '12, 45, 39',      // Deep jade base
    lightBgColor: '#f0fdfa',
    darkBgColor: '#041a16',
    lightCardColor: '#FFFFFF',
    darkCardColor: '#0c2d27'
};

let config = { ...DEFAULTS };

// 1. Core Preset Definitions with complete color palette customization
export const PRESETS = {
    teal: {
        accentColor: '#0f766e',
        secondaryColor: '#2dd4bf',
        lightCardBase: '255, 255, 255',
        darkCardBase: '12, 45, 39',
        lightBgColor: '#f0fdfa',
        darkBgColor: '#041a16',
        lightCardColor: '#FFFFFF',
        darkCardColor: '#0c2d27'
    },
    emerald: {
        accentColor: '#064e3b',
        secondaryColor: '#34d399',
        lightCardBase: '255, 255, 255',
        darkCardBase: '6, 78, 59',
        lightBgColor: '#f0fdf4',
        darkBgColor: '#022c22',
        lightCardColor: '#FFFFFF',
        darkCardColor: '#064e3b'
    },
    nordic: {
        accentColor: '#2f5233',
        secondaryColor: '#f28482',
        lightCardBase: '255, 255, 255',
        darkCardBase: '28, 42, 30',
        lightBgColor: '#F4F6F0',
        darkBgColor: '#1C2A1E',
        lightCardColor: '#FFFFFF',
        darkCardColor: '#1C2A1E'
    },
    royal: {
        accentColor: '#312e81',
        secondaryColor: '#f59e0b',
        lightCardBase: '255, 255, 255',
        darkCardBase: '30, 41, 59',
        lightBgColor: '#f5f3ff',
        darkBgColor: '#0f172a',
        lightCardColor: '#FFFFFF',
        darkCardColor: '#1e293b'
    },
    orchid: {
        accentColor: '#581c87',
        secondaryColor: '#f472b6',
        lightCardBase: '255, 255, 255',
        darkCardBase: '24, 24, 27',
        lightBgColor: '#faf5ff',
        darkBgColor: '#0a0410',
        lightCardColor: '#FFFFFF',
        darkCardColor: '#1c0d28'
    },
    cyber: {
        accentColor: '#8b5cf6',
        secondaryColor: '#06b6d4',
        lightCardBase: '255, 255, 255',
        darkCardBase: '24, 24, 27',
        lightBgColor: '#fafaf9',
        darkBgColor: '#09090b',
        lightCardColor: '#FFFFFF',
        darkCardColor: '#18181b'
    },
    sunset: {
        accentColor: '#3f3f46',
        secondaryColor: '#f43f5e',
        lightCardBase: '255, 255, 255',
        darkCardBase: '30, 30, 36',
        lightBgColor: '#fbfaf7',
        darkBgColor: '#121214',
        lightCardColor: '#FFFFFF',
        darkCardColor: '#1e1e24'
    },
    sapphire: {
        accentColor: '#1e3a8a',
        secondaryColor: '#38bdf8',
        lightCardBase: '255, 255, 255',
        darkCardBase: '17, 24, 39',
        lightBgColor: '#f0f9ff',
        darkBgColor: '#030712',
        lightCardColor: '#FFFFFF',
        darkCardColor: '#111827'
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

// Helper: Convert hex to comma separated RGB
function hexToRgbComma(hex) {
    const rgb = hexToRgb(hex);
    return rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : '0, 0, 0';
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
    const rgbAccent = hexToRgb(accent) || { r: 13, g: 148, b: 136 };

    // Accent Properties
    root.style.setProperty('--theme-accent-color', accent);
    root.style.setProperty('--theme-accent-color-hover', hoverColor);
    root.style.setProperty('--theme-accent-rgb', `${rgbAccent.r}, ${rgbAccent.g}, ${rgbAccent.b}`);
    root.style.setProperty('--theme-accent-glow', `rgba(${rgbAccent.r}, ${rgbAccent.g}, ${rgbAccent.b}, 0.25)`);

    // Secondary Accent Properties
    const secondary = config.secondaryColor || '#2dd4bf';
    const secondaryHover = adjustColorBrightness(secondary, -25);
    const rgbSecondary = hexToRgb(secondary) || { r: 45, g: 212, b: 191 };
    root.style.setProperty('--theme-secondary-color', secondary);
    root.style.setProperty('--theme-secondary-color-hover', secondaryHover);
    root.style.setProperty('--theme-secondary-rgb', `${rgbSecondary.r}, ${rgbSecondary.g}, ${rgbSecondary.b}`);
    root.style.setProperty('--theme-secondary-glow', `rgba(${rgbSecondary.r}, ${rgbSecondary.g}, ${rgbSecondary.b}, 0.25)`);

    // Dynamic background and card base colors
    const lBg = config.lightBgColor || '#f0fdfa';
    const dBg = config.darkBgColor || '#041a16';
    
    root.style.setProperty('--app-bg-light', lBg);
    root.style.setProperty('--app-bg-dark', dBg);
    
    // Ambient background blob gradients mapped to primary and secondary accent colors (dual color ambient glow!)
    root.style.setProperty('--theme-grad-1-light', `rgba(${rgbAccent.r}, ${rgbAccent.g}, ${rgbAccent.b}, 0.06)`);
    root.style.setProperty('--theme-grad-2-light', `rgba(${rgbSecondary.r}, ${rgbSecondary.g}, ${rgbSecondary.b}, 0.06)`);
    root.style.setProperty('--theme-grad-3-light', lBg);

    root.style.setProperty('--theme-grad-1-dark', `rgba(${rgbAccent.r}, ${rgbAccent.g}, ${rgbAccent.b}, 0.1)`);
    root.style.setProperty('--theme-grad-2-dark', `rgba(${rgbSecondary.r}, ${rgbSecondary.g}, ${rgbSecondary.b}, 0.1)`);
    root.style.setProperty('--theme-grad-3-dark', dBg);

    // Glass base color (supports backwards-compatible comma-separated format OR computes from color picker hex keys!)
    const lightCardBase = config.lightCardColor ? hexToRgbComma(config.lightCardColor) : (config.lightCardBase || '255, 255, 255');
    const darkCardBase = config.darkCardColor ? hexToRgbComma(config.darkCardColor) : (config.darkCardBase || '27, 48, 34');

    root.style.setProperty('--light-card-base', lightCardBase);
    root.style.setProperty('--dark-card-base', darkCardBase);

    // Glass Panels
    root.style.setProperty('--panel-bg-light', `rgba(${lightCardBase}, ${config.panelOpacity / 100})`);
    root.style.setProperty('--panel-blur-light', `${config.panelBlur}px`);
    root.style.setProperty('--panel-bg-dark', `rgba(${darkCardBase}, ${config.panelOpacity / 100})`);
    root.style.setProperty('--panel-blur-dark', `${config.panelBlur}px`);

    // Inputs
    root.style.setProperty('--input-bg-light', `rgba(${lightCardBase}, ${config.inputOpacity / 100})`);
    root.style.setProperty('--input-blur-light', `${config.inputBlur}px`);
    root.style.setProperty('--input-bg-dark', `rgba(${darkCardBase}, ${config.inputOpacity / 100})`);
    root.style.setProperty('--input-blur-dark', `${config.inputBlur}px`);

    // Drop Zone
    root.style.setProperty('--drop-bg-light', `rgba(${lightCardBase}, ${config.dropOpacity / 100})`);
    root.style.setProperty('--drop-blur-light', `${config.dropBlur}px`);
    root.style.setProperty('--drop-bg-dark', `rgba(${darkCardBase}, ${config.dropOpacity / 100})`);
    root.style.setProperty('--drop-blur-dark', `${config.dropBlur}px`);
}

// 4. Initialize Admin Controls panel events
export function initAdminStyleControls() {
    // Tab Navigation Switcher
    const tabs = document.querySelectorAll('.customizer-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const activeTab = tab.dataset.tab;
            tabs.forEach(t => {
                if (t.dataset.tab === activeTab) {
                    t.classList.add('bg-white', 'dark:bg-zinc-900', 'text-teal-600', 'dark:text-teal-300', 'shadow-sm');
                    t.classList.remove('text-zinc-500', 'dark:text-zinc-400');
                } else {
                    t.classList.remove('bg-white', 'dark:bg-zinc-900', 'text-teal-600', 'dark:text-teal-300', 'shadow-sm');
                    t.classList.add('text-zinc-500', 'dark:text-zinc-400');
                }
            });

            // Toggle panels
            ['colors', 'transparency', 'blurs'].forEach(panelName => {
                const p = document.getElementById(`customizer-panel-${panelName}`);
                if (p) {
                    if (panelName === activeTab) {
                        p.classList.remove('hidden');
                    } else {
                        p.classList.add('hidden');
                    }
                }
            });
        });
    });

    // Preview Mode Toggle (Light/Dark mode sandbox)
    let previewIsDark = true;
    const prevToggleLight = document.getElementById('preview-toggle-light');
    const prevToggleDark = document.getElementById('preview-toggle-dark');

    const setPreviewDarkState = (isDark) => {
        previewIsDark = isDark;
        if (isDark) {
            prevToggleDark?.classList.add('bg-teal-500', 'text-white', 'font-semibold');
            prevToggleDark?.classList.remove('text-zinc-400', 'hover:text-zinc-600');
            prevToggleLight?.classList.remove('bg-white', 'dark:bg-zinc-900', 'text-zinc-800', 'dark:text-white', 'shadow-sm', 'font-semibold');
            prevToggleLight?.classList.add('text-zinc-400', 'hover:text-zinc-600');
        } else {
            prevToggleLight?.classList.add('bg-white', 'dark:bg-zinc-900', 'text-zinc-800', 'dark:text-white', 'shadow-sm', 'font-semibold');
            prevToggleLight?.classList.remove('text-zinc-400', 'hover:text-zinc-600');
            prevToggleDark?.classList.remove('bg-teal-500', 'text-white', 'font-semibold');
            prevToggleDark?.classList.add('text-zinc-400', 'hover:text-zinc-600');
        }
        updateDemoPreview();
    };

    prevToggleLight?.addEventListener('click', () => setPreviewDarkState(false));
    prevToggleDark?.addEventListener('click', () => setPreviewDarkState(true));

    const selectPreset = (presetName) => {
        const preset = PRESETS[presetName];
        if (!preset) return;

        config.accentColor = preset.accentColor;
        config.secondaryColor = preset.secondaryColor || preset.accentColor;
        config.lightCardBase = preset.lightCardBase || '255, 255, 255';
        config.darkCardBase = preset.darkCardBase || '12, 45, 39';
        config.lightBgColor = preset.lightBgColor || '#f0fdfa';
        config.darkBgColor = preset.darkBgColor || '#041a16';
        config.lightCardColor = preset.lightCardColor || '#FFFFFF';
        config.darkCardColor = preset.darkCardColor || '#0c2d27';

        // Sync inputs UI
        setupSlidersAndPickersFromConfig();

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

    // Helper: Connect custom color picker + text box sync pair
    const setupColorPair = (pickerId, textId, configKey, onUpdate) => {
        const pInput = document.getElementById(pickerId);
        const tInput = document.getElementById(textId);
        if (!pInput || !tInput) return;

        pInput.addEventListener('input', (e) => {
            const hex = e.target.value;
            config[configKey] = hex;
            tInput.value = hex;
            if (onUpdate) onUpdate(hex);
            
            // Remove preset active classes since custom color chosen
            document.querySelectorAll('.preset-btn').forEach(b => {
                b.classList.remove('border-teal-500', 'bg-teal-500/10', 'scale-[1.02]');
            });

            applyStylesToRoot();
            updateDemoPreview();
        });

        tInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (val.length === 7 && val.startsWith('#')) {
                config[configKey] = val;
                pInput.value = val;
                if (onUpdate) onUpdate(val);
                
                document.querySelectorAll('.preset-btn').forEach(b => {
                    b.classList.remove('border-teal-500', 'bg-teal-500/10', 'scale-[1.02]');
                });

                applyStylesToRoot();
                updateDemoPreview();
            }
        });
    };

    // Connect color customizers
    setupColorPair('custom-color-picker', 'custom-color-text', 'accentColor');
    setupColorPair('custom-secondary-picker', 'custom-secondary-text', 'secondaryColor');
    setupColorPair('custom-light-bg-picker', 'custom-light-bg-text', 'lightBgColor');
    setupColorPair('custom-dark-bg-picker', 'custom-dark-bg-text', 'darkBgColor');
    setupColorPair('custom-light-card-picker', 'custom-light-card-text', 'lightCardColor', (hex) => {
        config.lightCardBase = hexToRgbComma(hex);
    });
    setupColorPair('custom-dark-card-picker', 'custom-dark-card-text', 'darkCardColor', (hex) => {
        config.darkCardBase = hexToRgbComma(hex);
    });

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
    
    // Set initial preview selector state based on body class dark mode
    setPreviewDarkState(document.documentElement.classList.contains('dark'));
}

function setupSlidersAndPickersFromConfig() {
    const syncColorInput = (pickerId, textId, val) => {
        const picker = document.getElementById(pickerId);
        const text = document.getElementById(textId);
        if (picker) picker.value = val;
        if (text) text.value = val;
    };

    syncColorInput('custom-color-picker', 'custom-color-text', config.accentColor);
    syncColorInput('custom-secondary-picker', 'custom-secondary-text', config.secondaryColor || '#2dd4bf');
    syncColorInput('custom-light-bg-picker', 'custom-light-bg-text', config.lightBgColor || '#f0fdfa');
    syncColorInput('custom-dark-bg-picker', 'custom-dark-bg-text', config.darkBgColor || '#041a16');
    syncColorInput('custom-light-card-picker', 'custom-light-card-text', config.lightCardColor || '#FFFFFF');
    syncColorInput('custom-dark-card-picker', 'custom-dark-card-text', config.darkCardColor || '#0c2d27');

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
    const container = document.getElementById('demo-preview-container');
    const card = document.getElementById('demo-card-preview');
    const input = document.getElementById('demo-input-preview');
    const drop = document.getElementById('demo-drop-preview');
    const btn = document.getElementById('demo-btn-preview');
    const accIcon = document.getElementById('demo-accent-icon');
    const accBlob = document.getElementById('demo-accent-blob');
    const dropIcon = document.getElementById('demo-drop-icon');

    // Text label elements for light/dark mode high contrast adjustments inside preview
    const title = document.getElementById('demo-title');
    const subtitle = document.getElementById('demo-subtitle');
    const inputLabel = document.getElementById('demo-input-label');
    const dropText = document.getElementById('demo-drop-text');
    const dropSubtext = document.getElementById('demo-drop-subtext');

    if (!card) return;

    // Determine values matching preview light/dark states
    const accent = config.accentColor;
    const secondary = config.secondaryColor || '#2dd4bf';
    const lBg = config.lightBgColor || '#f0fdfa';
    const dBg = config.darkBgColor || '#041a16';
    
    const lightCardBase = config.lightCardColor ? hexToRgbComma(config.lightCardColor) : (config.lightCardBase || '255, 255, 255');
    const darkCardBase = config.darkCardColor ? hexToRgbComma(config.darkCardColor) : (config.darkCardBase || '12, 45, 39');

    // Toggle Preview Mode buttons visual state
    const prevToggleLight = document.getElementById('preview-toggle-light');
    const prevToggleDark = document.getElementById('preview-toggle-dark');
    const isDarkNow = prevToggleDark?.classList.contains('bg-teal-500');
    const previewIsDark = isDarkNow === undefined ? true : isDarkNow;

    const cardBase = previewIsDark ? darkCardBase : lightCardBase;

    // Apply Page Background simulation to container
    if (container) {
        container.style.backgroundColor = previewIsDark ? dBg : lBg;
        if (previewIsDark) {
            container.classList.add('dark');
        } else {
            container.classList.remove('dark');
        }
    }

    // Toggle Text Colors for high-contrast visibility
    if (previewIsDark) {
        if (title) { title.style.color = '#ffffff'; }
        if (subtitle) { subtitle.style.color = '#a1a1aa'; }
        if (inputLabel) { inputLabel.style.color = '#a1a1aa'; }
        if (dropText) { dropText.style.color = '#d4d4d8'; }
        if (dropSubtext) { dropSubtext.style.color = '#71717a'; }

        // Input Styling
        if (input) {
            input.style.backgroundColor = `rgba(${cardBase}, ${config.inputOpacity / 100})`;
            input.style.backdropFilter = `blur(${config.inputBlur}px)`;
            input.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            input.style.color = '#ffffff';
        }

        // Drop Area Styling
        if (drop) {
            drop.style.backgroundColor = `rgba(${cardBase}, ${config.dropOpacity / 100})`;
            drop.style.backdropFilter = `blur(${config.dropBlur}px)`;
            drop.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        }
    } else {
        if (title) { title.style.color = '#18181b'; }
        if (subtitle) { subtitle.style.color = '#71717a'; }
        if (inputLabel) { inputLabel.style.color = '#71717a'; }
        if (dropText) { dropText.style.color = '#27272a'; }
        if (dropSubtext) { dropSubtext.style.color = '#a1a1aa'; }

        // Input Styling
        if (input) {
            input.style.backgroundColor = `rgba(${cardBase}, ${config.inputOpacity / 100})`;
            input.style.backdropFilter = `blur(${config.inputBlur}px)`;
            input.style.borderColor = 'rgba(0, 0, 0, 0.08)';
            input.style.color = '#18181b';
        }

        // Drop Area Styling
        if (drop) {
            drop.style.backgroundColor = `rgba(${cardBase}, ${config.dropOpacity / 100})`;
            drop.style.backdropFilter = `blur(${config.dropBlur}px)`;
            drop.style.borderColor = 'rgba(0, 0, 0, 0.08)';
        }
    }
 
    // Main Card Styling
    card.style.backgroundColor = `rgba(${cardBase}, ${config.panelOpacity / 100})`;
    card.style.backdropFilter = `blur(${config.panelBlur}px)`;

    // Apply Accent Theme Styling
    if (btn) {
        btn.style.backgroundColor = accent;
        btn.style.boxShadow = `0 4px 12px rgba(${hexToRgb(accent)?.r || 20}, ${hexToRgb(accent)?.g || 184}, ${hexToRgb(accent)?.b || 166}, 0.25)`;
    }
    if (accIcon) {
        accIcon.style.color = accent;
        accIcon.style.backgroundColor = `rgba(${hexToRgb(accent)?.r || 20}, ${hexToRgb(accent)?.g || 184}, ${hexToRgb(accent)?.b || 166}, 0.12)`;
    }
    if (accBlob) {
        accBlob.style.backgroundColor = accent;
    }
    if (dropIcon) {
        dropIcon.style.color = secondary;
        dropIcon.style.backgroundColor = `rgba(${hexToRgb(secondary)?.r || 45}, ${hexToRgb(secondary)?.g || 212}, ${hexToRgb(secondary)?.b || 191}, 0.12)`;
    }
}
