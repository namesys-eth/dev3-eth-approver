import { privateKeyToAccount } from 'viem/accounts';
import { getAddress, isAddress } from 'viem';

export class Data {
	constructor(state) {
		this.state = state;
	}

	async add(paths) {
		let log = {
			githubid: paths[2],
			timestamp: Date.now(),
			live: null
		};
		await this.state.storage.put("DATA", log);
		return log;
	}

	async get() {
		return this.state.storage.get("DATA");
	}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url.toLowerCase());
		if (request.method == "OPTIONS") {
			return this.output("", 200);
		} else if (request.method == "GET") {
			if (url.pathname.startsWith('/verify')) {
				let paths = url.pathname.split("/");
				switch (paths.length) {
					case 3:
						return await this.generate(paths[2], env);
					default:
						break;
				}
			} else if (url.pathname.startsWith('/list')) {
				let dataHandler = new Data(env);
				let _list = await dataHandler.list();
				return this.output(_list, 200);
			} else if (url.pathname.startsWith('/index')) {
				let paths = url.pathname.split("/");
				switch (paths.length) {
					case 3:
						let dataHandler = new Data(env);
						return await dataHandler.add(paths);
					default:
						break;
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

	async generate(githubID, env) {
		try {
			const gateway = `https://${githubID}.github.io`;
			const result = await fetch(`${gateway}/verify.json`).then((res) => {
				if (res.status == 200)
					return res.json();
				else if (res.status == 404) {
					throw new Error(`${res.status} - ${gateway}/verify.json Not Found`);
				} else {
					throw new Error(`${res.status} - ${res.error}`);
				}
			});
			let addr = result.signer;
			if (!isAddress(result.signer)) {
				throw new Error(`${addr} is not a valid address`);
			}
			addr = getAddress(addr);
			const approver = privateKeyToAccount(env.PRIV_KEY);
			const payload = `Requesting Signature To Approve ENS Records Signer\n\nGateway: ${gateway}\nResolver: eip155:${env.CHAIN_ID}:${env.RESOLVER}\nApproved Signer: eip155:${env.CHAIN_ID}:${addr}`
			const approvedSig = await approver.signMessage({
				message: payload
			});
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
