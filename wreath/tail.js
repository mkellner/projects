/*
 * Copyright (c) 2019-2021  Moddable Tech, Inc.
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
import config from "mc/config";
import Time from "time";

import html_content from "web";

const TwoPI = (Math.PI * 2);
const RAD2DEG = (180 / Math.PI);

function hsvToRgb(h, s, v) @ "xs_hsvtorgb";
function hueDist(x, y, span) @ "xs_hueDist";	// sqrt(x*x + y*y) / span


/* layouts
	line: [0, 1, 2, 3, 4]
		one dimension
	grid: [[0, 1, 2],[3, 4, 5]]
		two dimensions
	circle: [0, 1, 2, 3, 4]
		equally divided angles
		concentric circles:  [[0, 1, 2, 3, 4],[5, 6, 7, 8, 9, 10, 11, 12]]
			use the circle, but have multiple elements
	cross:  [[[0, 1, 2],[3, 4, 5],[6, 7, 8]],[[9, 10, 11],[12, 13, 14],[15, 16, 17]]];
		two lines. each line can be wide by multiple pixels
	sevenseg:
		seven segment display for clock, etc.
*/

const LayoutNames = [ "line", "grid", "circle", "cross", "sevenseg" ];

//*******************
export class Layout {
	constructor(dict) {
		let i, center;
		this.pxOffset = global.LayoutPixelOffset ? global.LayoutPixelOffset : (global.LayoutPixelOffset = 0);

		if (undefined !== dict.offset)
			this.pxOffset = dict.offset;

		let layoutProto = config.layouts.find(el => el.tok == dict.layout_id);
		if (layoutProto)
			Object.assign(this, layoutProto);		// optimize?
		Object.assign(this, dict);
		
		this.pxFirst = 0;
//		this.pxLast = this.len-1;
		this.pxLength = this.len;
		global.LayoutPixelOffset += this.pxLength;

//		center = (this.pxLast / 2);
		center = (this.pxLength / 2);
		// some defaults - line'em up, and split line if layout doesn't define
		if (undefined === this.line) {
			this.line = [];
			for (i=0; i<this.pxLength; i++)
				this.line[i] = i;
		}
		// if no lines, split the line into two
		if (undefined === this.lines) {
			this.lines = [];
			this.lines[0] = [];
			this.lines[1] = [];
			for (i=0; i<center; i++) {
				this.lines[0][i] = this.line[center - i - 1];
				this.lines[1][i] = this.line[center + i];
			}
		}
		if (undefined === this.linesh)
			this.linesh = this.lines;
		if (undefined === this.linesv)
			this.linesv = this.lines;
		if (undefined === this.digits)
			this.digits = this.lines;
		if (undefined !== this.segments) {		// this is a clock
			this.xy = [];
			this.loc = [];
			if (this.colon.length === 7) 		// colon bar
				this.loc[8] = [ this.colon[0], this.colon[1], this.colon[2], this.colon[3], this.colon[4], this.colon[5], this.colon[6] ];
			else
				this.loc[8] = [ -1, -1, this.colon[0], -1, this.colon[1], -1, -1 ];
			// set up grid of pixels
			for (let d=0; d<4; d++) {
				let bx = d*4 + ((d>1) ? 1 : 0);
				let px = this.segments[d];
				this.loc[bx++] = [-1, px[1][0], px[1][1], -1, px[2][0], px[2][1], -1];
				this.loc[bx++] = [px[0][1], -1, -1, px[6][1], -1, -1, px[3][1]];
				this.loc[bx++] = [px[0][0], -1, -1, px[6][0], -1, -1, px[3][0]];
				this.loc[bx++] = [-1, px[5][0], px[5][1], -1, px[4][0], px[4][1], -1];
			}

			// pixel to {x,y}
			for (let p=0; p<this.len; p++)
				for (let x=0; x<this.width; x++)
					for (let y=0; y<this.height; y++)
						if (p === this.loc[x][y])
							this.xy[p] = {x,y};

			this.pixOn = [];
		}
	}

	get length() { return this.pxLength; }
}

//*******************
export class TailSegment {
	constructor(dict) {
		this.dict = dict;
		this.layout = new Layout(dict);

		this.nextEffectMS = 0;
		this.nextCycleMS = 0;
	}

