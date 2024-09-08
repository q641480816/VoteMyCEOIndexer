const os = require('os');
const cluster = require('cluster');
const express = require('express');
const bodyParser = require('body-parser')
const { ethers } = require("ethers");
const votingContractABI = require('./abi/VotingCampaignContract.json').abi;
const { hsetAdd, hsetGet } = require('./redisClient');

const properties = require('./properties.json');

const numCPUs = Math.ceil(os.cpus().length / 2);
let provider, contract;

const test = async (contract, id) => {
    console.log(await contract.getCampaign(id));
}

const startListening = () => {
    provider = new ethers.WebSocketProvider("ws://127.0.0.1:8545");
    contract = new ethers.Contract(properties.votingContractAddress, votingContractABI, provider);

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
        } catch (e) {
            console.log(e)
        }
    });

    provider.on('error', (err) => {
        console.error('WebSocket error:', err);
        // Try to reconnect on error
        reconnect();
    });

}

const reconnect = () => {
    if (contract) { contract.removeAllListeners(); }
    if (provider) { provider.destroy(); }

    console.log('Reconnecting in 5 seconds...');
    setTimeout(startListening, 5000);
}

if (cluster.isPrimary) {

    for (let i = 0; i < numCPUs; i++) {
        const worker = cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        cluster.fork();
    });

    startListening();

} else {
    const app = express();
    const jsonParser = bodyParser.json();

    app.get('/test', async (req, res) => {
        const campaign = await hsetGet(properties.tables.campaignMap, 1);
        res.send(JSON.parse(campaign));
    });

    app.listen(properties.port, '127.0.0.1', () => {
        console.log(`Indexer started at: ${properties.port}`)
    });
}