document.addEventListener('DOMContentLoaded', () => {

// --- Config ---

const USER_SLOTS_KEY = 'dictation_user_slots';
const SLOT_COUNT = 3;
const DEFAULT_SLOT_LABELS = ['Save 1', 'Save 2', 'Save 3'];

// Use the Project URL only, e.g. https://abcd1234.supabase.co
// Do not paste the REST endpoint (.../rest/v1) or a table URL.
const SUPABASE_URL = 'https://fvyckirbgipucnfhatwu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2eWNraXJiZ2lwdWNuZmhhdHd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NzYwNDcsImV4cCI6MjEwMjQ1MjA0N30.JxNEpQozH8-nS5ai2z8dQFNpTzU5SZ6YqFLPYZXmtEk';

const SAMPLE_LIST = `1. My stomach felt like it was **full of fluttering butterflies**.
2. As she waited for her turn, she felt **a lump form in her throat**.
3. When Benny learnt that he had won the award, he **broke into a wide smile**.
4. Marilyn's cheeks turned red and her **eyebrows narrowed**
5. Max **giggled and squealed** with excitement upon hearing the good news.
6. Tom's eyes **widened in fright** when he saw the shadow moving towards him.
7. As my grandmother was taking a stroll in the garden, her **hands swayed by her side**.
8. His face was **etched with sorrow** when he learnt that his pet went missing.
9. The children **shouted with glee** in their loudest voice.
10. Father was calm as he spoke in a **slow and steady voice**.
11. Jack's face turned red and blotchy. His mouth opened wide, revealing his tightly clenched teeth. His cheeks were raised till his eyes were squinted. He was shaking and he started stamping his feet on the ground. Then, he growled at his sister in a gravelly voice.`;

// --- Shared helpers ---

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeListText(text) {
    return String(text ?? '').replace(/\r\n/g, '\n').trimEnd();
}

function setWordList(text) {
    wordListInput.value = sanitizeListText(text);
}

function showScreen(screenEl) {
    [setupScreen, testScreen, resultsScreen].forEach((el) => {
        el.classList.toggle('hidden', el !== screenEl);
    });
}

function openModal(modalEl) {
    modalEl.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

function closeModal(modalEl) {
    modalEl.classList.add('hidden');
    const anyOpen = document.querySelector('.modal-overlay:not(.hidden)');
    if (!anyOpen) document.body.classList.remove('modal-open');
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(closeModal);
}

function bindModalDismiss(modalEl) {
    modalEl.addEventListener('click', (event) => {
        if (event.target === modalEl || event.target.closest('[data-close-modal]')) {
            closeModal(modalEl);
        }
    });
}

function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function fillSelect(selectEl, values, { placeholder, defaultValue } = {}) {
    const previous = selectEl.value;
    const placeholderHtml = placeholder
        ? `<option value="" disabled>${escapeHtml(placeholder)}</option>`
        : '';
    selectEl.innerHTML = placeholderHtml +
        values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');

    if (previous && values.includes(previous)) {
        selectEl.value = previous;
        return;
    }
    if (defaultValue && values.includes(String(defaultValue))) {
        selectEl.value = String(defaultValue);
        return;
    }
    if (placeholder) {
        selectEl.value = '';
        return;
    }
    if (values.length > 0) {
        selectEl.value = values[0];
    }
}

function isPlaceholderCredential(value) {
    if (!value || typeof value !== 'string') return true;
    const trimmed = value.trim();
    return trimmed === '' || /^YOUR_/i.test(trimmed) || trimmed.includes('YOUR_SUPABASE');
}

function normalizeSupabaseUrl(rawUrl) {
    let url = String(rawUrl || '').trim();
    url = url.replace(/\/+$/, '');
    url = url.replace(/\/(rest|auth|storage|graphql)\/v1$/i, '');
    url = url.replace(/\/+$/, '');
    return url;
}

function isSupabaseConfigured() {
    return !isPlaceholderCredential(SUPABASE_URL) && !isPlaceholderCredential(SUPABASE_ANON_KEY);
}

function formatSupabaseError(error) {
    const code = error && error.code;
    if (code === 'PGRST125') {
        return 'Invalid path in the Supabase request URL. SUPABASE_URL must be the Project URL (https://YOUR_PROJECT.supabase.co), not the REST endpoint that includes /rest/v1.';
    }
    if (code === 'PGRST205') {
        return 'Table "school_lists" was not found. Create it in the public schema and enable it in the API.';
    }
    return (error && error.message) || 'Could not load school lists.';
}

// --- DOM Elements ---

const setupScreen = $('setup-screen');
const testScreen = $('test-screen');
const resultsScreen = $('results-screen');
const startBtn = $('start-btn');
const wordListInput = $('word-list');
const addSampleBtn = $('add-sample-btn');
const clearListBtn = $('clear-list-btn');
const schoolVaultBtn = $('school-vault-btn');
const savedSlotsGrid = $('saved-slots-grid');
const savedSlotsStatus = $('saved-slots-status');
const timerDisplay = $('timer');
const autoNextCountdownDisplay = $('auto-next-countdown');
const progressDisplay = $('progress');
const contextDisplay = $('context');
const readAgainBtn = $('read-again-btn');
const repeatSentenceBtn = $('repeat-sentence-btn');
const nextSentenceBtn = $('next-sentence-btn');
const readNextBtn = $('read-next-btn');
const endTestBtn = $('end-test-btn');
const startTestBtn = $('start-test-btn');
const resetBtn = $('reset-btn');
const rereadAllBtn = $('reread-all-btn');
const languageSelect = $('language-select');
const timerModeSelect = $('timer-mode');
const countdownGroup = $('countdown-minutes-group');
const recurringReadoutCheckbox = $('recurring-readout');
const autoNextDelayInput = $('auto-next-delay');
const headerTagline = $('header-tagline');
const promptModal = $('prompt-modal');
const promptModalTitle = $('prompt-modal-title');
const promptModalMessage = $('prompt-modal-message');
const promptModalInput = $('prompt-modal-input');
const promptModalConfirm = $('prompt-modal-confirm');
const schoolVaultModal = $('school-vault-modal');
const vaultFilterSchool = $('vault-filter-school');
const vaultFilterLevel = $('vault-filter-level');
const vaultFilterYear = $('vault-filter-year');
const vaultStatus = $('vault-status');
const vaultList = $('vault-list');
const vaultPreview = $('vault-preview');

// --- App State & Settings ---

let testItems = [];
let currentIndex = -1;
let currentParagraphSentenceIndex = 0;
let settings = {};
let mainTimerInterval;
let actionTimers = { reread: null, autoNext: null, autoNextCountdown: null, recurringRead: null, nextItem: null };
let voices = [];
const synth = window.speechSynthesis;
let testHasStarted = false;
let userSlots = createDefaultSlots();
let promptResolver = null;
let supabaseClient = null;
let vaultLists = [];
let selectedVaultId = null;

// --- Voice Loading and Prioritization ---

function getVoiceScore(voice) {
    let score = 0;
    const name = voice.name.toLowerCase();
    if (name.includes('alex')) score += 100;
    if (name.includes('samantha')) score += 90;
    if (name.includes('siri')) score += 80;
    if (name.includes('premium') || name.includes('enhanced')) score += 50;
    if (voice.localService) score += 20;
    if (voice.default) score += 10;
    if (voice.lang.toLowerCase().startsWith('en-us')) score += 5;
    return score;
}

function populateVoices() {
    voices = synth.getVoices();
    if (voices.length === 0) {
        setTimeout(populateVoices, 100);
        return;
    }

    languageSelect.innerHTML = '';
    const desiredLangs = ['en', 'zh'];
    let availableVoices = voices.filter(voice => desiredLangs.some(lang => voice.lang.startsWith(lang)));
    availableVoices.sort((a, b) => getVoiceScore(b) - getVoiceScore(a));

    if (availableVoices.length === 0) {
        languageSelect.innerHTML = 'No English/Chinese voices found';
        startBtn.disabled = true;
        startBtn.textContent = 'Speech API Error';
        return;
    }

    const langGroups = { 'en': 'English', 'zh': 'Chinese' };
    Object.keys(langGroups).forEach(langCode => {
        const group = document.createElement('optgroup');
        group.label = langGroups[langCode];
        const voicesForLang = availableVoices.filter(voice => voice.lang.startsWith(langCode));
        if (voicesForLang.length > 0) {
            voicesForLang.forEach(voice => {
                const option = document.createElement('option');
                option.textContent = `${voice.name} (${voice.lang})`;
                option.setAttribute('data-voice-uri', voice.voiceURI);
                group.appendChild(option);
            });
            languageSelect.appendChild(group);
        }
    });

    languageSelect.disabled = false;
    startBtn.disabled = false;
    startBtn.textContent = 'Start Test';
}

if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = populateVoices;
}

populateVoices();
setTimeout(populateVoices, 100);

// --- Prompt modal ---

function promptText({ title, message, defaultValue = '', confirmLabel = 'Save' }) {
    return new Promise((resolve) => {
        if (promptResolver) promptResolver(null);
        promptResolver = resolve;
        promptModalTitle.textContent = title;
        promptModalMessage.textContent = message;
        promptModalConfirm.textContent = confirmLabel;
        promptModalInput.value = defaultValue;
        openModal(promptModal);
        promptModalInput.focus();
        promptModalInput.select();
    });
}

function resolvePrompt(value) {
    if (!promptResolver) return;
    const resolver = promptResolver;
    promptResolver = null;
    closeModal(promptModal);
    resolver(value);
}

promptModalConfirm.addEventListener('click', () => resolvePrompt(promptModalInput.value));
promptModalInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        resolvePrompt(promptModalInput.value);
    }
});
bindModalDismiss(promptModal);
promptModal.addEventListener('click', (event) => {
    if (event.target === promptModal || event.target.closest('[data-close-modal]')) {
        resolvePrompt(null);
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!promptModal.classList.contains('hidden')) {
        resolvePrompt(null);
        return;
    }
    closeAllModals();
});

