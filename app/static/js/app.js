// TypoPulse Typing Speed Test Engine

let words = [];
let typedWords = [];
let selectedTime = 30; // Default test duration in seconds
let timeRemaining = 30;
let activeMode = 'time'; // 'time' or 'words'
let selectedWordsLimit = 25; // Default words limit
let timerInterval = null;
let currentWordIndex = 0;
let currentLetterIndex = 0;

// Scoring metrics
let correctCharsCount = 0;
let incorrectCharsCount = 0;
let totalKeysTyped = 0;
let totalErrors = 0;

// State flags
let isTestActive = false;
let isTestFinished = false;

// Tracking statistics second by second for the Chart
let secondStats = [];
let secondsElapsed = 0;
let resultChartInstance = null;

// HTML Elements
const typingInput = document.getElementById('typing-input');
const wordsContainer = document.getElementById('words-container');
const wordsList = document.getElementById('words-list');
const caret = document.getElementById('caret');
const countdownDisp = document.getElementById('countdown');
const timerIconEl = countdownDisp ? countdownDisp.previousElementSibling : null;
const liveWpmDisp = document.getElementById('live-wpm');
const liveAccuracyDisp = document.getElementById('live-accuracy');
const testCard = document.getElementById('test-card');
const resultsCard = document.getElementById('results-card');
const restartBtn = document.getElementById('restart-btn');
const resultRetryBtn = document.getElementById('result-retry-btn');
const timeBtns = document.querySelectorAll('.time-btn');
const modeTimeBtn = document.getElementById('mode-time-btn');
const modeWordsBtn = document.getElementById('mode-words-btn');
const timeConfig = document.getElementById('time-config');
const wordsConfig = document.getElementById('words-config');
const wordLimitBtns = document.querySelectorAll('.word-limit-btn');
const instructionText = document.getElementById('instruction-text');

// Bounding box container for scrolling
const wordsContainerBox = document.getElementById('words-container-box');

let settings = {
    theme: 'carbon',
    caret: 'line',
    sound: false
};

let audioCtx = null;
let lastTypedValLength = 0;

// Initialization
document.addEventListener("DOMContentLoaded", () => {
    settings.caret = localStorage.getItem('typopulse-caret') || 'line';
    settings.sound = localStorage.getItem('typopulse-sound') === 'true';
    applyCaret(settings.caret);
    
    initTest();
    setupEventListeners();
});

