import { privateKeyToAccount } from 'viem/accounts';
import { getAddress, isAddress } from 'viem';

// Counter Class
export class Counter {
	constructor(state, env) {
		this.state = state;
	}
	async fetch(request) {
		let value = (await this.state.storage.get("value")) || 0;
		++value;
		await this.state.storage.put("value", value);
		return new Response(value);
	}
}

// Counter Class
export class Total {
	constructor(state, env) {
		this.state = state;
	}
	async fetch(request) {
		const url = new URL(request.url.toLowerCase());
		let value = (await this.state.storage.get("value")) || 0;
		if (url.pathname.startsWith('/verify')) {
			++value;
			await this.state.storage.put("value", value);
		}
		return new Response(value);
	}
}

// Main
export default {
	// Handle Input
	async fetch(request, env, ctx) {
		const url = new URL(request.url.toLowerCase());
		if (request.method == "OPTIONS") {
			return this.output("", 200);
		} else if (request.method == "GET") {
			if (url.pathname.startsWith('/verify')) {
				let paths = url.pathname.split("/");
				switch (paths.length) {
					case 3:
						return await this.generate(request, paths[2], env);
					default:
						break;
				}
			} else if (url.pathname.startsWith('/view')) {
				let paths = url.pathname.split("/");
				switch (paths.length) {
					case 3:
						return this.output({
							key: paths[2],
							value: JSON.parse(await env.DATA.get(paths[2])),
						}, 200);
					default:
						return this.output({
							key: paths[2],
							value: false,
						}, 200);
				}
			} else if (url.pathname.startsWith('/count')) {
				let paths = url.pathname.split("/");
				switch (paths.length) {
					case 2:
						let _local = env.TOTAL.idFromName('TOTAL');
						let _counter = env.TOTAL.get(_local);
						let _response = await _counter.fetch(request);
						let _value = await _response.text();
						return this.output({
							total: _value,
						}, 200);
					default:
						return this.output({
							total: null
						}, 200);
				}
			}
			return this.output({
				error: "Bad Request"
			}, 400);
		}
		return this.output({
			error: `Method ${request.method} not allowed`
		}, 405);
	},
	// Handle Output
	async output(data, status) {
		return new Response(JSON.stringify(data, null, 2), {
			status: status,
			headers: {
				"Allow": "GET, OPTIONS",
				"Access-Control-Allow-Methods": "GET, OPTIONS",
				"Access-Control-Allow-Origin": "*",
				"Content-Type": "application/json",
				"Cache-Control": "no-cache"
			}
		});
	},
	// Handle Signer Validation
	async generate(request, githubID, env) {
		try {
			const gateway = `https://${githubID}.github.io`;
			const result = await fetch(`${gateway}/verify.json`).then((res) => {
				if (res.status == 200)
					return res.json();
				else if (res.status == 404) {
					throw new Error(`${res.status}: ${gateway}/verify.json not found`);
				} else {
					throw new Error(`${res.status}: ${res.error}`);
				}
			});
			let addr = result.signer;
			if (!isAddress(result.signer)) {
				throw new Error(`${addr} is not a valid ethereum signer`);
			}
			addr = getAddress(addr);
			const approver = privateKeyToAccount(env.PRIV_KEY);
			const payload = `Requesting Signature To Approve ENS Records Signer\n\nGateway: ${gateway}\nResolver: eip155:${env.CHAIN_ID}:${env.RESOLVER}\nApproved Signer: eip155:${env.CHAIN_ID}:${addr}`
			const approvedSig = await approver.signMessage({
				message: payload
			});
			/// Indexer Functions
			let _local = env.COUNTER.idFromName(githubID);
			let _exists = env.COUNTER.get(_local);
			// Update TOTAL counter
			if (_exists === null) {
				let total_ = env.TOTAL.idFromName('TOTAL');
				let _total = env.TOTAL.get(total_);
				await _total.fetch(request);
			}
			let counter = env.COUNTER.get(_local);
			// Update COUNTER counter
			let response = await counter.fetch(request);
			let iteration = await response.text();
			var _value = JSON.parse(await env.DATA.get(githubID)) || []
			_value.push({
				state: true,
				iteration: iteration,
				timestamp: Date.now()
			})
			await env.DATA.put(githubID, JSON.stringify(_value));
			return this.output({
				gateway: `${githubID}.github.io`,
				payload: payload,
				approver: approver.address,
				approvedFor: addr,
				approvalSig: approvedSig
			}, 200);
		} catch (error) {
			return this.output({
				error: error.message
			}, 404);
		}
	}
};