// --- Saved slots (localStorage) ---

function createDefaultSlots() {
    return {
        slots: DEFAULT_SLOT_LABELS.map((label, index) => ({
            id: index + 1,
            label,
            content: ''
        }))
    };
}

function loadUserSlots() {
    try {
        const raw = localStorage.getItem(USER_SLOTS_KEY);
        if (!raw) {
            userSlots = createDefaultSlots();
            return;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.slots) || parsed.slots.length !== SLOT_COUNT) {
            userSlots = createDefaultSlots();
            persistUserSlots();
            return;
        }
        userSlots = {
            slots: parsed.slots.map((slot, index) => ({
                id: index + 1,
                label: (slot && slot.label && String(slot.label).trim()) || DEFAULT_SLOT_LABELS[index],
                content: slot && typeof slot.content === 'string' ? slot.content : ''
            }))
        };
    } catch (error) {
        console.warn('Could not read saved slots:', error);
        userSlots = createDefaultSlots();
    }
}

function persistUserSlots() {
    localStorage.setItem(USER_SLOTS_KEY, JSON.stringify(userSlots));
}

function renderSavedSlots() {
    const filledCount = userSlots.slots.filter((slot) => slot.content.trim()).length;
    savedSlotsStatus.textContent = filledCount ? `${filledCount} saved` : 'Empty';

    savedSlotsGrid.innerHTML = userSlots.slots.map((slot) => {
        const hasContent = slot.content.trim().length > 0;
        return `
            <article class="slot-card${hasContent ? ' filled' : ''}" data-slot-id="${slot.id}">
                <input type="text" class="slot-label-input" data-slot-id="${slot.id}" value="${escapeHtml(slot.label)}" placeholder="${DEFAULT_SLOT_LABELS[slot.id - 1]}" />
                <div class="slot-actions">
                    <button type="button" class="slot-load" data-slot-action="load" ${hasContent ? '' : 'disabled'}>Load</button>
                    <button type="button" class="slot-save" data-slot-action="save">Save</button>
                    <button type="button" class="slot-clear" data-slot-action="clear" ${hasContent ? '' : 'disabled'}>Clear</button>
                </div>
            </article>
        `;
    }).join('');
}