// Setup input listeners & controls
function setupEventListeners() {
    // Select typing box focus
    wordsContainerBox.addEventListener('click', () => {
        focusInput();
    });

    // Capture typing inputs
    typingInput.addEventListener('input', handleTyping);
    typingInput.addEventListener('keydown', handleSpecialKeys);

    // Listen for global preferences events from the header modal
    window.addEventListener('caret-changed', (e) => {
        applyCaret(e.detail);
    });
    window.addEventListener('sound-changed', (e) => {
        settings.sound = e.detail;
    });

    // Mode button switches
    if (modeTimeBtn && modeWordsBtn) {
        modeTimeBtn.addEventListener('click', () => {
            if (isTestActive) return; // Prevent switching mid-test
            
            // Toggle highlights
            modeTimeBtn.className = "mode-btn px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wider font-mono transition-all text-brand-accent bg-brand-accent/10";
            modeWordsBtn.className = "mode-btn px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wider font-mono transition-all text-brand-textMuted hover:text-white";
            
            timeConfig.classList.remove('hidden');
            wordsConfig.classList.add('hidden');
            
            if (timerIconEl) {
                timerIconEl.className = "fa-regular fa-clock text-lg";
            }
            
            activeMode = 'time';
            resetTest();
        });
        
        modeWordsBtn.addEventListener('click', () => {
            if (isTestActive) return; // Prevent switching mid-test
            
            // Toggle highlights
            modeWordsBtn.className = "mode-btn px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wider font-mono transition-all text-brand-accent bg-brand-accent/10";
            modeTimeBtn.className = "mode-btn px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wider font-mono transition-all text-brand-textMuted hover:text-white";
            
            timeConfig.classList.add('hidden');
            wordsConfig.classList.remove('hidden');
            
            if (timerIconEl) {
                timerIconEl.className = "fa-solid fa-keyboard text-lg";
            }
            
            activeMode = 'words';
            resetTest();
        });
    }

    // Time button switches
    timeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (isTestActive) return; // Prevent switching mid-test
            
            // UI state active styling
            timeBtns.forEach(b => {
                b.classList.remove('text-brand-accent', 'bg-brand-accent/10');
                b.classList.add('text-brand-textMuted', 'hover:text-white');
            });
            btn.classList.remove('text-brand-textMuted', 'hover:text-white');
            btn.classList.add('text-brand-accent', 'bg-brand-accent/10');
            
            selectedTime = parseInt(btn.dataset.time);
            resetTest();
        });
    });

    // Word Limit button switches
    wordLimitBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (isTestActive) return; // Prevent switching mid-test
            
            // UI state active styling
            wordLimitBtns.forEach(b => {
                b.classList.remove('text-brand-accent', 'bg-brand-accent/10');
                b.classList.add('text-brand-textMuted', 'hover:text-white');
            });
            btn.classList.remove('text-brand-textMuted', 'hover:text-white');
            btn.classList.add('text-brand-accent', 'bg-brand-accent/10');
            
            selectedWordsLimit = parseInt(btn.dataset.words);
            resetTest();
        });
    });

    // Restart controls
    restartBtn.addEventListener('click', resetTest);
    resultRetryBtn.addEventListener('click', () => {
        resultsCard.classList.add('hidden');
        testCard.classList.remove('hidden');
        resetTest();
    });

    // Window resize - recalculate caret placement
    window.addEventListener('resize', updateCaret);

    // Focus input on initial click anywhere
    document.addEventListener('keydown', (e) => {
        // ESC key restarts test
        if (e.key === 'Escape') {
            e.preventDefault();
            resetTest();
        }
        
        // Tab + Enter restarts test
        if (e.key === 'Tab') {
            // Keep Tab from focusing nav elements if we are on the test
            if (document.activeElement !== typingInput) {
                e.preventDefault();
                focusInput();
            }
        }
    });
}

function applyCaret(caretStyle) {
    // Reset all shapes classes
    caret.classList.remove('caret-block', 'caret-underline');
    
    if (caretStyle === 'block') {
        caret.classList.add('caret-block');
    } else if (caretStyle === 'underline') {
        caret.classList.add('caret-underline');
    }
    
    settings.caret = caretStyle;
    localStorage.setItem('typopulse-caret', caretStyle);
    updateCaret(); // Recalculate size and positions
}

// Audio Click Synth Engine (Web Audio APIs)
function playKeySound(isError = false, isBackspace = false) {
    if (!settings.sound) return;
    
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        if (isError) {
            // Low buzz damp thump
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(120, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.12);
            gainNode.gain.setValueAtTime(0.22, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.12);
        } else if (isBackspace) {
            // Soft typewriter release click
            osc.type = 'sine';
            osc.frequency.setValueAtTime(750, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(450, audioCtx.currentTime + 0.04);
            gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.04);
        } else {
            // High key click pop
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1450, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(850, audioCtx.currentTime + 0.035);
            gainNode.gain.setValueAtTime(0.07, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.035);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.035);
        }
    } catch (e) {
        console.warn("Audio Context playback error:", e);
    }
}

function focusInput() {
    typingInput.focus();
    caret.classList.remove('opacity-0');
    if (!isTestActive) {
        caret.classList.add('blinking');
    }
}

