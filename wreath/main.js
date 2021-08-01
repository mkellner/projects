/*
 * Copyright (c) 2019-2020  Moddable Tech, Inc.
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

/*
	ToDo:
		Access control
		secure preferences
		connect with Android devices (use BT beacon to advertise address?)
			(added IP discovery from the interface)

	Future:
		extended strand effects

	Opportunities/projects:
		alarm
			mp3 player
			internet radio
			physical bell
			snooze button
	x	Time/temp/barometer
	x	Second display expansion (time + temp)
		automatically use an open access point (ie. no password)
		advertise time with bluetooth beacon
*/

import config from "mc/config";

import Timer from "timer";
import Time from "time";
import WiFi from "wifi";
import {Request, Server} from "http";
import Net from "net";
import SNTP from "sntp";
import Resource from "Resource";
import MDNS from "mdns";
import Preference from "preference";
import {File} from "file";
import Monitor from "pins/digital/monitor";
import Digital from "pins/digital";
import DS1307 from "ds1307";
import DS3231 from "ds3231";
import RV3028 from "rv3028";
import Scanner from "wifiscanner";
import Weather from "weather";

import SevenSegDisplay from "sevenseg";
import html_content from "web";
import OTARequest from "update";

import { TailActions, TailSegment, TailActionSequence, } from "tail";
import { someFiles } from "storage";

Timer.delay(1);

import ClockPrefs from "prefs";
import ClockButton from "buttons";

const USE_RTC = 0;
const DO_WEATHER = 0;

const PROD_NAME = "Ornaments"; // "ModClock";
//const UPDATE_URL = "http://wildclocks.com/superclock/clock.update.test";

const REMOTE_SCRIPTS = "http://wildclocks.com/superlights/";
const UPDATE_URL = "http://wildclocks.com/superlights/clock.update.current";
//const REMOTE_SCRIPTS = "http://wildclocks.com/superlights/";
const LOCAL_SCRIPTS = "http://192.168.4.1/";

const WEB_ASSET_HOST = "wildclocks.com";
const WEB_ASSET_PATH_BASE = "/superlights/json/";

const AP_NAME = "clock";
const AP_PASSWORD = "12345678";
let ap_name = AP_NAME;

const LOCAL_ONLY = 0;			// don't do network

const MAX_WIFI_SCANS = 2;		// before opening the access point
const SCAN_TIME = 5000;

const BUTTON_PIN = 0;

const BUTTON_DEBOUNCE_MS = 30;
const BUTTON_CHANGE_TIME_MS = 1000;		// hold > 2s to set time
const BUTTON_ACCEPT_TIME_MS = 2500;		// hold > 4s to accept time
const BUTTON_ERASE_WARNING_TIME_MS = 8000;		// blink like mad at 8s to warn of imending erasure
const BUTTON_ERASE_PREFS_MS = 10000;	// hold 10 s to erase prefs

const STATE_SETUP =				0;
const STATE_SHOW_TIME =			1;
const STATE_CYCLE_MODE =		2;
	const CYCLE_MODE_MS =		800;
	const CYCLE_ITERATE_MS =	1000;
	const SETTING_ITER1_MS =    1500;
	const SETTING_ITER2_MS =    1000;
	const SETTING_ITER3_MS =    800;
	const MODE_SET =	0;
	const MODE_2412 =	1;
	const MODE_DST =	2;
	const MODE_BRIGHT =	3;
	const MODE_TAIL =	4;
	const MODE_TAIL_BRIGHT =	5;
	const MODE_BOOT =	6;
	const MODE_CLEAR =	7;
	const MODE_MAX =	7;
const STATE_SET_HOURS =			3;
const STATE_SET_10MINUTES =		4;
const STATE_SET_MINUTES =		5;
const STATE_SET_DONE =			7;
const STATE_SET_2412 =			8;
const STATE_SET_DST =			9;
const STATE_SET_BRIGHT =		10;
const STATE_SET_TAIL =			11;
const STATE_SET_TAIL_BRIGHT =	12;
const STATE_BOOT_CONFIRM =		13;
const STATE_CLEAR_CONFIRM =		14;

const ntpHosts = ["0.pool.ntp.org", "1.pool.ntp.org", "2.pool.ntp.org" ];
//const ntpHosts = ["ntp-b.nist.gov", "ntp-wwv.nist.gov", "ntp-c.colorado.edu", "ntp-d.nist.gov" ];

// let hostName = "clock";

let prefs = new ClockPrefs();

trace(`Clock starting... Name: ${prefs.name}\n`);

Time.set(0);

const SELECTION_BAR = [
	{ "link": "tail", "title": "Tail" },
	{ "link": "layout", "title": "Layout" },
	{ "link": "options", "title": "Clock Options" },
	{ "link": "network", "title": "Network" },
	{ "link": "http://wildclocks.com/superclock/inst", "title": "Instructions", "target":"_blank" }
];

const REBOOT_TIME = 60000 * 5;	// 5 minutes

function resetRebootTimer() {
trace("resetRebootTimer\n");
	global.needsReboot = 1;
	global.rebootTimer = Timer.set(id => {
		if (global.needsReboot) {
			trace("REBOOT TIMER triggered\n");
			doRestart();
		}
	}, REBOOT_TIME);
}
resetRebootTimer();

let accessPointList = [];
const RESET_TIME_INTERVAL = (1000 * 60 * 60 * 12);		// 12 hours
const favico = new Resource("favicon.ico");
const clock_css = new Resource("clock.css");

