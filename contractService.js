const { ethers } = require("ethers");
const votingContractABI = require('./abi/VotingCampaignContract.json').abi;
const tokenContractABI = require('./abi/VotingToken.json').abi;
const { hsetAdd, hgetAll, hsetGet } = require('./redisClient');
const properties = require('./properties.json');
const WebSocket = require('ws');

let wallet, wsProvider, contract, jsonProvider, tokenContract;

const getJsonProvider = () => {
    if (jsonProvider) return jsonProvider;
    jsonProvider = new ethers.JsonRpcProvider(`http${properties.ssl}://${properties.rpcURL}`);
    return jsonProvider;
}

const getWebSocket = () => {
    const ws = new WebSocket(`ws${properties.ssl}://${properties.rpcURL}`);

    ws.on("close", () => {
        console.log("Disconnected. Reconnecting...");
        setTimeout(() => {
            reconnect();
        }, 1000);
    });

    ws.on("error", (error) => {
        console.log("WebSocket error: ", error);
    });

    return ws;
}

const startListening = () => {
    console.log('Initating connection to RPC...')
    wsProvider = new ethers.WebSocketProvider(getWebSocket());
    contract = new ethers.Contract(properties.votingContractAddress, votingContractABI, wsProvider);
    jsonProvider = new ethers.JsonRpcProvider(`http${properties.ssl}://${properties.rpcURL}`)
    tokenContract = new ethers.Contract(properties.tokenContractAddress, tokenContractABI, wsProvider);

    // Listen for events
    contract.on("UploaderChange", (address, isAllowed) => {
        console.log(`${address} is set to${isAllowed}`);
    });

    contract.on("VoteCampaignChange", (campaignId, campaignName, metadata, options, results, isActive) => {
        try {
            const campaignString = JSON.stringify({
                campaignId: Number(campaignId),
                campaignName: campaignName,
                metadata: metadata,
                options: options,
                results: results.map(v => Number(v)),
                isActive: isActive
            })
            hsetAdd(properties.tables.campaignMap, campaignId, campaignString);
            console.log('New campaign: ' + campaignId)
        } catch (e) {
            console.log(e)
        }
    });

    tokenContract.on("FaucetToAddress", (address, timestamp, amount) => {
        try {
            let list = [];
            hgetAll(properties.tables.faucetHistory)
                .then(allTenHis => {
                    if (Object.keys(allTenHis).length > 0) {
                        JSON.parse(allTenHis.list)
                            .forEach(h => list.push(h));
                    }
                    list.push({
                        address: address,
                        timestamp: timestamp + '',
                        amount: ethers.formatUnits(amount),
                    })
                    list = list.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
                    if (list.length > 10) list = list.slice(0, 10);
                    hsetAdd(properties.tables.faucetHistory, 'list', JSON.stringify(list));
                })
                .catch(err => { throw err });
        } catch (e) {
            console.log(e)
        }
    })

    wsProvider.on('error', (err) => {
        console.error('WebSocket error:', err);
        // Try to reconnect on error
        reconnect();
    });
}

const reconnect = () => {
    if (contract) { contract.removeAllListeners(); }
    if (tokenContract) { contract.removeAllListeners(); }
    if (wsProvider) { wsProvider.destroy(); }

    console.log('Reconnecting in 1 seconds...');
    // setTimeout(startListening, 1000);
    startListening();
}

const syncCamping = async () => {
    try {
        const provider = getJsonProvider();
        const contract = new ethers.Contract(properties.votingContractAddress, votingContractABI, provider);
        const fromBlock = await hsetGet(properties.tables.campaignMap, 'lastCheckedBlock');
        const block = await provider.getBlockNumber();
        const campaignEvents = await contract.queryFilter('VoteCampaignChange',
            Number(fromBlock || properties.deployedBlock), block);
        const map = {};
        campaignEvents.forEach(c => {
            const id = Number(c.args[0]);
            if (!map[id] || map[id].index < c.index) {
                map[id] = c;
            }
        })
        const listToRedis = {};
        Object.values(map).map(c => {
            listToRedis[Number(c.args[0])] = JSON.stringify({
                campaignId: Number(c.args[0]),
                campaignName: c.args[1],
                metadata: c.args[2],
                options: c.args[3],
                results: c.args[4].map(v => Number(v)),
                isActive: c.args[5]
            });
        })
        await hsetAdd(properties.tables.campaignMap, listToRedis);
        await hsetAdd(properties.tables.campaignMap, 'lastCheckedBlock', block);
    } catch (err) {
        console.log(err);
        throw err;
    }

}

const faucet = async (address) => {
    try {
        const wallet = new ethers.Wallet(properties.privateKeys.faucet, getJsonProvider());
        const callContract = new ethers.Contract(properties.tokenContractAddress, tokenContractABI, wallet);
        const txRes = await callContract.faucet(address, ethers.parseUnits('10', 18));
        console.log('Transaction hash:', txRes.hash);
        const receipt = await txRes.wait();
        console.log('Transaction was mined in block', receipt.blockNumber);
        hgetAll(properties.tables.faucetHistory)
            .then(allTenHis => {
                let list = [];
                if (Object.keys(allTenHis).length > 0) {
                    JSON.parse(allTenHis.list)
                        .forEach(h => list.push(h));
                }
                list.push({
                    address: address,
                    timestamp: Date.now() + '',
                    amount: 10,
                })
                list = list.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
                if (list.length > 10) list = list.slice(0, 10);
                hsetAdd(properties.tables.faucetHistory, 'list', JSON.stringify(list));
            })
            .catch(err => { throw err });
    } catch (error) {
        if (error.code === 'CALL_EXCEPTION') {
            throw new Error(error.reason);
        } else {
            console.error('Error calling contract function:', error);
            throw error;
        }
    }
}

module.exports = { startListening, reconnect, faucet, syncCamping }