// Initial setup of test words
async function initTest() {
    resetStateVariables();
    typingInput.disabled = true; // Prevent key buffering during fetch
    wordsList.innerHTML = '<span class="text-brand-textMuted py-4 font-sans text-sm"><i class="fa-solid fa-spinner animate-spin mr-2"></i>Generating word list...</span>';
    
    try {
        const count = activeMode === 'time' ? 150 : selectedWordsLimit;
        const response = await fetch(`/api/words?count=${count}`);
        words = await response.json();
        renderWords();
        
        typingInput.disabled = false; // Re-enable typing
        typingInput.value = "";       // Discard any characters logged during loading
        lastTypedValLength = 0;
        
        updateCaret();
        focusInput();                 // Auto-focus input for immediate typing start
    } catch (err) {
        console.error("Failed to load words:", err);
        wordsList.innerHTML = '<span class="text-brand-error py-4 font-sans text-sm">Error loading words. Press restart to try again.</span>';
    }
}

// Reset state
function resetTest() {
    clearInterval(timerInterval);
    timerInterval = null;
    initTest();
}

function resetStateVariables() {
    timeRemaining = activeMode === 'time' ? selectedTime : 0;
    currentWordIndex = 0;
    currentLetterIndex = 0;
    correctCharsCount = 0;
    incorrectCharsCount = 0;
    totalKeysTyped = 0;
    totalErrors = 0;
    isTestActive = false;
    isTestFinished = false;
    secondStats = [];
    typedWords = [];
    secondsElapsed = 0;
    lastTypedValLength = 0;
    
    typingInput.value = "";
    countdownDisp.textContent = activeMode === 'time' ? selectedTime : selectedWordsLimit;
    liveWpmDisp.textContent = "0";
    liveAccuracyDisp.textContent = "100%";
    instructionText.textContent = "Click below and start typing to begin the speed test";
    
    caret.className = "blinking";
    applyCaret(settings.caret); // Reapply current style config
    wordsContainer.scrollTop = 0;
    wordsList.style.transform = "translateY(0)";
    wordsList.style.transition = "none";
}

// Render word blocks to DOM
function renderWords() {
    wordsList.innerHTML = "";
    wordsList.appendChild(caret); // Re-insert globally referenced caret
    words.forEach((wordText, wordIdx) => {
        const wordSpan = document.createElement('span');
        wordSpan.className = 'word';
        wordSpan.id = `word-${wordIdx}`;
        if (wordIdx === 0) wordSpan.classList.add('active');
        
        // Wrap every letter in a span
        for (let i = 0; i < wordText.length; i++) {
            const letterSpan = document.createElement('span');
            letterSpan.className = 'letter';
            if (wordIdx === 0 && i === 0) letterSpan.classList.add('active');
            letterSpan.textContent = wordText[i];
            wordSpan.appendChild(letterSpan);
        }
        wordsList.appendChild(wordSpan);
    });
}

// Position caret relative to letters
function updateCaret() {
    if (isTestFinished || settings.caret === 'off') {
        caret.style.display = 'none';
        return;
    }
    
    caret.style.display = 'block';
    
    const activeWord = document.querySelector('.word.active');
    if (!activeWord) return;
    
    const activeLetter = activeWord.querySelector('.letter.active');
    
    if (activeLetter) {
        // Place caret at left of current active letter
        caret.style.left = `${activeLetter.offsetLeft}px`;
        caret.style.top = `${activeLetter.offsetTop + 6}px`;
        
        const charHeight = activeLetter.offsetHeight;
        
        // Apply width scaling for block and underline caret shapes
        if (settings.caret === 'block' || settings.caret === 'underline') {
            caret.style.width = `${activeLetter.offsetWidth}px`;
        } else {
            caret.style.width = '2.5px';
        }

        // Apply height and translate transform for underline style
        if (settings.caret === 'underline') {
            caret.style.height = '3px';
            caret.style.transform = `translateY(${charHeight - 3}px)`;
        } else {
            caret.style.height = `${charHeight}px`;
            caret.style.transform = 'none';
        }
    } else {
        // Caret is at the end of word (space context)
        const letters = activeWord.querySelectorAll('.letter');
        const lastLetter = letters[letters.length - 1];
        if (lastLetter) {
            caret.style.left = `${lastLetter.offsetLeft + lastLetter.offsetWidth}px`;
            caret.style.top = `${lastLetter.offsetTop + 6}px`;
            
            const charHeight = lastLetter.offsetHeight;
            
            // Render cursor standard width for spaces (width of ~8px)
            if (settings.caret === 'block' || settings.caret === 'underline') {
                caret.style.width = '8px';
            } else {
                caret.style.width = '2.5px';
            }

            // Apply height and translate transform for space context
            if (settings.caret === 'underline') {
                caret.style.height = '3px';
                caret.style.transform = `translateY(${charHeight - 3}px)`;
            } else {
                caret.style.height = `${charHeight}px`;
                caret.style.transform = 'none';
            }
        }
    }
}

