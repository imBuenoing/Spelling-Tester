document.addEventListener('DOMContentLoaded', () => {

// --- DOM Elements ---

const setupScreen = document.getElementById('setup-screen');
const testScreen = document.getElementById('test-screen');
const resultsScreen = document.getElementById('results-screen');
const startBtn = document.getElementById('start-btn');
const wordListInput = document.getElementById('word-list');
const addSampleBtn = document.getElementById('add-sample-btn');
const clearListBtn = document.getElementById('clear-list-btn');
const timerDisplay = document.getElementById('timer');
const autoNextCountdownDisplay = document.getElementById('auto-next-countdown');
const progressDisplay = document.getElementById('progress');
const contextDisplay = document.getElementById('context');
const readAgainBtn = document.getElementById('read-again-btn');
const repeatSentenceBtn = document.getElementById('repeat-sentence-btn');
const nextSentenceBtn = document.getElementById('next-sentence-btn');
const readNextBtn = document.getElementById('read-next-btn');
const endTestBtn = document.getElementById('end-test-btn');
const startTestBtn = document.getElementById('start-test-btn');
const resetBtn = document.getElementById('reset-btn');
const rereadAllBtn = document.getElementById('reread-all-btn');
const languageSelect = document.getElementById('language-select');
const timerModeSelect = document.getElementById('timer-mode');
const countdownGroup = document.getElementById('countdown-minutes-group');
const recurringReadoutCheckbox = document.getElementById('recurring-readout');
const autoNextDelayInput = document.getElementById('auto-next-delay');
const headerTagline = document.getElementById('header-tagline');

// --- App State & Settings ---

let testItems = [];
let currentIndex = -1;
let currentParagraphSentenceIndex = 0;
let settings = {};
let mainTimerInterval;
let actionTimers = { reread: null, autoNext: null, autoNextCountdown: null, recurringRead: null };
let voices = [];
const synth = window.speechSynthesis;
let testHasStarted = false;

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

    if(availableVoices.length === 0) {
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

// --- Event Listeners ---

addSampleBtn.addEventListener('click', () => {
    wordListInput.value = `1. My stomach felt like it was **full of fluttering butterflies**.
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
});

clearListBtn.addEventListener('click', () => {
    wordListInput.value = '';
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
    resultsScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
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

    const rereadGap = Math.min(parseInt(document.getElementById('reread-gap').value, 10), 30);
    const nextItemGap = Math.min(parseInt(document.getElementById('next-item-gap').value, 10), 10);

    settings = {
        rereadGap: rereadGap * 1000,
        nextItemGap: nextItemGap * 1000,
        autoNextDelay: autoNext * 1000,
        timerMode: timerModeSelect.value,
        countdownMinutes: parseInt(document.getElementById('countdown-minutes').value, 10),
        showContext: document.getElementById('show-context').value === 'true',
        randomize: document.getElementById('randomize-list').checked,
        readingSpeed: parseFloat(document.getElementById('reading-speed').value),
        recurringReadout: recurringReadout,
        readPunctuation: document.getElementById('read-punctuation').value === 'true',
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
            const sentences = cleanedLine.match(/[^.?!。？！]+[.?!。？！]|\s\w+\s\w+\s\w+/g) || [cleanedLine];
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
    if(testItems.length === 0) {
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

    setupScreen.classList.add('hidden');
    resultsScreen.classList.add('hidden');
    testScreen.classList.remove('hidden');
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
    mainUtterance.voice = settings.voice;
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
                secondUtterance.voice = settings.voice;
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
        let announcementText = `Number ${itemNumber}`;
        if (settings.voice && settings.voice.lang.startsWith('zh')) {
            announcementText = `第 ${itemNumber} 题`;
        }

        const announcementUtterance = new SpeechSynthesisUtterance(announcementText);
        announcementUtterance.voice = settings.voice;
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

    // Use multiple spaces and word "pause" to create natural breaks
    // Multiple spaces often create pauses in TTS without being spoken
    const spacePause = '     ';  // 5 spaces creates a pause in most TTS engines

    if (isChinese) {
        // Replace Chinese punctuation with paused spoken names
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
        // Replace English punctuation with paused spoken names
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
    testScreen.classList.add('hidden');
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

    if (isFinished) {
        resultsScreen.classList.remove('hidden');
    } else {
        setupScreen.classList.remove('hidden');
    }
}

function clearAllActionTimers() {
    clearTimeout(actionTimers.reread);
    clearTimeout(actionTimers.autoNext);
    clearTimeout(actionTimers.recurringRead);
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
