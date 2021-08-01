/*
 * Copyright (c) 2019  Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK.
 * 
 *   This work is licensed under the
 *       Creative Commons Attribution 4.0 International License.
 *   To view a copy of this license, visit
 *       <https://creativecommons.org/licenses/by/4.0>.
 *   or send a letter to Creative Commons, PO Box 1866,
 *   Mountain View, CA 94042, USA.
 *
 */

import Preference from "preference";
import config from "mc/config";

const PREF_WIFI = "wifi";
const PREF_CLOCK = "clock";

const DEFAULT_LAYOUT = 0;
const EXTRA_PIXELS_DEFAULT = 50;

const PREF_KEY_NAME = "name";
const PREF_KEY_SSID = "ssid";
const PREF_KEY_PASS = "password";
const PREF_KEY_TZ 	= "tz";
const PREF_KEY_LAYOUT = "layout";
const PREF_KEY_ZERO = "zero";
const PREF_KEY_PIN = "pin";
const PREF_KEY_DST = "dst";
const PREF_KEY_BRIGHTNESS = "brightness";
const PREF_KEY_TWELVE = "twelve";
const PREF_KEY_DISPLAY_SPEED = "speed";
const PREF_KEY_TAIL_SCHEDULE = "tail_sched";
const PREF_KEY_TAIL_TIME_ON = "tail_time_on";
const PREF_KEY_TAIL_TIME_OFF = "tail_time_off";
const PREF_KEY_BUTTON_A = "buttonA";
const PREF_KEY_BUTTON_B = "buttonB";
const PREF_KEY_DEVICE = "dev";
const PREF_KEY_SEQUENCE = "seq"

export class ClockPrefs {
	constructor() {
		this.neopixel_pins = [ 22, 23 ];
		this.button_pins = [ "none", 0, 32, 34, 35 ];
		this.dst_types = [ "Off", "On", "Auto" ];
		this._storedName = this.getPref(PREF_CLOCK, PREF_KEY_NAME, "clock");
		this._name = this._storedName;
		this._ssid = this.getPref(PREF_WIFI, PREF_KEY_SSID);
		this._pass = this.getPref(PREF_WIFI, PREF_KEY_PASS);
		this._tz = this.getPref(PREF_CLOCK, PREF_KEY_TZ, 3)|0;
		this._layout = this.getPref(PREF_CLOCK, PREF_KEY_LAYOUT, DEFAULT_LAYOUT)|0;
		this._zero = this.getPref(PREF_CLOCK, PREF_KEY_ZERO, 0)|0;
		this._pin = this.getPref(PREF_CLOCK, PREF_KEY_PIN, 23);
		this._dst = this.getPref(PREF_CLOCK, PREF_KEY_DST, 0)|0;
		this._brightness = this.getPref(PREF_CLOCK, PREF_KEY_BRIGHTNESS, 36)|0;
		this._twelve = this.getPref(PREF_CLOCK, PREF_KEY_TWELVE, 1)|0;
		this._speed = this.getPref(PREF_CLOCK, PREF_KEY_DISPLAY_SPEED, 100)|0;
		this._tail_sched = this.getPref(PREF_CLOCK, PREF_KEY_TAIL_SCHEDULE, 0);
		this._tail_time_on = this.getPref(PREF_CLOCK, "tail_time_on", "1700");
		this._tail_time_off = this.getPref(PREF_CLOCK, "tail_time_off", "0100");
		this._buttonA = this.getPref(PREF_CLOCK, "buttonA", 34);
		this._buttonB = this.getPref(PREF_CLOCK, "buttonB", 35);

		this._device = this.getPref(PREF_CLOCK, PREF_KEY_DEVICE, "default");
		this._sequence = this.getPref(PREF_CLOCK, PREF_KEY_SEQUENCE, "default");
	}

    reset() {
        Preference.delete(PREF_WIFI, PREF_KEY_SSID);
        Preference.delete(PREF_WIFI, PREF_KEY_PASS);
		Preference.delete(PREF_CLOCK, PREF_KEY_NAME);
		Preference.delete(PREF_CLOCK, PREF_KEY_TZ);
		Preference.delete(PREF_CLOCK, PREF_KEY_DST);
		Preference.delete(PREF_CLOCK, PREF_KEY_BRIGHTNESS);
		Preference.delete(PREF_CLOCK, PREF_KEY_TWELVE);
		Preference.delete(PREF_CLOCK, PREF_KEY_LAYOUT);
		Preference.delete(PREF_CLOCK, PREF_KEY_EXTRA);
		Preference.delete(PREF_CLOCK, PREF_KEY_TAIL_ON);
		Preference.delete(PREF_CLOCK, PREF_KEY_TAIL_ONLY);
		Preference.delete(PREF_CLOCK, "speed");
		Preference.delete(PREF_CLOCK, "tail_sched");
		Preference.delete(PREF_CLOCK, "tail_time_on");
		Preference.delete(PREF_CLOCK, "tail_time_off");
//		Preference.delete(PREF_CLOCK, PREF_KEY_PIN);
//		Preference.delete(PREF_CLOCK, "buttonA");
//		Preference.delete(PREF_CLOCK, "buttonB");
    }

	get name() { return this._name; }
	set name(v) {this._name = v; }

	get storedName() { return this._storedName; }
	set storedName(v) {this._storedName = v; this._name = v; Preference.set(PREF_CLOCK, "name", this._name); }