const WEATHER_CHECK = 60000;	// 1 minute


const Timing_WS2811 = {
    mark:  { level0: 1, duration0: 950,  level1: 0, duration1: 350, },
    space: { level0: 1, duration0: 350,   level1: 0, duration1: 950, },
    reset: { level0: 0, duration0: 60000, level1: 0, duration1: 60000, } };
Object.freeze(Timing_WS2811);

class Clock {
	constructor(prefs) {
		this.prefs = prefs;
		prefs.owner = this;

		this.owner = this;
		this.fileMgr = new someFiles({host:WEB_ASSET_HOST, path:WEB_ASSET_PATH_BASE, owner:this.owner});

Timer.delay(100);
		// hack - find length of all elements
		const device = this.fileMgr.readDevice(prefs.device);
		let devLen = 0;
		for (let i=0; i<device.dev.length; i++) {
			if (undefined !== device.dev[i].len)
				devLen += device.dev[i].len;
			else {
				const layout = config.layouts.find(el => el.tok == device.dev[i].layout_id);
				devLen += layout.len;
			}
		}

		this.display = new SevenSegDisplay( {
			length:devLen,
//			length:150,
			pin:prefs.pin,
			tail_sched:prefs.tail_sched,
			tail_time_on:prefs.tail_time_on,
			tail_time_off:prefs.tail_time_off,
			speed:prefs.speed,
			timing:Timing_WS2811,
			zero:prefs.zero,
			twelve:prefs.twelve, 
			brightness:prefs.brightness } );

		this.display.tail_actions = new TailActions({display:this.display});

		this.setupDevice(device);

		this.controller = { clock: this, fileMgr: this.fileMgr, next: this.nextSequence, loadFile: this.setupTailFile, loadWebFile: this.setupWebFile};

		this.setupTailFile(this.controller, prefs.sequence);
		this.setupButton0();
		this.setupButtonAB();

		this.display.start();
		this.display.value("helo");

		this.connecting = 0;
		this.usingAP = false;

		this.selectionBarSelected = 0;

		if (!LOCAL_ONLY) {
			this.setupRtc();
			if (this.rtc.valid) 
				this.display.showTime();
			else
				this.display.value("scan").blink();

			if (this.prefs.ssid)
				this.connect(this.prefs.ssid, this.prefs.pass);
			else
				this.configAP(ap_name, AP_PASSWORD);
		}

trace(`uiState: SHOW_TIME\n`);
		this.uiState = STATE_SHOW_TIME;

		if (DO_WEATHER) {
			this.weather = new Weather();
			this.temperature = this.weather.temp;
			this.weatherTimer = Timer.set(id => {
				let x, decimal = false;
				if (!this.connectionWasEstablished)
					return;

				this.temperature = this.weather.temp;
				if (this.temperature < 100) {
					this.temperature *= 10;
					decimal = 1;
				}
				x = `${this.temperature | 0}${this.weather.unit}`;
				this.display.value(x, decimal);
				trace(`the temperature is: ${this.weather.temp}\n`);
			}, 0, WEATHER_CHECK);		// wait a second for the response to be sent
		}

	}

	setupDevice(device) {
		if ((undefined === device) || (undefined === device.dev) || (undefined === device.name))
			return 0;
		this.display.tail_sequence?.stop();
		this.display.clearTailSegments();
		this.device = device;

		let len = 0;
		for (let o=0; o<this.device.dev.length; o++) {
			let seg = new TailSegment(this.device.dev[o]);
			this.display.addTailSegment( seg );
			len += seg.length;
		}
		this.display.length = len;
		return len;
	}

	setupWebFile(controller, filename) {
trace(`setupWebFile - ${filename}\n`);
		controller.fileMgr.readWebSeq(filename, controller.clock.setupTailSeq);
	}

	setupTailFile(controller, filename) {
trace(`setupTailFile - ${filename}\n`);
		return controller.clock.setupTailSeq(controller.fileMgr.readSequence(filename));
	}

	setupTailSeq(tailSeq) {
		let seq = tailSeq?.sequence?.seq ?? tailSeq?.seq;
		
//		if ((undefined === tailSeq) || (undefined === tailSeq.seq) || (undefined === tailSeq.name)) {
		if (!seq) {
			trace("tailSeq is undefined or bad\n");
			return 0;
		}

// 		this.sequence = tailSeq;
 		this.owner.sequence = tailSeq?.sequence ?? tailSeq;
		if (this.owner.display.tail_sequence)
			this.owner.display.tail_sequence.stop();
//		this.display.tail_sequence = new TailActionSequence(this.display, tailSeq, this.controller);
		this.owner.display.tail_sequence = new TailActionSequence(this.owner.display, this.owner.sequence, this.owner.controller);
		this.owner.display.start();
		return 1;
	}

	getbuildstring() @ "xs_getbuildstring";