function getSlotById(id) {
    return userSlots.slots.find((slot) => slot.id === Number(id));
}

function handleSlotAction(action, slotId) {
    const slot = getSlotById(slotId);
    if (!slot) return;

    if (action === 'load') {
        if (!slot.content.trim()) return;
        setWordList(slot.content);
        wordListInput.focus();
        return;
    }

    if (action === 'save') {
        const currentText = wordListInput.value;
        if (!currentText.trim()) {
            alert('Enter a list in the text field before saving.');
            return;
        }
        if (slot.content.trim() && slot.content !== currentText) {
            const overwrite = window.confirm(`Overwrite "${slot.label}" with the current list?`);
            if (!overwrite) return;
        }
        slot.content = currentText;
        persistUserSlots();
        renderSavedSlots();
        return;
    }

    if (action === 'clear') {
        if (!slot.content.trim() && slot.label === DEFAULT_SLOT_LABELS[slot.id - 1]) return;
        const confirmed = window.confirm(`Clear "${slot.label}" and reset its label?`);
        if (!confirmed) return;
        slot.content = '';
        slot.label = DEFAULT_SLOT_LABELS[slot.id - 1];
        persistUserSlots();
        renderSavedSlots();
    }
}

savedSlotsGrid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-slot-action]');
    if (!button) return;
    const card = button.closest('[data-slot-id]');
    handleSlotAction(button.dataset.slotAction, card.dataset.slotId);
});

savedSlotsGrid.addEventListener('change', (event) => {
    if (!event.target.classList.contains('slot-label-input')) return;
    const slot = getSlotById(event.target.dataset.slotId);
    if (!slot) return;
    const nextLabel = event.target.value.trim();
    slot.label = nextLabel || DEFAULT_SLOT_LABELS[slot.id - 1];
    event.target.value = slot.label;
    persistUserSlots();
});

loadUserSlots();
renderSavedSlots();

// --- School Vault (Supabase) ---

