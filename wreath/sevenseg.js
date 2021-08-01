/*
 * Copyright (c) 2019  Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK.
 *
 *   This work is licensed under the
 *       Creative Commons Attribution 4.0 International License.
 *   To view a copy of this license, visit
 *       <http://creativecommons.org/licenses/by/4.0>.
 *   or send a letter to Creative Commons, PO Box 1866,
 *   Mountain View, CA 94042, USA.
 *
 */
import Timer from "timer";
import Time from "time";
import NeoPixel from "neopixel";

import config from "mc/config";


// 50mA / pixel
const DEFAULT_NUM_PIXELS = 200;
//const DEFAULT_NUM_PIXELS = 56;	// (2 pixels per 7 segments * 4 digits)
//const EXTRA_PIXELS_START = 58;

const DisplayWidth = 17;
const DisplayHeight = 7;
const DigitWidth = 4;
const DigitHeight = 7;

const REFRESH_RATE = 50;		// ms refresh rate

const SAT = 1.0;
const TwoPI = (Math.PI * 2);
const RAD2DEG = (180 / Math.PI);
const TenPow = [ 1, 10, 100, 1000 ];

const CYCLE_DURATION = (10000);

//    aa
//  f    b   
//  f    b c1
//    gg
//  e    c c2
//  e    c   
//    dd   dp
//
//     'a', 'b', 'c', 'd', 'e', 'f', 'g', dp
// bit  7    6    5    4    3    2    1    0
const sevenSegments = [
		0b11111100,		// 0 - abcdef
		0b01100000,		// 1 -  bc
		0b11011010,		// 2 - ab de g
		0b11110010,		// 3 - abcd  g
		0b01100110,		// 4 -  bc  fg
		0b10110110,		// 5 - a cd fg
		0b10111110,		// 6 - a cdefg
		0b11100000,		// 7 - abc    
		0b11111110,		// 8 - abcdefg
		0b11110110,		// 9 - abcd fg
];
Object.freeze(sevenSegments);

const letterSegments = [
	"?", 0b11001010,		// ? - ab  e g
	" ", 0b00000000,		// space is nothing
	"-", 0b00000010,		// - -       g
	"_", 0b00010000,		// _ -    d   
	"[", 0b10011100,		// [ - a  def 
	"]", 0b11110000,		// ] - abcd   
	"a", 0b11111010,		// a - abcde g
	"b", 0b00111110,		// b -   cdefg
	"c", 0b00011010,		// c -    de g
	"d", 0b01111010,		// d -  bcde g
	"e", 0b10011110,		// E - a  defg
	"f", 0b10001110,		// F - a   efg
	"g", 0b11110110,		// g - abcd fg
	"h", 0b01101110,		// H -  bc efg
	"i", 0b00100000,		// i -   c    
	"j", 0b01110000,		// J -  bcd   
	"k", 0b01101110,		// K -  bc efg  // like H
	"l", 0b00011100,		// L -    def 
	"m", 0b00101010,		// m -   c e g	// like n - no way to make m
	"n", 0b00101010,		// n -   c e g
	"o", 0b00111010,		// o -   cde g
	"p", 0b11001110,		// p - ab  efg
	"q", 0b11100110,		// q - abc  fg
	"r", 0b00001010,		// r -     e g
	"s", 0b10110110,		// s - a cd fg
	"t", 0b00011110,		// t -    defg
	"u", 0b00111000,		// u -   cde  
	"v", 0b00111000,		// v -   cde	// like u
	"w", 0b00111000,		// w -   cde    // like u
	"x", 0b01101110,		// X -  bc efg	// like H
	"y", 0b01100110,		// Y -  bc  fg
	"z", 0b11011010,		// Z - ab de g
];
Object.freeze(letterSegments);