	get length() {
		return this.layout.length;
	}

	tail_op(v) {
		if (undefined !== this.action)
			this.action.time = v;
	}

	/* p: pixel index in segment, c: color, d: scale per ms */
	setPixel(p, c, scalePerMS=0, duration=1000) {
		if (p === undefined) {
			trace("huh?");
			return;
		}
		else if (-1 === p)
			return;
		if (undefined !== this.layout.pixOn)
			if (this.layout.pixOn[p] === 0)
				c = 0;
//		trace(`set ${this.layout.name} p:${p} (${p + this.layout.pxOffset})\n`);
		if (this.display)
			this.display.setPixel(p + this.layout.pxOffset, c, scalePerMS, duration);
	}

}

export class TailActions {
	constructor(dict) {
		let pulse = new TailAction_pulse(); 
		let pulseAll = new TailAction_pulseAll({ftb: 1000, duration: 1000}); 
		let pulseLines = new TailAction_pulseLines({ftb: 1000, duration: 1000});
		let rainbow = new TailAction_rainbow({duration:1000}); 
		let marquee = new TailAction_marquee({duration:1000, ftb:250});

		this.actionForTag = [];
		this.tail_actions = [];
		this.tail_actions.push(this.actionForTag[pulse.tag] = pulse);
		this.tail_actions.push(this.actionForTag[pulseAll.tag] = pulseAll);
		this.tail_actions.push(this.actionForTag[pulseLines.tag] = pulseLines);
		this.tail_actions.push(this.actionForTag[rainbow.tag] = rainbow);
		this.tail_actions.push(this.actionForTag[marquee.tag] = marquee);

		this.startMS = 0;
		this.display = dict.display;
	}

	start(value) {
//trace(`tailAction - startMS: ${value}\n`);
		this.startMS = value;
	}

	idle(value) {
		let modifiedNow = ((value - this.startMS) * (this.display.speed / 100.0)) | 0;
		for (let i=0; i<this.tail_actions.length; i++) {
			this.tail_actions[i].op_first?.(modifiedNow);
			this.tail_actions[i].idle?.(modifiedNow);
		}
		for (let i=0; i<this.tail_actions.length; i++)
			this.tail_actions[i].op_last?.(modifiedNow);
	}
}

//*******************
export class TailActionSequence {
	constructor (display, sequence, controller) {
		this.seq = sequence.seq;
		this.display = display;
		this.controller = controller;
	}

	start(value) {
trace(`tailSequence - start: ${value}\n`);
		for (let i=0; i<this.seq.length; i++)
			this.seq[i].done = false;
//		this.startMS = (Time.ticks + ms * (this.display.speed / 100.0)) | 0;
		this.startMS = value;
//		this.display.start();
		this.display.tail_actions.start(this.startMS);
		this.idle(this.startMS);
	}

	stop() {
		this.display.tailSegments.forEach(seg => (undefined !== seg.action) ? seg.action.term(seg):0);
/*
		for (let i=0; i<this.display.tailSegments.length; i++) {
			let seg = this.display.tailSegments[i];
			if (undefined !== seg.action) {
//				trace(`${Time.ticks}:${elapsed} terminate action for segment ${seg.layout.name}\n`);
				seg.action.term(seg);
			}
		}
*/
		
	}

	setupSegment(seg, action, params, now) {
		if (undefined === seg) return;
		// set up segment idler
		seg.action?.term(seg);
		seg.action = this.display.tail_actions.actionForTag[action];
		seg.action?.init(seg);
		seg.action?.trigger?.(seg, params, now, 0);
	}