function getSupabaseClient() {
    if (!isSupabaseConfigured()) return null;
    if (supabaseClient) return supabaseClient;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('Supabase library failed to load. Check your network connection and try again.');
    }

    const projectUrl = normalizeSupabaseUrl(SUPABASE_URL);
    let parsed;
    try {
        parsed = new URL(projectUrl);
    } catch (error) {
        throw new Error('SUPABASE_URL is not a valid URL. Use https://YOUR_PROJECT.supabase.co');
    }
    if (parsed.protocol !== 'https:' || parsed.pathname !== '/') {
        throw new Error('SUPABASE_URL must be the Project URL only (https://YOUR_PROJECT.supabase.co), with no /rest/v1 path.');
    }

    supabaseClient = window.supabase.createClient(projectUrl, SUPABASE_ANON_KEY.trim());
    return supabaseClient;
}

function setVaultStatus(type, message, { spinner = false } = {}) {
    if (!type) {
        vaultStatus.hidden = true;
        vaultStatus.className = 'vault-status';
        vaultStatus.innerHTML = '';
        return;
    }
    vaultStatus.hidden = false;
    vaultStatus.className = `vault-status ${type}`;
    vaultStatus.innerHTML = spinner
        ? `<span class="spinner" aria-hidden="true"></span><span>${escapeHtml(message)}</span>`
        : escapeHtml(message);
}

function resetVaultPreview() {
    selectedVaultId = null;
    vaultPreview.innerHTML = '<p class="vault-preview-empty">Select a list to preview it here.</p>';
    vaultList.querySelectorAll('.vault-list-item').forEach((el) => el.classList.remove('selected'));
}

function getFilteredVaultLists() {
    const school = vaultFilterSchool.value;
    const level = vaultFilterLevel.value;
    const year = vaultFilterYear.value;
    return vaultLists.filter((item) => {
        if (String(item.school_name) !== school) return false;
        if (String(item.level) !== level) return false;
        if (String(item.year) !== year) return false;
        return true;
    });
}

function areVaultFiltersComplete() {
    return Boolean(vaultFilterSchool.value && vaultFilterLevel.value && vaultFilterYear.value);
}

function currentVaultYear() {
    return String(new Date().getFullYear());
}

function renderVaultFilters() {
    const schools = uniqueSorted(vaultLists.map((item) => item.school_name));
    const levels = uniqueSorted(vaultLists.map((item) => item.level));
    const year = currentVaultYear();
    const years = uniqueSorted([...vaultLists.map((item) => item.year), year]);

    fillSelect(vaultFilterSchool, schools, { placeholder: 'Select School' });
    fillSelect(vaultFilterLevel, levels, { placeholder: 'Select Level' });
    fillSelect(vaultFilterYear, years, { defaultValue: year });
}

function renderVaultList() {
    if (!areVaultFiltersComplete()) {
        vaultList.hidden = true;
        vaultList.innerHTML = '';
        resetVaultPreview();
        vaultPreview.innerHTML = '<p class="vault-preview-empty">Select a school, level, and year to view matching lists.</p>';
        return;
    }

    vaultList.hidden = false;
    const items = getFilteredVaultLists();
    if (items.length === 0) {
        vaultList.innerHTML = '<p class="vault-empty">No spelling lists match these filters.</p>';
        if (selectedVaultId && !items.some((item) => item.id === selectedVaultId)) {
            resetVaultPreview();
        }
        return;
    }

    vaultList.innerHTML = items.map((item) => `
        <button type="button" class="vault-list-item${item.id === selectedVaultId ? ' selected' : ''}" data-list-id="${escapeHtml(item.id)}" role="listitem">
            <strong>${escapeHtml(item.title || 'Untitled list')}</strong>
            <span>${escapeHtml([item.school_name, item.level, item.year].filter(Boolean).join(' · '))}</span>
        </button>
    `).join('');
}

function renderVaultPreview(item) {
    if (!item) {
        resetVaultPreview();
        return;
    }
    selectedVaultId = item.id;
    vaultPreview.innerHTML = `
        <div class="vault-preview-title">${escapeHtml(item.title || 'Untitled list')}</div>
        <div class="vault-preview-meta">${escapeHtml([item.school_name, item.level, item.year].filter(Boolean).join(' · '))}</div>
        <pre class="vault-preview-content">${escapeHtml(item.content || '')}</pre>
        <button type="button" id="vault-load-btn" class="neumorphic-button primary vault-load-btn">Load List</button>
    `;
}

async function fetchSchoolLists() {
    const client = getSupabaseClient();
    setVaultStatus('loading', 'Loading school lists…', { spinner: true });
    vaultList.hidden = true;
    vaultList.innerHTML = '';
    resetVaultPreview();

    const { data, error } = await client
        .from('school_lists')
        .select('id, school_name, level, year, title, content')
        .order('school_name', { ascending: true })
        .order('year', { ascending: false })
        .order('title', { ascending: true });

    if (error) {
        throw new Error(formatSupabaseError(error));
    }

    vaultLists = Array.isArray(data) ? data : [];
    renderVaultFilters();
    renderVaultList();

    if (vaultLists.length === 0) {
        setVaultStatus('info', 'No school lists have been published yet.');
    } else {
        setVaultStatus(null);
    }
}