// Main keystroke routing
function handleTyping(e, isSilent = false) {
    if (isTestFinished) return;
    
    // Start timer on first keystroke
    if (!isTestActive) {
        startTimer();
    }
    
    caret.classList.remove('blinking');
    
    const typedVal = typingInput.value;
    const activeWordSpan = document.getElementById(`word-${currentWordIndex}`);
    if (!activeWordSpan) return;
    
    const targetWord = words[currentWordIndex];
    
    // Play keystroke click sounds
    if (!isSilent) {
        const lastCharIdx = typedVal.length - 1;
        if (lastCharIdx >= 0) {
            const isBackspace = typedVal.length < lastTypedValLength;
            if (isBackspace) {
                playKeySound(false, true);
            } else if (lastCharIdx >= targetWord.length) {
                playKeySound(true); // Error: typing beyond word boundary
                totalErrors++;      // Track extra letters boundary overflow
            } else {
                const isCorrect = (typedVal[lastCharIdx] === targetWord[lastCharIdx]);
                playKeySound(!isCorrect);
                if (!isCorrect) {
                    totalErrors++;  // Track character typo
                }
            }
        } else if (typedVal.length < lastTypedValLength) {
            // Backspacing from the first letter of a word back to empty
            playKeySound(false, true);
        }
    }
    lastTypedValLength = typedVal.length;
    
    const letterSpans = activeWordSpan.querySelectorAll('.letter');
    
    // Clear extra letter tags
    const extraSpans = activeWordSpan.querySelectorAll('.letter.extra');
    extraSpans.forEach(s => s.remove());
    
    const maxLen = Math.max(typedVal.length, targetWord.length);
    
    for (let i = 0; i < maxLen; i++) {
        // If within word boundaries
        if (i < targetWord.length) {
            const letterSpan = letterSpans[i];
            
            if (i < typedVal.length) {
                // Character typed
                letterSpan.classList.remove('active');
                if (typedVal[i] === targetWord[i]) {
                    letterSpan.className = 'letter correct';
                } else {
                    letterSpan.className = 'letter incorrect';
                }
            } else if (i === typedVal.length) {
                // Active cursor index character
                letterSpan.className = 'letter active';
            } else {
                // Dim/Future characters
                letterSpan.className = 'letter';
            }
        } else {
            // Typing past target word boundary (extra letters)
            const extraChar = typedVal[i];
            if (extraChar && extraChar !== " ") {
                const extraSpan = document.createElement('span');
                extraSpan.className = 'letter incorrect extra';
                extraSpan.textContent = extraChar;
                activeWordSpan.appendChild(extraSpan);
            }
        }
    }
    
    // Update raw statistics
    totalKeysTyped++;
    calculateLiveMetrics();
    updateCaret();
    
    // Auto-end in Words Mode if we just completed the last character of the last word
    if (activeMode === 'words' && currentWordIndex === selectedWordsLimit - 1) {
        if (typedVal.length >= targetWord.length) {
            typedWords[currentWordIndex] = typedVal;
            endTest();
        }
    }
}

