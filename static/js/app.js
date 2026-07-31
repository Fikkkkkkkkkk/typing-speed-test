// TypoPulse Typing Speed Test Engine

let words = [];
let selectedTime = 30; // Default test duration in seconds
let timeRemaining = 30;
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
const liveWpmDisp = document.getElementById('live-wpm');
const liveAccuracyDisp = document.getElementById('live-accuracy');
const testCard = document.getElementById('test-card');
const resultsCard = document.getElementById('results-card');
const restartBtn = document.getElementById('restart-btn');
const resultRetryBtn = document.getElementById('result-retry-btn');
const timeBtns = document.querySelectorAll('.time-btn');
const instructionText = document.getElementById('instruction-text');

// Bounding box container for scrolling
const wordsContainerBox = document.getElementById('words-container-box');

// Initialization
document.addEventListener("DOMContentLoaded", () => {
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
    wordsList.innerHTML = '<span class="text-brand-textMuted py-4 font-sans text-sm"><i class="fa-solid fa-spinner animate-spin mr-2"></i>Generating word list...</span>';
    
    try {
        const response = await fetch(`/api/words?count=150`);
        words = await response.json();
        renderWords();
        updateCaret();
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
    timeRemaining = selectedTime;
    currentWordIndex = 0;
    currentLetterIndex = 0;
    correctCharsCount = 0;
    incorrectCharsCount = 0;
    totalKeysTyped = 0;
    totalErrors = 0;
    isTestActive = false;
    isTestFinished = false;
    secondStats = [];
    secondsElapsed = 0;
    
    typingInput.value = "";
    countdownDisp.textContent = timeRemaining;
    liveWpmDisp.textContent = "0";
    liveAccuracyDisp.textContent = "100%";
    instructionText.textContent = "Click below and start typing to begin the speed test";
    
    caret.className = "blinking";
    wordsContainer.scrollTop = 0;
}

// Render word blocks to DOM
function renderWords() {
    wordsList.innerHTML = "";
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
    if (isTestFinished) {
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
    } else {
        // Caret is at the end of word (space context)
        const letters = activeWord.querySelectorAll('.letter');
        const lastLetter = letters[letters.length - 1];
        if (lastLetter) {
            caret.style.left = `${lastLetter.offsetLeft + lastLetter.offsetWidth}px`;
            caret.style.top = `${lastLetter.offsetTop + 6}px`;
        }
    }
}

// Main keystroke routing
function handleTyping(e) {
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
}

// Evaluate typed word and shift indices
function submitWord() {
    const activeWordSpan = document.getElementById(`word-${currentWordIndex}`);
    if (!activeWordSpan) return;
    
    const targetWord = words[currentWordIndex];
    const typedVal = typingInput.value;
    
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
    
    const nextWordSpan = document.getElementById(`word-${currentWordIndex}`);
    if (nextWordSpan) {
        nextWordSpan.classList.add('active');
        
        // Mark first character active
        const nextLetters = nextWordSpan.querySelectorAll('.letter');
        if (nextLetters[0]) nextLetters[0].classList.add('active');
        
        typingInput.value = "";
        
        // Handle vertical scrolling if next word line moves down
        handleLineScrolling(nextWordSpan);
        
        updateCaret();
    } else {
        // Run out of loaded words
        endTest();
    }
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
    
    timerInterval = setInterval(() => {
        timeRemaining--;
        secondsElapsed++;
        countdownDisp.textContent = timeRemaining;
        
        // Calculate and log stats for graphs
        const liveWpm = calculateLiveMetrics();
        secondStats.push({
            second: secondsElapsed,
            wpm: liveWpm
        });
        
        if (timeRemaining <= 0) {
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
    const accuracy = totalTyped > 0 ? Math.round((activeCorrect / totalTyped) * 100) : 100;
    
    // Display live stats
    liveWpmDisp.textContent = wpm;
    liveAccuracyDisp.textContent = `${accuracy}%`;
    
    return wpm;
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
    
    const testDuration = selectedTime;
    const elapsedMinutes = testDuration / 60;
    const finalWpm = Math.round((correctCharsCount / 5) / elapsedMinutes);
    const totalTyped = correctCharsCount + incorrectCharsCount;
    const finalAccuracy = totalTyped > 0 ? Math.round((correctCharsCount / totalTyped) * 100) : 100;
    
    // Show stats
    document.getElementById('result-wpm').innerHTML = `${finalWpm} <span class="text-xs font-normal text-brand-textMuted">WPM</span>`;
    document.getElementById('result-accuracy').textContent = `${finalAccuracy}%`;
    document.getElementById('result-correct').textContent = correctCharsCount;
    document.getElementById('result-errors').textContent = incorrectCharsCount;
    document.getElementById('result-time').textContent = `${testDuration}s`;
    
    // Swap panels
    testCard.classList.add('hidden');
    resultsCard.classList.remove('hidden');
    
    // Render chart
    renderLiveChart();
    
    // Post to database
    saveResultToDB(finalWpm, finalAccuracy, testDuration);
}

// AJAX post results
function saveResultToDB(wpm, accuracy, duration) {
    fetch('/api/test/save', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            wpm: wpm,
            accuracy: accuracy,
            duration: duration,
            mode: 'time'
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
    
    // Neon Gradient
    const borderGradient = ctx.createLinearGradient(0, 0, 0, 200);
    borderGradient.addColorStop(0, 'rgba(139, 92, 246, 0.4)');
    borderGradient.addColorStop(1, 'rgba(139, 92, 246, 0.0)');
    
    resultChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Speed (WPM)',
                data: wpmData,
                borderColor: '#8b5cf6',
                borderWidth: 3,
                pointBackgroundColor: '#8b5cf6',
                pointBorderColor: '#ffffff',
                pointRadius: 3,
                fill: true,
                backgroundColor: borderGradient,
                tension: 0.35
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    padding: 8,
                    bodyFont: { family: 'Outfit' },
                    titleFont: { family: 'Outfit' }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.02)' },
                    ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } },
                    title: { display: true, text: 'WPM', color: '#64748b', font: { family: 'Outfit', size: 11 } }
                }
            }
        }
    });
}