	doWiFiScan() {
		trace("create a new wifi scanner\n");
//		this.scanner?.close();
if (undefined !== this.scanner) {
	trace(`calling close on old scanner\n`);
	this.scanner.close();
}
	Timer.set(() => {
		this.scanner = new Scanner({
			interval: 60_000,
			scanOptions: {
				active: this.AP ? true : false,		// passive scans fail in AP+STA mode (why?)
			},
			onFound: (ap) => {
				trace(`scanner: onFound (${ap.ssid}) [${ap.ssid.length}]\n`);
				if (ap.ssid)
					accessPointList.push(ap);
			},
			onLost: (ssid) => {
				trace(`scanner: onLost ${ssid}\n`);
				const i = accessPointList.findIndex(x => x.ssid === ssid);
				if (i >= 0)
					accessPointList.splice(i, 1);
			},
			onScanning: (v) => {
				trace(`scanner: onScanning ${v}\n`);
			}
		});
	}, 1_000);		// small delay before starring scanner 

	}

	connect(ssid, password) {
		if (this.connecting > 0) {
			trace(`Already trying to connect WiFi (passed <${ssid}>)...\n`);
			return;
		}

		if (this.rtc.valid) 
			this.display.showTime();
		else
			this.display.value("conn").blink();
		this.connecting++;
        this.connectionWasEstablished = 0;

		trace(`Starting WiFi to connect to <${ssid}>...\n`);
		
        WiFi.connect({ssid, password});
        if (this.myWiFi)
            return;

		this.myWiFi = new WiFi;
        this.myWiFi.onNotify = msg => {
            trace(`Wi-Fi msg: ${msg}.\n`);
			switch (msg) {
				case WiFi.gotIP:
					if (!this.connectionWasEstablished) {
						trace(`WiFi gotIP: ${Net.get("IP")}. Going to connect to the local network.\n`);
						this.connected();
					}
					break;

				case WiFi.disconnected:
					this.unconfigServer();
					this.scanner?.close();
					delete this.scanner;
					accessPointList.length = 0;
					this.connecting = 0;

					this.display.value(this.connecting ? "fail" : "fa-x").blink();

					Timer.set(() => {
						if (this.connectionWasEstablished) {
							trace("WiFi disconnected - try reconnect\n");
							this.connect(ssid, password);
						}
						else {
							trace("WiFi never established - start access point\n");
							this.configAP(ap_name, AP_PASSWORD);
						}
					}, 5_000);		// give scanner a chance to finish & don't thrash access point
					break;
			}
		}
    }

	connected() {
		this.connecting = 0;
		this.connectionWasEstablished = 1;
		if (this.rtc.valid) {
			this.display.showTime();
		}
		else {
			this.display.value("yay").blink();
		}
		this.fetchTime();
		this.configServer();
trace(`connected - after configServer, calling wifiscan\n`);
		this.doWiFiScan();
		this.fileMgr.fetchWebnameList();
	}

	advertiseServer() {
		let name = this.prefs.name;
		if (this.usingAP)
			name = ap_name;

		this.mdns = new MDNS({hostName: name, prefs: this.prefs}, function(message, value) {
			if (1 === message) {
				if ('' !== value) {
					if (value !== clock.prefs.name) {
						clock.prefs.name = value;
					}
				}
			}
		});
		this.mdns.clock = this;
	}

	checkName(newName, oldName) {
		if ((undefined !== newName) && (newName.length > 3) && (newName != oldName)) {
			return newName.split(' ').join('_').toLowerCase();
//			return newName.replace(/\s+/g,"_").toLowerCase();
		}
		return 0;
	}

	parseTimeReq(timeRequest) {
		if (undefined === timeRequest)
			return 0;
		let h = timeRequest.slice(0,2);
		let m = timeRequest.slice(-2);
		return h+m;
	}


// checkFormat looks for "f" within formats. If not found, treat f as an index
	checkFormat(formats, f) {
		if (formats.includes(f))
			return f;
		let i = parseInt(f);
		i = (i >= formats.length) ? formats.length : i;
		return formats[i];
	}

	checkPass(newPass, oldPass) {
		if ((undefined !== newPass) && (newPass.length > 7) &&  (oldPass != newPass))
			return 1;
		return 0;
	}