function handleSpecialKeys(e) {
    if (isTestFinished) return;
    
    // Jump word on SPACEBAR
    if (e.key === " ") {
        e.preventDefault();
        
        const typedVal = typingInput.value;
        if (typedVal.length === 0) return; // Ignore multiple double spacing
        
        submitWord();
    }
    
    // Go back to previous word on Backspace if current word input is empty
    if (e.key === "Backspace" && typingInput.value === "") {
        goBackToPreviousWord();
    }
}

// Evaluate typed word and shift indices
function submitWord() {
    const activeWordSpan = document.getElementById(`word-${currentWordIndex}`);
    if (!activeWordSpan) return;
    
    const targetWord = words[currentWordIndex];
    const typedVal = typingInput.value;
    
    // Store exact typed string for freedom mode backspacing
    typedWords[currentWordIndex] = typedVal;
    
    // Verify word accuracy
    let isWordCorrect = (typedVal === targetWord);
    
    // Scan letters inside the word for count updates
    const letterSpans = activeWordSpan.querySelectorAll('.letter');
    letterSpans.forEach((span, idx) => {
        if (span.classList.contains('correct')) {
            correctCharsCount++;
        } else if (span.classList.contains('incorrect')) {
            incorrectCharsCount++;
            totalErrors++;
        }
    });
    
    // Accounts for missed letters in incomplete words
    if (typedVal.length < targetWord.length) {
        incorrectCharsCount += (targetWord.length - typedVal.length);
        totalErrors += (targetWord.length - typedVal.length);
        activeWordSpan.classList.add('error-underline');
    } else if (!isWordCorrect) {
        activeWordSpan.classList.add('error-underline');
    }
    
    // Add spacer space character count to correct tally if typed correct
    if (isWordCorrect) {
        correctCharsCount++; // Count space bar
    } else {
        incorrectCharsCount++; // Error space
    }
    
    // Shift Active Word Classes
    activeWordSpan.classList.remove('active');
    
    // Shift to next word
    currentWordIndex++;
    
    if (activeMode === 'words') {
        countdownDisp.textContent = Math.max(0, selectedWordsLimit - currentWordIndex);
        if (currentWordIndex === selectedWordsLimit) {
            endTest();
            return;
        }
    }
    
    const nextWordSpan = document.getElementById(`word-${currentWordIndex}`);
    if (nextWordSpan) {
        nextWordSpan.classList.add('active');
        
        // Mark first character active
        const nextLetters = nextWordSpan.querySelectorAll('.letter');
        if (nextLetters[0]) nextLetters[0].classList.add('active');
        
        typingInput.value = "";
        lastTypedValLength = 0;
        
        // Handle vertical scrolling if next word line moves down
        handleLineScrolling(nextWordSpan);
        
        updateCaret();
    } else {
        // Run out of loaded words
        endTest();
    }
}

// Scan completed words and recompute speed tallies
function recalculateTallies() {
    correctCharsCount = 0;
    incorrectCharsCount = 0;
    
    for (let i = 0; i < currentWordIndex; i++) {
        const targetWord = words[i];
        const typedWordVal = typedWords[i] || "";
        let wordCorrect = true;
        
        const maxLen = Math.max(targetWord.length, typedWordVal.length);
        for (let j = 0; j < maxLen; j++) {
            if (j < targetWord.length) {
                if (j < typedWordVal.length) {
                    if (typedWordVal[j] === targetWord[j]) {
                        correctCharsCount++;
                    } else {
                        incorrectCharsCount++;
                        wordCorrect = false;
                    }
                } else {
                    // Missed character
                    incorrectCharsCount++;
                    wordCorrect = false;
                }
            } else {
                // Extra character
                incorrectCharsCount++;
                wordCorrect = false;
            }
        }
        
        // Space bar tally
        if (wordCorrect && typedWordVal === targetWord) {
            correctCharsCount++;
        } else {
            incorrectCharsCount++;
        }
    }
}