	idle(value) {
		let i, idx;
		let didSomething = false;
//// This?
		let modifiedNow = ((value - this.startMS) * (this.display.speed / 100.0)) | 0;
//		let modifiedNow = value;
		for (idx=0; idx<this.seq.length; idx++) {
			let seqEl = this.seq[idx];
			if (seqEl.done)
				continue;
			if (modifiedNow >= seqEl.when) {
				seqEl.done = true;

				// if seqEl.seg is defined, then we're acting on a segment
				if (undefined !== seqEl.seg) {
					if (seqEl.seg == "all") 	// lots of segments
						this.display.tailSegments.forEach(seg => this.setupSegment(seg, seqEl.action, seqEl.params, modifiedNow));
					else 
						this.setupSegment(this.display.tailSegments[seqEl.seg], seqEl.action, seqEl.params, modifiedNow);

				}
				else {		 // other sequencer actions
					if (undefined !== seqEl.next && undefined !== this.controller?.next) {
						if ("random" === seqEl.next)
							this.controller.next(this.controller, 1);
						else
							this.controller.next(this.controller);
					}
					else if (undefined !== seqEl.file) {
						this.controller.loadFile(this.controller, seqEl.file);
					}
					else if (undefined !== seqEl.restart) {
						this.display.tailSegments.forEach(seg => seg.action?.term(seg));
						this.seq.forEach(seq => seq.done = false);
						this.startMS = Time.ticks;
						this.display.tail_actions.start(this.startMS);
					}
				}
			}
		}
	}
}

/******** base TailAction *******/
export class TailAction {
	constructor(dict) {
		this.dict = dict;

		this.duration = dict?.duration ?? 1000;
		this.lastCycleMS = 0;
	}

	linesForVariant(seg, variant) {
		let ret;

		if (variant === 4) variant = (Math.random() * 4) | 0;

		if (variant === 1) ret = seg.layout.linesh;
		else if (variant === 2) ret = seg.layout.linesv;
		else if (variant === 3) ret = seg.layout.digits;

		if (undefined === ret) ret = seg.layout.lines;
		return ret;
	}

	init(seg) {
		if (undefined === seg.rainbow)
			seg.rainbow = {};
		seg.rainbow.stepPerMS = 1.0 / this.duration;
		seg.rainbow.sat = 1.0;
		seg.rainbow.val = 0.8;
	}

	idle(v) {
	}

	op_first(ms) {
		this.elapsed = ms - this.lastCycleMS;
		this.lastCycleMS = ms;
	}

    parseColor(c) {
		if (typeof(c) === "number")
			return c;
		else if (typeof(c) == "string") {
			let color = c.toLowerCase()
			switch (color) {
				case "random": return hsvToRgb(Math.random(), 1.0, 0.8);
				case "gold": return 0xd4af37;
				case "silver": return 0xaaa9ad;
				case "white": return 0xbbbbbb;
				case "red": return 0xff0000;
				case "orange": return 0xffa500;
				case "yellow": return 0xffff33;
				case "green": return 0x00ff00;
				case "blue": return 0x1940ff;
				case "indigo": return 0x4b0082;
				case "violet": return 0x8f00ff;
			}
			if (c.substring(0,2) === "0x") {
				let r = parseInt(c.substring(2,4),16);
				let g = parseInt(c.substring(4,6),16);
				let b = parseInt(c.substring(6,8),16);
				return (r << 16 | g << 8 | b);
			}
	        return parseInt(c);
		}
		else
			return 0x00ffff;
    }

}

//*******************
export class TailAction_rainbow extends TailAction {
	constructor(dict) {
		super(dict);
		this.tag = "RNBW";
		this.name = "Rainbow";

		// set up defaults

		// kind of rainbow
		// 0 - scan: cycles through colors over line or angles
		// 1 - target: uses cangles
		this.kind = (undefined === dict.kind) ? 0 : dict.kind;

		// direction
		this.dir = (undefined === dict.dir) ? 1 : dict.dir;

		this.segments = [];
	}

	init(seg) {
		super.init(seg);
		seg.rainbow = {};

		if (undefined === seg.layout.angles) {
			seg.layout.angles = seg.layout.line.map( (v, k) => k * (360/ seg.layout.line.length)  );
		}
		
		if (-1 == this.segments.findIndex( (item) => item === seg )) {
			this.segments.push(seg);
		}
		seg.rainbow.lastMovedMS = 0;
	}

	term(seg) {
		let idx = this.segments.findIndex( item => item === seg );
//trace(`term rainbow seg: ${seg.layout.name} - found?: ${idx}\n`);
	
		if (-1 != idx) {	
			this.segments.splice(idx, 1);
		}
	}

	op_first(ms) {
		this.elapsed = ms - this.lastCycleMS;
		this.lastCycleMS = ms;
	}