	configServer() {
		this.suffixLine = "build: " + this.getbuildstring();

		this.uiServer = new Server();
		this.uiServer.clock = this;
		this.uiServer.callback = function(message, value, v2) {
			let clock = this.server.clock;
			let name = clock.prefs.name;
			let scriptServer = clock.connectionWasEstablished ? REMOTE_SCRIPTS : LOCAL_SCRIPTS;
//trace(`[${Time.ticks}] msg: ${message}\n`);
			switch (message) {
				case Server.status:
					global.needsReboot = 0;
					this.userReq = [];
					this.path = value;
					this.redirect = 0;
					break;

				case Server.headersComplete:
					return String;

				case Server.requestComplete:
//trace(`Server.requestComplete\n`);
					let postData = value.split("&");

					this.userReq.dataValid = postData.length > 1;

					for (let i=0; i<postData.length; i++) {
						const equal = postData[i].indexOf("=");
						if (equal < 0)
							continue;
						let name = postData[i].slice(0, equal);
//						let value = postData[i].slice(equal + 1);
						let value = decodeURIComponent(postData[i].slice(equal + 1));
						value = value.split("+").join(" ").trim();
//						value = value.join(" ");
						this.userReq[name] = value;
					}
					this.redirect = 1;
					if (this.path == "/rescanSSID" || this.path.slice(0,19) == "/current_version.js")
						this.redirect = 0;
					else if (this.path == "/tail") {
//						this.redirect = 1;
//						clock.prefs.extra = parseInt(this.userReq.extra);
						clock.prefs.tail_sched = checkboxValue(this.userReq, "tail_sched");
						clock.prefs.tail_time_on = clock.parseTimeReq(this.userReq.tail_time_on);
						clock.prefs.tail_time_off = clock.parseTimeReq(this.userReq.tail_time_off);
						let oldSpeed = clock.prefs.speed;
						clock.prefs.speed = parseInt(this.userReq.speed);
						clock.display.start();
					}
					else if (this.path == "/layout") {
						if (undefined !== this.userReq.sequence) {
							clock.prefs.sequence = this.userReq.sequence;
							clock.controller.loadFile(clock.controller, clock.prefs.sequence);
							clock.display.start();
						}
						if (undefined !== this.userReq.webSeq) {
							clock.controller.loadWebFile(clock.controller, this.userReq.webSeq);
							clock.prefs.sequence = this.userReq.webSeq;
							clock.display.start();
						}

//						trace(`device: ${this.userReq.device}\n`);
						if (undefined !== this.userReq.device) {
trace(`device characters: ${this.userReq.device.length}\n`);
							try {
								let resp = JSON.parse(this.userReq.device);
trace(`change config: ${this.userReq.device}\n`);
								if (undefined !== resp?.device?.name) {
									if (clock.setupDevice(resp.device)) {
										clock.fileMgr.writeDevice(resp.device.name, resp.device);
										clock.prefs.device = resp.device.name;
									}
								}
								if (undefined !== resp?.sequence?.name) {
									if (clock.setupTailSeq(resp.sequence)) {
										clock.fileMgr.writeSequence(resp.sequence.name, resp.sequence);
										clock.prefs.sequence = resp.sequence.name;
									}
								}
								clock.display.start();
							}
							catch (e) {
								trace(`bad configuration JSON\n`);
							}
						}
//						this.redirect = 1;
//just get once at connect				clock.fileMgr.fetchWebnameList();
					}
					
					else if (this.path == "/options") {
//						this.redirect = 1;
					}
					else if (this.path == "/setTime") {
						let aTime = clock.parseTimeReq(this.userReq.set_clock_time);
						clock.setTimeFromText(aTime);
						clock.display.start();
//						this.redirect = 1;
					}
					else if (this.path == "/set-ssid") {
						if (!this.userReq.ssid)
							this.userReq.ssid = this.userReq.ssid_select;
						this.redirect = 0;
					}
					break;

				case Server.prepareResponse:
//trace(`Server.prepareResponse\n`);
					let msg = [];

					if (this.userReq) {
						name = clock.checkName(this.userReq.clock_name, clock.prefs.name);
						if (0 === name)
							name = clock.prefs.name;
						else {
							msg.push(html_content.redirectHead(name, 90), " ", html_content.bodyPrefix(), ` Changing clock name to <b>${name}</b>.<br>Please allow up to 90 seconds for restart.<p><a href="http://${name}.local">http://${name}.local</a><p>`, html_content.bodySuffix(this.server.clock.suffixLine));
							this.redirect = 0;
						}
					}

					if (this.redirect) {
						msg.push(html_content.redirectHead(clock.prefs.name, 0, this.path), html_content.bodyPrefix(), "One moment please.", html_content.bodySuffix(this.server.clock.suffixLine));
					}

					if (this.path == "/set-ssid") {
						if (this.userReq.ssid) {
							msg.push(html_content.head(name, scriptServer), html_content.bodyPrefix(), html_content.changeSSIDResp(this.userReq.ssid, name), html_content.bodySuffix(this.server.clock.suffixLine));
						}
						trace("new ssid requested\n");
					}
					/* -- these two are to respond to local requests for remote server content when not on the internet */
					else if (this.path.slice(0,19) == "/current_version.js") {
						return {headers: ["Cache-Control", "public, max-age=31536000"], body: "function current_version() { return 'current';} function check_update(version) { return false; } function version_description() { return 'local'; }" };
					}
					/* -- end these two */
					else if (this.path == "/clock.css") {
						return {headers: ["Content-type", "text/css", "Cache-Control", "public, max-age=600"], body: clock_css.slice(0)};
					}
					else if (this.path == "/favicon.ico") {
						return {headers: ["Content-type", "image/vnd.microsoft.icon", "Cache-Control", "public, max-age=31536000"], body: favico.slice(0)};
					}
					else if (this.path == "/reset") {
						msg.push(html_content.head(name, scriptServer), html_content.bodyPrefix(), html_content.resetPrefsResp());
					}
					else if (!this.redirect && !msg.length) {
						let impliedPath = this.path;
						let head = html_content.head(name, scriptServer) + html_content.bodyPrefix() + html_content.clockScripts(clock, scriptServer) + html_content.masthead(PROD_NAME, name);
						if (undefined !== clock.ota)
							head += html_content.ota_status(clock.ota.received, clock.ota.length);
						if (!clock.connectionWasEstablished) {
							head += html_content.noAccessPointSet();
							if (impliedPath == "/")
								impliedPath = "/network";
						}

						switch (impliedPath) {
							case "/options":
							case "/setTime":
								clock.selectionBarSelected = 2;
								msg.push(html_content.clockOptionsSection(clock), html_content.clockSetTimeSection(clock), html_content.clockResetPrefsSection(clock));
								break;
							case "/network":
							case "/rescanSSID":
								clock.selectionBarSelected = 3;
								msg.push(html_content.accessPointSection(accessPointList, clock.prefs.ssid, clock.prefs.name));
								if (!this.usingAP)
									msg.push(html_content.clockUpdateCheck(clock));
								break;
							case "/layout":
								clock.selectionBarSelected = 1;
								msg.push(html_content.clockConfigSection(clock));
								break;
							case "/tail":
							default:
								clock.selectionBarSelected = 0;
								msg.push(html_content.clockTailSection(clock, scriptServer));
								break;
						}

						msg.unshift(head, html_content.selection_bar(SELECTION_BAR, clock.selectionBarSelected));
						msg.push(html_content.bodySuffix(this.server.clock.suffixLine));
					}
					let byteLength = 0;
					msg = msg.map(item => new Uint8Array(ArrayBuffer.fromString(item)));
					msg.forEach(item => byteLength += item.byteLength);
					let b = new Uint8Array(byteLength);
					b.position = 0;
					msg.forEach(item => {
						b.set(item, b.position);
						b.position += item.byteLength;
					});
					msg = b;

					msg.position = 0;
						this.msg = msg;
					return {headers: ["Content-type", "text/html", "Content-length", msg.byteLength], body: true};
					break;

				case Server.responseFragment:
//trace(`Server.responseFragment\n`);
					let ret;
					if (this.msg) {
						ret = this.msg.subarray(this.msg.position, value + this.msg.position);
						this.msg.position += value;
						if (this.msg.position >= this.msg.length)
							delete this.msg;
					}
					return ret;
	
				case Server.responseComplete:
//trace(`Server.responseComplete\n`);
					let resetTime = 0;
					let restartClock = 0;
					if (this.path == "/set-ssid") {
						if ((undefined !== this.userReq.ssid) && (clock.prefs.ssid != this.userReq.ssid)) {
							clock.prefs.ssid = this.userReq.ssid;
							restartClock++;
						}

						if (!this.userReq.password) {
							if (clock.prefs.pass) {
								clock.prefs.pass = ""
								restartClock++;
							}
						}
						else if (clock.checkPass(this.userReq.password, clock.prefs.pass)) {
							clock.prefs.pass = this.userReq.password;
							restartClock++;
						}
						if (0 != (name = clock.checkName(this.userReq.clock_name, clock.prefs.name))) {
							clock.prefs.storedName = name;
							restartClock++;
						}
					}
					else if (this.path == "/options") {
//						if (this.userReq.length == 0)
						if (!this.userReq.dataValid)
							break;

						if (clock.prefs.tz != this.userReq.timezone) {
							clock.prefs.tz = this.userReq.timezone;
							resetTime = 1;
						}

						if (clock.checkName(this.userReq.clock_name, clock.prefs.name)) {
							clock.prefs.storedName = this.userReq.clock_name;
							restartClock++;
						}

				// checkboxes return no value if they aren't checked. So undefined === 0

						clock.prefs.twelve = checkboxValue(this.userReq, "twelve");
						clock.prefs.zero = checkboxValue(this.userReq, "zero");


						let dst = dstValue(clock.prefs.dst_types, this.userReq, "dst");
						if (dst != clock.prefs.dst) {
							clock.prefs.dst = dst;
							resetTime = 1;
						}

						if (this.userReq.buttonA != clock.prefs.buttonA) {
							clock.prefs.buttonA = this.userReq.buttonA;
							restartClock++;
						}
						if (this.userReq.buttonB != clock.prefs.buttonB) {
							clock.prefs.buttonB = parseInt(this.userReq.buttonB);
							restartClock++;
						}
						if (parseInt(this.userReq.pin) != clock.prefs.pin) {
							clock.prefs.pin = parseInt(this.userReq.pin);
							restartClock++;
						}
					}
					else if (this.path == "/reset") {
						clock.prefs.reset();
						trace("restarting after resetting preferences\n");
						restartClock++;
					}
					else if (this.path == "/checkForUpdate") {
						if (undefined === clock.ota) {
							clock.ota = new OTARequest(UPDATE_URL);
							clock.ota.onFinished = doRestart;
						}
					}
					else if (this.path == "/rescanSSID") {
trace(` from web - /rescanSSID - about to wifiscan\n`);
						clock.doWiFiScan();
					}
	
					if (restartClock) {
						Timer.set(id => { doRestart(clock); }, 1000);		// wait a second for the response to be sent
//						doRestart(this.clock);
					}
					else {
						if (resetTime)
							clock.fetchTime();
					}
					break;
			}
		}

		trace(`clock's http server ready at ${Net.get("IP", this.usingAP ? "ap" : "station")}\n`);
		this.advertiseServer();
	}
    unconfigServer() {
		this.uiServer?.close();
		delete this.uiServer;

		this.mdns?.close();
		delete this.mdns;
    }

