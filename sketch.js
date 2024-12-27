/****************************************************
 * Intelligent Signal Processing - Midterm Exercise 1
 * Full Example: Web-based audio app with p5.js
 ****************************************************/

// ========== GLOBAL VARIABLES ==========

// Audio source(s)
let soundFile;       // Pre-recorded audio
let mic;             // Microphone input

// p5.sound Effects
let delayFX;
let filterFX;
let distortionFX;
let compressorFX;
let reverbFX;
let masterVolumeGain;

// UI Elements
let playButton, stopButton, recordButton;
let sourceSelect;    // Switch between 'File' and 'Mic'
let filterTypeSelect;
let freqSlider, freqLabel;
let distSlider, distLabel;
let reverbSlider, reverbLabel;
let volumeSlider, volumeLabel;
let delayTimeSlider, delayFeedbackSlider;
let delayTimeLabel, delayFeedbackLabel;

// Recording
let recorder;
let soundFileRecorder;
let isRecording = false;

// FFT Analyzers (for spectrum display)
let fftOriginal, fftProcessed;

// ========== PRELOAD ==========
// Load the pre-recorded audio file here (must be served via local server!)
function preload() {
  // Replace "slowlife.mp3" with the name of your local file, if different.
  // Make sure "slowlife.mp3" is in the same folder as index.html!
  soundFile = loadSound("slowlife.mp3");
}

// ========== SETUP ==========

function setup() {
  createCanvas(900, 400);

  // 1) Create microphone input, but don't connect yet
  mic = new p5.AudioIn();
  mic.start(); // Start capturing mic audio (won't output until connected)

  // 2) Initialize effects
  delayFX       = new p5.Delay();
  filterFX      = new p5.Filter();          // default is 'lowpass'
  distortionFX  = new p5.Distortion(0.1, '4x'); // amount, oversample
  compressorFX  = new p5.Compressor();
  reverbFX      = new p5.Reverb();
  masterVolumeGain = new p5.Gain();

  // ========== CREATE THE AUDIO CHAIN ==========

  // We'll chain them in the required order:
  // DELAY -> FILTER -> DISTORTION -> COMPRESSOR -> REVERB -> MASTER VOLUME
  //
  // However, the user might want to hear the "original" signal in an FFT.
  // We'll handle that by connecting an FFT analyzer specifically for original input
  // and one for the final output after MASTER VOLUME.

  // We'll set up connections in the "selectSource" function below,
  // since we have two possible audio sources (mic or file).
  // The last effect in chain connects to masterVolumeGain, which connects to the OUTPUT:
  masterVolumeGain.connect(); // connect to p5.soundOut by default

  // ========== FFT ANALYZERS ==========

  fftOriginal  = new p5.FFT();
  fftProcessed = new p5.FFT();

  // ========== CREATE RECORDER ==========
  recorder = new p5.SoundRecorder();
  // We'll decide what the recorder "hears" in a moment (the final processed chain).
  // Our final chain ends in masterVolumeGain, so we'll set that as the recorder's input:
  recorder.setInput(masterVolumeGain);

  soundFileRecorder = new p5.SoundFile(); // where we'll store the recorded audio

  // ========== CREATE UI ELEMENTS ==========

  createUI();
}

// This function will create & position all buttons/sliders/select dropdowns
function createUI() {
  // --- Source Select (Mic vs File) ---
  sourceSelect = createSelect();
  sourceSelect.position(20, 20);
  sourceSelect.option("File");
  sourceSelect.option("Mic");
  sourceSelect.selected("File");
  sourceSelect.changed(selectSource);
  createSpan("  Audio Source").position(160, 20);

  // --- Play & Stop Buttons ---
  playButton = createButton("Play");
  playButton.position(20, 60);
  playButton.mousePressed(handlePlay);

  stopButton = createButton("Stop");
  stopButton.position(80, 60);
  stopButton.mousePressed(handleStop);

  // --- Record Button ---
  recordButton = createButton("Record");
  recordButton.position(140, 60);
  recordButton.mousePressed(toggleRecording);

  // --- Filter Type Selector ---
  filterTypeSelect = createSelect();
  filterTypeSelect.position(20, 110);
  filterTypeSelect.option("lowpass");
  filterTypeSelect.option("highpass");
  filterTypeSelect.option("bandpass");
  filterTypeSelect.selected("lowpass");
  filterTypeSelect.changed(() => {
    filterFX.setType(filterTypeSelect.value());
  });
  createSpan("  Filter Type").position(160, 110);

  // --- Filter Frequency Slider ---
  freqLabel = createSpan("Cutoff Freq");
  freqLabel.position(20, 140);
  freqSlider = createSlider(50, 12000, 5000, 1);
  freqSlider.position(20, 160);
  freqSlider.input(() => {
    filterFX.freq(freqSlider.value());
  });

  // --- Distortion Slider (amount) ---
  distLabel = createSpan("Distortion");
  distLabel.position(20, 190);
  distSlider = createSlider(0, 1, 0.1, 0.01);
  distSlider.position(20, 210);
  distSlider.input(() => {
    // p5.Distortion docs: distortion param is [0,1.0+]
    distortionFX.set(distSlider.value(), "4x");
  });

  // --- Delay Sliders (time, feedback) ---
  delayTimeLabel = createSpan("Delay Time (sec)");
  delayTimeLabel.position(20, 240);
  delayTimeSlider = createSlider(0, 1, 0.2, 0.01);
  delayTimeSlider.position(20, 260);
  delayTimeSlider.input(updateDelayParams);

  delayFeedbackLabel = createSpan("Delay Feedback");
  delayFeedbackLabel.position(20, 290);
  delayFeedbackSlider = createSlider(0, 1, 0.3, 0.01);
  delayFeedbackSlider.position(20, 310);
  delayFeedbackSlider.input(updateDelayParams);

  // --- Reverb Slider (seconds) ---
  reverbLabel = createSpan("Reverb Time");
  reverbLabel.position(160, 140);
  reverbSlider = createSlider(0, 10, 2, 0.1);
  reverbSlider.position(160, 160);
  reverbSlider.input(() => {
    // p5.Reverb set() takes reverbTime, decayRate (optional), reverse (optional)
    reverbFX.set(reverbSlider.value(), 2);
  });

  // --- Master Volume Slider ---
  volumeLabel = createSpan("Master Volume");
  volumeLabel.position(160, 190);
  volumeSlider = createSlider(0, 1, 0.5, 0.01);
  volumeSlider.position(160, 210);
  volumeSlider.input(() => {
    masterVolumeGain.amp(volumeSlider.value());
  });

  // Initialize some default effect parameters
  updateDelayParams(); // sets initial delay time & feedback
  filterFX.setType(filterTypeSelect.value());
  filterFX.freq(freqSlider.value());
  distortionFX.set(distSlider.value(), "4x");
  reverbFX.set(reverbSlider.value(), 2);
  masterVolumeGain.amp(volumeSlider.value());
}