// Go back to the previous word for corrections (Monkeytype Freedom Mode)
function goBackToPreviousWord() {
    if (currentWordIndex === 0) return;
    
    const currentWordSpan = document.getElementById(`word-${currentWordIndex}`);
    const prevWordSpan = document.getElementById(`word-${currentWordIndex - 1}`);
    if (!prevWordSpan) return;
    
    // Remove active markers from current word letter spans
    if (currentWordSpan) {
        currentWordSpan.classList.remove('active');
        const activeLetters = currentWordSpan.querySelectorAll('.letter.active');
        activeLetters.forEach(l => l.classList.remove('active'));
    }
    
    // Decrement active index
    currentWordIndex--;
    
    if (activeMode === 'words') {
        countdownDisp.textContent = selectedWordsLimit - currentWordIndex;
    }
    
    // Retrieve exact typed buffer from typedWords log
    const reconstructedVal = typedWords[currentWordIndex] || "";
    
    // Restore text into keyboard input
    typingInput.value = reconstructedVal;
    lastTypedValLength = reconstructedVal.length;
    
    // Re-active word layout classes
    prevWordSpan.classList.remove('error-underline');
    prevWordSpan.classList.add('active');
    
    // Re-tally cumulative scores up to new word index
    recalculateTallies();
    
    // Manually run handleTyping to redraw letter highlights on previous word
    handleTyping(null, true);
    
    // Handle scrolling if we jumped back up to a previous line
    handleLineScrolling(prevWordSpan);
}

// Calculate lines offset and scroll container smoothly
function handleLineScrolling(nextWordEl) {
    const containerTop = wordsContainer.offsetTop;
    const wordTop = nextWordEl.offsetTop;
    
    // Scroll threshold (if word line is below first two lines)
    if (wordTop > 40) {
        // Adjust the viewport top offset
        wordsList.style.transform = `translateY(-${wordTop - 8}px)`;
        wordsList.style.transition = `transform 0.2s ease`;
    }
}

// Start test timer
function startTimer() {
    isTestActive = true;
    instructionText.innerHTML = '<span class="text-brand-accent animate-pulse">Test running... Focus!</span>';
    
    // Increment started tests count on first keystroke
    fetch('/api/test/start', { method: 'POST' }).catch(err => console.error("Failed to log test start:", err));
    
    timerInterval = setInterval(() => {
        secondsElapsed++;
        
        if (activeMode === 'time') {
            timeRemaining--;
            countdownDisp.textContent = timeRemaining;
        }
        
        // Calculate and log stats for graphs
        const stats = calculateLiveMetrics();
        
        // Calculate standard errors in this specific second
        const lastErrCount = secondStats.length > 0 ? secondStats[secondStats.length - 1].totalIncorrect : 0;
        const currentIncorrect = stats.incorrect;
        const errorsThisSecond = Math.max(0, currentIncorrect - lastErrCount);
        
        secondStats.push({
            second: secondsElapsed,
            wpm: stats.wpm,
            rawWpm: stats.rawWpm,
            errors: errorsThisSecond,
            totalIncorrect: currentIncorrect
        });
        
        if (activeMode === 'time' && timeRemaining <= 0) {
            endTest();
        }
    }, 1000);
}