export class SevenSegDisplay {
    constructor(dict) {
		this.supportedFormats = [ "RGB", "GRB", "RGBW" ];
		this._length = dict.length ?? 58;
		this._pin = dict.pin;
		this.timing = dict.timing;
		this.order = "RGB";
		this.width = DisplayWidth;
		this.height = DisplayHeight;

		this.dur = dict.duration ?? CYCLE_DURATION;

		this.twelve = dict.twelve ?? 0;
		this._zero = dict.zero ?? 0;

		this._rebooting = false;
		this.setup_neopixels();

		this.tail_sched = dict.tail_sched ?? 0;
		this.tail_time_on = dict.tail_time_on ?? 0;
		this.tail_time_off = dict.tail_time_off ?? 0;

		this._brightness = dict.brightness ?? 96;

		this.lastBlinkMS = 0;
		this.blinkDisplayOn = 1;
		this.blinkSpeed = 500;
		this.blinkDigits = 0xf;			// all 4 digits

		this.colonKind = 0;			// solid
		this.blinkTimeMS = 1000;		// for colon
		this.lastBlinkChangeMS = -this.blinkTimeMS;

		this.incHue = 1 / this.dur;
		this.incVal = (2 * Math.PI) / this.dur;

		this.userValue = dict.value;		// if defined, show a fixed value

		this.tailSegments = [];

		this._speed = dict.speed ?? 100;

		this.start();
    }

	start(refreshMS=REFRESH_RATE) {
		let now = Time.ticks;
		if (undefined !== this.timer)
			Timer.clear(this.timer);

		this.timer = Timer.repeat(id => {
			this.effectValue = Time.ticks;
		}, refreshMS);

		this.setupMinuteTimer();
		this.tail_actions?.start(now);
		this.tail_sequence?.start(now);
	}

	restart() @ "do_restart";

	setup_neopixels() {
		if (undefined !== this.neopixels) {
			let oldLength = this.neopixels.length;
			this.neopixels.fill(0);
        	this.neopixels.update();
			if (oldLength >= this._length)		// if neopixels are longer, it's okay
				return;
		// otherwise, reboot
			this._rebooting = true;
			Timer.set(id => { this.restart(); }, 1000);       // wait a second for the response to be sent
		}

		this.neopixels = new NeoPixel(this);
		this.neopixels.fill(0);
		this.neopixels.brightness = 255;
		this.pixelBuffer = new ArrayBuffer(4 * this._length);
		this.pixels = new Uint32Array(this.pixelBuffer);
		this.pixelOutBuffer = new ArrayBuffer(4 * this._length);
		this.pixelsOut = new Uint32Array(this.pixelOutBuffer);
		this.dimBuffer = new ArrayBuffer(8 * this._length);
		this.dimArray = new Float64Array(this.dimBuffer);
		this.dimRemBuffer = new ArrayBuffer(8 * this._length);
		this.dimRemain = new Float64Array(this.dimBuffer);
		this.dimDurBuffer = new ArrayBuffer(4 * this._length);
		this.dimDur = new Uint32Array(this.dimDurBuffer);
	}

	get pin() { return this._pin; }
	set pin(val) {
		trace(`Changing pin from ${this._pin} to ${val}\n`);
		this._pin = val;
		this.setup_neopixels();
	}

	get length() { return this._length; }
	set length(v) {
		this._length = v;
		this.setup_neopixels();
	}

	value(val, colon = false) {
		if (undefined === val) {
			this.userValue = undefined;
			this.blinkSpeed = 0;
		}
		else {
			this.userColon = colon;
			this.userValue = ("    " + val.toString().toLowerCase()).slice(-4); 
			this.setupTimePixels(Time.ticks);
		}
		return this;
	}

	get timeShowing() { return this.userValue === undefined; }


	get brightness() { return this._brightness; }
	set brightness(val) { this._brightness = val; }

	get tail_sched() { return this._tail_sched; }
	set tail_sched(val) { this._tail_sched = val|0; }

	get tail_time_on() { return this._tail_time_on; }
	set tail_time_on(val) { this._tail_time_on = val|0; }

	get tail_time_off() { return this._tail_time_off; }
	set tail_time_off(val) { this._tail_time_off = val|0; }