async function openSchoolVault() {
    openModal(schoolVaultModal);
    vaultLists = [];
    renderVaultFilters();
    vaultList.hidden = true;
    vaultList.innerHTML = '';
    resetVaultPreview();

    if (!isSupabaseConfigured()) {
        setVaultStatus(
            'error',
            'School Vault is not connected yet. Add your Supabase URL and anon key in script.js (SUPABASE_URL and SUPABASE_ANON_KEY).'
        );
        return;
    }

    try {
        await fetchSchoolLists();
    } catch (error) {
        console.error('School Vault fetch failed:', error);
        setVaultStatus('error', error.message || 'Network request failed. Please try again.');
    }
}

function loadSelectedVaultList() {
    const item = vaultLists.find((list) => String(list.id) === String(selectedVaultId));
    if (!item) return;
    setWordList(item.content || '');
    closeModal(schoolVaultModal);
    wordListInput.focus();
}

schoolVaultBtn.addEventListener('click', openSchoolVault);
bindModalDismiss(schoolVaultModal);

[vaultFilterSchool, vaultFilterLevel, vaultFilterYear].forEach((selectEl) => {
    selectEl.addEventListener('change', renderVaultList);
});

vaultList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-list-id]');
    if (!button) return;
    const item = vaultLists.find((list) => String(list.id) === String(button.dataset.listId));
    if (!item) return;
    selectedVaultId = item.id;
    renderVaultList();
    renderVaultPreview(item);
});

vaultPreview.addEventListener('click', (event) => {
    if (event.target.id === 'vault-load-btn') loadSelectedVaultList();
});

// --- Event Listeners ---

addSampleBtn.addEventListener('click', () => {
    setWordList(SAMPLE_LIST);
});

clearListBtn.addEventListener('click', () => {
    setWordList('');
});

startBtn.addEventListener('click', startTest);

startTestBtn.addEventListener('click', () => {
    if (!testHasStarted) {
        testHasStarted = true;
        startTestBtn.classList.add('hidden');
        readAgainBtn.classList.remove('hidden');
        readNextBtn.classList.remove('hidden');
        endTestBtn.classList.remove('hidden');
        startMainTimer();
        _startNextItem();
    }
});

readAgainBtn.addEventListener('click', () => {
    synth.cancel();
    if (testItems[currentIndex].type === 'paragraph') {
        currentParagraphSentenceIndex = 0;
    }
    readCurrentItem(true);
});

repeatSentenceBtn.addEventListener('click', () => {
    synth.cancel();
    readCurrentItem(true, true);
});

nextSentenceBtn.addEventListener('click', () => {
    synth.cancel();
    clearAllActionTimers();
    const item = testItems[currentIndex];
    if (item.type === 'paragraph') {
        if (currentParagraphSentenceIndex < item.sentences.length - 1) {
            currentParagraphSentenceIndex++;
        }
        readCurrentItem(true, true);
    }
});

readNextBtn.addEventListener('click', nextItem);

endTestBtn.addEventListener('click', () => endTest(false));

resetBtn.addEventListener('click', () => {
    showScreen(setupScreen);
    currentIndex = -1;
    currentParagraphSentenceIndex = 0;
    testHasStarted = false;
    testItems = [];
});

rereadAllBtn.addEventListener('click', () => {
    synth.cancel();
    rereadAllTestedWords();
});

timerModeSelect.addEventListener('change', (e) => {
    countdownGroup.classList.toggle('disabled', e.target.value === 'stopwatch');
});

timerModeSelect.dispatchEvent(new Event('change'));

recurringReadoutCheckbox.addEventListener('change', (e) => {
    autoNextDelayInput.disabled = e.target.checked;
    if (e.target.checked) autoNextDelayInput.value = 0;
});

// --- Core Functions ---

function normalizeChineseText(text) {
    const characterMap = {
        '⽜': '牛', '⻋': '车', '⽔': '水', '⻑': '长',
    };
    let normalizedText = text;
    for (const [radical, standard] of Object.entries(characterMap)) {
        normalizedText = normalizedText.replace(new RegExp(radical, 'g'), standard);
    }
    return normalizedText;
}