	trigger(seg, params, now, loc=0) {
		seg.rainbow.kind = params?.kind ?? this.kind;
		seg.rainbow.dir = params?.dir ?? this.dir;
		seg.rainbow.duration = params?.duration ?? this.duration;
		seg.rainbow.stepPerMS = 1 / seg.rainbow.duration;
		seg.rainbow.hueInc = 0;
		if (seg.rainbow.kind === 2)
			seg.rainbow.lines = this.linesForVariant(seg, params?.variant ?? 1);

		seg.rainbow.sat = 1.0;
		seg.rainbow.val = 0.8;
		seg.rainbow.width = seg.layout.linesh[0].length;
		seg.rainbow.height = seg.layout.linesh.length;
		seg.rainbow.xDest = seg.rainbow.width / 2;
		seg.rainbow.yDest = seg.rainbow.height / 2;
		this.setupMoving(now, seg);
	}

	hueTarget(p, v, x, y, centerX, centerY, span, seg, inc) {
		let hue = hueDist(x-centerX, y-centerY, span);
		if (seg.rainbow.dir === 0) {
			hue += inc;
			hue %= 1;
		}
		else if (seg.rainbow.dir === 1) {
			hue -= inc;
			let sub = Math.abs(hue) | 0;
			if (hue < 0)
				hue = sub + 1 + hue;
		}
if (hue < 0 || hue > 1.0) trace(`HUE OVERFLOW - ${hue}\n`);
		return hue;
	}

	setupMoving(ms, seg) {
		const rbow = seg.rainbow;
		if (1 === seg.layout.clock) {
			if (seg.display.timeValue < 200)
				rbow.width = 10;
			else if (seg.display.timeValue < 1000)
				rbow.width = 13;
			else if (seg.display.timeValue < 2000)
				rbow.width = 14;
			else
				rbow.width = 17;
		}
//trace(`setupMoving @ ${ms} - center was: ${rbow.xCenter?.toFixed(2)},${rbow.yCenter?.toFixed(2)} - now: ${rbow.xDest.toFixed(2)},${rbow.yDest.toFixed(2)}`);
		rbow.xCenter = rbow.xDest;
		rbow.yCenter = rbow.yDest;
		rbow.xDest = Math.random() * rbow.width;
		rbow.yDest = Math.random() * rbow.height;
//trace(` - dest: ${rbow.xDest.toFixed(2)}, ${rbow.yDest.toFixed(2)}\n`);
		rbow.xInc = (rbow.xDest - rbow.xCenter) / rbow.duration;
		rbow.yInc = (rbow.yDest - rbow.yCenter) / rbow.duration;
		rbow.motionStart = ms;
	}

	idle(v) {
		let i, j, c, a, p;
		let w, h, offset;
		for (j=0; j<this.segments.length; j++) {
			const seg = this.segments[j];
			const rbow = seg.rainbow;
			const motionElapsed = v - rbow.motionStart;

			if (motionElapsed > rbow.duration)
				this.setupMoving(v, seg);

			const cx = rbow.xCenter + (rbow.xInc * (motionElapsed%rbow.duration));
			const cy = rbow.yCenter + (rbow.yInc * (motionElapsed%rbow.duration));

			offset = ((v - rbow.lastMovedMS) % rbow.duration) * rbow.stepPerMS;
//			offset = 0;
			if (-1 == rbow.dir)
				offset = 1.0 - offset;
			switch (rbow.kind) {
				case 2:						// over lines
				for (i=0; i<rbow.lines.length; i++) {
					const line = rbow.lines[i];
					for (j=0; j<line.length; j++) {
						h = ((j / line.length) + offset) % 1;
						c = hsvToRgb(h, rbow.sat, rbow.val);
						seg.setPixel(line[j], c);
					}
				}
				break;

				case 3:						// sunrise
				case 5:						// target
				case 6:						// moving target
					h = seg.layout.linesh.length;
					w = seg.layout.linesh[0].length;
					for (j=0; j<h; j++) {
						for (i=0; i<w; i++) {
							p = seg.layout.linesh[j][i];
							if (-1 !== p) {
								switch (rbow.kind) {
									case 3: c = this.hueTarget(p, v, i, j, w/2, h, w, seg, offset); break;
									case 5: c = this.hueTarget(p, v, i, j, w/2, h/2, w, seg, offset); break;
									case 6:
										c = this.hueTarget(p, v, i, j, cx, cy, w, seg, offset); break;
								}
if (c < 0 || c > 1) trace(`color ${c} is out of bounds\n`);
								c = hsvToRgb(c, rbow.sat, rbow.val);
								seg.setPixel(p, c);
							}
						}
					}
				break;

				default:
				const angles = ((rbow.kind === 1) ? seg.layout.cangles : seg.layout.angles);
				if (undefined === angles) angles = seg.layout.angles;
				for (i=0; i<angles.length; i++) {
					h = ((angles[i] / 360) + offset) % 1;
					c = hsvToRgb(h, rbow.sat, rbow.val);
					seg.setPixel(i, c);
				} 
			}
		}
	}
}