	get shouldShowTail() {
		let ret = true;
		if (!this.tail_sched)		// if not scheduled, then on.
			return true;
		if (this._tail_time_off < this._tail_time_on) {	// off in morning
			if ((this.timeValue24 >= this._tail_time_off)
				&& (this.timeValue24 < this._tail_time_on))
				return false;
		}
		else {
			if ((this.timeValue24 < this._tail_time_on)
				|| (this.timeValue24 >= this._tail_time_off))
				return false;
		}
		return true;
	}

	get zero() { return this._zero; }
	set zero(val) {
		if (val != this._zero)
			this._zero = val;
	}

	findLetterSegment(letter) {
		for (let i=0; i<letterSegments.length; i+=2) {
			if (letterSegments[i] == letter)
				return letterSegments[i+1];
		}
		return letterSegment[1];
	}

	setupTimePixels(value) {
		for (let i=0; i<this.tailSegments.length; i++)
			if (undefined !== this.tailSegments[i].layout.clock)
				this.setLayoutPixelsOn(value, this.tailSegments[i]);
	}

    set effectValue(value) {
// MDK
//		value = ((value * this._speed) / 100.0) | 0;

		if (undefined !== this.tail_sequence)
			this.tail_sequence.idle(value);

		if (undefined !== this.tail_actions)
			this.tail_actions.idle(value);

		this.update(value);
	}

	dimTail(value) {		// pixel buffer, dim buffer, remainder buffer
		let elapsed;
		value = ((value * this._speed) / 100.0) | 0;

		if (undefined === this.lastDimmedMS) {
			this.lastDimmedMS = value;
			return;
		}
		elapsed = value - this.lastDimmedMS;
		this.lastDimmedMS = value;
		this.applyDimming(elapsed, this.pixelBuffer, this.pixelOutBuffer, this.dimBuffer, this.dimDurBuffer, this.dimRemBuffer);
//		this.applyDimming(elapsed, this.pixelBuffer, this.pixelOutBuffer, this.dimBuffer, this.dimDurBuffer);
//		this.applyDimming(elapsed, this.pixelBuffer, this.pixelOutBuffer, this.dimBuffer);
	}

	update(value) {
		let i, j;
		let brightness;
		let tailOff = false;

		if (this._rebooting)		// don't display if about to reboot
			return;

		if (!this.shouldShowTail)
			tailOff = true;

		this.dimTail(value);		// sets up this.pixelOutBuffer
		for (j=0; j<this.tailSegments.length; j++) {
			let layout = this.tailSegments[j].layout;
			brightness = layout?.brightness ?? this._brightness;
				
			let v, p;
			for (i=layout.pxFirst; i<layout.pxLength; i++) {
				p = layout.line[i] + layout.pxOffset;
				if (p >= this.neopixels.length)
					continue;
				if (tailOff && !layout.clock)
					v = 0;
				else
					v = this.brightenAndConvert(this.pixelsOut[p], brightness, layout.order);
				this.neopixels.setPixel(p, v);
			}
		}

        this.neopixels.update();
    }


	_pixSet(layout, pix, value=1) {
		layout.pixOn[pix] = value;
	}