function gatherSettings() {
    let autoNext = parseInt(autoNextDelayInput.value, 10);
    const recurringReadout = recurringReadoutCheckbox.checked;
    if (autoNext > 0 && autoNext < 8 && !recurringReadout) {
        autoNext = 8;
        autoNextDelayInput.value = 8;
    } else if (recurringReadout) {
        autoNext = 0;
    }

    const selectedOption = languageSelect.options[languageSelect.selectedIndex];
    const selectedVoiceURI = selectedOption ? selectedOption.getAttribute('data-voice-uri') : null;

    const rereadGap = Math.min(parseInt($('reread-gap').value, 10), 30);
    const nextItemGap = Math.min(parseInt($('next-item-gap').value, 10), 10);

    settings = {
        rereadGap: rereadGap * 1000,
        nextItemGap: nextItemGap * 1000,
        autoNextDelay: autoNext * 1000,
        timerMode: timerModeSelect.value,
        countdownMinutes: parseInt($('countdown-minutes').value, 10),
        showContext: $('show-context').value === 'true',
        randomize: $('randomize-list').checked,
        readingSpeed: parseFloat($('reading-speed').value),
        recurringReadout: recurringReadout,
        readPunctuation: $('read-punctuation').value === 'true',
        voice: voices.find(v => v.voiceURI === selectedVoiceURI)
    };
}

function parseInput(rawText) {
    const normalizedText = normalizeChineseText(rawText);
    const processedText = normalizedText.replace(/^\s*\d+[\.\)]\s*/gm, '');
    const lines = processedText.split('\n').filter(line => line.trim() !== '');
    const parsedItems = [];

    lines.forEach(line => {
        const asteriskRegex = /\*\*(.*?)\*\*/g;
        const hasAsterisk = asteriskRegex.test(line);
        const cleanedLine = line.trim();

        if (hasAsterisk) {
            parsedItems.push(parseSingleLine(cleanedLine));
        } else {
            const sentences = cleanedLine.match(/[^.?!。？！，,]+[.?!。？！，,]*|\s\w+\s\w+\s\w+/g) || [cleanedLine];
            const actualSentences = sentences.map(s => s.trim()).filter(s => s.length > 0);

            if (actualSentences.length > 1) {
                parsedItems.push({
                    type: 'paragraph',
                    original: cleanedLine,
                    sentences: actualSentences.map(s => parseSingleLine(s)),
                    testedPart: cleanedLine
                });
            } else {
                parsedItems.push(parseSingleLine(cleanedLine));
            }
        }
    });

    return parsedItems;
}

function parseSingleLine(line) {
    const asteriskRegex = /\*\*(.*?)\*\*/g;
    let testedParts = [];
    let match;
    asteriskRegex.lastIndex = 0;
    while ((match = asteriskRegex.exec(line)) !== null) {
        testedParts.push(match[1]);
    }

    const type = 'single';
    const toRead = line.replace(/\*\*/g, '');
    const context = testedParts.length > 0 ? line.replace(asteriskRegex, `_______`) : '';
    const testedPart = testedParts.length > 0 ? testedParts.join(' ') : toRead;

    return { type, original: line, toRead, context, testedPart };
}

function startTest() {
    gatherSettings();
    const rawText = wordListInput.value;
    if (rawText.trim() === '') {
        alert('Please enter a list of words or sentences.');
        return;
    }

    testItems = parseInput(rawText);
    if (testItems.length === 0) {
        alert('No valid items found in the list.');
        return;
    }

    if (settings.randomize) {
        for (let i = testItems.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [testItems[i], testItems[j]] = [testItems[j], testItems[i]];
        }
    }

    currentIndex = -1;
    currentParagraphSentenceIndex = 0;
    testHasStarted = false;

    showScreen(testScreen);
    headerTagline.textContent = "You've got this! Stay focused and do your best!";
    autoNextCountdownDisplay.classList.add('hidden');
    updateUI();
    contextDisplay.innerHTML = '';
}

function nextItem() {
    if (synth.speaking) {
        synth.cancel();
        _startNextItem();
    } else {
        _startNextItem();
    }
}

function _startNextItem() {
    if (!testHasStarted) {
        return;
    }

    clearAllActionTimers();
    autoNextCountdownDisplay.classList.add('hidden');
    currentIndex++;
    currentParagraphSentenceIndex = 0;

    if (currentIndex >= testItems.length) {
        endTest(true);
        return;
    }

    updateUI();
    updateControlButtons();

    actionTimers.nextItem = setTimeout(() => {
        readCurrentItem();
    }, settings.nextItemGap);
}

function containsChinese(str) {
    return /[\u4e00-\u9fa5]/.test(str);
}

function voiceForText(text) {
    const selectedVoice = settings.voice;
    if (containsChinese(text) && selectedVoice && !selectedVoice.lang.startsWith('zh')) {
        const zhVoice = voices.find((voice) => voice.lang && voice.lang.startsWith('zh'));
        if (zhVoice) return zhVoice;
    }
    return selectedVoice;
}