//*******************
/***** pulse *****/

export class TailAction_pulse extends TailAction {
	constructor(dict) {
		super(dict);
		this.tag = "PULS";
		this.name = "Pulse";

		// setup defaults

		// length of pulse (ms) how long until it fades
		this.ftb = dict?.ftb ?? this.duration;

		// kind of pulse 
		this.kind = dict?.kind ?? 0;

		// direction
		this.dir = dict?.dir ?? 1;

		// color
		this.color = this.parseColor(dict?.color ?? 0x0000ff);

		this.pulses = [];

		this.lastCycleMS = 0;
	}

	init(seg) {
		super.init(seg);
//		seg.pulse = {fadeResidual:0, fadePerMS: 1.0/this.ftb};
	}

	term(seg) {

//trace(`term pulse seg: ${seg.layout.name}. ${this.pulses.length} pulses remain - popping\n`);
		// empty pulses
		let i=0;
		while (i<this.pulses.length) {
			if (this.pulses[i].seg === seg)
				this.pulses[i].done = true;
			i++;
		}
		this._cleanupPulses();
	}

	_cleanupPulses() {				 // remove finished pulses
		let i=0;
		while (i<this.pulses.length) {
			if (this.pulses[i].done)
				this.pulses.splice(i, 1);
			else
				i++;
		}
	}

	trigger(seg, params, now, loc=0) {
		let pulse = {loc, ...params};
		if ("pulseStepMS" in pulse === false)
			pulse.pulseStepMS = (this.duration / seg.layout.pxLength);
		if ("start" in pulse === false)
			pulse.start = seg.layout.pxFirst;
		if ("end" in pulse === false)
			pulse.end = seg.layout.pxLength-1;
		if ("dir" in pulse === false)
			pulse.dir = this.dir;
		if ("ftb" in pulse === false)
			pulse.fade = 1.0 / this.ftb;
		else
			pulse.fade = 1.0 / pulse.ftb;
		if ("color" in pulse === false)
			pulse.color = this.parseColor(this.color);
		else
			pulse.color = this.parseColor(params.color);

		if (pulse.some) {
			pulse.start = 0;
			pulse.end = pulse.some.length - 1;
		}

		if (-1 == pulse.dir)
			pulse.loc = pulse.end;

		pulse.nextStepMS = now;
		pulse.seg = seg;
		if (undefined !== pulse.repeat)
			pulse.nextRepeat = now + pulse.repeat;

		this.pulses.push(pulse);
	}

	idle(v) {
		let i;

		for (i=0; i<this.pulses.length; i++) {
			const pulse = this.pulses[i];
			let color = pulse.color;
			let seg = pulse.seg;
			if (v > pulse.nextStepMS) {
				pulse.nextStepMS += pulse.pulseStepMS;
				{
					let pix;
					if (pulse.some)
						pix = pulse.some[pulse.loc];
					else
						pix = seg.layout.line[pulse.loc];

					if (pulse.kind == 1) {	// rainbow color
						let offset = (v % this.duration) * seg.rainbow.stepPerMS;
						color = hsvToRgb(offset, 1.0, 0.8);
					}
					seg.setPixel(pix, color, pulse.fade, this.duration);
					if (-1 == pulse.dir) {
						if (pulse.loc > pulse.start)
							 pulse.loc--;
						else {
							if (undefined === pulse.repeat)
								pulse.done = 1;
							else {
								pulse.loc = pulse.end;
								pulse.nextStepMS += pulse.repeat;
							}
						}
					}
					else {
						if (pulse.loc < pulse.end)
							pulse.loc++;
						else {
							if (undefined === pulse.repeat)
								pulse.done = 1;
							else {
								pulse.loc = pulse.start;
								pulse.nextStepMS += pulse.repeat;
							}
						}
					}
				}
			}
		}
		this._cleanupPulses();
	}

}