	doColon(v, layout, which) {			// pixel, val, which colon pixel (0-1)
		if (0 === which)
			return;

		let len = layout.colon.length;
		
		if (this.ticks > this.lastBlinkChangeMS + this.blinkTimeMS) {
			this.blinkState = !this.blinkState;
			this.lastBlinkChangeMS = this.ticks;
		}
		let topColon, botColon;
		let m, c1, c2, i;

		switch (len) {
			case 7:
				topColon = layout.colon[2];
				botColon = layout.colon[4];
				break;
			default:
				topColon = layout.colon[0];
				botColon = layout.colon[1];
				break;
		}

		switch (this.colonKind) {
			case 0:			// Solid
				if (which !== 1) this._pixSet(layout, topColon, 1);
				this._pixSet(layout, botColon, 1);
				break;
			case 1:			// Blink
				if (which !== 1) this.blinkState ? this._pixSet(layout, topColon, 1) : this._pixSet(layout, topColon, 0);
				this.blinkState ? this._pixSet(layout, botColon, 1) : this._pixSet(layout, botColon, 0);
				break;
			case 2:			// None
				if (which !== 1) this._pixSet(layout, topColon, 0);
				this._pixSet(layout, botColon, 0);
				break;
			case 3:			// Blink Alternate
				if (which !== 1) this.blinkState ? this._pixSet(layout, topColon, 1) : this._pixSet(layout, topColon, 0);
				(!this.blinkState) ? this._pixSet(layout, botColon, 1) : this._pixSet(layout, botColon, 0);
				break;
			case 4:			// Pulse
			case 5:			// Pulse Alternate
//				this.op_set(topColon, v);
//				this.op_set(botColon, v);
				c1 = this.pixels[topColon];
				c2 = this.pixels[botColon];
				m = (Math.sin(v*this.incVal)/2)+0.5;
				c1 = this.scaleColor(c1, 4 === this.colonKind ? m : 1-m);
				c2 = this.scaleColor(c2, m);
				this.set(topColon, c1);
				this.set(botColon, c2);
				if (which !== 1) this._pixSet(layout, topColon, 1);
				this._pixSet(layout, botColon, 1);
				break;
			case 6:			// solid bar
				for (i=0; i<len; i++)
					this._pixSet(layout, layout.colon[i], 1);
				break;
			case 7:			// Scanner
				break;
			case 8:			// Seconds point
			case 9:			// Countdown
			case 10:		// Countup
				m = ((this.seconds * len) / 60) | 0;
				for (i=0; i<len; i++) {
					if (this.colonKind == 8)
						i == m ? this.op_set(layout.colon[i], v) : this.op_clear(layout.colon[i], v);
					else if (this.colonKind == 9)
						i >= m ? this.op_set(layout.colon[i], v) : this.op_clear(layout.colon[i], v);
					else if (this.colonKind == 10)
						i >= (len - m) ? this.op_set(layout.colon[i], v) : this.op_clear(layout.colon[i], v);
				}
				break;
		}
	}

    setLayoutPixelsOn(value, sevenSeg) {
		let doColons = 2;
		let color, bgColor;
		let displayDigits = 0xF;		// show all 4 digits
		this.ticks = value;

		if (this.blinkSpeed) {
			if (this.ticks > (this.lastBlinkMS + this.blinkSpeed)) {
				this.lastBlinkMS = this.ticks;
				this.blinkDisplayOn = !this.blinkDisplayOn;
			}
			if (this.blinkDisplayOn)
				displayDigits = this.blinkDigits;
			else
				displayDigits = 0;
		}

		if (undefined !== this.userValue) {		// like blinking 12:00
			doColons = this.userColon;
		}
		else {
// the following three are done by the minutes timer
//			let now = new Date();
//			this.timeValue = now.getHours() * 100 + now.getMinutes();
//			this.timeValue24 = this.timeValue;
// seconds are based off of milliseconds (can put in an offset to now.seconds if necessary)
//			this.seconds = now.getSeconds();
			this.seconds = (Time.ticks / 1000) % 60
//			trace(`this.timeValue: ${this.timeValue} - utcHours: ${now.getUTCHours()}\n`);
			if (this.twelve) {
				if (this.timeValue > 1300) this.timeValue -= 1200;
				if (this.timeValue < 100) this.timeValue += 1200;
			}
		}

		if (this.userValue)
			this._valueToDisplay = this.userValue;
		else
			this._valueToDisplay = this.timeValue;

		// this "optimization" doesn't take into account changes in settings
		// parameters like leading zero when deciding whether to update the
		// display
		if ((this.blinkSpeed || (this._lastValueDisplayed !== this._valueToDisplay)) && sevenSeg) {
			let segment_pixels, pix, seg;

			this._lastValueDisplayed = this._valueToDisplay;
			for (let digits=0; digits<4; digits++) {
				let d;
				let skipDigit = 0;

				if (undefined !== this.userValue) {
					let v = this.userValue[3-digits];
					if (v >= "0" && v <= "9")
						d = sevenSegments[parseInt(v)];
					else if (v >= "a" && v <= "z")
						d = this.findLetterSegment(v);
					else
						skipDigit = 1;
				}
				else {
					let v = ((this.timeValue / TenPow[digits]) | 0) % 10;
	
					if ((digits == 3) && (v == 0)) {
						if (!this._zero)
							skipDigit = 1;
					}
					d = sevenSegments[v];		// which 7 segments for this digit
				}
	
				if ( !((1 << digits) & displayDigits) || !this.blinkDisplayOn)
					skipDigit = 1;
	
				segment_pixels = sevenSeg.layout.segments[digits];
	
				for (seg=0; seg<7; seg++) {
					const pixels = segment_pixels[seg];
					const length = pixels.length;
					if (!skipDigit && (d & 0b10000000)) {	// segment that should be on
						for (pix=0; pix<length; pix++)
							sevenSeg.layout.pixOn[pixels[pix]] = 1;
					}
					else {
						for (pix=0; pix<length; pix++)
							sevenSeg.layout.pixOn[pixels[pix]] = 0;
					}
					d <<= 1;
				}
			}

			// colons
			for (let n=0; n<sevenSeg.layout.colon.length; n++)
				sevenSeg.layout.pixOn[sevenSeg.layout.colon[n]] = 0;
			this.doColon(value, sevenSeg.layout, doColons);
		}
	}

