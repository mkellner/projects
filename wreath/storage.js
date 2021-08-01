import config from "mc/config";
import {File, Iterator, Directory} from "file";
import {Request} from "http";

const defaultDevice = { name: "default",
		dev: [ { name: "star",   layout_id: "ZTR1", brightness: 60 },
			   { name: "lights", layout_id: "LINE", brightness: 60 } ] };
const defaultSequence = { name: "default",
		seq: [
{ when: 0, seg: 0, action: "PLSA", params: { color: "yellow" } },
{ when: 0, seg: 1, action: "PLSA", params: { color: "orange" } },
{ when: 2000, seg: 0, action: "PLSL", params: { kind: 3, color: "gold", dir: -1, repeat: 750 } },
{ when: 2000, seg: 1, action: "PLSL", params: { kind: 3, color: "gold", dir: -1, repeat: 750 } },
{ when: 5000, seg: 0, action: "RNBW" },
{ when: 5000, seg: 1, action: "RNBW" },
{ when: 10000, restart: 1 }
] };

Object.freeze(defaultDevice);
Object.freeze(defaultSequence);

export class someFiles {

	constructor(dict) {
		this.devices = [];
		this.sequences = [];
		this.webNames = { sequences: [] };
		this.host = dict.host;
		this.path = dict.path;
		this.owner = dict.owner;

		let file;
		let path;
		this.devices["default"] = defaultDevice;
		this.sequences["default"] = defaultSequence;

		File.delete(config.file.root + "seq_default");

		let iter = new Iterator(config.file.root);
		let item, name;
		while (item = iter.next()) {
//			trace(`Name: ${item.name}, Length: ${item.length}\n`);
			if (item.length) {
				let name = item.name.substr(4);
				switch (item.name.substr(0, 4)) {
					case "dev_":
						this.devices[name] = { name };
//			trace(`found device ${name}\n`);
						break;
					case "seq_":
						this.sequences[name] = { name };
//			trace(`found seq ${name}\n`);
						break;
				}
			}
		}

	}

	readDevice(name) {
//		if (undefined === this.devices[name])
//			return;

		if (this.devices[name]?.dev)
			return this.devices[name];

		try {
			let file = new File(config.file.root + "dev_" + name);
			this.devices[name] = JSON.parse(file.read(String));
			file.close();
			return this.devices[name];
		}
		catch (e) {
trace(`problems reading device ${name}\n`);
			return this.devices["default"];
		}
	}

	writeDevice(name, dev) {
		let path = config.file.root + "dev_" + name;
		if (File.exists(path))
			File.delete(path);
		this.devices[name] = dev;
		let file = new File(path, true);
		file.write(JSON.stringify(dev));
		file.close();
	}

	readSequence(name) {
		if (this.sequences[name]?.seq)
			return this.sequences[name];

		try {
			let file = new File(config.file.root + "seq_" + name);
			let data = file.read(String);
//trace(`read file ${name} - data: ${data}\n`);
			this.sequences[name] = JSON.parse(data);
			file.close();
			return this.sequences[name];
		}
		catch (e) {
trace(`problems reading sequence ${name}\n`);
			return this.sequences["default"];
		}
	}

	writeSequence(name, seq) {
		let path = config.file.root + "seq_" + name;
		if (File.exists(path))
			File.delete(path);
		this.sequences[name] = seq;
		let file = new File(config.file.root + "seq_" + name, true);
		file.write(JSON.stringify(seq));
		file.close();
	}

	readWebSeq(name, onFinished) {
		let request = new Request({host:this.host, path:`${this.path}sequences/${name}`, response:String});
trace(`readWebSeq from ${this.host} ${this.path}${name}\n`);
		request.owner = this.owner;
		request.onFinished = onFinished;
		request.callback = function(message, value, etc) {
			if (Request.responseComplete === message) {
trace(`readWebSeq gets ${value}\n`);
				try {
					let seqObj = JSON.parse(value);
					request.onFinished(seqObj);
					request.owner.fileMgr.writeSequence(seqObj.sequence.name, seqObj.sequence);
				}
				catch(e) {
trace(`file not found\n`);
				}
			}
		}
	}

	getFilenameList() {
		let ret = { dev: [], seq: [] };

		for (const item in this.devices)
			ret.dev.push(item);
		for (const item in this.sequences)
			ret.seq.push(item);

		return ret;
	}

	getWebnameList() {
		return this.webNames;
	}

	fetchWebnameList() {
		let request = new Request({host:this.host, path:this.path + "index", response:String});
//trace(`fetchWebnameList from ${this.host} ${this.path}index\n`);
		request.owner = this;
		request.callback = function(message, value, etc) {
			if (Request.responseComplete === message) {
//trace(`fetchWebnameList sets ${value}\n`);
				this.owner.webNames = JSON.parse(value);
			}
		}
	}
}

Object.freeze(someFiles.prototype);