function readCurrentItem(isManualRetry = false, keepCurrentSentence = false) {
    clearSpeechAndTimersExceptMain();
    const item = testItems[currentIndex];
    if (!item) return;

    let mainUtteranceText;
    let isLastSentenceOfParagraph = true;
    let currentItemContext = '';

    if (item.type === 'paragraph') {
        const sentence = item.sentences[currentParagraphSentenceIndex];
        mainUtteranceText = sentence.toRead;
        currentItemContext = '';
        isLastSentenceOfParagraph = (currentParagraphSentenceIndex === item.sentences.length - 1);
    } else {
        mainUtteranceText = item.toRead;
        currentItemContext = (settings.showContext && item.context) ? item.context : '';
    }

    if (settings.readPunctuation) {
        mainUtteranceText = addPunctuationWords(mainUtteranceText);
    }

    const mainUtterance = new SpeechSynthesisUtterance(mainUtteranceText);
    mainUtterance.voice = voiceForText(mainUtteranceText);
    mainUtterance.rate = settings.readingSpeed;

    mainUtterance.onend = () => {
        if (item.type === 'paragraph' && !isLastSentenceOfParagraph && !keepCurrentSentence) {
            currentParagraphSentenceIndex++;
            actionTimers.reread = setTimeout(() => readCurrentItem(isManualRetry), settings.rereadGap);
        } else if (settings.recurringReadout && !keepCurrentSentence) {
            actionTimers.recurringRead = setTimeout(() => {
                if (item.type === 'paragraph') currentParagraphSentenceIndex = 0;
                readCurrentItem(isManualRetry);
            }, settings.rereadGap);
        } else if (!isManualRetry && !keepCurrentSentence) {
            actionTimers.reread = setTimeout(() => {
                let secondText = mainUtteranceText;
                if (settings.readPunctuation) {
                    if (item.type === 'paragraph') {
                        const sentence = item.sentences[currentParagraphSentenceIndex];
                        secondText = addPunctuationWords(sentence.toRead);
                    } else {
                        secondText = addPunctuationWords(item.toRead);
                    }
                }

                const secondUtterance = new SpeechSynthesisUtterance(secondText);
                secondUtterance.voice = voiceForText(secondText);
                secondUtterance.rate = settings.readingSpeed;
                secondUtterance.onend = startAutoNextCountdown;
                synth.speak(secondUtterance);
            }, settings.rereadGap);
        } else if (!keepCurrentSentence) {
            startAutoNextCountdown();
        }
    };

    let shouldAnnounce = true;
    if (item.type === 'paragraph' && currentParagraphSentenceIndex > 0) {
        shouldAnnounce = false;
    }
    if (keepCurrentSentence) {
        shouldAnnounce = false;
    }

    if (shouldAnnounce) {
        const itemNumber = currentIndex + 1;
        const announcementVoice = voiceForText(mainUtteranceText);
        let announcementText = `Number ${itemNumber}`;
        if (announcementVoice && announcementVoice.lang.startsWith('zh')) {
            announcementText = `第 ${itemNumber} 题`;
        }

        const announcementUtterance = new SpeechSynthesisUtterance(announcementText);
        announcementUtterance.voice = announcementVoice;
        announcementUtterance.rate = settings.readingSpeed;

        contextDisplay.innerHTML = currentItemContext;
        synth.speak(announcementUtterance);
        synth.speak(mainUtterance);
    } else {
        contextDisplay.innerHTML = currentItemContext;
        synth.speak(mainUtterance);
    }
}

function addPunctuationWords(text) {
    const isChinese = settings.voice && settings.voice.lang.startsWith('zh');
    let result = text;

    const spacePause = '     ';

    if (isChinese) {
        const replacements = [
            ['。', spacePause + '句号' + spacePause],
            ['，', spacePause + '逗号' + spacePause],
            ['！', spacePause + '感叹号' + spacePause],
            ['？', spacePause + '问号' + spacePause],
            ['；', spacePause + '分号' + spacePause],
            ['：', spacePause + '冒号' + spacePause],
            ['、', spacePause + '顿号' + spacePause],
            ['—', spacePause + '破折号' + spacePause],
            ['（', spacePause + '左括号' + spacePause],
            ['）', spacePause + '右括号' + spacePause],
            ['"', spacePause + '左引号' + spacePause],
            ['"', spacePause + '右引号' + spacePause],
            ['《', spacePause + '左书名号' + spacePause],
            ['》', spacePause + '右书名号' + spacePause],
            ['.', spacePause + '句号' + spacePause],
            [',', spacePause + '逗号' + spacePause],
            ['!', spacePause + '感叹号' + spacePause],
            ['?', spacePause + '问号' + spacePause],
            [';', spacePause + '分号' + spacePause],
            [':', spacePause + '冒号' + spacePause],
            ['(', spacePause + '左括号' + spacePause],
            [')', spacePause + '右括号' + spacePause]
        ];

        for (const [punct, word] of replacements) {
            result = result.split(punct).join(word);
        }
    } else {
        const replacements = [
            ['.', spacePause + 'period' + spacePause],
            [',', spacePause + 'comma' + spacePause],
            ['!', spacePause + 'exclamation mark' + spacePause],
            ['?', spacePause + 'question mark' + spacePause],
            [';', spacePause + 'semicolon' + spacePause],
            [':', spacePause + 'colon' + spacePause],
            ['—', spacePause + 'em dash' + spacePause],
            ['-', spacePause + 'dash' + spacePause],
            ['(', spacePause + 'open parenthesis' + spacePause],
            [')', spacePause + 'close parenthesis' + spacePause],
            ['"', spacePause + 'quote' + spacePause]
        ];

        for (const [punct, word] of replacements) {
            result = result.split(punct).join(word);
        }
    }

    return result;
}