	clearTailSegments() {
		while (undefined !== this.tailSegments.pop()) {
		}
		global.LayoutPixelOffset = undefined;
	}

	addTailSegment(seg) {
		seg.display = this;
		this.tailSegments.push(seg);
	}

	get speed() {
		return this._speed;
	}

	set speed(a) {
		this._speed = a;
	}

	setPixel(p, c, scalePerMS=0, duration=1000) {
		this.pixels[p|0] = c;
		this.dimArray[p|0] = scalePerMS;		// 0 - 1.0	(scale per ms)
		this.dimDur[p|0] = duration;
	}

	scaleColor(c, amt) @ "xs_scaleColor";				// 0..1.0
//	_dim(color, amt) @ "xs_dimColor";

	dimRange(pixels, start, end, amt) @ "xs_dimRange";

	dim(start, end, amt) {
		return this.dimRange(this.pixelBuffer, start, end, amt);
	}

	applyDimming(elapsed, pixels, pixelsOut, scaleArray, durArray, remArray) @ "xs_applyDimming";

/*
	xyToPixel(x, y) {
		if (undefined === this.pixel_loc)
			return -1;
		return this.pixel_loc[x|0][y|0];
	}

	pixelToXY(p) { return this.pixel_xy[p]; }
*/

	setupMinuteTimer() {
		let now = new Date();
		this.timeValue = now.getHours() * 100 + now.getMinutes();
		this.timeValue24 = this.timeValue;
		let secs = 60 - now.getSeconds();	// offset to next minute

		if (undefined !== this.minuteTimer)
			Timer.clear(this.minuteTimer);

		this.setupTimePixels(Time.ticks);
		this.minuteTimer = Timer.set(id => {
			let now = new Date();
			this.timeValue = now.getHours() * 100 + now.getMinutes();
			this.timeValue24 = this.timeValue;
			this.setupTimePixels(Time.ticks);
		}, secs * 1000, 60 * 1000);
	}

	showTime() {
		this.userValue = undefined;	// don't blink 12
		this.blinkSpeed = 0;
		this.blinkDisplayOn = 1;

		this.setupMinuteTimer();
	}

	blink(speed=500, digits=0xf) {
		this.blinkSpeed = speed;
		this.blinkDigits = digits;
	}

	brightenAndConvert(color, brightness, order) @ "xs_brightenAndConvert";

}

export default SevenSegDisplay;
Object.freeze(SevenSegDisplay.prototype);
Object.freeze(letterSegments);
Object.freeze(TenPow);