	configAP(ssid, password) {
trace(`Configure access point ${ssid}\n`);
		let iter = 2;
		let clockAP;
		let disp = 'ap  ';
		while (undefined !== (clockAP = accessPointList.find(x => x.ssid === ap_name))) {
trace(` ap - ${clockAP.ssid} found iterating\n`);
			ap_name = AP_NAME + `_${iter}`;
			disp = `ap_${iter}`;
			iter++;
		}

		this.usingAP = true;
		if (!this.rtc.valid)
			this.display.value(disp).blink();

		if (undefined !== this.myWiFi) {
			this.myWiFi.close();
			this.myWiFi = undefined;
		}
		this.AP = WiFi.accessPoint({ ssid:ap_name, password, station: true });

		this.configServer();
trace(` I'm an access point ${ap_name} ! do wifiscan\n`);
		this.doWiFiScan();

		if (this.prefs.ssid) {		// saved SSID failed. wait a bit (2 minutes initially). them, if saved SSID is visible, try again.
			let delay = 2 * 60_000;
			Timer.repeat(id => {
				if (delay < (60_000 * 60)) {
					delay *= 2;
					Timer.schedule(id, delay, delay);
	}

				if (accessPointList.findIndex(x => x.ssid === this.prefs.ssid) >= 0)
					doRestart(this);
			}, delay);
		}
	}