// ========== DRAW LOOP: SPECTRUM VISUALIZATION ==========

function draw() {
  background(220);

  // We'll show the original spectrum in top half, processed in bottom half
  const halfH = height / 2;

  // 1) Original spectrum
  push();
  const spectrumOriginal = fftOriginal.analyze();
  stroke(0);
  noFill();
  beginShape();
  for (let i = 0; i < spectrumOriginal.length; i++) {
    let x = map(i, 0, spectrumOriginal.length, 0, width);
    let y = map(spectrumOriginal[i], 0, 255, halfH, 0);
    vertex(x, y);
  }
  endShape();
  textAlign(LEFT);
  fill(0);
  text("Original Spectrum", 10, 20);
  pop();

  // 2) Processed spectrum
  push();
  const spectrumProcessed = fftProcessed.analyze();
  stroke(255, 0, 0);
  noFill();
  beginShape();
  for (let i = 0; i < spectrumProcessed.length; i++) {
    let x = map(i, 0, spectrumProcessed.length, 0, width);
    let y = map(spectrumProcessed[i], 0, 255, height, halfH);
    vertex(x, y);
  }
  endShape();
  fill(255, 0, 0);
  text("Processed Spectrum", 10, halfH + 20);
  pop();
}

// ========== EVENT / HELPER FUNCTIONS ==========

// Update delay time & feedback
function updateDelayParams() {
  // p5.Delay docs: delay.process(source, delayTime, feedback, lowPass)
  // We'll set lowPass to 22050 to keep it wide open
  delayFX.process(null, delayTimeSlider.value(), delayFeedbackSlider.value(), 22050);
}

// Switch between File or Mic as the source
function selectSource() {
  let choice = sourceSelect.value();
  if (choice === "Mic") {
    // Connect mic -> delay -> filter -> distortion -> compressor -> reverb -> volume
    // We'll also set the "original" FFT to mic
    mic.disconnect();
    soundFile.disconnect();

    // 1) Mic as input to Delay
    mic.connect(delayFX);

    // 2) Then chain the rest in series
    delayFX.chain(filterFX, distortionFX, compressorFX, reverbFX, masterVolumeGain);

    // The original spectrum: feed from mic
    fftOriginal.setInput(mic);
  } else {
    // Connect soundFile -> delay -> filter -> distortion -> compressor -> reverb -> volume
    mic.disconnect();
    soundFile.disconnect();

    soundFile.connect(delayFX);
    delayFX.chain(filterFX, distortionFX, compressorFX, reverbFX, masterVolumeGain);

    // The original spectrum: feed from soundFile
    fftOriginal.setInput(soundFile);
  }
  // The processed spectrum is always the final chain (masterVolumeGain)
  fftProcessed.setInput(masterVolumeGain);
}

// Called when "Play" button is pressed
function handlePlay() {
  // Must also ensure userStartAudio for browsers
  userStartAudio();

  if (sourceSelect.value() === "File") {
    // Just play the file from the start
    soundFile.play();
  }
}

// Called when "Stop" button is pressed
function handleStop() {
  if (sourceSelect.value() === "File") {
    soundFile.stop();
  }
}

// Toggle recording on/off
function toggleRecording() {
  if (!isRecording) {
    // Start recording
    console.log("Start Recording...");
    recordButton.html("Stop Rec");
    recorder.record(soundFileRecorder);
    isRecording = true;
  } else {
    // Stop recording, then download
    console.log("Stop Recording, saving...");
    recordButton.html("Record");
    recorder.stop(); // This finalizes the soundFileRecorder
    saveSound(soundFileRecorder, "processedAudio.wav");
    isRecording = false;
  }
}
