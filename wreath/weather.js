import config from "mc/config";
import {Request} from "http";

const APPID = "9d759c76ce679d2eb222053eba8a5f9d";

export class Weather {
	#zip;
	#country;
	#unit;
	#units;
	#temp;

	constructor(dict) {
		this.#zip = dict?.zip ?? "95366";
		this.#country = dict?.country ?? "us";
		this.#unit = dict?.units ?? "F";
		this.#units = (this.#unit === "F") ? "imperial" : "metric";
		this.#temp = 33;
		this.#getTemp();
	}
	set zip(v) { this.#zip = v; }
	get zip() { return this.#zip; }
	get unit() { return this.#unit; }
	get temp() { this.#getTemp(); return this.#temp; }
	#getTemp() {
trace(`making request: /data/2.5/weather?zip=${this.#zip},${this.#country}&appid=${APPID}&units=${this.#units}\n`);
		let req = new Request({
			host: "api.openweathermap.org",
			path: `/data/2.5/weather?zip=${this.#zip},${this.#country}&appid=${APPID}&units=${this.#units}`,
			response: String
		});
		req.callback = (message, value) => {
			if (Request.responseComplete == message) {
				value = JSON.parse(value);
				this.#temp = value.main.temp;
			}
		}
		return this.#temp;
	}
}

Object.freeze(Weather.prototype);

export default Weather;