	setupRtc() {
		if (this.prefs.pin == 22 || this.prefs.pin == 21)
			this.rtc = { exists: 0, valid: 0, enabled: 0 };
	else {

		if (DS1307.probe()) {
			try {
				this.rtc = new DS1307;
				this.rtc.exists = 1;
				let now = this.rtc.seconds;
			}
			catch(e) {
//				this.rtc?.enabled = 0;		// turn it off, time was invalid
			}
		}
		if (!this.rtc?.exists && DS3231.probe()) {
			try {
				this.rtc = new DS3231;
				this.rtc.exists = 1;
				let now = this.rtc.seconds;
			}
			catch (e) {
//				this.rtc?.enabled = 0;		// turn it off, time was invalid
			}
		}
		if (!this.rtc?.exists && RV3028.probe()) {
			try {
				this.rtc = new RV3028;
				this.rtc.exists = 1;
				let now = this.rtc.seconds;
			}
			catch (e) {
trace(`no rtc\n`);
			}
		}
		if (undefined === this.rtc)
			this.rtc = { exists: 0, valid: 0, enabled: 0 };
	}

		if (!this.rtc.enabled) {
			this.rtc.valid = 0;
		}
		else {
			global.needsReboot = 0;	// time is valid, don't need to reconnect
			this.rtc.valid = 1;
			this.setTime(this.rtc.seconds);
		}
	}

	checkDSTObserved() {
		// 2nd sun March 2am to 1st sun Nov 2am
		let today = new Date();
		let yr = today.getFullYear();
		let dst_start = new Date("March 14, "+yr+" 02:00:00"); // 2nd Sunday in March can't occur after the 14th 
		let dst_end = new Date("November 07, "+yr+" 02:00:00"); // 1st Sunday in November can't occur after the 7th
		let day = dst_start.getDay(); // day of week of 14th
		dst_start.setDate(14-day); // Calculate 2nd Sunday in March of this year
		day = dst_end.getDay(); // day of the week of 7th
		dst_end.setDate(7-day); // Calculate first Sunday in November of this year
		if (today >= dst_start && today < dst_end) { //does today fall inside of DST period?
			return true; //if so then return true
		}
		return false; //if not then return false
	}

	setTimeFromText(tx) {	// required format hh:mm or hhmm
		let d = new Date();
		d.setHours(tx.slice(0, 2));
		d.setMinutes(tx.slice(-2));
		let time = d.getTime()/1000;
		this.setTime(time, 1);
	}

	setTime(v, forceRTC=0) {
		let tz = this.prefs.tz - 11;
		Time.timezone = tz * 3600;

		Time.set(v + Time.timezone);
		let dst = (this.prefs.dst == 2) ? this.checkDSTObserved() : this.prefs.dst;
		Time.dst = dst * 3600;

		Time.set(v);

		if (this.rtc.exists && (forceRTC || !this.rtc.valid)) {
			if (!this.rtc.enabled) {
				this.rtc.enabled = 1;
			}
			this.rtc.seconds = v;
			this.rtc.valid = 1;
		}
	}

	fetchTime() {
		if (this.rtc.valid)
			this.setTime(this.rtc.seconds);

		if (!this.connectionWasEstablished)
			return;

trace(`fetchTime\n`);
		if (undefined !== this.upToDateTimer) {
			Timer.schedule(this.upToDateTimer, 100, RESET_TIME_INTERVAL);
			return;
		}

		this.upToDateTimer = Timer.set(id => {
			let hosts = Object.assign([], ntpHosts);
			let sntp = new SNTP({host: hosts.shift()}, function(message, value) {
				switch (message) {
					case 1:			// success!
						this.clock.setTime(value, 1);
						this.clock.display.showTime();
						global.needsReboot = 0;
						break;
					case -1:
						if (hosts.length)
						return hosts.shift();
						break;
				}
			});
			sntp.clock = this;
		}, 100, RESET_TIME_INTERVAL);
	}

	showMode(mode) {
		switch (mode) {
			case MODE_SET: this.display.value("set "); break;
			case MODE_2412: this.display.value("2412"); break;
			case MODE_DST: this.display.value("dst "); break;
			case MODE_BRIGHT: this.display.value("brit"); break;
			case MODE_TAIL: this.display.value("tail"); break;
			case MODE_TAIL_BRIGHT: this.display.value("tbrt"); break;
			case MODE_BOOT: this.display.value("boot"); break;
			case MODE_CLEAR: this.display.value("clr "); break;
			default: this.display.value("huh "); break;
		}
	}