let autoNextCountdownTime = 0;
function startAutoNextCountdown() {
    clearTimeout(actionTimers.autoNextCountdown);
    autoNextCountdownDisplay.classList.add('hidden');

    if (settings.autoNextDelay > 0 && !settings.recurringReadout) {
        autoNextCountdownTime = Math.ceil(settings.autoNextDelay / 1000);
        autoNextCountdownDisplay.textContent = `Next in ${autoNextCountdownTime}s`;
        autoNextCountdownDisplay.classList.remove('hidden');

        actionTimers.autoNextCountdown = setInterval(() => {
            autoNextCountdownTime--;
            autoNextCountdownDisplay.textContent = `Next in ${autoNextCountdownTime}s`;
            if (autoNextCountdownTime <= 0) {
                clearInterval(actionTimers.autoNextCountdown);
                _startNextItem();
            }
        }, 1000);
    }
}

function rereadAllTestedWords() {
    let i = 0;
    const speakNextTestedPart = () => {
        if (i >= testItems.length) return;
        const item = testItems[i];
        const utterance = new SpeechSynthesisUtterance(item.testedPart);
        utterance.voice = settings.voice;
        utterance.rate = 1.25;
        utterance.onend = () => { i++; speakNextTestedPart(); };
        synth.speak(utterance);
    };
    speakNextTestedPart();
}

function updateUI() {
    progressDisplay.textContent = `Item ${currentIndex + 1} of ${testItems.length}`;
    const currentItem = testItems[currentIndex];
    if (!currentItem) return;

    if (currentItem.type === 'paragraph') {
        contextDisplay.innerHTML = '';
    } else if (currentItem.type === 'single' && settings.showContext && currentItem.context) {
        contextDisplay.innerHTML = currentItem.context;
    } else {
        contextDisplay.innerHTML = '';
    }
}

function updateControlButtons() {
    const currentItem = testItems[currentIndex];
    if (!currentItem) return;

    if (currentItem.type === 'paragraph') {
        repeatSentenceBtn.classList.remove('hidden');
        nextSentenceBtn.classList.remove('hidden');
    } else {
        repeatSentenceBtn.classList.add('hidden');
        nextSentenceBtn.classList.add('hidden');
    }
}

function endTest(isFinished = false) {
    clearInterval(mainTimerInterval);
    clearAllActionTimers();
    synth.cancel();
    testHasStarted = false;

    startTestBtn.classList.remove('hidden');
    readAgainBtn.classList.add('hidden');
    repeatSentenceBtn.classList.add('hidden');
    nextSentenceBtn.classList.add('hidden');
    readNextBtn.classList.add('hidden');
    endTestBtn.classList.add('hidden');
    timerDisplay.textContent = '00:00';
    contextDisplay.innerHTML = '';
    headerTagline.textContent = "Enter your list, set your pace, and start testing!";

    showScreen(isFinished ? resultsScreen : setupScreen);
}

function clearAllActionTimers() {
    clearTimeout(actionTimers.reread);
    clearTimeout(actionTimers.autoNext);
    clearTimeout(actionTimers.recurringRead);
    clearTimeout(actionTimers.nextItem);
    clearInterval(actionTimers.autoNextCountdown);
    autoNextCountdownDisplay.classList.add('hidden');
}

function clearSpeechAndTimersExceptMain() {
    synth.cancel();
    clearAllActionTimers();
}

function startMainTimer() {
    clearInterval(mainTimerInterval);

    if (settings.timerMode === 'countdown') {
        let timeRemaining = settings.countdownMinutes * 60;
        timerDisplay.textContent = formatTime(timeRemaining);
        mainTimerInterval = setInterval(() => {
            timeRemaining--;
            timerDisplay.textContent = formatTime(timeRemaining);
            if (timeRemaining <= 0) endTest(true);
        }, 1000);
    } else {
        let timeElapsed = 0;
        timerDisplay.textContent = formatTime(timeElapsed);
        mainTimerInterval = setInterval(() => {
            timeElapsed++;
            timerDisplay.textContent = formatTime(timeElapsed);
        }, 1000);
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

});