// Compute speed values dynamically
function calculateLiveMetrics() {
    const elapsedMinutes = (secondsElapsed || 1) / 60;
    
    // Standard WPM = (Correct Characters / 5) / Time (min)
    // We estimate temporary current correct character based on DOM spans
    let activeCorrect = correctCharsCount;
    let activeIncorrect = incorrectCharsCount;
    
    const activeWordSpan = document.getElementById(`word-${currentWordIndex}`);
    if (activeWordSpan) {
        const correctLetters = activeWordSpan.querySelectorAll('.letter.correct');
        activeCorrect += correctLetters.length;
        
        const incorrectLetters = activeWordSpan.querySelectorAll('.letter.incorrect');
        activeIncorrect += incorrectLetters.length;
    }
    
    const wpm = Math.round((activeCorrect / 5) / elapsedMinutes);
    const totalTyped = activeCorrect + activeIncorrect;
    const rawWpm = Math.round((totalTyped / 5) / elapsedMinutes);
    const accuracy = totalTyped > 0 ? Math.round((activeCorrect / totalTyped) * 100) : 100;
    
    // Display live stats
    liveWpmDisp.textContent = wpm;
    liveAccuracyDisp.textContent = `${accuracy}%`;
    
    return { wpm, rawWpm, accuracy, correct: activeCorrect, incorrect: activeIncorrect };
}

// End test, compute final scores, send payload, plot chart
function endTest() {
    clearInterval(timerInterval);
    isTestFinished = true;
    
    // Final tally (evaluate current active word before stopping)
    const activeWordSpan = document.getElementById(`word-${currentWordIndex}`);
    if (activeWordSpan) {
        const correctLetters = activeWordSpan.querySelectorAll('.letter.correct');
        correctCharsCount += correctLetters.length;
        
        const incorrectLetters = activeWordSpan.querySelectorAll('.letter.incorrect');
        incorrectCharsCount += incorrectLetters.length;
    }
    
    const testDuration = activeMode === 'time' ? selectedTime : secondsElapsed;
    const elapsedMinutes = (testDuration || 1) / 60;
    const finalWpm = Math.round((correctCharsCount / 5) / elapsedMinutes);
    const totalKeystrokesCount = correctCharsCount + totalErrors;
    const finalAccuracy = totalKeystrokesCount > 0 ? Math.round((correctCharsCount / totalKeystrokesCount) * 100) : 100;
    const finalRawWpm = Math.round(((correctCharsCount + incorrectCharsCount) / 5) / elapsedMinutes);
    
    // Calculate character details: correct / incorrect / extra / missed
    let correctCount = 0;
    let incorrectCount = 0;
    let extraCount = 0;
    let missedCount = 0;
    
    for (let i = 0; i <= currentWordIndex; i++) {
        const wordSpan = document.getElementById(`word-${i}`);
        if (!wordSpan) continue;
        
        const letters = wordSpan.querySelectorAll('.letter');
        letters.forEach(letter => {
            if (letter.classList.contains('correct')) {
                correctCount++;
            } else if (letter.classList.contains('extra')) {
                extraCount++;
            } else if (letter.classList.contains('incorrect')) {
                incorrectCount++;
            } else {
                missedCount++;
            }
        });
    }
    
    // Calculate typing speed consistency score (normalized Coefficient of Variation)
    let consistency = 100;
    if (secondStats.length >= 2) {
        const wpms = secondStats.map(s => s.wpm);
        const mean = wpms.reduce((a, b) => a + b, 0) / wpms.length;
        if (mean > 0) {
            const variance = wpms.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / wpms.length;
            const stdDev = Math.sqrt(variance);
            consistency = Math.round(100 * (1 - (stdDev / mean)));
            if (consistency < 0) consistency = 0;
            if (consistency > 100) consistency = 100;
        } else {
            consistency = 0;
        }
    }
    
    // Bind stats to dashboard display elements
    document.getElementById('result-wpm').textContent = finalWpm;
    document.getElementById('result-accuracy').textContent = `${finalAccuracy}%`;
    document.getElementById('result-type').textContent = activeMode === 'time' ? `time ${selectedTime}` : `words ${selectedWordsLimit}`;
    document.getElementById('result-raw-wpm').textContent = finalRawWpm;
    document.getElementById('result-chars-ratio').textContent = `${correctCount}/${incorrectCount}/${extraCount}/${missedCount}`;
    document.getElementById('result-consistency').textContent = `${consistency}%`;
    document.getElementById('result-time').textContent = `${testDuration}s`;
    
    // Swap panels
    testCard.classList.add('hidden');
    resultsCard.classList.remove('hidden');
    
    // Render chart
    renderLiveChart();
    
    // Post to database
    saveResultToDB(finalWpm, finalAccuracy, testDuration, activeMode);
}