	drawHours(d) {
		let h = d.getHours();
		if (1 == this.prefs.twelve) {
			let ap = 0;
			if (h == 12)
				ap = 1;
			if (h == 0)
				h = 12;
			if (h > 12) {
				ap = 1;
				h = h - 12;
			}
			this.display.value((` ${h} ${ap?'p':'a'}`).slice(-4));
		}
		else
			this.display.value((` ${d.getHours()}  `).slice(-4));
	}
	draw10Min(d) {
		this.display.value((`  ${(d.getMinutes()/10)|0} `).slice(0,4));
	}
	drawMin(d) {
		this.display.value((`   ${(d.getMinutes()%10)}`).slice(0,4));
	}
	drawOnOff(d) { 1 == d ? this.display.value("  on") : this.display.value(" off"); }
	draw2412(d) { 1 == d ? this.display.value("  12") : this.display.value("24  "); }
	drawYesNo(d) { 1 == d ? this.display.value(" yes") : this.display.value("  no"); }

	incrementSetting() {
		let b;
		switch (this.uiState) {
			case STATE_SET_DST:
				this.prefs.dst = this.prefs.dst ? 0 : 1;
				this.drawOnOff(this.prefs.dst);
				break;
			case STATE_SET_2412:
				this.prefs.twelve = this.prefs.twelve ? 0 : 1;
				this.draw2412(this.prefs.twelve);
				break;
			case STATE_SET_BRIGHT:
				b = this.prefs.brightness;
				b += 10;
				if (b > 255) b = 5;
				this.prefs.brightness = b;
				this.display.value(b);
				break;
			case STATE_CLEAR_CONFIRM:
			case STATE_BOOT_CONFIRM:
			case STATE_SET_DONE:
				this.confirm = this.confirm ? 0 : 1;
				this.drawYesNo(this.confirm);
				break;
			case STATE_SHOW_TIME:
				this.display.showTime();
				break;
			case STATE_SET_HOURS:
			case STATE_SET_10MINUTES:
			case STATE_SET_MINUTES:
				let nowTime = Date.now() / 1000;
				let d = new Date();
				let timeVal = d.getHours() * 100 + d.getMinutes();
				let h = (timeVal / 100) | 0;
				let m10 = ((timeVal % 100) / 10) | 0;
				let m1 = (timeVal % 10) | 0;
				if (STATE_SET_HOURS === this.uiState) {
					h += 1;
					if (h > 23) {
						h = 0;
						nowTime -= (60 * 60) * 23;
					}
					else
						nowTime += 60 * 60;
				}
				else if (STATE_SET_10MINUTES === this.uiState) {
					m10 += 1;
					if (m10 > 5) {
						m10 = 0;
						nowTime -= 60 * 60
					}
					else
						nowTime += 60 * 10;
				}
				else if (STATE_SET_MINUTES === this.uiState) {
					m1 += 1;
					if (m1 > 9) {
						m1 = 0;
						nowTime -= 60 * 10;
					}
					else
						nowTime += 60;
				}
				Time.set(nowTime);
			
				d = new Date();
				if (STATE_SET_HOURS === this.uiState)
					this.drawHours(d);
				else if (STATE_SET_10MINUTES === this.uiState)
					this.draw10Min(d);
				else if (STATE_SET_MINUTES === this.uiState)
					this.drawMin(d);
				break;
			default:
				;
		}
	}

	rightPressed(button) {
		this.clock.uiValueChanged = 0;
		this.clock.uiValueChangedMS = Time.ticks;
trace(`rightPressed valuechangedMS:${this.clock.uiValueChangedMS}\n`);
	}

	rightReleased(button) {
trace(`rightReleased elapsed: ${button.elapsed}\n`);
		if (button.elapsed < 50)
			return;
		 if (this.clock.uiState === STATE_SHOW_TIME) {
			this.clock.nextSequence(this.clock.controller, 1);
		}
		else if (!this.clock.uiChangedValue) {
			this.clock.incrementSetting();
		}
		else {
			// right released but value already changed in stilldown.
		}
	}

	rightStillDown(button) {
		let now = Time.ticks;
		if (now - this.clock.uiValueChangedMS > SETTING_ITER1_MS) {
			button.lastModeChanged = now;
trace(`rightStillDown\n`);
			this.clock.uiValueChanged = 1;
			this.clock.incrementSetting();
			this.clock.uiValueChangedMS = now;
		}
	}

	leftPressed(button) {
trace(`leftPressed - clear value changed now: ${Time.ticks}\n`);
		this.clock.uiValueChanged = 0;
		this.clock.display.blinking = 0;

	}