	get ssid() { return this._ssid; }
	set ssid(v) { this._ssid = v; Preference.set(PREF_WIFI, PREF_KEY_SSID, this._ssid); }

	get pass() { return this._pass; }
	set pass(v) { this._pass = v; Preference.set(PREF_WIFI, PREF_KEY_PASS, this._pass); }

	get tz() { return this._tz; }
	set tz(v) {
		if (this._tz != v|0) {
			this._tz = v|0;
			Preference.set(PREF_CLOCK, PREF_KEY_TZ, this._tz);
			if (undefined !== this.owner)
				this.owner.fetchTime();
		}
	}

	get dst() { return this._dst; }
	set dst(v) {
		if (this._dst != v|0) {
			this._dst = v|0;
			Preference.set(PREF_CLOCK, PREF_KEY_DST, this._dst);
			if (undefined !== this.owner)
				this.owner.fetchTime();
		}
	}

	get pin() { return this._pin; }
	set pin(v) {
		if (this._pin != v|0) {
			this._pin = v|0;
			Preference.set(PREF_CLOCK, PREF_KEY_PIN, this._pin);
			if (undefined !== this.owner)
				this.owner.display.pin = this._pin;
		}
	}

	get zero() { return this._zero; }
	set zero(v) {
		if (this._zero != v|0) {
			this._zero = v|0;
			Preference.set(PREF_CLOCK, PREF_KEY_ZERO, this._zero);
			if (undefined !== this.owner)
				this.owner.display.zero = this._zero;
		}
	}

	get layout() { return this._layout; }
	set layout(v) {
		if (this._layout != v|0) {
			this._layout = v|0;
			Preference.set(PREF_CLOCK, PREF_KEY_LAYOUT, this._layout);
			if (undefined !== this.owner)
				this.owner.display.layout = this._layout;
		}
	}

	get device() { return this._device; }
	set device(v) {
		if (this._device != v) {
			this._device = v;
			Preference.set(PREF_CLOCK, PREF_KEY_DEVICE, this._device);
		}
	}

	get sequence() { return this._sequence; }
	set sequence(v) {
		if (this._sequence != v) {
			this._sequence = v;
			Preference.set(PREF_CLOCK, PREF_KEY_SEQUENCE, this._sequence);
		}
	}

	get twelve() { return this._twelve; }
	set twelve(v) {
		if (this._twelve != v|0) {
			this._twelve = v|0;
			Preference.set(PREF_CLOCK, PREF_KEY_TWELVE, this._twelve);
			if (undefined !== this.owner)
				this.owner.display.twelve = this._twelve;
		}
	}

	get brightness() { return this._brightness; }
	set brightness(v) {
		if (this._brightness != v|0) {
			this._brightness = v|0;
			Preference.set(PREF_CLOCK, PREF_KEY_BRIGHTNESS, this._brightness);
			if (undefined !== this.owner)
				this.owner.display.brightness = this._brightness;
		}
	}
		
	get tail_sched() { return this._tail_sched; }
	set tail_sched(v) {
		if (this._tail_sched != v|0) {
			this._tail_sched = v|0;
			Preference.set(PREF_CLOCK, "tail_sched", this._tail_sched);
			if (undefined !== this.owner)
				this.owner.display.tail_sched = this._tail_sched;
		}
	}
	
	get tail_time_on() { return this._tail_time_on; }
	set tail_time_on(v) {
		if (this._tail_time_on != v|0) {
			this._tail_time_on = v|0;
			Preference.set(PREF_CLOCK, "tail_time_on", this._tail_time_on);
			if (undefined !== this.owner)
				this.owner.display.tail_time_on = this._tail_time_on;
		}
	}
	
	get tail_time_off() { return this._tail_time_off; }
	set tail_time_off(v) {
		if (this._tail_time_off != v|0) {
			this._tail_time_off = v|0;
			Preference.set(PREF_CLOCK, "tail_time_off", this._tail_time_off);
			if (undefined !== this.owner)
				this.owner.display.tail_time_off = this._tail_time_off;
		}
	}

	get speed() { return this._speed; }
	set speed(v) {
		if (this._speed != v) {
			this._speed = v;
			Preference.set(PREF_CLOCK, "speed", this._speed);
			if (undefined !== this.owner)
				this.owner.display.speed = this._speed;
		}
	}

	get buttonA() { return this._buttonA; }
	set buttonA(v) {
		if (v !== "none")
			this._buttonA = parseInt(v);
		Preference.set(PREF_CLOCK, "buttonA", this._buttonA);
	}

	get buttonB() { return this._buttonB; }
	set buttonB(v) {
		if (v !== "none")
			this._buttonB = parseInt(v);
		Preference.set(PREF_CLOCK, "buttonB", this._buttonB);
	}

	getPref(domain, key, default_value) {
		let ret = Preference.get(domain, key);
		if (undefined === ret) ret = default_value;
		return ret;
	}

	loadPref(element,i,a) {
		let p = Preference.get(PREF_STYLE, element.tag);
		if (undefined !== p)
			element.prefsJson = p;
	}

	savePref(element,i,a) {
		Preference.set(PREF_STYLE, element.tag, element.prefsJson);
	}

	resetPref(element, i, a) {
		Preference.delete(PREF_STYLE, element.tag);
	}

};

export default ClockPrefs;