//*******************
export class TailAction_pulseLines extends TailAction_pulse {
	constructor(dict) {
		super(dict);
		this.tag = "PLSL";
		this.name = "Pulse Lines";
	}

	trigger(seg, params, now, loc=0) {
		let lines;
		let fade = 1.0/this.ftb;
		if (undefined === params) params = {};

		let lifetime = params.life;
		let repeat = params.repeat;
		let duration = params.duration ?? this.duration;

		let kind = params.kind ?? this.kind;

		lines = this.linesForVariant(seg, params.variant);
		if (kind === 4)		// each layout.digit as a line
			lines = seg.layout.digits;

		let dir = params.dir ?? 1;
		if (undefined !== params.ftb)
			fade = 1.0 / params.ftb;
		let color = this.parseColor(params.color ?? this.color);
		if (undefined !== params.loc)
			loc = params.loc;

		for (let i=0; i<lines.length; i++) {
			let line = lines[i];
			let pulseStepMS = params?.pulseStepMS ?? duration / line.length;
			let start = params?.start ?? 0;
			let end = params?.end ?? line.length - 1;
			if (undefined !== params) {
				if (undefined !== params.color) {
					if (typeof params.color == "object")
						color = this.parseColor(params.color[i%params.color.length]);
					else
						color = this.parseColor(params.color);
				}
			}

			if (-1 == dir)
				loc = end;

			if (2 == kind) {		// center out
				if (undefined == seg.layout.center)
					loc = ((end - start + 1) / 2) | 0;
				else
					loc = seg.layout.center[i];
				this.pulses.push({seg, color, dir:1, loc, lines, line:i, start, end, duration, repeat, life: lifetime, lifetime: lifetime,kind, fade, pulseStepMS, nextStepMS: now + pulseStepMS});
				this.pulses.push({seg, color, dir:-1, loc, lines, line:i, start, end, duration, repeat, life: lifetime, lifetime: lifetime,kind, fade, pulseStepMS, nextStepMS: now + pulseStepMS});
			}
			else if (3 == kind) {	// each line delayed a little
				let delay = 100;		//@@ paramable
				this.pulses.push({seg, color, dir, loc, lines, line:i, start, end, duration, repeat, life: lifetime, lifetime: lifetime,kind, fade, pulseStepMS, nextStepMS: now + (delay * i)});
			}
			else if (5 == kind) {	// each line completely, delay between lines
				let delay = duration / lines.length;
				for (let j = 0; j < lines[i].length; j++) {
					this.pulses.push({seg, color, dir, loc:loc+(dir*j), lines, line:i, start, end, duration, repeat, life:1, lifetime:1,kind, fade, pulseStepMS, nextStepMS: now + (delay * i)});
				}
			}
			else if (4 == kind) 	// digits
				this.pulses.push({seg, color, dir, loc, lines, line:i, start, end, duration, repeat, life: lifetime, lifetime: lifetime,kind, fade, pulseStepMS, nextStepMS : now});
			else
				this.pulses.push({seg, color, dir, loc, lines, line:i, start, end, duration, repeat, life: lifetime, lifetime: lifetime,kind, fade, pulseStepMS, nextStepMS : now});
		}
	}