	leftReleased(button) {
		let d = new Date();
trace(`leftReleased - clear needsReboot, now: ${Time.ticks} elapsed: ${button.elapsed}\n`);
		global.needsReboot = 0;
		if (this.clock.uiState === STATE_CYCLE_MODE) {
trace(`uiState: CYCLE_MODE - uiMode: ${this.clock.uiMode}\n`);
			switch (this.clock.uiMode) {
				case MODE_SET:
					this.clock.uiState = STATE_SET_HOURS;

					this.clock.drawHours(d);
					this.clock.confirm = 0;
					break;
				case MODE_2412: this.clock.uiState = STATE_SET_2412; break;
				case MODE_DST: this.clock.uiState = STATE_SET_DST; break;
				case MODE_BRIGHT: this.clock.uiState = STATE_SET_BRIGHT; break;
				case MODE_TAIL: this.clock.uiState = STATE_SET_TAIL; break;
				case MODE_TAIL_BRIGHT: this.clock.uiState = STATE_SET_TAIL_BRIGHT; break;
				case MODE_BOOT:
					this.clock.confirm = 0;
					this.clock.uiState = STATE_BOOT_CONFIRM;
					break;
				case MODE_CLEAR:
					this.clock.confirm = 0;
					this.clock.uiState = STATE_CLEAR_CONFIRM;
					break;
			}
trace(`uiState: set to ${this.clock.uiState}\n`);
		}
		else if ((this.clock.uiState === STATE_CLEAR_CONFIRM) || (this.clock.uiState === STATE_BOOT_CONFIRM)) {
			if (this.clock.confirm) {
				if (this.clock.uiState === STATE_CLEAR_CONFIRM)
					this.clock.prefs.reset();
				doRestart(this.clock);
			}
			this.clock.uiState = STATE_SHOW_TIME;
			this.clock.display.showTime();
		}
		else if (this.clock.uiState === STATE_SET_HOURS) {
			this.clock.uiState = STATE_SET_10MINUTES;
			this.clock.draw10Min(d);
		}
		else if (this.clock.uiState === STATE_SET_10MINUTES) {
			this.clock.uiState = STATE_SET_MINUTES;
			this.clock.drawMin(d);
		}
		else if (this.clock.uiState === STATE_SET_MINUTES) {
			this.clock.uiState = STATE_SET_DONE;
			this.clock.display.value("done");
		}
		else if (this.clock.uiState === STATE_SET_DONE) {
			if (this.clock.confirm) {
				this.clock.uiState = STATE_SHOW_TIME;
				this.clock.display.showTime();
			}
			else {
				this.clock.uiState = STATE_SET_HOURS;
				this.clock.drawHours(d);
			}
		}
		else if (this.clock.uiState === STATE_SHOW_TIME) {
			this.clock.nextSequence(this.clock.controller);
		}
		else {
trace(`uiState wuz: ${this.clock.uiState} - now SHOW_TIME\n`);
			this.clock.uiState = STATE_SHOW_TIME;
			this.clock.display.showTime();
		}
	}

	leftStillDown(button) {
		let now = Time.ticks;
		if (this.clock.uiState === STATE_SHOW_TIME) {
			if (button.elapsed > CYCLE_MODE_MS) {
				button.lastModeChanged = now;
				this.clock.uiMode = MODE_SET;
				this.clock.uiState = STATE_CYCLE_MODE;
				this.clock.showMode(this.clock.uiMode);
			}
		}
		else if (this.clock.uiState === STATE_CYCLE_MODE) {
			if (now - button.lastModeChanged > CYCLE_ITERATE_MS) {
				button.lastModeChanged = now;
				this.clock.uiMode += 1;
				if (this.clock.uiMode > MODE_MAX)
					this.clock.uiMode = 0;
				this.clock.showMode(this.clock.uiMode);
			}
		}
trace(`leftStillDown\n`);
	}

	nextSequence(ref, random=0) {
trace(`nextSequence from ${ref.clock.prefs.sequence}\n`);
		let filenames = ref.fileMgr.getFilenameList();
		if (random) {
			random = (Math.random() * filenames.seq.length) | 0;
			if (ref.loadFile(ref, filenames.seq[random]))
				ref.clock.prefs.sequence = filenames.seq[random];
		}
		else {
			for (let i=0; i<filenames.seq.length; i++) {
				let name = filenames.seq[i];
				if (name == ref.clock.prefs.sequence) {
					i = (i == filenames.seq.length - 1) ? 0 : i+1;
	
					name = filenames.seq[i];
					if (ref.loadFile(ref, name)) {
						ref.clock.prefs.sequence = name;
						break;
					}
				}
			}
		}
	}

	button0Released() {
		this.clock.nextSequence(this.clock.controller);
	}

	setupButton0() {
		this.button0 = new ClockButton({ pin: 0, mode: Digital.InputPullup, edge: Monitor.Falling | Monitor.Rising });
		this.button0.clock = this;
		this.button0.onReleased = this.button0Released;
	}

	setupButtonAB() {
		if (("none" !== this.prefs.buttonA) && ("none" !== this.prefs.buttonB)) {
			this.leftButton = new ClockButton({pin:this.prefs.buttonA, mode:Digital.Input, edge:Monitor.Falling|Monitor.Rising});
			this.leftButton.clock = this;
			this.leftButton.onPressed = this.leftPressed;
			this.leftButton.onStillDown = this.leftStillDown;
			this.leftButton.onReleased = this.leftReleased;

			this.rightButton = new ClockButton({pin:this.prefs.buttonB, mode:Digital.Input, edge:Monitor.Falling|Monitor.Rising});
			this.rightButton.clock = this;
			this.rightButton.onPressed = this.rightPressed;
			this.rightButton.onStillDown = this.rightStillDown;
			this.rightButton.onReleased = this.rightReleased;
		}
		this.uiState = STATE_SHOW_TIME;
	}
}


let clock = new Clock(prefs);



function checkboxValue(reqVal, item) {
	if (undefined == reqVal[item])
		return 0;
	else
		return parseInt(reqVal[item]);
}

function dstValue(source, reqVal, item) {
	let ret;
	if (undefined == reqVal[item])
		return 0;
	ret = source.indexOf(reqVal[item]);
	return (-1 === ret) ? 0 : ret;
}


//---------------


function restart() @ "do_restart";

function doRestart(clock) {
	trace("restart\n");
	if (undefined !== clock) {
		clock.display.value("bye ");
	}
	restart();
}

Object.freeze(Clock.prototype);