// AJAX post results
function saveResultToDB(wpm, accuracy, duration, mode) {
    fetch('/api/test/save', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            wpm: wpm,
            accuracy: accuracy,
            duration: duration,
            mode: mode
        })
    })
    .then(res => res.json())
    .then(data => {
        console.log("Save status:", data.message);
    })
    .catch(err => {
        console.error("Save error:", err);
    });
}

// Generate the beautiful local results line chart
function renderLiveChart() {
    const ctx = document.getElementById('liveTestChart').getContext('2d');
    
    // Destroy previous instance
    if (resultChartInstance) {
        resultChartInstance.destroy();
    }
    
    const labels = secondStats.map(s => `${s.second}s`);
    const wpmData = secondStats.map(s => s.wpm);
    const rawWpmData = secondStats.map(s => s.rawWpm || s.wpm);
    const errorData = secondStats.map(s => s.errors || 0);
    
    // Retrieve colors dynamically from document styling variables
    const style = getComputedStyle(document.documentElement);
    const accentColor = style.getPropertyValue('--color-accent').trim() || '#e2b714';
    const mutedColor = style.getPropertyValue('--color-muted').trim() || '#646669';
    const errorColor = style.getPropertyValue('--color-error').trim() || '#ca4754';
    
    resultChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Errors',
                    data: errorData,
                    borderColor: errorColor,
                    backgroundColor: errorColor,
                    pointBackgroundColor: errorColor,
                    pointBorderColor: errorColor,
                    pointRadius: 3.5,
                    pointHoverRadius: 5.5,
                    showLine: false, // Scatter style points only
                    yAxisID: 'yErrors'
                },
                {
                    label: 'Raw WPM',
                    data: rawWpmData,
                    borderColor: mutedColor,
                    borderWidth: 1.5,
                    borderDash: [3, 3],
                    pointBackgroundColor: 'transparent',
                    pointBorderColor: 'transparent',
                    pointRadius: 0,
                    fill: false,
                    tension: 0.35,
                    yAxisID: 'y'
                },
                {
                    label: 'WPM',
                    data: wpmData,
                    borderColor: accentColor,
                    borderWidth: 3,
                    pointBackgroundColor: accentColor,
                    pointBorderColor: '#ffffff',
                    pointRadius: 2,
                    fill: true,
                    backgroundColor: 'rgba(255, 255, 255, 0.01)', // soft fill
                    tension: 0.35,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    display: true,
                    position: 'top',
                    labels: {
                        color: mutedColor,
                        font: { family: 'Outfit', size: 10 }
                    }
                },
                tooltip: {
                    padding: 8,
                    bodyFont: { family: 'Outfit' },
                    titleFont: { family: 'Outfit' }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.01)' },
                    ticks: { color: mutedColor, font: { family: 'JetBrains Mono', size: 9 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.02)' },
                    ticks: { color: mutedColor, font: { family: 'JetBrains Mono', size: 9 } },
                    title: { display: true, text: 'Words Per Minute', color: mutedColor, font: { family: 'Outfit', size: 10 } }
                },
                yErrors: {
                    position: 'right',
                    grid: { drawOnChartArea: false }, // don't draw grid lines for errors scale
                    ticks: { 
                        color: errorColor, 
                        font: { family: 'JetBrains Mono', size: 9 },
                        stepSize: 1,
                        precision: 0
                    },
                    title: { display: true, text: 'Errors', color: errorColor, font: { family: 'Outfit', size: 10 } },
                    min: 0,
                    suggestedMax: 5
                }
            }
        }
    });
}