	idle(v) {
		let i;

		for (i=0; i<this.pulses.length; i++) {
			const pulse = this.pulses[i];
			let seg = pulse.seg;
			let lines = pulse.lines;
			if (undefined !== pulse.nextRepeat && v > pulse.nextRepeat) {
				this.trigger(seg, pulse, v);
				pulse.nextRepeat = undefined;
			}
			if (v > pulse.nextStepMS) {
				pulse.nextStepMS += pulse.pulseStepMS;
				if (((1 == pulse.kind) || (2 == pulse.kind)) && seg.layout.cross) {
					let f = seg.layout.cross[pulse.line][pulse.loc];
					for (let t=0; t<f.length; t++)
						seg.setPixel(f[t], pulse.color, pulse.fade, pulse.duration);
				}
				else if (4 == pulse.kind)
					seg.setPixel(seg.layout.digits[pulse.line][pulse.loc], pulse.color, pulse.fade, pulse.duration);
				else {
					let p = lines[pulse.line][pulse.loc];
					if (-1 != p)
						seg.setPixel(p, pulse.color, pulse.fade, pulse.duration);
				}

				if (-1 == pulse.dir) {
					if (pulse.loc > pulse.start)
						 pulse.loc--;
					else {
						if (undefined === pulse.repeat)
							pulse.done = 1;
						else {
							pulse.loc = pulse.end;
							pulse.nextStepMS += pulse.repeat;
						}
					}
				}
				else {
					if (pulse.loc < pulse.end)
						pulse.loc++;
					else {
						if (undefined === pulse.repeat)
							pulse.done = 1;
						else {
							pulse.loc = pulse.start;
							pulse.nextStepMS += pulse.repeat;
						}
					}
				}

				if (undefined !== pulse.life) {
					if (0 >= --pulse.life) {
//trace("pulse life ended - pulse done.\n");
						if (undefined === pulse.repeat)
							pulse.done = 1;
						else {
							pulse.nextStepMS += pulse.duration;
							pulse.life = pulse.lifetime;
						}
					}
				}
			}
		}

		// remove finished pulses
		i=0;
		while (i<this.pulses.length) {
			if (this.pulses[i].done)
				this.pulses.splice(i, 1);
			else
				i++;
		}
//if (out.length > 7)
//	trace(out);
	}

}

//*******************
export class TailAction_pulseAll extends TailAction_pulse {
	constructor(dict) {
		super(dict);
		this.tag = "PLSA";
		this.name = "Pulse All";
	}

/*
	term(seg) {
		// empty pulses
//trace(`term pulseAll seg: ${seg.layout.name}. ${(undefined === this.pulses) ? "no" : this.pulses.length} pulses remain - popping\n`);
		
		while (undefined !== this.pulses.pop());
	}
*/

	trigger(seg, params, now) {
		const pulse = {seg, nextStepMS:now-1};

		pulse.color = params?.color ?? seg.display.rgb;
		pulse.kind = params?.kind ?? this.kind;
		pulse.duration = params?.duration ?? this.duration;
		pulse.fade = 1.0 / (params?.ftb ?? this.ftb);
		pulse.some = params?.some;
		pulse.repeat = params?.repeat;
		pulse.pulseStepMS = (pulse.duration / seg.layout.pxLength);
		pulse.iter = 0;
		this.pulses.push(pulse);
	}

	idle(v) {
//trace(`idle pulse-all ${v} - ${this.pulses.length} pulses\n`);
		let i, j;
		for (i=0; i<this.pulses.length; i++) {
			let pulse = this.pulses[i];
			let seg = pulse.seg;
			let color, len;
			if (1 == pulse.kind) {				// sparkle
				let show = 10;
				let half = pulse.pulseStepMS / 2;

				if (v > pulse.nextStepMS) {
					pulse.nextStepMS += half + (half * Math.random());
					len = pulse.some?.length ?? seg.layout.line.length;
					for (j=0; j<len; j++) {
						if (Math.random() < (1.0/show)) {
							if (typeof pulse.color == "object")
								color = this.parseColor(pulse.color[pulse.iter++%pulse.color.length]);
							else
								color = this.parseColor(pulse.color);
							if (pulse.some)
								seg.setPixel(pulse.some[j], color, pulse.fade, pulse.duration);
							else
								seg.setPixel(seg.layout.line[j], color, pulse.fade, pulse.duration);
						}
					}
				}
			}
			else {
				let doPulse = 1;
				if (undefined !== pulse.repeat) {
					let scaled = pulse.nextStepMS;
					if (v > scaled)
						pulse.nextStepMS += pulse.repeat;
					else {
//trace(`pulse-all no pulse v ${v} > scaled ${scaled}\n`);
						doPulse = 0;
					}
				}
				else {
					pulse.done = true;
				}

				if (doPulse) {
					len = pulse.some?.length ?? seg.layout.line.length;
					for (j=0; j<len; j++) {
						if (typeof pulse.color == "object")
							color = this.parseColor(pulse.color[pulse.iter++%pulse.color.length]);
						else
							color = this.parseColor(pulse.color);
						if (pulse.some)
							seg.setPixel(pulse.some[j], color, pulse.fade, pulse.duration);
						else
							seg.setPixel(seg.layout.line[j], color, pulse.fade, pulse.duration);
					}
				}
			}
		}

		// remove finished pulses
		i=0;
		while (i<this.pulses.length) {
			if (this.pulses[i].done)
				this.pulses.splice(i, 1);
			else
				i++;
		}
	}
}

