import { privateKeyToAccount } from 'viem/accounts';
import { getAddress, isAddress } from 'viem';

// Counter Class
export class Counter {
	constructor(state, env) {
		this.state = state;
	}
	async fetch(request) {
		const url = new URL(request.url.toLowerCase());
		let paths = url.pathname.split("/");
		let value = (await this.state.storage.get("value")) || 0;
		++value;
		await this.state.storage.put("value", value);
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
			let id = env.COUNTER.idFromName(githubID);
			let counter = env.COUNTER.get(id);
			let response = await counter.fetch(request);
			let index = await response.text();
			await env.DATA.put(githubID, JSON.stringify({
				state: true,
				index: index,
				timestamp: Date.now()
			}));
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