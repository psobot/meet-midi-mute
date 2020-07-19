/**
 * index.js
 * part of meet-midi-mute Chrome extension
 * by Peter Sobot, @psobot, 2020-07-19
 */

const MIDI_SUSTAIN_PEDAL_CC = 64;
const MAX_ATTEMPTS = 10;

const TURN_ON_MICROPHONE = "Turn on microphone (⌘ + d)";
const TURN_OFF_MICROPHONE = "Turn off microphone (⌘ + d)";

const SUSTAIN_PEDAL_MUTES = false;

const UNMUTED_SOUND_PATH = chrome.extension.getURL("/sounds/unmuted.wav");
const MUTED_SOUND_PATH = chrome.extension.getURL("/sounds/muted.wav");
const VOLUME = 0.1;

const DEBOUNCE_MS = 150;

var UNMUTED_SOUND = null;
var MUTED_SOUND = null;

// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
function debounce(func, wait, immediate) {
	var timeout;
	return function() {
		var context = this, args = arguments;
		var later = function() {
			timeout = null;
			if (!immediate) func.apply(context, args);
		};
		var callNow = immediate && !timeout;
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
		if (callNow) func.apply(context, args);
	};
};

function getIsMuted() {
	if (document.querySelectorAll('[data-tooltip="' + TURN_ON_MICROPHONE + '"]')[0]) {
		return true;
	}
	return false;
}

function onSuccessfulMuteStateSet(isMuted) {
	if (isMuted) {
		if (!MUTED_SOUND) {
			MUTED_SOUND = new Audio(MUTED_SOUND_PATH);
			MUTED_SOUND.volume = VOLUME;
		}
		MUTED_SOUND.play()
	} else {
		if (!UNMUTED_SOUND) {
			UNMUTED_SOUND = new Audio(UNMUTED_SOUND_PATH);
			UNMUTED_SOUND.volume = VOLUME;
		}
		UNMUTED_SOUND.play()
	}
}

const setIsMuted = debounce(function(isMuted, attempts) {
	if (typeof attempts == "undefined") {
		attempts = 0;
	}

	if (attempts > MAX_ATTEMPTS) {
		return;
	}

	tryToClickTooltip(isMuted ? TURN_OFF_MICROPHONE : TURN_ON_MICROPHONE);
	if (getIsMuted() != isMuted) {
		setTimeout(function() { return setIsMuted(isMuted, attempts + 1); }, DEBOUNCE_MS);
		return;
	}

	// If we get here, our state now matches `muted`.
	onSuccessfulMuteStateSet(isMuted);
}, DEBOUNCE_MS);

function tryToClickTooltip(tooltip) {
	const button = document.querySelectorAll('[data-tooltip="' + tooltip + '"]')[0];
	if (typeof button == "undefined") {
		return false;
	}
	console.log("Clicking button: " + tooltip);
	button.click();
	return true;
}

/**
 * Parse basic information out of a MIDI message.
 */
function parseMidiMessage(message) {
  return {
    command: message.data[0] >> 4,
    channel: message.data[0] & 0xf,
    note: message.data[1],
    velocity: message.data[2] / 127
  }
}

function isSustainEvent(messageObject) {
	if (messageObject.command == 11 && messageObject.note == MIDI_SUSTAIN_PEDAL_CC) {
		return messageObject.velocity == 1;
	} else {
		return null;
	}
}

function getMIDIMessage(message) {
	const sustained = isSustainEvent(parseMidiMessage(message));
    if (sustained != null) {
    	setIsMuted(SUSTAIN_PEDAL_MUTES ? sustained : !sustained);
    }
}

chrome.extension.sendMessage({}, function(response) {
	if (navigator.requestMIDIAccess) {
		navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);

		function onMIDISuccess(midiAccess) {	    
		    var inputs = midiAccess.inputs;
		    for (var input of midiAccess.inputs.values()) {
		    	console.log("Listening for sustain events from " + input.name);
		        input.onmidimessage = getMIDIMessage;
		    }
		}

		function onMIDIFailure() {
		    console.log('Could not access your MIDI devices.');
		}
	} else {
	    console.log('WebMIDI is not supported in this browser.');
	}
});