//*******************
export class TailAction_marquee extends TailAction_pulse {
	constructor(dict) {
		super(dict);
		this.tag = "MARQ";
		this.name = "Marquee";

		// set up defaults

		// kind of marquee
		// 0 - display colors in order (x1)
		// 1 - display colors (x2) in order
		// 2 - display colors in order down lines
		// 3 - pulse-in new colors
		this.kind = dict.kind ?? 0;

		// direction
		this.dir = dict.dir ?? 1;

		this.colors = dict.color;
	}

	op_first(ms) {
		this.elapsed = ms - this.lastCycleMS;
		this.lastCycleMS = ms;
	}

	trigger(seg, params, now, loc=0) {
		this.lastCycleMS = now;

		let pulse = {seg, fade:0, step:0, nextStepMS:now-1};
		pulse.kind = params?.kind ?? this.kind;
		pulse.duration = params?.duration ?? this.duration;
		pulse.dir = params?.dir ?? this.dir;
//		let pulseStepMS = params?.ftb ?? this.ftb;
		pulse.colors = [];
		if (typeof params?.color == "object") {
			for (let i=0; i<params.color.length; i++)
				pulse.colors[i] = this.parseColor(params.color[i]);
		}
		else {
			if (undefined === params?.color) {
				pulse.colors[0] = this.parseColor("red");
				pulse.colors[1] = this.parseColor("green");;
			}
			else {
				pulse.colors[0] = this.parseColor(params.color);
				pulse.colors[1] = 0;
			}
		}

		if (undefined !== params.ftb)
			pulse.fade = 1.0 / params.ftb;
		else if (3 == pulse.kind)
			pulse.fade = 1.0 / pulse.duration;
		this.pulses.push(pulse);
	}

	idle(v) {
		let i, j;
		for (i=0; i<this.pulses.length; i++) {
			let pulse = this.pulses[i];
			if (v > pulse.nextStepMS) {
				pulse.nextStepMS += pulse.duration;
//trace(`marquee (${v})- pulse[${i}] next step: ${pulse.step} - next in ${pulse.duration} ms - ${pulse.nextStepMS}\n`);

				let seg = pulse.seg;
				let colorIdx = pulse.step;
				j = 0;
				if (pulse.kind == 2) {		// marquee along lines
					for (let k = 0; k < seg.layout.lines.length; k++) {
						colorIdx = pulse.step;
						j = 0;
						while (j < seg.layout.lines[k].length) {
							let px = j;
							if (pulse.dir == -1)
								px = seg.layout.lines[k].length - j - 1;
							seg.setPixel(seg.layout.lines[k][px], pulse.colors[colorIdx], pulse.fade, pulse.duration);
							if (++colorIdx >= pulse.colors.length) colorIdx = 0;
							j++;
						}
					}
				}
				else {		// marquee along line
					while (j<seg.layout.line.length) {
						let px = j;
						if (pulse.dir == -1)
							px = seg.layout.line.length - j - 1;
						switch (pulse.kind) {
							case 1:
								seg.setPixel(seg.layout.line[px], pulse.colors[colorIdx], pulse.fade, pulse.duration);
								if (j == seg.layout.line.length) break;
							default:
								seg.setPixel(seg.layout.line[px], pulse.colors[colorIdx], pulse.fade, pulse.duration);
						}
						if (++colorIdx >= pulse.colors.length) colorIdx = 0;
						j++;
					}
				}
				if (++pulse.step >= pulse.colors.length) pulse.step = 0;
			}
		}
	}
}



//export default Object.freeze({
export default {
	TailSegment,
	TailActions,
	TailActionSequence,
	TailAction_pulse,
	TailAction_pulseLines,
	TailAction_pulseAll,
	TailAction_rainbow,
};


